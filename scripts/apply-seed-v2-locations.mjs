#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

const ROMAN_MAP = {
  x: "10",
  ix: "9",
  viii: "8",
  vii: "7",
  vi: "6",
  v: "5",
  iv: "4",
  iii: "3",
  ii: "2",
  i: "1",
};

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]");
}

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/g, (match) => ROMAN_MAP[match] ?? match)
    .replace(/&/g, " and ")
    .replace(/['"`]/g, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(offshore|wind farm|windfarm|wind park|project|phase|extension|demonstration)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function signatureText(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

function parseSeedTextValue(raw) {
  return raw.replace(/''/g, "'");
}

function parseSeedV2Coordinates() {
  const text = fs.readFileSync(path.join(ROOT, "sql", "seed_v2.sql"), "utf8");
  const regex =
    /^\s*\('((?:[^']|'')+)',\s*'([A-Z]{2})'.*?ST_SetSRID\(ST_MakePoint\(\s*([-0-9.]+),\s*([-0-9.]+)\),4326\)::geography/gsm;
  const byName = new Map();
  const bySignature = new Map();

  for (const match of text.matchAll(regex)) {
    const name = parseSeedTextValue(match[1]);
    const countryCode = match[2];
    const row = {
      name,
      country_code: countryCode,
      lng: Number(match[3]),
      lat: Number(match[4]),
    };
    byName.set(`${countryCode}|${normalizeText(name)}`, row);
    bySignature.set(`${countryCode}|${signatureText(name)}`, row);
  }

  return { byName, bySignature };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const { byName, bySignature } = parseSeedV2Coordinates();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows } = await client.query(`
    SELECT id, name, country_code
    FROM wind_farms
    ORDER BY country_code, name
  `);

  const matches = [];
  for (const row of rows) {
    const exact = byName.get(`${row.country_code}|${normalizeText(row.name)}`);
    const fuzzy = bySignature.get(`${row.country_code}|${signatureText(row.name)}`);
    const match = exact ?? fuzzy;
    if (!match) continue;
    matches.push({
      id: row.id,
      name: row.name,
      country_code: row.country_code,
      lng: match.lng,
      lat: match.lat,
    });
  }

  const outPath = path.join(ROOT, "data", "windfarms", "seed_v2_locations.json");
  fs.writeFileSync(outPath, JSON.stringify(matches, null, 2));
  console.log(`Matched ${matches.length} farms to seed_v2 coordinates`);
  console.log(`Wrote ${outPath}`);

  await client.query("BEGIN");
  try {
    const batch = await client.query(
      `
      INSERT INTO ingest_batches (batch_name, source_name, source_file_name, row_count, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (batch_name) WHERE batch_name IS NOT NULL
      DO UPDATE SET row_count = EXCLUDED.row_count, imported_at = now(), notes = EXCLUDED.notes
      RETURNING id
      `,
      [
        "wind_farm_seed_v2_locations",
        "Curated seed_v2",
        "scripts/apply-seed-v2-locations.mjs",
        matches.length,
        "Restores curated offshore wind farm centroids from seed_v2.sql",
      ]
    );
    const batchId = batch.rows[0].id;

    for (const row of matches) {
      await client.query(
        `
        UPDATE wind_farms
        SET
          centroid = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          geometry_quality = 'approximated',
          ingest_batch_id = $4,
          external_ids = COALESCE(external_ids, '{}'::jsonb)
            || jsonb_build_object('location_source', 'seed_v2'),
          updated_at = now()
        WHERE id = $1
        `,
        [row.id, row.lng, row.lat, batchId]
      );
    }

    await client.query(`
      DELETE FROM turbines
      WHERE geometry_quality = 'generated'
        AND wind_farm_id IN (SELECT id FROM wind_farms WHERE ingest_batch_id = $1)
    `, [batchId]);

    await client.query(`
      UPDATE wind_farms
      SET project_area = NULL
      WHERE ingest_batch_id = $1
    `, [batchId]);

    await client.query(`
      INSERT INTO turbines (wind_farm_id, turbine_index, location, geometry_quality, ingest_batch_id)
      SELECT
        wf.id,
        gs.idx,
        ST_SetSRID(
          ST_MakePoint(
            ST_X(wf.centroid::geometry)
              + (gs.col_i - (gs.n_cols - 1.0) / 2.0)
                * 850.0 / (111320.0 * COS(RADIANS(ST_Y(wf.centroid::geometry)))),
            ST_Y(wf.centroid::geometry)
              + (gs.row_i - (gs.n_rows - 1.0) / 2.0)
                * 850.0 / 111320.0
          ),
          4326
        )::geography,
        'generated',
        $1
      FROM wind_farms wf
      CROSS JOIN LATERAL (
        SELECT
          n - 1 AS idx,
          ((n - 1) % GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::INT, 1)) AS col_i,
          ((n - 1) / GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::INT, 1)) AS row_i,
          GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::NUMERIC, 1.0) AS n_cols,
          GREATEST(CEIL(wf.turbine_count::NUMERIC /
                   GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC)), 1.0)), 1.0) AS n_rows
        FROM generate_series(1, wf.turbine_count) AS n
      ) gs
      WHERE wf.ingest_batch_id = $1
        AND wf.turbine_count BETWEEN 1 AND 180
        AND wf.centroid IS NOT NULL
      ON CONFLICT (wind_farm_id, turbine_index) WHERE turbine_index IS NOT NULL DO NOTHING
    `, [batchId]);

    await client.query(`
      UPDATE wind_farms
      SET
        project_area = ST_Buffer(
          centroid,
          GREATEST(SQRT(COALESCE(capacity_mw, 100)::NUMERIC) * 650.0, 1500.0)
        ),
        updated_at = now()
      WHERE ingest_batch_id = $1
        AND centroid IS NOT NULL
    `, [batchId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

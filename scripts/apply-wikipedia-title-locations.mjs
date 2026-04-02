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

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        headers: { "user-agent": "offshore-wind-intel-locations/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return res.text();
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

function parsePageLocation(html, title) {
  const coordMatch = html.match(/"wgCoordinates":\{"lat":\s*([-0-9.]+),\s*"lon":\s*([-0-9.]+)/);
  const wikidataMatch = html.match(/"wgWikibaseItemId":"(Q\d+)"/);
  if (!coordMatch) return null;
  return {
    wikipedia_title: title,
    wikidata_id: wikidataMatch?.[1] ?? null,
    lng: Number(coordMatch[2]),
    lat: Number(coordMatch[1]),
  };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows } = await client.query(`
    SELECT id, name, country_code, external_ids->>'wikipedia_title' AS wikipedia_title
    FROM wind_farms
    WHERE external_ids->>'wikipedia_title' IS NOT NULL
      AND external_ids->>'wikipedia_title' <> ''
    ORDER BY country_code, name
  `);

  const pageCache = new Map();
  const resolved = [];

  for (const [index, row] of rows.entries()) {
    const title = row.wikipedia_title;
    if (!pageCache.has(title)) {
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
      const html = await fetchText(url);
      pageCache.set(title, parsePageLocation(html, title));
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const location = pageCache.get(title);
    if (location) {
      resolved.push({
        id: row.id,
        name: row.name,
        country_code: row.country_code,
        ...location,
      });
    }

    if ((index + 1) % 25 === 0) {
      console.log(`Fetched ${index + 1}/${rows.length}`);
    }
  }

  const outPath = path.join(ROOT, "data", "windfarms", "title_locations.json");
  fs.writeFileSync(outPath, JSON.stringify(resolved, null, 2));
  console.log(`Resolved ${resolved.length}/${rows.length} titled rows`);
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
        "wind_farm_title_locations",
        "Wikipedia page HTML",
        "scripts/apply-wikipedia-title-locations.mjs",
        resolved.length,
        "Applies centroid coordinates for rows with explicit Wikipedia page titles",
      ]
    );
    const batchId = batch.rows[0].id;

    for (const row of resolved) {
      await client.query(
        `
        UPDATE wind_farms
        SET
          centroid = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          geometry_quality = 'approximated',
          ingest_batch_id = $4,
          external_ids = COALESCE(external_ids, '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object(
              'wikipedia_title', $5::text,
              'wikidata_id', $6::text,
              'location_source', 'wikipedia_page'
            )),
          updated_at = now()
        WHERE id = $1
        `,
        [row.id, row.lng, row.lat, batchId, row.wikipedia_title, row.wikidata_id]
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

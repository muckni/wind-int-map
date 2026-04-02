#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ROOT = process.cwd();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] == null) process.env[m[1]] = value;
  }
}

async function main() {
  const inputPath = process.argv[2] || path.join(ROOT, "data", "qa", "contractor-hq-validation-latest.json");
  if (!fs.existsSync(inputPath)) throw new Error(`Missing input: ${inputPath}`);

  loadEnv(path.join(ROOT, ".env.local"));
  loadEnv(path.join(ROOT, ".env"));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const toApply = rows.filter((r) =>
    r.lookup_status === "ok" &&
    Number.isFinite(Number(r.hq_lat)) &&
    Number.isFinite(Number(r.hq_lng)) &&
    Math.abs(Number(r.hq_lat)) <= 90 &&
    Math.abs(Number(r.hq_lng)) <= 180
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let applied = 0;
  try {
    await client.query("BEGIN");

    for (const r of toApply) {
      const city = r.hq_city ? String(r.hq_city).slice(0, 120) : null;
      const countryCode = r.map_country && String(r.map_country).length === 2
        ? String(r.map_country).toUpperCase()
        : null;

      await client.query(
        `
        INSERT INTO company_locations (company_id, location, location_type, city, country_code)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 'hq', $4, $5)
        ON CONFLICT (company_id, location_type)
        DO UPDATE SET
          location = EXCLUDED.location,
          city = COALESCE(EXCLUDED.city, company_locations.city),
          country_code = COALESCE(EXCLUDED.country_code, company_locations.country_code)
        `,
        [r.company_id, Number(r.hq_lng), Number(r.hq_lat), city, countryCode]
      );
      applied += 1;
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({ applied, source: inputPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

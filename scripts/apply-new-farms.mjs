#!/usr/bin/env node
/**
 * Import approved new farms from data/qa/new-farms-review.csv into wind_farms.
 * Only processes rows where classification = "new" or "approved".
 *
 * Usage: node scripts/apply-new-farms.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadEnv, QA_DIR } from "./_farm-ingest-utils.mjs";

loadEnv();

const DRY_RUN = process.argv.includes("--dry-run");

/* ── Parse CSV (no deps) ─────────────────────────────────────────────────────── */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { vals.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => (obj[h.trim()] = vals[i]?.trim() ?? ""));
    return obj;
  });
}

/* ── Allowed data_quality values (from DB CHECK constraint) ──────────────────── */
const ALLOWED_QUALITY = new Set(["verified", "unverified", "example"]);
const DESIRED_QUALITY = "partial";
const FALLBACK_QUALITY = "unverified";

async function main() {
  const csvPath = path.join(QA_DIR, "new-farms-review.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`No review CSV found at ${csvPath}. Run reconcile-farms.mjs first.`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const toImport = rows.filter((r) => r.classification === "new" || r.classification === "approved");
  console.log(`Found ${toImport.length} rows to import (of ${rows.length} total)`);

  if (toImport.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  // Determine quality value
  let qualityVal = DESIRED_QUALITY;
  if (!ALLOWED_QUALITY.has(DESIRED_QUALITY)) {
    console.warn(`⚠ data_quality='${DESIRED_QUALITY}' not allowed by DB CHECK constraint. Falling back to '${FALLBACK_QUALITY}'.`);
    qualityVal = FALLBACK_QUALITY;
  }

  if (DRY_RUN) {
    console.log("[DRY RUN] Would insert the following farms:");
    toImport.forEach((r) => console.log(`  ${r.country_code || "??"} | ${r.name} | ${r.capacity_mw || "?"} MW | ${r.status}`));
    return;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Register ingest batch
  const { rows: [batch] } = await client.query(
    `INSERT INTO ingest_batches (batch_name, source_name, row_count, notes)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`farm-expansion-${new Date().toISOString().slice(0, 10)}`, "osm+wikipedia", toImport.length, "Auto-import from ingest pipeline"]
  );

  let inserted = 0, skipped = 0;
  for (const r of toImport) {
    const cc = (r.country_code || "").toUpperCase().slice(0, 2);
    if (!cc) { console.warn(`  skip (no country_code): ${r.name}`); skipped++; continue; }

    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lng);
    const hasCentroid = !isNaN(lat) && !isNaN(lng);

    const capacity = r.capacity_mw ? parseFloat(r.capacity_mw) : null;
    const turbines = r.turbine_count ? parseInt(r.turbine_count, 10) : null;
    const commYear = r.commissioned_year ? parseInt(r.commissioned_year, 10) : null;
    const commDate = commYear ? `${commYear}-01-01` : null;

    try {
      if (hasCentroid) {
        await client.query(
          `INSERT INTO wind_farms (
             name, country_code, status_current, capacity_mw, turbine_count,
             centroid, geometry_quality, data_quality, commissioned_date,
             ingest_batch_id
           ) VALUES ($1, $2, $3, $4, $5,
             ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
             $8, $9, $10, $11
           ) ON CONFLICT (country_code, normalized_name) DO NOTHING`,
          [r.name, cc, r.status || "unknown", capacity, turbines,
           lng, lat, "generated", qualityVal, commDate, batch.id]
        );
      } else {
        await client.query(
          `INSERT INTO wind_farms (
             name, country_code, status_current, capacity_mw, turbine_count,
             data_quality, commissioned_date, ingest_batch_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (country_code, normalized_name) DO NOTHING`,
          [r.name, cc, r.status || "unknown", capacity, turbines,
           qualityVal, commDate, batch.id]
        );
      }
      inserted++;
    } catch (err) {
      console.warn(`  skip (DB error): ${r.name} → ${err.message}`);
      skipped++;
    }
  }

  await client.end();
  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

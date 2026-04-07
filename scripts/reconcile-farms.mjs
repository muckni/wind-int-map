#!/usr/bin/env node
/**
 * Reconcile OSM + Wikipedia ingest against the live wind_farms table.
 * Produces data/qa/new-farms-review.csv
 *
 * Classification:
 *   match    – matched an existing DB row (Levenshtein ≤ 3 OR distance < 5 km)
 *   new      – no match found → candidate for import
 *   ambiguous – partial match, needs human review
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  loadEnv, INGEST_DIR, QA_DIR, normaliseName, levenshtein, haversineKm,
} from "./_farm-ingest-utils.mjs";

loadEnv();

const LEV_EXACT = 3;   // ≤ 3 → match
const LEV_AMBIG = 6;   // ≤ 6 → ambiguous
const DIST_MATCH = 5;  // km

function escapeCsv(v) {
  if (v == null) return "";
  const s = String(v);
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  /* ── Load ingest files ─────────────────────────────────────────────────────── */
  const osmPath = path.join(INGEST_DIR, "osm-farms.json");
  const wikiPath = path.join(INGEST_DIR, "wiki-farms.json");

  let osmFarms = [];
  let wikiFarms = [];
  if (fs.existsSync(osmPath)) osmFarms = JSON.parse(fs.readFileSync(osmPath, "utf8"));
  if (fs.existsSync(wikiPath)) wikiFarms = JSON.parse(fs.readFileSync(wikiPath, "utf8"));

  const candidates = [...osmFarms, ...wikiFarms];
  console.log(`Loaded ${osmFarms.length} OSM + ${wikiFarms.length} Wikipedia = ${candidates.length} candidates`);

  /* ── Load existing DB farms ────────────────────────────────────────────────── */
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows: dbFarms } = await client.query(
    `SELECT id, name, country_code, capacity_mw,
            ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lng
     FROM wind_farms`
  );
  await client.end();
  console.log(`Loaded ${dbFarms.length} existing farms from DB`);

  // Pre-compute normalised names for DB farms
  const dbNorm = dbFarms.map((f) => ({ ...f, norm: normaliseName(f.name) }));

  /* ── Reconcile each candidate ──────────────────────────────────────────────── */
  const results = [];

  for (const c of candidates) {
    const cNorm = normaliseName(c.name);
    let bestLev = Infinity;
    let bestDist = Infinity;
    let bestMatch = null;

    for (const db of dbNorm) {
      const lev = levenshtein(cNorm, db.norm);
      let dist = Infinity;
      if (c.lat != null && c.lng != null && db.lat != null && db.lng != null) {
        dist = haversineKm(c.lat, c.lng, db.lat, db.lng);
      }

      // Best by name similarity
      if (lev < bestLev || (lev === bestLev && dist < bestDist)) {
        bestLev = lev;
        bestDist = dist;
        bestMatch = db;
      }
      // Best by proximity (override if much closer)
      if (dist < bestDist && dist < DIST_MATCH) {
        bestDist = dist;
        bestLev = lev;
        bestMatch = db;
      }
    }

    let classification;
    if (bestLev <= LEV_EXACT || bestDist < DIST_MATCH) {
      classification = "match";
    } else if (bestLev <= LEV_AMBIG) {
      classification = "ambiguous";
    } else {
      classification = "new";
    }

    results.push({
      source: c.source,
      name: c.name,
      matched_db_name: bestMatch?.name || "",
      matched_db_id: bestMatch?.id || "",
      distance_km: bestDist === Infinity ? "" : bestDist.toFixed(1),
      levenshtein: bestLev === Infinity ? "" : bestLev,
      classification,
      lat: c.lat ?? "",
      lng: c.lng ?? "",
      capacity_mw: c.capacity_mw ?? "",
      status: c.status ?? "",
      country_code: c.country_code ?? "",
      commissioned_year: c.commissioned_year ?? "",
    });
  }

  /* ── Write CSV ─────────────────────────────────────────────────────────────── */
  fs.mkdirSync(QA_DIR, { recursive: true });
  const csvPath = path.join(QA_DIR, "new-farms-review.csv");
  const header = "source,name,matched_db_name,matched_db_id,distance_km,levenshtein,classification,lat,lng,capacity_mw,status,country_code,commissioned_year";
  const lines = [header, ...results.map((r) =>
    [r.source, r.name, r.matched_db_name, r.matched_db_id, r.distance_km, r.levenshtein, r.classification, r.lat, r.lng, r.capacity_mw, r.status, r.country_code, r.commissioned_year]
      .map(escapeCsv).join(",")
  )];
  fs.writeFileSync(csvPath, lines.join("\n") + "\n");

  const counts = { match: 0, ambiguous: 0, new: 0 };
  results.forEach((r) => counts[r.classification]++);
  console.log(`\nReconciliation complete → ${csvPath}`);
  console.log(`  match: ${counts.match}  |  ambiguous: ${counts.ambiguous}  |  new: ${counts.new}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

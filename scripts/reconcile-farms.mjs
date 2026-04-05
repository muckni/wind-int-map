#!/usr/bin/env node
/**
 * Reconcile OSM + Wikipedia + Wikidata ingest against the live wind_farms table.
 * Produces data/qa/new-farms-review.csv
 *
 * Classification:
 *   match        – matched an existing DB row (Levenshtein ≤ 3 OR distance < 5 km OR same wikidata ID)
 *   match+enrich – match, but candidate has data the DB row is missing
 *   new          – no match found → candidate for import
 *   ambiguous    – partial match (Levenshtein ≤ 4 AND distance > 5 km), needs human review
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  loadEnv, INGEST_DIR, QA_DIR, normaliseName, levenshtein, haversineKm, decodeHtmlEntities,
} from "./_farm-ingest-utils.mjs";

loadEnv();

const LEV_EXACT = 3;   // ≤ 3 → match
const LEV_AMBIG = 4;   // ≤ 4 → ambiguous (tightened from 6)
const DIST_MATCH = 5;  // km

function escapeCsv(v) {
  if (v == null) return "";
  const s = String(v);
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Deduplicate across sources, preferring Wikidata → Wikipedia → OSM */
function deduplicateAcrossSources(osm, wiki, wikidata) {
  const byName = new Map(); // normalisedName → best candidate

  // Process in priority order: wikidata first (richest), then wiki, then osm
  const allCandidates = [
    ...wikidata.map((f) => ({ ...f, _priority: 1 })),
    ...wiki.map((f) => ({ ...f, _priority: 2 })),
    ...osm.map((f) => ({ ...f, _priority: 3 })),
  ];

  for (const c of allCandidates) {
    const norm = normaliseName(c.name);
    if (!norm) continue;

    const existing = byName.get(norm);
    if (!existing) {
      byName.set(norm, c);
    } else {
      // Merge: keep existing (higher priority) but fill missing fields
      if (!existing.lat && c.lat) { existing.lat = c.lat; existing.lng = c.lng; }
      if (!existing.capacity_mw && c.capacity_mw) existing.capacity_mw = c.capacity_mw;
      if (!existing.country_code && c.country_code) existing.country_code = c.country_code;
      if (!existing.commissioned_year && c.commissioned_year) existing.commissioned_year = c.commissioned_year;
      if (!existing.turbine_count && c.turbine_count) existing.turbine_count = c.turbine_count;
      if (!existing.wikidata_id && c.wikidata_id) existing.wikidata_id = c.wikidata_id;
      if (!existing.wikidata && c.wikidata) existing.wikidata = c.wikidata;
    }
  }

  return [...byName.values()];
}

async function main() {
  /* ── Load ingest files ─────────────────────────────────────────────────────── */
  const osmPath = path.join(INGEST_DIR, "osm-farms.json");
  const wikiPath = path.join(INGEST_DIR, "wiki-farms.json");
  const wdPath = path.join(INGEST_DIR, "wikidata-farms.json");

  let osmFarms = [];
  let wikiFarms = [];
  let wdFarms = [];
  if (fs.existsSync(osmPath)) osmFarms = JSON.parse(fs.readFileSync(osmPath, "utf8"));
  if (fs.existsSync(wikiPath)) wikiFarms = JSON.parse(fs.readFileSync(wikiPath, "utf8"));
  if (fs.existsSync(wdPath)) wdFarms = JSON.parse(fs.readFileSync(wdPath, "utf8"));

  console.log(`Loaded: ${osmFarms.length} OSM + ${wikiFarms.length} Wikipedia + ${wdFarms.length} Wikidata`);

  const candidates = deduplicateAcrossSources(osmFarms, wikiFarms, wdFarms);
  console.log(`After cross-source dedup: ${candidates.length} unique candidates`);

  /* ── Load existing DB farms ────────────────────────────────────────────────── */
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows: dbFarms } = await client.query(
    `SELECT id, name, country_code, capacity_mw, commissioned_date,
            external_ids,
            ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lng
     FROM wind_farms`
  );
  await client.end();
  console.log(`Loaded ${dbFarms.length} existing farms from DB`);

  // Pre-compute normalised names and wikidata IDs for DB farms
  const dbNorm = dbFarms.map((f) => ({
    ...f,
    norm: normaliseName(f.name),
    wd_id: f.external_ids?.wikidata || null,
  }));

  // Build wikidata ID → DB farm index
  const dbByWd = new Map();
  for (const db of dbNorm) {
    if (db.wd_id) dbByWd.set(db.wd_id, db);
  }

  /* ── Reconcile each candidate ──────────────────────────────────────────────── */
  const results = [];

  for (const c of candidates) {
    // Clean name
    c.name = decodeHtmlEntities(c.name);
    const cNorm = normaliseName(c.name);
    const cWd = c.wikidata_id || c.wikidata || null;

    // 1. Check Wikidata ID exact match first
    if (cWd && dbByWd.has(cWd)) {
      const db = dbByWd.get(cWd);
      const canEnrich = (!db.capacity_mw && c.capacity_mw) ||
                        (!db.lat && c.lat) ||
                        (!db.commissioned_date && c.commissioned_year) ||
                        (c.operators?.length > 0 || c.owners?.length > 0 || c.developers?.length > 0);
      results.push({
        source: c.source,
        name: c.name,
        matched_db_name: db.name,
        matched_db_id: db.id,
        distance_km: "",
        levenshtein: 0,
        classification: canEnrich ? "match+enrich" : "match",
        lat: c.lat ?? "",
        lng: c.lng ?? "",
        capacity_mw: c.capacity_mw ?? "",
        status: c.status ?? "",
        country_code: c.country_code ?? db.country_code ?? "",
        commissioned_year: c.commissioned_year ?? "",
        wikidata_id: cWd || "",
        operators: JSON.stringify(c.operators || []),
        owners: JSON.stringify(c.owners || []),
        developers: JSON.stringify(c.developers || []),
      });
      continue;
    }

    // 2. Name + proximity matching
    let bestLev = Infinity;
    let bestDist = Infinity;
    let bestMatch = null;

    for (const db of dbNorm) {
      const lev = levenshtein(cNorm, db.norm);
      let dist = Infinity;
      if (c.lat != null && c.lng != null && db.lat != null && db.lng != null) {
        dist = haversineKm(c.lat, c.lng, db.lat, db.lng);
      }

      if (lev < bestLev || (lev === bestLev && dist < bestDist)) {
        bestLev = lev;
        bestDist = dist;
        bestMatch = db;
      }
      if (dist < bestDist && dist < DIST_MATCH) {
        bestDist = dist;
        bestLev = lev;
        bestMatch = db;
      }
    }

    let classification;
    if (bestLev <= LEV_EXACT || bestDist < DIST_MATCH) {
      const canEnrich = bestMatch && (
        (!bestMatch.capacity_mw && c.capacity_mw) ||
        (!bestMatch.lat && c.lat) ||
        (!bestMatch.commissioned_date && c.commissioned_year) ||
        (c.operators?.length > 0 || c.owners?.length > 0 || c.developers?.length > 0)
      );
      classification = canEnrich ? "match+enrich" : "match";
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
      wikidata_id: cWd || "",
      operators: JSON.stringify(c.operators || []),
      owners: JSON.stringify(c.owners || []),
      developers: JSON.stringify(c.developers || []),
    });
  }

  /* ── Write CSV ─────────────────────────────────────────────────────────────── */
  fs.mkdirSync(QA_DIR, { recursive: true });
  const csvPath = path.join(QA_DIR, "new-farms-review.csv");
  const header = "source,name,matched_db_name,matched_db_id,distance_km,levenshtein,classification,lat,lng,capacity_mw,status,country_code,commissioned_year,wikidata_id,operators,owners,developers";
  const lines = [header, ...results.map((r) =>
    [r.source, r.name, r.matched_db_name, r.matched_db_id, r.distance_km, r.levenshtein,
     r.classification, r.lat, r.lng, r.capacity_mw, r.status, r.country_code,
     r.commissioned_year, r.wikidata_id, r.operators, r.owners, r.developers]
      .map(escapeCsv).join(",")
  )];
  fs.writeFileSync(csvPath, lines.join("\n") + "\n");

  const counts = {};
  results.forEach((r) => { counts[r.classification] = (counts[r.classification] || 0) + 1; });
  console.log(`\nReconciliation complete → ${csvPath}`);
  for (const [k, v] of Object.entries(counts).sort()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`  total: ${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

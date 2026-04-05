#!/usr/bin/env node
/**
 * Import approved new farms + enrich existing farms from data/qa/new-farms-review.csv.
 * Also imports company entities and ownership links from Wikidata data.
 *
 * Usage:
 *   node scripts/apply-new-farms.mjs              # dry-run (default)
 *   node scripts/apply-new-farms.mjs --apply       # actually write to DB
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  loadEnv, QA_DIR, INGEST_DIR, readCsv, decodeHtmlEntities, guessCountryFromCoords,
} from "./_farm-ingest-utils.mjs";

loadEnv();

const DRY_RUN = !process.argv.includes("--apply");

const QUALITY_VAL = "unverified"; // safe value per CHECK constraint

async function main() {
  const csvPath = path.join(QA_DIR, "new-farms-review.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`No review CSV found at ${csvPath}. Run reconcile-farms.mjs first.`);
    process.exit(1);
  }
  const rows = readCsv(csvPath);

  const toInsert = rows.filter((r) => r.classification === "new" || r.classification === "approved");
  const toEnrich = rows.filter((r) => r.classification === "match+enrich");
  console.log(`Review CSV: ${rows.length} total | ${toInsert.length} to insert | ${toEnrich.length} to enrich`);

  // Load Wikidata companies
  const wdCompPath = path.join(INGEST_DIR, "wikidata-companies.json");
  let wdCompanies = [];
  if (fs.existsSync(wdCompPath)) {
    wdCompanies = JSON.parse(fs.readFileSync(wdCompPath, "utf8"));
  }
  console.log(`Loaded ${wdCompanies.length} Wikidata company entities`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would insert these farms:");
    let noCC = 0;
    for (const r of toInsert) {
      let cc = r.country_code?.toUpperCase()?.slice(0, 2);
      if (!cc) cc = guessCountryFromCoords(parseFloat(r.lat), parseFloat(r.lng));
      if (!cc) { noCC++; continue; }
      console.log(`  ${cc} | ${decodeHtmlEntities(r.name)} | ${r.capacity_mw || "?"} MW | ${r.status}`);
    }
    if (noCC) console.log(`  (${noCC} skipped — no country_code even after coord lookup)`);

    console.log(`\n[DRY RUN] Would enrich ${toEnrich.length} existing farms`);
    for (const r of toEnrich.slice(0, 10)) {
      console.log(`  ${r.matched_db_name} ← capacity:${r.capacity_mw || "–"} coords:${r.lat ? "yes" : "no"} year:${r.commissioned_year || "–"}`);
    }
    if (toEnrich.length > 10) console.log(`  ... and ${toEnrich.length - 10} more`);

    console.log(`\n[DRY RUN] Would create/update ${wdCompanies.length} company entities`);
    console.log(`\nRun with --apply to write to DB.`);
    return;
  }

  /* ── Connect to DB ──────────────────────────────────────────────────────── */
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: [batch] } = await client.query(
    `INSERT INTO ingest_batches (batch_name, source_name, row_count, notes)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`farm-expansion-${new Date().toISOString().replace(/[:.]/g, "-")}`, "osm+wikipedia+wikidata",
     toInsert.length + toEnrich.length, "Pipeline v2 import"]
  );

  const stats = {
    inserted: 0, enriched: 0, skipped: 0,
    companies_created: 0, companies_existing: 0,
    ownership_links: 0,
  };

  /* ── 1. Insert new farms ───────────────────────────────────────────────── */
  for (const r of toInsert) {
    const name = decodeHtmlEntities(r.name);
    let cc = (r.country_code || "").toUpperCase().slice(0, 2);
    if (!cc) cc = guessCountryFromCoords(parseFloat(r.lat), parseFloat(r.lng));
    if (!cc) { stats.skipped++; continue; }

    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lng);
    const hasCentroid = !isNaN(lat) && !isNaN(lng);
    const capacity = r.capacity_mw ? parseFloat(r.capacity_mw) : null;
    const turbines = r.turbine_count ? parseInt(r.turbine_count, 10) : null;
    const commYear = r.commissioned_year ? parseInt(r.commissioned_year, 10) : null;
    const commDate = commYear ? `${commYear}-01-01` : null;
    const wdId = r.wikidata_id || null;
    const externalIds = wdId ? JSON.stringify({ wikidata: wdId }) : "{}";

    try {
      let farmId;
      if (hasCentroid) {
        const res = await client.query(
          `INSERT INTO wind_farms (
             name, country_code, status_current, capacity_mw, turbine_count,
             centroid, geometry_quality, data_quality, commissioned_date,
             external_ids, ingest_batch_id
           ) VALUES ($1, $2, $3, $4, $5,
             ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
             $8, $9, $10, $11::jsonb, $12
           ) ON CONFLICT (country_code, normalized_name) DO NOTHING
           RETURNING id`,
          [name, cc, r.status || "unknown", capacity, turbines,
           lng, lat, "generated", QUALITY_VAL, commDate, externalIds, batch.id]
        );
        farmId = res.rows[0]?.id;
      } else {
        const res = await client.query(
          `INSERT INTO wind_farms (
             name, country_code, status_current, capacity_mw, turbine_count,
             data_quality, commissioned_date, external_ids, ingest_batch_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           ON CONFLICT (country_code, normalized_name) DO NOTHING
           RETURNING id`,
          [name, cc, r.status || "unknown", capacity, turbines,
           QUALITY_VAL, commDate, externalIds, batch.id]
        );
        farmId = res.rows[0]?.id;
      }

      if (farmId) {
        stats.inserted++;
        // Create ownership links from CSV metadata columns
        await createOwnershipLinks(client, farmId, r, stats);
      } else {
        stats.skipped++; // ON CONFLICT hit
      }
    } catch (err) {
      console.warn(`  skip (DB error): ${name} → ${err.message}`);
      stats.skipped++;
    }
  }

  /* ── 2. Enrich existing farms ──────────────────────────────────────────── */
  for (const r of toEnrich) {
    const dbId = r.matched_db_id;
    if (!dbId) continue;

    const updates = [];
    const params = [];
    let pi = 1;

    if (r.capacity_mw) {
      updates.push(`capacity_mw = COALESCE(capacity_mw, $${pi})`);
      params.push(parseFloat(r.capacity_mw));
      pi++;
    }
    if (r.lat && r.lng) {
      updates.push(`centroid = COALESCE(centroid, ST_SetSRID(ST_MakePoint($${pi}, $${pi + 1}), 4326)::geography)`);
      params.push(parseFloat(r.lng), parseFloat(r.lat));
      pi += 2;
      updates.push(`geometry_quality = COALESCE(geometry_quality, 'generated')`);
    }
    if (r.commissioned_year) {
      const commDate = `${parseInt(r.commissioned_year, 10)}-01-01`;
      updates.push(`commissioned_date = COALESCE(commissioned_date, $${pi}::date)`);
      params.push(commDate);
      pi++;
    }
    if (r.wikidata_id) {
      updates.push(`external_ids = external_ids || $${pi}::jsonb`);
      params.push(JSON.stringify({ wikidata: r.wikidata_id }));
      pi++;
    }

    if (updates.length > 0) {
      params.push(dbId);
      try {
        await client.query(
          `UPDATE wind_farms SET ${updates.join(", ")}, updated_at = now()
           WHERE id = $${pi}`,
          params
        );
        stats.enriched++;
      } catch (err) {
        console.warn(`  enrich error: ${r.matched_db_name} → ${err.message}`);
      }
    }

    // Create ownership links for enriched farms too
    await createOwnershipLinks(client, dbId, r, stats);
  }

  /* ── 3. Import Wikidata company entities ───────────────────────────────── */
  for (const comp of wdCompanies) {
    const actorType = inferActorType(comp.roles);
    try {
      const res = await client.query(
        `INSERT INTO companies (name, actor_type, website)
         VALUES ($1, $2, $3)
         ON CONFLICT (normalized_name) DO NOTHING
         RETURNING id`,
        [comp.name, actorType, `https://www.wikidata.org/wiki/${comp.wikidata_id}`]
      );
      if (res.rows[0]) {
        stats.companies_created++;
      } else {
        stats.companies_existing++;
      }
    } catch (err) {
      // Might fail on actor_type constraint — try with 'other'
      try {
        await client.query(
          `INSERT INTO companies (name, actor_type, website)
           VALUES ($1, 'other', $2)
           ON CONFLICT (normalized_name) DO NOTHING`,
          [comp.name, `https://www.wikidata.org/wiki/${comp.wikidata_id}`]
        );
        stats.companies_created++;
      } catch { stats.companies_existing++; }
    }
  }

  await client.end();

  console.log(`\n✓ Done.`);
  console.log(`  Farms inserted:  ${stats.inserted}`);
  console.log(`  Farms enriched:  ${stats.enriched}`);
  console.log(`  Farms skipped:   ${stats.skipped}`);
  console.log(`  Companies created: ${stats.companies_created} (${stats.companies_existing} already existed)`);
  console.log(`  Ownership links:   ${stats.ownership_links}`);
}

/* ── Helper: create ownership links from CSV operator/owner/developer JSON ── */
async function createOwnershipLinks(client, farmId, row, stats) {
  for (const [col, roleType] of [["operators", "operator"], ["owners", "owner"], ["developers", "developer"]]) {
    let entities = [];
    try { entities = JSON.parse(row[col] || "[]"); } catch { continue; }
    if (!Array.isArray(entities) || entities.length === 0) continue;

    for (const entity of entities) {
      const compName = entity.name;
      if (!compName) continue;

      // Find or skip company by normalized name
      try {
        const { rows } = await client.query(
          `SELECT id FROM companies WHERE normalized_name = lower(regexp_replace($1, '\\s+', ' ', 'g'))`,
          [compName]
        );
        let companyId = rows[0]?.id;
        if (!companyId) {
          // Create the company
          const actorType = roleType === "operator" ? "other" : roleType === "developer" ? "developer" : "owner";
          const ins = await client.query(
            `INSERT INTO companies (name, actor_type)
             VALUES ($1, $2)
             ON CONFLICT (normalized_name) DO NOTHING
             RETURNING id`,
            [compName, actorType]
          );
          companyId = ins.rows[0]?.id;
          if (!companyId) {
            const re = await client.query(
              `SELECT id FROM companies WHERE normalized_name = lower(regexp_replace($1, '\\s+', ' ', 'g'))`,
              [compName]
            );
            companyId = re.rows[0]?.id;
          }
          if (companyId) stats.companies_created++;
        }
        if (!companyId) continue;

        // Check if link already exists before inserting
        const existing = await client.query(
          `SELECT id FROM wind_farm_ownership WHERE wind_farm_id = $1 AND company_id = $2 AND role_type = $3`,
          [farmId, companyId, roleType]
        );
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO wind_farm_ownership (wind_farm_id, company_id, role_type, confidence, data_quality)
             VALUES ($1, $2, $3, 'assumed', 'unverified')`,
            [farmId, companyId, roleType]
          );
          stats.ownership_links++;
        }
      } catch (err) {
        console.warn(`    ownership link error for "${compName}": ${err.message}`);
      }
    }
  }
}

function inferActorType(roles) {
  if (!roles || roles.length === 0) return "other";
  if (roles.includes("developer")) return "developer";
  if (roles.includes("owner")) return "owner";
  if (roles.includes("operator")) return "other"; // no 'operator' in actor_type enum
  return "other";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Enrich existing wind farms with metadata from Wikidata entities.
 * For farms with a wikidata ID in external_ids, fetch full entity and update
 * turbine_oem, turbine_model, foundation_type, distance_shore_km.
 * For farms matched by name, store the wikidata ID for future use.
 *
 * Usage: node scripts/enrich-farm-metadata.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadEnv, QA_DIR, INGEST_DIR } from "./_farm-ingest-utils.mjs";

loadEnv();

const DRY_RUN = !process.argv.includes("--apply");
const RATE_LIMIT_MS = 200;

/** Fetch a Wikidata entity's claims. */
async function fetchEntityClaims(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|labels&languages=en&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.entities?.[qid] || null;
}

/** Get the English label for a Wikidata entity ID. */
async function fetchLabel(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) return qid;
  const json = await resp.json();
  return json.entities?.[qid]?.labels?.en?.value || qid;
}

/** Extract a string claim value. */
function getClaimStr(entity, prop) {
  const claim = entity.claims?.[prop]?.[0];
  if (!claim) return null;
  const val = claim.mainsnak?.datavalue?.value;
  if (typeof val === "string") return val;
  if (val?.id) return val.id; // entity reference
  return null;
}

/** Extract a quantity claim value. */
function getClaimQuantity(entity, prop) {
  const claim = entity.claims?.[prop]?.[0];
  if (!claim) return null;
  const val = claim.mainsnak?.datavalue?.value?.amount;
  if (val) return parseFloat(val);
  return null;
}

async function main() {
  console.log("Enriching wind farm metadata from Wikidata…");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Get all farms with a wikidata ID
  const { rows: farms } = await client.query(
    `SELECT id, name, external_ids, turbine_oem, turbine_model,
            foundation_type, distance_shore_km, water_depth_m
     FROM wind_farms
     WHERE external_ids IS NOT NULL AND external_ids != '{}'::jsonb`
  );

  // Also load the reconciliation CSV to find wikidata IDs for matched farms
  const wdFarmsPath = path.join(INGEST_DIR, "wikidata-farms.json");
  let wdFarms = [];
  if (fs.existsSync(wdFarmsPath)) {
    wdFarms = JSON.parse(fs.readFileSync(wdFarmsPath, "utf8"));
  }

  // Build lookup: farm name (normalized) → wikidata_id from ingest
  const wdByName = new Map();
  for (const wf of wdFarms) {
    const norm = wf.name.toLowerCase().replace(/\s+/g, " ").trim();
    wdByName.set(norm, wf.wikidata_id);
  }

  // Also get farms without wikidata ID to try matching
  const { rows: farmsNoWd } = await client.query(
    `SELECT id, name, external_ids, turbine_oem, turbine_model,
            foundation_type, distance_shore_km, water_depth_m
     FROM wind_farms
     WHERE external_ids IS NULL OR external_ids = '{}'::jsonb`
  );

  // Try to assign wikidata IDs to farms without one
  const assignCandidates = [];
  for (const f of farmsNoWd) {
    const norm = f.name.toLowerCase().replace(/\s+/g, " ").trim();
    const wdId = wdByName.get(norm);
    if (wdId) {
      assignCandidates.push({ ...f, external_ids: { wikidata: wdId } });
    }
  }

  const allToProcess = [
    ...farms.filter((f) => f.external_ids?.wikidata),
    ...assignCandidates,
  ];

  console.log(`  ${farms.length} farms with wikidata ID in DB`);
  console.log(`  ${assignCandidates.length} farms matched to wikidata by name`);
  console.log(`  ${allToProcess.length} total to process`);

  const report = {
    processed: 0,
    enriched: 0,
    wikidata_ids_assigned: 0,
    fields_updated: { turbine_oem: 0, water_depth_m: 0, distance_shore_km: 0 },
    errors: [],
  };

  for (const farm of allToProcess) {
    const wdId = farm.external_ids?.wikidata;
    if (!wdId) continue;

    try {
      const entity = await fetchEntityClaims(wdId);
      if (!entity) { report.errors.push({ farm: farm.name, error: "entity not found" }); continue; }

      const updates = [];
      const params = [];
      let pi = 1;

      // P176 = manufacturer (turbine OEM)
      if (!farm.turbine_oem) {
        const mfgId = getClaimStr(entity, "P176");
        if (mfgId && mfgId.startsWith("Q")) {
          const label = await fetchLabel(mfgId);
          await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
          if (label && label !== mfgId) {
            updates.push(`turbine_oem = $${pi}`);
            params.push(label);
            pi++;
            report.fields_updated.turbine_oem++;
          }
        }
      }

      // P4511 = water depth
      if (!farm.water_depth_m) {
        const depth = getClaimQuantity(entity, "P4511");
        if (depth) {
          updates.push(`water_depth_m = $${pi}`);
          params.push(depth);
          pi++;
          report.fields_updated.water_depth_m++;
        }
      }

      // P2043 = length (sometimes used for distance to shore)
      if (!farm.distance_shore_km) {
        const dist = getClaimQuantity(entity, "P2043");
        if (dist && dist > 0 && dist < 500) { // sanity check
          updates.push(`distance_shore_km = $${pi}`);
          params.push(dist);
          pi++;
          report.fields_updated.distance_shore_km++;
        }
      }

      // Store wikidata ID if not present
      if (!farm.external_ids?.wikidata || Object.keys(farm.external_ids).length === 0) {
        updates.push(`external_ids = COALESCE(external_ids, '{}'::jsonb) || $${pi}::jsonb`);
        params.push(JSON.stringify({ wikidata: wdId }));
        pi++;
        report.wikidata_ids_assigned++;
      }

      if (updates.length > 0 && !DRY_RUN) {
        params.push(farm.id);
        await client.query(
          `UPDATE wind_farms SET ${updates.join(", ")}, updated_at = now() WHERE id = $${pi}`,
          params
        );
        report.enriched++;
      } else if (updates.length > 0) {
        report.enriched++;
      }

      report.processed++;
    } catch (err) {
      report.errors.push({ farm: farm.name, error: err.message });
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  await client.end();

  // Write report
  fs.mkdirSync(QA_DIR, { recursive: true });
  const reportPath = path.join(QA_DIR, "enrichment-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Enrichment complete → ${reportPath}`);
  console.log(`  Processed: ${report.processed}`);
  console.log(`  Enriched:  ${report.enriched}`);
  console.log(`  Wikidata IDs assigned: ${report.wikidata_ids_assigned}`);
  console.log(`  Fields updated: ${JSON.stringify(report.fields_updated)}`);
  if (report.errors.length) console.log(`  Errors: ${report.errors.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

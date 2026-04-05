#!/usr/bin/env node
/**
 * Fetch offshore wind farms from Wikidata SPARQL endpoint.
 * Extracts farm data + company entities (operators, owners, developers).
 * Outputs data/ingest/wikidata-farms.json and data/ingest/wikidata-companies.json
 */
import { INGEST_DIR, writeJson, normaliseStatus, parseYear } from "./_farm-ingest-utils.mjs";
import path from "node:path";

const SPARQL_URL = "https://query.wikidata.org/sparql";
const PAGE_SIZE = 200;

/* ── SPARQL query for offshore wind farms ─────────────────────────────────────
   Q1357601 = offshore wind farm (197 entries)
   We also pick up subclasses and any wind farm (Q194356) explicitly
   tagged with "offshore" in the description or with marine coordinates.
   ──────────────────────────────────────────────────────────────────────────── */

function buildQuery(offset, limit) {
  return `
SELECT DISTINCT ?item ?itemLabel ?coord ?countryCode ?countryLabel
       ?capacity ?inception ?turbineCount ?waterDepth
       ?operatorId ?operatorLabel
       ?ownerId ?ownerLabel
       ?developerId ?developerLabel
WHERE {
  {
    ?item wdt:P31/wdt:P279* wd:Q1357601.
  } UNION {
    ?item wdt:P31/wdt:P279* wd:Q194356.
    ?item schema:description ?desc.
    FILTER(LANG(?desc) = "en")
    FILTER(CONTAINS(LCASE(?desc), "offshore"))
  }
  OPTIONAL { ?item wdt:P625  ?coord. }
  OPTIONAL { ?item wdt:P17   ?country. ?country wdt:P297 ?countryCode. }
  OPTIONAL { ?item wdt:P2109 ?capacity. }
  OPTIONAL { ?item wdt:P571  ?inception. }
  OPTIONAL { ?item wdt:P1114 ?turbineCount. }
  OPTIONAL { ?item wdt:P4511 ?waterDepth. }
  OPTIONAL { ?item wdt:P137  ?operatorId. }
  OPTIONAL { ?item wdt:P127  ?ownerId. }
  OPTIONAL { ?item wdt:P176  ?developerId. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?item
LIMIT ${limit} OFFSET ${offset}
`;
}

/** Parse Wikidata Point(...) string to {lat, lng}. */
function parseWdCoord(str) {
  if (!str) return null;
  const m = str.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
}

/** Extract QID from Wikidata URI. */
function qid(uri) {
  if (!uri) return null;
  const m = uri.match(/(Q\d+)$/);
  return m ? m[1] : null;
}

async function sparqlFetch(query) {
  const resp = await fetch(SPARQL_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "OffshoreWindIntel/1.0 (data ingest pipeline)",
    },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SPARQL HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

/* ── Separate queries for each relationship property ───────────────────────── */
function buildRelQuery(prop, role) {
  return `
SELECT ?item ?comp ?compLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q1357601.
  ?item wdt:${prop} ?comp.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;
}

const REL_PROPERTIES = [
  { prop: "P137", role: "operator" },
  { prop: "P127", role: "owner" },
  { prop: "P176", role: "developer" },
];

async function main() {
  console.log("Ingesting offshore wind farms from Wikidata…");

  // Phase 1: Farm data
  const allBindings = [];
  let offset = 0;
  while (true) {
    console.log(`  Fetching farms offset ${offset}…`);
    const query = buildQuery(offset, PAGE_SIZE);
    const json = await sparqlFetch(query);
    const bindings = json.results?.bindings || [];
    allBindings.push(...bindings);
    if (bindings.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`  Got ${allBindings.length} raw farm binding rows`);

  // Phase 2: Relationships (one query per property to avoid timeouts)
  const relBindings = [];
  for (const { prop, role } of REL_PROPERTIES) {
    console.log(`  Fetching ${role} relationships (${prop})…`);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const relJson = await sparqlFetch(buildRelQuery(prop, role));
      const bindings = relJson.results?.bindings || [];
      for (const b of bindings) {
        relBindings.push({ ...b, _role: role });
      }
      console.log(`    → ${bindings.length} ${role} links`);
    } catch (err) {
      console.warn(`    ⚠ ${role} query failed: ${err.message}`);
    }
  }
  console.log(`  Got ${relBindings.length} total relationship binding rows`);

  /* ── Aggregate by entity (one farm can have multiple owner/operator rows) ── */
  const farmMap = new Map();  // QID → farm object
  const companyMap = new Map(); // QID → company object

  for (const b of allBindings) {
    const itemUri = b.item?.value;
    const id = qid(itemUri);
    if (!id) continue;

    if (!farmMap.has(id)) {
      const coord = parseWdCoord(b.coord?.value);
      farmMap.set(id, {
        source: "wikidata",
        wikidata_id: id,
        name: b.itemLabel?.value || id,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        country_code: b.countryCode?.value?.toUpperCase()?.slice(0, 2) || null,
        country_name: b.countryLabel?.value || null,
        capacity_mw: b.capacity?.value ? parseFloat(b.capacity.value) : null,
        commissioned_year: parseYear(b.inception?.value),
        turbine_count: b.turbineCount?.value ? parseInt(b.turbineCount.value, 10) : null,
        water_depth_m: b.waterDepth?.value ? parseFloat(b.waterDepth.value) : null,
        status: "unknown", // Wikidata doesn't have a clean status field
        operators: [],
        owners: [],
        developers: [],
      });
    }

  }

  /* ── Process relationship bindings ──────────────────────────────────────── */
  for (const b of relBindings) {
    const itemUri = b.item?.value;
    const id = qid(itemUri);
    if (!id || !farmMap.has(id)) continue;
    const farm = farmMap.get(id);

    const role = b._role;
    const compUri = b.comp?.value;
    const compQid = qid(compUri);
    const compLabel = b.compLabel?.value;
    if (!compQid || !compLabel || compLabel === compQid) continue;

    const roleList = farm[`${role}s`];
    if (!roleList.find((c) => c.wikidata_id === compQid)) {
      roleList.push({ wikidata_id: compQid, name: compLabel, role });
    }

    if (!companyMap.has(compQid)) {
      companyMap.set(compQid, {
        wikidata_id: compQid,
        name: compLabel,
        roles_seen: new Set(),
        farm_count: 0,
      });
    }
    companyMap.get(compQid).roles_seen.add(role);
  }

  // Count farm associations per company
  for (const farm of farmMap.values()) {
    const seen = new Set();
    for (const role of ["operators", "owners", "developers"]) {
      for (const c of farm[role]) {
        if (!seen.has(c.wikidata_id)) {
          seen.add(c.wikidata_id);
          const comp = companyMap.get(c.wikidata_id);
          if (comp) comp.farm_count++;
        }
      }
    }
  }

  /* ── Try to infer status from inception date ────────────────────────────── */
  const currentYear = new Date().getFullYear();
  for (const farm of farmMap.values()) {
    if (farm.commissioned_year) {
      if (farm.commissioned_year <= currentYear) farm.status = "operational";
      else farm.status = "planned";
    }
  }

  /* ── Output ────────────────────────────────────────────────────────────── */
  const farms = [...farmMap.values()];
  const companies = [...companyMap.values()].map((c) => ({
    wikidata_id: c.wikidata_id,
    name: c.name,
    roles: [...c.roles_seen],
    farm_count: c.farm_count,
  }));

  writeJson(path.join(INGEST_DIR, "wikidata-farms.json"), farms);
  writeJson(path.join(INGEST_DIR, "wikidata-companies.json"), companies);

  // Summary stats
  const withCoords = farms.filter((f) => f.lat != null).length;
  const withCountry = farms.filter((f) => f.country_code).length;
  const withCapacity = farms.filter((f) => f.capacity_mw).length;
  const withRelationships = farms.filter((f) => f.operators.length + f.owners.length + f.developers.length > 0).length;
  console.log(`\nDone. ${farms.length} offshore wind farms from Wikidata.`);
  console.log(`  ${withCoords} with coords | ${withCountry} with country | ${withCapacity} with capacity`);
  console.log(`  ${withRelationships} with at least one operator/owner/developer`);
  console.log(`  ${companies.length} unique company entities`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

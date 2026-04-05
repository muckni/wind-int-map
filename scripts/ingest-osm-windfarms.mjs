#!/usr/bin/env node
/**
 * Fetch offshore wind farms from OpenStreetMap via the Overpass API.
 * Broadened query to capture more farms beyond strict `location=offshore`.
 * Outputs data/ingest/osm-farms.json
 */
import { INGEST_DIR, writeJson, normaliseStatus, parseYear, normaliseName, haversineKm } from "./_farm-ingest-utils.mjs";
import path from "node:path";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Broad query: multiple tag patterns for offshore wind
const QUERY = `
[out:json][timeout:180];
(
  nwr["plant:source"="wind"]["location"="offshore"];
  nwr["generator:source"="wind"]["location"="offshore"];
  nwr["power"="plant"]["plant:source"="wind"]["offshore"="yes"];
  nwr["power"="generator"]["generator:source"="wind"]["offshore"="yes"];
  nwr["power"="plant"]["plant:source"="wind"]["seamark:type"];
  nwr["power"="generator"]["generator:source"="wind"]["seamark:type"];
  nwr["offshore"="yes"]["power"~"plant|generator"];
  nwr["plant:source"="wind"]["name"~"[Oo]ffshore|[Ss]ea|[Oo]cean|[Mm]arine"];
);
out center;
`;

/** Deduplicate within results by name + proximity */
function deduplicateOsm(farms) {
  const result = [];
  for (const farm of farms) {
    const norm = normaliseName(farm.name);
    let isDupe = false;
    for (const existing of result) {
      const existNorm = normaliseName(existing.name);
      if (norm === existNorm) { isDupe = true; break; }
      if (farm.lat != null && existing.lat != null) {
        const dist = haversineKm(farm.lat, farm.lng, existing.lat, existing.lng);
        if (dist < 2 && norm.length > 0 && existNorm.length > 0) { isDupe = true; break; }
      }
    }
    if (!isDupe) result.push(farm);
  }
  return result;
}

async function main() {
  console.log("Fetching offshore wind farms from Overpass (broadened query)…");
  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const elements = json.elements || [];
  console.log(`  Overpass returned ${elements.length} elements`);

  const farms = elements
    .map((el) => {
      const lat = el.center?.lat ?? el.lat;
      const lng = el.center?.lon ?? el.lon;
      if (lat == null || lng == null) return null;
      const tags = el.tags || {};
      const capacityRaw = tags["plant:output:electricity"] || tags["generator:output:electricity"] || "";
      let capacity_mw = null;
      const mwMatch = capacityRaw.match(/([\d.]+)\s*MW/i);
      if (mwMatch) capacity_mw = parseFloat(mwMatch[1]);
      else {
        const kwMatch = capacityRaw.match(/([\d.]+)\s*kW/i);
        if (kwMatch) capacity_mw = parseFloat(kwMatch[1]) / 1000;
      }

      return {
        source: "osm",
        osm_type: el.type,
        osm_id: el.id,
        name: tags.name || tags["name:en"] || null,
        lat,
        lng,
        capacity_mw,
        country_code: (tags["addr:country"] || tags["ISO3166-1"] || tags["ISO3166-1:alpha2"] || "").toUpperCase().slice(0, 2) || null,
        status: normaliseStatus(tags["plant:status"] || tags.status || tags["generator:status"] || ""),
        commissioned_year: parseYear(tags.start_date),
        turbine_count: tags["generator:count"] ? parseInt(tags["generator:count"], 10) : null,
        wikidata: tags.wikidata || null,
        wikipedia: tags.wikipedia || null,
      };
    })
    .filter(Boolean)
    .filter((f) => f.name); // skip unnamed elements

  const deduped = deduplicateOsm(farms);
  console.log(`  After dedup: ${deduped.length} (from ${farms.length})`);

  writeJson(path.join(INGEST_DIR, "osm-farms.json"), deduped);
  console.log(`Done. ${deduped.length} named offshore wind farms from OSM.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

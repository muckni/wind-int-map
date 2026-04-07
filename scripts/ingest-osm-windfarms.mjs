#!/usr/bin/env node
/**
 * Fetch offshore wind farms from OpenStreetMap via the Overpass API.
 * Outputs data/ingest/osm-farms.json
 */
import { INGEST_DIR, writeJson, normaliseStatus, parseYear } from "./_farm-ingest-utils.mjs";
import path from "node:path";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const QUERY = `
[out:json][timeout:120];
(
  nwr["plant:source"="wind"]["location"="offshore"];
  nwr["generator:source"="wind"]["location"="offshore"];
  nwr["power"="plant"]["plant:source"="wind"]["offshore"="yes"];
);
out center;
`;

async function main() {
  console.log("Fetching offshore wind farms from Overpass…");
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

  writeJson(path.join(INGEST_DIR, "osm-farms.json"), farms);
  console.log(`Done. ${farms.length} named offshore wind farms from OSM.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

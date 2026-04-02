#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "qa");
const API_BASE = process.env.API_BASE || "http://localhost:3000";

const NAME_OVERRIDES = new Map([
  ["Deme", "DEME Group"],
  ["DEME Offshore", "DEME Group"],
  ["Eew Spc", "EEW Group"],
  ["Nkt", "NKT A/S"],
  ["Tkf", "TKF"],
  ["Jdr Cable Systems", "JDR Cable Systems"],
  ["Prysmian", "Prysmian Group"],
  ["REpower", "Senvion"],
  ["Senvion", "Senvion"],
  ["Siemens Gamesa", "Siemens Gamesa"],
  ["Vestas", "Vestas Wind Systems"],
]);

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function wikidataSearch(name) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(name)}`;
  const data = await getJson(url, { "User-Agent": "offshore-wind-intelligence/1.0" });
  return Array.isArray(data.search) ? data.search : [];
}

async function wikidataEntity(ids) {
  if (!ids.length) return {};
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=en&props=labels|claims&ids=${encodeURIComponent(ids.join("|"))}`;
  const data = await getJson(url, { "User-Agent": "offshore-wind-intelligence/1.0" });
  return data.entities || {};
}

function claimEntityId(entity, prop) {
  const claim = entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return claim?.id || null;
}

function claimString(entity, prop) {
  const claim = entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return typeof claim === "string" ? claim : null;
}

function claimCoord(entity, prop) {
  const claim = entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  if (!claim) return null;
  const lat = Number(claim.latitude);
  const lng = Number(claim.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function label(entity) {
  return entity?.labels?.en?.value || null;
}

function normalizeScore(distanceKm) {
  if (distanceKm == null) return "unresolved";
  if (distanceKm <= 120) return "match";
  if (distanceKm <= 500) return "nearby";
  return "mismatch";
}

function toCsv(rows, cols) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

async function resolveHq(contractorName) {
  const query = NAME_OVERRIDES.get(contractorName) || contractorName;
  const hits = await wikidataSearch(query);
  if (!hits.length) return { status: "no_wikidata_hit", query };

  const best = hits[0];
  const entities = await wikidataEntity([best.id]);
  const org = entities[best.id];
  if (!org) return { status: "no_entity", query, qid: best.id };

  const hqCityQid = claimEntityId(org, "P159");
  const website = claimString(org, "P856");

  if (!hqCityQid) {
    return {
      status: "no_hq_claim",
      query,
      qid: best.id,
      matched_name: label(org) || best.label || null,
      website,
    };
  }

  const cityEntities = await wikidataEntity([hqCityQid]);
  const city = cityEntities[hqCityQid];
  const cityName = label(city);
  let coord = claimCoord(city, "P625");

  let source = "wikidata_city_coord";
  if (!coord && cityName) {
    const nominatim = await getJson(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(cityName)}`,
      { "User-Agent": "offshore-wind-intelligence/1.0" }
    ).catch(() => []);
    const first = Array.isArray(nominatim) ? nominatim[0] : null;
    if (first) {
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coord = { lat, lng };
        source = "nominatim_city_coord";
      }
    }
  }

  if (!coord) {
    return {
      status: "hq_city_no_coord",
      query,
      qid: best.id,
      matched_name: label(org) || best.label || null,
      hq_city: cityName,
      website,
    };
  }

  return {
    status: "ok",
    query,
    qid: best.id,
    matched_name: label(org) || best.label || null,
    hq_city_qid: hqCityQid,
    hq_city: cityName,
    hq_lat: coord.lat,
    hq_lng: coord.lng,
    hq_coord_source: source,
    website,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const companiesRes = await getJson(`${API_BASE}/api/companies?with_location=true`);
  const contractors = (Array.isArray(companiesRes.data) ? companiesRes.data : []).filter((c) => c.marker_class === "epc");

  const rows = [];
  for (const c of contractors) {
    const resolved = await resolveHq(c.name);
    const mapLat = Number(c.lat);
    const mapLng = Number(c.lng);
    let distanceKm = null;
    if (resolved.status === "ok") {
      distanceKm = haversineKm(mapLat, mapLng, resolved.hq_lat, resolved.hq_lng);
    }

    rows.push({
      company_id: c.id,
      name: c.name,
      marker_class: c.marker_class,
      map_lat: mapLat,
      map_lng: mapLng,
      map_location_source: c.location_source ?? null,
      map_city: c.city ?? null,
      map_country: c.hq_country_code ?? null,
      lookup_status: resolved.status,
      matched_qid: resolved.qid ?? null,
      matched_name: resolved.matched_name ?? null,
      hq_city: resolved.hq_city ?? null,
      hq_lat: resolved.hq_lat ?? null,
      hq_lng: resolved.hq_lng ?? null,
      hq_coord_source: resolved.hq_coord_source ?? null,
      distance_km: distanceKm == null ? null : Number(distanceKm.toFixed(1)),
      position_validation: normalizeScore(distanceKm),
      source_website: resolved.website ?? null,
      query_used: resolved.query ?? c.name,
    });

    await new Promise((r) => setTimeout(r, 180));
  }

  const summary = {
    generated_at: new Date().toISOString(),
    contractors_total: rows.length,
    resolved_hq: rows.filter((r) => r.lookup_status === "ok").length,
    unresolved: rows.filter((r) => r.lookup_status !== "ok").length,
    validation: {
      match: rows.filter((r) => r.position_validation === "match").length,
      nearby: rows.filter((r) => r.position_validation === "nearby").length,
      mismatch: rows.filter((r) => r.position_validation === "mismatch").length,
      unresolved: rows.filter((r) => r.position_validation === "unresolved").length,
    },
    by_map_location_source: {
      hq: rows.filter((r) => r.map_location_source === "hq").length,
      farm_derived: rows.filter((r) => r.map_location_source === "farm-derived").length,
    },
  };

  const stamp = summary.generated_at.replace(/[:.]/g, "-");
  const jsonStamped = path.join(OUT_DIR, `contractor-hq-validation-${stamp}.json`);
  const csvStamped = path.join(OUT_DIR, `contractor-hq-validation-${stamp}.csv`);
  const jsonLatest = path.join(OUT_DIR, "contractor-hq-validation-latest.json");
  const csvLatest = path.join(OUT_DIR, "contractor-hq-validation-latest.csv");

  const cols = [
    "company_id","name","marker_class","map_lat","map_lng","map_location_source","map_city","map_country",
    "lookup_status","matched_qid","matched_name","hq_city","hq_lat","hq_lng","hq_coord_source",
    "distance_km","position_validation","source_website","query_used"
  ];

  const payload = { summary, rows };
  fs.writeFileSync(jsonStamped, JSON.stringify(payload, null, 2));
  fs.writeFileSync(jsonLatest, JSON.stringify(payload, null, 2));
  fs.writeFileSync(csvStamped, toCsv(rows, cols));
  fs.writeFileSync(csvLatest, toCsv(rows, cols));

  console.log(JSON.stringify({ summary, outputs: {
    json_latest: path.relative(ROOT, jsonLatest),
    csv_latest: path.relative(ROOT, csvLatest),
  }}, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

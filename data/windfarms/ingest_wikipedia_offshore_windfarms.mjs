#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const PAGE_URL = "https://en.wikipedia.org/wiki/List_of_offshore_wind_farms";
const COUNTRY_INDEX_URL = "https://en.wikipedia.org/wiki/Lists_of_offshore_wind_farms_by_country";
const WIKI_API = "https://en.wikipedia.org/w/api.php";

const COUNTRY_MAP = {
  "belgium": "BE",
  "china": "CN",
  "denmark": "DK",
  "finland": "FI",
  "france": "FR",
  "germany": "DE",
  "ireland": "IE",
  "japan": "JP",
  "netherlands": "NL",
  "norway": "NO",
  "poland": "PL",
  "portugal": "PT",
  "south korea": "KR",
  "korea": "KR",
  "spain": "ES",
  "sweden": "SE",
  "taiwan": "TW",
  "united kingdom": "GB",
  "uk": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  "united states": "US",
  "usa": "US",
  "vietnam": "VN",
  "italy": "IT",
  "lithuania": "LT",
  "estonia": "EE",
  "latvia": "LV",
  "turkey": "TR",
  "india": "IN",
  "australia": "AU",
  "canada": "CA",
};

const COUNTRY_CENTROIDS = {
  BE: [4.5, 51.2], CN: [121.0, 31.2], DK: [10.0, 56.1], FI: [24.5, 62.4], FR: [-2.0, 47.0],
  DE: [8.8, 54.2], IE: [-8.4, 53.3], JP: [139.0, 38.0], NL: [4.5, 52.2], NO: [5.0, 61.5],
  PL: [18.5, 54.8], PT: [-9.4, 39.7], KR: [129.2, 35.4], ES: [-3.0, 43.4], SE: [17.0, 58.5],
  TW: [121.0, 24.3], GB: [-1.5, 54.5], US: [-73.0, 40.7], VN: [108.0, 11.0], IT: [12.7, 43.6],
  LT: [21.0, 55.5], EE: [24.8, 59.0], LV: [21.5, 57.6], TR: [29.0, 41.0], IN: [72.5, 19.0],
  AU: [151.2, -33.9], CA: [-63.6, 44.6],
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function stripHtml(raw) {
  return raw
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeWikiTitle(href) {
  const m = href.match(/^\/wiki\/([^#?]+)/);
  if (!m) return null;
  const title = decodeURIComponent(m[1]).replace(/_/g, " ");
  if (title.includes(":")) return null;
  return title;
}

function normalizeCountry(v) {
  if (!v) return null;
  let s = v.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (s.includes(",")) s = s.split(",")[0].trim();
  return COUNTRY_MAP[s] ?? null;
}

function parseCapacityMw(text) {
  if (!text) return null;
  const s = text.toLowerCase();
  const g = s.match(/(\d+(?:\.\d+)?)\s*gw\b/);
  if (g) return Math.round(Number(g[1]) * 1000 * 10) / 10;
  const m = s.match(/(\d+(?:\.\d+)?)\s*mw\b/);
  if (m) return Math.round(Number(m[1]) * 10) / 10;
  return null;
}

function parseStatus(text) {
  const s = (text ?? "").toLowerCase();
  if (s.includes("operat")) return "operational";
  if (s.includes("construction") || s.includes("building")) return "under construction";
  if (s.includes("decommission")) return "decommissioned";
  if (s.includes("proposed") || s.includes("planned") || s.includes("consent") || s.includes("pre-construction")) return "planned";
  return "unknown";
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "offshore-wind-intel-ingestor/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseWikiTables(html, countryHint = null) {
  const tables = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  const out = [];

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows) {
      if (/<th/i.test(row)) continue;
      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) => m[1]);
      if (cells.length < 2) continue;

      const firstLink = cells[0].match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const wikiHref = firstLink?.[1] ?? null;
      const title = wikiHref ? decodeWikiTitle(wikiHref) : null;

      const name = stripHtml(cells[0]);
      const country = normalizeCountry(stripHtml(cells[1])) ?? countryHint;
      const rowText = stripHtml(cells.join(" | "));

      if (!name || !country) continue;

      out.push({
        name,
        wiki_title: title,
        country_code: country,
        capacity_mw: parseCapacityMw(rowText),
        status_current: parseStatus(rowText),
      });
    }
  }

  return out;
}

function dedupeRows(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.country_code}|${r.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    const keep = {
      ...prev,
      capacity_mw: prev.capacity_mw ?? r.capacity_mw,
      status_current: prev.status_current === "unknown" ? r.status_current : prev.status_current,
      wiki_title: prev.wiki_title ?? r.wiki_title,
    };
    byKey.set(key, keep);
  }
  return Array.from(byKey.values());
}

async function fetchCoordinatesForTitles(titles) {
  const map = new Map();
  const chunkSize = 50;

  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "coordinates",
      colimit: "1",
      titles: chunk.join("|"),
    });
    const url = `${WIKI_API}?${params.toString()}`;
    const res = await fetch(url, { headers: { "user-agent": "offshore-wind-intel-ingestor/1.0" } });
    if (!res.ok) continue;
    const json = await res.json();
    const pages = Object.values(json?.query?.pages ?? {});
    for (const page of pages) {
      if (!page || !page.title) continue;
      const c = page.coordinates?.[0];
      if (!c) continue;
      const lat = Number(c.lat);
      const lng = Number(c.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180) {
        map.set(page.title, [Number(lng.toFixed(4)), Number(lat.toFixed(4))]);
      }
    }
  }

  return map;
}

function extractCountryListLinks(html) {
  const links = new Set();
  const matches = html.matchAll(/href="(\/wiki\/List_of_offshore_wind_farms_in_[^"#?]+)"/gi);
  for (const m of matches) {
    if (m[1]) links.add(`https://en.wikipedia.org${m[1]}`);
  }
  return Array.from(links);
}

function inferCountryFromListUrl(url) {
  const title = decodeWikiTitle(url.replace("https://en.wikipedia.org", "")) ?? "";
  const m = title.match(/list of offshore wind farms in (.+)$/i);
  if (!m) return null;
  return normalizeCountry(m[1]);
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing (.env.local or env)");

  const sourcePages = [PAGE_URL, COUNTRY_INDEX_URL];
  const listUrls = new Set();
  const rows = [];

  for (const sourceUrl of sourcePages) {
    try {
      const sourceHtml = await fetchText(sourceUrl);
      rows.push(...parseWikiTables(sourceHtml));
      for (const listUrl of extractCountryListLinks(sourceHtml)) listUrls.add(listUrl);
    } catch {
      // Continue on source failure.
    }
  }

  for (const url of listUrls) {
    try {
      const listHtml = await fetchText(url);
      rows.push(...parseWikiTables(listHtml, inferCountryFromListUrl(url)));
    } catch {
      // Continue on individual list failure.
    }
  }

  const parsed = dedupeRows(rows);

  const titles = parsed.map((r) => r.wiki_title).filter(Boolean);
  const coordMap = await fetchCoordinatesForTitles(Array.from(new Set(titles)));

  const enriched = parsed.map((r) => {
    const coord = (r.wiki_title && coordMap.get(r.wiki_title)) || COUNTRY_CENTROIDS[r.country_code] || null;
    return {
      ...r,
      lng: coord ? Number(coord[0]) : null,
      lat: coord ? Number(coord[1]) : null,
      geometry_quality: (r.wiki_title && coordMap.get(r.wiki_title)) ? "approximated" : "generated",
    };
  }).filter((r) => r.lng != null && r.lat != null);

  const outPath = path.join(__dirname, "wikipedia_offshore_windfarms.json");
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));

  if (!apply) {
    console.log(`Parsed: ${parsed.length}, with coords: ${enriched.length}`);
    console.log(`Wrote ${outPath}`);
    console.log("Dry run only. Re-run with --apply to upsert into DB.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const batch = await client.query(
      `
      INSERT INTO ingest_batches (batch_name, source_name, source_file_name, row_count, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (batch_name) WHERE batch_name IS NOT NULL
      DO UPDATE SET row_count = EXCLUDED.row_count, imported_at = now(), notes = EXCLUDED.notes
      RETURNING id
      `,
      [
        "wikipedia_offshore_wind_farms",
        "Wikipedia",
        "List_of_offshore_wind_farms",
        enriched.length,
        "Imported from Wikipedia list + MediaWiki coordinates where available",
      ]
    );

    const batchId = batch.rows[0].id;

    for (const r of enriched) {
      await client.query(
        `
        INSERT INTO wind_farms (
          name, country_code, sea_basin, status_current, capacity_mw,
          centroid, geometry_quality, data_quality, ingest_batch_id, external_ids
        )
        VALUES (
          $1, $2, 'other', $3, $4,
          ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
          $7, 'unverified', $8,
          jsonb_build_object('wikipedia_title', $9::text)
        )
        ON CONFLICT (country_code, normalized_name)
        DO UPDATE SET
          status_current = COALESCE(EXCLUDED.status_current, wind_farms.status_current),
          capacity_mw = COALESCE(EXCLUDED.capacity_mw, wind_farms.capacity_mw),
          centroid = COALESCE(EXCLUDED.centroid, wind_farms.centroid),
          geometry_quality = COALESCE(EXCLUDED.geometry_quality, wind_farms.geometry_quality),
          ingest_batch_id = EXCLUDED.ingest_batch_id,
          external_ids = COALESCE(wind_farms.external_ids, '{}'::jsonb) || EXCLUDED.external_ids,
          updated_at = now()
        `,
        [
          r.name,
          r.country_code,
          r.status_current ?? "unknown",
          r.capacity_mw,
          r.lng,
          r.lat,
          r.geometry_quality,
          batchId,
          r.wiki_title,
        ]
      );
    }

    const total = await client.query("SELECT COUNT(*)::int AS c FROM wind_farms");
    await client.query("COMMIT");

    console.log(`Upserted rows: ${enriched.length}`);
    console.log(`Total wind farms: ${total.rows[0].c}`);
    console.log(`Saved parsed dataset: ${outPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

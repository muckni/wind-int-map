#!/usr/bin/env node
/**
 * Fetch offshore wind farms from English Wikipedia "List of offshore wind farms" pages.
 * Parses HTML tables, extracts coordinates from articles.
 * Outputs data/ingest/wiki-farms.json
 */
import { INGEST_DIR, writeJson, normaliseStatus, parseYear } from "./_farm-ingest-utils.mjs";
import path from "node:path";

/* ── Wikipedia list pages to scrape ─────────────────────────────────────────── */
const LIST_PAGES = [
  "List_of_offshore_wind_farms",
  "List_of_offshore_wind_farms_in_the_United_Kingdom",
  "List_of_offshore_wind_farms_in_Germany",
  "List_of_offshore_wind_farms_in_Denmark",
  "List_of_offshore_wind_farms_in_the_Netherlands",
  "List_of_offshore_wind_farms_in_Belgium",
  "List_of_offshore_wind_farms_in_China",
  "List_of_offshore_wind_farms_in_the_United_States",
  "List_of_offshore_wind_farms_in_France",
  "List_of_offshore_wind_farms_in_Sweden",
  "List_of_offshore_wind_farms_in_Taiwan",
  "List_of_offshore_wind_farms_in_South_Korea",
  "List_of_offshore_wind_farms_in_Japan",
  "List_of_offshore_wind_farms_in_Vietnam",
  "List_of_offshore_wind_farms_in_Poland",
  "List_of_offshore_wind_farms_in_Ireland",
  "List_of_offshore_wind_farms_in_Norway",
  "List_of_offshore_wind_farms_in_Finland",
  "List_of_offshore_wind_farms_in_Italy",
  "List_of_offshore_wind_farms_in_Spain",
  "List_of_offshore_wind_farms_in_Portugal",
  "List_of_offshore_wind_farms_in_Greece",
  "List_of_offshore_wind_farms_in_India",
  "List_of_offshore_wind_farms_in_Brazil",
];

/* Country code map for list page → country_code fallback */
const PAGE_COUNTRY = {
  United_Kingdom: "GB", Germany: "DE", Denmark: "DK", Netherlands: "NL",
  Belgium: "BE", China: "CN", United_States: "US", France: "FR",
  Sweden: "SE", Taiwan: "TW", South_Korea: "KR", Japan: "JP",
  Vietnam: "VN", Poland: "PL", Ireland: "IE", Norway: "NO",
  Finland: "FI", Italy: "IT", Spain: "ES", Portugal: "PT",
  Greece: "GR", India: "IN", Brazil: "BR",
};

function countryFromPage(page) {
  for (const [key, code] of Object.entries(PAGE_COUNTRY)) {
    if (page.includes(key)) return code;
  }
  return null;
}

/* ── Parse helpers ──────────────────────────────────────────────────────────── */

/** Strip HTML tags. */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Extract text content of a <td>. */
function cellText(td) {
  return stripTags(td).replace(/\[\d+\]/g, "").replace(/&nbsp;/g, " ").trim();
}

/** Try to extract a wikilink title from a <td>'s first <a>. */
function cellLink(td) {
  const m = td.match(/href="\/wiki\/([^"#]+)"/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Extract coordinate from text like "54°10′N 7°50′E" or decimal. */
function parseCoordFromText(text) {
  // Decimal
  const dec = text.match(/([-\d.]+)[°,\s]+([-\d.]+)/);
  if (dec) {
    const a = parseFloat(dec[1]), b = parseFloat(dec[2]);
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  }
  // DMS
  const dms = text.match(/(\d+)°\s*(\d+)[′']\s*(?:(\d+)[″"]?\s*)?([NS])\s+(\d+)°\s*(\d+)[′']\s*(?:(\d+)[″"]?\s*)?([EW])/);
  if (dms) {
    let lat = +dms[1] + +dms[2] / 60 + (+dms[3] || 0) / 3600;
    let lng = +dms[5] + +dms[6] / 60 + (+dms[7] || 0) / 3600;
    if (dms[4] === "S") lat = -lat;
    if (dms[8] === "W") lng = -lng;
    return { lat, lng };
  }
  return null;
}

/** Fetch coordinates for a Wikipedia article title via the API. */
async function fetchArticleCoords(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=coordinates&format=json&redirects=1`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const pages = Object.values(json.query?.pages || {});
    const coords = pages[0]?.coordinates?.[0];
    if (coords) return { lat: coords.lat, lng: coords.lon };
  } catch { /* ignore */ }
  return null;
}

/* ── Fetch + parse a single list page ───────────────────────────────────────── */
async function fetchListPage(page) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json&redirects=1`;
  console.log(`  Fetching ${page}…`);
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn(`    ⚠ HTTP ${resp.status} for ${page}, skipping`);
    return [];
  }
  const json = await resp.json();
  const html = json.parse?.text?.["*"] || "";
  if (!html) return [];

  const fallbackCountry = countryFromPage(page);
  const rows = [];

  // Find all <table class="wikitable ..."> blocks
  const tableRe = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html))) {
    const tableHtml = tableMatch[1];

    // Parse header row to find column indices
    const headerMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    if (!headerMatch) continue;
    const ths = [...headerMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cellText(m[1]).toLowerCase());

    const idx = {
      name: ths.findIndex((h) => /^(wind\s*farm|project|name|farm)/.test(h)),
      capacity: ths.findIndex((h) => /capacit|mw|power|rated/i.test(h)),
      turbines: ths.findIndex((h) => /turbine|number|no\.\s*of/i.test(h)),
      status: ths.findIndex((h) => /status|phase|stage/i.test(h)),
      year: ths.findIndex((h) => /commission|year|online|complet|operat/i.test(h)),
      country: ths.findIndex((h) => /country|location|nation/i.test(h)),
      coords: ths.findIndex((h) => /coord|location|position|lat/i.test(h)),
    };
    if (idx.name < 0) continue; // need at least a name column

    // Parse data rows
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let first = true;
    while ((rowMatch = rowRe.exec(tableHtml))) {
      if (first) { first = false; continue; } // skip header
      const tds = [...rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => m[1]);
      if (tds.length <= idx.name) continue;

      const name = cellText(tds[idx.name]);
      if (!name || /total|sum|^[\d,.\s]+$/i.test(name)) continue;

      const wikiTitle = cellLink(tds[idx.name]);

      let capacity_mw = null;
      if (idx.capacity >= 0 && tds[idx.capacity]) {
        const num = cellText(tds[idx.capacity]).replace(/,/g, "").match(/([\d.]+)/);
        if (num) capacity_mw = parseFloat(num[1]);
      }

      let turbine_count = null;
      if (idx.turbines >= 0 && tds[idx.turbines]) {
        const num = cellText(tds[idx.turbines]).replace(/,/g, "").match(/(\d+)/);
        if (num) turbine_count = parseInt(num[1], 10);
      }

      let status = "unknown";
      if (idx.status >= 0 && tds[idx.status]) {
        status = normaliseStatus(cellText(tds[idx.status]));
      }

      let commissioned_year = null;
      if (idx.year >= 0 && tds[idx.year]) {
        commissioned_year = parseYear(cellText(tds[idx.year]));
      }

      let country_code = fallbackCountry;
      if (idx.country >= 0 && tds[idx.country]) {
        const ct = cellText(tds[idx.country]);
        if (/^[A-Z]{2}$/.test(ct)) country_code = ct;
      }

      // Try coordinate from table cell
      let coord = null;
      if (idx.coords >= 0 && tds[idx.coords]) {
        coord = parseCoordFromText(stripTags(tds[idx.coords]));
      }

      rows.push({ name, wikiTitle, capacity_mw, turbine_count, status, commissioned_year, country_code, coord, source_page: page });
    }
  }
  return rows;
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
async function main() {
  console.log("Ingesting offshore wind farms from Wikipedia…");
  const allRows = [];
  const seen = new Set(); // dedupe by lowercase name

  for (const page of LIST_PAGES) {
    const rows = await fetchListPage(page);
    for (const row of rows) {
      const key = (row.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
    }
    // polite delay
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`  Parsed ${allRows.length} unique farms from tables. Geocoding missing coords…`);

  // Fetch coords for farms that have a wikiTitle but no coord
  let geocoded = 0;
  for (const row of allRows) {
    if (row.coord) continue;
    if (!row.wikiTitle) continue;
    const c = await fetchArticleCoords(row.wikiTitle);
    if (c) {
      row.coord = c;
      geocoded++;
    }
    await new Promise((r) => setTimeout(r, 200)); // polite
  }
  console.log(`  Geocoded ${geocoded} farms via Wikipedia article coords.`);

  // Flatten to output format
  const farms = allRows.map((r) => ({
    source: "wikipedia",
    name: r.name,
    wiki_title: r.wikiTitle,
    lat: r.coord?.lat ?? null,
    lng: r.coord?.lng ?? null,
    capacity_mw: r.capacity_mw,
    turbine_count: r.turbine_count,
    status: r.status,
    commissioned_year: r.commissioned_year,
    country_code: r.country_code || null,
    source_page: r.source_page,
  }));

  writeJson(path.join(INGEST_DIR, "wiki-farms.json"), farms);
  console.log(`Done. ${farms.length} farms from Wikipedia.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

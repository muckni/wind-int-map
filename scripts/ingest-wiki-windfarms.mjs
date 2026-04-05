#!/usr/bin/env node
/**
 * Fetch offshore wind farms from English Wikipedia "List of offshore wind farms" pages.
 * Parses HTML tables, extracts coordinates from articles + Wikidata fallback.
 * Outputs data/ingest/wiki-farms.json
 */
import { INGEST_DIR, writeJson, normaliseStatus, parseYear, decodeHtmlEntities } from "./_farm-ingest-utils.mjs";
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

/* Country detection from farm name patterns (for generic list page) */
const NAME_COUNTRY_HINTS = [
  [/\b(hornsea|east anglia|dogger bank|triton knoll|dudgeon|sheringham|walney|barrow|robin rigg|london array|thanet|rampion|gwynt|lynn|inner dowsing|scroby|kentish flats|greater gabbard|galloper|humber|teesside|moray|seagreen|beatrice|berwick bank|neart na gaoithe)\b/i, "GB"],
  [/\b(borkum|nordsee|helgoland|baltic eagle|wikinger|arkona|butendiek|amrumbank|meerwind|dan tysk|trianel|hohe see|albatros|gode wind|sandbank|veja mate|global tech|nordergr[uü]nde|kaskasi)\b/i, "DE"],
  [/\b(horns rev|kriegers flak|anholt|middelgrunden|r[øo]dsand|nysted|sams[øo]|lillgrund)\b/i, "DK"],
  [/\b(borssele|hollandse kust|gemini|luchterduinen|egmond|princess amalia|ijmuiden)\b/i, "NL"],
  [/\b(thornton|belwind|northwind|rentel|seamade|norther|nobelwind|mermaid)\b/i, "BE"],
  [/\b(saint-nazaire|f[eé]camp|saint-brieuc|dieppe|le tr[eé]port|courseulles|groix|belle-[iî]le|yeu|noirmoutier)\b/i, "FR"],
  [/\b(changhua|formosa|zhongneng|hai long|yunlin|taipower)\b/i, "TW"],
  [/\b(vineyard|south fork|sunrise|revolution|ocean wind|coastal virginia|block island|empire wind|beacon wind|atlantic shores|skipjack|kitty hawk|dominion energy)\b/i, "US"],
];

function guessCountryFromName(name) {
  for (const [pattern, code] of NAME_COUNTRY_HINTS) {
    if (pattern.test(name)) return code;
  }
  return null;
}

/* ── Section header → country detection (for generic list page) ───────────── */
const SECTION_COUNTRY_MAP = {
  denmark: "DK", germany: "DE", "united kingdom": "GB", uk: "GB",
  netherlands: "NL", belgium: "BE", china: "CN", "united states": "US",
  france: "FR", sweden: "SE", taiwan: "TW", "south korea": "KR",
  japan: "JP", vietnam: "VN", poland: "PL", ireland: "IE",
  norway: "NO", finland: "FI", italy: "IT", spain: "ES",
  portugal: "PT", greece: "GR", india: "IN", brazil: "BR",
};

function countryFromPage(page) {
  for (const [key, code] of Object.entries(PAGE_COUNTRY)) {
    if (page.includes(key)) return code;
  }
  return null;
}

/* ── Parse helpers ──────────────────────────────────────────────────────────── */

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

function cellText(td) {
  return decodeHtmlEntities(stripTags(td));
}

function cellLink(td) {
  const m = td.match(/href="\/wiki\/([^"#]+)"/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseCoordFromText(text) {
  // DMS first (more specific)
  const dms = text.match(/(\d+)°\s*(\d+)[′']\s*(?:(\d+(?:\.\d+)?)[″"]?\s*)?([NS])\s+(\d+)°\s*(\d+)[′']\s*(?:(\d+(?:\.\d+)?)[″"]?\s*)?([EW])/);
  if (dms) {
    let lat = +dms[1] + +dms[2] / 60 + (+dms[3] || 0) / 3600;
    let lng = +dms[5] + +dms[6] / 60 + (+dms[7] || 0) / 3600;
    if (dms[4] === "S") lat = -lat;
    if (dms[8] === "W") lng = -lng;
    return { lat, lng };
  }
  // Decimal
  const dec = text.match(/([-\d.]+)[°,\s]+([-\d.]+)/);
  if (dec) {
    const a = parseFloat(dec[1]), b = parseFloat(dec[2]);
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  }
  return null;
}

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

/** Fallback: try Wikidata search → entity → P625 */
async function fetchWikidataCoords(name) {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=1&format=json`;
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) return null;
    const searchJson = await searchResp.json();
    const entity = searchJson.search?.[0];
    if (!entity) return null;

    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entity.id}&props=claims&format=json`;
    const entityResp = await fetch(entityUrl);
    if (!entityResp.ok) return null;
    const entityJson = await entityResp.json();
    const claims = entityJson.entities?.[entity.id]?.claims;
    const coordClaim = claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (coordClaim) return { lat: coordClaim.latitude, lng: coordClaim.longitude };
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
  const isGenericPage = page === "List_of_offshore_wind_farms";
  const rows = [];

  // For the generic page: track current section country from <h2>/<h3> headers
  let sectionCountry = null;

  // Split into chunks by headers to track section context
  const chunks = html.split(/(<h[23][^>]*>[\s\S]*?<\/h[23]>)/gi);

  for (const chunk of chunks) {
    // Check if this is a header — extract country
    const headerMatch = chunk.match(/<h[23][^>]*>.*?<span[^>]*>(.*?)<\/span>/i);
    if (headerMatch && isGenericPage) {
      const headerText = stripTags(headerMatch[1]).toLowerCase().trim();
      for (const [key, code] of Object.entries(SECTION_COUNTRY_MAP)) {
        if (headerText.includes(key)) { sectionCountry = code; break; }
      }
      continue;
    }

    // Find all <table class="wikitable ..."> blocks in this chunk
    const tableRe = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    while ((tableMatch = tableRe.exec(chunk))) {
      const tableHtml = tableMatch[1];

      const headerRowMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
      if (!headerRowMatch) continue;
      const ths = [...headerRowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cellText(m[1]).toLowerCase());

      const idx = {
        name: ths.findIndex((h) => /^(wind\s*farm|project|name|farm)/.test(h)),
        capacity: ths.findIndex((h) => /capacit|mw|power|rated/i.test(h)),
        turbines: ths.findIndex((h) => /turbine|number|no\.\s*of/i.test(h)),
        status: ths.findIndex((h) => /status|phase|stage/i.test(h)),
        year: ths.findIndex((h) => /commission|year|online|complet|operat/i.test(h)),
        country: ths.findIndex((h) => /country|location|nation/i.test(h)),
        coords: ths.findIndex((h) => /coord|location|position|lat/i.test(h)),
      };
      if (idx.name < 0) continue;

      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      let first = true;
      while ((rowMatch = rowRe.exec(tableHtml))) {
        if (first) { first = false; continue; }
        const tds = [...rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => m[1]);
        if (tds.length <= idx.name) continue;

        const rawName = cellText(tds[idx.name]);
        const name = decodeHtmlEntities(rawName);
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

        // Try multiple columns for commissioned year
        let commissioned_year = null;
        if (idx.year >= 0 && tds[idx.year]) {
          commissioned_year = parseYear(cellText(tds[idx.year]));
        }
        if (!commissioned_year && idx.status >= 0 && tds[idx.status]) {
          // Sometimes year is embedded in status column like "Operational (2020)"
          commissioned_year = parseYear(cellText(tds[idx.status]));
        }

        // Country resolution chain: table cell → section header → page fallback → name hints
        let country_code = null;
        if (idx.country >= 0 && tds[idx.country]) {
          const ct = cellText(tds[idx.country]).toUpperCase();
          if (/^[A-Z]{2}$/.test(ct)) country_code = ct;
        }
        if (!country_code && isGenericPage && sectionCountry) {
          country_code = sectionCountry;
        }
        if (!country_code) country_code = fallbackCountry;
        if (!country_code) country_code = guessCountryFromName(name);

        let coord = null;
        if (idx.coords >= 0 && tds[idx.coords]) {
          coord = parseCoordFromText(stripTags(tds[idx.coords]));
        }

        rows.push({ name, wikiTitle, capacity_mw, turbine_count, status, commissioned_year, country_code, coord, source_page: page });
      }
    }
  }
  return rows;
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
async function main() {
  console.log("Ingesting offshore wind farms from Wikipedia…");
  const allRows = [];
  const seen = new Set();

  for (const page of LIST_PAGES) {
    const rows = await fetchListPage(page);
    for (const row of rows) {
      const key = (row.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`  Parsed ${allRows.length} unique farms from tables. Geocoding missing coords…`);

  // Phase 1: Wikipedia article coords
  let geocoded = 0;
  for (const row of allRows) {
    if (row.coord) continue;
    if (!row.wikiTitle) continue;
    const c = await fetchArticleCoords(row.wikiTitle);
    if (c) {
      row.coord = c;
      geocoded++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`  Phase 1: Geocoded ${geocoded} farms via Wikipedia article coords.`);

  // Phase 2: Wikidata fallback for remaining
  let wdGeocoded = 0;
  for (const row of allRows) {
    if (row.coord) continue;
    const c = await fetchWikidataCoords(row.name);
    if (c) {
      row.coord = c;
      wdGeocoded++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`  Phase 2: Geocoded ${wdGeocoded} farms via Wikidata search.`);

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
  const withCoords = farms.filter((f) => f.lat != null).length;
  const withCountry = farms.filter((f) => f.country_code).length;
  console.log(`Done. ${farms.length} farms from Wikipedia (${withCoords} with coords, ${withCountry} with country).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

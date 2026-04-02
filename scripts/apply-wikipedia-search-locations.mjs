#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const COUNTRY_NAMES = {
  BE: ["belgium", "belgian"],
  CN: ["china", "chinese"],
  DE: ["germany", "german"],
  DK: ["denmark", "danish"],
  FR: ["france", "french"],
  GB: ["united kingdom", "uk", "britain", "british", "england", "scotland", "wales"],
  JP: ["japan", "japanese"],
  NL: ["netherlands", "dutch"],
  NO: ["norway", "norwegian"],
  PL: ["poland", "polish"],
  SE: ["sweden", "swedish"],
  TW: ["taiwan", "taiwanese"],
  US: ["united states", "usa", "us", "american", "new york", "new jersey"],
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]");
}

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['"`]/g, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(offshore|wind farm|windfarm|wind park|project|phase|extension|demonstration)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function nameScore(farmName, title) {
  const a = normalizeText(farmName);
  const b = normalizeText(title);
  if (!a || !b) return 0;
  if (a === b) return 80;
  if (a.includes(b) || b.includes(a)) return 45;
  const as = new Set(a.split(" "));
  const bs = new Set(b.split(" "));
  let shared = 0;
  for (const token of as) if (bs.has(token)) shared += 1;
  return shared * 8;
}

function keywordScore(countryCode, text) {
  const lower = String(text ?? "").toLowerCase();
  let score = 0;
  const hasWindContext = /\b(offshore|wind farm|windfarm|wind park|wind power)\b/.test(lower);
  if (!hasWindContext) return -1000;
  if (/\boffshore wind farm\b/.test(lower)) score += 40;
  else if (/\bwind farm\b/.test(lower)) score += 22;
  else if (/\bwind power\b/.test(lower)) score += 10;
  if (/\blist of\b/.test(lower)) score -= 30;
  for (const keyword of COUNTRY_NAMES[countryCode] ?? []) {
    if (lower.includes(keyword)) {
      score += 10;
      break;
    }
  }
  return score;
}

async function fetchJson(url, params) {
  const full = new URL(url);
  full.search = new URLSearchParams(params).toString();
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(full, {
        headers: { "user-agent": "offshore-wind-intel-locations/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return res.json();
      lastError = new Error(`HTTP ${res.status} for ${full}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw lastError ?? new Error(`Failed to fetch ${full}`);
}

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        headers: { "user-agent": "offshore-wind-intel-locations/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return res.text();
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function fetchPageLocation(title) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
  const html = await fetchText(url);
  const coordMatch = html.match(/"wgCoordinates":\{"lat":\s*([-0-9.]+),\s*"lon":\s*([-0-9.]+)/);
  const wikidataMatch = html.match(/"wgWikibaseItemId":"(Q\d+)"/);
  if (!coordMatch) return null;
  return {
    wikipedia_title: title,
    wikidata_id: wikidataMatch?.[1] ?? null,
    lng: Number(coordMatch[2]),
    lat: Number(coordMatch[1]),
  };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows } = await client.query(`
    SELECT id, name, country_code
    FROM wind_farms
    WHERE geometry_quality = 'generated'
      AND country_code IN ('GB', 'DE', 'FR', 'NL', 'DK', 'US', 'JP', 'CN')
    ORDER BY country_code, name
  `);

  const resolved = [];
  const pageCache = new Map();

  for (const [index, row] of rows.entries()) {
    const baseName = decodeHtmlEntities(row.name).replace(/^[\"\s]+|[\"\s]+$/g, "").trim();
    const queries = Array.from(new Set([
      baseName,
      `${baseName} offshore wind farm`,
      `${baseName} wind farm`,
      `${baseName} ${COUNTRY_NAMES[row.country_code]?.[0] ?? ""}`.trim(),
    ].filter(Boolean)));

    let best = null;
    for (const query of queries) {
      const json = await fetchJson("https://en.wikipedia.org/w/api.php", {
        action: "query",
        format: "json",
        list: "search",
        srsearch: query,
        srlimit: "5",
        srprop: "snippet",
      }).catch(() => null);

      for (const candidate of json?.query?.search ?? []) {
        const score =
          nameScore(row.name, candidate.title) +
          keywordScore(row.country_code, `${candidate.title} ${stripHtml(candidate.snippet)}`);
        if (!best || score > best.score) {
          best = {
            title: candidate.title,
            score,
          };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (best && best.score >= 58) {
      if (!pageCache.has(best.title)) {
        pageCache.set(best.title, await fetchPageLocation(best.title).catch(() => null));
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      const location = pageCache.get(best.title);
      if (location) {
        resolved.push({
          id: row.id,
          name: row.name,
          country_code: row.country_code,
          ...location,
        });
      }
    }

    if ((index + 1) % 10 === 0) {
      console.log(`Searched ${index + 1}/${rows.length}`);
    }
  }

  const outPath = path.join(ROOT, "data", "windfarms", "search_locations.json");
  fs.writeFileSync(outPath, JSON.stringify(resolved, null, 2));
  console.log(`Resolved ${resolved.length}/${rows.length} search rows`);
  console.log(`Wrote ${outPath}`);

  await client.query("BEGIN");
  try {
    const batch = await client.query(
      `
      INSERT INTO ingest_batches (batch_name, source_name, source_file_name, row_count, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (batch_name) WHERE batch_name IS NOT NULL
      DO UPDATE SET row_count = EXCLUDED.row_count, imported_at = now(), notes = EXCLUDED.notes
      RETURNING id
      `,
      [
        "wind_farm_search_locations",
        "Wikipedia search + page HTML",
        "scripts/apply-wikipedia-search-locations.mjs",
        resolved.length,
        "Search-based centroid refresh for remaining generated wind farm rows",
      ]
    );
    const batchId = batch.rows[0].id;

    for (const row of resolved) {
      await client.query(
        `
        UPDATE wind_farms
        SET
          centroid = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          geometry_quality = 'approximated',
          ingest_batch_id = $4,
          external_ids = COALESCE(external_ids, '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object(
              'wikipedia_title', $5::text,
              'wikidata_id', $6::text,
              'location_source', 'wikipedia_search'
            )),
          updated_at = now()
        WHERE id = $1
        `,
        [row.id, row.lng, row.lat, batchId, row.wikipedia_title, row.wikidata_id]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const COUNTRY_NAMES = {
  AU: ["australia"],
  BE: ["belgium", "belgian"],
  CA: ["canada", "canadian"],
  CN: ["china", "chinese"],
  DE: ["germany", "german"],
  DK: ["denmark", "danish"],
  EE: ["estonia", "estonian"],
  ES: ["spain", "spanish"],
  FI: ["finland", "finnish"],
  FR: ["france", "french"],
  GB: ["united kingdom", "uk", "britain", "british", "england", "scotland", "wales"],
  IE: ["ireland", "irish"],
  IN: ["india", "indian"],
  IT: ["italy", "italian"],
  JP: ["japan", "japanese"],
  KR: ["south korea", "korea", "korean"],
  LT: ["lithuania", "lithuanian"],
  LV: ["latvia", "latvian"],
  NL: ["netherlands", "dutch"],
  NO: ["norway", "norwegian"],
  PL: ["poland", "polish"],
  PT: ["portugal", "portuguese"],
  SE: ["sweden", "swedish"],
  TR: ["turkey", "turkish"],
  TW: ["taiwan", "taiwanese"],
  US: ["united states", "usa", "us", "american"],
  VN: ["vietnam", "vietnamese"],
};

const ROMAN_MAP = {
  x: "10",
  ix: "9",
  viii: "8",
  vii: "7",
  vi: "6",
  v: "5",
  iv: "4",
  iii: "3",
  ii: "2",
  i: "1",
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
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]");
}

function normalizeText(value) {
  const romanized = decodeHtmlEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/g, (match) => ROMAN_MAP[match] ?? match)
    .replace(/&/g, " and ")
    .replace(/['"`]/g, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(offshore|wind farm|windfarm|wind park|windpower|project|phase|extension|demonstration)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return romanized;
}

function signatureText(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

function parseSeedTextValue(raw) {
  return raw.replace(/''/g, "'");
}

function parseSeedV2Coordinates() {
  const text = fs.readFileSync(path.join(ROOT, "sql", "seed_v2.sql"), "utf8");
  const regex =
    /^\s*\('((?:[^']|'')+)',\s*'([A-Z]{2})'.*?ST_SetSRID\(ST_MakePoint\(\s*([-0-9.]+),\s*([-0-9.]+)\),4326\)::geography/gsm;
  const map = new Map();

  for (const match of text.matchAll(regex)) {
    const name = parseSeedTextValue(match[1]);
    const countryCode = match[2];
    const lng = Number(match[3]);
    const lat = Number(match[4]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const value = { lng, lat, source: "seed_v2", wikipedia_title: null, wikidata_id: null, score: 1000 };
    map.set(`${countryCode}|name|${normalizeText(name)}`, value);
    map.set(`${countryCode}|sig|${signatureText(name)}`, value);
  }

  return map;
}

function buildWikipediaTitleHints() {
  const filePath = path.join(ROOT, "data", "windfarms", "wikipedia_offshore_windfarms.json");
  const hints = new Map();
  if (!fs.existsSync(filePath)) return hints;

  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  for (const row of rows) {
    const title = decodeHtmlEntities(row?.wiki_title ?? "").trim();
    const name = decodeHtmlEntities(row?.name ?? "").trim();
    const countryCode = row?.country_code;
    if (!title || !name || !countryCode) continue;
    hints.set(`${countryCode}|name|${normalizeText(name)}`, title);
    hints.set(`${countryCode}|sig|${signatureText(name)}`, title);
  }
  return hints;
}

async function fetchJson(url, params) {
  const full = new URL(url);
  if (params) full.search = new URLSearchParams(params).toString();

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
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
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
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function coordFromClaims(entity) {
  const claims = entity?.claims?.P625;
  if (!Array.isArray(claims) || claims.length === 0) return null;
  for (const claim of claims) {
    const value = claim?.mainsnak?.datavalue?.value;
    const lat = Number(value?.latitude);
    const lng = Number(value?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lng, lat };
  }
  return null;
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function nameScore(farmName, candidateTitle) {
  const farm = normalizeText(farmName);
  const title = normalizeText(candidateTitle);
  if (!farm || !title) return 0;
  if (farm === title) return 80;
  if (signatureText(farmName) === signatureText(candidateTitle)) return 75;
  if (farm.includes(title) || title.includes(farm)) return 45;

  const farmTokens = new Set(farm.split(" "));
  const titleTokens = new Set(title.split(" "));
  let shared = 0;
  for (const token of farmTokens) {
    if (token && titleTokens.has(token)) shared += 1;
  }
  return shared * 8;
}

function keywordScore(countryCode, text) {
  const lower = String(text ?? "").toLowerCase();
  let score = 0;
  if (/\boffshore wind farm\b/.test(lower)) score += 40;
  else if (/\bwind farm\b/.test(lower)) score += 22;
  else if (/\bwind power\b/.test(lower)) score += 12;

  if (/\bpower station\b/.test(lower)) score -= 8;
  if (/\blist of\b/.test(lower)) score -= 30;

  for (const keyword of COUNTRY_NAMES[countryCode] ?? []) {
    if (lower.includes(keyword)) {
      score += 12;
      break;
    }
  }
  return score;
}

class Resolver {
  constructor() {
    this.pageCache = new Map();
    this.wikidataCache = new Map();
    this.searchCache = new Map();
  }

  async fetchPagesByTitles(titles) {
    const needed = titles.filter((title) => title && !this.pageCache.has(title));
    for (const title of needed) {
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
      const html = await fetchText(pageUrl);
      const coordMatch = html.match(/"wgCoordinates":\{"lat":\s*([-0-9.]+),\s*"lon":\s*([-0-9.]+)/);
      const wikidataMatch = html.match(/"wgWikibaseItemId":"(Q\d+)"/);
      const shortdescMatch = html.match(/"wgShortDescription":"([^"]*)"/);

      this.pageCache.set(title, {
        title,
        wikipedia_title: title,
        wikidata_id: wikidataMatch?.[1] ?? null,
        shortdesc: shortdescMatch?.[1] ?? "",
        lng: coordMatch ? Number(coordMatch[2]) : null,
        lat: coordMatch ? Number(coordMatch[1]) : null,
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    return titles.map((title) => this.pageCache.get(title)).filter(Boolean);
  }

  async fetchWikidataEntities(ids) {
    const needed = ids.filter((id) => id && !this.wikidataCache.has(id));
    for (const group of chunk(needed, 1)) {
      const json = await fetchJson("https://www.wikidata.org/w/api.php", {
        action: "wbgetentities",
        format: "json",
        ids: group.join("|"),
        props: "claims",
      });
      for (const [id, entity] of Object.entries(json?.entities ?? {})) {
        this.wikidataCache.set(id, {
          id,
          coord: coordFromClaims(entity),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  async hydratePageCandidates(candidates) {
    const pages = await this.fetchPagesByTitles(candidates.map((candidate) => candidate.title));
    const byTitle = new Map(pages.map((page) => [page.title, page]));
    const wikidataIds = pages
      .map((page) => page.wikidata_id)
      .filter((value) => typeof value === "string" && value.length > 0);
    await this.fetchWikidataEntities(wikidataIds);

    return candidates
      .map((candidate) => {
        const page = byTitle.get(candidate.title);
        if (!page) return null;
        const wikidata = page.wikidata_id ? this.wikidataCache.get(page.wikidata_id) : null;
        const coord = page.lng != null && page.lat != null ? { lng: page.lng, lat: page.lat } : wikidata?.coord ?? null;
        if (!coord) return null;
        return {
          ...candidate,
          wikipedia_title: page.wikipedia_title,
          wikidata_id: page.wikidata_id,
          shortdesc: page.shortdesc,
          lng: coord.lng,
          lat: coord.lat,
          source: page.lng != null && page.lat != null ? "wikipedia_page" : "wikidata",
        };
      })
      .filter(Boolean);
  }

  async searchWikipedia(farm) {
    const cacheKey = `w:${farm.country_code}:${farm.name}`;
    if (this.searchCache.has(cacheKey)) return this.searchCache.get(cacheKey);

    const baseName = decodeHtmlEntities(farm.name).replace(/^[\"\s]+|[\"\s]+$/g, "").trim();
    const queries = Array.from(new Set([
      baseName,
      `${baseName} offshore wind farm`,
      `${baseName} wind farm`,
      `${baseName} ${COUNTRY_NAMES[farm.country_code]?.[0] ?? ""}`.trim(),
    ].filter(Boolean)));

    const rawCandidates = [];
    for (const query of queries) {
      const json = await fetchJson("https://en.wikipedia.org/w/api.php", {
        action: "query",
        format: "json",
        list: "search",
        srsearch: query,
        srlimit: "5",
        srprop: "snippet",
      }).catch(() => null);
      for (const row of json?.query?.search ?? []) {
        if (!row?.title) continue;
        rawCandidates.push({
          title: row.title,
          snippet: stripHtml(row.snippet),
        });
      }
    }

    const deduped = Array.from(
      new Map(rawCandidates.map((candidate) => [candidate.title, candidate])).values()
    );
    const hydrated = await this.hydratePageCandidates(deduped);

    const scored = hydrated
      .map((candidate) => ({
        ...candidate,
        score:
          nameScore(farm.name, candidate.title) +
          keywordScore(farm.country_code, `${candidate.shortdesc} ${candidate.snippet}`),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0] ?? null;
    this.searchCache.set(cacheKey, best);
    return best;
  }

  async searchWikidata(farm) {
    const cacheKey = `d:${farm.country_code}:${farm.name}`;
    if (this.searchCache.has(cacheKey)) return this.searchCache.get(cacheKey);

    const baseName = decodeHtmlEntities(farm.name).replace(/^[\"\s]+|[\"\s]+$/g, "").trim();
    const queries = Array.from(new Set([
      baseName,
      `${baseName} offshore wind farm`,
      `${baseName} wind farm`,
    ].filter(Boolean)));

    for (const query of queries) {
      const json = await fetchJson("https://www.wikidata.org/w/api.php", {
        action: "wbsearchentities",
        format: "json",
        language: "en",
        type: "item",
        limit: "5",
        search: query,
      }).catch(() => null);

      const rows = Array.isArray(json?.search) ? json.search : [];
      if (rows.length === 0) continue;

      await this.fetchWikidataEntities(rows.map((row) => row.id));
      const scored = rows
        .map((row) => {
          const coord = this.wikidataCache.get(row.id)?.coord ?? null;
          if (!coord) return null;
          const description = String(row.description ?? "");
          return {
            wikipedia_title: row.label ?? null,
            wikidata_id: row.id,
            shortdesc: description,
            lng: coord.lng,
            lat: coord.lat,
            source: "wikidata_search",
            score:
              nameScore(farm.name, row.label ?? "") +
              keywordScore(farm.country_code, `${description} ${row.match?.text ?? ""}`),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      if (scored[0]) {
        this.searchCache.set(cacheKey, scored[0]);
        return scored[0];
      }
    }

    this.searchCache.set(cacheKey, null);
    return null;
  }

  async resolveByTitle(farm, title) {
    const [page] = await this.hydratePageCandidates([{ title, snippet: "" }]);
    if (!page) return null;
    return {
      ...page,
      score: nameScore(farm.name, title) + keywordScore(farm.country_code, page.shortdesc),
    };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      out[current] = await fn(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const seedCoords = parseSeedV2Coordinates();
  const wikipediaTitleHints = buildWikipediaTitleHints();
  const resolver = new Resolver();

  const farmsResult = await client.query(`
    SELECT
      id,
      name,
      country_code,
      COALESCE(external_ids->>'wikipedia_title', '') AS wikipedia_title,
      round(ST_X(centroid::geometry)::numeric, 6) AS lng,
      round(ST_Y(centroid::geometry)::numeric, 6) AS lat
    FROM wind_farms
    ORDER BY country_code, name
  `);

  const farms = farmsResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    country_code: row.country_code,
    wikipedia_title: row.wikipedia_title || null,
    lng: Number(row.lng),
    lat: Number(row.lat),
  }));

  const hintedTitles = Array.from(
    new Set(
      farms
        .map((farm) =>
          farm.wikipedia_title ||
          wikipediaTitleHints.get(`${farm.country_code}|name|${normalizeText(farm.name)}`) ||
          wikipediaTitleHints.get(`${farm.country_code}|sig|${signatureText(farm.name)}`) ||
          null
        )
        .filter(Boolean)
    )
  );
  await resolver.fetchPagesByTitles(hintedTitles);

  const resolved = await mapLimit(farms, 3, async (farm, index) => {
    const seed = seedCoords.get(`${farm.country_code}|name|${normalizeText(farm.name)}`);
    const seedBySignature = seedCoords.get(`${farm.country_code}|sig|${signatureText(farm.name)}`);
    if (seed ?? seedBySignature) {
      return {
        ...farm,
        ...(seed ?? seedBySignature),
      };
    }

    let best = null;
    const hintedTitle =
      farm.wikipedia_title ||
      wikipediaTitleHints.get(`${farm.country_code}|name|${normalizeText(farm.name)}`) ||
      wikipediaTitleHints.get(`${farm.country_code}|sig|${signatureText(farm.name)}`) ||
      null;

    if (hintedTitle) {
      best = await resolver.resolveByTitle(farm, hintedTitle).catch(() => null);
    }

    if (!best || best.score < 48) {
      const wikipedia = await resolver.searchWikipedia(farm).catch(() => null);
      if (wikipedia && (!best || wikipedia.score > best.score)) best = wikipedia;
    }

    if (!best || best.score < 48) {
      const wikidata = await resolver.searchWikidata(farm).catch(() => null);
      if (wikidata && (!best || wikidata.score > best.score)) best = wikidata;
    }

    if ((index + 1) % 50 === 0) {
      console.log(`Resolved ${index + 1}/${farms.length}`);
    }

    return {
      ...farm,
      lng: best?.lng ?? farm.lng,
      lat: best?.lat ?? farm.lat,
      source: best?.source ?? "unchanged",
      wikipedia_title: best?.wikipedia_title ?? farm.wikipedia_title ?? null,
      wikidata_id: best?.wikidata_id ?? null,
      score: best?.score ?? 0,
    };
  });

  const outPath = path.join(ROOT, "data", "windfarms", "resolved_locations.json");
  fs.writeFileSync(outPath, JSON.stringify(resolved, null, 2));

  const sourceRows = resolved.filter((row) => row.source !== "unchanged");
  console.log(`Resolved ${sourceRows.length}/${resolved.length} farms`);
  console.log(`Wrote ${outPath}`);

  if (!apply) {
    await client.end();
    return;
  }

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
        "wind_farm_location_refresh",
        "Wikipedia/Wikidata + curated seed",
        "scripts/resolve-wind-farm-locations.mjs",
        sourceRows.length,
        "Restores curated seed centroids and resolves live farm coordinates from Wikipedia/Wikidata",
      ]
    );
    const batchId = batch.rows[0].id;

    for (const row of sourceRows) {
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
              'location_source', $7::text
            )),
          updated_at = now()
        WHERE id = $1
        `,
        [
          row.id,
          row.lng,
          row.lat,
          batchId,
          row.wikipedia_title,
          row.wikidata_id,
          row.source,
        ]
      );
    }

    await client.query(`
      DELETE FROM turbines
      WHERE geometry_quality = 'generated'
        AND wind_farm_id IN (
          SELECT id FROM wind_farms WHERE ingest_batch_id = $1
        )
    `, [batchId]);

    await client.query(`
      UPDATE wind_farms
      SET project_area = NULL
      WHERE ingest_batch_id = $1
    `, [batchId]);

    await client.query(`
      INSERT INTO turbines (wind_farm_id, turbine_index, location, geometry_quality, ingest_batch_id)
      SELECT
        wf.id,
        gs.idx,
        ST_SetSRID(
          ST_MakePoint(
            ST_X(wf.centroid::geometry)
              + (gs.col_i - (gs.n_cols - 1.0) / 2.0)
                * 850.0 / (111320.0 * COS(RADIANS(ST_Y(wf.centroid::geometry)))),
            ST_Y(wf.centroid::geometry)
              + (gs.row_i - (gs.n_rows - 1.0) / 2.0)
                * 850.0 / 111320.0
          ),
          4326
        )::geography,
        'generated',
        $1
      FROM wind_farms wf
      CROSS JOIN LATERAL (
        SELECT
          n - 1 AS idx,
          ((n - 1) % GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::INT, 1)) AS col_i,
          ((n - 1) / GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::INT, 1)) AS row_i,
          GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::NUMERIC, 1.0) AS n_cols,
          GREATEST(CEIL(wf.turbine_count::NUMERIC /
                   GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC)), 1.0)), 1.0) AS n_rows
        FROM generate_series(1, wf.turbine_count) AS n
      ) gs
      WHERE wf.ingest_batch_id = $1
        AND wf.turbine_count BETWEEN 1 AND 180
        AND wf.centroid IS NOT NULL
      ON CONFLICT (wind_farm_id, turbine_index) WHERE turbine_index IS NOT NULL DO NOTHING
    `, [batchId]);

    await client.query(`
      UPDATE wind_farms
      SET
        project_area = ST_Buffer(
          centroid,
          GREATEST(SQRT(COALESCE(capacity_mw, 100)::NUMERIC) * 650.0, 1500.0)
        ),
        updated_at = now()
      WHERE ingest_batch_id = $1
        AND centroid IS NOT NULL
    `, [batchId]);

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

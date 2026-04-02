#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function classifyCoordinateStatus(row) {
  if (row.has_valid_point) return "point";
  if (row.has_city && row.has_country) return "city+country";
  if (row.has_country) return "country-only";
  return "none";
}

function buildIssues(row) {
  const issues = [];
  if (row.linked_wind_farms === 0) issues.push("missing-wind-farm-link");
  if (row.invalid_point_rows > 0) issues.push("invalid-coordinate-row");
  if (row.coordinate_status === "none") issues.push("missing-location-data");
  if (!row.returned_by_api) issues.push("not-returned-by-api");
  if (row.duplicate_name_count > 1) issues.push("duplicate-normalized-name");
  if (row.entity_type === "contractor" && row.epc_role_rows === 0) issues.push("missing-epc-role-link");
  if (row.entity_type === "offtaker" && row.contract_rows === 0) issues.push("missing-contract-link");
  return issues;
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

async function fetchApiCompanyMap(apiBase) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${apiBase}/api/companies?with_location=true`, { signal: controller.signal });
    if (!res.ok) return new Map();
    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    return new Map(rows.map((r) => [String(r.id), String(r.marker_class ?? "")]))
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeout);
  }
}

async function queryRows(client, entityType) {
  const isOfftaker = entityType === "offtaker";
  const sql = `
    WITH location_rollup AS (
      SELECT
        cl.company_id,
        COUNT(*)::int AS location_rows,
        COUNT(*) FILTER (WHERE cl.location_type = 'hq')::int AS hq_rows,
        bool_or(cl.location IS NOT NULL) AS has_point,
        bool_or(
          cl.location IS NOT NULL
          AND abs(ST_X(cl.location::geometry)) <= 180
          AND abs(ST_Y(cl.location::geometry)) <= 90
        ) AS has_valid_point,
        COUNT(*) FILTER (
          WHERE cl.location IS NOT NULL
            AND (
              abs(ST_X(cl.location::geometry)) > 180
              OR abs(ST_Y(cl.location::geometry)) > 90
            )
        )::int AS invalid_point_rows,
        max(nullif(trim(cl.city), '')) AS city,
        max(cl.country_code::text) AS loc_country
      FROM company_locations cl
      GROUP BY cl.company_id
    ),
    offtake_links AS (
      SELECT
        ct.counterparty_company_id AS company_id,
        COUNT(*)::int AS contract_rows,
        COUNT(DISTINCT ct.wind_farm_id)::int AS linked_wind_farms,
        string_agg(DISTINCT lower(ct.contract_type), '|') AS role_or_contract_types
      FROM contracts ct
      WHERE ct.counterparty_company_id IS NOT NULL
      GROUP BY ct.counterparty_company_id
    ),
    epc_links AS (
      SELECT
        e.company_id,
        COUNT(*)::int AS epc_role_rows,
        COUNT(DISTINCT e.wind_farm_id)::int AS linked_wind_farms,
        string_agg(DISTINCT lower(e.role_type), '|') AS role_or_contract_types,
        string_agg(DISTINCT lower(e.package_code), '|') AS package_codes
      FROM wind_farm_epc_company_roles e
      WHERE e.company_id IS NOT NULL
        AND e.is_current = true
      GROUP BY e.company_id
    ),
    candidates AS (
      SELECT
        c.id,
        c.name,
        c.normalized_name,
        c.actor_type,
        c.hq_country_code::text AS hq_country_code,
        COALESCE(lr.city, null) AS city,
        COALESCE(lr.loc_country, c.hq_country_code::text) AS country,
        COALESCE(lr.location_rows, 0) AS location_rows,
        COALESCE(lr.hq_rows, 0) AS hq_rows,
        COALESCE(lr.has_point, false) AS has_point,
        COALESCE(lr.has_valid_point, false) AS has_valid_point,
        COALESCE(lr.invalid_point_rows, 0) AS invalid_point_rows,
        COALESCE(ol.contract_rows, 0) AS contract_rows,
        COALESCE(el.epc_role_rows, 0) AS epc_role_rows,
        COALESCE(
          ${isOfftaker ? "ol.linked_wind_farms" : "el.linked_wind_farms"},
          0
        ) AS linked_wind_farms,
        COALESCE(
          ${isOfftaker ? "ol.role_or_contract_types" : "el.role_or_contract_types"},
          ''
        ) AS role_or_contract_types,
        COALESCE(
          ${isOfftaker ? "''" : "el.package_codes"},
          ''
        ) AS package_codes,
        CASE
          WHEN lower(c.actor_type) = 'offtaker' THEN 'offtaker'
          WHEN COALESCE(ol.contract_rows, 0) > 0 THEN 'offtaker'
          WHEN COALESCE(el.epc_role_rows, 0) > 0 THEN 'contractor'
          WHEN lower(c.actor_type) = 'oem' THEN 'contractor'
          ELSE 'company'
        END AS inferred_class,
        COUNT(*) OVER (PARTITION BY c.normalized_name) AS duplicate_name_count
      FROM companies c
      LEFT JOIN location_rollup lr ON lr.company_id = c.id
      LEFT JOIN offtake_links ol ON ol.company_id = c.id
      LEFT JOIN epc_links el ON el.company_id = c.id
      WHERE ${isOfftaker
        ? "(lower(c.actor_type) = 'offtaker' OR ol.company_id IS NOT NULL)"
        : "(el.company_id IS NOT NULL OR lower(c.actor_type) = 'oem')"}
    )
    SELECT *
    FROM candidates
    ORDER BY name ASC
  `;

  const { rows } = await client.query(sql);
  return rows.map((r) => {
    const hasCity = Boolean(r.city && String(r.city).trim() !== "");
    const hasCountry = Boolean(r.country && String(r.country).trim() !== "");
    const coordinateStatus = classifyCoordinateStatus({
      has_valid_point: Boolean(r.has_valid_point),
      has_city: hasCity,
      has_country: hasCountry,
    });

    return {
      company_id: String(r.id),
      name: String(r.name),
      entity_type: entityType,
      actor_type: String(r.actor_type ?? ""),
      city: r.city,
      country: r.country,
      hq_country_code: r.hq_country_code,
      linked_wind_farms: Number(r.linked_wind_farms ?? 0),
      contract_rows: Number(r.contract_rows ?? 0),
      epc_role_rows: Number(r.epc_role_rows ?? 0),
      role_or_contract_types: String(r.role_or_contract_types ?? ""),
      package_codes: String(r.package_codes ?? ""),
      has_point: Boolean(r.has_point),
      has_valid_point: Boolean(r.has_valid_point),
      invalid_point_rows: Number(r.invalid_point_rows ?? 0),
      location_rows: Number(r.location_rows ?? 0),
      hq_rows: Number(r.hq_rows ?? 0),
      has_city: hasCity,
      has_country: hasCountry,
      coordinate_status: coordinateStatus,
      inferred_class: String(r.inferred_class),
      duplicate_name_count: Number(r.duplicate_name_count ?? 1),
    };
  });
}

function summarize(rows) {
  const total = rows.length;
  const linked = rows.filter((r) => r.linked_wind_farms > 0).length;
  const unlinked = total - linked;
  const withPoint = rows.filter((r) => r.has_valid_point).length;
  const cityCountryOnly = rows.filter((r) => !r.has_valid_point && r.has_city && r.has_country).length;
  const countryOnly = rows.filter((r) => !r.has_valid_point && !r.has_city && r.has_country).length;
  const none = rows.filter((r) => !r.has_valid_point && !r.has_city && !r.has_country).length;
  const mapReadyCurrent = rows.filter((r) => r.map_ready_current).length;
  const mapReadyWithCityGeocode = rows.filter((r) => r.map_ready_city_geocode).length;

  return {
    total,
    linked,
    unlinked,
    locationCoverage: {
      point: withPoint,
      city_country_only: cityCountryOnly,
      country_only: countryOnly,
      none,
      invalid_coordinate_rows: rows.reduce((s, r) => s + r.invalid_point_rows, 0),
    },
    mapReady: {
      current: mapReadyCurrent,
      current_pct: pct(mapReadyCurrent, total),
      city_geocode_path: mapReadyWithCityGeocode,
      city_geocode_path_pct: pct(mapReadyWithCityGeocode, total),
    },
  };
}

function topIssues(rows) {
  const counts = new Map();
  for (const r of rows) {
    for (const i of r.issues) {
      counts.set(i, (counts.get(i) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([issue, count]) => ({ issue, count }));
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const args = parseArgs(process.argv.slice(2));
  const apiBase = args["api-base"] ?? "http://localhost:3000";

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const generatedAt = new Date().toISOString();
    const stamp = generatedAt.replace(/[:.]/g, "-");

    const [offtakersRaw, contractorsRaw, apiMap] = await Promise.all([
      queryRows(client, "offtaker"),
      queryRows(client, "contractor"),
      fetchApiCompanyMap(apiBase),
    ]);

    const withMapFlags = (rows, expectedMarkerClass) => rows.map((r) => {
      const apiMarker = apiMap.get(r.company_id) ?? null;
      const returnedByApi = apiMarker !== null;
      const mapReadyCurrent = r.linked_wind_farms > 0 && (r.has_valid_point || returnedByApi);
      const mapReadyCityGeocode = mapReadyCurrent || (r.linked_wind_farms > 0 && r.has_city && r.has_country);
      const row = {
        ...r,
        api_marker_class: apiMarker,
        returned_by_api: returnedByApi,
        marker_class_matches_expectation: apiMarker == null ? false : apiMarker === expectedMarkerClass,
        map_ready_current: mapReadyCurrent,
        map_ready_city_geocode: mapReadyCityGeocode,
      };
      row.issues = buildIssues(row);
      return row;
    });

    const offtakers = withMapFlags(offtakersRaw, "offtaker");
    const contractors = withMapFlags(contractorsRaw, "epc");

    const contractorRoleBreakdownResult = await client.query(
      `
      SELECT lower(role_type) AS role_type, COUNT(*)::int AS count
      FROM wind_farm_epc_company_roles
      WHERE is_current = true
      GROUP BY lower(role_type)
      ORDER BY COUNT(*) DESC, lower(role_type)
      `
    );

    const contractorPackageBreakdownResult = await client.query(
      `
      SELECT lower(package_code) AS package_code, COUNT(*)::int AS count
      FROM wind_farm_epc_company_roles
      WHERE is_current = true
      GROUP BY lower(package_code)
      ORDER BY COUNT(*) DESC, lower(package_code)
      `
    );

    const summary = {
      generatedAt,
      apiBase,
      offtakers: summarize(offtakers),
      contractors: summarize(contractors),
      contractorRoleBreakdown: contractorRoleBreakdownResult.rows,
      contractorPackageBreakdown: contractorPackageBreakdownResult.rows,
      mapApiCoverage: {
        offtakers_returned_by_api: offtakers.filter((r) => r.returned_by_api).length,
        contractors_returned_by_api: contractors.filter((r) => r.returned_by_api).length,
      },
      topIssues: {
        offtakers: topIssues(offtakers),
        contractors: topIssues(contractors),
      },
    };

    const outDir = path.join(ROOT, "data", "qa");
    ensureDir(outDir);

    const jsonStamped = path.join(outDir, `entity-map-readiness-${stamp}.json`);
    const jsonLatest = path.join(outDir, "entity-map-readiness-latest.json");

    const offtakerCsvStamped = path.join(outDir, `entity-map-readiness-offtakers-${stamp}.csv`);
    const offtakerCsvLatest = path.join(outDir, "entity-map-readiness-offtakers-latest.csv");

    const contractorCsvStamped = path.join(outDir, `entity-map-readiness-contractors-${stamp}.csv`);
    const contractorCsvLatest = path.join(outDir, "entity-map-readiness-contractors-latest.csv");

    fs.writeFileSync(jsonStamped, JSON.stringify({ summary, offtakers, contractors }, null, 2));
    fs.writeFileSync(jsonLatest, JSON.stringify({ summary, offtakers, contractors }, null, 2));

    const columns = [
      "company_id",
      "name",
      "entity_type",
      "actor_type",
      "city",
      "country",
      "coordinate_status",
      "has_valid_point",
      "linked_wind_farms",
      "contract_rows",
      "epc_role_rows",
      "role_or_contract_types",
      "package_codes",
      "returned_by_api",
      "api_marker_class",
      "map_ready_current",
      "map_ready_city_geocode",
      "issues",
    ];

    const offtakerRows = offtakers.map((r) => ({ ...r, issues: r.issues.join(";") }));
    const contractorRows = contractors.map((r) => ({ ...r, issues: r.issues.join(";") }));

    fs.writeFileSync(offtakerCsvStamped, toCsv(offtakerRows, columns));
    fs.writeFileSync(offtakerCsvLatest, toCsv(offtakerRows, columns));

    fs.writeFileSync(contractorCsvStamped, toCsv(contractorRows, columns));
    fs.writeFileSync(contractorCsvLatest, toCsv(contractorRows, columns));

    console.log(JSON.stringify({
      summary,
      outputs: {
        json_latest: path.relative(ROOT, jsonLatest),
        offtaker_csv_latest: path.relative(ROOT, offtakerCsvLatest),
        contractor_csv_latest: path.relative(ROOT, contractorCsvLatest),
      },
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

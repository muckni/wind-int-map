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

async function scalar(client, sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : null;
}

async function rows(client, sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function scoreSeverity(v, warningThreshold, criticalThreshold) {
  if (v >= criticalThreshold) return "critical";
  if (v >= warningThreshold) return "warning";
  return "ok";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const dbName = await scalar(client, "SELECT current_database()");
    const generatedAt = new Date().toISOString();

    const tableCountsRaw = await rows(
      client,
      `
      SELECT table_name, (xpath('/row/cnt/text()', query_to_xml(format('SELECT COUNT(*) AS cnt FROM public.%I', table_name), true, true, '')))[1]::text::int AS row_count
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN (
          'wind_farms','companies','wind_farm_ownership','contracts',
          'wind_farm_epc_packages','wind_farm_epc_company_roles',
          'turbines','company_locations','wind_farm_sources','contract_sources','sources'
        )
      ORDER BY table_name
      `
    );

    const tableCounts = Object.fromEntries(tableCountsRaw.map((r) => [r.table_name, Number(r.row_count)]));

    const duplicateWindFarms = await rows(
      client,
      `
      SELECT country_code, normalized_name, COUNT(*)::int AS duplicate_count
      FROM wind_farms
      GROUP BY country_code, normalized_name
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, country_code, normalized_name
      LIMIT 25
      `
    );

    const duplicateWindFarmExcess = Number(
      await scalar(
        client,
        `
        SELECT COALESCE(SUM(c - 1), 0)::int
        FROM (
          SELECT COUNT(*)::int AS c
          FROM wind_farms
          GROUP BY country_code, normalized_name
          HAVING COUNT(*) > 1
        ) t
        `
      )
    );

    const windFarmCore = (await rows(
      client,
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE name IS NULL OR btrim(name) = '')::int AS missing_name,
        COUNT(*) FILTER (WHERE country_code IS NULL OR country_code !~ '^[A-Z]{2}$')::int AS invalid_country,
        COUNT(*) FILTER (WHERE status_current IS NULL OR btrim(status_current) = '')::int AS missing_status,
        COUNT(*) FILTER (WHERE capacity_mw IS NULL)::int AS missing_capacity,
        COUNT(*) FILTER (WHERE capacity_mw IS NOT NULL AND capacity_mw <= 0)::int AS non_positive_capacity,
        COUNT(*) FILTER (WHERE capacity_mw IS NOT NULL AND capacity_mw > 4000)::int AS very_high_capacity,
        COUNT(*) FILTER (WHERE lower(status_current)='operational' AND capacity_mw IS NULL)::int AS operational_missing_capacity
      FROM wind_farms
      `
    ))[0];

    const geometry = (await rows(
      client,
      `
      SELECT
        COUNT(*)::int AS total_wind_farms,
        COUNT(*) FILTER (WHERE centroid IS NULL)::int AS wf_missing_centroid,
        COUNT(*) FILTER (WHERE centroid IS NOT NULL AND (ABS(ST_Y(centroid::geometry)) > 90 OR ABS(ST_X(centroid::geometry)) > 180))::int AS wf_bad_centroid_bounds,
        COUNT(*) FILTER (WHERE project_area IS NULL)::int AS wf_missing_project_area,
        COUNT(*) FILTER (WHERE project_area IS NOT NULL AND ST_IsEmpty(project_area::geometry))::int AS wf_empty_project_area,
        COUNT(*) FILTER (WHERE project_area IS NOT NULL AND NOT ST_IsValid(project_area::geometry))::int AS wf_invalid_project_area,
        (SELECT COUNT(*)::int FROM turbines) AS total_turbines,
        (SELECT COUNT(*)::int FROM turbines WHERE location IS NULL) AS turbines_missing_location,
        (SELECT COUNT(*)::int FROM turbines WHERE location IS NOT NULL AND (ABS(ST_Y(location::geometry)) > 90 OR ABS(ST_X(location::geometry)) > 180)) AS turbines_bad_bounds,
        (SELECT COUNT(*)::int FROM company_locations) AS total_company_locations,
        (SELECT COUNT(*)::int FROM company_locations WHERE location IS NULL) AS company_locations_missing_location,
        (SELECT COUNT(*)::int FROM company_locations WHERE location IS NOT NULL AND (ABS(ST_Y(location::geometry)) > 90 OR ABS(ST_X(location::geometry)) > 180)) AS company_locations_bad_bounds
      FROM wind_farms
      `
    ))[0];

    const duplicateCompanies = await rows(
      client,
      `
      SELECT normalized_name, COUNT(*)::int AS duplicate_count
      FROM companies
      GROUP BY normalized_name
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, normalized_name
      LIMIT 25
      `
    );

    const relationships = (await rows(
      client,
      `
      SELECT
        (SELECT COUNT(*)::int FROM wind_farms wf
         LEFT JOIN companies c ON c.id = wf.developer_company_id
         WHERE wf.developer_company_id IS NOT NULL AND c.id IS NULL) AS missing_developer_links,

        (SELECT COUNT(*)::int
         FROM (
           SELECT wind_farm_id, company_id, COALESCE(role_type,'<null>') AS role_type, COUNT(*)
           FROM wind_farm_ownership
           GROUP BY wind_farm_id, company_id, COALESCE(role_type,'<null>')
           HAVING COUNT(*) > 1
         ) d) AS duplicate_ownership_links,

        (SELECT COUNT(*)::int
         FROM (
           SELECT wind_farm_id, COALESCE(counterparty_company_id::text,'<null>') AS cp, LOWER(contract_type) AS contract_type, COUNT(*)
           FROM contracts
           GROUP BY wind_farm_id, COALESCE(counterparty_company_id::text,'<null>'), LOWER(contract_type)
           HAVING COUNT(*) > 1
         ) d) AS duplicate_contract_links
      `
    ))[0];

    const epcPackageCoverage = (await rows(
      client,
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE package_code IS NULL OR btrim(package_code)='')::int AS missing_package_code,
        COUNT(*) FILTER (WHERE package_status IS NULL OR btrim(package_status)='')::int AS missing_package_status,
        COUNT(*) FILTER (WHERE confidence IS NULL OR btrim(confidence)='')::int AS missing_confidence,
        COUNT(*) FILTER (WHERE source_url IS NULL OR btrim(source_url)='')::int AS missing_source_url,
        COUNT(*) FILTER (WHERE source_title IS NULL OR btrim(source_title)='')::int AS missing_source_title
      FROM wind_farm_epc_packages
      `
    ))[0];

    const epcRoleCoverage = (await rows(
      client,
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE role_type IS NULL OR btrim(role_type)='')::int AS missing_role_type,
        COUNT(*) FILTER (WHERE confidence IS NULL OR btrim(confidence)='')::int AS missing_confidence,
        COUNT(*) FILTER (WHERE source_url IS NULL OR btrim(source_url)='')::int AS missing_source_url,
        COUNT(*) FILTER (WHERE source_title IS NULL OR btrim(source_title)='')::int AS missing_source_title
      FROM wind_farm_epc_company_roles
      `
    ))[0];

    const contractCoverage = (await rows(
      client,
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE counterparty_company_id IS NULL)::int AS missing_counterparty,
        COUNT(*) FILTER (WHERE source_url IS NULL OR btrim(source_url)='')::int AS missing_source_url,
        COUNT(*) FILTER (WHERE source_title IS NULL OR btrim(source_title)='')::int AS missing_source_title,
        COUNT(*) FILTER (WHERE confidence IS NULL OR btrim(confidence)='unknown')::int AS unknown_confidence
      FROM contracts
      `
    ))[0];

    const sourceCoverage = (await rows(
      client,
      `
      SELECT
        (SELECT COUNT(*)::int FROM wind_farms wf WHERE NOT EXISTS (SELECT 1 FROM wind_farm_sources wfs WHERE wfs.wind_farm_id = wf.id)) AS wind_farms_without_source_link,
        (SELECT COUNT(*)::int FROM contracts c WHERE NOT EXISTS (SELECT 1 FROM contract_sources cs WHERE cs.contract_id = c.id) AND (c.source_url IS NULL OR btrim(c.source_url)='')) AS contracts_without_source,
        (SELECT COUNT(*)::int FROM wind_farm_ownership wfo WHERE (wfo.source_url IS NULL OR btrim(wfo.source_url)='') AND (wfo.source_title IS NULL OR btrim(wfo.source_title)='')) AS ownership_without_source,
        (SELECT COUNT(*)::int FROM wind_farm_epc_packages p WHERE (p.source_url IS NULL OR btrim(p.source_url)='')) AS epc_packages_without_source,
        (SELECT COUNT(*)::int FROM wind_farm_epc_company_roles r WHERE (r.source_url IS NULL OR btrim(r.source_url)='')) AS epc_roles_without_source
      `
    ))[0];

    const maxCapacities = await rows(
      client,
      `
      SELECT name, country_code, status_current, capacity_mw
      FROM wind_farms
      WHERE capacity_mw IS NOT NULL
      ORDER BY capacity_mw DESC
      LIMIT 10
      `
    );

    const totalWindFarms = Number(windFarmCore.total || 0);
    const totalCompanies = Number(tableCounts.companies || 0);

    const wfMissingCoreRate = pct(
      Number(windFarmCore.missing_name) + Number(windFarmCore.invalid_country) + Number(windFarmCore.missing_status),
      totalWindFarms
    );
    const wfGeomGapRate = pct(Number(geometry.wf_missing_project_area) + Number(geometry.wf_missing_centroid), totalWindFarms);
    const companyDupRate = pct(duplicateCompanies.length, totalCompanies);

    const validation = {
      generatedAt,
      database: dbName,
      tableCounts,
      checks: {
        duplicates: {
          windFarms: {
            duplicateGroups: duplicateWindFarms.length,
            duplicateExcessRows: duplicateWindFarmExcess,
            samples: duplicateWindFarms,
            severity: scoreSeverity(duplicateWindFarmExcess, 1, 5),
          },
          companies: {
            duplicateGroups: duplicateCompanies.length,
            samples: duplicateCompanies,
            severity: scoreSeverity(duplicateCompanies.length, 1, 4),
          },
        },
        windFarmCore,
        geometry,
        relationships,
        coverage: {
          epcPackages: {
            ...epcPackageCoverage,
            pctMissingSourceUrl: pct(Number(epcPackageCoverage.missing_source_url), Number(epcPackageCoverage.total)),
            pctMissingSourceTitle: pct(Number(epcPackageCoverage.missing_source_title), Number(epcPackageCoverage.total)),
          },
          epcRoles: {
            ...epcRoleCoverage,
            pctMissingSourceUrl: pct(Number(epcRoleCoverage.missing_source_url), Number(epcRoleCoverage.total)),
            pctMissingSourceTitle: pct(Number(epcRoleCoverage.missing_source_title), Number(epcRoleCoverage.total)),
          },
          contracts: {
            ...contractCoverage,
            pctMissingCounterparty: pct(Number(contractCoverage.missing_counterparty), Number(contractCoverage.total)),
            pctMissingSourceUrl: pct(Number(contractCoverage.missing_source_url), Number(contractCoverage.total)),
            pctUnknownConfidence: pct(Number(contractCoverage.unknown_confidence), Number(contractCoverage.total)),
          },
        },
        sourceCoverage,
        suspiciousCapacityTop10: maxCapacities,
      },
      assessment: {
        usableAsIs: [
          "wind_farms base identifiers and core map geometry",
          "companies base entity table",
          "turbines and company_locations spatial points",
        ],
        needsCleanupBeforeEnrichment: [
          "provenance coverage in wind_farm_sources/contracts/EPC tables",
          "duplicate companies that bypass normalized_name uniqueness via punctuation/format variants",
          "contract and EPC confidence/source completeness",
        ],
        canonicalBase: [
          "wind_farms (id + country_code + normalized_name)",
          "companies (id + normalized_name)",
          "wind_farm_ownership for company-to-project linkage",
        ],
        treatCarefully: [
          "route-to-market and offtaker interpretation when contract source metadata is missing",
          "EPC role granularity where package_code/role_type may be incomplete",
          "very high capacity records flagged for manual source verification",
        ],
      },
      healthSignals: {
        windFarmMissingCoreRatePct: wfMissingCoreRate,
        windFarmGeometryGapRatePct: wfGeomGapRate,
        companyDuplicateGroupRatePct: companyDupRate,
      },
    };

    const outDir = path.join(ROOT, "data", "qa");
    ensureDir(outDir);
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const jsonPath = path.join(outDir, `validation-${stamp}.json`);
    const latestJsonPath = path.join(outDir, "validation-latest.json");
    fs.writeFileSync(jsonPath, JSON.stringify(validation, null, 2));
    fs.writeFileSync(latestJsonPath, JSON.stringify(validation, null, 2));

    const md = [
      `# Data Validation Report`,
      ``,
      `Generated: ${generatedAt}`,
      `Database: ${dbName}`,
      ``,
      `## Table counts`,
      ...Object.entries(tableCounts).map(([k, v]) => `- ${k}: ${v}`),
      ``,
      `## Major checks`,
      `- Wind farm duplicate excess rows: ${duplicateWindFarmExcess}`,
      `- Duplicate company groups: ${duplicateCompanies.length}`,
      `- Wind farms missing centroid: ${windFarmCore.total ? geometry.wf_missing_centroid : 0}/${windFarmCore.total}`,
      `- Wind farms missing project_area: ${geometry.wf_missing_project_area}/${windFarmCore.total}`,
      `- Wind farms with non-positive capacity: ${windFarmCore.non_positive_capacity}`,
      `- Wind farms with very high capacity (>4000 MW): ${windFarmCore.very_high_capacity}`,
      `- Ownership duplicate links: ${relationships.duplicate_ownership_links}`,
      `- Contract duplicate links: ${relationships.duplicate_contract_links}`,
      `- Contracts missing source: ${sourceCoverage.contracts_without_source}/${tableCounts.contracts ?? 0}`,
      `- EPC package rows missing source_url: ${epcPackageCoverage.missing_source_url}/${epcPackageCoverage.total}`,
      `- EPC role rows missing source_url: ${epcRoleCoverage.missing_source_url}/${epcRoleCoverage.total}`,
      ``,
      `## Canonical base`,
      ...validation.assessment.canonicalBase.map((line) => `- ${line}`),
      ``,
      `## Treat carefully`,
      ...validation.assessment.treatCarefully.map((line) => `- ${line}`),
      ``,
    ].join("\n");

    const mdPath = path.join(outDir, "validation-latest.md");
    fs.writeFileSync(mdPath, md);

    console.log(`Validation report written:`);
    console.log(`- ${latestJsonPath}`);
    console.log(`- ${mdPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

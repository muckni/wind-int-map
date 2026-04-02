#!/usr/bin/env node
import path from "node:path";
import { Client } from "pg";
import {
  ROOT,
  loadEnvFile,
  parseArgs,
  writeCsvOutputs,
  writeJsonOutputs,
} from "./shared.mjs";

async function deleteSafeOwnershipDuplicates(client) {
  const { rows } = await client.query(
    `
    WITH ranked_rows AS (
      SELECT
        wfo.*,
        ROW_NUMBER() OVER (
          PARTITION BY
            wfo.wind_farm_id,
            wfo.company_id,
            COALESCE(wfo.equity_share_pct, -1::numeric),
            COALESCE(wfo.role_type, ''),
            COALESCE(wfo.valid_from, DATE '1900-01-01'),
            COALESCE(wfo.valid_to, DATE '9999-12-31'),
            wfo.is_current
          ORDER BY
            (
              CASE WHEN NULLIF(BTRIM(COALESCE(wfo.source_url, '')), '') IS NOT NULL THEN 4 ELSE 0 END
              + CASE WHEN NULLIF(BTRIM(COALESCE(wfo.source_title, '')), '') IS NOT NULL THEN 2 ELSE 0 END
              + CASE
                  WHEN lower(COALESCE(wfo.confidence, 'unknown')) = 'confirmed' THEN 2
                  WHEN lower(COALESCE(wfo.confidence, 'unknown')) = 'inferred' THEN 1
                  ELSE 0
                END
            ) DESC,
            wfo.created_at,
            wfo.id
        ) AS row_rank,
        COUNT(*) OVER (
          PARTITION BY
            wfo.wind_farm_id,
            wfo.company_id,
            COALESCE(wfo.equity_share_pct, -1::numeric),
            COALESCE(wfo.role_type, ''),
            COALESCE(wfo.valid_from, DATE '1900-01-01'),
            COALESCE(wfo.valid_to, DATE '9999-12-31'),
            wfo.is_current
        ) AS row_count
      FROM wind_farm_ownership wfo
    ),
    rows_to_delete AS (
      SELECT id
      FROM ranked_rows
      WHERE row_count > 1
        AND row_rank > 1
    )
    DELETE FROM wind_farm_ownership wfo
    USING rows_to_delete rtd
    WHERE wfo.id = rtd.id
    RETURNING wfo.id, wfo.wind_farm_id, wfo.company_id, wfo.role_type, wfo.equity_share_pct, wfo.source_title, wfo.source_url
    `
  );
  return rows;
}

async function collectQa(client) {
  const exactDuplicates = await client.query(
    `
    SELECT
      wf.name AS wind_farm_name,
      c.name AS company_name,
      COALESCE(wfo.role_type, 'unknown') AS role_type,
      COUNT(*)::int AS duplicate_rows
    FROM wind_farm_ownership wfo
    JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
    JOIN companies c ON c.id = wfo.company_id
    GROUP BY
      wf.name,
      c.name,
      COALESCE(wfo.role_type, 'unknown'),
      COALESCE(wfo.equity_share_pct, -1::numeric),
      COALESCE(wfo.valid_from, DATE '1900-01-01'),
      COALESCE(wfo.valid_to, DATE '9999-12-31'),
      wfo.is_current,
      COALESCE(wfo.data_quality, ''),
      COALESCE(wfo.confidence, ''),
      COALESCE(wfo.source_url, ''),
      COALESCE(wfo.source_title, '')
    HAVING COUNT(*) > 1
    ORDER BY duplicate_rows DESC, wf.name, c.name
    `
  );

  const conflictingCurrent = await client.query(
    `
    SELECT
      wf.name AS wind_farm_name,
      c.name AS company_name,
      COALESCE(wfo.role_type, 'unknown') AS role_type,
      COUNT(*)::int AS current_rows,
      STRING_AGG(DISTINCT COALESCE(wfo.equity_share_pct::text, 'null'), ', ' ORDER BY COALESCE(wfo.equity_share_pct::text, 'null')) AS percentages
    FROM wind_farm_ownership wfo
    JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
    JOIN companies c ON c.id = wfo.company_id
    WHERE wfo.is_current = true
    GROUP BY wf.name, c.name, COALESCE(wfo.role_type, 'unknown')
    HAVING COUNT(*) > 1
    ORDER BY current_rows DESC, wf.name, c.name
    `
  );

  const percentageTotals = await client.query(
    `
    SELECT
      wf.name AS wind_farm_name,
      ROUND(SUM(wfo.equity_share_pct)::numeric, 2) AS current_pct_total,
      COUNT(*)::int AS current_rows,
      STRING_AGG(
        c.name || ' (' || COALESCE(wfo.role_type, 'unknown') || ': ' || COALESCE(wfo.equity_share_pct::text, 'null') || '%)',
        '; ' ORDER BY c.name
      ) AS breakdown
    FROM wind_farm_ownership wfo
    JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
    JOIN companies c ON c.id = wfo.company_id
    WHERE wfo.is_current = true
      AND wfo.equity_share_pct IS NOT NULL
    GROUP BY wf.name
    HAVING SUM(wfo.equity_share_pct) > 100 OR SUM(wfo.equity_share_pct) < 100
    ORDER BY current_pct_total DESC, wf.name
    `
  );

  const missingCompanies = await client.query(
    `
    SELECT COUNT(*)::int AS count
    FROM wind_farm_ownership wfo
    LEFT JOIN companies c ON c.id = wfo.company_id
    WHERE c.id IS NULL
    `
  );

  const overlappingPeriods = await client.query(
    `
    SELECT DISTINCT
      wf.name AS wind_farm_name,
      c.name AS company_name,
      COALESCE(a.role_type, 'unknown') AS role_type
    FROM wind_farm_ownership a
    JOIN wind_farm_ownership b
      ON a.wind_farm_id = b.wind_farm_id
     AND a.company_id = b.company_id
     AND COALESCE(a.role_type, '') = COALESCE(b.role_type, '')
     AND a.id < b.id
     AND daterange(COALESCE(a.valid_from, DATE '1900-01-01'), COALESCE(a.valid_to, DATE '9999-12-31'), '[]')
         && daterange(COALESCE(b.valid_from, DATE '1900-01-01'), COALESCE(b.valid_to, DATE '9999-12-31'), '[]')
    JOIN wind_farms wf ON wf.id = a.wind_farm_id
    JOIN companies c ON c.id = a.company_id
    ORDER BY wf.name, c.name
    `
  );

  const ambiguousRoles = await client.query(
    `
    SELECT
      wf.name AS wind_farm_name,
      c.name AS company_name,
      STRING_AGG(DISTINCT COALESCE(wfo.role_type, 'unknown'), ', ' ORDER BY COALESCE(wfo.role_type, 'unknown')) AS role_types
    FROM wind_farm_ownership wfo
    JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
    JOIN companies c ON c.id = wfo.company_id
    WHERE wfo.is_current = true
      AND lower(COALESCE(wfo.role_type, 'unknown')) IN ('developer', 'operator', 'owner', 'equity partner')
    GROUP BY wf.name, c.name
    HAVING COUNT(DISTINCT lower(COALESCE(wfo.role_type, 'unknown'))) > 1
    ORDER BY wf.name, c.name
    `
  );

  const linkedMergedFarms = await client.query(
    `
    SELECT COUNT(*)::int AS count
    FROM wind_farm_ownership wfo
    JOIN wind_farm_merge_log ml ON ml.merged_wind_farm_id = wfo.wind_farm_id
    `
  );

  return {
    exact_duplicates_remaining: exactDuplicates.rows,
    conflicting_current_rows: conflictingCurrent.rows,
    percentage_totals_flagged: percentageTotals.rows,
    missing_company_refs: Number(missingCompanies.rows[0]?.count ?? 0),
    overlapping_periods: overlappingPeriods.rows,
    ambiguous_role_classification: ambiguousRoles.rows,
    ownership_rows_linked_to_merged_farms: Number(linkedMergedFarms.rows[0]?.count ?? 0),
  };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    let deleted = [];
    if (!dryRun) {
      deleted = await deleteSafeOwnershipDuplicates(client);
    }

    const qa = await collectQa(client);
    const payload = {
      generated_at: new Date().toISOString(),
      dry_run: dryRun,
      deleted_safe_duplicate_rows: deleted,
      deleted_safe_duplicate_count: deleted.length,
      ...qa,
    };

    writeJsonOutputs("ownership-qa-report", payload);
    writeCsvOutputs(
      "ownership-qa-flagged",
      [
        ...qa.conflicting_current_rows.map((row) => ({
          issue_type: "conflicting-current-rows",
          wind_farm_name: row.wind_farm_name,
          company_name: row.company_name,
          details: `${row.role_type} (${row.current_rows} rows; ${row.percentages})`,
        })),
        ...qa.percentage_totals_flagged.map((row) => ({
          issue_type: "percentage-total",
          wind_farm_name: row.wind_farm_name,
          company_name: "",
          details: `${row.current_pct_total}% :: ${row.breakdown}`,
        })),
        ...qa.overlapping_periods.map((row) => ({
          issue_type: "overlapping-period",
          wind_farm_name: row.wind_farm_name,
          company_name: row.company_name,
          details: row.role_type,
        })),
        ...qa.ambiguous_role_classification.map((row) => ({
          issue_type: "ambiguous-role-classification",
          wind_farm_name: row.wind_farm_name,
          company_name: row.company_name,
          details: row.role_types,
        })),
      ],
      ["issue_type", "wind_farm_name", "company_name", "details"]
    );

    console.log(JSON.stringify({
      deleted_safe_duplicate_count: deleted.length,
      conflicting_current_rows: qa.conflicting_current_rows.length,
      percentage_totals_flagged: qa.percentage_totals_flagged.length,
      missing_company_refs: qa.missing_company_refs,
      overlapping_periods: qa.overlapping_periods.length,
      ownership_rows_linked_to_merged_farms: qa.ownership_rows_linked_to_merged_farms,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

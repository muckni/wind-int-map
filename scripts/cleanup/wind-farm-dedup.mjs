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

const AUTO_MERGE_RULES = [
  { country_code: "DE", canonical_name: "Baltic 1", duplicate_name: "EnBW Baltic 1", reason: "developer-prefix alias", confidence: "high" },
  { country_code: "DE", canonical_name: "Baltic 2", duplicate_name: "EnBW Baltic 2", reason: "developer-prefix alias", confidence: "high" },
  { country_code: "DE", canonical_name: "EnBW Hohe See", duplicate_name: "Hohe See", reason: "generic-name duplicate with weaker geometry", confidence: "high" },
  { country_code: "DE", canonical_name: "Borkum Riffgrund 1", duplicate_name: "Borkum Riffgrund I", reason: "roman numeral alias", confidence: "high" },
  { country_code: "DE", canonical_name: "Borkum Riffgrund 2", duplicate_name: "Borkum Riffgrund II", reason: "roman numeral alias", confidence: "high" },
  { country_code: "DK", canonical_name: "Horns Rev 1", duplicate_name: "Horns Rev I", reason: "roman numeral alias", confidence: "high" },
  { country_code: "DK", canonical_name: "Horns Rev 2", duplicate_name: "Horns Rev II", reason: "roman numeral alias", confidence: "high" },
  { country_code: "DK", canonical_name: "Horns Rev 3", duplicate_name: "Horns Rev III", reason: "roman numeral alias", confidence: "high" },
  { country_code: "DK", canonical_name: "Middelgrunden", duplicate_name: "Middelgrunden wind farm", reason: "descriptive suffix alias", confidence: "high" },
  { country_code: "DK", canonical_name: "Samsø Offshore", duplicate_name: "Samsø", reason: "short-name alias", confidence: "high" },
  { country_code: "FR", canonical_name: "Saint-Nazaire", duplicate_name: "Saint-Nazaire Offshore Wind Farm", reason: "descriptive suffix alias", confidence: "high" },
  { country_code: "GB", canonical_name: "Hornsea One", duplicate_name: "Hornsea Project One", reason: "project-prefix alias", confidence: "high" },
  { country_code: "GB", canonical_name: "Hornsea Two", duplicate_name: "Hornsea Project Two", reason: "project-prefix alias", confidence: "high" },
  { country_code: "GB", canonical_name: "Hornsea Three", duplicate_name: "Hornsea Project Three", reason: "project-prefix alias", confidence: "high" },
  { country_code: "GB", canonical_name: "Hornsea Four", duplicate_name: "Hornsea Project Four", reason: "project-prefix alias", confidence: "high" },
  { country_code: "NL", canonical_name: "Gemini", duplicate_name: "Gemini Wind Farm", reason: "descriptive suffix alias", confidence: "high" },
  { country_code: "NL", canonical_name: "Borssele I & II", duplicate_name: "Borssele I–II", reason: "punctuation alias", confidence: "high" },
  { country_code: "NL", canonical_name: "Borssele III & IV", duplicate_name: "Borssele III–IV", reason: "punctuation alias", confidence: "high" },
];

const GEOMETRY_RANK = {
  verified: 3,
  approximated: 2,
  generated: 1,
  "": 0,
};

const DATA_QUALITY_RANK = {
  verified: 3,
  unverified: 2,
  example: 1,
  "": 0,
};

function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\biv\b/g, "4")
    .replace(/\bi\b/g, "1")
    .replace(/\bwind farm\b/g, "")
    .replace(/\boffshore\b/g, "")
    .replace(/\bproject\b/g, "")
    .replace(/\benbw\b/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function geometryRank(value) {
  return GEOMETRY_RANK[String(value ?? "").toLowerCase()] ?? 0;
}

function dataQualityRank(value) {
  return DATA_QUALITY_RANK[String(value ?? "").toLowerCase()] ?? 0;
}

function filled(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "" && value.trim().toLowerCase() !== "unknown";
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function metadataScore(row) {
  const coreFields = [
    "sea_basin",
    "capacity_mw",
    "turbine_count",
    "developer_company_id",
    "water_depth_m",
    "foundation_type",
    "commissioned_date",
    "distance_shore_km",
    "turbine_model",
    "turbine_oem",
    "route_to_market",
  ];

  let score = coreFields.reduce((sum, field) => sum + (filled(row[field]) ? 1 : 0), 0);
  score += row.has_centroid ? 2 : 0;
  score += row.has_project_area ? 2 : 0;
  score += geometryRank(row.geometry_quality) * 2;
  score += dataQualityRank(row.data_quality);
  score += Number(row.ownership_count ?? 0);
  score += Number(row.contract_count ?? 0);
  score += Number(row.epc_role_count ?? 0);
  score += Number(row.support_scheme_count ?? 0);
  score += Number(row.source_count ?? 0);
  return score;
}

function capacityCompatible(left, right) {
  if (left == null || right == null) return true;
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  const diff = Math.abs(a - b);
  const scale = Math.max(a, b, 1);
  return diff / scale <= 0.1;
}

function distanceKm(left, right) {
  if (left?.lng == null || left?.lat == null || right?.lng == null || right?.lat == null) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const lat1 = Number(left.lat);
  const lon1 = Number(left.lng);
  const lat2 = Number(right.lat);
  const lon2 = Number(right.lng);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchFarm(client, countryCode, name) {
  const { rows } = await client.query(
    `
    SELECT
      wf.*,
      wf.centroid IS NOT NULL AS has_centroid,
      wf.project_area IS NOT NULL AS has_project_area,
      ST_X(wf.centroid::geometry) AS lng,
      ST_Y(wf.centroid::geometry) AS lat,
      (SELECT COUNT(*)::int FROM wind_farm_ownership wfo WHERE wfo.wind_farm_id = wf.id) AS ownership_count,
      (SELECT COUNT(*)::int FROM contracts ct WHERE ct.wind_farm_id = wf.id) AS contract_count,
      (SELECT COUNT(*)::int FROM wind_farm_epc_company_roles epc WHERE epc.wind_farm_id = wf.id) AS epc_role_count,
      (SELECT COUNT(*)::int FROM wind_farm_support_schemes supp WHERE supp.wind_farm_id = wf.id) AS support_scheme_count,
      (SELECT COUNT(*)::int FROM wind_farm_sources src WHERE src.wind_farm_id = wf.id) AS source_count,
      (SELECT COUNT(*)::int FROM turbines t WHERE t.wind_farm_id = wf.id) AS turbine_rows
    FROM wind_farms wf
    WHERE wf.country_code = $1
      AND wf.name = $2
    LIMIT 1
    `,
    [countryCode, name]
  );

  return rows[0] ?? null;
}

async function fetchWindFarmCount(client) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM wind_farms");
  return Number(rows[0]?.count ?? 0);
}

async function mergeChildRows(client, canonicalId, duplicateId) {
  const stats = {};

  stats.contracts = (await client.query(
    "UPDATE contracts SET wind_farm_id = $1, updated_at = now() WHERE wind_farm_id = $2",
    [canonicalId, duplicateId]
  )).rowCount;

  stats.ownership = (await client.query(
    "UPDATE wind_farm_ownership SET wind_farm_id = $1, updated_at = now() WHERE wind_farm_id = $2",
    [canonicalId, duplicateId]
  )).rowCount;

  stats.support_schemes = (await client.query(
    "UPDATE wind_farm_support_schemes SET wind_farm_id = $1, updated_at = now() WHERE wind_farm_id = $2",
    [canonicalId, duplicateId]
  )).rowCount;

  stats.support_history = (await client.query(
    "UPDATE wind_farm_support_price_history SET wind_farm_id = $1, updated_at = now() WHERE wind_farm_id = $2",
    [canonicalId, duplicateId]
  )).rowCount;

  await client.query(
    `
    INSERT INTO wind_farm_sources (wind_farm_id, source_id, field_name, notes)
    SELECT $1, source_id, field_name, notes
    FROM wind_farm_sources
    WHERE wind_farm_id = $2
    ON CONFLICT (wind_farm_id, source_id, field_name)
    DO UPDATE SET notes = COALESCE(wind_farm_sources.notes, EXCLUDED.notes)
    `,
    [canonicalId, duplicateId]
  );
  stats.sources = (await client.query(
    "DELETE FROM wind_farm_sources WHERE wind_farm_id = $1",
    [duplicateId]
  )).rowCount;

  await client.query(
    `
    INSERT INTO wind_farm_epc_packages (
      wind_farm_id,
      package_code,
      package_status,
      confidence,
      provenance_note,
      source_url,
      source_title,
      source_date,
      notes
    )
    SELECT
      $1,
      package_code,
      package_status,
      confidence,
      provenance_note,
      source_url,
      source_title,
      source_date,
      notes
    FROM wind_farm_epc_packages
    WHERE wind_farm_id = $2
    ON CONFLICT (wind_farm_id, package_code)
    DO UPDATE SET
      package_status = CASE
        WHEN lower(wind_farm_epc_packages.package_status) = 'unknown' THEN EXCLUDED.package_status
        ELSE wind_farm_epc_packages.package_status
      END,
      confidence = CASE
        WHEN wind_farm_epc_packages.confidence = 'low' AND EXCLUDED.confidence IN ('medium', 'high') THEN EXCLUDED.confidence
        WHEN wind_farm_epc_packages.confidence = 'medium' AND EXCLUDED.confidence = 'high' THEN EXCLUDED.confidence
        ELSE wind_farm_epc_packages.confidence
      END,
      provenance_note = COALESCE(wind_farm_epc_packages.provenance_note, EXCLUDED.provenance_note),
      source_url = COALESCE(wind_farm_epc_packages.source_url, EXCLUDED.source_url),
      source_title = COALESCE(wind_farm_epc_packages.source_title, EXCLUDED.source_title),
      source_date = COALESCE(wind_farm_epc_packages.source_date, EXCLUDED.source_date),
      notes = COALESCE(wind_farm_epc_packages.notes, EXCLUDED.notes),
      updated_at = now()
    `,
    [canonicalId, duplicateId]
  );
  stats.epc_packages = (await client.query(
    "DELETE FROM wind_farm_epc_packages WHERE wind_farm_id = $1",
    [duplicateId]
  )).rowCount;

  await client.query(
    `
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id,
      company_id,
      package_code,
      role_type,
      is_current,
      contract_scope,
      award_date,
      start_date,
      end_date,
      confidence,
      provenance_note,
      source_url,
      source_title,
      source_date,
      notes
    )
    SELECT
      $1,
      company_id,
      package_code,
      role_type,
      is_current,
      contract_scope,
      award_date,
      start_date,
      end_date,
      confidence,
      provenance_note,
      source_url,
      source_title,
      source_date,
      notes
    FROM wind_farm_epc_company_roles
    WHERE wind_farm_id = $2
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET
      is_current = wind_farm_epc_company_roles.is_current OR EXCLUDED.is_current,
      contract_scope = COALESCE(wind_farm_epc_company_roles.contract_scope, EXCLUDED.contract_scope),
      award_date = COALESCE(wind_farm_epc_company_roles.award_date, EXCLUDED.award_date),
      start_date = COALESCE(wind_farm_epc_company_roles.start_date, EXCLUDED.start_date),
      end_date = COALESCE(wind_farm_epc_company_roles.end_date, EXCLUDED.end_date),
      confidence = CASE
        WHEN wind_farm_epc_company_roles.confidence = 'low' AND EXCLUDED.confidence IN ('medium', 'high') THEN EXCLUDED.confidence
        WHEN wind_farm_epc_company_roles.confidence = 'medium' AND EXCLUDED.confidence = 'high' THEN EXCLUDED.confidence
        ELSE wind_farm_epc_company_roles.confidence
      END,
      provenance_note = COALESCE(wind_farm_epc_company_roles.provenance_note, EXCLUDED.provenance_note),
      source_url = COALESCE(wind_farm_epc_company_roles.source_url, EXCLUDED.source_url),
      source_title = COALESCE(wind_farm_epc_company_roles.source_title, EXCLUDED.source_title),
      source_date = COALESCE(wind_farm_epc_company_roles.source_date, EXCLUDED.source_date),
      notes = COALESCE(wind_farm_epc_company_roles.notes, EXCLUDED.notes),
      updated_at = now()
    `,
    [canonicalId, duplicateId]
  );
  stats.epc_roles = (await client.query(
    "DELETE FROM wind_farm_epc_company_roles WHERE wind_farm_id = $1",
    [duplicateId]
  )).rowCount;

  await client.query(
    `
    INSERT INTO wind_farm_aliases (wind_farm_id, alias_name, alias_type, source_wind_farm_id, notes)
    SELECT $1, alias_name, alias_type, $2, notes
    FROM wind_farm_aliases
    WHERE wind_farm_id = $2
    ON CONFLICT (wind_farm_id, alias_name) DO NOTHING
    `,
    [canonicalId, duplicateId]
  );
  stats.aliases_transferred = (await client.query(
    "DELETE FROM wind_farm_aliases WHERE wind_farm_id = $1",
    [duplicateId]
  )).rowCount;

  stats.turbines_deduped = (await client.query(
    `
    DELETE FROM turbines t
    USING turbines existing
    WHERE t.wind_farm_id = $2
      AND existing.wind_farm_id = $1
      AND t.turbine_index IS NOT NULL
      AND existing.turbine_index = t.turbine_index
    `,
    [canonicalId, duplicateId]
  )).rowCount;

  stats.turbines = (await client.query(
    "UPDATE turbines SET wind_farm_id = $1 WHERE wind_farm_id = $2",
    [canonicalId, duplicateId]
  )).rowCount;

  return stats;
}

function summarizeTransferredFields(canonical, duplicate) {
  const fields = [];
  const maybePush = (field) => {
    if (!filled(canonical[field]) && filled(duplicate[field])) fields.push(field);
  };

  maybePush("sea_basin");
  maybePush("capacity_mw");
  maybePush("turbine_count");
  maybePush("developer_company_id");
  maybePush("water_depth_m");
  maybePush("foundation_type");
  maybePush("commissioned_date");
  maybePush("distance_shore_km");
  maybePush("turbine_model");
  maybePush("turbine_oem");
  if ((!filled(canonical.route_to_market) || String(canonical.route_to_market).toLowerCase() === "unknown") && filled(duplicate.route_to_market)) {
    fields.push("route_to_market");
  }
  if (geometryRank(duplicate.geometry_quality) > geometryRank(canonical.geometry_quality)) {
    fields.push("geometry");
  } else {
    if (!canonical.has_centroid && duplicate.has_centroid) fields.push("centroid");
    if (!canonical.has_project_area && duplicate.has_project_area) fields.push("project_area");
  }
  if (dataQualityRank(duplicate.data_quality) > dataQualityRank(canonical.data_quality)) {
    fields.push("data_quality");
  }
  if (filled(duplicate.external_ids)) {
    fields.push("external_ids");
  }
  return [...new Set(fields)];
}

async function applyMerge(client, rule) {
  const canonical = await fetchFarm(client, rule.country_code, rule.canonical_name);
  const duplicate = await fetchFarm(client, rule.country_code, rule.duplicate_name);

  if (!canonical && !duplicate) {
    return { ...rule, action: "missing-both" };
  }

  if (!canonical && duplicate) {
    return { ...rule, action: "review", notes: "canonical record missing" };
  }

  if (canonical && !duplicate) {
    const { rows } = await client.query(
      `
      SELECT canonical_wind_farm_id
      FROM wind_farm_merge_log
      WHERE merged_country_code = $1
        AND merged_name = $2
      LIMIT 1
      `,
      [rule.country_code, rule.duplicate_name]
    );
    return {
      ...rule,
      action: rows.length > 0 ? "already-merged" : "missing-duplicate",
      canonical_id: canonical.id,
    };
  }

  const transferred_fields = summarizeTransferredFields(canonical, duplicate);
  const duplicateScore = metadataScore(duplicate);
  const canonicalScore = metadataScore(canonical);
  const preferDuplicateGeometry = geometryRank(duplicate.geometry_quality) > geometryRank(canonical.geometry_quality)
    || (!canonical.has_centroid && duplicate.has_centroid)
    || (!canonical.has_project_area && duplicate.has_project_area);

  await client.query("BEGIN");
  try {
    await client.query(
      `
      UPDATE wind_farms c
      SET
        sea_basin = COALESCE(NULLIF(BTRIM(c.sea_basin), ''), NULLIF(BTRIM(d.sea_basin), '')),
        status_current = CASE
          WHEN lower(COALESCE(c.status_current, 'unknown')) = 'unknown'
            AND lower(COALESCE(d.status_current, 'unknown')) <> 'unknown'
            THEN d.status_current
          ELSE c.status_current
        END,
        capacity_mw = COALESCE(c.capacity_mw, d.capacity_mw),
        turbine_count = COALESCE(c.turbine_count, d.turbine_count),
        developer_company_id = COALESCE(c.developer_company_id, d.developer_company_id),
        water_depth_m = COALESCE(c.water_depth_m, d.water_depth_m),
        foundation_type = COALESCE(NULLIF(BTRIM(c.foundation_type), ''), NULLIF(BTRIM(d.foundation_type), '')),
        commissioned_date = COALESCE(c.commissioned_date, d.commissioned_date),
        data_quality = CASE
          WHEN $3 > $4 THEN d.data_quality
          ELSE COALESCE(c.data_quality, d.data_quality)
        END,
        external_ids = COALESCE(d.external_ids, '{}'::jsonb) || COALESCE(c.external_ids, '{}'::jsonb),
        distance_shore_km = COALESCE(c.distance_shore_km, d.distance_shore_km),
        turbine_model = COALESCE(NULLIF(BTRIM(c.turbine_model), ''), NULLIF(BTRIM(d.turbine_model), '')),
        turbine_oem = COALESCE(NULLIF(BTRIM(c.turbine_oem), ''), NULLIF(BTRIM(d.turbine_oem), '')),
        geometry_quality = CASE
          WHEN $5 THEN COALESCE(d.geometry_quality, c.geometry_quality)
          ELSE COALESCE(c.geometry_quality, d.geometry_quality)
        END,
        route_to_market = CASE
          WHEN NULLIF(BTRIM(c.route_to_market), '') IS NULL OR lower(COALESCE(c.route_to_market, 'unknown')) = 'unknown'
            THEN COALESCE(NULLIF(BTRIM(d.route_to_market), ''), c.route_to_market)
          ELSE c.route_to_market
        END,
        centroid = CASE
          WHEN $5 THEN COALESCE(d.centroid, c.centroid)
          ELSE COALESCE(c.centroid, d.centroid)
        END,
        project_area = CASE
          WHEN $5 AND d.project_area IS NOT NULL THEN d.project_area
          ELSE COALESCE(c.project_area, d.project_area)
        END,
        updated_at = now()
      FROM wind_farms d
      WHERE c.id = $1
        AND d.id = $2
      `,
      [
        canonical.id,
        duplicate.id,
        dataQualityRank(duplicate.data_quality),
        dataQualityRank(canonical.data_quality),
        preferDuplicateGeometry,
      ]
    );

    const child_stats = await mergeChildRows(client, canonical.id, duplicate.id);

    await client.query(
      `
      INSERT INTO wind_farm_aliases (
        wind_farm_id,
        alias_name,
        alias_type,
        source_wind_farm_id,
        notes
      )
      VALUES ($1, $2, 'duplicate-merge', $3, $4)
      ON CONFLICT (wind_farm_id, alias_name) DO NOTHING
      `,
      [
        canonical.id,
        duplicate.name,
        duplicate.id,
        `Merged duplicate ${duplicate.name} into ${canonical.name} (${rule.reason}).`,
      ]
    );

    await client.query(
      `
      INSERT INTO wind_farm_merge_log (
        canonical_wind_farm_id,
        merged_wind_farm_id,
        merged_name,
        merged_country_code,
        merge_reason,
        confidence,
        notes,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (merged_country_code, merged_name)
      DO UPDATE SET
        canonical_wind_farm_id = EXCLUDED.canonical_wind_farm_id,
        merged_wind_farm_id = EXCLUDED.merged_wind_farm_id,
        merge_reason = EXCLUDED.merge_reason,
        confidence = EXCLUDED.confidence,
        notes = EXCLUDED.notes,
        metadata = EXCLUDED.metadata
      `,
      [
        canonical.id,
        duplicate.id,
        duplicate.name,
        duplicate.country_code,
        rule.reason,
        rule.confidence,
        `Auto-merged after normalized-name review. Canonical score ${canonicalScore}, duplicate score ${duplicateScore}.`,
        JSON.stringify({
          canonical_score: canonicalScore,
          duplicate_score: duplicateScore,
          transferred_fields,
          child_stats,
        }),
      ]
    );

    await client.query("DELETE FROM wind_farms WHERE id = $1", [duplicate.id]);
    await client.query("COMMIT");

    return {
      ...rule,
      action: "merged",
      canonical_id: canonical.id,
      merged_id: duplicate.id,
      transferred_fields,
      child_stats,
      canonical_score: canonicalScore,
      duplicate_score: duplicateScore,
      distance_km: distanceKm(canonical, duplicate),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    return {
      ...rule,
      action: "failed",
      canonical_id: canonical.id,
      merged_id: duplicate.id,
      error: error.message,
    };
  }
}

function buildReviewCandidates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const normalized = normalizeName(row.name);
    if (!normalized) continue;
    const key = `${row.country_code}:${normalized}`;
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const mergedKeys = new Set(
    AUTO_MERGE_RULES.map((rule) => `${rule.country_code}:${normalizeName(rule.canonical_name)}`)
  );

  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .filter(([key]) => !mergedKeys.has(key))
    .map(([key, group]) => {
      const names = group.map((row) => row.name).sort((a, b) => a.localeCompare(b));
      const hasExtension = names.some((name) => /\b(extension|phase)\b/i.test(name));
      const hasMixedExtension = hasExtension && names.some((name) => !/\b(extension|phase)\b/i.test(name));
      const sorted = group.slice().sort((left, right) => metadataScore(right) - metadataScore(left));
      const top = sorted[0];
      const second = sorted[1];
      const dist = top && second ? distanceKm(top, second) : null;
      const confidence = hasMixedExtension
        ? "low"
        : (dist == null || dist <= 80) && capacityCompatible(top.capacity_mw, second.capacity_mw)
          ? "medium"
          : "low";
      return {
        key,
        confidence,
        suggested_canonical: top?.name ?? null,
        names,
        country_code: top?.country_code ?? null,
        notes: hasMixedExtension
          ? "Contains extension/phase naming; kept for manual review."
          : "Normalized names collide after alias stripping.",
      };
    })
    .sort((left, right) => left.confidence.localeCompare(right.confidence) || left.key.localeCompare(right.key));
}

async function fetchReviewRows(client) {
  const { rows } = await client.query(
    `
    SELECT
      wf.id,
      wf.name,
      wf.country_code,
      wf.capacity_mw,
      wf.status_current,
      wf.geometry_quality,
      ST_X(wf.centroid::geometry) AS lng,
      ST_Y(wf.centroid::geometry) AS lat,
      wf.centroid IS NOT NULL AS has_centroid,
      wf.project_area IS NOT NULL AS has_project_area,
      wf.data_quality,
      wf.sea_basin,
      wf.turbine_count,
      wf.developer_company_id,
      wf.water_depth_m,
      wf.foundation_type,
      wf.commissioned_date,
      wf.distance_shore_km,
      wf.turbine_model,
      wf.turbine_oem,
      wf.route_to_market,
      wf.external_ids,
      (SELECT COUNT(*)::int FROM wind_farm_ownership wfo WHERE wfo.wind_farm_id = wf.id) AS ownership_count,
      (SELECT COUNT(*)::int FROM contracts ct WHERE ct.wind_farm_id = wf.id) AS contract_count,
      (SELECT COUNT(*)::int FROM wind_farm_epc_company_roles epc WHERE epc.wind_farm_id = wf.id) AS epc_role_count,
      (SELECT COUNT(*)::int FROM wind_farm_support_schemes supp WHERE supp.wind_farm_id = wf.id) AS support_scheme_count,
      (SELECT COUNT(*)::int FROM wind_farm_sources src WHERE src.wind_farm_id = wf.id) AS source_count
    FROM wind_farms wf
    ORDER BY wf.country_code, wf.name
    `
  );
  return rows;
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const beforeCount = await fetchWindFarmCount(client);
    const actions = [];

    for (const rule of AUTO_MERGE_RULES) {
      const action = dryRun ? { ...rule, action: "dry-run" } : await applyMerge(client, rule);
      actions.push(action);
    }

    const afterCount = await fetchWindFarmCount(client);
    const reviewCandidates = buildReviewCandidates(await fetchReviewRows(client));

    const merged = actions.filter((action) => action.action === "merged");
    const payload = {
      generated_at: new Date().toISOString(),
      dry_run: dryRun,
      before_count: beforeCount,
      after_count: afterCount,
      auto_merge_rule_count: AUTO_MERGE_RULES.length,
      merged_count: merged.length,
      merged,
      skipped: actions.filter((action) => action.action !== "merged"),
      review_candidates: reviewCandidates,
    };

    writeJsonOutputs("wind-farm-dedup-report", payload);
    writeCsvOutputs(
      "wind-farm-dedup-actions",
      actions.map((action) => ({
        country_code: action.country_code,
        canonical_name: action.canonical_name,
        duplicate_name: action.duplicate_name,
        action: action.action,
        reason: action.reason,
        confidence: action.confidence,
        transferred_fields: Array.isArray(action.transferred_fields) ? action.transferred_fields.join("|") : "",
        child_updates: action.child_stats ? JSON.stringify(action.child_stats) : "",
        error: action.error ?? "",
      })),
      ["country_code", "canonical_name", "duplicate_name", "action", "reason", "confidence", "transferred_fields", "child_updates", "error"]
    );
    writeCsvOutputs(
      "wind-farm-dedup-review",
      reviewCandidates.map((candidate) => ({
        country_code: candidate.country_code,
        confidence: candidate.confidence,
        suggested_canonical: candidate.suggested_canonical,
        names: candidate.names.join(" | "),
        notes: candidate.notes,
      })),
      ["country_code", "confidence", "suggested_canonical", "names", "notes"]
    );

    console.log(JSON.stringify({
      before_count: beforeCount,
      after_count: afterCount,
      merged_count: merged.length,
      review_candidate_count: reviewCandidates.length,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

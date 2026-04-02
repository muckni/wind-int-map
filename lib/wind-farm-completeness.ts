export function parseBooleanFlag(value: string | null) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function buildWindFarmCompletenessSql(alias = "v") {
  return `
    (
      ${alias}.name IS NOT NULL
      AND ${alias}.country_code IS NOT NULL
      AND ${alias}.status_current IS NOT NULL
      AND ${alias}.lng IS NOT NULL
      AND ${alias}.lat IS NOT NULL
      AND lower(COALESCE(${alias}.geometry_quality, '')) IN ('verified', 'approximated')
      AND (
        ${alias}.capacity_mw IS NOT NULL
        OR ${alias}.developer_company_id IS NOT NULL
        OR NULLIF(BTRIM(${alias}.route_to_market), '') IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM wind_farm_ownership wfo
          WHERE wfo.wind_farm_id = ${alias}.id
            AND wfo.is_current = true
        )
        OR EXISTS (
          SELECT 1
          FROM contracts ct
          WHERE ct.wind_farm_id = ${alias}.id
        )
        OR EXISTS (
          SELECT 1
          FROM wind_farm_support_schemes wss
          WHERE wss.wind_farm_id = ${alias}.id
        )
        OR EXISTS (
          SELECT 1
          FROM wind_farm_epc_company_roles epc
          WHERE epc.wind_farm_id = ${alias}.id
            AND epc.is_current = true
        )
      )
    )
  `;
}

-- Migration 008: Martin vector-tile source views

CREATE OR REPLACE VIEW wind_farm_points_tiles AS
SELECT
  v.id,
  v.name,
  v.country_code,
  v.sea_basin,
  v.status_current,
  v.capacity_mw,
  v.turbine_count,
  v.water_depth_m,
  v.foundation_type,
  v.turbine_oem,
  v.distance_shore_km,
  v.geometry_quality,
  v.route_to_market,
  v.commissioned_date,
  v.developer_company_id,
  v.developer_name,
  CASE
    WHEN (
      v.name IS NOT NULL
      AND v.country_code IS NOT NULL
      AND v.status_current IS NOT NULL
      AND v.lng IS NOT NULL
      AND v.lat IS NOT NULL
      AND lower(COALESCE(v.geometry_quality, '')) IN ('verified', 'approximated')
      AND (
        v.capacity_mw IS NOT NULL
        OR v.developer_company_id IS NOT NULL
        OR NULLIF(BTRIM(v.route_to_market), '') IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM wind_farm_ownership wfo
          WHERE wfo.wind_farm_id = v.id
            AND wfo.is_current = true
        )
        OR EXISTS (
          SELECT 1
          FROM contracts ct
          WHERE ct.wind_farm_id = v.id
        )
        OR EXISTS (
          SELECT 1
          FROM wind_farm_support_schemes wss
          WHERE wss.wind_farm_id = v.id
        )
        OR EXISTS (
          SELECT 1
          FROM wind_farm_epc_company_roles epc
          WHERE epc.wind_farm_id = v.id
            AND epc.is_current = true
        )
      )
    ) THEN 1
    ELSE 0
  END AS is_complete,
  v.centroid_geom AS geom
FROM wind_farm_map_view v;

CREATE OR REPLACE VIEW wind_farm_polygons_tiles AS
WITH farm_rows AS (
  SELECT
    wf.id,
    wf.name,
    wf.country_code,
    wf.status_current,
    wf.capacity_mw,
    wf.geometry_quality,
    wf.turbine_count,
    wf.route_to_market,
    wf.developer_company_id,
    wf.commissioned_date,
    wf.centroid::geometry AS centroid_geom,
    wf.project_area::geometry AS project_geom,
    (
      SELECT
        CASE
          WHEN COUNT(*) >= 3 THEN ST_Buffer(ST_ConvexHull(ST_Collect(t.location::geometry))::geography, 220)::geometry
          WHEN COUNT(*) = 2 THEN ST_Buffer(ST_MakeLine(t.location::geometry ORDER BY t.turbine_index NULLS LAST)::geography, 420)::geometry
          WHEN COUNT(*) = 1 THEN ST_Buffer(ST_Centroid(ST_Collect(t.location::geometry))::geography, 900)::geometry
          ELSE NULL
        END
      FROM turbines t
      WHERE t.wind_farm_id = wf.id
        AND t.location IS NOT NULL
    ) AS turbine_geom
  FROM wind_farms wf
  WHERE wf.centroid IS NOT NULL
),
chosen AS (
  SELECT
    fr.id,
    fr.name,
    fr.country_code,
    fr.status_current,
    fr.capacity_mw,
    fr.geometry_quality,
    fr.commissioned_date,
    CASE
      WHEN fr.project_geom IS NOT NULL AND ST_IsValid(fr.project_geom) AND NOT ST_IsEmpty(fr.project_geom) THEN ST_Multi(fr.project_geom)
      WHEN fr.turbine_geom IS NOT NULL AND ST_IsValid(fr.turbine_geom) AND NOT ST_IsEmpty(fr.turbine_geom) THEN ST_Multi(ST_MakeValid(fr.turbine_geom))
      ELSE ST_Multi(
        ST_Buffer(
          fr.centroid_geom::geography,
          CASE
            WHEN COALESCE(fr.turbine_count, 0) >= 120 OR COALESCE(fr.capacity_mw, 0) >= 1500 THEN 5200
            WHEN COALESCE(fr.turbine_count, 0) >= 80 OR COALESCE(fr.capacity_mw, 0) >= 900 THEN 3900
            WHEN COALESCE(fr.turbine_count, 0) >= 40 OR COALESCE(fr.capacity_mw, 0) >= 500 THEN 2900
            WHEN COALESCE(fr.turbine_count, 0) >= 15 OR COALESCE(fr.capacity_mw, 0) >= 180 THEN 2000
            ELSE 1400
          END
        )::geometry
      )
    END AS geom,
    CASE
      WHEN (
        fr.name IS NOT NULL
        AND fr.country_code IS NOT NULL
        AND fr.status_current IS NOT NULL
        AND fr.centroid_geom IS NOT NULL
        AND lower(COALESCE(fr.geometry_quality, '')) IN ('verified', 'approximated')
        AND (
          fr.capacity_mw IS NOT NULL
          OR fr.developer_company_id IS NOT NULL
          OR NULLIF(BTRIM(fr.route_to_market), '') IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM wind_farm_ownership wfo
            WHERE wfo.wind_farm_id = fr.id
              AND wfo.is_current = true
          )
          OR EXISTS (
            SELECT 1
            FROM contracts ct
            WHERE ct.wind_farm_id = fr.id
          )
          OR EXISTS (
            SELECT 1
            FROM wind_farm_support_schemes wss
            WHERE wss.wind_farm_id = fr.id
          )
          OR EXISTS (
            SELECT 1
            FROM wind_farm_epc_company_roles epc
            WHERE epc.wind_farm_id = fr.id
              AND epc.is_current = true
          )
        )
      ) THEN 1
      ELSE 0
    END AS is_complete
  FROM farm_rows fr
)
SELECT
  c.id,
  c.name,
  c.country_code,
  c.status_current,
  c.capacity_mw,
  c.geometry_quality,
  c.commissioned_date,
  c.is_complete,
  c.geom
FROM chosen c
WHERE c.geom IS NOT NULL
  AND ST_IsValid(c.geom)
  AND NOT ST_IsEmpty(c.geom);

CREATE OR REPLACE VIEW turbines_tiles AS
SELECT
  t.id,
  t.wind_farm_id,
  wf.name AS wind_farm_name,
  wf.status_current,
  t.turbine_index,
  t.geometry_quality,
  t.location::geometry AS geom
FROM turbines t
JOIN wind_farms wf ON wf.id = t.wind_farm_id
WHERE t.location IS NOT NULL;

CREATE OR REPLACE VIEW company_locations_tiles AS
WITH linked_farms AS (
  SELECT wf.developer_company_id AS company_id, wf.centroid::geometry AS geom
  FROM wind_farms wf
  WHERE wf.developer_company_id IS NOT NULL AND wf.centroid IS NOT NULL

  UNION ALL

  SELECT wfo.company_id, wf.centroid::geometry AS geom
  FROM wind_farm_ownership wfo
  JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
  WHERE wfo.company_id IS NOT NULL AND wf.centroid IS NOT NULL

  UNION ALL

  SELECT ct.counterparty_company_id, wf.centroid::geometry AS geom
  FROM contracts ct
  JOIN wind_farms wf ON wf.id = ct.wind_farm_id
  WHERE ct.counterparty_company_id IS NOT NULL AND wf.centroid IS NOT NULL

  UNION ALL

  SELECT e.company_id, wf.centroid::geometry AS geom
  FROM wind_farm_epc_company_roles e
  JOIN wind_farms wf ON wf.id = e.wind_farm_id
  WHERE e.company_id IS NOT NULL
    AND e.is_current = true
    AND wf.centroid IS NOT NULL
),
company_fallback AS (
  SELECT
    company_id,
    ST_Centroid(ST_Collect(geom)) AS fallback_geom
  FROM linked_farms
  GROUP BY company_id
),
role_flags AS (
  SELECT
    r.company_id,
    bool_or(r.role_group = 'core') AS has_core_roles,
    bool_or(r.role_group = 'epc') AS has_epc_roles,
    bool_or(r.role_group = 'offtake') AS has_offtake_roles
  FROM (
    SELECT wf.developer_company_id AS company_id, 'core'::text AS role_group
    FROM wind_farms wf
    WHERE wf.developer_company_id IS NOT NULL

    UNION ALL

    SELECT wfo.company_id, 'core'::text AS role_group
    FROM wind_farm_ownership wfo
    WHERE wfo.company_id IS NOT NULL

    UNION ALL

    SELECT e.company_id, 'epc'::text AS role_group
    FROM wind_farm_epc_company_roles e
    WHERE e.company_id IS NOT NULL
      AND e.is_current = true

    UNION ALL

    SELECT ct.counterparty_company_id, 'offtake'::text AS role_group
    FROM contracts ct
    WHERE ct.counterparty_company_id IS NOT NULL
  ) r
  GROUP BY r.company_id
)
SELECT
  c.id,
  c.name,
  c.actor_type,
  c.hq_country_code,
  c.website,
  cl.city,
  CASE
    WHEN cl.location IS NOT NULL THEN 'hq'
    WHEN cf.company_id IS NOT NULL THEN 'farm-derived'
    ELSE NULL
  END AS location_source,
  CASE
    WHEN lower(c.actor_type) = 'offtaker' OR COALESCE(rf.has_offtake_roles, false) THEN 'offtaker'
    WHEN COALESCE(rf.has_epc_roles, false) AND NOT COALESCE(rf.has_core_roles, false) THEN 'epc'
    WHEN lower(c.actor_type) = 'oem' AND COALESCE(rf.has_epc_roles, false) THEN 'epc'
    ELSE 'company'
  END AS marker_class,
  CASE WHEN lower(c.name) = 'skyborn renewables' THEN 1 ELSE 0 END AS is_skyborn,
  COALESCE(cl.location::geometry, cf.fallback_geom) AS geom
FROM companies c
LEFT JOIN company_locations cl
  ON cl.company_id = c.id
 AND cl.location_type = 'hq'
LEFT JOIN company_fallback cf
  ON cf.company_id = c.id
LEFT JOIN role_flags rf
  ON rf.company_id = c.id
WHERE COALESCE(cl.location::geometry, cf.fallback_geom) IS NOT NULL;

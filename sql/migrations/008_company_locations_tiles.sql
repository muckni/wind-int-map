DROP VIEW IF EXISTS company_locations_tiles CASCADE;
DROP MATERIALIZED VIEW IF EXISTS company_locations_mv CASCADE;
DROP TABLE IF EXISTS company_locations_tiles CASCADE;

CREATE TABLE company_locations_tiles (
  id               uuid PRIMARY KEY,
  name             text,
  actor_type       text,
  hq_country_code  char(2),
  website          text,
  city             text,
  location_source  text,
  marker_class     text,
  is_skyborn       integer,
  geom             geometry(Point, 4326) NOT NULL
);

CREATE INDEX company_locations_tiles_gix ON company_locations_tiles USING gist(geom);
CREATE INDEX company_locations_tiles_marker_idx ON company_locations_tiles(marker_class);

CREATE OR REPLACE FUNCTION refresh_company_locations_tiles() RETURNS void AS $$
BEGIN
  TRUNCATE company_locations_tiles;
  INSERT INTO company_locations_tiles
  WITH linked_farms AS (
    SELECT wf.developer_company_id AS company_id, wf.centroid::geometry AS geom
    FROM wind_farms wf WHERE wf.developer_company_id IS NOT NULL AND wf.centroid IS NOT NULL
    UNION ALL
    SELECT wfo.company_id, wf.centroid::geometry AS geom
    FROM wind_farm_ownership wfo JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
    WHERE wfo.company_id IS NOT NULL AND wf.centroid IS NOT NULL
    UNION ALL
    SELECT ct.counterparty_company_id, wf.centroid::geometry AS geom
    FROM contracts ct JOIN wind_farms wf ON wf.id = ct.wind_farm_id
    WHERE ct.counterparty_company_id IS NOT NULL AND wf.centroid IS NOT NULL
    UNION ALL
    SELECT e.company_id, wf.centroid::geometry AS geom
    FROM wind_farm_epc_company_roles e JOIN wind_farms wf ON wf.id = e.wind_farm_id
    WHERE e.company_id IS NOT NULL AND e.is_current = true AND wf.centroid IS NOT NULL
  ),
  company_fallback AS (
    SELECT company_id, st_centroid(st_collect(geom)) AS fallback_geom
    FROM linked_farms GROUP BY company_id
  ),
  role_flags AS (
    SELECT r.company_id,
      bool_or(r.role_group='core') AS has_core_roles,
      bool_or(r.role_group='epc') AS has_epc_roles,
      bool_or(r.role_group='offtake') AS has_offtake_roles
    FROM (
      SELECT developer_company_id AS company_id, 'core' AS role_group FROM wind_farms WHERE developer_company_id IS NOT NULL
      UNION ALL SELECT company_id, 'core' FROM wind_farm_ownership WHERE company_id IS NOT NULL
      UNION ALL SELECT company_id, 'epc' FROM wind_farm_epc_company_roles WHERE company_id IS NOT NULL AND is_current=true
      UNION ALL SELECT counterparty_company_id, 'offtake' FROM contracts WHERE counterparty_company_id IS NOT NULL
    ) r GROUP BY r.company_id
  )
  SELECT c.id, c.name, c.actor_type, c.hq_country_code, c.website, cl.city,
    CASE WHEN cl.location IS NOT NULL THEN 'hq' WHEN cf.company_id IS NOT NULL THEN 'farm-derived' ELSE NULL END AS location_source,
    CASE
      WHEN lower(c.actor_type)='offtaker' OR COALESCE(rf.has_offtake_roles,false) THEN 'offtaker'
      WHEN COALESCE(rf.has_epc_roles,false) AND NOT COALESCE(rf.has_core_roles,false) THEN 'epc'
      WHEN lower(c.actor_type)='oem' AND COALESCE(rf.has_epc_roles,false) THEN 'epc'
      ELSE 'company'
    END AS marker_class,
    CASE WHEN lower(c.name)='skyborn renewables' THEN 1 ELSE 0 END AS is_skyborn,
    ST_SetSRID(ST_Force2D(COALESCE(cl.location::geometry, cf.fallback_geom)), 4326)::geometry(Point, 4326) AS geom
  FROM companies c
  LEFT JOIN company_locations cl ON cl.company_id=c.id AND cl.location_type='hq'
  LEFT JOIN company_fallback cf ON cf.company_id=c.id
  LEFT JOIN role_flags rf ON rf.company_id=c.id
  WHERE COALESCE(cl.location::geometry, cf.fallback_geom) IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

SELECT refresh_company_locations_tiles();

SELECT f_table_name, f_geometry_column, srid, type FROM geometry_columns WHERE f_table_name='company_locations_tiles';
SELECT marker_class, COUNT(*) FROM company_locations_tiles GROUP BY marker_class ORDER BY 2 DESC;

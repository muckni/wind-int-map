-- Migration 002: turbines, company_locations, geometry_quality, route_to_market, extended roles
-- Idempotent; safe to rerun
BEGIN;

-- ── Turbines ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turbines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id     UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  turbine_index    INTEGER,
  location         GEOGRAPHY(POINT, 4326),
  geometry_quality TEXT CHECK (lower(geometry_quality) IN ('verified','approximated','generated')),
  ingest_batch_id  UUID REFERENCES ingest_batches(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turbines_wind_farm_id_idx ON turbines (wind_farm_id);
CREATE INDEX IF NOT EXISTS turbines_location_gix     ON turbines USING GIST (location);
CREATE UNIQUE INDEX IF NOT EXISTS turbines_farm_idx_uidx
  ON turbines (wind_farm_id, turbine_index)
  WHERE turbine_index IS NOT NULL;

-- ── Company locations (HQ / representative point) ─────────────────────────────
CREATE TABLE IF NOT EXISTS company_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location      GEOGRAPHY(POINT, 4326) NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'hq',
  city          TEXT,
  country_code  CHAR(2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_locations_company_id_idx ON company_locations (company_id);
CREATE INDEX IF NOT EXISTS company_locations_location_gix   ON company_locations USING GIST (location);
CREATE UNIQUE INDEX IF NOT EXISTS company_locations_company_type_uidx
  ON company_locations (company_id, location_type);

-- ── Extend wind_farms ─────────────────────────────────────────────────────────
ALTER TABLE wind_farms
  ADD COLUMN IF NOT EXISTS geometry_quality TEXT,
  ADD COLUMN IF NOT EXISTS route_to_market  TEXT;

ALTER TABLE wind_farms DROP CONSTRAINT IF EXISTS wind_farms_geometry_quality_check;
ALTER TABLE wind_farms ADD CONSTRAINT wind_farms_geometry_quality_check
  CHECK (lower(geometry_quality) IN ('verified','approximated','generated'));

ALTER TABLE wind_farms DROP CONSTRAINT IF EXISTS wind_farms_route_to_market_check;
ALTER TABLE wind_farms ADD CONSTRAINT wind_farms_route_to_market_check
  CHECK (lower(route_to_market) IN (
    'cfd','feed-in tariff','corporate ppa','merchant',
    'green certificate','capacity market','unknown'
  ));

-- ── Extend wind_farm_ownership role_type ──────────────────────────────────────
ALTER TABLE wind_farm_ownership DROP CONSTRAINT IF EXISTS wind_farm_ownership_role_type_check;
ALTER TABLE wind_farm_ownership ADD CONSTRAINT wind_farm_ownership_role_type_check
  CHECK (lower(role_type) IN (
    'developer','owner','equity partner','operator',
    'offtaker','ppa counterparty','construction contractor',
    'other','unknown'
  ));

-- ── Updated map view ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS wind_farm_map_view;
CREATE VIEW wind_farm_map_view AS
SELECT
  wf.id,
  wf.name,
  wf.country_code,
  wf.sea_basin,
  wf.status_current,
  wf.capacity_mw,
  wf.turbine_count,
  wf.water_depth_m,
  wf.foundation_type,
  wf.turbine_oem,
  wf.distance_shore_km,
  wf.geometry_quality,
  wf.route_to_market,
  wf.commissioned_date,
  wf.developer_company_id,
  c.name AS developer_name,
  wf.centroid::geometry   AS centroid_geom,
  ST_X(wf.centroid::geometry) AS lng,
  ST_Y(wf.centroid::geometry) AS lat
FROM wind_farms wf
LEFT JOIN companies c ON c.id = wf.developer_company_id
WHERE wf.centroid IS NOT NULL;

COMMIT;

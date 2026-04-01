-- Migration 001: extend wind_farms with deduplication, new fields, updated view
-- Safe to run multiple times (idempotent)

BEGIN;

ALTER TABLE wind_farms
  ADD COLUMN IF NOT EXISTS external_ids      JSONB    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS distance_shore_km NUMERIC,
  ADD COLUMN IF NOT EXISTS turbine_model     TEXT,
  ADD COLUMN IF NOT EXISTS turbine_oem       TEXT;

-- Generated normalized_name for deduplication (mirrors companies table pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wind_farms' AND column_name = 'normalized_name'
  ) THEN
    ALTER TABLE wind_farms
      ADD COLUMN normalized_name TEXT
        GENERATED ALWAYS AS (lower(regexp_replace(name, '\s+', ' ', 'g'))) STORED;
  END IF;
END $$;

-- Deduplication index — enables ON CONFLICT (country_code, normalized_name)
CREATE UNIQUE INDEX IF NOT EXISTS wind_farms_country_name_uidx
  ON wind_farms (country_code, normalized_name);

-- Idempotency guard for ingest_batches (prevents double-seeding)
CREATE UNIQUE INDEX IF NOT EXISTS ingest_batches_name_uidx
  ON ingest_batches (batch_name)
  WHERE batch_name IS NOT NULL;

-- Updated view exposes new fields
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
  wf.commissioned_date,
  wf.developer_company_id,
  c.name AS developer_name,
  wf.centroid::geometry AS centroid_geom,
  ST_X(wf.centroid::geometry) AS lng,
  ST_Y(wf.centroid::geometry) AS lat
FROM wind_farms wf
LEFT JOIN companies c ON c.id = wf.developer_company_id
WHERE wf.centroid IS NOT NULL;

COMMIT;

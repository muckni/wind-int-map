-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Controlled vocabulary (V1 pragmatic constraints)
-- Note: CHECK constraints use lower(...) for case-insensitive matching.

-- Ingestion audit (lightweight)
CREATE TABLE IF NOT EXISTS ingest_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name TEXT,
  source_name TEXT,
  source_file_name TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER,
  notes TEXT
);

-- Core tables
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (lower(regexp_replace(name, '\\s+', ' ', 'g'))) STORED,
  actor_type TEXT NOT NULL CHECK (lower(actor_type) IN (
    'developer',
    'owner',
    'offtaker',
    'oem',
    'utility',
    'trader',
    'financial',
    'other',
    'unknown'
  )),
  hq_country_code CHAR(2),
  website TEXT,
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_normalized_name_uidx ON companies (normalized_name);

CREATE TABLE IF NOT EXISTS wind_farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  sea_basin TEXT CHECK (lower(sea_basin) IN (
    'north sea',
    'baltic sea',
    'irish sea',
    'atlantic',
    'mediterranean',
    'black sea',
    'other',
    'unknown'
  )),
  status_current TEXT NOT NULL CHECK (lower(status_current) IN (
    'planned',
    'under construction',
    'operational',
    'decommissioned',
    'unknown'
  )),
  capacity_mw NUMERIC,
  turbine_count INTEGER,
  developer_company_id UUID REFERENCES companies(id),
  water_depth_m NUMERIC,
  foundation_type TEXT CHECK (lower(foundation_type) IN (
    'monopile',
    'jacket',
    'gravity base',
    'floating',
    'other',
    'unknown'
  )),
  centroid GEOGRAPHY(POINT, 4326),
  project_area GEOGRAPHY(POLYGON, 4326),
  commissioned_date DATE,
  data_quality TEXT CHECK (lower(data_quality) IN (
    'verified',
    'unverified',
    'example'
  )),
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wind_farm_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  equity_share_pct NUMERIC CHECK (equity_share_pct BETWEEN 0 AND 100),
  role_type TEXT CHECK (lower(role_type) IN (
    'developer',
    'owner',
    'equity partner',
    'operator',
    'other',
    'unknown'
  )),
  valid_from DATE,
  valid_to DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  data_quality TEXT CHECK (lower(data_quality) IN (
    'verified',
    'unverified',
    'example'
  )),
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL CHECK (lower(contract_type) IN (
    'cfd',
    'feed-in tariff',
    'corporate ppa',
    'merchant',
    'green certificate',
    'other',
    'unknown'
  )),
  counterparty_company_id UUID REFERENCES companies(id),
  start_date DATE,
  end_date DATE,
  price_eur_mwh NUMERIC,
  volume_mwh NUMERIC,
  verification_status TEXT CHECK (lower(verification_status) IN (
    'verified',
    'unverified',
    'example'
  )),
  notes TEXT,
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source linkage scaffolding
CREATE TABLE IF NOT EXISTS wind_farm_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL DEFAULT 'general',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wind_farm_sources_uidx
  ON wind_farm_sources (wind_farm_id, source_id, field_name);

CREATE TABLE IF NOT EXISTS contract_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL DEFAULT 'general',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_sources_uidx
  ON contract_sources (contract_id, source_id, field_name);

-- Read-optimized map view (exposes geometry for map queries)
CREATE OR REPLACE VIEW wind_farm_map_view AS
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
  wf.developer_company_id,
  c.name AS developer_name,
  wf.centroid::geometry AS centroid_geom,
  ST_X(wf.centroid::geometry) AS lng,
  ST_Y(wf.centroid::geometry) AS lat
FROM wind_farms wf
LEFT JOIN companies c ON c.id = wf.developer_company_id
WHERE wf.centroid IS NOT NULL;

-- History placeholder (draft only; not implemented in V1)
-- CREATE TABLE IF NOT EXISTS wind_farm_status_history (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
--   status TEXT NOT NULL,
--   valid_from DATE,
--   valid_to DATE,
--   source_id UUID REFERENCES sources(id),
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );

-- Indexes for scale
CREATE INDEX IF NOT EXISTS wind_farms_centroid_gix ON wind_farms USING GIST (centroid);
CREATE INDEX IF NOT EXISTS wind_farms_project_area_gix ON wind_farms USING GIST (project_area);
CREATE INDEX IF NOT EXISTS wind_farms_country_code_idx ON wind_farms (country_code);
CREATE INDEX IF NOT EXISTS wind_farms_status_current_idx ON wind_farms (status_current);
CREATE INDEX IF NOT EXISTS wind_farms_sea_basin_idx ON wind_farms (sea_basin);
CREATE INDEX IF NOT EXISTS wind_farm_ownership_wind_farm_id_idx ON wind_farm_ownership (wind_farm_id);
CREATE INDEX IF NOT EXISTS contracts_wind_farm_id_idx ON contracts (wind_farm_id);

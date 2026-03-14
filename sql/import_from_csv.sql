-- CSV import pattern for starter dataset pack
-- Assumes CSVs are placed in ./data/seed/
-- Example:
-- \copy staging_companies FROM 'data/seed/companies_seed.csv' WITH (FORMAT csv, HEADER true);

-- 1) Create staging tables that match CSV columns (all TEXT for flexibility)
DROP TABLE IF EXISTS staging_companies;
CREATE TABLE staging_companies (
  id TEXT,
  name TEXT,
  actor_type TEXT,
  hq_country_code TEXT,
  website TEXT
);

DROP TABLE IF EXISTS staging_wind_farms;
CREATE TABLE staging_wind_farms (
  id TEXT,
  name TEXT,
  country_code TEXT,
  sea_basin TEXT,
  status_current TEXT,
  capacity_mw TEXT,
  turbine_count TEXT,
  developer_company_id TEXT,
  water_depth_m TEXT,
  foundation_type TEXT,
  centroid_wkt TEXT,
  commissioned_date TEXT,
  data_quality TEXT
);

DROP TABLE IF EXISTS staging_wind_farm_ownership;
CREATE TABLE staging_wind_farm_ownership (
  id TEXT,
  wind_farm_id TEXT,
  company_id TEXT,
  equity_share_pct TEXT,
  role_type TEXT,
  valid_from TEXT,
  valid_to TEXT,
  is_current TEXT,
  data_quality TEXT
);

DROP TABLE IF EXISTS staging_contracts;
CREATE TABLE staging_contracts (
  id TEXT,
  wind_farm_id TEXT,
  contract_type TEXT,
  counterparty_company_id TEXT,
  start_date TEXT,
  end_date TEXT,
  price_eur_mwh TEXT,
  volume_mwh TEXT,
  verification_status TEXT,
  notes TEXT
);

DROP TABLE IF EXISTS staging_sources;
CREATE TABLE staging_sources (
  id TEXT,
  name TEXT,
  url TEXT,
  description TEXT
);

DROP TABLE IF EXISTS staging_wind_farm_sources;
CREATE TABLE staging_wind_farm_sources (
  wind_farm_id TEXT,
  source_id TEXT,
  field_name TEXT,
  notes TEXT
);

DROP TABLE IF EXISTS staging_contract_sources;
CREATE TABLE staging_contract_sources (
  contract_id TEXT,
  source_id TEXT,
  field_name TEXT,
  notes TEXT
);

-- 2) Load CSVs (uncomment and run in psql)
-- \copy staging_companies FROM 'data/seed/companies_seed.csv' WITH (FORMAT csv, HEADER true);
-- \copy staging_wind_farms FROM 'data/seed/wind_farms_seed.csv' WITH (FORMAT csv, HEADER true);
-- \copy staging_wind_farm_ownership FROM 'data/seed/wind_farm_ownership_seed.csv' WITH (FORMAT csv, HEADER true);
-- \copy staging_contracts FROM 'data/seed/contracts_seed.csv' WITH (FORMAT csv, HEADER true);
-- \copy staging_sources FROM 'data/seed/sources_seed.csv' WITH (FORMAT csv, HEADER true);
-- \copy staging_wind_farm_sources FROM 'data/seed/wind_farm_sources_seed.csv' WITH (FORMAT csv, HEADER true);
-- \copy staging_contract_sources FROM 'data/seed/contract_sources_seed.csv' WITH (FORMAT csv, HEADER true);

-- 3) Insert into core tables with casting/normalization
-- NOTE: ON CONFLICT DO NOTHING is acceptable for starter seed ingestion.
-- Production ingestion should move to merge/upsert with explicit conflict targets.

-- Quick WKT validation helpers (run before insert if needed)
-- Invalid or non-point WKT rows:
-- SELECT id, name, centroid_wkt
-- FROM staging_wind_farms
-- WHERE centroid_wkt IS NOT NULL
--   AND centroid_wkt !~* '^POINT\\s*\\(\\s*-?\\d+(\\.\\d+)?\\s+-?\\d+(\\.\\d+)?\\s*\\)$';
INSERT INTO companies (id, name, actor_type, hq_country_code, website)
SELECT
  NULLIF(id, '')::uuid,
  name,
  CASE lower(coalesce(NULLIF(actor_type, ''), 'unknown'))
    WHEN 'developer' THEN 'Developer'
    WHEN 'owner' THEN 'Owner'
    WHEN 'offtaker' THEN 'Offtaker'
    WHEN 'oem' THEN 'OEM'
    WHEN 'utility' THEN 'Utility'
    WHEN 'trader' THEN 'Trader'
    WHEN 'financial' THEN 'Financial'
    WHEN 'other' THEN 'Other'
    ELSE 'Unknown'
  END,
  NULLIF(upper(hq_country_code), '')::char(2),
  NULLIF(website, '')
FROM staging_companies
ON CONFLICT DO NOTHING;

-- Example upsert pattern (optional for future ingestion):
-- INSERT INTO companies (id, name, actor_type, hq_country_code, website)
-- SELECT ...
-- ON CONFLICT (id) DO UPDATE SET
--   name = EXCLUDED.name,
--   actor_type = EXCLUDED.actor_type,
--   hq_country_code = EXCLUDED.hq_country_code,
--   website = EXCLUDED.website,
--   updated_at = now();

INSERT INTO wind_farms (
  id, name, country_code, sea_basin, status_current, capacity_mw, turbine_count,
  developer_company_id, water_depth_m, foundation_type, centroid, commissioned_date, data_quality
)
SELECT
  NULLIF(id, '')::uuid,
  name,
  NULLIF(upper(country_code), '')::char(2),
  CASE lower(NULLIF(sea_basin, ''))
    WHEN 'north sea' THEN 'North Sea'
    WHEN 'baltic sea' THEN 'Baltic Sea'
    WHEN 'irish sea' THEN 'Irish Sea'
    WHEN 'atlantic' THEN 'Atlantic'
    WHEN 'mediterranean' THEN 'Mediterranean'
    WHEN 'black sea' THEN 'Black Sea'
    WHEN 'other' THEN 'Other'
    ELSE NULL
  END,
  CASE lower(coalesce(NULLIF(status_current, ''), 'unknown'))
    WHEN 'planned' THEN 'Planned'
    WHEN 'under construction' THEN 'Under Construction'
    WHEN 'operational' THEN 'Operational'
    WHEN 'decommissioned' THEN 'Decommissioned'
    ELSE 'Unknown'
  END,
  NULLIF(capacity_mw, '')::numeric,
  NULLIF(turbine_count, '')::integer,
  NULLIF(developer_company_id, '')::uuid,
  NULLIF(water_depth_m, '')::numeric,
  CASE lower(NULLIF(foundation_type, ''))
    WHEN 'monopile' THEN 'Monopile'
    WHEN 'jacket' THEN 'Jacket'
    WHEN 'gravity base' THEN 'Gravity Base'
    WHEN 'floating' THEN 'Floating'
    WHEN 'other' THEN 'Other'
    ELSE NULL
  END,
  CASE
    WHEN centroid_wkt ~* '^POINT\\s*\\(\\s*-?\\d+(\\.\\d+)?\\s+-?\\d+(\\.\\d+)?\\s*\\)$'
    THEN ST_GeogFromText(centroid_wkt)
  END,
  NULLIF(commissioned_date, '')::date,
  CASE lower(NULLIF(data_quality, ''))
    WHEN 'verified' THEN 'Verified'
    WHEN 'unverified' THEN 'Unverified'
    WHEN 'example' THEN 'Example'
    ELSE NULL
  END
FROM staging_wind_farms
ON CONFLICT DO NOTHING;

-- Example upsert pattern (optional for future ingestion):
-- INSERT INTO wind_farms (...)
-- SELECT ...
-- ON CONFLICT (id) DO UPDATE SET
--   name = EXCLUDED.name,
--   country_code = EXCLUDED.country_code,
--   sea_basin = EXCLUDED.sea_basin,
--   status_current = EXCLUDED.status_current,
--   capacity_mw = EXCLUDED.capacity_mw,
--   turbine_count = EXCLUDED.turbine_count,
--   developer_company_id = EXCLUDED.developer_company_id,
--   water_depth_m = EXCLUDED.water_depth_m,
--   foundation_type = EXCLUDED.foundation_type,
--   centroid = EXCLUDED.centroid,
--   commissioned_date = EXCLUDED.commissioned_date,
--   data_quality = EXCLUDED.data_quality,
--   updated_at = now();

INSERT INTO wind_farm_ownership (
  id, wind_farm_id, company_id, equity_share_pct, role_type, valid_from, valid_to, is_current, data_quality
)
SELECT
  NULLIF(id, '')::uuid,
  NULLIF(wind_farm_id, '')::uuid,
  NULLIF(company_id, '')::uuid,
  NULLIF(equity_share_pct, '')::numeric,
  CASE lower(NULLIF(role_type, ''))
    WHEN 'developer' THEN 'Developer'
    WHEN 'owner' THEN 'Owner'
    WHEN 'equity partner' THEN 'Equity Partner'
    WHEN 'operator' THEN 'Operator'
    WHEN 'other' THEN 'Other'
    ELSE NULL
  END,
  NULLIF(valid_from, '')::date,
  NULLIF(valid_to, '')::date,
  CASE
    WHEN lower(is_current) IN ('true', 't', '1', 'yes') THEN true
    WHEN lower(is_current) IN ('false', 'f', '0', 'no') THEN false
    ELSE true
  END,
  CASE lower(NULLIF(data_quality, ''))
    WHEN 'verified' THEN 'Verified'
    WHEN 'unverified' THEN 'Unverified'
    WHEN 'example' THEN 'Example'
    ELSE NULL
  END
FROM staging_wind_farm_ownership
ON CONFLICT DO NOTHING;

INSERT INTO contracts (
  id, wind_farm_id, contract_type, counterparty_company_id, start_date, end_date,
  price_eur_mwh, volume_mwh, verification_status, notes
)
SELECT
  NULLIF(id, '')::uuid,
  NULLIF(wind_farm_id, '')::uuid,
  CASE lower(coalesce(NULLIF(contract_type, ''), 'unknown'))
    WHEN 'cfd' THEN 'CfD'
    WHEN 'feed-in tariff' THEN 'Feed-in Tariff'
    WHEN 'corporate ppa' THEN 'Corporate PPA'
    WHEN 'merchant' THEN 'Merchant'
    WHEN 'green certificate' THEN 'Green Certificate'
    WHEN 'other' THEN 'Other'
    ELSE 'Unknown'
  END,
  NULLIF(counterparty_company_id, '')::uuid,
  NULLIF(start_date, '')::date,
  NULLIF(end_date, '')::date,
  NULLIF(price_eur_mwh, '')::numeric,
  NULLIF(volume_mwh, '')::numeric,
  CASE lower(NULLIF(verification_status, ''))
    WHEN 'verified' THEN 'Verified'
    WHEN 'unverified' THEN 'Unverified'
    WHEN 'example' THEN 'Example'
    ELSE NULL
  END,
  NULLIF(notes, '')
FROM staging_contracts
ON CONFLICT DO NOTHING;

INSERT INTO sources (id, name, url, description)
SELECT
  NULLIF(id, '')::uuid,
  name,
  NULLIF(url, ''),
  NULLIF(description, '')
FROM staging_sources
ON CONFLICT DO NOTHING;

INSERT INTO wind_farm_sources (wind_farm_id, source_id, field_name, notes)
SELECT
  NULLIF(wind_farm_id, '')::uuid,
  NULLIF(source_id, '')::uuid,
  COALESCE(NULLIF(field_name, ''), 'general'),
  NULLIF(notes, '')
FROM staging_wind_farm_sources
ON CONFLICT DO NOTHING;

INSERT INTO contract_sources (contract_id, source_id, field_name, notes)
SELECT
  NULLIF(contract_id, '')::uuid,
  NULLIF(source_id, '')::uuid,
  COALESCE(NULLIF(field_name, ''), 'general'),
  NULLIF(notes, '')
FROM staging_contract_sources
ON CONFLICT DO NOTHING;

-- 4) Minimal ingestion validation helpers
-- Duplicate companies (by normalized_name)
-- SELECT normalized_name, COUNT(*) FROM companies GROUP BY normalized_name HAVING COUNT(*) > 1;

-- Ownership totals > 100% per wind farm
-- SELECT wind_farm_id, SUM(equity_share_pct) AS total_pct
-- FROM wind_farm_ownership
-- GROUP BY wind_farm_id
-- HAVING SUM(equity_share_pct) > 100;

-- Projects missing centroid
-- SELECT id, name FROM wind_farms WHERE centroid IS NULL;

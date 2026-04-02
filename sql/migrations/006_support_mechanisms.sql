-- Migration 006: structured public support-mechanism data for offshore wind
-- Idempotent; safe to rerun
BEGIN;

CREATE TABLE IF NOT EXISTS wind_farm_support_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_key TEXT NOT NULL UNIQUE,
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  support_scheme_type TEXT NOT NULL CHECK (lower(support_scheme_type) IN (
    'cfd',
    'feed-in tariff',
    'market premium',
    'auction award',
    'zero-subsidy / zero-bid',
    'unknown'
  )),
  support_price_value NUMERIC,
  support_price_unit TEXT,
  support_price_currency TEXT,
  support_price_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (lower(support_price_basis) IN (
    'nominal',
    'real / indexed',
    'unknown'
  )),
  award_date DATE,
  award_year INTEGER,
  allocation_round TEXT,
  tender_name TEXT,
  current_price_value NUMERIC,
  current_price_date DATE,
  source_title TEXT,
  source_url TEXT,
  source_date DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (lower(confidence) IN (
    'confirmed',
    'inferred',
    'assumed',
    'unknown'
  )),
  notes TEXT,
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wind_farm_support_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  history_key TEXT NOT NULL UNIQUE,
  support_scheme_id UUID NOT NULL REFERENCES wind_farm_support_schemes(id) ON DELETE CASCADE,
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  price_value NUMERIC,
  currency TEXT,
  unit TEXT,
  price_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (lower(price_basis) IN (
    'nominal',
    'real / indexed',
    'unknown'
  )),
  observation_date DATE,
  observation_type TEXT NOT NULL CHECK (lower(observation_type) IN (
    'award',
    'rebased',
    'current',
    'indexed'
  )),
  source_title TEXT,
  source_url TEXT,
  source_date DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (lower(confidence) IN (
    'confirmed',
    'inferred',
    'assumed',
    'unknown'
  )),
  notes TEXT,
  ingest_batch_id UUID REFERENCES ingest_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wind_farm_support_schemes_wind_farm_idx
  ON wind_farm_support_schemes (wind_farm_id);

CREATE INDEX IF NOT EXISTS wind_farm_support_schemes_award_year_idx
  ON wind_farm_support_schemes (award_year);

CREATE INDEX IF NOT EXISTS wind_farm_support_price_history_farm_date_idx
  ON wind_farm_support_price_history (wind_farm_id, observation_date);

CREATE INDEX IF NOT EXISTS wind_farm_support_price_history_scheme_idx
  ON wind_farm_support_price_history (support_scheme_id);

COMMIT;

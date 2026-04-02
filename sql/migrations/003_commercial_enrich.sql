-- Migration 003: enrich contracts + ownership with confidence/provenance fields
-- Idempotent; safe to rerun
BEGIN;

-- ── contracts: add provenance fields ──────────────────────────────────────────
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS confidence      TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS is_public       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_url      TEXT,
  ADD COLUMN IF NOT EXISTS source_title    TEXT,
  ADD COLUMN IF NOT EXISTS source_date     DATE;

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_confidence_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_confidence_check
  CHECK (lower(confidence) IN ('confirmed','inferred','assumed','unknown'));

-- Expand contract_type to include utility offtake and orec
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_contract_type_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_contract_type_check
  CHECK (lower(contract_type) IN (
    'cfd','feed-in tariff','corporate ppa','utility offtake',
    'merchant','green certificate','orec','capacity market','other','unknown'
  ));

-- ── wind_farm_ownership: add confidence ───────────────────────────────────────
ALTER TABLE wind_farm_ownership
  ADD COLUMN IF NOT EXISTS confidence   TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS source_url   TEXT,
  ADD COLUMN IF NOT EXISTS source_title TEXT;

ALTER TABLE wind_farm_ownership DROP CONSTRAINT IF EXISTS wfo_confidence_check;
ALTER TABLE wind_farm_ownership ADD CONSTRAINT wfo_confidence_check
  CHECK (lower(confidence) IN ('confirmed','inferred','assumed','unknown'));

-- ── companies: add actor_type values for buyer/ppa roles ─────────────────────
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_actor_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_actor_type_check
  CHECK (lower(actor_type) IN (
    'developer','owner','offtaker','oem','utility',
    'trader','financial','other','unknown',
    'grid operator','government body','corporate buyer'
  ));

-- ── expand route_to_market ────────────────────────────────────────────────────
ALTER TABLE wind_farms DROP CONSTRAINT IF EXISTS wind_farms_route_to_market_check;
ALTER TABLE wind_farms ADD CONSTRAINT wind_farms_route_to_market_check
  CHECK (lower(route_to_market) IN (
    'cfd','feed-in tariff','corporate ppa','utility offtake',
    'merchant','green certificate','capacity market','orec','unknown'
  ));

COMMIT;

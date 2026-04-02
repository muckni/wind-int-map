-- Migration 007: wind farm cleanup support tables

CREATE TABLE IF NOT EXISTS wind_farm_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'duplicate-merge',
  source_wind_farm_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wind_farm_id, alias_name)
);

ALTER TABLE wind_farm_aliases
  DROP CONSTRAINT IF EXISTS wind_farm_aliases_alias_type_check;

ALTER TABLE wind_farm_aliases
  ADD CONSTRAINT wind_farm_aliases_alias_type_check
  CHECK (lower(alias_type) IN ('duplicate-merge', 'legacy-name', 'project-alias', 'other'));

ALTER TABLE wind_farm_aliases
  DROP CONSTRAINT IF EXISTS wind_farm_aliases_source_wind_farm_id_fkey;

ALTER TABLE wind_farm_aliases
  ADD CONSTRAINT wind_farm_aliases_source_wind_farm_id_fkey
  FOREIGN KEY (source_wind_farm_id) REFERENCES wind_farms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wind_farm_aliases_farm_idx
  ON wind_farm_aliases (wind_farm_id);

CREATE TABLE IF NOT EXISTS wind_farm_merge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  merged_wind_farm_id UUID,
  merged_name TEXT NOT NULL,
  merged_country_code CHAR(2) NOT NULL,
  merge_reason TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merged_country_code, merged_name)
);

ALTER TABLE wind_farm_merge_log
  DROP CONSTRAINT IF EXISTS wind_farm_merge_log_confidence_check;

ALTER TABLE wind_farm_merge_log
  ADD CONSTRAINT wind_farm_merge_log_confidence_check
  CHECK (lower(confidence) IN ('high', 'medium', 'low', 'unknown'));

CREATE INDEX IF NOT EXISTS wind_farm_merge_log_canonical_idx
  ON wind_farm_merge_log (canonical_wind_farm_id);

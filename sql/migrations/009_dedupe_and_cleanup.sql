-- ─────────────────────────────────────────────────────────────────────────────
-- 009_dedupe_and_cleanup.sql
--   1. Delete non-wind power stations that slipped in via Wikipedia ingest
--   2. Merge clear duplicate wind farms (keep the more complete row, transfer
--      ownership / contracts / EPC / sources / aliases / turbines / cables)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Drop non-wind plants ────────────────────────────────────────────────
DELETE FROM wind_farms
WHERE name ILIKE '%Nuclear Power Station%'
   OR name ILIKE 'T-Power Power Station'
   OR name ILIKE 'Ham Power Station'
   OR name ILIKE 'IVBO Brugge Power Station'
   OR name ILIKE 'Herdersbrug Power Station';

-- ── 2. Generic merge helper ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.merge_wind_farms(canonical uuid, dup uuid)
RETURNS void AS $$
BEGIN
  IF canonical = dup THEN RETURN; END IF;

  UPDATE wind_farm_ownership SET wind_farm_id = canonical
    WHERE wind_farm_id = dup
    AND NOT EXISTS (
      SELECT 1 FROM wind_farm_ownership o2
      WHERE o2.wind_farm_id = canonical AND o2.company_id = wind_farm_ownership.company_id
    );
  DELETE FROM wind_farm_ownership WHERE wind_farm_id = dup;

  UPDATE contracts SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE wind_farm_epc_packages SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE wind_farm_epc_company_roles SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE wind_farm_sources SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE wind_farm_support_schemes SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE wind_farm_support_price_history SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE turbines SET wind_farm_id = canonical WHERE wind_farm_id = dup;
  UPDATE cables SET connected_farm_id = canonical WHERE connected_farm_id = dup;

  -- record the merge as an alias on the canonical row
  INSERT INTO wind_farm_aliases (wind_farm_id, alias_name, alias_type, source_wind_farm_id)
  SELECT canonical, name, 'duplicate-merge', dup FROM wind_farms WHERE id = dup
  ON CONFLICT DO NOTHING;

  UPDATE wind_farm_aliases SET wind_farm_id = canonical WHERE wind_farm_id = dup;

  DELETE FROM wind_farms WHERE id = dup;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Pick canonical = the row with higher capacity_mw, more complete data ─
-- Merkur Offshore: keep the one with hyphen if they truly match by name+geo
SELECT pg_temp.merge_wind_farms(
  (SELECT id FROM wind_farms WHERE name = 'Merkur Offshore Wind Farm' LIMIT 1),
  (SELECT id FROM wind_farms WHERE name = 'Merkur-Offshore' LIMIT 1)
);

-- Blyth Offshore Wind Farm: keep the longer canonical name
SELECT pg_temp.merge_wind_farms(
  (SELECT id FROM wind_farms WHERE name = 'Blyth Offshore Wind Farm' LIMIT 1),
  (SELECT id FROM wind_farms WHERE name = 'Blyth Offshore' LIMIT 1)
);

-- Westermeerwind: keep the row with capacity (144 MW)
SELECT pg_temp.merge_wind_farms(
  (SELECT id FROM wind_farms WHERE name = 'Westermeerwind (Noordoostpolder)' LIMIT 1),
  (SELECT id FROM wind_farms WHERE name = 'Westermeerwind wind farm' LIMIT 1)
);

-- Nissum Bredning: keep the row with capacity (28 MW)
SELECT pg_temp.merge_wind_farms(
  (SELECT id FROM wind_farms WHERE name = 'Nissum Bredning Havvindmøller' LIMIT 1),
  (SELECT id FROM wind_farms WHERE name = 'Nissum Bredning Wind Farm' LIMIT 1)
);

-- Gunfleet Sands: keep parent (172 MW), absorb the 108 MW phase-1 alias
SELECT pg_temp.merge_wind_farms(
  (SELECT id FROM wind_farms WHERE name = 'Gunfleet Sands Offshore Wind Farm' LIMIT 1),
  (SELECT id FROM wind_farms WHERE name = 'Gunfleet Sands 1 Offshore Wind Farm' LIMIT 1)
);

-- ── 4. Refresh company tile table so derived markers stay in sync ──────────
SELECT refresh_company_locations_tiles();

COMMIT;

-- Quick post-checks
SELECT 'wind_farms_total' AS k, count(*) FROM wind_farms
UNION ALL SELECT 'wind_farms_below_50mw', count(*) FROM wind_farms WHERE capacity_mw < 50
UNION ALL SELECT 'wind_farms_50mw_or_more', count(*) FROM wind_farms WHERE capacity_mw >= 50;

-- =============================================================================
-- OFFSHORE WIND INTELLIGENCE — V4 SEED: PPA / Offtaker companies
-- Adds real contract counterparties (government CfD bodies, utilities, corporate
-- PPA buyers) and links them to existing contracts.
-- Rerunnable: guarded by ingest_batches.batch_name unique index.
-- =============================================================================

DO $$
DECLARE
  _batch UUID;

  -- Offtaker / PPA counterparty company IDs
  _lccc         UUID;  -- Low Carbon Contracts Company (UK CfD)
  _lipa         UUID;  -- Long Island Power Authority (NY OREC)
  _nstar        UUID;  -- Eversource/NSTAR (MA OREC)
  _enbw_grid    UUID;  -- EnBW Netze (German EEG offtaker — TSO)
  _tennet       UUID;  -- TenneT TSO (NL / DE EEG)
  _energinet    UUID;  -- Energinet (Danish TSO / offtaker)
  _elia         UUID;  -- Elia (Belgian TSO)

  -- Farm IDs needed
  _hornsea1     UUID; _hornsea2     UUID; _dogger_a     UUID; _dogger_b     UUID;
  _dogger_c     UUID; _ea_one       UUID; _triton_knoll UUID; _beatrice     UUID;
  _moray_east   UUID; _seagreen     UUID; _race_bank    UUID; _galloper     UUID;
  _walney_ext   UUID;
  _borkum1      UUID; _borkum2      UUID; _gode12       UUID; _amrumbank    UUID;
  _baltic1      UUID; _baltic2      UUID; _global_tech  UUID;
  _horns_rev2   UUID; _horns_rev3   UUID; _anholt       UUID; _kriegers     UUID;
  _gemini       UUID; _borssele12   UUID;
  _belwind      UUID; _northwind    UUID;
  _vineyard     UUID; _south_fork   UUID;

BEGIN
  IF EXISTS (SELECT 1 FROM ingest_batches WHERE batch_name = 'seed_v4_ppa') THEN
    RAISE NOTICE 'seed_v4_ppa already loaded — skipping.';
    RETURN;
  END IF;

  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
  VALUES ('seed_v4_ppa', 'Curated research compilation', 'seed_v4_ppa.sql',
    'PPA/offtaker company records and contract counterparty links')
  RETURNING id INTO _batch;

  -- ── Insert offtaker / government body companies ───────────────────────────
  INSERT INTO companies (name, actor_type, hq_country_code, website)
  VALUES
    ('Low Carbon Contracts Company',  'offtaker', 'GB', 'https://www.lowcarboncontracts.uk'),
    ('Long Island Power Authority',   'utility',  'US', 'https://www.lipower.org'),
    ('Eversource Energy',             'utility',  'US', 'https://www.eversource.com'),
    ('TenneT TSO',                    'utility',  'NL', 'https://www.tennet.eu'),
    ('Energinet',                     'utility',  'DK', 'https://en.energinet.dk'),
    ('Elia Group',                    'utility',  'BE', 'https://www.elia.be'),
    ('Bundesnetzagentur (EEG)',       'offtaker', 'DE', 'https://www.bundesnetzagentur.de')
  ON CONFLICT (normalized_name) DO NOTHING;

  -- ── Look up company IDs ───────────────────────────────────────────────────
  SELECT id INTO _lccc      FROM companies WHERE normalized_name = lower('Low Carbon Contracts Company');
  SELECT id INTO _lipa      FROM companies WHERE normalized_name = lower('Long Island Power Authority');
  SELECT id INTO _nstar     FROM companies WHERE normalized_name = lower('Eversource Energy');
  SELECT id INTO _tennet    FROM companies WHERE normalized_name = lower('TenneT TSO');
  SELECT id INTO _energinet FROM companies WHERE normalized_name = lower('Energinet');
  SELECT id INTO _elia      FROM companies WHERE normalized_name = lower('Elia Group');
  SELECT id INTO _enbw_grid FROM companies WHERE normalized_name = lower('Bundesnetzagentur (EEG)');

  -- ── HQ locations ─────────────────────────────────────────────────────────
  INSERT INTO company_locations (company_id, location, location_type, city, country_code)
  SELECT c, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, 'hq', city, cc
  FROM (VALUES
    (_lccc,      -0.0823,  51.5014, 'London',        'GB'),
    (_lipa,      -73.8677,  40.7282, 'Uniondale NY',  'US'),
    (_nstar,     -72.6395,  42.0014, 'Springfield MA','US'),
    (_tennet,     5.8772,  51.8126, 'Arnhem',        'NL'),
    (_energinet, 10.2095,  55.3651, 'Fredericia',    'DK'),
    (_elia,       4.3517,  50.8503, 'Brussels',      'BE'),
    (_enbw_grid, 10.8566,  53.8654, 'Bonn',          'DE')
  ) AS t(c, lng, lat, city, cc)
  WHERE c IS NOT NULL
  ON CONFLICT (company_id, location_type) DO NOTHING;

  -- ── Wind farm ID lookups ──────────────────────────────────────────────────
  SELECT id INTO _hornsea1     FROM wind_farms WHERE normalized_name = 'hornsea one'         AND country_code = 'GB';
  SELECT id INTO _hornsea2     FROM wind_farms WHERE normalized_name = 'hornsea two'         AND country_code = 'GB';
  SELECT id INTO _dogger_a     FROM wind_farms WHERE normalized_name = 'dogger bank a'       AND country_code = 'GB';
  SELECT id INTO _dogger_b     FROM wind_farms WHERE normalized_name = 'dogger bank b'       AND country_code = 'GB';
  SELECT id INTO _dogger_c     FROM wind_farms WHERE normalized_name = 'dogger bank c'       AND country_code = 'GB';
  SELECT id INTO _ea_one       FROM wind_farms WHERE normalized_name = 'east anglia one'     AND country_code = 'GB';
  SELECT id INTO _triton_knoll FROM wind_farms WHERE normalized_name = 'triton knoll'        AND country_code = 'GB';
  SELECT id INTO _beatrice     FROM wind_farms WHERE normalized_name = 'beatrice'            AND country_code = 'GB';
  SELECT id INTO _moray_east   FROM wind_farms WHERE normalized_name = 'moray east'          AND country_code = 'GB';
  SELECT id INTO _seagreen     FROM wind_farms WHERE normalized_name = 'seagreen'            AND country_code = 'GB';
  SELECT id INTO _race_bank    FROM wind_farms WHERE normalized_name = 'race bank'           AND country_code = 'GB';
  SELECT id INTO _galloper     FROM wind_farms WHERE normalized_name = 'galloper'            AND country_code = 'GB';
  SELECT id INTO _walney_ext   FROM wind_farms WHERE normalized_name = 'walney extension'    AND country_code = 'GB';
  SELECT id INTO _borkum1      FROM wind_farms WHERE normalized_name = 'borkum riffgrund 1'  AND country_code = 'DE';
  SELECT id INTO _borkum2      FROM wind_farms WHERE normalized_name = 'borkum riffgrund 2'  AND country_code = 'DE';
  SELECT id INTO _gode12       FROM wind_farms WHERE normalized_name ILIKE 'gode wind 1%'    AND country_code = 'DE';
  SELECT id INTO _amrumbank    FROM wind_farms WHERE normalized_name = 'amrumbank west'      AND country_code = 'DE';
  SELECT id INTO _baltic1      FROM wind_farms WHERE normalized_name = 'enbw baltic 1'       AND country_code = 'DE';
  SELECT id INTO _baltic2      FROM wind_farms WHERE normalized_name = 'enbw baltic 2'       AND country_code = 'DE';
  SELECT id INTO _global_tech  FROM wind_farms WHERE normalized_name = 'global tech i'       AND country_code = 'DE';
  SELECT id INTO _horns_rev2   FROM wind_farms WHERE normalized_name = 'horns rev 2'         AND country_code = 'DK';
  SELECT id INTO _horns_rev3   FROM wind_farms WHERE normalized_name = 'horns rev 3'         AND country_code = 'DK';
  SELECT id INTO _anholt       FROM wind_farms WHERE normalized_name = 'anholt'              AND country_code = 'DK';
  SELECT id INTO _kriegers     FROM wind_farms WHERE normalized_name = 'kriegers flak'       AND country_code = 'DK';
  SELECT id INTO _gemini       FROM wind_farms WHERE normalized_name = 'gemini'              AND country_code = 'NL';
  SELECT id INTO _borssele12   FROM wind_farms WHERE normalized_name ILIKE 'borssele i%'     AND country_code = 'NL';
  SELECT id INTO _belwind      FROM wind_farms WHERE normalized_name = 'belwind'             AND country_code = 'BE';
  SELECT id INTO _northwind    FROM wind_farms WHERE normalized_name = 'northwind'           AND country_code = 'BE';
  SELECT id INTO _vineyard     FROM wind_farms WHERE normalized_name = 'vineyard wind 1'     AND country_code = 'US';
  SELECT id INTO _south_fork   FROM wind_farms WHERE normalized_name = 'south fork wind'     AND country_code = 'US';

  -- ── Link counterparty to existing contracts ───────────────────────────────
  -- UK CfD counterparty = LCCC
  UPDATE contracts SET counterparty_company_id = _lccc
  WHERE wind_farm_id IN (
    _hornsea1, _hornsea2, _dogger_a, _dogger_b, _dogger_c,
    _ea_one, _triton_knoll, _beatrice, _moray_east, _seagreen,
    _race_bank, _galloper, _walney_ext
  )
    AND contract_type = 'cfd'
    AND counterparty_company_id IS NULL
    AND _lccc IS NOT NULL;

  -- Germany EEG = Bundesnetzagentur
  UPDATE contracts SET counterparty_company_id = _enbw_grid
  WHERE wind_farm_id IN (
    _borkum1, _borkum2, _gode12, _amrumbank, _baltic1, _baltic2, _global_tech
  )
    AND contract_type = 'feed-in tariff'
    AND counterparty_company_id IS NULL
    AND _enbw_grid IS NOT NULL;

  -- Denmark feed-in tariff = Energinet
  UPDATE contracts SET counterparty_company_id = _energinet
  WHERE wind_farm_id IN (_horns_rev2, _horns_rev3, _anholt, _kriegers)
    AND contract_type = 'feed-in tariff'
    AND counterparty_company_id IS NULL
    AND _energinet IS NOT NULL;

  -- Netherlands SDE+ = TenneT TSO
  UPDATE contracts SET counterparty_company_id = _tennet
  WHERE wind_farm_id IN (_gemini, _borssele12)
    AND contract_type = 'feed-in tariff'
    AND counterparty_company_id IS NULL
    AND _tennet IS NOT NULL;

  -- Belgium green certificate = Elia
  UPDATE contracts SET counterparty_company_id = _elia
  WHERE wind_farm_id IN (_belwind, _northwind)
    AND contract_type IN ('feed-in tariff', 'green certificate')
    AND counterparty_company_id IS NULL
    AND _elia IS NOT NULL;

  -- USA OREC = state utilities
  UPDATE contracts SET counterparty_company_id = _nstar
  WHERE wind_farm_id = _vineyard
    AND contract_type = 'corporate ppa'
    AND counterparty_company_id IS NULL
    AND _nstar IS NOT NULL;

  UPDATE contracts SET counterparty_company_id = _lipa
  WHERE wind_farm_id = _south_fork
    AND contract_type = 'corporate ppa'
    AND counterparty_company_id IS NULL
    AND _lipa IS NOT NULL;

  -- ── Also add ownership rows for Elia (Belgium) ────────────────────────────
  -- Elia is the TSO / grid connection party but not an equity owner — skip.

  RAISE NOTICE 'seed_v4_ppa loaded successfully.';
END;
$$;

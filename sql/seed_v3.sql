-- =============================================================================
-- OFFSHORE WIND INTELLIGENCE — V3 SEED
-- Geometry (turbines + polygons), company HQ locations, ownership, contracts,
-- route-to-market metadata.
-- Run after: schema.sql + migrations/001 + migrations/002 + seed_v2
-- Rerunnable: guarded by ingest_batches.batch_name unique index.
-- =============================================================================

DO $$
DECLARE
  _batch UUID;

  -- Company vars
  _orsted       UUID; _vattenfall   UUID; _rwe          UUID; _equinor      UUID;
  _sse          UUID; _enbw         UUID; _northland    UUID; _scottishpower UUID;
  _edf          UUID; _eon          UUID; _shell        UUID; _bp           UUID;
  _iberdrola    UUID; _total        UUID; _parkwind     UUID; _cpower       UUID;
  _cip          UUID; _avangrid     UUID; _dominion     UUID; _jera         UUID;
  _marubeni     UUID; _eneco        UUID; _edp          UUID;
  _rentel       UUID; _norther      UUID;

  -- Wind farm vars (key farms for ownership/contracts)
  _hornsea1     UUID; _hornsea2     UUID; _hornsea3     UUID;
  _dogger_a     UUID; _dogger_b     UUID; _dogger_c     UUID;
  _london_array UUID; _race_bank    UUID; _walney_ext   UUID;
  _ea_one       UUID; _thanet       UUID; _beatrice     UUID;
  _moray_east   UUID; _seagreen     UUID; _triton_knoll UUID;
  _sheringham   UUID; _dudgeon      UUID; _galloper     UUID;
  _rampion      UUID; _horns_rev1   UUID; _horns_rev2   UUID;
  _horns_rev3   UUID; _anholt       UUID; _kriegers     UUID;
  _borkum1      UUID; _borkum2      UUID; _gode12       UUID;
  _amrumbank    UUID; _baltic1      UUID; _baltic2      UUID;
  _global_tech  UUID; _dt_bucht     UUID;
  _gemini       UUID; _borssele12   UUID; _borssele34   UUID;
  _belwind      UUID; _northwind    UUID;
  _vineyard     UUID; _south_fork   UUID; _revolution   UUID;

BEGIN
  -- ── Idempotency guard ───────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM ingest_batches WHERE batch_name = 'seed_v3') THEN
    RAISE NOTICE 'seed_v3 already loaded — skipping.';
    RETURN;
  END IF;

  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
  VALUES ('seed_v3', 'Curated research compilation', 'seed_v3.sql',
    'Geometry generation, company HQ locations, ownership stakes, CfD/PPA contracts')
  RETURNING id INTO _batch;

  -- ── Look up company IDs ────────────────────────────────────────────────────
  SELECT id INTO _orsted        FROM companies WHERE normalized_name = lower('Ørsted');
  SELECT id INTO _vattenfall    FROM companies WHERE normalized_name = lower('Vattenfall');
  SELECT id INTO _rwe           FROM companies WHERE normalized_name = lower('RWE Renewables');
  SELECT id INTO _equinor       FROM companies WHERE normalized_name = lower('Equinor');
  SELECT id INTO _sse           FROM companies WHERE normalized_name = lower('SSE Renewables');
  SELECT id INTO _enbw          FROM companies WHERE normalized_name = lower('EnBW Renewables');
  SELECT id INTO _northland     FROM companies WHERE normalized_name = lower('Northland Power');
  SELECT id INTO _scottishpower FROM companies WHERE normalized_name = lower('ScottishPower Renewables');
  SELECT id INTO _edf           FROM companies WHERE normalized_name = lower('EDF Renewables');
  SELECT id INTO _eon           FROM companies WHERE normalized_name = lower('E.ON Climate & Renewables');
  SELECT id INTO _shell         FROM companies WHERE normalized_name = lower('Shell');
  SELECT id INTO _bp            FROM companies WHERE normalized_name = lower('bp');
  SELECT id INTO _iberdrola     FROM companies WHERE normalized_name = lower('Iberdrola');
  SELECT id INTO _total         FROM companies WHERE normalized_name = lower('TotalEnergies');
  SELECT id INTO _parkwind      FROM companies WHERE normalized_name = lower('Parkwind');
  SELECT id INTO _cpower        FROM companies WHERE normalized_name = lower('C-Power');
  SELECT id INTO _cip           FROM companies WHERE normalized_name = lower('Copenhagen Infrastructure Partners');
  SELECT id INTO _avangrid      FROM companies WHERE normalized_name = lower('Avangrid Renewables');
  SELECT id INTO _dominion      FROM companies WHERE normalized_name = lower('Dominion Energy');
  SELECT id INTO _jera          FROM companies WHERE normalized_name = lower('JERA');
  SELECT id INTO _marubeni      FROM companies WHERE normalized_name = lower('Marubeni');
  SELECT id INTO _eneco         FROM companies WHERE normalized_name = lower('Eneco');
  SELECT id INTO _edp           FROM companies WHERE normalized_name = lower('EDP Renewables');
  SELECT id INTO _rentel        FROM companies WHERE normalized_name = lower('Rentel NV');
  SELECT id INTO _norther       FROM companies WHERE normalized_name = lower('Norther NV');

  -- ── Company HQ locations ──────────────────────────────────────────────────
  -- Only insert where company exists (guard with WHERE company_id IS NOT NULL)
  INSERT INTO company_locations (company_id, location, location_type, city, country_code)
  SELECT c, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, 'hq', city, cc
  FROM (VALUES
    (_orsted,        12.5528,  55.5658, 'Fredericia',    'DK'),
    (_vattenfall,    17.9991,  59.3579, 'Solna',         'SE'),
    (_rwe,            7.0127,  51.4509, 'Essen',         'DE'),
    (_equinor,        5.7331,  58.9700, 'Stavanger',     'NO'),
    (_sse,           -3.4370,  56.3965, 'Perth',         'GB'),
    (_enbw,           8.4037,  49.0088, 'Karlsruhe',     'DE'),
    (_northland,    -79.3832,  43.6532, 'Toronto',       'CA'),
    (_scottishpower, -4.2518,  55.8642, 'Glasgow',       'GB'),
    (_edf,            2.3522,  48.8566, 'Paris',         'FR'),
    (_eon,            6.7835,  51.4220, 'Essen',         'DE'),
    (_shell,          4.3007,  52.0705, 'The Hague',     'NL'),
    (_bp,            -0.1278,  51.5074, 'London',        'GB'),
    (_iberdrola,     -2.9350,  43.2630, 'Bilbao',        'ES'),
    (_total,          2.2437,  48.8979, 'Courbevoie',    'FR'),
    (_parkwind,       4.6997,  50.8827, 'Leuven',        'BE'),
    (_cpower,         2.9171,  51.2296, 'Ostend',        'BE'),
    (_cip,           12.5683,  55.6761, 'Copenhagen',    'DK'),
    (_avangrid,     -73.0193,  41.2792, 'Orange CT',     'US'),
    (_dominion,     -77.4360,  37.5407, 'Richmond VA',   'US'),
    (_jera,         139.6503,  35.6762, 'Tokyo',         'JP'),
    (_marubeni,     139.7637,  35.6721, 'Tokyo',         'JP'),
    (_eneco,          4.4792,  51.9225, 'Rotterdam',     'NL'),
    (_edp,           -3.7038,  40.4168, 'Madrid',        'ES'),
    (_rentel,         2.9171,  51.2296, 'Ostend',        'BE'),
    (_norther,        2.9171,  51.2296, 'Ostend',        'BE')
  ) AS t(c, lng, lat, city, cc)
  WHERE c IS NOT NULL
  ON CONFLICT (company_id, location_type) DO NOTHING;

  -- ── Wind farm ID lookups ───────────────────────────────────────────────────
  SELECT id INTO _hornsea1     FROM wind_farms WHERE normalized_name = 'hornsea one'         AND country_code = 'GB';
  SELECT id INTO _hornsea2     FROM wind_farms WHERE normalized_name = 'hornsea two'         AND country_code = 'GB';
  SELECT id INTO _hornsea3     FROM wind_farms WHERE normalized_name = 'hornsea three'       AND country_code = 'GB';
  SELECT id INTO _dogger_a     FROM wind_farms WHERE normalized_name = 'dogger bank a'       AND country_code = 'GB';
  SELECT id INTO _dogger_b     FROM wind_farms WHERE normalized_name = 'dogger bank b'       AND country_code = 'GB';
  SELECT id INTO _dogger_c     FROM wind_farms WHERE normalized_name = 'dogger bank c'       AND country_code = 'GB';
  SELECT id INTO _london_array FROM wind_farms WHERE normalized_name = 'london array'        AND country_code = 'GB';
  SELECT id INTO _race_bank    FROM wind_farms WHERE normalized_name = 'race bank'           AND country_code = 'GB';
  SELECT id INTO _walney_ext   FROM wind_farms WHERE normalized_name = 'walney extension'    AND country_code = 'GB';
  SELECT id INTO _ea_one       FROM wind_farms WHERE normalized_name = 'east anglia one'     AND country_code = 'GB';
  SELECT id INTO _thanet       FROM wind_farms WHERE normalized_name = 'thanet'              AND country_code = 'GB';
  SELECT id INTO _beatrice      FROM wind_farms WHERE normalized_name = 'beatrice'            AND country_code = 'GB';
  SELECT id INTO _moray_east   FROM wind_farms WHERE normalized_name = 'moray east'          AND country_code = 'GB';
  SELECT id INTO _seagreen     FROM wind_farms WHERE normalized_name = 'seagreen'            AND country_code = 'GB';
  SELECT id INTO _triton_knoll FROM wind_farms WHERE normalized_name = 'triton knoll'        AND country_code = 'GB';
  SELECT id INTO _sheringham   FROM wind_farms WHERE normalized_name = 'sheringham shoal'    AND country_code = 'GB';
  SELECT id INTO _dudgeon      FROM wind_farms WHERE normalized_name = 'dudgeon'             AND country_code = 'GB';
  SELECT id INTO _galloper     FROM wind_farms WHERE normalized_name = 'galloper'            AND country_code = 'GB';
  SELECT id INTO _rampion      FROM wind_farms WHERE normalized_name = 'rampion'             AND country_code = 'GB';
  SELECT id INTO _horns_rev1   FROM wind_farms WHERE normalized_name = 'horns rev 1'         AND country_code = 'DK';
  SELECT id INTO _horns_rev2   FROM wind_farms WHERE normalized_name = 'horns rev 2'         AND country_code = 'DK';
  SELECT id INTO _horns_rev3   FROM wind_farms WHERE normalized_name = 'horns rev 3'         AND country_code = 'DK';
  SELECT id INTO _anholt       FROM wind_farms WHERE normalized_name = 'anholt'              AND country_code = 'DK';
  SELECT id INTO _kriegers     FROM wind_farms WHERE normalized_name = 'kriegers flak'       AND country_code = 'DK';
  SELECT id INTO _borkum1      FROM wind_farms WHERE normalized_name = 'borkum riffgrund 1'  AND country_code = 'DE';
  SELECT id INTO _borkum2      FROM wind_farms WHERE normalized_name = 'borkum riffgrund 2'  AND country_code = 'DE';
  SELECT id INTO _gode12       FROM wind_farms WHERE normalized_name ILIKE 'gode wind 1%'    AND country_code = 'DE';
  SELECT id INTO _amrumbank    FROM wind_farms WHERE normalized_name = 'amrumbank west'      AND country_code = 'DE';
  SELECT id INTO _baltic1      FROM wind_farms WHERE normalized_name = 'enbw baltic 1'       AND country_code = 'DE';
  SELECT id INTO _baltic2      FROM wind_farms WHERE normalized_name = 'enbw baltic 2'       AND country_code = 'DE';
  SELECT id INTO _global_tech  FROM wind_farms WHERE normalized_name = 'global tech i'       AND country_code = 'DE';
  SELECT id INTO _dt_bucht     FROM wind_farms WHERE normalized_name = 'deutsche bucht'      AND country_code = 'DE';
  SELECT id INTO _gemini       FROM wind_farms WHERE normalized_name = 'gemini'              AND country_code = 'NL';
  SELECT id INTO _borssele12   FROM wind_farms WHERE normalized_name ILIKE 'borssele i%'     AND country_code = 'NL';
  SELECT id INTO _borssele34   FROM wind_farms WHERE normalized_name ILIKE 'borssele iii%'   AND country_code = 'NL';
  SELECT id INTO _belwind      FROM wind_farms WHERE normalized_name = 'belwind'             AND country_code = 'BE';
  SELECT id INTO _northwind    FROM wind_farms WHERE normalized_name = 'northwind'           AND country_code = 'BE';
  SELECT id INTO _vineyard     FROM wind_farms WHERE normalized_name = 'vineyard wind 1'     AND country_code = 'US';
  SELECT id INTO _south_fork   FROM wind_farms WHERE normalized_name = 'south fork wind'     AND country_code = 'US';
  SELECT id INTO _revolution   FROM wind_farms WHERE normalized_name = 'revolution wind'     AND country_code = 'US';

  -- ── Turbine layout generation ─────────────────────────────────────────────
  -- Generate grid turbine positions for all farms with 1–180 turbines
  -- Grid: ceil(sqrt(N)) columns, rows derived. Spacing ~850m.
  INSERT INTO turbines (wind_farm_id, turbine_index, location, geometry_quality, ingest_batch_id)
  SELECT
    wf.id,
    gs.idx,
    ST_SetSRID(
      ST_MakePoint(
        ST_X(wf.centroid::geometry)
          + (gs.col_i - (gs.n_cols - 1.0) / 2.0)
            * 850.0 / (111320.0 * COS(RADIANS(ST_Y(wf.centroid::geometry)))),
        ST_Y(wf.centroid::geometry)
          + (gs.row_i - (gs.n_rows - 1.0) / 2.0)
            * 850.0 / 111320.0
      ),
      4326
    )::geography,
    'generated',
    _batch
  FROM wind_farms wf
  CROSS JOIN LATERAL (
    SELECT
      n - 1                                                                      AS idx,
      ((n - 1) % GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::INT, 1))       AS col_i,
      ((n - 1) / GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::INT, 1))       AS row_i,
      GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC))::NUMERIC,        1.0)      AS n_cols,
      GREATEST(CEIL(wf.turbine_count::NUMERIC /
               GREATEST(CEIL(SQRT(wf.turbine_count::NUMERIC)), 1.0)), 1.0)      AS n_rows
    FROM generate_series(1, wf.turbine_count) AS n
  ) gs
  WHERE wf.turbine_count BETWEEN 1 AND 180
    AND wf.centroid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM turbines t WHERE t.wind_farm_id = wf.id)
  ON CONFLICT (wind_farm_id, turbine_index) WHERE turbine_index IS NOT NULL DO NOTHING;

  -- ── Farm polygon approximation ────────────────────────────────────────────
  -- Convex hull of turbine grid, buffered 400 m (farms with generated turbines)
  UPDATE wind_farms wf
  SET
    project_area     = ST_Buffer(
                         ST_ConvexHull(
                           (SELECT ST_Collect(t.location::geometry)
                            FROM turbines t WHERE t.wind_farm_id = wf.id)
                         )::geography,
                         400
                       ),
    geometry_quality = 'generated'
  WHERE wf.centroid IS NOT NULL
    AND wf.project_area IS NULL
    AND EXISTS (SELECT 1 FROM turbines t WHERE t.wind_farm_id = wf.id);

  -- Circular buffer for farms without turbines (radius ∝ sqrt(capacity))
  UPDATE wind_farms
  SET
    project_area     = ST_Buffer(centroid,
                         GREATEST(SQRT(COALESCE(capacity_mw, 100)::NUMERIC) * 650.0, 1500.0)),
    geometry_quality = 'generated'
  WHERE centroid IS NOT NULL
    AND project_area IS NULL;

  -- ── Ownership records ─────────────────────────────────────────────────────
  -- UK — major farms
  INSERT INTO wind_farm_ownership
    (wind_farm_id, company_id, equity_share_pct, role_type, is_current, data_quality, ingest_batch_id)
  SELECT farm_id, co_id, pct, role, true, 'unverified', _batch
  FROM (VALUES
    -- Hornsea One: Ørsted 100%
    (_hornsea1,     _orsted,        100.0, 'owner'),
    -- Hornsea Two: Ørsted 100%
    (_hornsea2,     _orsted,        100.0, 'owner'),
    -- Dogger Bank A: SSE 50% / Equinor 50%
    (_dogger_a,     _sse,            50.0, 'equity partner'),
    (_dogger_a,     _equinor,        50.0, 'equity partner'),
    -- Dogger Bank B: SSE 50% / Equinor 50%
    (_dogger_b,     _sse,            50.0, 'equity partner'),
    (_dogger_b,     _equinor,        50.0, 'equity partner'),
    -- Dogger Bank C: SSE 50% / Equinor 50%
    (_dogger_c,     _sse,            50.0, 'equity partner'),
    (_dogger_c,     _equinor,        50.0, 'equity partner'),
    -- London Array: Ørsted 50% / E.ON 30% / CIP 20%
    (_london_array, _orsted,         50.0, 'equity partner'),
    (_london_array, _eon,            30.0, 'equity partner'),
    (_london_array, _cip,            20.0, 'equity partner'),
    -- Race Bank: Ørsted 100%
    (_race_bank,    _orsted,        100.0, 'owner'),
    -- Walney Extension: Ørsted 100%
    (_walney_ext,   _orsted,        100.0, 'owner'),
    -- East Anglia One: ScottishPower 100%
    (_ea_one,       _scottishpower, 100.0, 'owner'),
    -- Thanet: Vattenfall 100%
    (_thanet,       _vattenfall,    100.0, 'owner'),
    -- Beatrice: SSE 40% / CIP 35% (simplified)
    (_beatrice,     _sse,            40.0, 'equity partner'),
    (_beatrice,     _cip,            35.0, 'equity partner'),
    -- Moray East: EDP Renewables 33% / Diamond Green 33% / PTTEP 33%
    (_moray_east,   _edp,            33.3, 'equity partner'),
    -- Seagreen: SSE 49% / TotalEnergies 51%
    (_seagreen,     _sse,            49.0, 'equity partner'),
    (_seagreen,     _total,          51.0, 'equity partner'),
    -- Triton Knoll: RWE Renewables 59%
    (_triton_knoll, _rwe,            59.0, 'equity partner'),
    -- Sheringham Shoal: Equinor 40%
    (_sheringham,   _equinor,        40.0, 'equity partner'),
    -- Dudgeon: Equinor 35% / Statkraft 30% / Shell 35%
    (_dudgeon,      _equinor,        35.0, 'equity partner'),
    (_dudgeon,      _shell,          35.0, 'equity partner'),
    -- Galloper: RWE 50% / CIP 25%
    (_galloper,     _rwe,            50.0, 'equity partner'),
    (_galloper,     _cip,            25.0, 'equity partner'),
    -- Rampion: E.ON 50% (simplified)
    (_rampion,      _eon,            50.0, 'equity partner'),
    -- Denmark
    (_horns_rev1,   _orsted,         60.0, 'equity partner'),
    (_horns_rev1,   _vattenfall,     40.0, 'equity partner'),
    (_horns_rev2,   _orsted,        100.0, 'owner'),
    (_horns_rev3,   _vattenfall,     80.0, 'equity partner'),
    (_anholt,       _orsted,        100.0, 'owner'),
    (_kriegers,     _vattenfall,    100.0, 'owner'),
    -- Germany
    (_borkum1,      _orsted,        100.0, 'owner'),
    (_borkum2,      _orsted,         50.0, 'equity partner'),
    (_gode12,       _orsted,        100.0, 'owner'),
    (_amrumbank,    _vattenfall,    100.0, 'owner'),
    (_baltic1,      _enbw,          100.0, 'owner'),
    (_baltic2,      _enbw,          100.0, 'owner'),
    (_global_tech,  _northland,     100.0, 'owner'),
    (_dt_bucht,     _northland,     100.0, 'owner'),
    -- Netherlands
    (_gemini,       _northland,      60.0, 'equity partner'),
    (_borssele12,   _orsted,        100.0, 'owner'),
    (_borssele34,   _shell,          20.0, 'equity partner'),
    (_borssele34,   _eneco,          20.0, 'equity partner'),
    -- Belgium
    (_belwind,      _parkwind,       55.0, 'equity partner'),
    (_northwind,    _parkwind,       100.0,'owner'),
    -- USA
    (_vineyard,     _avangrid,       50.0, 'equity partner'),
    (_vineyard,     _cip,            50.0, 'equity partner'),
    (_south_fork,   _orsted,         50.0, 'equity partner'),
    (_revolution,   _orsted,         50.0, 'equity partner')
  ) AS t(farm_id, co_id, pct, role)
  WHERE farm_id IS NOT NULL AND co_id IS NOT NULL;

  -- ── Contracts (CfD / feed-in tariff / PPA) ────────────────────────────────
  INSERT INTO contracts
    (wind_farm_id, contract_type, counterparty_company_id,
     start_date, end_date, price_eur_mwh, verification_status, notes, ingest_batch_id)
  SELECT farm_id, ctype, NULL,
         sdate::date, edate::date, price, 'unverified', note, _batch
  FROM (VALUES
    -- UK CfD (prices converted from £/MWh at ~1.10 rate, 2012 reference prices)
    (_hornsea1,    'cfd', '2019-01-01','2034-01-01', 154.0, 'AR1 2015; £140/MWh 2012 prices'),
    (_hornsea2,    'cfd', '2022-08-01','2037-08-01',  63.3, 'AR3 2019; £57.50/MWh 2012 prices'),
    (_dogger_a,    'cfd', '2026-01-01','2041-01-01',  43.6, 'AR4 2019; £39.65/MWh 2012 prices'),
    (_dogger_b,    'cfd', '2026-06-01','2041-06-01',  45.8, 'AR4 2019; £41.61/MWh 2012 prices'),
    (_dogger_c,    'cfd', '2027-01-01','2042-01-01',  56.4, 'AR4 2019; £51.27/MWh 2012 prices'),
    (_ea_one,      'cfd', '2019-11-01','2034-11-01', 131.9, 'AR2 2017; £119.89/MWh 2012 prices'),
    (_triton_knoll,'cfd', '2022-01-01','2037-01-01', 105.6, 'AR2 2017; £96.02/MWh 2012 prices'),
    (_beatrice,    'cfd', '2019-07-01','2034-07-01', 159.5, 'AR1 2015; £145/MWh 2012 prices'),
    (_moray_east,  'cfd', '2021-05-01','2036-05-01',  63.3, 'AR2 2017; £57.50/MWh 2012 prices'),
    (_seagreen,    'cfd', '2023-10-01','2038-10-01',  43.6, 'AR3 2019'),
    (_race_bank,   'cfd', '2018-06-01','2033-06-01', 125.8, 'AR1 2015; £114.39/MWh 2012 prices'),
    (_galloper,    'cfd', '2018-05-01','2033-05-01', 148.5, 'AR1 2015'),
    (_walney_ext,  'cfd', '2018-06-01','2033-06-01', 157.4, 'AR1 2015; £143/MWh 2012 prices'),
    (_sheringham,  'cfd', '2012-09-01','2032-09-01',  NULL, 'Pre-CfD ROC scheme'),
    (_dudgeon,     'cfd', '2017-04-01','2032-04-01',  NULL, 'Pre-CfD ROC scheme'),
    -- Germany — EEG feed-in tariff
    (_borkum1,      'feed-in tariff', '2015-01-01','2034-12-31', 154.0, 'EEG 2012; ~€154/MWh'),
    (_borkum2,      'feed-in tariff', '2019-09-01','2039-08-31',  69.0, 'EEG 2017 auction; €69/MWh'),
    (_gode12,       'feed-in tariff', '2016-08-01','2036-07-31', 154.0, 'EEG 2012; ~€154/MWh'),
    (_amrumbank,    'feed-in tariff', '2015-08-01','2035-07-31', 154.0, 'EEG 2012'),
    (_baltic1,      'feed-in tariff', '2011-05-01','2031-04-30', 150.0, 'EEG 2009'),
    (_baltic2,      'feed-in tariff', '2015-09-01','2035-08-31', 154.0, 'EEG 2012'),
    (_global_tech,  'feed-in tariff', '2015-08-01','2035-07-31', 154.0, 'EEG 2012'),
    -- Denmark — feed-in tariff
    (_horns_rev2,   'feed-in tariff', '2009-09-01','2039-08-31',  53.0, 'Danish tender; DKK 0.518/kWh'),
    (_horns_rev3,   'feed-in tariff', '2019-03-01','2041-03-01',  62.0, 'Danish tender'),
    (_anholt,       'feed-in tariff', '2013-09-01','2033-08-31', 105.0, 'Danish tender'),
    (_kriegers,     'feed-in tariff', '2021-12-01','2041-11-30',  49.9, 'Danish tender 2016'),
    -- Netherlands — SDE+ subsidy (treated as feed-in tariff)
    (_gemini,       'feed-in tariff', '2017-05-01','2032-04-30', 103.0, 'SDE+ 2014'),
    (_borssele12,   'feed-in tariff', '2020-12-01','2035-11-30',  72.7, 'SDE+ 2016 tender'),
    -- USA — OREC / utility PPA
    (_vineyard,     'corporate ppa', '2024-05-01','2044-04-30', 110.0, 'MA OREC state contract'),
    (_south_fork,   'corporate ppa', '2023-01-01','2038-12-31', 120.0, 'NY-OREC 2017')
  ) AS t(farm_id, ctype, sdate, edate, price, note)
  WHERE farm_id IS NOT NULL;

  -- ── Route-to-market batch update ──────────────────────────────────────────
  -- UK operational/construction → CfD
  UPDATE wind_farms
  SET route_to_market = 'cfd'
  WHERE country_code = 'GB'
    AND status_current IN ('operational','under construction')
    AND route_to_market IS NULL;

  -- Germany operational → feed-in tariff (EEG)
  UPDATE wind_farms
  SET route_to_market = 'feed-in tariff'
  WHERE country_code = 'DE'
    AND status_current = 'operational'
    AND route_to_market IS NULL;

  -- Netherlands, Denmark operational → feed-in tariff
  UPDATE wind_farms
  SET route_to_market = 'feed-in tariff'
  WHERE country_code IN ('NL','DK')
    AND status_current = 'operational'
    AND route_to_market IS NULL;

  -- Belgium operational → green certificate (ELIA)
  UPDATE wind_farms
  SET route_to_market = 'green certificate'
  WHERE country_code = 'BE'
    AND status_current = 'operational'
    AND route_to_market IS NULL;

  -- Sweden, Norway → feed-in tariff (Elcertifikat / merchant)
  UPDATE wind_farms
  SET route_to_market = 'feed-in tariff'
  WHERE country_code IN ('SE','NO')
    AND status_current = 'operational'
    AND route_to_market IS NULL;

  -- US operational → corporate ppa (default assumption)
  UPDATE wind_farms
  SET route_to_market = 'corporate ppa'
  WHERE country_code = 'US'
    AND status_current IN ('operational','under construction')
    AND route_to_market IS NULL;

  -- Planned farms globally → unknown
  UPDATE wind_farms
  SET route_to_market = 'unknown'
  WHERE status_current = 'planned'
    AND route_to_market IS NULL;

  -- Remaining → unknown
  UPDATE wind_farms
  SET route_to_market = 'unknown'
  WHERE route_to_market IS NULL;

END $$;

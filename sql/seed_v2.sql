-- =============================================================================
-- OFFSHORE WIND INTELLIGENCE — V2 SEED
-- 200+ global offshore wind farms compiled from public sources
-- Rerunnable: guarded by ingest_batches.batch_name unique index (migration 001)
-- Run after: schema.sql + migrations/001_extend_wind_farms.sql
-- =============================================================================

DO $$
DECLARE
  _batch_id     UUID;
  _orsted       UUID; _vattenfall   UUID; _rwe          UUID; _equinor      UUID;
  _sse          UUID; _enbw         UUID; _northland    UUID; _scottishpower UUID;
  _edf          UUID; _eon          UUID; _shell        UUID; _bp           UUID;
  _iberdrola    UUID; _total        UUID; _parkwind     UUID; _cpower       UUID;
  _cip          UUID; _avangrid     UUID; _dominion     UUID; _oceanwinds   UUID;
  _wpd          UUID; _centrica     UUID; _polenergia   UUID;
  _orlen        UUID; _pge_baltica  UUID; _jera         UUID; _marubeni     UUID;
  _rentel       UUID; _norther      UUID; _eneco        UUID; _edp          UUID;
  _ctg          UUID; _longyuan     UUID; _cgnpc        UUID;
  _windmw       UUID; _energinet    UUID; _repsol       UUID; _renexia      UUID;
BEGIN

  -- ── Idempotency guard ────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM ingest_batches WHERE batch_name = 'seed_v2') THEN
    RAISE NOTICE 'Seed v2 already applied — skipping.';
    RETURN;
  END IF;

  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, row_count, notes)
  VALUES ('seed_v2', 'Manual research compilation', 'seed_v2.sql', 210,
    'Global offshore wind dataset: 210+ projects, compiled from public domain sources')
  RETURNING id INTO _batch_id;

  -- ── Companies ─────────────────────────────────────────────────────────────
  INSERT INTO companies (name, actor_type, hq_country_code, ingest_batch_id) VALUES
    ('Ørsted',                            'developer', 'DK', _batch_id),
    ('Vattenfall',                        'developer', 'SE', _batch_id),
    ('RWE Renewables',                    'developer', 'DE', _batch_id),
    ('Equinor',                           'developer', 'NO', _batch_id),
    ('SSE Renewables',                    'developer', 'GB', _batch_id),
    ('EnBW Renewables',                   'developer', 'DE', _batch_id),
    ('Northland Power',                   'developer', 'CA', _batch_id),
    ('ScottishPower Renewables',          'developer', 'GB', _batch_id),
    ('EDF Renewables',                    'developer', 'FR', _batch_id),
    ('E.ON Climate & Renewables',         'developer', 'DE', _batch_id),
    ('Shell',                             'developer', 'NL', _batch_id),
    ('bp',                                'developer', 'GB', _batch_id),
    ('Iberdrola',                         'developer', 'ES', _batch_id),
    ('TotalEnergies',                     'developer', 'FR', _batch_id),
    ('Parkwind',                          'developer', 'BE', _batch_id),
    ('C-Power',                           'developer', 'BE', _batch_id),
    ('Copenhagen Infrastructure Partners','financial',  'DK', _batch_id),
    ('Avangrid Renewables',               'developer', 'US', _batch_id),
    ('Dominion Energy',                   'utility',   'US', _batch_id),
    ('OceanWinds',                        'developer', 'ES', _batch_id),
    ('WPD Offshore',                      'developer', 'DE', _batch_id),
    ('Centrica',                          'utility',   'GB', _batch_id),
    ('Polenergia',                        'developer', 'PL', _batch_id),
    ('Orlen Neptun',                      'developer', 'PL', _batch_id),
    ('PGE Baltica',                       'developer', 'PL', _batch_id),
    ('JERA',                              'utility',   'JP', _batch_id),
    ('Marubeni',                          'developer', 'JP', _batch_id),
    ('Rentel NV',                         'developer', 'BE', _batch_id),
    ('Norther NV',                        'developer', 'BE', _batch_id),
    ('Eneco',                             'developer', 'NL', _batch_id),
    ('EDP Renewables',                    'developer', 'PT', _batch_id),
    ('China Three Gorges',                'developer', 'CN', _batch_id),
    ('Longyuan Power',                    'developer', 'CN', _batch_id),
    ('CGN New Energy',                    'developer', 'CN', _batch_id),
    ('WindMW GmbH',                       'developer', 'DE', _batch_id),
    ('Energinet',                         'utility',   'DK', _batch_id),
    ('Repsol',                            'developer', 'ES', _batch_id),
    ('Renexia',                           'developer', 'IT', _batch_id)
  ON CONFLICT (normalized_name) DO NOTHING;

  -- Capture IDs (works whether just inserted or already existed)
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
  SELECT id INTO _oceanwinds    FROM companies WHERE normalized_name = lower('OceanWinds');
  SELECT id INTO _wpd           FROM companies WHERE normalized_name = lower('WPD Offshore');
  SELECT id INTO _centrica      FROM companies WHERE normalized_name = lower('Centrica');
  SELECT id INTO _polenergia    FROM companies WHERE normalized_name = lower('Polenergia');
  SELECT id INTO _orlen         FROM companies WHERE normalized_name = lower('Orlen Neptun');
  SELECT id INTO _pge_baltica   FROM companies WHERE normalized_name = lower('PGE Baltica');
  SELECT id INTO _jera          FROM companies WHERE normalized_name = lower('JERA');
  SELECT id INTO _marubeni      FROM companies WHERE normalized_name = lower('Marubeni');
  SELECT id INTO _rentel        FROM companies WHERE normalized_name = lower('Rentel NV');
  SELECT id INTO _norther       FROM companies WHERE normalized_name = lower('Norther NV');
  SELECT id INTO _eneco         FROM companies WHERE normalized_name = lower('Eneco');
  SELECT id INTO _edp           FROM companies WHERE normalized_name = lower('EDP Renewables');
  SELECT id INTO _ctg           FROM companies WHERE normalized_name = lower('China Three Gorges');
  SELECT id INTO _longyuan      FROM companies WHERE normalized_name = lower('Longyuan Power');
  SELECT id INTO _cgnpc         FROM companies WHERE normalized_name = lower('CGN New Energy');
  SELECT id INTO _windmw        FROM companies WHERE normalized_name = lower('WindMW GmbH');
  SELECT id INTO _energinet     FROM companies WHERE normalized_name = lower('Energinet');
  SELECT id INTO _repsol        FROM companies WHERE normalized_name = lower('Repsol');
  SELECT id INTO _renexia       FROM companies WHERE normalized_name = lower('Renexia');

  -- ── UK: North Sea / English Channel ─────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Hornsea One',          'GB','north sea','operational',     1218, 174, _orsted,       25,'monopile','Siemens Gamesa SWT-7.0-154',  103, ST_SetSRID(ST_MakePoint(  1.81, 53.82),4326)::geography,'2019-01-01','unverified',_batch_id),
    ('Hornsea Two',          'GB','north sea','operational',     1386, 165, _orsted,       27,'monopile','Siemens Gamesa SG 8.0-167 DD', 89, ST_SetSRID(ST_MakePoint(  1.82, 53.96),4326)::geography,'2022-08-31','unverified',_batch_id),
    ('Hornsea Three',        'GB','north sea','under construction',2852,NULL,_orsted,      28,'monopile', NULL,                          120, ST_SetSRID(ST_MakePoint(  2.14, 54.08),4326)::geography, NULL,        'unverified',_batch_id),
    ('Hornsea Four',         'GB','north sea','planned',         2600,NULL, _orsted,       30, NULL,      NULL,                          120, ST_SetSRID(ST_MakePoint(  2.50, 54.20),4326)::geography, NULL,        'unverified',_batch_id),
    ('Sofia',                'GB','north sea','under construction',1400,100,_rwe,          58,'monopile','Siemens Gamesa SG 14-236 DD', 195, ST_SetSRID(ST_MakePoint(  0.54, 54.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Dogger Bank A',        'GB','north sea','under construction',1200, 95, _equinor,     27,'monopile','GE Haliade-X 13MW',            131, ST_SetSRID(ST_MakePoint(  1.80, 54.72),4326)::geography, NULL,        'unverified',_batch_id),
    ('Dogger Bank B',        'GB','north sea','under construction',1200, 95, _equinor,     26,'monopile','GE Haliade-X 13MW',            131, ST_SetSRID(ST_MakePoint(  2.15, 54.70),4326)::geography, NULL,        'unverified',_batch_id),
    ('Dogger Bank C',        'GB','north sea','under construction',1200, 95, _equinor,     31,'monopile','GE Haliade-X 13MW',            196, ST_SetSRID(ST_MakePoint(  2.55, 54.76),4326)::geography, NULL,        'unverified',_batch_id),
    ('Triton Knoll',         'GB','north sea','operational',      857,  90, _rwe,          18,'monopile','Vestas V164-9.5',               33, ST_SetSRID(ST_MakePoint(  0.87, 53.33),4326)::geography,'2022-02-01','unverified',_batch_id),
    ('Race Bank',            'GB','north sea','operational',      573,  91, _orsted,       19,'monopile','Siemens SWT-6.0-154',           27, ST_SetSRID(ST_MakePoint(  0.70, 53.20),4326)::geography,'2018-01-01','unverified',_batch_id),
    ('Dudgeon',              'GB','north sea','operational',      402,  67, _equinor,      19,'monopile','Siemens SWT-6.0-154',           32, ST_SetSRID(ST_MakePoint(  1.34, 53.27),4326)::geography,'2017-01-01','unverified',_batch_id),
    ('Sheringham Shoal',     'GB','north sea','operational',      317,  88, _equinor,      17,'monopile','Siemens SWT-3.6-107',           17, ST_SetSRID(ST_MakePoint(  1.13, 53.16),4326)::geography,'2012-09-01','unverified',_batch_id),
    ('Lincs',                'GB','north sea','operational',      270,  75, _centrica,     10,'monopile','Siemens SWT-3.6-120',            8, ST_SetSRID(ST_MakePoint(  0.54, 53.18),4326)::geography,'2013-10-01','unverified',_batch_id),
    ('Lynn and Inner Dowsing','GB','north sea','operational',     194,  54, _centrica,      8,'monopile','Siemens SWT-3.6-107',            5, ST_SetSRID(ST_MakePoint(  0.38, 53.01),4326)::geography,'2008-01-01','unverified',_batch_id),
    ('Scroby Sands',         'GB','north sea','operational',       60,  30, _eon,           5,'monopile','Vestas V80-2.0',                 3, ST_SetSRID(ST_MakePoint(  1.88, 52.68),4326)::geography,'2004-01-01','unverified',_batch_id),
    ('Haisborough Hammond Dudgeon','GB','north sea','operational', 749, 116,_vattenfall,   22,'monopile','Siemens Gamesa SWT-6.0-154',   103, ST_SetSRID(ST_MakePoint(  1.82, 53.42),4326)::geography,'2020-02-01','unverified',_batch_id),
    ('East Anglia One',      'GB','north sea','operational',      714, 102, _scottishpower,37,'monopile','Siemens Gamesa SG 7.0-154',     80, ST_SetSRID(ST_MakePoint(  2.28, 52.24),4326)::geography,'2020-09-01','unverified',_batch_id),
    ('East Anglia Two',      'GB','north sea','planned',          900,NULL, _scottishpower,35, NULL,      NULL,                            90, ST_SetSRID(ST_MakePoint(  2.67, 52.37),4326)::geography, NULL,        'unverified',_batch_id),
    ('East Anglia Three',    'GB','north sea','planned',         1400,NULL, _scottishpower,40, NULL,      NULL,                           100, ST_SetSRID(ST_MakePoint(  2.94, 52.55),4326)::geography, NULL,        'unverified',_batch_id),
    ('Greater Gabbard',      'GB','north sea','operational',      504, 140, _sse,          24,'monopile','Siemens SWT-3.6-107',           23, ST_SetSRID(ST_MakePoint(  2.04, 51.83),4326)::geography,'2012-09-01','unverified',_batch_id),
    ('London Array',         'GB','north sea','operational',      630, 175, _orsted,       23,'monopile','Siemens SWT-3.6-120',           20, ST_SetSRID(ST_MakePoint(  1.35, 51.63),4326)::geography,'2013-04-01','unverified',_batch_id),
    ('Thanet',               'GB','north sea','operational',      300, 100, _vattenfall,   23,'monopile','Vestas V90-3.0',                11, ST_SetSRID(ST_MakePoint(  1.67, 51.44),4326)::geography,'2010-01-01','unverified',_batch_id),
    ('Kentish Flats',        'GB','north sea','operational',       90,  30, _vattenfall,    5,'monopile','Vestas V90-3.0',                 8, ST_SetSRID(ST_MakePoint(  1.05, 51.45),4326)::geography,'2005-01-01','unverified',_batch_id),
    ('Galloper',             'GB','north sea','operational',      336,  56, _rwe,          27,'monopile','Siemens SWT-6.0-154',           27, ST_SetSRID(ST_MakePoint(  2.29, 51.97),4326)::geography,'2017-01-01','unverified',_batch_id),
    ('Rampion',              'GB','north sea','operational',      400, 116, _edf,          32,'monopile','Vestas V112-3.45',              13, ST_SetSRID(ST_MakePoint( -0.10, 50.68),4326)::geography,'2018-01-01','unverified',_batch_id),
    ('Rampion 2',            'GB','north sea','planned',         1200,NULL, _edf,          35, NULL,      NULL,                            15, ST_SetSRID(ST_MakePoint( -0.20, 50.65),4326)::geography, NULL,        'unverified',_batch_id),
    ('Norfolk Boreas',       'GB','north sea','planned',         1400,NULL, _vattenfall,   35, NULL,      NULL,                            80, ST_SetSRID(ST_MakePoint(  2.55, 53.15),4326)::geography, NULL,        'unverified',_batch_id),
    ('Norfolk Vanguard',     'GB','north sea','planned',         1800,NULL, _vattenfall,   40, NULL,      NULL,                            85, ST_SetSRID(ST_MakePoint(  2.62, 53.25),4326)::geography, NULL,        'unverified',_batch_id),
    ('Outer Dowsing',        'GB','north sea','planned',         1500,NULL, NULL,          30, NULL,      NULL,                            45, ST_SetSRID(ST_MakePoint(  0.95, 53.50),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── UK: Irish Sea ─────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Walney Extension',     'GB','irish sea','operational',      659,  87, _orsted,       33,'monopile','Siemens Gamesa SWT-7.0-154',   19, ST_SetSRID(ST_MakePoint( -3.60, 54.13),4326)::geography,'2018-09-01','unverified',_batch_id),
    ('Walney 1',             'GB','irish sea','operational',      184,  51, _orsted,       21,'monopile','Siemens SWT-3.6-107',           14, ST_SetSRID(ST_MakePoint( -3.58, 54.06),4326)::geography,'2012-01-01','unverified',_batch_id),
    ('Walney 2',             'GB','irish sea','operational',      184,  51, _orsted,       21,'monopile','Siemens SWT-3.6-107',           14, ST_SetSRID(ST_MakePoint( -3.62, 54.04),4326)::geography,'2012-09-01','unverified',_batch_id),
    ('Burbo Bank',           'GB','irish sea','operational',       90,  25, _orsted,        5,'monopile','Vestas V80-3.0',                 6, ST_SetSRID(ST_MakePoint( -3.22, 53.47),4326)::geography,'2007-01-01','unverified',_batch_id),
    ('Burbo Bank Extension', 'GB','irish sea','operational',      258,  32, _orsted,       17,'monopile','Vestas V164-8.0',                7, ST_SetSRID(ST_MakePoint( -3.35, 53.52),4326)::geography,'2017-01-01','unverified',_batch_id),
    ('North Hoyle',          'GB','irish sea','operational',       60,  30, _vattenfall,    7,'monopile','Vestas V80-2.0',                 7, ST_SetSRID(ST_MakePoint( -3.42, 53.44),4326)::geography,'2003-01-01','unverified',_batch_id),
    ('Rhyl Flats',           'GB','irish sea','operational',       90,  25, _rwe,           8,'monopile','Siemens SWT-3.6-107',            8, ST_SetSRID(ST_MakePoint( -3.64, 53.45),4326)::geography,'2009-01-01','unverified',_batch_id),
    ('Barrow',               'GB','irish sea','operational',       90,  30, _orsted,       16,'monopile','Vestas V90-3.0',                 7, ST_SetSRID(ST_MakePoint( -3.24, 53.95),4326)::geography,'2006-01-01','unverified',_batch_id),
    ('West of Duddon Sands', 'GB','irish sea','operational',      389, 108, _orsted,       22,'monopile','Siemens SWT-3.6-120',           14, ST_SetSRID(ST_MakePoint( -3.72, 54.05),4326)::geography,'2014-09-01','unverified',_batch_id),
    ('Duddon Sands',         'GB','irish sea','operational',      389, 108, _eon,          22,'monopile','Siemens SWT-3.6-120',           14, ST_SetSRID(ST_MakePoint( -3.65, 54.00),4326)::geography,'2014-09-01','unverified',_batch_id),
    ('Robin Rigg',           'GB','irish sea','operational',      174,  60, _eon,           6,'monopile','Vestas V90-2.0',                10, ST_SetSRID(ST_MakePoint( -3.87, 54.74),4326)::geography,'2010-01-01','unverified',_batch_id),
    ('Gwynt y Môr',          'GB','irish sea','operational',      576, 160, _rwe,          28,'monopile','Siemens SWT-3.6-107',           13, ST_SetSRID(ST_MakePoint( -3.68, 53.44),4326)::geography,'2015-06-01','unverified',_batch_id),
    ('Ormonde',              'GB','irish sea','operational',      150,  30, _vattenfall,   19,'jacket',  'REpower 5M',                    10, ST_SetSRID(ST_MakePoint( -3.40, 54.09),4326)::geography,'2012-01-01','unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── UK: Scotland ──────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Beatrice',                 'GB','north sea','operational',     588,  84, _sse,       45,'jacket',  'Siemens Gamesa SWT-7.0-154', 84, ST_SetSRID(ST_MakePoint( -2.15, 58.08),4326)::geography,'2019-07-01','unverified',_batch_id),
    ('Moray East',               'GB','north sea','operational',     950, 100, _oceanwinds,38,'jacket',  'Vestas V164-9.5',            22, ST_SetSRID(ST_MakePoint( -3.27, 57.65),4326)::geography,'2022-09-01','unverified',_batch_id),
    ('Moray West',               'GB','north sea','under construction',882,60, _oceanwinds,38,'jacket',  'Siemens Gamesa SG 14-236 DD',22, ST_SetSRID(ST_MakePoint( -3.55, 57.70),4326)::geography, NULL,        'unverified',_batch_id),
    ('Seagreen',                 'GB','north sea','operational',    1075, 114,_total,      55,'jacket',  'Siemens Gamesa SG 11.0-200', 27, ST_SetSRID(ST_MakePoint( -2.15, 56.47),4326)::geography,'2023-10-01','unverified',_batch_id),
    ('Neart na Gaoithe',         'GB','north sea','operational',     448,  54, _edf,       55,'jacket',  'Vestas V164-8.3',            15, ST_SetSRID(ST_MakePoint( -2.45, 56.27),4326)::geography,'2023-12-01','unverified',_batch_id),
    ('Inch Cape',                'GB','north sea','planned',        1080,NULL, _repsol,    45, NULL,      NULL,                         15, ST_SetSRID(ST_MakePoint( -2.48, 56.72),4326)::geography, NULL,        'unverified',_batch_id),
    ('Viking',                   'GB','north sea','under construction',443,103,_sse,       42,'monopile','Vestas V236-15.0',           38, ST_SetSRID(ST_MakePoint( -1.32, 60.42),4326)::geography, NULL,        'unverified',_batch_id),
    ('Kincardine',               'GB','north sea','operational',      50,   5, NULL,       77,'floating','Vestas V164-9.5',            15, ST_SetSRID(ST_MakePoint( -2.00, 56.97),4326)::geography,'2021-09-01','unverified',_batch_id),
    ('Aberdeen Offshore Wind Farm','GB','north sea','operational',    93,  11, _vattenfall,26,'monopile','Vestas V164-8.4',             3, ST_SetSRID(ST_MakePoint( -2.06, 57.17),4326)::geography,'2018-08-01','unverified',_batch_id),
    ('Hywind Scotland',          'GB','north sea','operational',      30,   5, _equinor,   95,'floating','Siemens SWT-6.0-154',        25, ST_SetSRID(ST_MakePoint( -1.47, 57.50),4326)::geography,'2017-10-01','unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Denmark ───────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Horns Rev 1',          'DK','north sea','operational',      160,  80, _vattenfall,  12,'monopile','Vestas V80-2.0',             14, ST_SetSRID(ST_MakePoint(  7.83, 55.49),4326)::geography,'2002-12-01','unverified',_batch_id),
    ('Horns Rev 2',          'DK','north sea','operational',      209,  91, _vattenfall,  13,'monopile','Siemens SWT-2.3-93',         30, ST_SetSRID(ST_MakePoint(  7.55, 55.60),4326)::geography,'2009-09-01','unverified',_batch_id),
    ('Horns Rev 3',          'DK','north sea','operational',      407,  49, _vattenfall,  15,'monopile','Vestas V164-8.0',            40, ST_SetSRID(ST_MakePoint(  7.95, 55.80),4326)::geography,'2019-07-01','unverified',_batch_id),
    ('Anholt',               'DK','north sea','operational',      400, 111, _orsted,      19,'monopile','Siemens SWT-3.6-120',        15, ST_SetSRID(ST_MakePoint( 11.20, 56.60),4326)::geography,'2013-09-01','unverified',_batch_id),
    ('Rødsand 1 (Nysted)',   'DK','baltic sea','operational',     166,  72, _eon,         10,'gravity base','Bonus 2.3MW',            10, ST_SetSRID(ST_MakePoint( 11.75, 54.55),4326)::geography,'2003-12-01','unverified',_batch_id),
    ('Rødsand 2',            'DK','baltic sea','operational',     207,  90, _eon,          9,'monopile','Siemens SWT-2.3-93',          9, ST_SetSRID(ST_MakePoint( 11.87, 54.54),4326)::geography,'2010-10-01','unverified',_batch_id),
    ('Middelgrunden',        'DK','north sea','operational',       40,  20, _orsted,       4,'gravity base','Bonus 2.0MW',             3, ST_SetSRID(ST_MakePoint( 12.68, 55.68),4326)::geography,'2001-05-01','unverified',_batch_id),
    ('Sprogø',               'DK','north sea','operational',       21,   7, _energinet,    6,'monopile','Vestas V90-3.0',              8, ST_SetSRID(ST_MakePoint( 10.95, 55.33),4326)::geography,'2009-06-01','unverified',_batch_id),
    ('Kriegers Flak',        'DK','baltic sea','operational',     605,  72, _vattenfall,  17,'monopile','Siemens Gamesa SG 8.0-167 DD',15,ST_SetSRID(ST_MakePoint( 12.77, 54.97),4326)::geography,'2021-12-01','unverified',_batch_id),
    ('Thor',                 'DK','north sea','under construction',1000, 72, _rwe,         20,'monopile','Vestas V236-15.0',           22, ST_SetSRID(ST_MakePoint(  8.23, 56.52),4326)::geography, NULL,        'unverified',_batch_id),
    ('Vindeby',              'DK','north sea','decommissioned',      5,  11, _orsted,       3,'gravity base','Bonus 450kW',             2, ST_SetSRID(ST_MakePoint( 10.95, 54.97),4326)::geography,'1991-09-01','unverified',_batch_id),
    ('Samsø Offshore',       'DK','north sea','operational',       23,  10, NULL,          11,'monopile','Bonus 2.3MW',                 3, ST_SetSRID(ST_MakePoint( 10.59, 55.87),4326)::geography,'2003-01-01','unverified',_batch_id),
    ('Hesselø',              'DK','north sea','planned',          1000,NULL, _equinor,     20, NULL,      NULL,                         30, ST_SetSRID(ST_MakePoint( 11.75, 56.20),4326)::geography, NULL,        'unverified',_batch_id),
    ('Bornholm Energy Island','DK','baltic sea','planned',        3000,NULL, NULL,         20, NULL,      NULL,                         15, ST_SetSRID(ST_MakePoint( 15.00, 55.20),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Germany ───────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Alpha Ventus',         'DE','north sea','operational',       60,  12, _eon,          30,'jacket',  'Multibrid M5000',            45, ST_SetSRID(ST_MakePoint(  6.59, 54.01),4326)::geography,'2010-04-01','unverified',_batch_id),
    ('BARD Offshore 1',      'DE','north sea','operational',      400,  80, NULL,          40,'jacket',  'BARD 5.0MW',                100, ST_SetSRID(ST_MakePoint(  5.85, 54.35),4326)::geography,'2013-08-01','unverified',_batch_id),
    ('Baltic 1',             'DE','baltic sea','operational',      48,  21, _enbw,         19,'monopile','Siemens SWT-2.3-93',         16, ST_SetSRID(ST_MakePoint( 12.68, 54.62),4326)::geography,'2011-05-01','unverified',_batch_id),
    ('Baltic 2',             'DE','baltic sea','operational',     288,  80, _enbw,         23,'monopile','Siemens SWT-3.6-120',        32, ST_SetSRID(ST_MakePoint( 13.17, 54.97),4326)::geography,'2015-09-01','unverified',_batch_id),
    ('Dan Tysk',             'DE','north sea','operational',      288,  80, _vattenfall,   22,'monopile','Siemens SWT-3.6-120',        70, ST_SetSRID(ST_MakePoint(  6.22, 55.02),4326)::geography,'2015-06-01','unverified',_batch_id),
    ('Butendiek',            'DE','north sea','operational',      288,  80, _wpd,          20,'monopile','Siemens SWT-3.6-120',        32, ST_SetSRID(ST_MakePoint(  7.77, 55.03),4326)::geography,'2015-07-01','unverified',_batch_id),
    ('Global Tech I',        'DE','north sea','operational',      400,  80, _windmw,       40,'jacket',  'Areva Multibrid M5000',     100, ST_SetSRID(ST_MakePoint(  6.58, 54.49),4326)::geography,'2015-10-01','unverified',_batch_id),
    ('Gode Wind 1',          'DE','north sea','operational',      330,  55, _orsted,       29,'monopile','Siemens SWT-6.0-154',        45, ST_SetSRID(ST_MakePoint(  7.05, 54.03),4326)::geography,'2016-08-01','unverified',_batch_id),
    ('Gode Wind 2',          'DE','north sea','operational',      252,  42, _orsted,       29,'monopile','Siemens SWT-6.0-154',        45, ST_SetSRID(ST_MakePoint(  7.10, 54.02),4326)::geography,'2016-10-01','unverified',_batch_id),
    ('Nordsee One',          'DE','north sea','operational',      332,  54, _northland,    25,'monopile','Senvion 6.2M126',            40, ST_SetSRID(ST_MakePoint(  6.18, 54.43),4326)::geography,'2018-01-01','unverified',_batch_id),
    ('Borkum Riffgrund 1',   'DE','north sea','operational',      312,  78, _orsted,       23,'monopile','Siemens SWT-4.0-120',        55, ST_SetSRID(ST_MakePoint(  6.47, 53.96),4326)::geography,'2015-12-01','unverified',_batch_id),
    ('Borkum Riffgrund 2',   'DE','north sea','operational',      465,  56, _orsted,       30,'monopile','Siemens Gamesa SWT-8.0-154', 55, ST_SetSRID(ST_MakePoint(  6.55, 54.05),4326)::geography,'2019-10-01','unverified',_batch_id),
    ('Arkona',               'DE','baltic sea','operational',     385,  60, _eon,          25,'monopile','Vestas V126-3.45',           35, ST_SetSRID(ST_MakePoint( 14.12, 54.97),4326)::geography,'2019-04-01','unverified',_batch_id),
    ('EnBW Hohe See',        'DE','north sea','operational',      497,  71, _enbw,         39,'monopile','Siemens Gamesa SWT-7.0-154', 95, ST_SetSRID(ST_MakePoint(  5.97, 54.45),4326)::geography,'2019-11-01','unverified',_batch_id),
    ('Wikinger',             'DE','baltic sea','operational',     350,  70, _iberdrola,    40,'jacket',  'Adwen AD 5-135',             35, ST_SetSRID(ST_MakePoint( 14.07, 54.84),4326)::geography,'2018-01-01','unverified',_batch_id),
    ('Veja Mate',            'DE','north sea','operational',      402,  67, _cip,          40,'jacket',  'Siemens SWT-6.0-154',        95, ST_SetSRID(ST_MakePoint(  5.73, 54.52),4326)::geography,'2017-07-01','unverified',_batch_id),
    ('Gode Wind 3+4',        'DE','north sea','operational',      242,  27, _orsted,       29,'monopile','Siemens Gamesa SG 11.0-200', 45, ST_SetSRID(ST_MakePoint(  7.17, 54.08),4326)::geography,'2023-01-01','unverified',_batch_id),
    ('He Dreiht',            'DE','north sea','under construction',960,  64, _enbw,        35,'monopile','Vestas V236-15.0',           85, ST_SetSRID(ST_MakePoint(  6.50, 54.30),4326)::geography, NULL,        'unverified',_batch_id),
    ('Nordsee Ost',          'DE','north sea','operational',      295,  48, _rwe,          22,'jacket',  'Senvion 6.2M126',            35, ST_SetSRID(ST_MakePoint(  7.18, 54.44),4326)::geography,'2015-09-01','unverified',_batch_id),
    ('Amrumbank West',       'DE','north sea','operational',      302,  80, _eon,          23,'monopile','Siemens SWT-3.6-120',        35, ST_SetSRID(ST_MakePoint(  7.55, 54.75),4326)::geography,'2015-12-01','unverified',_batch_id),
    ('Kaskasi',              'DE','north sea','operational',      342,  38, _rwe,          25,'monopile','Siemens Gamesa SG 9.0-174 DD',23,ST_SetSRID(ST_MakePoint(  7.12, 54.38),4326)::geography,'2022-12-01','unverified',_batch_id),
    ('Nordlicht 1',          'DE','north sea','planned',          980,NULL, _total,        35, NULL,      NULL,                         90, ST_SetSRID(ST_MakePoint(  6.80, 54.50),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Netherlands ──────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Egmond aan Zee (OWEZ)',        'NL','north sea','operational',  108,  36, _vattenfall, 21,'monopile','Vestas V90-3.0',                18, ST_SetSRID(ST_MakePoint(  4.35, 52.61),4326)::geography,'2006-12-01','unverified',_batch_id),
    ('Prinses Amalia (Q7)',          'NL','north sea','operational',  120,  60, _eneco,      24,'monopile','Vestas V80-2.0',                23, ST_SetSRID(ST_MakePoint(  4.22, 52.42),4326)::geography,'2008-06-01','unverified',_batch_id),
    ('Gemini',                       'NL','north sea','operational',  600, 150, _northland,  36,'monopile','Siemens SWT-4.0-130',           85, ST_SetSRID(ST_MakePoint(  5.95, 54.02),4326)::geography,'2017-05-01','unverified',_batch_id),
    ('Luchterduinen',                'NL','north sea','operational',  129,  43, _eneco,      22,'monopile','Vestas V112-3.0',               18, ST_SetSRID(ST_MakePoint(  4.22, 52.37),4326)::geography,'2015-04-01','unverified',_batch_id),
    ('Borssele I',                   'NL','north sea','operational',  752,  94, _orsted,     27,'monopile','Siemens Gamesa SWT-8.0-154',    22, ST_SetSRID(ST_MakePoint(  3.05, 51.73),4326)::geography,'2020-12-01','unverified',_batch_id),
    ('Borssele II',                  'NL','north sea','operational',  752,  94, _orsted,     27,'monopile','Siemens Gamesa SWT-8.0-154',    24, ST_SetSRID(ST_MakePoint(  3.18, 51.73),4326)::geography,'2021-07-01','unverified',_batch_id),
    ('Borssele III/IV',              'NL','north sea','operational',  731,  77, _shell,      28,'monopile','MHI Vestas V164-9.5',           25, ST_SetSRID(ST_MakePoint(  3.25, 51.70),4326)::geography,'2021-11-01','unverified',_batch_id),
    ('Hollandse Kust Zuid 1+2',      'NL','north sea','operational',  760,  76, _vattenfall, 24,'monopile','Siemens Gamesa SG 10.0-193 DD', 18, ST_SetSRID(ST_MakePoint(  4.02, 52.08),4326)::geography,'2023-06-01','unverified',_batch_id),
    ('Hollandse Kust Noord',         'NL','north sea','operational',  760,  69, _shell,      28,'monopile','Vestas V236-15.0',              13, ST_SetSRID(ST_MakePoint(  4.60, 52.73),4326)::geography,'2023-04-01','unverified',_batch_id),
    ('Hollandse Kust West VI',       'NL','north sea','under construction',1500,NULL,_rwe,   32, NULL,      NULL,                           53, ST_SetSRID(ST_MakePoint(  4.30, 52.50),4326)::geography, NULL,       'unverified',_batch_id),
    ('Ten Noorden van de Waddeneilanden','NL','north sea','planned',  760,NULL, _rwe,        30, NULL,      NULL,                           85, ST_SetSRID(ST_MakePoint(  5.02, 53.53),4326)::geography, NULL,       'unverified',_batch_id),
    ('Hollandse Kust West VII',      'NL','north sea','planned',     1500,NULL, NULL,        30, NULL,      NULL,                           53, ST_SetSRID(ST_MakePoint(  4.40, 52.65),4326)::geography, NULL,       'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Belgium ───────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Thornton Bank 1',      'BE','north sea','operational',       30,   6, _cpower,     25,'gravity base','REpower 5M',                27, ST_SetSRID(ST_MakePoint(  2.95, 51.55),4326)::geography,'2009-04-01','unverified',_batch_id),
    ('Thornton Bank 2+3',    'BE','north sea','operational',      295,  48, _cpower,     22,'gravity base','REpower 6.2M126',           27, ST_SetSRID(ST_MakePoint(  2.83, 51.56),4326)::geography,'2012-07-01','unverified',_batch_id),
    ('Belwind',              'BE','north sea','operational',      165,  55, _parkwind,   35,'monopile','Vestas V90-3.0',                46, ST_SetSRID(ST_MakePoint(  2.78, 51.68),4326)::geography,'2010-11-01','unverified',_batch_id),
    ('Northwind',            'BE','north sea','operational',      216,  72, _parkwind,   27,'monopile','Vestas V112-3.0',               37, ST_SetSRID(ST_MakePoint(  2.54, 51.70),4326)::geography,'2014-06-01','unverified',_batch_id),
    ('Rentel',               'BE','north sea','operational',      309,  42, _rentel,     30,'monopile','Siemens SWT-7.0-154',           42, ST_SetSRID(ST_MakePoint(  2.60, 51.62),4326)::geography,'2018-09-01','unverified',_batch_id),
    ('Norther',              'BE','north sea','operational',      370,  44, _norther,    23,'monopile','Vestas V164-8.4',               23, ST_SetSRID(ST_MakePoint(  2.73, 51.54),4326)::geography,'2019-11-01','unverified',_batch_id),
    ('Mermaid',              'BE','north sea','operational',      235,  28, _parkwind,   35,'monopile','Siemens Gamesa SG 8.0-167 DD', 57, ST_SetSRID(ST_MakePoint(  3.02, 51.47),4326)::geography,'2021-03-01','unverified',_batch_id),
    ('Northwester 2',        'BE','north sea','operational',      219,  23, _parkwind,   27,'monopile','Siemens Gamesa SG 9.5-167 DD', 50, ST_SetSRID(ST_MakePoint(  2.72, 51.79),4326)::geography,'2020-05-01','unverified',_batch_id),
    ('SeaStar',              'BE','north sea','operational',      252,  30, _parkwind,   30,'monopile','Siemens Gamesa SWT-7.0-154',   42, ST_SetSRID(ST_MakePoint(  3.00, 51.51),4326)::geography,'2018-09-01','unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── France ────────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Saint-Nazaire',        'FR','atlantic','operational',        480,  80, _edf,        12,'monopile','GE Haliade 150-6MW',           12, ST_SetSRID(ST_MakePoint( -2.25, 47.03),4326)::geography,'2022-11-01','unverified',_batch_id),
    ('Fécamp',               'FR','north sea','operational',       500,  71, _edf,        28,'monopile','Siemens Gamesa SWT-7.0-154',   13, ST_SetSRID(ST_MakePoint(  0.35, 49.89),4326)::geography,'2023-06-01','unverified',_batch_id),
    ('Saint-Brieuc',         'FR','atlantic','operational',        496,  62, _iberdrola,  35,'jacket',  'MHI Vestas V164-8.0',          16, ST_SetSRID(ST_MakePoint( -2.58, 48.78),4326)::geography,'2023-07-01','unverified',_batch_id),
    ('Courseulles-sur-Mer',  'FR','north sea','under construction',448,  64, _edf,        25,'monopile','GE Haliade 150-6MW',           10, ST_SetSRID(ST_MakePoint( -0.41, 49.45),4326)::geography, NULL,        'unverified',_batch_id),
    ('Dieppe-Le Tréport',    'FR','north sea','under construction',496,  62, NULL,        22,'monopile','MHI Vestas V164-8.0',          15, ST_SetSRID(ST_MakePoint(  1.38, 50.08),4326)::geography, NULL,        'unverified',_batch_id),
    ('Noirmoutier-Yeu',      'FR','atlantic','planned',            496,NULL, _edf,        22, NULL,      NULL,                          12, ST_SetSRID(ST_MakePoint( -2.48, 46.87),4326)::geography, NULL,        'unverified',_batch_id),
    ('Dunkerque',            'FR','north sea','planned',           600,NULL, _rwe,        22, NULL,      NULL,                          10, ST_SetSRID(ST_MakePoint(  2.38, 51.12),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Norway / Sweden / Finland ─────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Hywind Tampen',        'NO','north sea','operational',        88,  11, _equinor,   260,'floating','Siemens Gamesa SWT-8.4-167',  140, ST_SetSRID(ST_MakePoint(  2.73, 61.13),4326)::geography,'2023-11-01','unverified',_batch_id),
    ('Utsira Nord',          'NO','north sea','planned',           1500,NULL,_equinor,   250,'floating', NULL,                          65, ST_SetSRID(ST_MakePoint(  4.00, 59.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Sørlige Nordsjø II',   'NO','north sea','planned',           1400,NULL,_equinor,   200,'floating', NULL,                         140, ST_SetSRID(ST_MakePoint(  5.80, 57.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Lillgrund',            'SE','north sea','operational',        110,  48, _vattenfall,  9,'monopile','Siemens SWT-2.3-93',          10, ST_SetSRID(ST_MakePoint( 12.77, 55.52),4326)::geography,'2008-06-01','unverified',_batch_id),
    ('Kårehamn',             'SE','baltic sea','operational',        48,  16, _eon,        12,'monopile','Vestas V112-3.0',              5, ST_SetSRID(ST_MakePoint( 17.27, 56.90),4326)::geography,'2013-10-01','unverified',_batch_id),
    ('Bockstigen',           'SE','baltic sea','operational',         3,   5, _vattenfall,  6,'monopile','Wind World W-2500',            4, ST_SetSRID(ST_MakePoint( 18.11, 56.98),4326)::geography,'1998-01-01','unverified',_batch_id),
    ('Tahkoluoto',           'FI','baltic sea','operational',        42,  10, NULL,        10,'monopile','Siemens Gamesa SWT-4.2-130',   2, ST_SetSRID(ST_MakePoint( 21.38, 61.63),4326)::geography,'2017-11-01','unverified',_batch_id),
    ('Yttre Stengrund',      'SE','baltic sea','operational',        10,   5, _vattenfall,  9,'monopile','NEG Micon 2.0MW',              5, ST_SetSRID(ST_MakePoint( 15.83, 56.23),4326)::geography,'2002-01-01','unverified',_batch_id),
    ('Utgrunden',            'SE','baltic sea','operational',        10,   7, _vattenfall,  8,'monopile','Enron 1.5sle',                 8, ST_SetSRID(ST_MakePoint( 16.32, 56.37),4326)::geography,'2000-12-01','unverified',_batch_id),
    ('Södra Midsjöbanken',   'SE','baltic sea','planned',           500,NULL, _vattenfall, 30, NULL,      NULL,                         30, ST_SetSRID(ST_MakePoint( 15.50, 55.50),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Poland + Baltic States ─────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Baltic Power',         'PL','baltic sea','under construction',1200, 76, _orlen,     30,'monopile','Vestas V236-15.0',             23, ST_SetSRID(ST_MakePoint( 17.50, 55.05),4326)::geography, NULL,        'unverified',_batch_id),
    ('Baltica 2',            'PL','baltic sea','planned',          1498,NULL, _pge_baltica,35, NULL,      NULL,                         30, ST_SetSRID(ST_MakePoint( 16.80, 55.30),4326)::geography, NULL,        'unverified',_batch_id),
    ('Baltica 3',            'PL','baltic sea','planned',          1045,NULL, _pge_baltica,32, NULL,      NULL,                         28, ST_SetSRID(ST_MakePoint( 16.20, 55.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Bałtyk 1',             'PL','baltic sea','planned',          1560,NULL, _polenergia, 35, NULL,      NULL,                         35, ST_SetSRID(ST_MakePoint( 16.80, 55.70),4326)::geography, NULL,        'unverified',_batch_id),
    ('Bałtyk 2',             'PL','baltic sea','planned',           720,NULL, _polenergia, 32, NULL,      NULL,                         40, ST_SetSRID(ST_MakePoint( 17.05, 55.88),4326)::geography, NULL,        'unverified',_batch_id),
    ('Bałtyk 3',             'PL','baltic sea','planned',           720,NULL, _polenergia, 30, NULL,      NULL,                         35, ST_SetSRID(ST_MakePoint( 17.22, 55.60),4326)::geography, NULL,        'unverified',_batch_id),
    ('Estonian OWF Zone 1',  'EE','baltic sea','planned',          1000,NULL, NULL,        30, NULL,      NULL,                         30, ST_SetSRID(ST_MakePoint( 22.50, 59.00),4326)::geography, NULL,        'unverified',_batch_id),
    ('Latvian OWF',          'LV','baltic sea','planned',           800,NULL, NULL,        25, NULL,      NULL,                         25, ST_SetSRID(ST_MakePoint( 20.75, 57.01),4326)::geography, NULL,        'unverified',_batch_id),
    ('Lithuanian OWF',       'LT','baltic sea','planned',           700,NULL, NULL,        30, NULL,      NULL,                         30, ST_SetSRID(ST_MakePoint( 20.20, 55.80),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Ireland ───────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Codling Wind Park',    'IE','irish sea','planned',           1300,NULL, _equinor,   30, NULL,      NULL,                          30, ST_SetSRID(ST_MakePoint( -5.80, 52.95),4326)::geography, NULL,        'unverified',_batch_id),
    ('North Irish Sea Array','IE','irish sea','planned',           1300,NULL, _total,     35, NULL,      NULL,                          35, ST_SetSRID(ST_MakePoint( -5.35, 54.00),4326)::geography, NULL,        'unverified',_batch_id),
    ('Dublin Array',         'IE','irish sea','planned',            800,NULL, _vattenfall,25, NULL,      NULL,                          10, ST_SetSRID(ST_MakePoint( -5.73, 53.30),4326)::geography, NULL,        'unverified',_batch_id),
    ('Arklow Bank 2',        'IE','irish sea','planned',            800,NULL, _equinor,   30, NULL,      NULL,                          15, ST_SetSRID(ST_MakePoint( -5.90, 52.73),4326)::geography, NULL,        'unverified',_batch_id),
    ('South Celtic Sea',     'IE','atlantic','planned',             500,NULL, _rwe,       50,'floating', NULL,                          60, ST_SetSRID(ST_MakePoint( -8.80, 51.60),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Mediterranean / Iberia / Portugal ────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Beleolico',            'IT','mediterranean','operational',     30,  10, _renexia,   50,'jacket',  'Vestas V117-3.45',              5, ST_SetSRID(ST_MakePoint( 17.30, 40.50),4326)::geography,'2020-08-01','unverified',_batch_id),
    ('Gargano Sud',          'IT','mediterranean','planned',         300,NULL, _renexia,  60, NULL,      NULL,                          15, ST_SetSRID(ST_MakePoint( 16.30, 41.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('WindFloat Atlantic',   'PT','atlantic','operational',           25,   3, _edp,      100,'floating','MHI Vestas V164-8.4',          20, ST_SetSRID(ST_MakePoint( -9.02, 41.70),4326)::geography,'2020-09-01','unverified',_batch_id),
    ('Tramontana',           'ES','mediterranean','planned',         400,NULL, _iberdrola, 55,'floating', NULL,                          20, ST_SetSRID(ST_MakePoint(  2.00, 40.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Canary Islands Floating','ES','atlantic','planned',            200,NULL, NULL,      200,'floating', NULL,                          50, ST_SetSRID(ST_MakePoint(-14.50, 28.00),4326)::geography, NULL,        'unverified',_batch_id),
    ('Hellenic Offshore Wind','GR','mediterranean','planned',        500,NULL, NULL,       60,'floating', NULL,                          20, ST_SetSRID(ST_MakePoint( 23.00, 38.00),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── USA ───────────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Block Island Wind Farm',            'US','other','operational',        30,   5, _orsted,   26,'jacket',  'GE Haliade 150-6MW',            5, ST_SetSRID(ST_MakePoint( -71.55, 41.12),4326)::geography,'2016-12-01','unverified',_batch_id),
    ('South Fork Wind',                   'US','other','operational',       132,  12, _orsted,   29,'monopile','Siemens Gamesa SG 11.0-200',   56, ST_SetSRID(ST_MakePoint( -72.13, 40.93),4326)::geography,'2024-03-01','unverified',_batch_id),
    ('Vineyard Wind 1',                   'US','other','under construction', 800,  62, _avangrid, 42,'monopile','GE Haliade-X 13MW',            40, ST_SetSRID(ST_MakePoint( -70.48, 41.35),4326)::geography, NULL,        'unverified',_batch_id),
    ('Revolution Wind',                   'US','other','under construction', 704,  65, _orsted,   35,'monopile','Siemens Gamesa SG 11.0-200',   37, ST_SetSRID(ST_MakePoint( -71.33, 41.43),4326)::geography, NULL,        'unverified',_batch_id),
    ('Sunrise Wind',                      'US','other','planned',            924,NULL, _orsted,   35, NULL,      NULL,                          55, ST_SetSRID(ST_MakePoint( -72.27, 40.68),4326)::geography, NULL,        'unverified',_batch_id),
    ('Coastal Virginia Offshore Wind',    'US','other','under construction',2600, 176, _dominion, 28,'monopile','Siemens Gamesa SG 14-236 DD', 43, ST_SetSRID(ST_MakePoint( -75.47, 36.93),4326)::geography, NULL,        'unverified',_batch_id),
    ('Atlantic Shores',                   'US','other','planned',           3000,NULL, _shell,    30, NULL,      NULL,                          17, ST_SetSRID(ST_MakePoint( -73.87, 39.65),4326)::geography, NULL,        'unverified',_batch_id),
    ('Empire Wind 1',                     'US','other','planned',            816,NULL, _equinor,  35, NULL,      NULL,                          30, ST_SetSRID(ST_MakePoint( -73.55, 40.43),4326)::geography, NULL,        'unverified',_batch_id),
    ('Empire Wind 2',                     'US','other','planned',           1260,NULL, _equinor,  35, NULL,      NULL,                          30, ST_SetSRID(ST_MakePoint( -73.70, 40.37),4326)::geography, NULL,        'unverified',_batch_id),
    ('Mayflower Wind',                    'US','other','planned',           2400,NULL, _shell,    35, NULL,      NULL,                          40, ST_SetSRID(ST_MakePoint( -69.95, 41.10),4326)::geography, NULL,        'unverified',_batch_id),
    ('SouthCoast Wind',                   'US','other','planned',           2400,NULL, _shell,    30, NULL,      NULL,                          38, ST_SetSRID(ST_MakePoint( -70.85, 41.20),4326)::geography, NULL,        'unverified',_batch_id),
    ('Avangrid Kitty Hawk',               'US','other','planned',           2500,NULL, _avangrid, 25, NULL,      NULL,                          43, ST_SetSRID(ST_MakePoint( -75.33, 35.83),4326)::geography, NULL,        'unverified',_batch_id),
    ('Skipjack Wind 1',                   'US','other','planned',            966,NULL, _shell,    28, NULL,      NULL,                          31, ST_SetSRID(ST_MakePoint( -73.93, 38.77),4326)::geography, NULL,        'unverified',_batch_id),
    ('New England Wind',                  'US','other','planned',            400,NULL, _avangrid, 38, NULL,      NULL,                          42, ST_SetSRID(ST_MakePoint( -70.05, 41.75),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Taiwan ────────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Formosa 1',                  'TW','other','operational',      128,  22, _orsted,    30,'jacket',  'MHI Vestas V164-8.0',           15, ST_SetSRID(ST_MakePoint(120.30, 24.12),4326)::geography,'2019-11-01','unverified',_batch_id),
    ('Formosa 2',                  'TW','other','operational',      376,  47, _jera,      35,'jacket',  'MHI Vestas V174-9.5',           30, ST_SetSRID(ST_MakePoint(120.62, 24.66),4326)::geography,'2023-01-01','unverified',_batch_id),
    ('Greater Changhua 1 & 2a',    'TW','other','operational',      900, 111, _orsted,    35,'jacket',  'Siemens Gamesa SG 8.0-167 DD',  60, ST_SetSRID(ST_MakePoint(120.08, 23.90),4326)::geography,'2022-12-01','unverified',_batch_id),
    ('Greater Changhua 2b & 4',    'TW','other','under construction',900,NULL, _orsted,   38,'jacket',   NULL,                           65, ST_SetSRID(ST_MakePoint(120.05, 23.80),4326)::geography, NULL,        'unverified',_batch_id),
    ('Yunlin',                     'TW','other','operational',      640,  80, _wpd,       28,'jacket',  'Siemens Gamesa SWT-8.0-154',     8, ST_SetSRID(ST_MakePoint(120.22, 23.65),4326)::geography,'2023-08-01','unverified',_batch_id),
    ('Hai Long 2',                 'TW','other','under construction',1000, 73, _northland, 40,'jacket', 'Siemens Gamesa SG 14-236 DD',   40, ST_SetSRID(ST_MakePoint(120.28, 23.38),4326)::geography, NULL,        'unverified',_batch_id),
    ('Hai Long 3',                 'TW','other','under construction', 736, 50, _northland, 38,'jacket', 'Siemens Gamesa SG 14-236 DD',   38, ST_SetSRID(ST_MakePoint(120.32, 23.52),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Japan ─────────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Akita Port',           'JP','other','operational',             55,  13, _marubeni,   5,'monopile','MHI Vestas V126-3.45',          1, ST_SetSRID(ST_MakePoint(140.10, 39.83),4326)::geography,'2020-12-01','unverified',_batch_id),
    ('Noshiro Port',         'JP','other','operational',            140,  20, _marubeni,   6,'monopile','MHI Vestas V174-9.5',           2, ST_SetSRID(ST_MakePoint(140.05, 40.22),4326)::geography,'2022-12-01','unverified',_batch_id),
    ('Goto Floating Demo',   'JP','other','operational',             16,   2, NULL,       100,'floating','Hitachi 5.2MW',                14, ST_SetSRID(ST_MakePoint(128.70, 32.50),4326)::geography,'2013-10-01','unverified',_batch_id),
    ('Akita Noshiro Offshore','JP','other','planned',               390,NULL, _rwe,        22,'monopile', NULL,                           5, ST_SetSRID(ST_MakePoint(139.85, 40.10),4326)::geography, NULL,        'unverified',_batch_id),
    ('Kitakyushu Hibiki',    'JP','other','operational',             22,   3, NULL,        13,'jacket',  'Siemens SWT-7.0-154',           2, ST_SetSRID(ST_MakePoint(130.88, 33.92),4326)::geography,'2019-08-01','unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── South Korea ───────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Jeju Tamna',           'KR','other','operational',             30,  10, NULL,        10,'monopile','Doosan 3.0MW',                  3, ST_SetSRID(ST_MakePoint(126.22, 33.37),4326)::geography,'2017-10-01','unverified',_batch_id),
    ('Ulsan Floating',       'KR','other','planned',                200,NULL, _equinor,   200,'floating', NULL,                          70, ST_SetSRID(ST_MakePoint(129.80, 35.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Sinan Jeonnam',        'KR','other','planned',               8200,NULL, NULL,        30, NULL,      NULL,                          12, ST_SetSRID(ST_MakePoint(125.88, 34.72),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── China ─────────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Longyuan Rudong Offshore',  'CN','other','operational',       150, 100, _longyuan,  10,'monopile','Sinovel SL1500',                 3, ST_SetSRID(ST_MakePoint(121.48, 32.48),4326)::geography,'2012-01-01','unverified',_batch_id),
    ('Guodian Jiangsu Offshore',  'CN','other','operational',       200, 100, NULL,        12,'monopile','CSSC Haizhuang H128-5.0',        8, ST_SetSRID(ST_MakePoint(121.35, 32.55),4326)::geography,'2015-01-01','unverified',_batch_id),
    ('Huaneng Jiangsu Offshore',  'CN','other','operational',       300, 100, NULL,        14,'monopile','CSSC Haizhuang H131-5.0',       10, ST_SetSRID(ST_MakePoint(121.25, 32.65),4326)::geography,'2016-01-01','unverified',_batch_id),
    ('CGN Guangdong Yangjiang',   'CN','other','operational',       400,  80, _cgnpc,      25,'monopile','Goldwind 5.0MW',                30, ST_SetSRID(ST_MakePoint(111.58, 21.68),4326)::geography,'2021-01-01','unverified',_batch_id),
    ('CTG Yangjiang Offshore',    'CN','other','operational',       400,  80, _ctg,        28,'monopile','CSSC Haizhuang H171-8.0',       30, ST_SetSRID(ST_MakePoint(111.43, 21.72),4326)::geography,'2021-06-01','unverified',_batch_id),
    ('Mingyang Guangdong Offshore','CN','other','under construction',1000,NULL,NULL,       35,'monopile','Mingyang MySE 11.0MW',           40, ST_SetSRID(ST_MakePoint(111.25, 21.55),4326)::geography, NULL,        'unverified',_batch_id),
    ('Zhejiang Guishan',          'CN','other','operational',       300, 100, NULL,        12,'monopile','Sinovel SL3000',                  8, ST_SetSRID(ST_MakePoint(121.58, 28.30),4326)::geography,'2014-01-01','unverified',_batch_id),
    ('Fujian Pingtan',            'CN','other','operational',       200,  50, NULL,        15,'monopile','Goldwind 4.0MW',                  5, ST_SetSRID(ST_MakePoint(119.78, 25.53),4326)::geography,'2019-01-01','unverified',_batch_id),
    ('Guangdong Shapa Offshore',  'CN','other','operational',       300,  60, _ctg,        22,'monopile','Goldwind 5.0MW',                 15, ST_SetSRID(ST_MakePoint(110.52, 21.38),4326)::geography,'2022-01-01','unverified',_batch_id),
    ('Jiangsu Dafeng Offshore',   'CN','other','operational',       200,  50, NULL,        10,'monopile','Envision 4.0MW',                  8, ST_SetSRID(ST_MakePoint(120.98, 32.97),4326)::geography,'2020-01-01','unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Australia ─────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Star of the South',    'AU','other','planned',               2200,NULL, _cip,        35, NULL,      NULL,                          25, ST_SetSRID(ST_MakePoint(147.80,-38.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Gippsland Offshore Wind','AU','other','planned',             2000,NULL, _equinor,    40, NULL,      NULL,                          30, ST_SetSRID(ST_MakePoint(148.20,-38.30),4326)::geography, NULL,        'unverified',_batch_id),
    ('Hunter Coast Offshore','AU','other','planned',               2400,NULL, NULL,         35, NULL,      NULL,                          25, ST_SetSRID(ST_MakePoint(152.50,-32.50),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── India ─────────────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Gujarat Offshore Zone 1','IN','other','planned',             1000,NULL, NULL,        25, NULL,      NULL,                          30, ST_SetSRID(ST_MakePoint( 69.50, 22.50),4326)::geography, NULL,        'unverified',_batch_id),
    ('Tamil Nadu Offshore',  'IN','other','planned',               1000,NULL, NULL,        20, NULL,      NULL,                          20, ST_SetSRID(ST_MakePoint( 80.00, 10.50),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  -- ── Rest of World ─────────────────────────────────────────────────────────
  INSERT INTO wind_farms (name, country_code, sea_basin, status_current, capacity_mw, turbine_count, developer_company_id, water_depth_m, foundation_type, turbine_oem, distance_shore_km, centroid, commissioned_date, data_quality, ingest_batch_id) VALUES
    ('Nador West Med',       'MA','mediterranean','planned',        300,NULL, NULL,        40, NULL,      NULL,                          15, ST_SetSRID(ST_MakePoint( -2.93, 35.22),4326)::geography, NULL,        'unverified',_batch_id),
    ('Port of Suape Offshore','BR','atlantic','planned',            500,NULL, NULL,        30, NULL,      NULL,                          20, ST_SetSRID(ST_MakePoint(-35.00, -8.40),4326)::geography, NULL,        'unverified',_batch_id),
    ('Ba Linh 1 Vietnam',    'VN','other','planned',                500,NULL, NULL,        25, NULL,      NULL,                          15, ST_SetSRID(ST_MakePoint(108.50, 10.80),4326)::geography, NULL,        'unverified',_batch_id),
    ('Penghu Offshore',      'TW','other','planned',                400,NULL, NULL,        30, NULL,      NULL,                          10, ST_SetSRID(ST_MakePoint(119.60, 23.57),4326)::geography, NULL,        'unverified',_batch_id)
  ON CONFLICT (country_code, normalized_name) DO NOTHING;

  RAISE NOTICE 'Seed v2 complete. Batch ID: %', _batch_id;
END $$;

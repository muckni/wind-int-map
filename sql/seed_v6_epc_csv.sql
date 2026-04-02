-- =============================================================================
-- OFFSHORE WIND INTELLIGENCE — V6 SEED: EPC Contractor CSV Ingest
-- Ingests data/raw/contractor_package_research_2026-04-02.csv
-- Run after: migrations/005_epc_roles_confidence_refine.sql
-- Idempotent: guarded by ingest_batches.batch_name unique index.
-- =============================================================================

DO $$
DECLARE
  _batch UUID;

  -- EPC companies (new or remapped from CSV)
  _cadeler      UUID;  -- Cadeler (heavy lift WTIV)
  _deme         UUID;  -- DEME Offshore (already Deme in DB)
  _eew          UUID;  -- EEW (monopile fab; already Eew Spc in DB, reuse)
  _ge_vernova   UUID;  -- GE Vernova (WTG OEM)
  _geg          UUID;  -- Global Energy Group (fab, UK)
  _hellenic     UUID;  -- Hellenic Cables
  _jdr          UUID;  -- JDR Cable Systems
  _mhi_vestas   UUID;  -- MHI Vestas (now Vestas — map to Vestas)
  _nkt          UUID;  -- NKT
  _nexans       UUID;  -- Nexans
  _prysmian     UUID;  -- Prysmian Group (already Prysmian in DB)
  _seaway7      UUID;  -- Seaway7
  _sgre         UUID;  -- Siemens Gamesa Renewable Energy
  _sif          UUID;  -- Sif
  _smulders     UUID;  -- Smulders
  _swire        UUID;  -- Swire Blue Ocean (Cadeler)
  _tfk          UUID;  -- TELE-FONIKA Kable (already Tkf in DB)
  _van_oord     UUID;  -- Van Oord
  _vestas       UUID;  -- Vestas

  -- Wind farm IDs
  _baltic_power UUID;
  _dogger_a     UUID;
  _dogger_b     UUID;
  _dogger_c     UUID;
  _hkz          UUID;  -- Hollandse Kust Zuid 1+2
  _moray_west   UUID;
  _seagreen     UUID;
  _sofia        UUID;

BEGIN

  IF EXISTS (SELECT 1 FROM ingest_batches WHERE batch_name = 'seed_v6_epc_csv') THEN
    RAISE NOTICE 'seed_v6_epc_csv already loaded — skipping.';
    RETURN;
  END IF;

  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
  VALUES (
    'seed_v6_epc_csv',
    'Curated EPC contractor research — public sources',
    'contractor_package_research_2026-04-02.csv',
    'Foundation, cable, WTG contractor roles for 8 key European OWFs. '
    'Sources: developer press releases, 4C Offshore, offshoreWIND.biz.'
  ) RETURNING id INTO _batch;

  -- ── Add missing EPC companies ───────────────────────────────────────────────
  INSERT INTO companies (name, actor_type, hq_country_code, website)
  VALUES
    ('Cadeler',                 'other', 'DK', 'https://www.cadeler.com'),
    ('DEME Offshore',           'other', 'BE', 'https://www.deme-group.com'),
    ('Global Energy Group',     'other', 'GB', 'https://www.globalenergygroup.co.uk'),
    ('MHI Vestas',              'oem',   'DK', NULL),   -- legacy brand; map to Vestas for new records
    ('Swire Blue Ocean',        'other', 'DK', 'https://www.swireblueocean.com')
  ON CONFLICT (normalized_name) DO NOTHING;

  -- ── Look up company IDs (CSV names → DB rows) ───────────────────────────────
  SELECT id INTO _cadeler    FROM companies WHERE normalized_name = lower('Cadeler');
  SELECT id INTO _deme       FROM companies WHERE normalized_name = lower('DEME Offshore');
  -- Fallback to 'Deme' if DEME Offshore not inserted
  IF _deme IS NULL THEN
    SELECT id INTO _deme     FROM companies WHERE normalized_name = 'deme';
  END IF;
  SELECT id INTO _eew        FROM companies WHERE normalized_name = 'eew spc';   -- EEW = Eew Spc
  SELECT id INTO _ge_vernova FROM companies WHERE normalized_name = lower('GE Vernova');
  SELECT id INTO _geg        FROM companies WHERE normalized_name = lower('Global Energy Group');
  SELECT id INTO _hellenic   FROM companies WHERE normalized_name = lower('Hellenic Cables');
  SELECT id INTO _jdr        FROM companies WHERE normalized_name = lower('JDR Cable Systems');
  SELECT id INTO _mhi_vestas FROM companies WHERE normalized_name = lower('MHI Vestas');
  -- MHI Vestas is now Vestas — prefer Vestas
  IF _mhi_vestas IS NULL THEN
    SELECT id INTO _mhi_vestas FROM companies WHERE normalized_name = lower('Vestas Wind Systems');
  END IF;
  SELECT id INTO _nkt        FROM companies WHERE normalized_name = lower('NKT');
  IF _nkt IS NULL THEN
    SELECT id INTO _nkt      FROM companies WHERE normalized_name = 'nkt';
  END IF;
  SELECT id INTO _nexans     FROM companies WHERE normalized_name = lower('Nexans');
  SELECT id INTO _prysmian   FROM companies WHERE normalized_name = 'prysmian';  -- Prysmian Group = Prysmian in DB
  SELECT id INTO _seaway7    FROM companies WHERE normalized_name = lower('Seaway7');
  SELECT id INTO _sgre       FROM companies WHERE normalized_name = lower('Siemens Gamesa Renewable Energy');
  IF _sgre IS NULL THEN
    SELECT id INTO _sgre     FROM companies WHERE normalized_name = lower('Siemens Gamesa');
  END IF;
  SELECT id INTO _sif        FROM companies WHERE normalized_name = lower('Sif');
  SELECT id INTO _smulders   FROM companies WHERE normalized_name = lower('Smulders');
  SELECT id INTO _swire      FROM companies WHERE normalized_name = lower('Swire Blue Ocean');
  SELECT id INTO _tfk        FROM companies WHERE normalized_name = 'tkf';       -- TELE-FONIKA = Tkf
  SELECT id INTO _van_oord   FROM companies WHERE normalized_name = lower('Van Oord');
  SELECT id INTO _vestas     FROM companies WHERE normalized_name = lower('Vestas Wind Systems');
  IF _vestas IS NULL THEN
    SELECT id INTO _vestas   FROM companies WHERE normalized_name = lower('Vestas');
  END IF;

  -- ── Wind farm IDs ───────────────────────────────────────────────────────────
  SELECT id INTO _baltic_power FROM wind_farms WHERE normalized_name = 'baltic power';
  SELECT id INTO _dogger_a     FROM wind_farms WHERE normalized_name = 'dogger bank a'         AND country_code = 'GB';
  SELECT id INTO _dogger_b     FROM wind_farms WHERE normalized_name = 'dogger bank b'         AND country_code = 'GB';
  SELECT id INTO _dogger_c     FROM wind_farms WHERE normalized_name = 'dogger bank c'         AND country_code = 'GB';
  SELECT id INTO _hkz          FROM wind_farms WHERE normalized_name = 'hollandse kust zuid 1+2';
  SELECT id INTO _moray_west   FROM wind_farms WHERE normalized_name = 'moray west'            AND country_code = 'GB';
  SELECT id INTO _seagreen     FROM wind_farms WHERE normalized_name = 'seagreen'              AND country_code = 'GB';
  SELECT id INTO _sofia        FROM wind_farms WHERE normalized_name = 'sofia'                 AND country_code = 'GB';

  -- ── Ensure EPC packages exist ───────────────────────────────────────────────
  INSERT INTO wind_farm_epc_packages (wind_farm_id, package_code, package_status, confidence)
  SELECT farm_id, pkg, 'awarded', 'high'
  FROM (VALUES
    (_dogger_a,     'foundations'),     (_dogger_a,     'inter-array cables'),
    (_dogger_a,     'export cables'),   (_dogger_a,     'wtg'),
    (_dogger_b,     'foundations'),     (_dogger_b,     'inter-array cables'),
    (_dogger_b,     'export cables'),   (_dogger_b,     'wtg'),
    (_dogger_c,     'foundations'),     (_dogger_c,     'inter-array cables'),
    (_dogger_c,     'export cables'),   (_dogger_c,     'wtg'),
    (_moray_west,   'foundations'),     (_moray_west,   'inter-array cables'),
    (_moray_west,   'export cables'),   (_moray_west,   'wtg'),
    (_seagreen,     'foundations'),     (_seagreen,     'inter-array cables'),
    (_seagreen,     'export cables'),   (_seagreen,     'wtg'),
    (_sofia,        'foundations'),     (_sofia,        'inter-array cables'),
    (_sofia,        'export cables'),   (_sofia,        'wtg'),
    (_hkz,          'foundations'),     (_hkz,          'inter-array cables'),
    (_hkz,          'export cables'),   (_hkz,          'wtg'),
    (_baltic_power, 'foundations'),     (_baltic_power, 'inter-array cables'),
    (_baltic_power, 'export cables'),   (_baltic_power, 'wtg')
  ) AS t(farm_id, pkg)
  WHERE farm_id IS NOT NULL
  ON CONFLICT (wind_farm_id, package_code) DO NOTHING;

  -- ── Insert EPC company roles ─────────────────────────────────────────────────
  -- Source: data/raw/contractor_package_research_2026-04-02.csv
  -- Confidence levels from CSV: high/medium/low mapped to DB constraint values

  INSERT INTO wind_farm_epc_company_roles
    (wind_farm_id, company_id, package_code, role_type, confidence,
     source_title, source_url, source_date, notes)
  SELECT farm_id, co_id, pkg, role, conf, src_title, src_url, src_date::date, note
  FROM (VALUES

    -- ════════════════════════════════════════════════════════════════════════
    -- DOGGER BANK A (UK, 1218 MW, SSE/Equinor)
    -- ════════════════════════════════════════════════════════════════════════

    -- Foundations
    (_dogger_a, _sif,      'foundations', 'MP fabricator', 'high',
     'Sif-Smulders to provide monopiles and transition pieces on all three phases of Dogger Bank Wind Farm',
     'https://doggerbank.com/press-releases/sif-smulders-to-provide-monopiles-and-transition-pieces-on-all-three-phases-of-dogger-bank-wind-farm/',
     '2021-11-12', 'Sif-Smulders consortium; monopile fabrication Phase A'),

    (_dogger_a, _smulders, 'foundations', 'TP fabricator', 'high',
     'Sif-Smulders to provide monopiles and transition pieces on all three phases of Dogger Bank Wind Farm',
     'https://doggerbank.com/press-releases/sif-smulders-to-provide-monopiles-and-transition-pieces-on-all-three-phases-of-dogger-bank-wind-farm/',
     '2021-11-12', 'Smulders: secondary steel, assembly/coating/testing of TPs, Phase A'),

    (_dogger_a, _seaway7,  'foundations', 'Foundation installer', 'high',
     'Dogger Bank Wind Farm signs contract with Seaway7 confirming second turbine installation vessel',
     'https://doggerbank.com/construction/dogger-bank-wind-farm-signs-contract-with-seaway7-confirming-second-turbine-installation-vessel/',
     '2025-04-11', 'Seaway7: T&I of monopiles and TPs, Phase A complete'),

    -- Inter-array cables
    (_dogger_a, _hellenic, 'inter-array cables', 'IAC supplier', 'high',
     'Inter-array cable works completed on Dogger Bank A',
     'https://doggerbank.com/construction/inter-array-cable-works-completed-on-dogger-bank-a/',
     '2024-07-23', '66kV inter-array cables; manufactured by Hellenic Cables under DEME contract'),

    (_dogger_a, _deme,     'inter-array cables', 'IAC installer', 'high',
     'Inter-array cable works completed on Dogger Bank A',
     'https://doggerbank.com/construction/inter-array-cable-works-completed-on-dogger-bank-a/',
     '2024-07-23', 'DEME Offshore: IAC installation contractor, Phase A'),

    -- Export cables
    (_dogger_a, _prysmian, 'export cables', 'export cable supplier', 'high',
     'Prysmian Group Awarded Contract for Export Cables on Dogger Bank A and B',
     'https://www.prysmian.com/en/media/press-releases',
     '2020-09-01', 'Prysmian: 320kV HVDC export cable supply, Phases A+B'),

    (_dogger_a, _prysmian, 'export cables', 'export cable installer', 'high',
     'Prysmian Group Awarded Contract for Export Cables on Dogger Bank A and B',
     'https://www.prysmian.com/en/media/press-releases',
     '2020-09-01', 'Prysmian: cable installation, Phase A'),

    -- WTG
    (_dogger_a, _ge_vernova,'wtg', 'WTG OEM', 'high',
     'Dogger Bank Wind Farm to use GE Vernova Haliade-X turbines',
     'https://doggerbank.com',
     '2019-11-07', 'GE Vernova Haliade-X 14 MW turbines; 190 units Phase A'),

    (_dogger_a, _seaway7,  'wtg', 'WTG installer', 'high',
     'Dogger Bank Wind Farm signs contract with Seaway7 confirming second turbine installation vessel',
     'https://doggerbank.com/construction/dogger-bank-wind-farm-signs-contract-with-seaway7-confirming-second-turbine-installation-vessel/',
     '2025-04-11', 'Seaway7 Valiant vessel; WTG T&I Phase A'),

    -- ════════════════════════════════════════════════════════════════════════
    -- DOGGER BANK B (UK, 1218 MW, SSE/Equinor)
    -- ════════════════════════════════════════════════════════════════════════

    (_dogger_b, _sif,      'foundations', 'MP fabricator', 'high',
     'Sif-Smulders to provide monopiles and transition pieces on all three phases of Dogger Bank Wind Farm',
     'https://doggerbank.com/press-releases/sif-smulders-to-provide-monopiles-and-transition-pieces-on-all-three-phases-of-dogger-bank-wind-farm/',
     '2021-11-12', 'Phase B; same contract scope as Phase A'),

    (_dogger_b, _smulders, 'foundations', 'TP fabricator', 'high',
     'Sif-Smulders to provide monopiles and transition pieces on all three phases of Dogger Bank Wind Farm',
     'https://doggerbank.com/press-releases/sif-smulders-to-provide-monopiles-and-transition-pieces-on-all-three-phases-of-dogger-bank-wind-farm/',
     '2021-11-12', 'Phase B'),

    (_dogger_b, _seaway7,  'foundations', 'Foundation installer', 'high',
     'Dogger Bank Wind Farm signs contract with Seaway7 confirming second turbine installation vessel',
     'https://doggerbank.com/construction/dogger-bank-wind-farm-signs-contract-with-seaway7-confirming-second-turbine-installation-vessel/',
     '2025-04-11', 'Seaway7: T&I monopiles+TPs Phase B'),

    (_dogger_b, _hellenic, 'inter-array cables', 'IAC supplier', 'high',
     'Hellenic Cables supplies 66kV inter-array cables for Dogger Bank B',
     'https://www.hellenicscables.com/en/news',
     '2024-01-01', '66kV IAC, Phase B; same supplier as Phase A'),

    (_dogger_b, _deme,     'inter-array cables', 'IAC installer', 'high',
     'DEME Offshore confirmed for Dogger Bank B IAC installation',
     'https://www.deme-group.com/news',
     '2024-01-01', 'DEME: IAC installation Phase B'),

    (_dogger_b, _prysmian, 'export cables', 'export cable supplier', 'high',
     'Prysmian Group Awarded Contract for Export Cables on Dogger Bank A and B',
     'https://www.prysmian.com/en/media/press-releases',
     '2020-09-01', 'Prysmian: 320kV HVDC export cable supply, Phase B'),

    (_dogger_b, _prysmian, 'export cables', 'export cable installer', 'high',
     'Prysmian Group Awarded Contract for Export Cables on Dogger Bank A and B',
     'https://www.prysmian.com/en/media/press-releases',
     '2020-09-01', 'Cable installation Phase B'),

    (_dogger_b, _ge_vernova,'wtg', 'WTG OEM', 'high',
     'Dogger Bank Wind Farm to use GE Vernova Haliade-X turbines',
     'https://doggerbank.com',
     '2019-11-07', 'GE Vernova Haliade-X 14 MW; Phase B'),

    (_dogger_b, _seaway7,  'wtg', 'WTG installer', 'high',
     'Dogger Bank Wind Farm signs contract with Seaway7',
     'https://doggerbank.com/construction/dogger-bank-wind-farm-signs-contract-with-seaway7-confirming-second-turbine-installation-vessel/',
     '2025-04-11', 'Seaway7: WTG T&I Phase B'),

    -- ════════════════════════════════════════════════════════════════════════
    -- DOGGER BANK C (UK, 1218 MW, SSE/Equinor)
    -- ════════════════════════════════════════════════════════════════════════

    (_dogger_c, _sif,      'foundations', 'MP fabricator', 'high',
     'Sif-Smulders to provide monopiles and transition pieces on all three phases of Dogger Bank Wind Farm',
     'https://doggerbank.com/press-releases/sif-smulders-to-provide-monopiles-and-transition-pieces-on-all-three-phases-of-dogger-bank-wind-farm/',
     '2021-11-12', 'Phase C; same contract as A+B'),

    (_dogger_c, _smulders, 'foundations', 'TP fabricator', 'high',
     'Sif-Smulders to provide monopiles and transition pieces on all three phases of Dogger Bank Wind Farm',
     'https://doggerbank.com/press-releases/sif-smulders-to-provide-monopiles-and-transition-pieces-on-all-three-phases-of-dogger-bank-wind-farm/',
     '2021-11-12', 'Phase C'),

    (_dogger_c, _seaway7,  'foundations', 'Foundation installer', 'high',
     'Dogger Bank Wind Farm signs contract with Seaway7',
     'https://doggerbank.com/construction/dogger-bank-wind-farm-signs-contract-with-seaway7-confirming-second-turbine-installation-vessel/',
     '2025-04-11', 'Phase C T&I'),

    (_dogger_c, _ge_vernova,'wtg', 'WTG OEM', 'high',
     'Dogger Bank C: GE Vernova Haliade-X turbines confirmed',
     'https://doggerbank.com',
     '2019-11-07', 'GE Vernova Haliade-X 14 MW; Phase C'),

    (_dogger_c, _seaway7,  'wtg', 'WTG installer', 'high',
     'Seaway7 WTG installation Phase C',
     'https://doggerbank.com',
     '2025-04-11', 'Seaway7: Phase C'),

    -- ════════════════════════════════════════════════════════════════════════
    -- SOFIA (UK, 1320 MW, RWE)
    -- ════════════════════════════════════════════════════════════════════════

    (_sofia, _sif,      'foundations', 'MP fabricator', 'high',
     'Sif secures contract for Sofia Offshore Wind Farm monopiles',
     'https://www.sif-group.com/en/news',
     '2022-03-01', 'Sif: monopile fabrication, Sofia 100 units; confirmed 2022'),

    (_sofia, _geg,      'foundations', 'TP fabricator', 'medium',
     'Global Energy Group selected for Sofia TP fabrication',
     'https://www.globalenergygroup.co.uk/news',
     '2022-06-01', 'GEG Nigg yard: transition piece fabrication'),

    (_sofia, _cadeler,  'foundations', 'Foundation installer', 'high',
     'Cadeler awarded Sofia Offshore Wind Farm monopile installation',
     'https://www.cadeler.com/media/press-releases',
     '2022-10-01', 'Cadeler Wind Osprey vessel; MP+TP installation'),

    (_sofia, _jdr,      'inter-array cables', 'IAC supplier', 'high',
     'JDR Cable Systems awarded Sofia inter-array cable contract',
     'https://www.jdrcables.com/news',
     '2022-05-01', 'JDR Hartlepool facility; 66kV IAC supply'),

    (_sofia, _deme,     'inter-array cables', 'IAC installer', 'medium',
     'DEME Offshore confirmed for Sofia cable installation',
     'https://www.deme-group.com/news',
     '2022-08-01', 'DEME: IAC installation, Sofia'),

    (_sofia, _nexans,   'export cables', 'export cable supplier', 'high',
     'Nexans awarded export cable contract for Sofia Offshore Wind Farm',
     'https://www.nexans.com/en/news',
     '2021-11-01', '320kV HVDC export cable; Nexans Halden plant'),

    (_sofia, _nexans,   'export cables', 'export cable installer', 'high',
     'Nexans awarded export cable contract for Sofia Offshore Wind Farm',
     'https://www.nexans.com/en/news',
     '2021-11-01', 'Nexans Skagerrak cable lay vessel'),

    (_sofia, _sgre,     'wtg', 'WTG OEM', 'high',
     'Siemens Gamesa selected as turbine supplier for Sofia',
     'https://www.siemensgamesa.com/en-int/newsroom',
     '2021-01-01', 'Siemens Gamesa SG 14-222 DD; 100 turbines'),

    (_sofia, _cadeler,  'wtg', 'WTG installer', 'medium',
     'Cadeler to install turbines at Sofia',
     'https://www.cadeler.com/media/press-releases',
     '2022-10-01', 'Cadeler: WTG installation'),

    -- ════════════════════════════════════════════════════════════════════════
    -- SEAGREEN (UK, 1075 MW, SSE 49% / TotalEnergies 51%)
    -- ════════════════════════════════════════════════════════════════════════

    (_seagreen, _deme,    'foundations', 'Foundation installer', 'high',
     'DEME Offshore installs foundations at Seagreen',
     'https://www.deme-group.com/news',
     '2021-09-01', 'DEME: monopile installation at Seagreen'),

    (_seagreen, _nkt,     'inter-array cables', 'IAC supplier', 'high',
     'NKT supplies inter-array cables for Seagreen Wind Farm',
     'https://www.nkt.com/news',
     '2020-08-01', 'NKT: 66kV IAC cables for Seagreen'),

    (_seagreen, _nexans,  'export cables', 'export cable supplier', 'high',
     'Nexans delivers export cables for Seagreen',
     'https://www.nexans.com/en/news',
     '2021-03-01', 'Nexans: HVAC export cables for Seagreen'),

    (_seagreen, _vestas,  'wtg', 'WTG OEM', 'high',
     'Vestas V164-10.0 MW turbines for Seagreen',
     'https://www.vestas.com/en/media/news',
     '2018-05-01', 'Vestas V164-10.0 MW; 114 turbines'),

    (_seagreen, _cadeler, 'wtg', 'WTG installer', 'high',
     'Cadeler installs turbines at Seagreen Offshore Wind Farm',
     'https://www.cadeler.com/media/press-releases',
     '2022-04-01', 'Cadeler Wind Osprey vessel; Seagreen WTG installation'),

    -- ════════════════════════════════════════════════════════════════════════
    -- MORAY WEST (UK, 882 MW, Infinigen Renewables / TotalEnergies)
    -- ════════════════════════════════════════════════════════════════════════

    (_moray_west, _sif,     'foundations', 'MP fabricator', 'high',
     'Sif awarded Moray West monopile contract',
     'https://www.sif-group.com/en/news',
     '2022-07-01', 'Sif: monopile fabrication for Moray West'),

    (_moray_west, _seaway7, 'foundations', 'Foundation installer', 'high',
     'Seaway7 awarded Moray West foundation installation',
     'https://www.seaway7.com/news',
     '2022-09-01', 'Seaway7: MP+TP T&I, Moray West'),

    (_moray_west, _jdr,     'inter-array cables', 'IAC supplier', 'high',
     'JDR cables for Moray West',
     'https://www.jdrcables.com/news',
     '2022-05-01', 'JDR: 66kV IAC cables, Moray West'),

    (_moray_west, _nexans,  'export cables', 'export cable supplier', 'medium',
     'Nexans export cables Moray West',
     'https://www.nexans.com/en/news',
     '2022-01-01', 'Nexans: export cable supply, Moray West'),

    (_moray_west, _sgre,    'wtg', 'WTG OEM', 'high',
     'Siemens Gamesa selected for Moray West turbines',
     'https://www.siemensgamesa.com/en-int/newsroom',
     '2022-02-01', 'Siemens Gamesa SG 14-236 DD; 60 turbines'),

    (_moray_west, _cadeler, 'wtg', 'WTG installer', 'high',
     'Cadeler awarded Moray West WTG installation',
     'https://www.cadeler.com/media/press-releases',
     '2022-11-01', 'Cadeler Wind Osprey; Moray West WTG T&I'),

    -- ════════════════════════════════════════════════════════════════════════
    -- HOLLANDSE KUST ZUID 1+2 (NL, 760 MW, Vattenfall)
    -- ════════════════════════════════════════════════════════════════════════

    (_hkz, _deme,     'foundations', 'Foundation installer', 'high',
     'DEME Offshore installs foundations for Hollandse Kust Zuid',
     'https://www.deme-group.com/news',
     '2021-06-01', 'DEME: monopile installation, HKZ 1+2'),

    (_hkz, _nkt,      'inter-array cables', 'IAC supplier', 'high',
     'NKT awarded cable contract for Hollandse Kust Zuid',
     'https://www.nkt.com/news',
     '2020-10-01', 'NKT: 66kV IAC for HKZ 1+2'),

    (_hkz, _nexans,   'export cables', 'export cable supplier', 'high',
     'Nexans supplies export cables for Hollandse Kust Zuid',
     'https://www.nexans.com/en/news',
     '2020-12-01', 'Nexans: AC export cables, HKZ 1+2'),

    (_hkz, _sgre,     'wtg', 'WTG OEM', 'high',
     'Siemens Gamesa SG 11.0-193 DD for Hollandse Kust Zuid',
     'https://www.siemensgamesa.com/en-int/newsroom',
     '2020-03-01', 'Siemens Gamesa SG 11.0-193 DD; 69 turbines; 0-subsidy project'),

    (_hkz, _van_oord, 'wtg', 'WTG installer', 'high',
     'Van Oord installs turbines at Hollandse Kust Zuid',
     'https://www.vanoord.com/en/news',
     '2021-12-01', 'Van Oord: WTG installation, HKZ 1+2'),

    -- ════════════════════════════════════════════════════════════════════════
    -- BALTIC POWER (Poland, 1140 MW, PKN Orlen / Northland Power)
    -- ════════════════════════════════════════════════════════════════════════

    (_baltic_power, _sgre,    'wtg', 'WTG OEM', 'high',
     'Siemens Gamesa selected as WTG supplier for Baltic Power',
     'https://www.siemensgamesa.com/en-int/newsroom',
     '2023-06-01', 'Siemens Gamesa SG 14-236 DD; 76 turbines'),

    (_baltic_power, _cadeler, 'wtg', 'WTG installer', 'high',
     'Cadeler awarded Baltic Power turbine installation',
     'https://www.cadeler.com/media/press-releases',
     '2023-08-01', 'Cadeler: WTG T&I, Baltic Power'),

    (_baltic_power, _seaway7, 'foundations', 'Foundation installer', 'high',
     'Seaway7 awarded Baltic Power foundation contract',
     'https://www.seaway7.com/news',
     '2023-04-01', 'Seaway7: MP T&I, Baltic Power'),

    (_baltic_power, _nexans,  'export cables', 'export cable supplier', 'medium',
     'Nexans supplying export cables for Baltic Power',
     'https://www.nexans.com/en/news',
     '2023-01-01', 'Nexans: HVAC export cable supply, Baltic Power'),

    (_baltic_power, _tfk,     'inter-array cables', 'IAC supplier', 'medium',
     'TELE-FONIKA Kable (TFK) supplies inter-array cables for Baltic Power',
     'https://www.tfkable.com/en/news',
     '2023-03-01', 'TFK: 66kV IAC cables, Baltic Power; Polish supplier')

  ) AS t(farm_id, co_id, pkg, role, conf, src_title, src_url, src_date, note)
  WHERE farm_id IS NOT NULL AND co_id IS NOT NULL
  ON CONFLICT (wind_farm_id, company_id, package_code, role_type) DO NOTHING;

  RAISE NOTICE 'seed_v6_epc_csv loaded successfully.';
END;
$$;

-- Seed V8: Gennaker map + supply-chain enrichment (idempotent)

DO $$
DECLARE
  _batch UUID;
  _gennaker UUID;
  _skyborn UUID;

  _siemens_gamesa UUID;
  _fowic UUID;
  _eew UUID;
  _dajin UUID;
  _seaway7 UUID;
  _tkf UUID;
  _boskalis UUID;
BEGIN
  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
  VALUES (
    'seed_v8_gennaker_supply_chain',
    'Public contractor announcements',
    'manual/gennaker_supply_chain_2026',
    'Adds announced Gennaker supply-chain links and corrects map-ready project placement fields.'
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO _batch FROM ingest_batches WHERE batch_name = 'seed_v8_gennaker_supply_chain' LIMIT 1;

  SELECT id INTO _gennaker FROM wind_farms WHERE lower(name) = lower('Gennaker') LIMIT 1;
  IF _gennaker IS NULL THEN
    RAISE EXCEPTION 'Gennaker wind farm not found';
  END IF;

  -- Canonical developer
  SELECT id INTO _skyborn
  FROM companies
  WHERE lower(name) = lower('Skyborn Renewables')
  ORDER BY created_at ASC
  LIMIT 1;

  IF _skyborn IS NULL THEN
    INSERT INTO companies (name, actor_type, hq_country_code, website, ingest_batch_id)
    VALUES ('Skyborn Renewables', 'developer', 'DE', 'https://www.skybornrenewables.com', _batch)
    RETURNING id INTO _skyborn;
  END IF;

  -- Ensure the key announced contractors exist
  INSERT INTO companies (name, actor_type, hq_country_code, website, ingest_batch_id)
  VALUES
    ('Boskalis', 'other', 'NL', 'https://www.boskalis.com', _batch),
    ('Dajin Heavy Industry', 'other', 'CN', 'https://www.dajin.cn', _batch),
    ('Fred. Olsen Windcarrier', 'other', 'NO', 'https://windcarrier.com', _batch)
  ON CONFLICT (normalized_name) DO UPDATE
  SET
    hq_country_code = COALESCE(companies.hq_country_code, EXCLUDED.hq_country_code),
    website = COALESCE(companies.website, EXCLUDED.website);

  -- Resolve company IDs (reuse existing rows where present)
  SELECT id INTO _siemens_gamesa FROM companies WHERE lower(name) = lower('Siemens Gamesa') LIMIT 1;
  SELECT id INTO _fowic FROM companies WHERE lower(name) = lower('Fred. Olsen Windcarrier') LIMIT 1;
  SELECT id INTO _eew FROM companies WHERE lower(name) = lower('Eew Spc') LIMIT 1;
  SELECT id INTO _dajin FROM companies WHERE lower(name) = lower('Dajin Heavy Industry') LIMIT 1;
  SELECT id INTO _seaway7 FROM companies WHERE lower(name) = lower('Seaway7') LIMIT 1;
  SELECT id INTO _tkf FROM companies WHERE lower(name) = lower('Tkf') LIMIT 1;
  SELECT id INTO _boskalis FROM companies WHERE lower(name) = lower('Boskalis') LIMIT 1;

  -- HQ locations for companies introduced in this enrichment
  IF _fowic IS NOT NULL THEN
    INSERT INTO company_locations (company_id, location, location_type, city, country_code)
    VALUES (_fowic, ST_SetSRID(ST_MakePoint(10.7522, 59.9139), 4326)::geography, 'hq', 'Oslo', 'NO')
    ON CONFLICT (company_id, location_type)
    DO UPDATE SET location = EXCLUDED.location, city = EXCLUDED.city, country_code = EXCLUDED.country_code;
  END IF;

  IF _boskalis IS NOT NULL THEN
    INSERT INTO company_locations (company_id, location, location_type, city, country_code)
    VALUES (_boskalis, ST_SetSRID(ST_MakePoint(4.6878, 51.8319), 4326)::geography, 'hq', 'Papendrecht', 'NL')
    ON CONFLICT (company_id, location_type)
    DO UPDATE SET location = EXCLUDED.location, city = EXCLUDED.city, country_code = EXCLUDED.country_code;
  END IF;

  IF _dajin IS NOT NULL THEN
    INSERT INTO company_locations (company_id, location, location_type, city, country_code)
    VALUES (_dajin, ST_SetSRID(ST_MakePoint(120.7580, 37.8110), 4326)::geography, 'hq', 'Penglai', 'CN')
    ON CONFLICT (company_id, location_type)
    DO UPDATE SET location = EXCLUDED.location, city = EXCLUDED.city, country_code = EXCLUDED.country_code;
  END IF;

  -- Correct Gennaker map-facing project fields
  UPDATE wind_farms
  SET
    country_code = 'DE',
    sea_basin = 'baltic sea',
    status_current = 'planned',
    capacity_mw = 976.5,
    turbine_count = 63,
    turbine_oem = 'Siemens Gamesa',
    turbine_model = 'SG 14-236',
    distance_shore_km = 15,
    centroid = ST_SetSRID(ST_MakePoint(12.607, 54.616), 4326)::geography,
    geometry_quality = 'approximated',
    developer_company_id = COALESCE(_skyborn, developer_company_id),
    updated_at = now()
  WHERE id = _gennaker;

  -- Ensure explicit equity partner link for Skyborn on Gennaker
  IF _skyborn IS NOT NULL THEN
    INSERT INTO wind_farm_ownership (
      wind_farm_id, company_id, equity_share_pct, role_type, is_current,
      data_quality, confidence, source_title, source_url, ingest_batch_id
    )
    VALUES (
      _gennaker, _skyborn, NULL, 'equity partner', true,
      'unverified', 'assumed',
      'Skyborn Gennaker ownership alignment',
      'https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_major_contractors_signed',
      _batch
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Gennaker announced supply-chain links (recent announcements)
  IF _eew IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _eew, 'foundations', 'MP fabricator', true,
      'medium',
      'Skyborn secures all major contractors for Gennaker offshore wind farm',
      'https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_major_contractors_signed',
      DATE '2025-09-01',
      'PSA for supply of 63 monopile foundations.'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;

  IF _dajin IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _dajin, 'foundations', 'TP fabricator', true,
      'medium',
      'Skyborn secures all major contractors for Gennaker offshore wind farm',
      'https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_major_contractors_signed',
      DATE '2025-09-01',
      'PSA for supply of 63 transition pieces.'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;

  IF _seaway7 IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _seaway7, 'foundations', 'Foundation installer', true,
      'high',
      'Subsea7 awarded contract offshore Germany',
      'https://www.subsea7.com/en/media/company-news/2026/Subsea7_awarded_contract_offshore_Germany.html',
      DATE '2026-01-29',
      'Firm contract for transportation and installation of 63 monopiles and transition pieces.'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;

  IF _tkf IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _tkf, 'inter-array cables', 'IAC supplier', true,
      'high',
      'Boskalis secures contract for the inter-array cable system at the Gennaker Offshore Wind Farm',
      'https://boskalis.com/press/press-releases-and-company-news/boskalis-secures-contract-for-the-inter-array-cable-system-at-the-gennaker-offshore-wind-farm',
      DATE '2026-02-26',
      'Consortium contract with Boskalis and TKF for ~140 km of 66 kV inter-array cables.'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;

  IF _boskalis IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _boskalis, 'inter-array cables', 'IAC installer', true,
      'high',
      'Boskalis secures contract for the inter-array cable system at the Gennaker Offshore Wind Farm',
      'https://boskalis.com/press/press-releases-and-company-news/boskalis-secures-contract-for-the-inter-array-cable-system-at-the-gennaker-offshore-wind-farm',
      DATE '2026-02-26',
      'Consortium contract with TKF; Boskalis to install cables with BOKA Ocean.'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;

  IF _siemens_gamesa IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _siemens_gamesa, 'wtg', 'WTG OEM', true,
      'medium',
      'Skyborn confirms Siemens Gamesa turbine supply and service agreement for Gennaker project',
      'https://www.skybornrenewables.com/articles/newsroom/Skyborn_confirms_Siemens_Gamesa_agreements',
      DATE '2025-07-18',
      'TSA and long-term service agreement for 63 SG 14-236 turbines.'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;

  IF _fowic IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, is_current,
      confidence, source_title, source_url, source_date, notes
    ) VALUES (
      _gennaker, _fowic, 'wtg', 'WTG installer', true,
      'medium',
      'Skyborn enters Preferred Supplier Agreement with Fred. Olsen Windcarrier for Gennaker offshore installation vessel',
      'https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_offshore_installation_vessel',
      DATE '2025-07-29',
      'PSA for offshore wind turbine transportation and installation (Brave Tern).'
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type)
    DO UPDATE SET source_title=EXCLUDED.source_title, source_url=EXCLUDED.source_url, source_date=EXCLUDED.source_date, notes=EXCLUDED.notes, is_current=true, confidence=EXCLUDED.confidence;
  END IF;
END $$;

-- Seed V7: Skyborn global linking + key farm contractor relationships
-- Idempotent and safe to rerun

DO $$
DECLARE
  _skyborn UUID;
  _batch UUID;

  _butendiek UUID;
  _gennaker UUID;
  _nordergruende UUID;
  _yunlin UUID;

  _siemens_gamesa UUID;
  _senvion UUID;
BEGIN
  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
  VALUES (
    'seed_v7_skyborn_links',
    'Internal map alignment update',
    'manual/scope_skyborn_map_alignment',
    'Adds Skyborn HQ + ownership links and fills missing EPC links for selected projects.'
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO _batch FROM ingest_batches WHERE batch_name = 'seed_v7_skyborn_links' LIMIT 1;

  -- Canonical Skyborn company row
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

  -- HQ Hamburg
  INSERT INTO company_locations (company_id, location, location_type, city, country_code)
  VALUES (_skyborn, ST_SetSRID(ST_MakePoint(9.993682, 53.551086), 4326)::geography, 'hq', 'Hamburg', 'DE')
  ON CONFLICT (company_id, location_type)
  DO UPDATE SET
    location = EXCLUDED.location,
    city = EXCLUDED.city,
    country_code = EXCLUDED.country_code;

  -- Link Skyborn to all wind farms as equity partner (if not already current)
  INSERT INTO wind_farm_ownership (
    wind_farm_id,
    company_id,
    equity_share_pct,
    role_type,
    is_current,
    data_quality,
    confidence,
    source_title,
    ingest_batch_id
  )
  SELECT
    wf.id,
    _skyborn,
    NULL,
    'equity partner',
    true,
    'unverified',
    'assumed',
    'Skyborn map alignment ownership link',
    _batch
  FROM wind_farms wf
  WHERE NOT EXISTS (
    SELECT 1
    FROM wind_farm_ownership wfo
    WHERE wfo.wind_farm_id = wf.id
      AND wfo.company_id = _skyborn
      AND wfo.is_current = true
  );

  -- Selected farms
  SELECT id INTO _butendiek FROM wind_farms WHERE lower(name) = lower('Butendiek') LIMIT 1;
  SELECT id INTO _gennaker FROM wind_farms WHERE lower(name) = lower('Gennaker') LIMIT 1;
  SELECT id INTO _nordergruende FROM wind_farms WHERE lower(name) = lower('Nordergründe') LIMIT 1;
  SELECT id INTO _yunlin FROM wind_farms WHERE lower(name) = lower('Yunlin') LIMIT 1;

  -- Key contractor companies
  SELECT id INTO _siemens_gamesa FROM companies WHERE lower(name) = lower('Siemens Gamesa') LIMIT 1;
  SELECT id INTO _senvion FROM companies WHERE lower(name) = lower('Senvion') LIMIT 1;

  -- Ensure key EPC relationships exist for selected farms
  IF _gennaker IS NOT NULL AND _siemens_gamesa IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, confidence,
      source_title, source_url, source_date, notes, is_current
    ) VALUES (
      _gennaker, _siemens_gamesa, 'wtg', 'WTG OEM', 'medium',
      'Skyborn map alignment update',
      'https://www.skybornrenewables.com',
      CURRENT_DATE,
      'Added to ensure contractor relationship coverage for map visibility.',
      true
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type) DO NOTHING;
  END IF;

  IF _nordergruende IS NOT NULL AND _senvion IS NOT NULL THEN
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id, company_id, package_code, role_type, confidence,
      source_title, source_url, source_date, notes, is_current
    ) VALUES (
      _nordergruende, _senvion, 'wtg', 'WTG OEM', 'medium',
      'Skyborn map alignment update',
      'https://www.skybornrenewables.com',
      CURRENT_DATE,
      'Added to ensure contractor relationship coverage for map visibility.',
      true
    )
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type) DO NOTHING;
  END IF;

  -- Ensure Skyborn appears as equity partner on the requested subset explicitly
  INSERT INTO wind_farm_ownership (
    wind_farm_id, company_id, equity_share_pct, role_type, is_current,
    data_quality, confidence, source_title, ingest_batch_id
  )
  SELECT x.wind_farm_id, _skyborn, NULL, 'equity partner', true,
         'unverified', 'assumed', 'Skyborn map alignment ownership link (requested farms)', _batch
  FROM (
    VALUES (_butendiek), (_gennaker), (_nordergruende), (_yunlin)
  ) AS x(wind_farm_id)
  WHERE x.wind_farm_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM wind_farm_ownership wfo
      WHERE wfo.wind_farm_id = x.wind_farm_id
        AND wfo.company_id = _skyborn
        AND wfo.role_type = 'equity partner'
        AND wfo.is_current = true
    );
END $$;

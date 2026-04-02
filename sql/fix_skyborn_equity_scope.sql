-- Restrict Skyborn equity-partner ownership links to explicit real scope.
-- Idempotent and safe to rerun.

DO $$
DECLARE
  _skyborn UUID;
  _batch UUID;
  _wf_butendiek UUID;
  _wf_gennaker UUID;
  _wf_nordergruende UUID;
  _wf_yunlin UUID;
BEGIN
  SELECT id INTO _skyborn
  FROM companies
  WHERE lower(name) = lower('Skyborn Renewables')
  ORDER BY created_at ASC
  LIMIT 1;

  IF _skyborn IS NULL THEN
    RAISE NOTICE 'Skyborn Renewables not found; no changes applied.';
    RETURN;
  END IF;

  INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
  VALUES (
    'fix_skyborn_equity_scope',
    'Internal correction',
    'manual/fix_skyborn_equity_scope',
    'Removes incorrect broad Skyborn equity links and keeps only explicit project scope.'
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO _batch FROM ingest_batches WHERE batch_name = 'fix_skyborn_equity_scope' LIMIT 1;

  -- Remove previously inserted blanket rows (all farms).
  DELETE FROM wind_farm_ownership wfo
  WHERE wfo.company_id = _skyborn
    AND COALESCE(wfo.source_title, '') ILIKE 'Skyborn map alignment ownership link%';

  -- Resolve explicit farm scope.
  SELECT id INTO _wf_butendiek FROM wind_farms WHERE lower(name) = lower('Butendiek') LIMIT 1;
  SELECT id INTO _wf_gennaker FROM wind_farms WHERE lower(name) = lower('Gennaker') LIMIT 1;
  SELECT id INTO _wf_nordergruende FROM wind_farms WHERE lower(name) = lower('Nordergründe') LIMIT 1;
  SELECT id INTO _wf_yunlin FROM wind_farms WHERE lower(name) = lower('Yunlin') LIMIT 1;

  -- Reinsert explicit equity-partner relationships only.
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
    x.wind_farm_id,
    _skyborn,
    NULL,
    'equity partner',
    true,
    'unverified',
    'assumed',
    'Skyborn equity scope correction',
    _batch
  FROM (
    VALUES (_wf_butendiek), (_wf_gennaker), (_wf_nordergruende), (_wf_yunlin)
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

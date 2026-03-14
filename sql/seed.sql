-- Minimal seed aligned with CSV-like structure
INSERT INTO companies (id, name, actor_type, hq_country_code, website)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Orsted', 'Developer', 'DK', 'https://orsted.com'),
  ('22222222-2222-2222-2222-222222222222', 'Equinor', 'Developer', 'NO', 'https://equinor.com'),
  ('33333333-3333-3333-3333-333333333333', 'SSE Renewables', 'Developer', 'GB', 'https://sse.com'),
  ('44444444-4444-4444-4444-444444444444', 'Google', 'Offtaker', 'US', 'https://google.com');

INSERT INTO wind_farms (
  id, name, country_code, sea_basin, status_current, capacity_mw, turbine_count,
  developer_company_id, water_depth_m, foundation_type, centroid, commissioned_date, data_quality
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Hornsea Two',
    'GB',
    'North Sea',
    'Operational',
    1386,
    165,
    '11111111-1111-1111-1111-111111111111',
    25,
    'Monopile',
    ST_GeogFromText('POINT(1.8 53.8)'),
    '2022-08-31',
    'Verified'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Dogger Bank A',
    'GB',
    'North Sea',
    'Under Construction',
    1200,
    95,
    '33333333-3333-3333-3333-333333333333',
    30,
    'Monopile',
    ST_GeogFromText('POINT(2.5 54.5)'),
    NULL,
    'Unverified'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Hywind Tampen',
    'NO',
    'North Sea',
    'Operational',
    88,
    11,
    '22222222-2222-2222-2222-222222222222',
    260,
    'Floating',
    ST_GeogFromText('POINT(2.3 61.3)'),
    '2022-11-01',
    'Verified'
  );

INSERT INTO wind_farm_ownership (
  wind_farm_id, company_id, equity_share_pct, role_type, valid_from, is_current, data_quality
)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 60, 'Developer', '2019-01-01', true, 'Unverified'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 40, 'Equity Partner', '2019-01-01', true, 'Unverified');

INSERT INTO contracts (
  id, wind_farm_id, contract_type, counterparty_company_id, start_date, end_date, price_eur_mwh,
  verification_status, notes
)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CfD', NULL,
   '2018-01-01', '2033-12-31', 65.0, 'Verified', NULL),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Corporate PPA',
   '44444444-4444-4444-4444-444444444444', '2020-01-01', '2030-12-31', 50.0, 'Example',
   'Placeholder contract for UI prototyping');

INSERT INTO sources (id, name, url, description)
VALUES
  ('99999999-9999-9999-9999-999999999999', 'Public dataset placeholder', 'https://example.com', 'Placeholder source for V1 seed data');

INSERT INTO wind_farm_sources (wind_farm_id, source_id, field_name, notes)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', 'capacity_mw', 'Seed value for V1');

INSERT INTO contract_sources (contract_id, source_id, field_name, notes)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '99999999-9999-9999-9999-999999999999', 'price_eur_mwh', 'Example linkage');

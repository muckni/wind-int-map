-- Offshore wind map entity readiness checks (offtakers + contractors)

-- 1) Entity totals by inferred class (offtaker / contractor)
WITH inferred AS (
  SELECT
    c.id,
    c.name,
    CASE
      WHEN lower(c.actor_type) = 'offtaker' OR EXISTS (
        SELECT 1 FROM contracts ct WHERE ct.counterparty_company_id = c.id
      ) THEN 'offtaker'
      WHEN EXISTS (
        SELECT 1 FROM wind_farm_epc_company_roles e WHERE e.company_id = c.id AND e.is_current = true)
        OR lower(c.actor_type) = 'oem' THEN 'contractor'
      ELSE NULL
    END AS entity_type
  FROM companies c
)
SELECT entity_type, COUNT(*) AS total
FROM inferred
WHERE entity_type IS NOT NULL
GROUP BY entity_type
ORDER BY entity_type;

-- 2) Linked vs unlinked per class
WITH inferred AS (
  SELECT
    c.id,
    CASE
      WHEN lower(c.actor_type) = 'offtaker' OR EXISTS (
        SELECT 1 FROM contracts ct WHERE ct.counterparty_company_id = c.id
      ) THEN 'offtaker'
      WHEN EXISTS (
        SELECT 1 FROM wind_farm_epc_company_roles e WHERE e.company_id = c.id AND e.is_current = true)
        OR lower(c.actor_type) = 'oem' THEN 'contractor'
      ELSE NULL
    END AS entity_type
  FROM companies c
),
links AS (
  SELECT
    i.entity_type,
    i.id,
    CASE
      WHEN i.entity_type = 'offtaker' THEN EXISTS (
        SELECT 1 FROM contracts ct WHERE ct.counterparty_company_id = i.id
      )
      WHEN i.entity_type = 'contractor' THEN EXISTS (
        SELECT 1 FROM wind_farm_epc_company_roles e WHERE e.company_id = i.id AND e.is_current = true
      )
      ELSE false
    END AS is_linked
  FROM inferred i
  WHERE i.entity_type IS NOT NULL
)
SELECT
  entity_type,
  COUNT(*) FILTER (WHERE is_linked) AS linked,
  COUNT(*) FILTER (WHERE NOT is_linked) AS unlinked
FROM links
GROUP BY entity_type
ORDER BY entity_type;

-- 3) Location coverage (point/city+country/country-only/none)
WITH inferred AS (
  SELECT
    c.id,
    CASE
      WHEN lower(c.actor_type) = 'offtaker' OR EXISTS (
        SELECT 1 FROM contracts ct WHERE ct.counterparty_company_id = c.id
      ) THEN 'offtaker'
      WHEN EXISTS (
        SELECT 1 FROM wind_farm_epc_company_roles e WHERE e.company_id = c.id AND e.is_current = true)
        OR lower(c.actor_type) = 'oem' THEN 'contractor'
      ELSE NULL
    END AS entity_type,
    c.hq_country_code
  FROM companies c
),
rollup AS (
  SELECT
    i.entity_type,
    i.id,
    bool_or(cl.location IS NOT NULL AND abs(ST_X(cl.location::geometry)) <= 180 AND abs(ST_Y(cl.location::geometry)) <= 90) AS has_valid_point,
    bool_or(NULLIF(trim(cl.city), '') IS NOT NULL) AS has_city,
    COALESCE(bool_or(cl.country_code IS NOT NULL), i.hq_country_code IS NOT NULL) AS has_country
  FROM inferred i
  LEFT JOIN company_locations cl ON cl.company_id = i.id
  WHERE i.entity_type IS NOT NULL
  GROUP BY i.entity_type, i.id, i.hq_country_code
)
SELECT
  entity_type,
  COUNT(*) FILTER (WHERE has_valid_point) AS point,
  COUNT(*) FILTER (WHERE NOT has_valid_point AND has_city AND has_country) AS city_country_only,
  COUNT(*) FILTER (WHERE NOT has_valid_point AND NOT has_city AND has_country) AS country_only,
  COUNT(*) FILTER (WHERE NOT has_valid_point AND NOT has_city AND NOT has_country) AS none
FROM rollup
GROUP BY entity_type
ORDER BY entity_type;

-- 4) Invalid coordinate rows in company_locations
SELECT COUNT(*) AS invalid_coordinate_rows
FROM company_locations
WHERE abs(ST_X(location::geometry)) > 180
   OR abs(ST_Y(location::geometry)) > 90;

-- 5) Duplicate company names (normalized)
SELECT normalized_name, COUNT(*) AS dup_count
FROM companies
GROUP BY normalized_name
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, normalized_name;

-- 6) Relationship coverage totals
SELECT
  (SELECT COUNT(*) FROM contracts WHERE counterparty_company_id IS NOT NULL) AS offtaker_links,
  (SELECT COUNT(DISTINCT counterparty_company_id) FROM contracts WHERE counterparty_company_id IS NOT NULL) AS linked_offtaker_companies,
  (SELECT COUNT(*) FROM wind_farm_epc_company_roles WHERE is_current = true AND company_id IS NOT NULL) AS contractor_links,
  (SELECT COUNT(DISTINCT company_id) FROM wind_farm_epc_company_roles WHERE is_current = true AND company_id IS NOT NULL) AS linked_contractor_companies;

-- 7) API-ready counts (companies endpoint filter)
-- Run via API: /api/companies?with_location=true
-- Expected: includes only entities with lng/lat (hq or farm-derived fallback)

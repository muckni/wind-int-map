-- Migration 004: create EPC package taxonomy and contractor role tables
-- Idempotent; safe on fresh databases and tolerant on existing ones.
BEGIN;

CREATE TABLE IF NOT EXISTS epc_package_taxonomy (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  package_group TEXT NOT NULL,
  description TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 100,
  CONSTRAINT epc_package_taxonomy_group_check
    CHECK (lower(package_group) IN ('electrical', 'turbine', 'substructure', 'balance of plant', 'other'))
);

INSERT INTO epc_package_taxonomy (code, display_name, package_group, description, sort_order)
VALUES
  ('foundations', 'Foundations', 'substructure', 'Monopiles, jackets, transition pieces', 10),
  ('inter-array cables', 'Inter-array Cables', 'electrical', 'Array cable system and accessories', 20),
  ('export cables', 'Export Cables', 'electrical', 'Export cable system to grid connection', 30),
  ('wtg', 'WTG', 'turbine', 'Wind turbine generators and nacelles', 40)
ON CONFLICT (code) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  package_group = EXCLUDED.package_group,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS wind_farm_epc_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL REFERENCES epc_package_taxonomy(code),
  package_status TEXT NOT NULL DEFAULT 'unknown',
  confidence TEXT NOT NULL DEFAULT 'unknown',
  provenance_note TEXT,
  source_url TEXT,
  source_title TEXT,
  source_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wind_farm_epc_packages_wind_farm_id_package_code_key
    UNIQUE (wind_farm_id, package_code),
  CONSTRAINT epc_package_status_check
    CHECK (lower(package_status) IN ('planned', 'pre-qualified', 'tendering', 'awarded', 'installed', 'operational', 'unknown'))
);

CREATE INDEX IF NOT EXISTS epc_packages_wf_idx ON wind_farm_epc_packages (wind_farm_id);

CREATE TABLE IF NOT EXISTS wind_farm_epc_company_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wind_farm_id UUID NOT NULL REFERENCES wind_farms(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  package_code TEXT NOT NULL REFERENCES epc_package_taxonomy(code),
  role_type TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT true,
  contract_scope TEXT,
  award_date DATE,
  start_date DATE,
  end_date DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  provenance_note TEXT,
  source_url TEXT,
  source_title TEXT,
  source_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS epc_company_roles_wf_idx ON wind_farm_epc_company_roles (wind_farm_id);
CREATE INDEX IF NOT EXISTS epc_company_roles_company_idx ON wind_farm_epc_company_roles (company_id);
CREATE INDEX IF NOT EXISTS epc_company_roles_package_role_idx
  ON wind_farm_epc_company_roles (package_code, role_type);

COMMIT;

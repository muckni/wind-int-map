-- Migration 005: align EPC roles/confidence with contractor intelligence model
-- Idempotent; safe to rerun
BEGIN;

ALTER TABLE wind_farm_epc_packages
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE wind_farm_epc_packages DROP CONSTRAINT IF EXISTS epc_package_confidence_check;
ALTER TABLE wind_farm_epc_packages ADD CONSTRAINT epc_package_confidence_check
  CHECK (lower(confidence) IN ('high','medium','low'));

ALTER TABLE wind_farm_epc_packages DROP CONSTRAINT IF EXISTS epc_package_code_check;
ALTER TABLE wind_farm_epc_packages ADD CONSTRAINT epc_package_code_check
  CHECK (lower(package_code) IN ('foundations','inter-array cables','export cables','wtg'));

ALTER TABLE wind_farm_epc_company_roles
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE wind_farm_epc_company_roles DROP CONSTRAINT IF EXISTS epc_company_role_type_check;
ALTER TABLE wind_farm_epc_company_roles ADD CONSTRAINT epc_company_role_type_check
  CHECK (lower(role_type) IN (
    'foundation fabricator',
    'foundation installer',
    'mp fabricator',
    'tp fabricator',
    'jacket fabricator',
    'iac supplier',
    'iac installer',
    'export cable supplier',
    'export cable installer',
    'wtg oem',
    'wtg installer',
    'epc contractor'
  ));

ALTER TABLE wind_farm_epc_company_roles DROP CONSTRAINT IF EXISTS epc_company_role_confidence_check;
ALTER TABLE wind_farm_epc_company_roles ADD CONSTRAINT epc_company_role_confidence_check
  CHECK (lower(confidence) IN ('high','medium','low'));

ALTER TABLE wind_farm_epc_company_roles
  DROP CONSTRAINT IF EXISTS wind_farm_epc_company_roles_unique_role;
ALTER TABLE wind_farm_epc_company_roles
  ADD CONSTRAINT wind_farm_epc_company_roles_unique_role
  UNIQUE (wind_farm_id, company_id, package_code, role_type);

COMMIT;

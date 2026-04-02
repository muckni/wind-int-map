# Data Validation Report

Generated: 2026-04-02T11:34:13.618Z
Database: offshore_wind

## Table counts
- companies: 127
- company_locations: 75
- contract_sources: 0
- contracts: 56
- sources: 15
- turbines: 8363
- wind_farm_epc_company_roles: 267
- wind_farm_epc_packages: 240
- wind_farm_ownership: 76
- wind_farm_sources: 0
- wind_farms: 581

## Major checks
- Wind farm duplicate excess rows: 0
- Duplicate company groups: 0
- Wind farms missing centroid: 0/581
- Wind farms missing project_area: 387/581
- Wind farms with non-positive capacity: 0
- Wind farms with very high capacity (>4000 MW): 1
- Ownership duplicate links: 0
- Contract duplicate links: 0
- Contracts missing source: 56/56
- EPC package rows missing source_url: 86/240
- EPC role rows missing source_url: 0/267

## Canonical base
- wind_farms (id + country_code + normalized_name)
- companies (id + normalized_name)
- wind_farm_ownership for company-to-project linkage

## Treat carefully
- route-to-market and offtaker interpretation when contract source metadata is missing
- EPC role granularity where package_code/role_type may be incomplete
- very high capacity records flagged for manual source verification

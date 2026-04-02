export type AdminTableConfig = {
  name: string;
  label: string;
  description: string;
  defaultSort: string;
  searchColumns: string[];
  readOnlyColumns?: string[];
};

export const ADMIN_TABLE_CONFIGS: AdminTableConfig[] = [
  {
    name: "wind_farms",
    label: "Wind Farms",
    description: "Core offshore wind farm records",
    defaultSort: "name",
    searchColumns: ["name", "country_code", "status_current", "sea_basin"],
    readOnlyColumns: ["id", "normalized_name", "centroid", "project_area", "created_at", "updated_at"],
  },
  {
    name: "companies",
    label: "Companies",
    description: "Developers, owners, offtakers and related actors",
    defaultSort: "name",
    searchColumns: ["name", "actor_type", "hq_country_code", "website"],
    readOnlyColumns: ["id", "normalized_name", "created_at", "updated_at"],
  },
  {
    name: "wind_farm_ownership",
    label: "Wind Farm Relationships",
    description: "Developer/owner/equity role links",
    defaultSort: "created_at",
    searchColumns: ["role_type", "data_quality", "confidence", "source_title"],
    readOnlyColumns: ["id", "created_at", "updated_at"],
  },
  {
    name: "contracts",
    label: "Offtaker / PPA Contracts",
    description: "Route-to-market and contract counterparties",
    defaultSort: "created_at",
    searchColumns: ["contract_type", "verification_status", "source_title", "notes"],
    readOnlyColumns: ["id", "created_at", "updated_at"],
  },
  {
    name: "wind_farm_support_schemes",
    label: "Support Schemes",
    description: "Structured project-level subsidy and auction support data",
    defaultSort: "award_year",
    searchColumns: ["support_scheme_type", "allocation_round", "tender_name", "source_title", "notes"],
    readOnlyColumns: ["id", "record_key", "created_at", "updated_at"],
  },
  {
    name: "wind_farm_support_price_history",
    label: "Support Price History",
    description: "Dated support-price observations for charting and provenance",
    defaultSort: "observation_date",
    searchColumns: ["observation_type", "source_title", "notes"],
    readOnlyColumns: ["id", "history_key", "created_at", "updated_at"],
  },
  {
    name: "company_locations",
    label: "Company Locations",
    description: "Company HQ and representative map points",
    defaultSort: "created_at",
    searchColumns: ["location_type", "city", "country_code"],
    readOnlyColumns: ["id", "location", "created_at"],
  },
  {
    name: "turbines",
    label: "Turbines",
    description: "Per-turbine location rows",
    defaultSort: "wind_farm_id",
    searchColumns: ["wind_farm_id", "geometry_quality"],
    readOnlyColumns: ["id", "location", "created_at"],
  },
  {
    name: "wind_farm_epc_packages",
    label: "EPC Packages",
    description: "Per-project EPC package status and confidence",
    defaultSort: "created_at",
    searchColumns: ["package_code", "package_status", "confidence", "source_title", "notes"],
    readOnlyColumns: ["id", "created_at", "updated_at"],
  },
  {
    name: "wind_farm_epc_company_roles",
    label: "EPC Company Roles",
    description: "Company role assignments per EPC package",
    defaultSort: "created_at",
    searchColumns: ["package_code", "role_type", "confidence", "source_title", "notes"],
    readOnlyColumns: ["id", "created_at", "updated_at"],
  },
];

export const SYSTEM_READONLY_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "normalized_name",
]);

export const GEOMETRY_TYPES = new Set(["geometry", "geography"]);

export function getAdminTableConfig(tableName: string) {
  return ADMIN_TABLE_CONFIGS.find((t) => t.name === tableName) ?? null;
}

export function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

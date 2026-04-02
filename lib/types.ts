export type WindFarmPoint = {
  id: string;
  name: string;
  country_code: string;
  sea_basin: string | null;
  status_current: string;
  capacity_mw: number | null;
  turbine_count: number | null;
  turbine_oem: string | null;
  developer_company_id: string | null;
  developer_name: string | null;
  water_depth_m: number | null;
  foundation_type: string | null;
  distance_shore_km: number | null;
  commissioned_date: string | null;
  geometry_quality: string | null;
  route_to_market: string | null;
  lng: number;
  lat: number;
};

export type TurbinePoint = {
  id: string;
  wind_farm_id: string;
  turbine_index: number | null;
  geometry_quality: string | null;
  lng: number;
  lat: number;
};

export type CompanyPoint = {
  id: string;
  name: string;
  actor_type: string;
  hq_country_code: string | null;
  website: string | null;
  lng: number;
  lat: number;
  city: string | null;
};

export type NetworkLink = {
  farm_id: string;
  farm_name: string;
  status_current: string;
  capacity_mw: number | null;
  country_code: string;
  farm_lng: number;
  farm_lat: number;
  role_type: string;
  equity_share_pct: number | null;
  company_lng: number;
  company_lat: number;
};

export type WindFarmFilters = {
  country_code?: string;
  status_current?: string;
  sea_basin?: string;
  developer_company_id?: string;
};

export type FilterOptions = {
  countries: string[];
  status: string[];
  basins: string[];
};

export type CompanySummary = {
  id: string;
  name: string;
  actor_type: string;
  hq_country_code: string | null;
  website: string | null;
};

export type WindFarmOwnership = {
  id: string;
  company_id: string;
  company_name: string;
  equity_share_pct: number | null;
  role_type: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_current: boolean;
  data_quality: string | null;
};

export type WindFarmContract = {
  id: string;
  contract_type: string;
  counterparty_company_id: string | null;
  counterparty_name: string | null;
  start_date: string | null;
  end_date: string | null;
  price_eur_mwh: number | null;
  volume_mwh: number | null;
  verification_status: string | null;
  notes: string | null;
};

export type SourceLink = {
  source_id: string;
  source_name: string;
  source_url: string | null;
  field_name: string;
  notes: string | null;
  contract_id?: string;
};

export type EpcRole = {
  id: string;
  company_id: string;
  company_name: string;
  package_code: string;
  role_type: string;
  confidence: string;
  award_date: string | null;
  source_title: string | null;
  source_url: string | null;
  source_date: string | null;
  notes: string | null;
};

export type WindFarmDetail = {
  wind_farm: {
    id: string;
    name: string;
    country_code: string;
    sea_basin: string | null;
    status_current: string;
    capacity_mw: number | null;
    turbine_count: number | null;
    turbine_oem: string | null;
    turbine_model: string | null;
    water_depth_m: number | null;
    foundation_type: string | null;
    distance_shore_km: number | null;
    commissioned_date: string | null;
    data_quality: string | null;
    geometry_quality: string | null;
    route_to_market: string | null;
    developer_company_id: string | null;
    developer_name: string | null;
    developer_actor_type: string | null;
    developer_hq_country_code: string | null;
    developer_website: string | null;
  };
  ownership: WindFarmOwnership[];
  contracts: WindFarmContract[];
  epc: EpcRole[];
  sources: {
    wind_farm: SourceLink[];
    contracts: SourceLink[];
  };
};

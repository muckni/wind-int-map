CREATE TABLE IF NOT EXISTS cables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cable_type TEXT NOT NULL CHECK (lower(cable_type) IN ('export_cable', 'inter_array', 'interconnector')),
  status TEXT CHECK (lower(status) IN ('planned', 'under construction', 'operational', 'decommissioned', 'unknown')),
  voltage_kv NUMERIC,
  capacity_mw NUMERIC,
  length_km NUMERIC,
  owner TEXT,
  connected_farm_id UUID REFERENCES wind_farms(id) ON DELETE SET NULL,
  route GEOGRAPHY(LINESTRING, 4326),
  landing_points GEOGRAPHY(MULTIPOINT, 4326),
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cables_name_type_uidx
  ON cables (lower(name), lower(cable_type));

CREATE INDEX IF NOT EXISTS cables_connected_farm_id_idx
  ON cables (connected_farm_id);

CREATE INDEX IF NOT EXISTS cables_status_idx
  ON cables (status);

CREATE INDEX IF NOT EXISTS cables_route_gix
  ON cables USING GIST (route);

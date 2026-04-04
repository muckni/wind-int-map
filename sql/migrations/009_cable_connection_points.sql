ALTER TABLE cables
  ADD COLUMN IF NOT EXISTS offshore_connection_name TEXT,
  ADD COLUMN IF NOT EXISTS offshore_connection_point GEOGRAPHY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS shore_connection_name TEXT,
  ADD COLUMN IF NOT EXISTS shore_connection_point GEOGRAPHY(POINT, 4326);

CREATE INDEX IF NOT EXISTS cables_offshore_connection_point_gix
  ON cables USING GIST (offshore_connection_point);

CREATE INDEX IF NOT EXISTS cables_shore_connection_point_gix
  ON cables USING GIST (shore_connection_point);

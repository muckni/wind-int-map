import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

function parseBbox(value: string | null) {
  if (!value) return null;
  const parts = value.split(",").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function parseLimit(value: string | null) {
  const raw = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(raw, MAX_LIMIT);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const bbox = parseBbox(searchParams.get("bbox"));
  if (!bbox) {
    return NextResponse.json(
      { error: "Invalid bbox. Use bbox=minLng,minLat,maxLng,maxLat" },
      { status: 400 }
    );
  }

  const limit = parseLimit(searchParams.get("limit"));

  const filters: { clause: string; value: string }[] = [];

  const countryCode = searchParams.get("country_code");
  if (countryCode) filters.push({ clause: "v.country_code = $", value: countryCode });

  const statusCurrent = searchParams.get("status_current");
  if (statusCurrent) filters.push({ clause: "v.status_current = $", value: statusCurrent });

  const seaBasin = searchParams.get("sea_basin");
  if (seaBasin) filters.push({ clause: "v.sea_basin = $", value: seaBasin });

  const developerCompanyId = searchParams.get("developer_company_id");
  if (developerCompanyId) {
    filters.push({ clause: "v.developer_company_id = $", value: developerCompanyId });
  }

  const values: Array<string | number> = [
    bbox.minLng,
    bbox.minLat,
    bbox.maxLng,
    bbox.maxLat,
  ];

  const whereParts = [
    // Use bbox index operator for fast coarse filtering, then ST_Intersects for accuracy.
    "v.centroid_geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)",
    "ST_Intersects(v.centroid_geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))",
  ];

  filters.forEach((filter) => {
    const paramIndex = values.length + 1;
    whereParts.push(filter.clause + paramIndex.toString());
    values.push(filter.value);
  });

  values.push(limit);

  const sql = `
    SELECT
      v.id,
      v.name,
      v.country_code,
      v.sea_basin,
      v.status_current,
      v.capacity_mw,
      v.turbine_count,
      v.water_depth_m,
      v.foundation_type,
      v.developer_company_id,
      v.developer_name,
      v.lng,
      v.lat
    FROM wind_farm_map_view v
    WHERE ${whereParts.join(" AND ")}
    ORDER BY v.name ASC
    LIMIT $${values.length}
  `;

  try {
    const result = await pool.query(sql, values);
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch wind farms", details: (error as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

const MAX_ZOOM_TURBINES = 15000;

function parseBbox(v: string | null) {
  if (!v) return null;
  const p = v.split(",").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = p;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  return { minLng, minLat, maxLng, maxLat };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = parseBbox(searchParams.get("bbox"));
  if (!bbox) {
    return NextResponse.json({ error: "Invalid bbox" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        t.id,
        t.wind_farm_id,
        t.turbine_index,
        t.geometry_quality,
        ST_X(t.location::geometry) AS lng,
        ST_Y(t.location::geometry) AS lat
      FROM turbines t
      WHERE t.location::geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        AND ST_Intersects(t.location::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      LIMIT $5
      `,
      [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, MAX_ZOOM_TURBINES]
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch turbines", details: (error as Error).message },
      { status: 500 }
    );
  }
}

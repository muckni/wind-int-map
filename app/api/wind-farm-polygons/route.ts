import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

function parseBbox(v: string | null) {
  if (!v) return null;
  const p = v.split(",").map(Number);
  if (p.length !== 4 || p.some(isNaN)) return null;
  const [minLng, minLat, maxLng, maxLat] = p;
  if (minLng >= maxLng || minLat >= maxLat) return null;
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
        wf.id,
        wf.name,
        wf.status_current,
        wf.capacity_mw,
        wf.geometry_quality,
        ST_AsGeoJSON(wf.project_area::geometry) AS polygon_geojson
      FROM wind_farms wf
      WHERE wf.project_area IS NOT NULL
        AND wf.centroid IS NOT NULL
        AND wf.centroid::geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      LIMIT 500
      `,
      [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    );

    const features = result.rows
      .filter(r => r.polygon_geojson)
      .map(r => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.polygon_geojson),
        properties: {
          id: r.id,
          name: r.name,
          status_current: r.status_current,
          capacity_mw: r.capacity_mw,
          geometry_quality: r.geometry_quality,
        },
      }));

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch polygons", details: (error as Error).message },
      { status: 500 }
    );
  }
}

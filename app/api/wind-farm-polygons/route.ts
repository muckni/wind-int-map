import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

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
      WITH env AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS bbox
      ),
      farm_rows AS (
        SELECT
          wf.id,
          wf.name,
          wf.status_current,
          wf.capacity_mw,
          wf.geometry_quality,
          wf.turbine_count,
          wf.centroid::geometry AS centroid_geom,
          wf.project_area::geometry AS project_geom,
          (
            SELECT
              CASE
                WHEN COUNT(*) >= 3 THEN ST_Buffer(ST_ConvexHull(ST_Collect(t.location::geometry))::geography, 220)::geometry
                WHEN COUNT(*) = 2 THEN ST_Buffer(ST_MakeLine(t.location::geometry ORDER BY t.turbine_index NULLS LAST)::geography, 420)::geometry
                WHEN COUNT(*) = 1 THEN ST_Buffer(ST_Centroid(ST_Collect(t.location::geometry))::geography, 900)::geometry
                ELSE NULL
              END
            FROM turbines t
            WHERE t.wind_farm_id = wf.id
              AND t.location IS NOT NULL
          ) AS turbine_geom
        FROM wind_farms wf, env
        WHERE wf.centroid IS NOT NULL
          AND wf.centroid::geometry && env.bbox
          AND ST_Intersects(wf.centroid::geometry, env.bbox)
      ),
      chosen AS (
        SELECT
          id,
          name,
          status_current,
          capacity_mw,
          geometry_quality,
          CASE
            WHEN project_geom IS NOT NULL AND ST_IsValid(project_geom) AND NOT ST_IsEmpty(project_geom) THEN ST_Multi(project_geom)
            WHEN turbine_geom IS NOT NULL AND ST_IsValid(turbine_geom) AND NOT ST_IsEmpty(turbine_geom) THEN ST_Multi(ST_MakeValid(turbine_geom))
            ELSE ST_Multi(
              ST_Buffer(
                centroid_geom::geography,
                CASE
                  WHEN COALESCE(turbine_count, 0) >= 120 OR COALESCE(capacity_mw, 0) >= 1500 THEN 5200
                  WHEN COALESCE(turbine_count, 0) >= 80 OR COALESCE(capacity_mw, 0) >= 900 THEN 3900
                  WHEN COALESCE(turbine_count, 0) >= 40 OR COALESCE(capacity_mw, 0) >= 500 THEN 2900
                  WHEN COALESCE(turbine_count, 0) >= 15 OR COALESCE(capacity_mw, 0) >= 180 THEN 2000
                  ELSE 1400
                END
              )::geometry
            )
          END AS chosen_geom,
          CASE
            WHEN project_geom IS NOT NULL AND ST_IsValid(project_geom) AND NOT ST_IsEmpty(project_geom) THEN 'project_area'
            WHEN turbine_geom IS NOT NULL AND ST_IsValid(turbine_geom) AND NOT ST_IsEmpty(turbine_geom) THEN 'turbine-derived'
            ELSE 'centroid-buffer'
          END AS geometry_source
        FROM farm_rows
      )
      SELECT
        c.id,
        c.name,
        c.status_current,
        c.capacity_mw,
        c.geometry_quality,
        c.geometry_source,
        ST_AsGeoJSON(c.chosen_geom) AS polygon_geojson
      FROM chosen c
      WHERE c.chosen_geom IS NOT NULL
        AND ST_IsValid(c.chosen_geom)
        AND NOT ST_IsEmpty(c.chosen_geom)
      LIMIT 5000
      `,
      [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    );

    const features = result.rows
      .map((r: Record<string, any>) => {
        if (!r.polygon_geojson) return null;
        let geometry: GeoJSON.Geometry | null = null;
        try {
          geometry = JSON.parse(r.polygon_geojson);
        } catch {
          return null;
        }

        if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
          return null;
        }

        return {
          type: "Feature" as const,
          geometry,
          properties: {
            id: r.id,
            name: r.name,
            status_current: r.status_current,
            capacity_mw: r.capacity_mw,
            geometry_quality: r.geometry_quality,
            geometry_source: r.geometry_source,
          },
        };
      })
      .filter(Boolean) as GeoJSON.Feature[];

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch polygons", details: (error as Error).message },
      { status: 500 }
    );
  }
}

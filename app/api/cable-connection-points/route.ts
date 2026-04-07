import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

function parseBbox(value: string | null) {
  if (!value) return null;
  const parts = value.split(",").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  return { minLng, minLat, maxLng, maxLat };
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

  const values = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat];

  const sql = `
    WITH points AS (
      SELECT
        id::text || ':offshore' AS point_id,
        id AS cable_id,
        name AS cable_name,
        cable_type,
        'offshore'::text AS point_role,
        offshore_connection_name AS point_name,
        offshore_connection_point::geometry AS geom
      FROM cables
      WHERE offshore_connection_name IS NOT NULL
        AND offshore_connection_point IS NOT NULL

      UNION ALL

      SELECT
        id::text || ':shore' AS point_id,
        id AS cable_id,
        name AS cable_name,
        cable_type,
        CASE
          WHEN connected_farm_id IS NOT NULL THEN 'wind_farm'::text
          ELSE 'shore'::text
        END AS point_role,
        shore_connection_name AS point_name,
        shore_connection_point::geometry AS geom
      FROM cables
      WHERE shore_connection_name IS NOT NULL
        AND shore_connection_point IS NOT NULL
    )
    SELECT
      point_id,
      cable_id,
      cable_name,
      cable_type,
      point_role,
      point_name,
      ST_X(geom) AS lng,
      ST_Y(geom) AS lat,
      ST_AsGeoJSON(geom)::json AS geometry
    FROM points
    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    ORDER BY cable_name, point_role
  `;

  try {
    const result = await pool.query(sql, values);
    return NextResponse.json({
      type: "FeatureCollection",
      features: result.rows.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: {
          id: row.point_id,
          cable_id: row.cable_id,
          cable_name: row.cable_name,
          cable_type: row.cable_type,
          point_role: row.point_role,
          name: row.point_name,
          lng: Number(row.lng),
          lat: Number(row.lat),
        },
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch cable connection points", details: (error as Error).message },
      { status: 500 }
    );
  }
}

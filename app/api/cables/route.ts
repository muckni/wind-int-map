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
    SELECT
      id,
      name,
      cable_type,
      status,
      voltage_kv,
      capacity_mw,
      length_km,
      owner,
      connected_farm_id,
      offshore_connection_name,
      shore_connection_name,
      source_url,
      ST_AsGeoJSON(route::geometry)::json AS geometry
    FROM cables
    WHERE route IS NOT NULL
      AND route::geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND ST_Intersects(route::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    ORDER BY cable_type, name
  `;

  try {
    const result = await pool.query(sql, values);
    return NextResponse.json({
      type: "FeatureCollection",
      features: result.rows.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: {
          id: row.id,
          name: row.name,
          cable_type: row.cable_type,
          status: row.status,
          voltage_kv: row.voltage_kv == null ? null : Number(row.voltage_kv),
          capacity_mw: row.capacity_mw == null ? null : Number(row.capacity_mw),
          length_km: row.length_km == null ? null : Number(row.length_km),
          owner: row.owner,
          connected_farm_id: row.connected_farm_id,
          offshore_connection_name: row.offshore_connection_name,
          shore_connection_name: row.shore_connection_name,
          source_url: row.source_url,
        },
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch cables", details: (error as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const pattern = `%${q}%`

  try {
    const result = await pool.query(
      `
      (
        SELECT
          id,
          name,
          'wind_farm' AS type,
          country_code AS subtitle,
          ST_Y(centroid::geometry) AS lat,
          ST_X(centroid::geometry) AS lng
        FROM wind_farms
        WHERE name ILIKE $1
        ORDER BY capacity_mw DESC NULLS LAST
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          c.id,
          c.name,
          'company' AS type,
          c.actor_type AS subtitle,
          cl.lat,
          cl.lng
        FROM companies c
        LEFT JOIN LATERAL (
          SELECT
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
          FROM company_locations
          WHERE company_id = c.id
          LIMIT 1
        ) cl ON true
        WHERE c.name ILIKE $1
        ORDER BY c.name
        LIMIT 5
      )
      `,
      [pattern]
    )

    return NextResponse.json({ results: result.rows })
  } catch (error) {
    return NextResponse.json(
      { error: "Search failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export async function GET() {
  try {

    const countries = await pool.query(`
      SELECT DISTINCT country_code
      FROM wind_farms
      ORDER BY country_code
    `)

    const status = await pool.query(`
      SELECT DISTINCT status_current
      FROM wind_farms
      ORDER BY status_current
    `)

    const basins = await pool.query(`
      SELECT DISTINCT sea_basin
      FROM wind_farms
      ORDER BY sea_basin
    `)

    return NextResponse.json({
      countries: countries.rows.map((r: Record<string, any>) => r.country_code),
      status: status.rows.map((r: Record<string, any>) => r.status_current),
      basins: basins.rows.map((r: Record<string, any>) => r.sea_basin)
    })

  } catch (err) {

    console.error("FILTER OPTIONS ERROR:", err)

    return NextResponse.json({
      countries: [],
      status: [],
      basins: []
    })
  }
}
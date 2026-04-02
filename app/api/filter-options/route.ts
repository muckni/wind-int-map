import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export async function GET() {
  try {
    const [countries, status, basins, foundations, developers, capacityRange] = await Promise.all([
      pool.query(`SELECT DISTINCT country_code FROM wind_farms WHERE country_code IS NOT NULL ORDER BY country_code`),
      pool.query(`SELECT DISTINCT status_current FROM wind_farms WHERE status_current IS NOT NULL ORDER BY status_current`),
      pool.query(`SELECT DISTINCT sea_basin FROM wind_farms WHERE sea_basin IS NOT NULL ORDER BY sea_basin`),
      pool.query(`SELECT DISTINCT foundation_type FROM wind_farms WHERE foundation_type IS NOT NULL ORDER BY foundation_type`),
      pool.query(`
        SELECT DISTINCT c.id, c.name
        FROM companies c
        INNER JOIN wind_farms wf ON wf.developer_company_id = c.id
        ORDER BY c.name
      `),
      pool.query(`SELECT MIN(capacity_mw) AS min, MAX(capacity_mw) AS max FROM wind_farms WHERE capacity_mw IS NOT NULL`),
    ])

    return NextResponse.json({
      countries: countries.rows.map((r: Record<string, any>) => r.country_code),
      status: status.rows.map((r: Record<string, any>) => r.status_current),
      basins: basins.rows.map((r: Record<string, any>) => r.sea_basin),
      foundations: foundations.rows.map((r: Record<string, any>) => r.foundation_type),
      developers: developers.rows.map((r: Record<string, any>) => ({ id: r.id, name: r.name })),
      capacity_range: {
        min: Number(capacityRange.rows[0]?.min ?? 0),
        max: Number(capacityRange.rows[0]?.max ?? 5000),
      },
    })
  } catch (err) {
    console.error("FILTER OPTIONS ERROR:", err)
    return NextResponse.json({
      countries: [],
      status: [],
      basins: [],
      foundations: [],
      developers: [],
      capacity_range: { min: 0, max: 5000 },
    })
  }
}
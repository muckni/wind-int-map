import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET() {
  try {
    const [countries, statuses, basins, developers] = await Promise.all([
      pool.query(
        `SELECT DISTINCT country_code FROM wind_farm_map_view WHERE country_code IS NOT NULL ORDER BY country_code ASC`
      ),
      pool.query(
        `SELECT DISTINCT status_current FROM wind_farm_map_view WHERE status_current IS NOT NULL ORDER BY status_current ASC`
      ),
      pool.query(
        `SELECT DISTINCT sea_basin FROM wind_farm_map_view WHERE sea_basin IS NOT NULL ORDER BY sea_basin ASC`
      ),
      pool.query(
        `
        SELECT DISTINCT developer_company_id, developer_name
        FROM wind_farm_map_view
        WHERE developer_company_id IS NOT NULL
        ORDER BY developer_name ASC
        `
      ),
    ]);

    return NextResponse.json({
      country_code: countries.rows.map((r) => r.country_code),
      status_current: statuses.rows.map((r) => r.status_current),
      sea_basin: basins.rows.map((r) => r.sea_basin),
      developers: developers.rows.map((r) => ({
        id: r.developer_company_id,
        name: r.developer_name,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load filter options", details: (error as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET() {
  const sql = `
    SELECT
      EXTRACT(YEAR FROM commissioned_date)::int AS year,
      COALESCE(SUM(capacity_mw), 0)::float AS total_mw
    FROM wind_farms
    WHERE commissioned_date IS NOT NULL
    GROUP BY year
    ORDER BY year
  `;

  try {
    const result = await pool.query(sql);
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch timeline data", details: (error as Error).message },
      { status: 500 }
    );
  }
}

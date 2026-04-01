import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const actorType = searchParams.get("actor_type");
  const withLocation = searchParams.get("with_location") === "true";

  try {
    const locationJoin = withLocation
      ? `LEFT JOIN company_locations cl ON cl.company_id = c.id AND cl.location_type = 'hq'`
      : "";

    const locationCols = withLocation
      ? `, ST_X(cl.location::geometry) AS lng, ST_Y(cl.location::geometry) AS lat, cl.city`
      : "";

    const locationFilter = withLocation
      ? `AND cl.location IS NOT NULL`
      : "";

    const params: string[] = [];
    let whereClause = `WHERE 1=1 ${locationFilter}`;

    if (actorType) {
      params.push(actorType);
      whereClause += ` AND lower(c.actor_type) = lower($${params.length})`;
    }

    const result = await pool.query(
      `
      SELECT c.id, c.name, c.actor_type, c.hq_country_code, c.website${locationCols}
      FROM companies c
      ${locationJoin}
      ${whereClause}
      ORDER BY c.name ASC
      `,
      params
    );

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch companies", details: (error as Error).message },
      { status: 500 }
    );
  }
}

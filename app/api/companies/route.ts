import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const actorType = searchParams.get("actor_type");

  try {
    if (actorType) {
      const result = await pool.query(
        `
        SELECT id, name, actor_type, hq_country_code, website
        FROM companies
        WHERE lower(actor_type) = lower($1)
        ORDER BY name ASC
        `,
        [actorType]
      );
      return NextResponse.json({ data: result.rows });
    }

    const result = await pool.query(
      `
      SELECT id, name, actor_type, hq_country_code, website
      FROM companies
      ORDER BY name ASC
      `
    );

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch companies", details: (error as Error).message },
      { status: 500 }
    );
  }
}

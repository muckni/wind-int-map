import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const companyId = params.id;

  try {
    // Company info + location
    const companyResult = await pool.query(
      `
      SELECT
        c.id, c.name, c.actor_type, c.hq_country_code, c.website,
        ST_X(cl.location::geometry) AS lng,
        ST_Y(cl.location::geometry) AS lat,
        cl.city
      FROM companies c
      LEFT JOIN company_locations cl ON cl.company_id = c.id AND cl.location_type = 'hq'
      WHERE c.id = $1
      `,
      [companyId]
    );

    if (companyResult.rowCount === 0) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Linked wind farms (developer + ownership)
    const linksResult = await pool.query(
      `
      SELECT DISTINCT
        wf.id   AS farm_id,
        wf.name AS farm_name,
        wf.status_current,
        wf.capacity_mw,
        wf.country_code,
        ST_X(wf.centroid::geometry) AS farm_lng,
        ST_Y(wf.centroid::geometry) AS farm_lat,
        COALESCE(wfo.role_type, 'developer') AS role_type,
        wfo.equity_share_pct
      FROM wind_farms wf
      LEFT JOIN wind_farm_ownership wfo
        ON wfo.wind_farm_id = wf.id AND wfo.company_id = $1
      WHERE wf.centroid IS NOT NULL
        AND (
          wf.developer_company_id = $1
          OR wfo.company_id = $1
        )
      ORDER BY wf.capacity_mw DESC NULLS LAST
      LIMIT 100
      `,
      [companyId]
    );

    const company = companyResult.rows[0];

    return NextResponse.json({
      company,
      links: linksResult.rows.map(r => ({
        farm_id:          r.farm_id,
        farm_name:        r.farm_name,
        status_current:   r.status_current,
        capacity_mw:      r.capacity_mw,
        country_code:     r.country_code,
        farm_lng:         r.farm_lng,
        farm_lat:         r.farm_lat,
        role_type:        r.role_type,
        equity_share_pct: r.equity_share_pct,
        company_lng:      company.lng,
        company_lat:      company.lat,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch company network", details: (error as Error).message },
      { status: 500 }
    );
  }
}

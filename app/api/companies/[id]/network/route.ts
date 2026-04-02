import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;

  try {
    const companyResult = await pool.query(
      `
      WITH linked_farms AS (
        SELECT wf.developer_company_id AS company_id, wf.centroid::geometry AS geom
        FROM wind_farms wf
        WHERE wf.developer_company_id IS NOT NULL AND wf.centroid IS NOT NULL

        UNION ALL

        SELECT wfo.company_id, wf.centroid::geometry AS geom
        FROM wind_farm_ownership wfo
        JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
        WHERE wfo.company_id IS NOT NULL AND wf.centroid IS NOT NULL

        UNION ALL

        SELECT ct.counterparty_company_id, wf.centroid::geometry AS geom
        FROM contracts ct
        JOIN wind_farms wf ON wf.id = ct.wind_farm_id
        WHERE ct.counterparty_company_id IS NOT NULL AND wf.centroid IS NOT NULL

        UNION ALL

        SELECT e.company_id, wf.centroid::geometry AS geom
        FROM wind_farm_epc_company_roles e
        JOIN wind_farms wf ON wf.id = e.wind_farm_id
        WHERE e.company_id IS NOT NULL AND e.is_current = true AND wf.centroid IS NOT NULL
      ),
      company_fallback AS (
        SELECT
          company_id,
          ST_X(ST_Centroid(ST_Collect(geom))) AS lng,
          ST_Y(ST_Centroid(ST_Collect(geom))) AS lat
        FROM linked_farms
        GROUP BY company_id
      )
      SELECT
        c.id,
        c.name,
        c.actor_type,
        c.hq_country_code,
        c.website,
        cl.city,
        COALESCE(ST_X(cl.location::geometry), cf.lng) AS lng,
        COALESCE(ST_Y(cl.location::geometry), cf.lat) AS lat,
        CASE
          WHEN cl.location IS NOT NULL THEN 'hq'
          WHEN cf.company_id IS NOT NULL THEN 'farm-derived'
          ELSE NULL
        END AS location_source
      FROM companies c
      LEFT JOIN company_locations cl ON cl.company_id = c.id AND cl.location_type = 'hq'
      LEFT JOIN company_fallback cf ON cf.company_id = c.id
      WHERE c.id = $1
      `,
      [companyId]
    );

    if (companyResult.rowCount === 0) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const ownershipResult = await pool.query(
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
      LIMIT 400
      `,
      [companyId]
    );

    const contractResult = await pool.query(
      `
      SELECT DISTINCT
        wf.id   AS farm_id,
        wf.name AS farm_name,
        wf.status_current,
        wf.capacity_mw,
        wf.country_code,
        ST_X(wf.centroid::geometry) AS farm_lng,
        ST_Y(wf.centroid::geometry) AS farm_lat,
        con.contract_type           AS role_type,
        NULL::numeric               AS equity_share_pct
      FROM contracts con
      JOIN wind_farms wf ON wf.id = con.wind_farm_id
      WHERE con.counterparty_company_id = $1
        AND wf.centroid IS NOT NULL
      ORDER BY wf.capacity_mw DESC NULLS LAST
      LIMIT 400
      `,
      [companyId]
    );

    const epcResult = await pool.query(
      `
      SELECT DISTINCT
        wf.id   AS farm_id,
        wf.name AS farm_name,
        wf.status_current,
        wf.capacity_mw,
        wf.country_code,
        ST_X(wf.centroid::geometry) AS farm_lng,
        ST_Y(wf.centroid::geometry) AS farm_lat,
        e.role_type                 AS role_type,
        NULL::numeric               AS equity_share_pct
      FROM wind_farm_epc_company_roles e
      JOIN wind_farms wf ON wf.id = e.wind_farm_id
      WHERE e.company_id = $1
        AND e.is_current = true
        AND wf.centroid IS NOT NULL
      ORDER BY wf.capacity_mw DESC NULLS LAST
      LIMIT 400
      `,
      [companyId]
    );

    const company = companyResult.rows[0];
    const companyLng: number | null = company.lng;
    const companyLat: number | null = company.lat;

    function toLink(r: Record<string, any>) {
      return {
        company_id: company.id,
        company_name: company.name,
        farm_id: r.farm_id,
        farm_name: r.farm_name,
        status_current: r.status_current,
        capacity_mw: r.capacity_mw,
        country_code: r.country_code,
        farm_lng: r.farm_lng,
        farm_lat: r.farm_lat,
        role_type: r.role_type,
        equity_share_pct: r.equity_share_pct,
        company_lng: companyLng,
        company_lat: companyLat,
      };
    }

    const allLinks = [
      ...ownershipResult.rows,
      ...contractResult.rows,
      ...epcResult.rows,
    ].map(toLink);

    const dedupe = new Set<string>();
    const links = allLinks.filter((l) => {
      if (
        !Number.isFinite(l.company_lng) ||
        !Number.isFinite(l.company_lat) ||
        !Number.isFinite(l.farm_lng) ||
        !Number.isFinite(l.farm_lat)
      ) {
        return false;
      }

      if (
        Math.abs(Number(l.company_lng)) > 180 ||
        Math.abs(Number(l.farm_lng)) > 180 ||
        Math.abs(Number(l.company_lat)) > 85 ||
        Math.abs(Number(l.farm_lat)) > 85
      ) {
        return false;
      }

      const key = `${l.company_id}|${l.farm_id}|${(l.role_type ?? "").toLowerCase()}|${l.equity_share_pct ?? ""}`;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });

    return NextResponse.json({ company, links });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch company network", details: (error as Error).message },
      { status: 500 }
    );
  }
}

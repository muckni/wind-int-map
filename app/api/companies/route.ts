import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const actorType = searchParams.get("actor_type");
  const withLocation = searchParams.get("with_location") === "true";

  try {
    const params: string[] = [];
    let whereClause = "WHERE 1=1";

    if (actorType) {
      params.push(actorType);
      whereClause += ` AND lower(c.actor_type) = lower($${params.length})`;
    }

    const locationFilter = withLocation
      ? "AND COALESCE(ST_X(cl.location::geometry), cf.lng) IS NOT NULL AND COALESCE(ST_Y(cl.location::geometry), cf.lat) IS NOT NULL"
      : "";

    const result = await pool.query(
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
      ),
      role_flags AS (
        SELECT
          r.company_id,
          bool_or(r.role_group = 'core') AS has_core_roles,
          bool_or(r.role_group = 'epc') AS has_epc_roles,
          bool_or(r.role_group = 'offtake') AS has_offtake_roles
        FROM (
          SELECT wf.developer_company_id AS company_id, 'core'::text AS role_group
          FROM wind_farms wf
          WHERE wf.developer_company_id IS NOT NULL

          UNION ALL

          SELECT wfo.company_id, 'core'::text AS role_group
          FROM wind_farm_ownership wfo
          WHERE wfo.company_id IS NOT NULL

          UNION ALL

          SELECT e.company_id, 'epc'::text AS role_group
          FROM wind_farm_epc_company_roles e
          WHERE e.company_id IS NOT NULL AND e.is_current = true

          UNION ALL

          SELECT ct.counterparty_company_id, 'offtake'::text AS role_group
          FROM contracts ct
          WHERE ct.counterparty_company_id IS NOT NULL
        ) r
        GROUP BY r.company_id
      )
      SELECT
        c.id,
        c.name,
        c.actor_type,
        c.hq_country_code,
        c.website
        ${withLocation ? `,
        ST_X(cl.location::geometry) AS hq_lng,
        ST_Y(cl.location::geometry) AS hq_lat,
        cl.city,
        COALESCE(ST_X(cl.location::geometry), cf.lng) AS lng,
        COALESCE(ST_Y(cl.location::geometry), cf.lat) AS lat,
        CASE
          WHEN cl.location IS NOT NULL THEN 'hq'
          WHEN cf.company_id IS NOT NULL THEN 'farm-derived'
          ELSE NULL
        END AS location_source,
        CASE
          WHEN lower(c.actor_type) = 'offtaker' OR COALESCE(rf.has_offtake_roles, false) THEN 'offtaker'
          WHEN COALESCE(rf.has_epc_roles, false) AND NOT COALESCE(rf.has_core_roles, false) THEN 'epc'
          WHEN lower(c.actor_type) IN ('oem') AND COALESCE(rf.has_epc_roles, false) THEN 'epc'
          ELSE 'company'
        END AS marker_class` : ""}
      FROM companies c
      ${withLocation ? "LEFT JOIN company_locations cl ON cl.company_id = c.id AND cl.location_type = 'hq'" : ""}
      ${withLocation ? "LEFT JOIN company_fallback cf ON cf.company_id = c.id" : ""}
      ${withLocation ? "LEFT JOIN role_flags rf ON rf.company_id = c.id" : ""}
      ${whereClause}
      ${locationFilter}
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

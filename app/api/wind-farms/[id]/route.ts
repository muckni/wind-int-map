import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: windFarmId } = await params;

  try {
    const windFarmResult = await pool.query(
      `
      SELECT
        wf.id,
        wf.name,
        wf.country_code,
        wf.sea_basin,
        wf.status_current,
        wf.capacity_mw,
        wf.turbine_count,
        wf.turbine_oem,
        wf.turbine_model,
        wf.water_depth_m,
        wf.foundation_type,
        wf.distance_shore_km,
        wf.commissioned_date,
        wf.data_quality,
        wf.geometry_quality,
        wf.route_to_market,
        wf.developer_company_id,
        c.name AS developer_name,
        c.actor_type AS developer_actor_type,
        c.hq_country_code AS developer_hq_country_code,
        c.website AS developer_website
      FROM wind_farms wf
      LEFT JOIN companies c ON c.id = wf.developer_company_id
      WHERE wf.id = $1
      `,
      [windFarmId]
    );

    if (windFarmResult.rowCount === 0) {
      return NextResponse.json({ error: "Wind farm not found" }, { status: 404 });
    }

    const ownershipPromise = pool.query(
      `
      SELECT
        wfo.id,
        wfo.company_id,
        c.name AS company_name,
        wfo.equity_share_pct,
        wfo.role_type,
        wfo.valid_from,
        wfo.valid_to,
        wfo.is_current,
        wfo.data_quality
      FROM wind_farm_ownership wfo
      JOIN companies c ON c.id = wfo.company_id
      WHERE wfo.wind_farm_id = $1
      ORDER BY wfo.equity_share_pct DESC NULLS LAST
      `,
      [windFarmId]
    );

    const contractsPromise = pool.query(
      `
      SELECT
        ct.id,
        ct.contract_type,
        ct.counterparty_company_id,
        cp.name AS counterparty_name,
        ct.start_date,
        ct.end_date,
        ct.price_eur_mwh,
        ct.volume_mwh,
        ct.verification_status,
        ct.notes
      FROM contracts ct
      LEFT JOIN companies cp ON cp.id = ct.counterparty_company_id
      WHERE ct.wind_farm_id = $1
      ORDER BY ct.start_date DESC NULLS LAST
      `,
      [windFarmId]
    );

    const windFarmSourcesPromise = pool.query(
      `
      SELECT
        wfs.field_name,
        wfs.notes,
        s.id AS source_id,
        s.name AS source_name,
        s.url AS source_url
      FROM wind_farm_sources wfs
      JOIN sources s ON s.id = wfs.source_id
      WHERE wfs.wind_farm_id = $1
      ORDER BY s.name ASC
      `,
      [windFarmId]
    );

    const contractSourcesPromise = pool.query(
      `
      SELECT
        cs.contract_id,
        cs.field_name,
        cs.notes,
        s.id AS source_id,
        s.name AS source_name,
        s.url AS source_url
      FROM contract_sources cs
      JOIN sources s ON s.id = cs.source_id
      JOIN contracts ct ON ct.id = cs.contract_id
      WHERE ct.wind_farm_id = $1
      ORDER BY s.name ASC
      `,
      [windFarmId]
    );

    const epcPromise = pool.query(
      `
      SELECT
        e.id,
        e.company_id,
        c.name AS company_name,
        e.package_code,
        e.role_type,
        e.confidence,
        e.award_date,
        e.source_title,
        e.source_url,
        e.source_date,
        e.notes
      FROM wind_farm_epc_company_roles e
      JOIN companies c ON c.id = e.company_id
      WHERE e.wind_farm_id = $1
        AND e.is_current = true
      ORDER BY e.package_code, e.role_type, c.name
      `,
      [windFarmId]
    );

    const supportPromise = pool.query(
      `
      SELECT
        s.id,
        s.support_scheme_type,
        s.support_price_value,
        s.support_price_unit,
        s.support_price_currency,
        s.support_price_basis,
        s.award_date::text AS award_date,
        s.award_year,
        s.allocation_round,
        s.tender_name,
        s.current_price_value,
        s.current_price_date::text AS current_price_date,
        s.source_title,
        s.source_url,
        s.source_date::text AS source_date,
        s.confidence,
        s.notes
      FROM wind_farm_support_schemes s
      WHERE s.wind_farm_id = $1
      ORDER BY s.award_date DESC NULLS LAST, s.award_year DESC NULLS LAST, s.created_at DESC
      `,
      [windFarmId]
    );

    const supportHistoryPromise = pool.query(
      `
      SELECT
        h.id,
        h.support_scheme_id,
        h.price_value,
        h.currency,
        h.unit,
        h.price_basis,
        h.observation_date::text AS observation_date,
        h.observation_type,
        h.source_title,
        h.source_url,
        h.source_date::text AS source_date,
        h.confidence,
        h.notes
      FROM wind_farm_support_price_history h
      WHERE h.wind_farm_id = $1
      ORDER BY h.observation_date ASC NULLS LAST, h.created_at ASC
      `,
      [windFarmId]
    );

    const networkLinksPromise = pool.query(
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
      rel AS (
        SELECT wf.id AS farm_id, wf.name AS farm_name, wf.status_current, wf.capacity_mw, wf.country_code, wf.developer_company_id AS company_id, 'developer'::text AS role_type, NULL::numeric AS equity_share_pct
        FROM wind_farms wf
        WHERE wf.id = $1 AND wf.developer_company_id IS NOT NULL

        UNION ALL

        SELECT wf.id AS farm_id, wf.name AS farm_name, wf.status_current, wf.capacity_mw, wf.country_code, wfo.company_id, COALESCE(wfo.role_type, 'owner') AS role_type, wfo.equity_share_pct
        FROM wind_farm_ownership wfo
        JOIN wind_farms wf ON wf.id = wfo.wind_farm_id
        WHERE wfo.wind_farm_id = $1 AND wfo.company_id IS NOT NULL

        UNION ALL

        SELECT wf.id AS farm_id, wf.name AS farm_name, wf.status_current, wf.capacity_mw, wf.country_code, ct.counterparty_company_id AS company_id, ct.contract_type AS role_type, NULL::numeric AS equity_share_pct
        FROM contracts ct
        JOIN wind_farms wf ON wf.id = ct.wind_farm_id
        WHERE ct.wind_farm_id = $1 AND ct.counterparty_company_id IS NOT NULL

        UNION ALL

        SELECT wf.id AS farm_id, wf.name AS farm_name, wf.status_current, wf.capacity_mw, wf.country_code, e.company_id, e.role_type, NULL::numeric AS equity_share_pct
        FROM wind_farm_epc_company_roles e
        JOIN wind_farms wf ON wf.id = e.wind_farm_id
        WHERE e.wind_farm_id = $1 AND e.company_id IS NOT NULL AND e.is_current = true
      )
      SELECT DISTINCT
        rel.company_id,
        c.name AS company_name,
        rel.farm_id,
        rel.farm_name,
        rel.status_current,
        rel.capacity_mw,
        rel.country_code,
        ST_X(wf.centroid::geometry) AS farm_lng,
        ST_Y(wf.centroid::geometry) AS farm_lat,
        rel.role_type,
        rel.equity_share_pct,
        COALESCE(ST_X(cl.location::geometry), cf.lng) AS company_lng,
        COALESCE(ST_Y(cl.location::geometry), cf.lat) AS company_lat
      FROM rel
      JOIN companies c ON c.id = rel.company_id
      JOIN wind_farms wf ON wf.id = rel.farm_id
      LEFT JOIN company_locations cl ON cl.company_id = rel.company_id AND cl.location_type = 'hq'
      LEFT JOIN company_fallback cf ON cf.company_id = rel.company_id
      WHERE COALESCE(ST_X(cl.location::geometry), cf.lng) IS NOT NULL
        AND COALESCE(ST_Y(cl.location::geometry), cf.lat) IS NOT NULL
      ORDER BY rel.role_type, c.name
      `
      ,
      [windFarmId]
    );

    const [ownership, contracts, windFarmSources, contractSources, epc, support, supportHistory, networkLinks] = await Promise.all([
      ownershipPromise,
      contractsPromise,
      windFarmSourcesPromise,
      contractSourcesPromise,
      epcPromise,
      supportPromise,
      supportHistoryPromise,
      networkLinksPromise,
    ]);

    return NextResponse.json({
      wind_farm: windFarmResult.rows[0],
      ownership: ownership.rows,
      contracts: contracts.rows,
      epc: epc.rows,
      support: support.rows,
      support_history: supportHistory.rows,
      network_links: networkLinks.rows,
      sources: {
        wind_farm: windFarmSources.rows,
        contracts: contractSources.rows,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch wind farm", details: (error as Error).message },
      { status: 500 }
    );
  }
}

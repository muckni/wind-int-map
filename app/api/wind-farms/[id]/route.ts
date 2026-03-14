import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const windFarmId = params.id;

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
        wf.water_depth_m,
        wf.foundation_type,
        wf.commissioned_date,
        wf.data_quality,
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

    const [ownership, contracts, windFarmSources, contractSources] = await Promise.all([
      ownershipPromise,
      contractsPromise,
      windFarmSourcesPromise,
      contractSourcesPromise,
    ]);

    return NextResponse.json({
      wind_farm: windFarmResult.rows[0],
      ownership: ownership.rows,
      contracts: contracts.rows,
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

import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { ADMIN_TABLE_CONFIGS } from "../../../../lib/admin-config";
import { ensureSupportedTable, publicTableName } from "../../../../lib/admin-db";
import type { AdminTableSummary } from "../../../../types/admin";

export async function GET() {
  try {
    const tableChecks = await Promise.all(
      ADMIN_TABLE_CONFIGS.map(async (cfg) => {
        const supported = await ensureSupportedTable(cfg.name);
        if (!supported) return null;

        const countResult = await pool.query<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM ${publicTableName(cfg.name)}`
        );

        const row: AdminTableSummary = {
          name: cfg.name,
          label: cfg.label,
          description: cfg.description,
          rowCount: countResult.rows[0]?.c ?? 0,
          exists: true,
        };

        return row;
      })
    );

    const tables = tableChecks.filter((t): t is AdminTableSummary => t !== null);
    return NextResponse.json({ tables });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load admin tables", details: (error as Error).message },
      { status: 500 }
    );
  }
}

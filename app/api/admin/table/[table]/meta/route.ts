import { NextResponse } from "next/server";
import { ensureSupportedTable, getPrimaryKeyColumns, getTableColumns } from "../../../../../../lib/admin-db";
import type { AdminTableMetaResponse } from "../../../../../../types/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;

  try {
    const config = await ensureSupportedTable(table);
    if (!config) {
      return NextResponse.json({ error: "Table not supported" }, { status: 404 });
    }

    const [columns, primaryKeys] = await Promise.all([
      getTableColumns(table),
      getPrimaryKeyColumns(table),
    ]);

    if (columns.length === 0) {
      return NextResponse.json({ error: "Table has no readable columns" }, { status: 400 });
    }

    const body: AdminTableMetaResponse = {
      table,
      label: config.label,
      description: config.description,
      primaryKey: primaryKeys.length === 1 ? primaryKeys[0] : null,
      columns,
    };

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load table metadata", details: (error as Error).message },
      { status: 500 }
    );
  }
}

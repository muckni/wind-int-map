import { NextResponse } from "next/server";
import { quoteIdent } from "../../../../../../../lib/admin-config";
import {
  buildSelectList,
  coerceValue,
  ensureSupportedTable,
  getTableColumns,
  publicTableName,
} from "../../../../../../../lib/admin-db";
import { pool } from "../../../../../../../lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const { table, id } = await params;
  const supported = await ensureSupportedTable(table);
  if (!supported) {
    return NextResponse.json({ error: "Table not supported" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { values?: Record<string, unknown> };
    const columns = await getTableColumns(table);
    const primary = columns.find((c) => c.isPrimaryKey);
    if (!primary) {
      return NextResponse.json({ error: "Table does not have a single primary key" }, { status: 400 });
    }

    const writable = new Map(columns.filter((c) => c.editable).map((c) => [c.name, c]));
    const setParts: string[] = [];
    const values: unknown[] = [];

    for (const [key, raw] of Object.entries(body.values ?? {})) {
      const col = writable.get(key);
      if (!col) continue;
      const coerced = coerceValue(raw, col);
      if (coerced === undefined) continue;
      values.push(coerced);
      setParts.push(`${quoteIdent(key)} = $${values.length}`);
    }

    if (setParts.length === 0) {
      return NextResponse.json({ error: "No editable fields to update" }, { status: 400 });
    }

    if (columns.some((c) => c.name === "updated_at")) {
      setParts.push(`"updated_at" = now()`);
    }

    const pkValue = coerceValue(id, { ...primary, isNullable: false });
    values.push(pkValue);

    const tableName = publicTableName(table);
    const selectList = buildSelectList(columns, "upd");

    const result = await pool.query<Record<string, unknown>>(
      `
      WITH upd AS (
        UPDATE ${tableName}
        SET ${setParts.join(", ")}
        WHERE ${quoteIdent(primary.name)} = $${values.length}
        RETURNING *
      )
      SELECT ${selectList}
      FROM upd
      `,
      values
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    return NextResponse.json({ row: result.rows[0] });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update row", details: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const { table, id } = await params;
  const supported = await ensureSupportedTable(table);
  if (!supported) {
    return NextResponse.json({ error: "Table not supported" }, { status: 404 });
  }

  try {
    const columns = await getTableColumns(table);
    const primary = columns.find((c) => c.isPrimaryKey);
    if (!primary) {
      return NextResponse.json({ error: "Table does not have a single primary key" }, { status: 400 });
    }

    const pkValue = coerceValue(id, { ...primary, isNullable: false });
    const tableName = publicTableName(table);

    const deleted = await pool.query(
      `
      DELETE FROM ${tableName}
      WHERE ${quoteIdent(primary.name)} = $1
      RETURNING ${quoteIdent(primary.name)}
      `,
      [pkValue]
    );

    if (deleted.rowCount === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete row", details: (error as Error).message },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import { quoteIdent } from "../../../../../../lib/admin-config";
import {
  buildSelectList,
  coerceValue,
  ensureSupportedTable,
  getTableColumns,
  parsePaging,
  publicTableName,
} from "../../../../../../lib/admin-db";
import { pool } from "../../../../../../lib/db";
import type { AdminRowsResponse } from "../../../../../../types/admin";

function parseSortDir(v: string | null): "asc" | "desc" {
  return v?.toLowerCase() === "desc" ? "desc" : "asc";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;
  const config = await ensureSupportedTable(table);
  if (!config) {
    return NextResponse.json({ error: "Table not supported" }, { status: 404 });
  }

  try {
    const columns = await getTableColumns(table);
    if (columns.length === 0) {
      return NextResponse.json({ error: "Table has no readable columns" }, { status: 400 });
    }

    const searchParams = new URL(request.url).searchParams;
    const page = parsePaging(searchParams.get("page"), 1, 10_000);
    const pageSize = parsePaging(searchParams.get("pageSize"), 25, 200);
    const q = searchParams.get("q")?.trim() ?? "";
    const filterColumn = searchParams.get("filterColumn")?.trim() ?? "";
    const filterValue = searchParams.get("filterValue")?.trim() ?? "";

    const sortDir = parseSortDir(searchParams.get("sortDir"));
    const allColumnNames = new Set(columns.map((c) => c.name));
    const defaultSort = allColumnNames.has(config.defaultSort) ? config.defaultSort : columns[0].name;
    const sortBy = allColumnNames.has(searchParams.get("sortBy") ?? "")
      ? (searchParams.get("sortBy") as string)
      : defaultSort;

    const values: unknown[] = [];
    const where: string[] = [];

    if (q) {
      const searchCols = config.searchColumns.filter((c) => allColumnNames.has(c));
      if (searchCols.length > 0) {
        const orParts = searchCols.map((col) => {
          values.push(`%${q}%`);
          return `CAST(${quoteIdent(col)} AS TEXT) ILIKE $${values.length}`;
        });
        where.push(`(${orParts.join(" OR ")})`);
      }
    }

    if (filterColumn && filterValue && allColumnNames.has(filterColumn)) {
      values.push(`%${filterValue}%`);
      where.push(`CAST(${quoteIdent(filterColumn)} AS TEXT) ILIKE $${values.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const tableName = publicTableName(table);
    const selectList = buildSelectList(columns);

    const countResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM ${tableName} ${whereSql}`,
      values
    );

    const offset = (page - 1) * pageSize;
    const rowsValues = [...values, pageSize, offset];

    const rowsResult = await pool.query<Record<string, unknown>>(
      `
      SELECT ${selectList}
      FROM ${tableName}
      ${whereSql}
      ORDER BY ${quoteIdent(sortBy)} ${sortDir.toUpperCase()}
      LIMIT $${rowsValues.length - 1}
      OFFSET $${rowsValues.length}
      `,
      rowsValues
    );

    const primaryKey = columns.find((c) => c.isPrimaryKey)?.name ?? null;

    const response: AdminRowsResponse = {
      table,
      primaryKey,
      columns,
      rows: rowsResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize,
      sortBy,
      sortDir,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch admin rows", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;
  const config = await ensureSupportedTable(table);
  if (!config) {
    return NextResponse.json({ error: "Table not supported" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { values?: Record<string, unknown> };
    const columns = await getTableColumns(table);
    const writableColumns = new Map(columns.filter((c) => c.editable).map((c) => [c.name, c]));

    const input = body.values ?? {};

    const colNames: string[] = [];
    const values: unknown[] = [];

    for (const [key, raw] of Object.entries(input)) {
      const col = writableColumns.get(key);
      if (!col) continue;

      const coerced = coerceValue(raw, col);
      if (coerced === undefined) continue;

      colNames.push(key);
      values.push(coerced);
    }

    const tableName = publicTableName(table);
    const selectList = buildSelectList(columns, "ins");

    let sql: string;
    if (colNames.length === 0) {
      sql = `
        WITH ins AS (
          INSERT INTO ${tableName} DEFAULT VALUES
          RETURNING *
        )
        SELECT ${selectList}
        FROM ins
      `;
    } else {
      const namesSql = colNames.map((c) => quoteIdent(c)).join(", ");
      const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
      sql = `
        WITH ins AS (
          INSERT INTO ${tableName} (${namesSql})
          VALUES (${placeholders})
          RETURNING *
        )
        SELECT ${selectList}
        FROM ins
      `;
    }

    const inserted = await pool.query<Record<string, unknown>>(sql, values);
    return NextResponse.json({ row: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to insert row", details: (error as Error).message },
      { status: 400 }
    );
  }
}

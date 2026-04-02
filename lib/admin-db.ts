import { pool } from "./db";
import {
  GEOMETRY_TYPES,
  SYSTEM_READONLY_COLUMNS,
  getAdminTableConfig,
  quoteIdent,
} from "./admin-config";
import type { AdminColumnMeta } from "../types/admin";

type RawColumn = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  is_generated: "ALWAYS" | "NEVER";
  column_default: string | null;
};

export async function ensureSupportedTable(table: string) {
  const config = getAdminTableConfig(table);
  if (!config) return null;

  const exists = await pool.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists
    `,
    [table]
  );

  if (!exists.rows[0]?.exists) return null;
  return config;
}

export async function getPrimaryKeyColumns(table: string) {
  const result = await pool.query<{ column_name: string }>(
    `
    SELECT a.attname AS column_name
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = 'public'
      AND t.relname = $1
      AND i.indisprimary
    ORDER BY array_position(i.indkey, a.attnum)
    `,
    [table]
  );
  return result.rows.map((r) => r.column_name);
}

export async function getTableColumns(table: string): Promise<AdminColumnMeta[]> {
  const config = getAdminTableConfig(table);
  if (!config) return [];

  const [colResult, pkColumns] = await Promise.all([
    pool.query<RawColumn>(
      `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        is_generated,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
      `,
      [table]
    ),
    getPrimaryKeyColumns(table),
  ]);

  const pkSet = new Set(pkColumns);
  const readOnlyColumns = new Set(config.readOnlyColumns ?? []);

  return colResult.rows.map((c) => {
    const isPrimaryKey = pkSet.has(c.column_name);
    const isGenerated = c.is_generated !== "NEVER";
    const isGeom = GEOMETRY_TYPES.has(c.udt_name);
    const editable =
      !isPrimaryKey &&
      !isGenerated &&
      !isGeom &&
      !SYSTEM_READONLY_COLUMNS.has(c.column_name) &&
      !readOnlyColumns.has(c.column_name);

    return {
      name: c.column_name,
      dataType: c.data_type,
      udtName: c.udt_name,
      isNullable: c.is_nullable === "YES",
      isGenerated,
      hasDefault: c.column_default != null,
      isPrimaryKey,
      editable,
    };
  });
}

export function buildSelectList(columns: AdminColumnMeta[], alias?: string) {
  const prefix = alias ? `${quoteIdent(alias)}.` : "";
  return columns
    .map((c) => {
      const col = `${prefix}${quoteIdent(c.name)}`;
      if (GEOMETRY_TYPES.has(c.udtName)) {
        return `ST_AsText(${col}::geometry) AS ${quoteIdent(c.name)}`;
      }
      return `${col}`;
    })
    .join(", ");
}

export function coerceValue(value: unknown, column: AdminColumnMeta): unknown {
  if (value === undefined) return undefined;

  if (value === null) {
    if (!column.isNullable) throw new Error(`Column '${column.name}' cannot be null`);
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    if (!column.isNullable) throw new Error(`Column '${column.name}' cannot be empty`);
    return null;
  }

  const v = value;

  if (column.udtName === "bool") {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const n = v.toLowerCase();
      if (["true", "t", "1", "yes"].includes(n)) return true;
      if (["false", "f", "0", "no"].includes(n)) return false;
    }
    throw new Error(`Column '${column.name}' requires boolean value`);
  }

  if (["int2", "int4", "int8"].includes(column.udtName)) {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error(`Column '${column.name}' requires integer value`);
    return n;
  }

  if (["numeric", "float4", "float8"].includes(column.udtName)) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Column '${column.name}' requires numeric value`);
    return n;
  }

  if (column.udtName === "uuid") {
    if (typeof v !== "string") throw new Error(`Column '${column.name}' requires UUID string`);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    if (!isUuid) throw new Error(`Column '${column.name}' must be a valid UUID`);
    return v;
  }

  if (["date"].includes(column.udtName)) {
    if (typeof v !== "string") throw new Error(`Column '${column.name}' requires date string`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Column '${column.name}' must be YYYY-MM-DD`);
    return v;
  }

  if (["timestamp", "timestamptz"].includes(column.udtName)) {
    if (typeof v !== "string") throw new Error(`Column '${column.name}' requires timestamp string`);
    return v;
  }

  if (column.udtName === "json" || column.udtName === "jsonb") {
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        throw new Error(`Column '${column.name}' requires valid JSON`);
      }
    }
    return v;
  }

  if (typeof v === "string") return v;
  return String(v);
}

export function parsePaging(value: string | null, fallback: number, max = 200) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function publicTableName(table: string) {
  return `public.${quoteIdent(table)}`;
}

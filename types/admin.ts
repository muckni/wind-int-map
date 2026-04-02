export type AdminTableSummary = {
  name: string;
  label: string;
  description: string;
  rowCount: number;
  exists: boolean;
};

export type AdminColumnMeta = {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  isGenerated: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
  editable: boolean;
};

export type AdminTableMetaResponse = {
  table: string;
  label: string;
  description: string;
  primaryKey: string | null;
  columns: AdminColumnMeta[];
};

export type AdminRowsResponse = {
  table: string;
  primaryKey: string | null;
  columns: AdminColumnMeta[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
};

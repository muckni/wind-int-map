"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminColumnMeta, AdminRowsResponse, AdminTableMetaResponse } from "../../types/admin";

type DraftMap = Record<string, Record<string, unknown>>;

function isNumericColumn(column: AdminColumnMeta) {
  return ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(column.udtName);
}

function formatCell(value: unknown) {
  if (value == null) return "NULL";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function toCellKey(v: unknown) {
  if (v == null) return "";
  return String(v);
}

function valueInput(
  column: AdminColumnMeta,
  value: unknown,
  onChange: (next: unknown) => void,
  multiline = false
) {
  if (column.udtName === "bool") {
    return (
      <select
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) onChange(null);
          else onChange(v === "true");
        }}
        style={{ width: "100%", background: "#0b1322", color: "#dbe7ff", border: "1px solid #24344f", borderRadius: 6, padding: "4px 6px" }}
      >
        <option value="">NULL</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (multiline) {
    return (
      <textarea
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{ width: "100%", background: "#0b1322", color: "#dbe7ff", border: "1px solid #24344f", borderRadius: 6, padding: "6px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
      />
    );
  }

  return (
    <input
      type={column.udtName === "date" ? "date" : isNumericColumn(column) ? "number" : "text"}
      step={isNumericColumn(column) ? "any" : undefined}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", background: "#0b1322", color: "#dbe7ff", border: "1px solid #24344f", borderRadius: 6, padding: "4px 6px" }}
    />
  );
}

export default function AdminTableEditor({ table }: { table: string }) {
  const [meta, setMeta] = useState<AdminTableMetaResponse | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});

  const [creating, setCreating] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, unknown>>({});

  const [refreshToken, setRefreshToken] = useState(0);

  const editableColumns = useMemo(
    () => (meta?.columns ?? []).filter((c) => c.editable),
    [meta]
  );

  useEffect(() => {
    let alive = true;

    async function loadMeta() {
      setLoadingMeta(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/table/${encodeURIComponent(table)}/meta`, { cache: "no-store" });
        const data = (await res.json()) as AdminTableMetaResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load metadata");
        if (!alive) return;
        setMeta(data);
        const defaultSort = data.primaryKey ?? data.columns[0]?.name ?? "";
        setSortBy(defaultSort);
        setFilterColumn(data.columns[0]?.name ?? "");
      } catch (err) {
        if (alive) setError((err as Error).message);
      } finally {
        if (alive) setLoadingMeta(false);
      }
    }

    void loadMeta();
    return () => {
      alive = false;
    };
  }, [table]);

  useEffect(() => {
    if (!meta || !sortBy) return;
    let alive = true;

    async function loadRows() {
      setLoadingRows(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
        if (q) params.set("q", q);
        if (filterColumn && filterValue) {
          params.set("filterColumn", filterColumn);
          params.set("filterValue", filterValue);
        }

        const res = await fetch(`/api/admin/table/${encodeURIComponent(table)}/rows?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json()) as AdminRowsResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load rows");
        if (!alive) return;
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        if (alive) setError((err as Error).message);
      } finally {
        if (alive) setLoadingRows(false);
      }
    }

    void loadRows();
    return () => {
      alive = false;
    };
  }, [meta, page, pageSize, sortBy, sortDir, q, filterColumn, filterValue, refreshToken, table]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function rowId(row: Record<string, unknown>) {
    if (!meta?.primaryKey) return "";
    return toCellKey(row[meta.primaryKey]);
  }

  function beginEdit(row: Record<string, unknown>) {
    const id = rowId(row);
    if (!id) return;
    setEditingId(id);
    setDrafts((prev) => ({ ...prev, [id]: { ...row } }));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(row: Record<string, unknown>) {
    if (!meta?.primaryKey) return;
    const id = rowId(row);
    const draft = drafts[id] ?? {};
    const values: Record<string, unknown> = {};

    for (const col of editableColumns) {
      if (!(col.name in draft)) continue;
      const before = row[col.name];
      const after = draft[col.name];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        values[col.name] = after;
      }
    }

    if (Object.keys(values).length === 0) {
      setFlash("No changes to save.");
      setEditingId(null);
      return;
    }

    const res = await fetch(`/api/admin/table/${encodeURIComponent(table)}/rows/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to update row");
      return;
    }

    setFlash("Row updated.");
    setEditingId(null);
    setRefreshToken((n) => n + 1);
  }

  async function deleteRow(row: Record<string, unknown>) {
    if (!meta?.primaryKey) return;
    const id = rowId(row);
    if (!id) return;

    const ok = window.confirm(`Delete row ${id}? This cannot be undone.`);
    if (!ok) return;

    const res = await fetch(`/api/admin/table/${encodeURIComponent(table)}/rows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to delete row");
      return;
    }

    setFlash("Row deleted.");
    setRefreshToken((n) => n + 1);
  }

  async function createRow() {
    const values: Record<string, unknown> = {};
    for (const col of editableColumns) {
      if (!(col.name in newRow)) continue;
      values[col.name] = newRow[col.name];
    }

    const res = await fetch(`/api/admin/table/${encodeURIComponent(table)}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to create row");
      return;
    }

    setFlash("Row created.");
    setCreating(false);
    setNewRow({});
    setRefreshToken((n) => n + 1);
  }

  if (loadingMeta) {
    return <div style={{ minHeight: "100vh", background: "#070c14", color: "#60a5fa", padding: 24 }}>Loading admin table…</div>;
  }

  if (!meta) {
    return <div style={{ minHeight: "100vh", background: "#070c14", color: "#fca5a5", padding: 24 }}>{error ?? "Table unavailable"}</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#070c14", color: "#dbe7ff", padding: 18 }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div>
            <Link href="/admin" style={{ color: "#60a5fa", fontSize: 12, textDecoration: "none" }}>← Back to tables</Link>
            <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>{meta.label}</h1>
            <div style={{ color: "#64748b", fontSize: 12 }}>{meta.description}</div>
          </div>

          <button
            onClick={() => setCreating((v) => !v)}
            style={{ background: "#1d4ed8", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
          >
            {creating ? "Cancel New Row" : "Add Row"}
          </button>
        </div>

        {flash && (
          <div style={{ marginBottom: 10, background: "rgba(22,163,74,0.18)", border: "1px solid rgba(22,163,74,0.45)", color: "#86efac", padding: "8px 10px", borderRadius: 8 }}>
            {flash}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 10, background: "rgba(127,29,29,0.25)", border: "1px solid rgba(127,29,29,0.55)", color: "#fca5a5", padding: "8px 10px", borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ border: "1px solid #1f2a44", background: "#0c1423", borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setQ(qInput.trim());
                }
              }}
              placeholder="Search"
              style={{ minWidth: 220, background: "#09101d", border: "1px solid #24344f", color: "#dbe7ff", borderRadius: 6, padding: "6px 8px" }}
            />
            <button
              onClick={() => {
                setPage(1);
                setQ(qInput.trim());
              }}
              style={{ background: "#1e293b", color: "#dbe7ff", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Search
            </button>

            <select
              value={filterColumn}
              onChange={(e) => setFilterColumn(e.target.value)}
              style={{ background: "#09101d", border: "1px solid #24344f", color: "#dbe7ff", borderRadius: 6, padding: "6px 8px" }}
            >
              {meta.columns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              placeholder="Filter value"
              style={{ minWidth: 170, background: "#09101d", border: "1px solid #24344f", color: "#dbe7ff", borderRadius: 6, padding: "6px 8px" }}
            />
            <button
              onClick={() => {
                setPage(1);
                setRefreshToken((n) => n + 1);
              }}
              style={{ background: "#1e293b", color: "#dbe7ff", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Apply Filter
            </button>
            <button
              onClick={() => {
                setQInput("");
                setQ("");
                setFilterValue("");
                setPage(1);
                setRefreshToken((n) => n + 1);
              }}
              style={{ background: "transparent", color: "#93c5fd", border: "1px solid #1e3a8a", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
            >
              Reset
            </button>

            <div style={{ marginLeft: "auto", color: "#64748b", fontSize: 12 }}>
              {total.toLocaleString()} rows
            </div>
          </div>
        </div>

        {creating && (
          <div style={{ border: "1px solid #1f2a44", background: "#0c1423", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ color: "#93c5fd", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Create row</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
              {editableColumns.map((col) => (
                <div key={col.name}>
                  <div style={{ color: "#64748b", fontSize: 11, marginBottom: 3 }}>{col.name}</div>
                  {valueInput(col, newRow[col.name], (next) => {
                    setNewRow((prev) => ({ ...prev, [col.name]: next }));
                  }, col.udtName === "json" || col.udtName === "jsonb")}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button
                onClick={() => void createRow()}
                style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
              >
                Insert row
              </button>
            </div>
          </div>
        )}

        <div style={{ border: "1px solid #1f2a44", background: "#0c1423", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {meta.columns.map((col) => {
                    const active = sortBy === col.name;
                    return (
                      <th
                        key={col.name}
                        onClick={() => {
                          if (sortBy === col.name) {
                            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          } else {
                            setSortBy(col.name);
                            setSortDir("asc");
                          }
                        }}
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#0f1828",
                          borderBottom: "1px solid #24344f",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          color: active ? "#93c5fd" : "#94a3b8",
                          fontWeight: 700,
                          padding: "8px 10px",
                          cursor: "pointer",
                          zIndex: 1,
                        }}
                      >
                        {col.name} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
                      </th>
                    );
                  })}
                  <th style={{ position: "sticky", top: 0, background: "#0f1828", borderBottom: "1px solid #24344f", color: "#94a3b8", padding: "8px 10px", whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td colSpan={meta.columns.length + 1} style={{ padding: 14, color: "#60a5fa" }}>Loading rows…</td>
                  </tr>
                )}
                {!loadingRows && rows.length === 0 && (
                  <tr>
                    <td colSpan={meta.columns.length + 1} style={{ padding: 14, color: "#64748b" }}>No rows found.</td>
                  </tr>
                )}

                {!loadingRows && rows.map((row, idx) => {
                  const id = rowId(row) || String(idx);
                  const isEditing = editingId === id;
                  const draft = drafts[id] ?? row;

                  return (
                    <tr key={id} style={{ borderTop: "1px solid #162338" }}>
                      {meta.columns.map((col) => {
                        const raw = isEditing ? draft[col.name] : row[col.name];
                        const text = formatCell(raw);
                        const tooLong = text.length > 120;

                        return (
                          <td key={col.name} style={{ padding: "6px 8px", verticalAlign: "top", minWidth: 140 }}>
                            {isEditing && col.editable
                              ? valueInput(col, raw, (next) => {
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [id]: {
                                      ...(prev[id] ?? row),
                                      [col.name]: next,
                                    },
                                  }));
                                }, col.udtName === "json" || col.udtName === "jsonb")
                              : (
                                <span style={{ color: raw == null ? "#64748b" : "#dbe7ff", fontFamily: tooLong ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>
                                  {tooLong ? `${text.slice(0, 120)}…` : text}
                                </span>
                              )}
                          </td>
                        );
                      })}

                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap", minWidth: 180 }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => void saveEdit(row)}
                              style={{ marginRight: 6, background: "#15803d", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{ marginRight: 6, background: "#334155", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={!meta.primaryKey}
                              onClick={() => beginEdit(row)}
                              style={{ marginRight: 6, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", opacity: meta.primaryKey ? 1 : 0.5 }}
                            >
                              Edit
                            </button>
                            <button
                              disabled={!meta.primaryKey}
                              onClick={() => void deleteRow(row)}
                              style={{ background: "#b91c1c", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", opacity: meta.primaryKey ? 1 : 0.5 }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid #1f2a44", padding: "8px 10px", color: "#94a3b8", fontSize: 12 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ background: "#1e293b", color: "#dbe7ff", border: "1px solid #334155", borderRadius: 6, padding: "4px 8px", cursor: "pointer", opacity: page <= 1 ? 0.5 : 1 }}
            >
              Prev
            </button>
            <span>Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ background: "#1e293b", color: "#dbe7ff", border: "1px solid #334155", borderRadius: 6, padding: "4px 8px", cursor: "pointer", opacity: page >= totalPages ? 0.5 : 1 }}
            >
              Next
            </button>

            <span style={{ marginLeft: "auto" }}>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
              style={{ background: "#09101d", border: "1px solid #24344f", color: "#dbe7ff", borderRadius: 6, padding: "4px 6px" }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

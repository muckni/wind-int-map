"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminTableSummary } from "../../types/admin";

export default function AdminLanding() {
  const [tables, setTables] = useState<AdminTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/admin/tables", { cache: "no-store" });
        const data = (await res.json()) as { tables?: AdminTableSummary[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load tables");
        if (alive) {
          setTables(data.tables ?? []);
          setError(null);
        }
      } catch (err) {
        if (alive) setError((err as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#070c14", color: "#dbe7ff", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: "#e2e8f0" }}>Admin</h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 14 }}>
            Internal CRUD interface for core offshore wind data.
          </p>
        </div>

        {loading && <div style={{ color: "#60a5fa" }}>Loading tables…</div>}
        {error && (
          <div style={{ color: "#fca5a5", background: "rgba(127,29,29,0.2)", border: "1px solid rgba(127,29,29,0.5)", padding: 10, borderRadius: 8 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {tables.map((t) => (
              <Link
                key={t.name}
                href={`/admin/${t.name}`}
                style={{
                  display: "block",
                  border: "1px solid #1f2a44",
                  background: "#0c1423",
                  borderRadius: 10,
                  padding: 14,
                  textDecoration: "none",
                }}
              >
                <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: 15 }}>{t.label}</div>
                <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{t.description}</div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
                  {t.rowCount.toLocaleString()} rows
                </div>
                <div style={{ color: "#3b82f6", fontSize: 12, marginTop: 6 }}>Open table →</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

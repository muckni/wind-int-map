import type { WindFarmDetail } from "../lib/types"

function fmt(v: string | number | null | undefined, suffix = "") {
  if (v === null || v === undefined || v === "") return "—"
  return `${v}${suffix}`
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    "operational":        { bg: "#052e16", text: "#34d399", dot: "#34d399" },
    "under construction": { bg: "#1c1400", text: "#fbbf24", dot: "#fbbf24" },
    "planned":            { bg: "#0c1a2e", text: "#60a5fa", dot: "#60a5fa" },
    "decommissioned":     { bg: "#1a1a1a", text: "#6b7280", dot: "#6b7280" },
    "unknown":            { bg: "#1a1a1a", text: "#475569", dot: "#475569" },
  }
  const c = colors[status?.toLowerCase()] ?? colors.unknown
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 999,
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot }} />
      {status}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid #0d1625" }}>
      <span style={{ color: "#334155", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500, textAlign: "right", maxWidth: 160 }}>{value}</span>
    </div>
  )
}

export default function WindFarmPanel({ windFarm }: { windFarm: WindFarmDetail | null }) {
  if (!windFarm) {
    return (
      <div style={{ padding: "20px 16px", color: "#1e293b", fontSize: 13 }}>
        Click a project to view details.
      </div>
    )
  }

  const wf = windFarm.wind_farm

  return (
    <div style={{ padding: "14px 16px" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.3 }}>
        {wf.name}
      </h2>

      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <StatusBadge status={wf.status_current} />
        <span style={{ color: "#334155", fontSize: 11 }}>
          {fmt(wf.country_code)}{wf.sea_basin ? ` · ${wf.sea_basin}` : ""}
        </span>
      </div>

      {/* Core metrics */}
      <div style={{ marginTop: 14 }}>
        <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Project
        </div>
        <Row label="Capacity" value={wf.capacity_mw != null ? `${wf.capacity_mw} MW` : "—"} />
        <Row label="Turbines" value={fmt(wf.turbine_count)} />
        {wf.turbine_model && <Row label="Turbine Model" value={wf.turbine_model} />}
        {wf.turbine_oem && !wf.turbine_model && <Row label="Turbine OEM" value={wf.turbine_oem} />}
        <Row label="Foundation" value={fmt(wf.foundation_type)} />
        <Row label="Water Depth" value={wf.water_depth_m != null ? `${wf.water_depth_m} m` : "—"} />
        {wf.distance_shore_km != null && <Row label="Distance to Shore" value={`${wf.distance_shore_km} km`} />}
        <Row label="Commissioned" value={wf.commissioned_date ? wf.commissioned_date.slice(0, 7) : "—"} />
        <Row label="Data Quality" value={fmt(wf.data_quality)} />
        {wf.route_to_market && <Row label="Route to Market" value={wf.route_to_market} />}
      </div>

      {/* Developer */}
      {wf.developer_name && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Developer
          </div>
          <Row label="Company" value={wf.developer_name} />
          {wf.developer_hq_country_code && <Row label="HQ" value={wf.developer_hq_country_code} />}
          {wf.developer_website && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #0d1625" }}>
              <span style={{ color: "#334155", fontSize: 11 }}>Website</span>
              <a href={wf.developer_website} target="_blank" rel="noopener noreferrer"
                style={{ color: "#3b82f6", fontSize: 11, textDecoration: "none" }}>
                {wf.developer_website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Ownership */}
      {windFarm.ownership.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Ownership
          </div>
          {windFarm.ownership.map(o => (
            <div key={o.id} style={{ padding: "5px 0", borderBottom: "1px solid #0d1625", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>{o.company_name}</span>
              <span style={{ color: "#475569", fontSize: 11 }}>
                {o.equity_share_pct != null ? `${o.equity_share_pct}%` : o.role_type ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Contracts */}
      {windFarm.contracts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Contracts
          </div>
          {windFarm.contracts.map(c => (
            <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #0d1625" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>{c.contract_type.toUpperCase()}</span>
                {c.price_eur_mwh != null && (
                  <span style={{ color: "#34d399", fontSize: 12 }}>€{c.price_eur_mwh}/MWh</span>
                )}
              </div>
              {(c.start_date || c.end_date) && (
                <div style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                  {c.start_date?.slice(0, 7) ?? "?"} – {c.end_date?.slice(0, 7) ?? "?"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

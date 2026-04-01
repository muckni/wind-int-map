import type { CompanyPoint, NetworkLink } from "../lib/types"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid #0d1625" }}>
      <span style={{ color: "#334155", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500, textAlign: "right", maxWidth: 170 }}>{value}</span>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  "operational":        "#34d399",
  "under construction": "#fbbf24",
  "planned":            "#60a5fa",
  "decommissioned":     "#6b7280",
}

interface Props {
  company: CompanyPoint
  links: NetworkLink[]
  onClose: () => void
}

export default function CompanyPanel({ company, links, onClose }: Props) {
  const totalCapacity = links.reduce((sum, l) => sum + (l.capacity_mw ?? 0), 0)
  const farmsByStatus = links.reduce<Record<string, number>>((acc, l) => {
    acc[l.status_current] = (acc[l.status_current] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.3 }}>
            {company.name}
          </h2>
          <div style={{ marginTop: 4 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "2px 8px", borderRadius: 999,
              background: "#1c1400", color: "#ffa500",
              fontSize: 11, fontWeight: 600,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffa500" }} />
              {company.actor_type}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1, flexShrink: 0 }}
        >✕</button>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Company
        </div>
        <Row label="HQ Country" value={company.hq_country_code ?? "—"} />
        {company.city && <Row label="City" value={company.city} />}
        {company.website && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #0d1625" }}>
            <span style={{ color: "#334155", fontSize: 11 }}>Website</span>
            <a href={company.website} target="_blank" rel="noopener noreferrer"
              style={{ color: "#3b82f6", fontSize: 11, textDecoration: "none" }}>
              {company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          </div>
        )}
      </div>

      {links.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Portfolio — {links.length} project{links.length !== 1 ? "s" : ""} · {totalCapacity.toFixed(0)} MW
          </div>
          {Object.entries(farmsByStatus).map(([status, count]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[status] ?? "#475569", flexShrink: 0 }} />
              <span style={{ color: "#475569", fontSize: 11 }}>{count} {status}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, maxHeight: 320, overflowY: "auto" }}>
            {links.map(l => (
              <div key={l.farm_id} style={{
                padding: "6px 0",
                borderBottom: "1px solid #0d1625",
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
              }}>
                <div>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>{l.farm_name}</div>
                  <div style={{ color: "#334155", fontSize: 10, marginTop: 1 }}>
                    {l.country_code}
                    {l.role_type && ` · ${l.role_type}`}
                    {l.equity_share_pct != null && ` · ${l.equity_share_pct}%`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {l.capacity_mw != null && (
                    <div style={{ color: "#475569", fontSize: 11 }}>{l.capacity_mw} MW</div>
                  )}
                  <div style={{ color: STATUS_COLORS[l.status_current] ?? "#475569", fontSize: 10, marginTop: 1 }}>
                    {l.status_current}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {links.length === 0 && (
        <div style={{ marginTop: 14, color: "#1e293b", fontSize: 12 }}>
          No linked projects found.
        </div>
      )}
    </div>
  )
}

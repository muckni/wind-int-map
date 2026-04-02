import type {
  WindFarmDetail,
  EpcRole,
  WindFarmSupportHistoryPoint,
  WindFarmSupportRecord,
} from "../lib/types"

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

function fmtCurrencySymbol(currency: string | null | undefined) {
  if (currency === "GBP") return "£"
  if (currency === "EUR") return "€"
  return currency ? `${currency} ` : ""
}

function fmtSupportValue(
  value: number | null | undefined,
  currency: string | null | undefined,
  unit: string | null | undefined,
) {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  const decimals = Number.isInteger(n) ? 0 : n < 10 ? 3 : 2
  const amount = `${fmtCurrencySymbol(currency)}${n.toFixed(decimals)}`
  return unit ? `${amount}/${unit}` : amount
}

function fmtObservationDate(v: string | null | undefined) {
  if (!v) return "—"
  return v.slice(0, 10)
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

      {windFarm.support.length > 0 && (
        <SupportSection
          support={windFarm.support}
          history={windFarm.support_history}
        />
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

      {/* EPC Contractors */}
      {windFarm.epc && windFarm.epc.length > 0 && (
        <EpcSection epc={windFarm.epc} />
      )}
    </div>
  )
}

const PACKAGE_ORDER = ["foundations", "inter-array cables", "export cables", "wtg"]
const PACKAGE_LABELS: Record<string, string> = {
  "foundations":         "Foundations",
  "inter-array cables":  "Inter-Array Cables",
  "export cables":       "Export Cables",
  "wtg":                 "WTG",
}
const CONFIDENCE_DOT: Record<string, string> = {
  "high":   "#34d399",
  "medium": "#fbbf24",
  "low":    "#f87171",
}

function EpcSection({ epc }: { epc: EpcRole[] }) {
  const byPackage: Record<string, EpcRole[]> = {}
  for (const r of epc) {
    const p = r.package_code.toLowerCase()
    if (!byPackage[p]) byPackage[p] = []
    byPackage[p].push(r)
  }
  const packages = PACKAGE_ORDER.filter(p => byPackage[p]?.length)

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        EPC Contractors
      </div>
      {packages.map(pkg => (
        <div key={pkg} style={{ marginBottom: 8 }}>
          <div style={{ color: "#334155", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
            {PACKAGE_LABELS[pkg] ?? pkg}
          </div>
          {byPackage[pkg].map(r => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid #0d1625" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                  background: CONFIDENCE_DOT[r.confidence] ?? "#475569",
                }} />
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{r.company_name}</span>
              </div>
              <span style={{ color: "#475569", fontSize: 10, textAlign: "right", maxWidth: 130 }}>{r.role_type}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ color: "#1e3040", fontSize: 9, marginTop: 4 }}>
        ● high  ● medium  ● low confidence
      </div>
    </div>
  )
}

function SupportSection({
  support,
  history,
}: {
  support: WindFarmSupportRecord[]
  history: WindFarmSupportHistoryPoint[]
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        Support
      </div>
      {support.map((item) => {
        const series = history.filter((point) =>
          point.support_scheme_id === item.id &&
          point.price_value != null &&
          point.observation_date
        )
        return (
          <div key={item.id} style={{ padding: "8px 0", borderBottom: "1px solid #0d1625" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
                {item.support_scheme_type}
              </span>
              <span style={{ color: "#34d399", fontSize: 12, fontWeight: 600, textAlign: "right" }}>
                {fmtSupportValue(item.support_price_value, item.support_price_currency, item.support_price_unit)}
              </span>
            </div>

            {(item.allocation_round || item.tender_name) && (
              <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>
                {[item.allocation_round, item.tender_name].filter(Boolean).join(" · ")}
              </div>
            )}

            <div style={{ marginTop: 6 }}>
              <Row label="Basis" value={fmt(item.support_price_basis)} />
              <Row label="Award" value={item.award_date ? fmtObservationDate(item.award_date) : fmt(item.award_year)} />
              {item.current_price_value != null && (
                <Row
                  label="Current"
                  value={`${fmtSupportValue(item.current_price_value, item.support_price_currency, item.support_price_unit)}${item.current_price_date ? ` · ${fmtObservationDate(item.current_price_date)}` : ""}`}
                />
              )}
              <Row label="Confidence" value={fmt(item.confidence)} />
            </div>

            {series.length > 1 && <SupportHistoryChart points={series} />}

            {(item.source_title || item.source_url) && (
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "#334155", fontSize: 11 }}>Source</span>
                {item.source_url ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#3b82f6", fontSize: 11, textDecoration: "none", textAlign: "right", maxWidth: 170 }}
                  >
                    {item.source_title ?? item.source_url}
                  </a>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: 11, textAlign: "right", maxWidth: 170 }}>
                    {item.source_title}
                  </span>
                )}
              </div>
            )}

            {item.notes && (
              <div style={{ color: "#334155", fontSize: 10, marginTop: 6, lineHeight: 1.45 }}>
                {item.notes}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SupportHistoryChart({ points }: { points: WindFarmSupportHistoryPoint[] }) {
  const values = points.map((point) => Number(point.price_value ?? 0))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max === min ? 1 : max - min
  const width = 250
  const height = 56
  const padX = 8
  const padY = 6

  const coords = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : padX + (index * (width - padX * 2)) / (points.length - 1)
    const y = height - padY - ((Number(point.price_value ?? 0) - min) / span) * (height - padY * 2)
    return { x, y, point }
  })

  const d = coords.map((c, index) => `${index === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ")

  return (
    <div style={{ marginTop: 8, padding: "6px 0 2px" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <path d={d} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c) => (
          <circle key={c.point.id} cx={c.x} cy={c.y} r="2.5" fill="#34d399" />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#334155", fontSize: 10, marginTop: 2 }}>
        <span>{fmtObservationDate(points[0]?.observation_date)}</span>
        <span>{fmtObservationDate(points[points.length - 1]?.observation_date)}</span>
      </div>
    </div>
  )
}

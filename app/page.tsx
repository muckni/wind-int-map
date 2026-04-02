"use client"

import { useState } from "react"
import MapView from "../components/MapView"
import WindFarmPanel from "../components/WindFarmPanel"
import CompanyPanel from "../components/CompanyPanel"
import type { WindFarmDetail, CompanyPoint, NetworkLink } from "../lib/types"

const STATUSES = [
  { key: "operational",        label: "Operational",        color: "#34d399" },
  { key: "under construction", label: "Under Construction", color: "#fbbf24" },
  { key: "planned",            label: "Planned",            color: "#60a5fa" },
  { key: "decommissioned",     label: "Decommissioned",     color: "#6b7280" },
]

export default function Page() {
  const [selectedFarm,    setSelectedFarm]    = useState<WindFarmDetail | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<CompanyPoint | null>(null)
  const [companyLinks,    setCompanyLinks]    = useState<NetworkLink[]>([])
  const [activeStatuses,  setActiveStatuses]  = useState<Set<string>>(new Set())

  function toggleStatus(key: string) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function handleSelectCompany(company: CompanyPoint | null, links: NetworkLink[] = []) {
    setSelectedCompany(company)
    setSelectedFarm(null)
    setCompanyLinks(company ? links : [])
  }

  function handleSelectFarm(farm: WindFarmDetail | null) {
    setSelectedFarm(farm)
    // Only clear company state when actively selecting a farm (not on deselect)
    if (farm !== null) {
      setSelectedCompany(null)
      setCompanyLinks([])
    }
  }

  const panel = selectedFarm ? "farm" : selectedCompany ? "company" : null

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh", background: "#080c14" }}>

      {/* Filter bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 14px",
        background: "#0c1220",
        borderBottom: "1px solid #131e30",
        flexShrink: 0,
      }}>
        <span style={{ color: "#334155", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 6 }}>
          Filter
        </span>

        {STATUSES.map(s => {
          const active = activeStatuses.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggleStatus(s.key)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 999, fontSize: 11,
                border: `1px solid ${active ? s.color + "80" : "rgba(255,255,255,0.08)"}`,
                background: active ? s.color + "18" : "transparent",
                color: active ? s.color : "#475569",
                cursor: "pointer", fontWeight: 500,
                transition: "all 0.12s ease",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              {s.label}
            </button>
          )
        })}

        <span style={{ marginLeft: "auto", color: "#1e293b", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          OFFSHORE WIND INTELLIGENCE
        </span>
      </div>

      {/* Map + Panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <MapView
            onSelectFarm={handleSelectFarm}
            onSelectCompany={handleSelectCompany}
            statusFilter={activeStatuses}
            activeSelectionId={selectedFarm?.wind_farm.id ?? selectedCompany?.id ?? null}
          />
        </div>

        {panel && (
          <div style={{
            width: 310, flexShrink: 0,
            background: "#0c1220",
            borderLeft: "1px solid #131e30",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>
            {panel === "farm" && selectedFarm && (
              <>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "11px 14px", borderBottom: "1px solid #131e30", flexShrink: 0,
                }}>
                  <span style={{ color: "#334155", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Project Details
                  </span>
                  <button
                    onClick={() => handleSelectFarm(null)}
                    style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}
                  >✕</button>
                </div>
                <WindFarmPanel windFarm={selectedFarm} />
              </>
            )}

            {panel === "company" && selectedCompany && (
              <CompanyPanel
                company={selectedCompany}
                links={companyLinks}
                onClose={() => handleSelectCompany(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

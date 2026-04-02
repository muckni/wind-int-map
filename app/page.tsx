"use client"

import { useCallback, useEffect, useState } from "react"
import MapView from "../components/MapView"
import WindFarmPanel from "../components/WindFarmPanel"
import CompanyPanel from "../components/CompanyPanel"
import TimelineSlider from "../components/TimelineSlider"
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
  const [hideIncomplete,  setHideIncomplete]  = useState(false)
  const [timelineYear,    setTimelineYear]    = useState<number | null>(null)

  // Initialise from URL param on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("year")
    if (p) {
      const y = Number(p)
      if (Number.isFinite(y) && y >= 1991 && y <= 2035) setTimelineYear(y)
    }
  }, [])

  const handleYearChange = useCallback((year: number) => {
    setTimelineYear(year)
    const url = new URL(window.location.href)
    url.searchParams.set("year", String(year))
    window.history.replaceState(null, "", url.toString())
  }, [])

  function toggleStatus(key: string) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleHideIncomplete() {
    setHideIncomplete(prev => !prev)
    setSelectedFarm(null)
    setSelectedCompany(null)
    setCompanyLinks([])
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
  const tileServerUrl = process.env.NEXT_PUBLIC_MARTIN_URL ?? "http://localhost:3001"

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

        <button
          onClick={toggleHideIncomplete}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999, fontSize: 11,
            border: `1px solid ${hideIncomplete ? "rgba(148,163,184,0.45)" : "rgba(255,255,255,0.08)"}`,
            background: hideIncomplete ? "rgba(148,163,184,0.14)" : "transparent",
            color: hideIncomplete ? "#cbd5e1" : "#475569",
            cursor: "pointer", fontWeight: 500,
            transition: "all 0.12s ease",
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: hideIncomplete ? "#cbd5e1" : "#1e293b",
            boxShadow: hideIncomplete ? "0 0 0 3px rgba(203,213,225,0.12)" : "none",
            flexShrink: 0,
          }} />
          Hide Incomplete
        </button>

        <button
          onClick={() => {
            if (timelineYear !== null) {
              setTimelineYear(null)
              const url = new URL(window.location.href)
              url.searchParams.delete("year")
              window.history.replaceState(null, "", url.toString())
            } else {
              handleYearChange(2024)
            }
          }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999, fontSize: 11,
            border: `1px solid ${timelineYear !== null ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.08)"}`,
            background: timelineYear !== null ? "rgba(96,165,250,0.14)" : "transparent",
            color: timelineYear !== null ? "#60a5fa" : "#475569",
            cursor: "pointer", fontWeight: 500,
            transition: "all 0.12s ease",
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: timelineYear !== null ? "#60a5fa" : "#1e293b",
            flexShrink: 0,
          }} />
          Timeline
        </button>

        <span style={{ marginLeft: "auto", color: "#1e293b", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          OFFSHORE WIND INTELLIGENCE
        </span>
      </div>

      {/* Timeline slider */}
      {timelineYear !== null && (
        <TimelineSlider selectedYear={timelineYear} onYearChange={handleYearChange} />
      )}

      {/* Map + Panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <MapView
            onSelectFarm={handleSelectFarm}
            onSelectCompany={handleSelectCompany}
            statusFilter={activeStatuses}
            hideIncomplete={hideIncomplete}
            tileServerUrl={tileServerUrl}
            activeSelectionId={selectedFarm?.wind_farm.id ?? selectedCompany?.id ?? null}
            timelineYear={timelineYear}
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

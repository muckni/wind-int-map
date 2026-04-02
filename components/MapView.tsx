"use client"

import { useEffect, useRef, useState } from "react"
import Map, { NavigationControl } from "react-map-gl/maplibre"
import DeckGL from "@deck.gl/react"
import { GeoJsonLayer, ScatterplotLayer, LineLayer } from "@deck.gl/layers"
import type { WindFarmPoint, TurbinePoint, CompanyPoint, NetworkLink, WindFarmDetail } from "../lib/types"

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

const STATUS_COLORS: Record<string, [number, number, number, number]> = {
  "operational":        [52,  211, 153, 230],
  "under construction": [251, 191,  36, 230],
  "planned":            [96,  165, 250, 200],
  "decommissioned":     [107, 114, 128, 180],
  "unknown":            [148, 163, 184, 160],
}

// Per role-type line color (RGB only — alpha set per layer)
const ROLE_COLORS: Record<string, [number, number, number]> = {
  "developer":               [34,  211, 238],  // cyan
  "owner":                   [52,  211, 153],  // green
  "equity partner":          [45,  212, 191],  // teal
  "operator":                [167, 139, 250],  // violet
  "offtaker":                [251, 191,  36],  // amber
  "ppa counterparty":        [251, 191,  36],  // amber
  "cfd":                     [96,  165, 250],  // blue
  "corporate ppa":           [251, 191,  36],  // amber
  "utility offtake":         [251, 191,  36],  // amber
  "feed-in tariff":          [251, 146,  60],  // orange
  "merchant":                [248, 113, 113],  // rose
  "green certificate":       [163, 230,  53],  // lime
  "construction contractor": [148, 163, 184],  // slate
  "other":                   [100, 116, 139],
  "unknown":                 [100, 116, 139],
}

function roleColor(role: string): [number, number, number] {
  return ROLE_COLORS[role?.toLowerCase()] ?? ROLE_COLORS.unknown
}

function statusColor(s: string): [number, number, number, number] {
  return STATUS_COLORS[s?.toLowerCase()] ?? STATUS_COLORS.unknown
}

function approxBbox(vs: { longitude: number; latitude: number; zoom: number }): [number, number, number, number] {
  const span = 360 / Math.pow(2, vs.zoom) * 1.5
  return [
    Math.max(-180, vs.longitude - span),
    Math.max(-85,  vs.latitude  - span * 0.7),
    Math.min(180,  vs.longitude + span),
    Math.min(85,   vs.latitude  + span * 0.7),
  ]
}

const INITIAL_VIEW = { longitude: 5, latitude: 54, zoom: 4.5, pitch: 0, bearing: 0 }

interface Props {
  onSelectFarm:    (farm: WindFarmDetail | null) => void
  onSelectCompany: (company: CompanyPoint | null, links?: NetworkLink[]) => void
  statusFilter:    Set<string>
}

export default function MapView({ onSelectFarm, onSelectCompany, statusFilter }: Props) {
  const [allFarms,     setAllFarms]     = useState<WindFarmPoint[]>([])
  const [turbines,     setTurbines]     = useState<TurbinePoint[]>([])
  const [companies,    setCompanies]    = useState<CompanyPoint[]>([])
  const [polygons,     setPolygons]     = useState<GeoJSON.Feature[]>([])
  const [networkLines, setNetworkLines] = useState<NetworkLink[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [viewState,    setViewState]    = useState<any>(INITIAL_VIEW)
  const [tooltip,      setTooltip]      = useState<{ x: number; y: number; label: string } | null>(null)
  const turbineTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetch("/api/wind-farms?bbox=-180,-85,180,85&limit=2000")
      .then(r => r.json())
      .then(j => { setAllFarms(j.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
    fetch("/api/companies?with_location=true")
      .then(r => r.json())
      .then(j => setCompanies(j.data ?? []))
      .catch(() => {})
    fetch("/api/wind-farm-polygons?bbox=-180,-85,180,85")
      .then(r => r.json())
      .then(j => setPolygons(j.features ?? []))
      .catch(() => {})
  }, [])

  function handleViewStateChange({ viewState: vs }: any) {
    setViewState(vs)
    clearTimeout(turbineTimerRef.current)
    if (vs.zoom >= 9) {
      turbineTimerRef.current = setTimeout(() => {
        const bbox = approxBbox(vs)
        fetch(`/api/turbines?bbox=${bbox.join(",")}`)
          .then(r => r.json())
          .then(j => setTurbines(j.data ?? []))
          .catch(() => {})
      }, 350)
    } else if (vs.zoom < 8) {
      setTurbines([])
    }
  }

  const farms = statusFilter.size === 0
    ? allFarms
    : allFarms.filter(d => statusFilter.has(d.status_current?.toLowerCase()))

  const zoom = viewState.zoom ?? INITIAL_VIEW.zoom
  const hasSelection = selectedCompanyId !== null

  async function handleFarmClick(farm: WindFarmPoint) {
    setSelectedCompanyId(null)
    setNetworkLines([])
    onSelectCompany(null, [])
    try {
      const res = await fetch(`/api/wind-farms/${farm.id}`)
      if (res.ok) onSelectFarm(await res.json())
    } catch { /* ignore */ }
  }

  async function handleCompanyClick(company: CompanyPoint) {
    if (selectedCompanyId === company.id) {
      setSelectedCompanyId(null)
      setNetworkLines([])
      onSelectCompany(null, [])
      return
    }
    setSelectedCompanyId(company.id)
    try {
      const res = await fetch(`/api/companies/${company.id}/network`)
      if (res.ok) {
        const data = await res.json()
        const validLinks = (data.links ?? []).filter(
          (l: NetworkLink) =>
            l.company_lng != null && l.company_lat != null &&
            l.farm_lng    != null && l.farm_lat    != null
        )
        setNetworkLines(validLinks)
        onSelectCompany(company, validLinks)
      } else {
        setNetworkLines([])
        onSelectCompany(company, [])
      }
    } catch {
      setNetworkLines([])
      onSelectCompany(company, [])
    }
  }

  const highlightedFarmIds = new Set(networkLines.map(l => l.farm_id))

  // Unique roles in current network (for legend)
  const activeRoles = Array.from(new Set(networkLines.map(l => l.role_type?.toLowerCase()).filter(Boolean)))

  const layers = [
    // ── Polygons ──────────────────────────────────────────────────────────────
    new GeoJsonLayer({
      id: "farm-polygons",
      data: { type: "FeatureCollection" as const, features: polygons },
      visible: zoom >= 6,
      filled: true,
      stroked: true,
      getFillColor: (f: any) => {
        const [r, g, b] = statusColor(f.properties.status_current)
        // Dim fills when a company is selected
        return hasSelection ? [r, g, b, 10] : [r, g, b, 28]
      },
      getLineColor: (f: any) => {
        const [r, g, b] = statusColor(f.properties.status_current)
        return hasSelection ? [r, g, b, 30] : [r, g, b, 90]
      },
      lineWidthMinPixels: 1,
      pickable: false,
      updateTriggers: { getFillColor: [hasSelection], getLineColor: [hasSelection] },
    }),

    // ── Farm centroids ────────────────────────────────────────────────────────
    new ScatterplotLayer({
      id: "windfarms",
      data: farms,
      getPosition: (d: WindFarmPoint) => [d.lng, d.lat],
      getRadius: (d: WindFarmPoint) => Math.max(5000, Math.min(22000, (d.capacity_mw ?? 60) * 12)),
      getFillColor: (d: WindFarmPoint) => {
        if (highlightedFarmIds.has(d.id)) return [255, 240, 80, 255]
        const [r, g, b, a] = statusColor(d.status_current)
        return hasSelection ? [r, g, b, 35] : [r, g, b, a]
      },
      getLineColor: (d: WindFarmPoint) => {
        if (highlightedFarmIds.has(d.id)) return [255, 255, 180, 255]
        return hasSelection ? [255, 255, 255, 8] : [255, 255, 255, 30]
      },
      lineWidthMinPixels: (d: any) => highlightedFarmIds.has(d.id) ? 2 : 1,
      stroked: true,
      pickable: true,
      radiusMinPixels: hasSelection ? 2 : 3,
      radiusMaxPixels: zoom >= 9 ? 8 : 18,
      updateTriggers: {
        getFillColor: [selectedCompanyId, highlightedFarmIds.size],
        getLineColor: [selectedCompanyId, highlightedFarmIds.size],
        lineWidthMinPixels: [highlightedFarmIds.size],
      },
      onHover: (info: any) => {
        if (info.object) {
          const f = info.object as WindFarmPoint
          setTooltip({
            x: info.x, y: info.y,
            label: `${f.name} · ${f.country_code}${f.capacity_mw != null ? ` · ${f.capacity_mw} MW` : ""} · ${f.status_current}`,
          })
        } else setTooltip(null)
      },
      onClick: (info: any) => { if (info.object) handleFarmClick(info.object) },
    }),

    // ── Turbines ──────────────────────────────────────────────────────────────
    new ScatterplotLayer({
      id: "turbines",
      data: turbines,
      visible: zoom >= 9,
      getPosition: (d: TurbinePoint) => [d.lng, d.lat],
      getRadius: 120,
      radiusMinPixels: 2,
      radiusMaxPixels: 5,
      getFillColor: hasSelection ? [180, 220, 255, 40] : [180, 220, 255, 180],
      pickable: false,
      updateTriggers: { getFillColor: [hasSelection] },
    }),

    // ── Network lines — glow base (widest, most transparent) ─────────────────
    new LineLayer({
      id: "network-glow",
      data: networkLines,
      getSourcePosition: (d: NetworkLink) => [d.company_lng, d.company_lat],
      getTargetPosition: (d: NetworkLink) => [d.farm_lng, d.farm_lat],
      getColor: (d: NetworkLink) => {
        const [r, g, b] = roleColor(d.role_type)
        return [r, g, b, 35]
      },
      getWidth: 16,
      widthMinPixels: 14,
      widthMaxPixels: 28,
      pickable: false,
    }),

    // ── Network lines — mid halo ──────────────────────────────────────────────
    new LineLayer({
      id: "network-mid",
      data: networkLines,
      getSourcePosition: (d: NetworkLink) => [d.company_lng, d.company_lat],
      getTargetPosition: (d: NetworkLink) => [d.farm_lng, d.farm_lat],
      getColor: (d: NetworkLink) => {
        const [r, g, b] = roleColor(d.role_type)
        return [r, g, b, 90]
      },
      getWidth: 6,
      widthMinPixels: 5,
      widthMaxPixels: 12,
      pickable: false,
    }),

    // ── Network lines — core (bright, narrow) ────────────────────────────────
    new LineLayer({
      id: "network-core",
      data: networkLines,
      getSourcePosition: (d: NetworkLink) => [d.company_lng, d.company_lat],
      getTargetPosition: (d: NetworkLink) => [d.farm_lng, d.farm_lat],
      getColor: (d: NetworkLink) => {
        const [r, g, b] = roleColor(d.role_type)
        return [r, g, b, 255]
      },
      getWidth: 2,
      widthMinPixels: 2,
      widthMaxPixels: 4,
      pickable: false,
    }),

    // ── Company HQ dots ───────────────────────────────────────────────────────
    new ScatterplotLayer({
      id: "companies",
      data: companies,
      getPosition: (d: CompanyPoint) => [d.lng, d.lat],
      getRadius: 9000,
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      getFillColor: (d: CompanyPoint) =>
        selectedCompanyId === d.id ? [255, 200, 50, 255] : [255, 165, 0, 210],
      getLineColor: (d: CompanyPoint) =>
        selectedCompanyId === d.id ? [255, 240, 150, 255] : [255, 200, 50, 200],
      lineWidthMinPixels: 2,
      stroked: true,
      pickable: true,
      updateTriggers: { getFillColor: [selectedCompanyId], getLineColor: [selectedCompanyId] },
      onHover: (info: any) => {
        if (info.object) {
          const c = info.object as CompanyPoint
          setTooltip({ x: info.x, y: info.y, label: `${c.name} · ${c.actor_type}${c.city ? ` · ${c.city}` : ""}` })
        } else setTooltip(null)
      },
      onClick: (info: any) => { if (info.object) handleCompanyClick(info.object) },
    }),
  ]

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <DeckGL
        layers={layers}
        initialViewState={INITIAL_VIEW}
        controller={true}
        onViewStateChange={handleViewStateChange}
        getCursor={({ isDragging, isHovering }: any) =>
          isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
        }
      >
        <Map mapStyle={MAP_STYLE}>
          <NavigationControl position="top-left" />
        </Map>
      </DeckGL>

      {loading && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          background: "rgba(15,20,30,0.85)", color: "#60a5fa",
          fontSize: 11, padding: "5px 10px", borderRadius: 5,
          border: "1px solid rgba(96,165,250,0.2)",
        }}>Loading…</div>
      )}

      {!loading && (
        <div style={{
          position: "absolute", bottom: 24, left: 12,
          background: "rgba(10,15,25,0.75)", color: "#4b5563",
          fontSize: 11, padding: "5px 10px", borderRadius: 5,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", gap: 10,
        }}>
          <span>{farms.length} projects</span>
          {companies.length > 0 && <span>· {companies.length} companies</span>}
          {zoom >= 9 && turbines.length > 0 && <span>· {turbines.length} turbines</span>}
        </div>
      )}

      {/* Role legend — shown only when a company is selected and lines are visible */}
      {hasSelection && networkLines.length > 0 && (
        <div style={{
          position: "absolute", bottom: 24, right: 12,
          background: "rgba(8,12,22,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 7, padding: "10px 14px",
          display: "flex", flexDirection: "column", gap: 5,
          minWidth: 160,
        }}>
          <div style={{ color: "#334155", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
            Relationship
          </div>
          {activeRoles.map(role => {
            const [r, g, b] = roleColor(role)
            return (
              <div key={role} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 24, height: 3,
                  background: `rgb(${r},${g},${b})`,
                  borderRadius: 2, flexShrink: 0,
                  boxShadow: `0 0 6px 1px rgba(${r},${g},${b},0.5)`,
                }} />
                <span style={{ color: "#94a3b8", fontSize: 11 }}>{role}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Static hint when no company selected */}
      {!hasSelection && (
        <div style={{
          position: "absolute", bottom: 24, right: 12,
          background: "rgba(10,15,25,0.75)", color: "#4b5563",
          fontSize: 10, padding: "5px 10px", borderRadius: 5,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffa500", flexShrink: 0, display: "inline-block" }} />
          <span>Developer HQ — click for network</span>
        </div>
      )}

      {tooltip && (
        <div style={{
          position: "absolute",
          left: tooltip.x + 14,
          top: tooltip.y - 44,
          background: "rgba(8,12,22,0.96)",
          color: "#e2e8f0",
          padding: "7px 12px",
          borderRadius: 6,
          fontSize: 12,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          zIndex: 10,
        }}>
          {tooltip.label}
        </div>
      )}
    </div>
  )
}

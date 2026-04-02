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
  onSelectCompany: (company: CompanyPoint | null) => void
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

  // Initial loads
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

  async function handleFarmClick(farm: WindFarmPoint) {
    setSelectedCompanyId(null)
    setNetworkLines([])
    onSelectCompany(null)
    try {
      const res = await fetch(`/api/wind-farms/${farm.id}`)
      if (res.ok) onSelectFarm(await res.json())
    } catch { /* ignore */ }
  }

  async function handleCompanyClick(company: CompanyPoint) {
    if (selectedCompanyId === company.id) {
      setSelectedCompanyId(null)
      setNetworkLines([])
      onSelectCompany(null)
      return
    }
    setSelectedCompanyId(company.id)
    // Do NOT call onSelectFarm here — it would clear selectedCompany in page.tsx
    onSelectCompany(company)
    try {
      const res = await fetch(`/api/companies/${company.id}/network`)
      if (res.ok) {
        const data = await res.json()
        // Filter out any links with missing coordinates to prevent deck.gl crash
        const validLinks = (data.links ?? []).filter(
          (l: NetworkLink) =>
            l.company_lng != null && l.company_lat != null &&
            l.farm_lng    != null && l.farm_lat    != null
        )
        setNetworkLines(validLinks)
      }
    } catch { /* ignore */ }
  }

  const highlightedFarmIds = new Set(networkLines.map(l => l.farm_id))

  const layers = [
    new GeoJsonLayer({
      id: "farm-polygons",
      data: { type: "FeatureCollection" as const, features: polygons },
      visible: zoom >= 6,
      filled: true,
      stroked: true,
      getFillColor: (f: any) => {
        const [r, g, b] = statusColor(f.properties.status_current)
        return [r, g, b, 28]
      },
      getLineColor: (f: any) => {
        const [r, g, b] = statusColor(f.properties.status_current)
        return [r, g, b, 100]
      },
      lineWidthMinPixels: 1,
      pickable: false,
    }),

    new LineLayer<NetworkLink>({
      id: "company-network",
      data: networkLines,
      getSourcePosition: (d: NetworkLink) => [d.company_lng, d.company_lat],
      getTargetPosition: (d: NetworkLink) => [d.farm_lng, d.farm_lat],
      getColor: [255, 200, 50, 140],
      getWidth: 1.5,
      widthMinPixels: 1,
      pickable: false,
    }),

    new ScatterplotLayer<WindFarmPoint>({
      id: "windfarms",
      data: farms,
      getPosition: (d: WindFarmPoint) => [d.lng, d.lat],
      getRadius: (d: WindFarmPoint) => Math.max(5000, Math.min(22000, (d.capacity_mw ?? 60) * 12)),
      getFillColor: (d: WindFarmPoint) => {
        if (highlightedFarmIds.has(d.id)) return [255, 220, 60, 255]
        return statusColor(d.status_current)
      },
      getLineColor: (d: WindFarmPoint) => highlightedFarmIds.has(d.id) ? [255, 200, 50, 255] : [255, 255, 255, 30],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      radiusMinPixels: 3,
      radiusMaxPixels: zoom >= 9 ? 8 : 18,
      updateTriggers: { getFillColor: [selectedCompanyId], getLineColor: [selectedCompanyId] },
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

    new ScatterplotLayer<TurbinePoint>({
      id: "turbines",
      data: turbines,
      visible: zoom >= 9,
      getPosition: (d: TurbinePoint) => [d.lng, d.lat],
      getRadius: 120,
      radiusMinPixels: 2,
      radiusMaxPixels: 5,
      getFillColor: [180, 220, 255, 180],
      pickable: false,
    }),

    new ScatterplotLayer<CompanyPoint>({
      id: "companies",
      data: companies,
      getPosition: (d: CompanyPoint) => [d.lng, d.lat],
      getRadius: 9000,
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      getFillColor: (d: CompanyPoint) => selectedCompanyId === d.id ? [255, 200, 50, 255] : [255, 165, 0, 210],
      getLineColor: (d: CompanyPoint) => selectedCompanyId === d.id ? [255, 240, 150, 255] : [255, 200, 50, 200],
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

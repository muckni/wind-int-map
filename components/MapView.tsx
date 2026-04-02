"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre"
import type { CompanyPoint, NetworkLink, TurbinePoint, WindFarmDetail, WindFarmPoint } from "../lib/types"

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

const STATUS_COLORS: Record<string, string> = {
  operational: "rgba(52,211,153,0.92)",
  "under construction": "rgba(251,191,36,0.92)",
  planned: "rgba(96,165,250,0.9)",
  decommissioned: "rgba(107,114,128,0.8)",
  unknown: "rgba(148,163,184,0.8)",
}

const STATUS_FILL_FAINT: Record<string, string> = {
  operational: "rgba(52,211,153,0.13)",
  "under construction": "rgba(251,191,36,0.13)",
  planned: "rgba(96,165,250,0.12)",
  decommissioned: "rgba(107,114,128,0.1)",
  unknown: "rgba(148,163,184,0.1)",
}

const ROLE_COLORS: Record<string, string> = {
  developer: "rgba(34,211,238,1)",
  owner: "rgba(52,211,153,1)",
  "equity partner": "rgba(45,212,191,1)",
  operator: "rgba(167,139,250,1)",
  offtaker: "rgba(251,191,36,1)",
  "ppa counterparty": "rgba(251,191,36,1)",
  cfd: "rgba(96,165,250,1)",
  "corporate ppa": "rgba(251,191,36,1)",
  "utility offtake": "rgba(251,191,36,1)",
  "feed-in tariff": "rgba(251,146,60,1)",
  merchant: "rgba(248,113,113,1)",
  "green certificate": "rgba(163,230,53,1)",
  "construction contractor": "rgba(148,163,184,1)",
  // EPC roles
  "mp fabricator":          "rgba(251,113,133,1)",  // rose
  "tp fabricator":          "rgba(244,114,182,1)",  // pink
  "jacket fabricator":      "rgba(232,121,249,1)",  // fuchsia
  "foundation fabricator":  "rgba(251,113,133,1)",  // rose
  "foundation installer":   "rgba(248,165,90,1)",   // orange
  "iac supplier":           "rgba(52,211,153,1)",   // green (same as owner)
  "iac installer":          "rgba(34,197,94,1)",    // green-600
  "export cable supplier":  "rgba(45,212,191,1)",   // teal
  "export cable installer": "rgba(20,184,166,1)",   // teal-600
  "wtg oem":                "rgba(139,92,246,1)",   // violet
  "wtg installer":          "rgba(167,139,250,1)",  // violet-400
  "epc contractor":         "rgba(251,191,36,1)",   // amber
  other: "rgba(100,116,139,1)",
  unknown: "rgba(100,116,139,1)",
}

function statusColor(s: string): string {
  return STATUS_COLORS[s?.toLowerCase()] ?? STATUS_COLORS.unknown
}

function statusFillFaint(s: string): string {
  return STATUS_FILL_FAINT[s?.toLowerCase()] ?? STATUS_FILL_FAINT.unknown
}

function roleColor(role: string): string {
  return ROLE_COLORS[role?.toLowerCase()] ?? ROLE_COLORS.unknown
}

function approxBbox(vs: { longitude: number; latitude: number; zoom: number }): [number, number, number, number] {
  const span = (360 / Math.pow(2, vs.zoom)) * 1.5
  return [
    Math.max(-180, vs.longitude - span),
    Math.max(-85, vs.latitude - span * 0.7),
    Math.min(180, vs.longitude + span),
    Math.min(85, vs.latitude + span * 0.7),
  ]
}

const INITIAL_VIEW = { longitude: 5, latitude: 54, zoom: 4.5 }

interface Props {
  onSelectFarm: (farm: WindFarmDetail | null) => void
  onSelectCompany: (company: CompanyPoint | null, links?: NetworkLink[]) => void
  statusFilter: Set<string>
}

export default function MapView({ onSelectFarm, onSelectCompany, statusFilter }: Props) {
  const [allFarms, setAllFarms] = useState<WindFarmPoint[]>([])
  const [turbines, setTurbines] = useState<TurbinePoint[]>([])
  const [companies, setCompanies] = useState<CompanyPoint[]>([])
  const [polygons, setPolygons] = useState<GeoJSON.Feature[]>([])
  const [networkLines, setNetworkLines] = useState<NetworkLink[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)

  const mapRef = useRef<MapRef | null>(null)
  const turbineTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetch("/api/wind-farms?bbox=-180,-85,180,85&limit=2000")
      .then((r) => r.json())
      .then((j) => {
        setAllFarms(j.data ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch("/api/companies?with_location=true")
      .then((r) => r.json())
      .then((j) => setCompanies(j.data ?? []))
      .catch(() => {})

    fetch("/api/wind-farm-polygons?bbox=-180,-85,180,85")
      .then((r) => r.json())
      .then((j) => setPolygons(j.features ?? []))
      .catch(() => {})
  }, [])

  function handleMove(vs: { longitude: number; latitude: number; zoom: number }) {
    setViewState(vs)
    clearTimeout(turbineTimerRef.current)

    if (vs.zoom >= 10) {
      turbineTimerRef.current = setTimeout(() => {
        const bbox = approxBbox(vs)
        fetch(`/api/turbines?bbox=${bbox.join(",")}`)
          .then((r) => r.json())
          .then((j) => setTurbines(j.data ?? []))
          .catch(() => {})
      }, 280)
    } else if (vs.zoom < 9) {
      setTurbines([])
    }
  }

  const farms = statusFilter.size === 0
    ? allFarms
    : allFarms.filter((d) => statusFilter.has(d.status_current?.toLowerCase()))

  const zoom = viewState.zoom ?? INITIAL_VIEW.zoom
  const hasSelection = selectedCompanyId !== null || networkLines.length > 0
  const companyById = useMemo(
    () => new globalThis.Map(companies.map((c) => [c.id, c])),
    [companies]
  )

  async function handleFarmClick(farm: WindFarmPoint) {
    setSelectedCompanyId(null)
    setHoveredLineId(null)
    onSelectCompany(null, [])
    try {
      const res = await fetch(`/api/wind-farms/${farm.id}`)
      if (!res.ok) return
      const detail = await res.json()
      onSelectFarm(detail)

      const lines: NetworkLink[] = []
      const pushLine = (
        companyId: string | null | undefined,
        roleType: string | null | undefined,
        equitySharePct: number | null | undefined
      ) => {
        if (!companyId) return
        const c = companyById.get(companyId)
        if (!c) return
        if (!Number.isFinite(c.lng) || !Number.isFinite(c.lat)) return
        lines.push({
          farm_id: farm.id,
          farm_name: farm.name,
          status_current: farm.status_current,
          capacity_mw: Number(farm.capacity_mw) || null,
          country_code: farm.country_code,
          farm_lng: farm.lng,
          farm_lat: farm.lat,
          role_type: roleType ?? "unknown",
          equity_share_pct: equitySharePct ?? null,
          company_lng: c.lng,
          company_lat: c.lat,
        })
      }

      pushLine(detail?.wind_farm?.developer_company_id, "developer", null)

      for (const o of detail?.ownership ?? []) {
        pushLine(o.company_id, o.role_type, o.equity_share_pct)
      }
      for (const ct of detail?.contracts ?? []) {
        pushLine(ct.counterparty_company_id, ct.contract_type, null)
      }
      for (const e of detail?.epc ?? []) {
        pushLine(e.company_id, e.role_type, null)
      }

      const dedupe = new Set<string>()
      const uniqueLines = lines.filter((l) => {
        const key = `${l.farm_id}|${l.company_lng}|${l.company_lat}|${l.role_type}|${l.equity_share_pct ?? ""}`
        if (dedupe.has(key)) return false
        dedupe.add(key)
        return true
      })
      setNetworkLines(uniqueLines)
    } catch {
      // ignore
    }
  }

  const handleCompanyClick = useCallback(async (company: CompanyPoint) => {
    if (selectedCompanyId === company.id) {
      setSelectedCompanyId(null)
      setNetworkLines([])
      setHoveredLineId(null)
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
            Number.isFinite(l.company_lng) &&
            Number.isFinite(l.company_lat) &&
            Number.isFinite(l.farm_lng) &&
            Number.isFinite(l.farm_lat) &&
            Math.abs(Number(l.company_lng)) <= 180 &&
            Math.abs(Number(l.farm_lng)) <= 180 &&
            Math.abs(Number(l.company_lat)) <= 85 &&
            Math.abs(Number(l.farm_lat)) <= 85
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
  }, [selectedCompanyId, onSelectCompany])

  const highlightedFarmIds = useMemo(
    () => new Set(networkLines.map((l) => l.farm_id)),
    [networkLines]
  )

  useEffect(() => {
    const companyId = new URLSearchParams(window.location.search).get("companyId")
    if (!companyId || companies.length === 0 || selectedCompanyId === companyId) return
    const company = companies.find((c) => c.id === companyId)
    if (company) void handleCompanyClick(company)
  }, [companies, selectedCompanyId, handleCompanyClick])

  const activeRoles = Array.from(new Set(networkLines.map((l) => l.role_type?.toLowerCase()).filter(Boolean)))

  const farmGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: farms
      .filter((f) => Number.isFinite(f.lng) && Number.isFinite(f.lat))
      .map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lng, f.lat] },
        properties: {
          id: f.id,
          name: f.name,
          country_code: f.country_code,
          status_current: f.status_current,
          capacity_mw: f.capacity_mw,
          highlighted: highlightedFarmIds.has(f.id),
        },
      })),
  }), [farms, highlightedFarmIds])

  const companyGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: companies
      .filter((c) => Number.isFinite(c.lng) && Number.isFinite(c.lat))
      .map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          name: c.name,
          actor_type: c.actor_type,
          city: c.city,
          selected: selectedCompanyId === c.id,
        },
      })),
  }), [companies, selectedCompanyId])

  const turbineGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: turbines
      .filter((t) => Number.isFinite(t.lng) && Number.isFinite(t.lat))
      .map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lng, t.lat] },
        properties: { id: t.id },
      })),
  }), [turbines])

  const polygonGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: polygons,
  }), [polygons])

  const networkGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: networkLines
      .filter((l) =>
        Number.isFinite(l.company_lng) &&
        Number.isFinite(l.company_lat) &&
        Number.isFinite(l.farm_lng) &&
        Number.isFinite(l.farm_lat)
      )
      .map((l, i) => {
        const id = `${l.farm_id}-${i}`
        return {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [l.company_lng, l.company_lat],
              [l.farm_lng, l.farm_lat],
            ],
          },
          properties: {
            id,
            role_type: l.role_type,
            color: roleColor(l.role_type),
            hovered: hoveredLineId === id,
          },
        }
      }),
  }), [networkLines, hoveredLineId])

  function onMapMove(event: any) {
    const vs = event.viewState
    handleMove({ longitude: vs.longitude, latitude: vs.latitude, zoom: vs.zoom })
  }

  function onMapMouseMove(event: MapLayerMouseEvent) {
    const feature = event.features?.[0]
    if (!feature) {
      setTooltip(null)
      setHoveredLineId(null)
      return
    }

    const layerId = (feature as any).layer?.id as string | undefined
    const p = feature.properties as Record<string, any>

    if (layerId === "network-core") {
      setHoveredLineId(p.id ? String(p.id) : null)
      setTooltip({ x: event.point.x, y: event.point.y, label: `${p.role_type ?? "relationship"}` })
      return
    }

    setHoveredLineId(null)

    if (
      layerId === "farms-symbol" ||
      layerId === "farms-circle" ||
      layerId === "farm-polygons-fill" ||
      layerId === "farm-polygons-line"
    ) {
      const label = `${p.name} · ${p.country_code}${p.capacity_mw != null ? ` · ${p.capacity_mw} MW` : ""} · ${p.status_current}`
      setTooltip({ x: event.point.x, y: event.point.y, label })
      return
    }

    if (layerId === "companies-circle" || layerId === "offtakers-symbol") {
      const label = `${p.name} · ${p.actor_type}${p.city ? ` · ${p.city}` : ""}`
      setTooltip({ x: event.point.x, y: event.point.y, label })
      return
    }

    setTooltip(null)
  }

  function onMapClick(event: MapMouseEvent) {
    const layerEvent = event as unknown as MapLayerMouseEvent
    const feature = layerEvent.features?.[0]
    if (!feature) return

    const p = feature.properties as Record<string, any>
    const layerId = (feature as any).layer?.id as string | undefined

    if (
      layerId === "farms-symbol" ||
      layerId === "farms-circle" ||
      layerId === "farm-polygons-fill" ||
      layerId === "farm-polygons-line"
    ) {
      const farm = farms.find((f) => f.id === p.id)
      if (farm) void handleFarmClick(farm)
      return
    }

    if (layerId === "companies-circle" || layerId === "offtakers-symbol") {
      const company = companies.find((c) => c.id === p.id)
      if (company) void handleCompanyClick(company)
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Map
        ref={mapRef}
        mapStyle={MAP_STYLE}
        longitude={viewState.longitude}
        latitude={viewState.latitude}
        zoom={viewState.zoom}
        onMove={onMapMove}
        onMouseMove={onMapMouseMove}
        onClick={onMapClick}
        interactiveLayerIds={["farm-polygons-fill", "farm-polygons-line", "farms-symbol", "farms-circle", "companies-circle", "offtakers-symbol", "network-core"]}
        cursor={tooltip ? "pointer" : "grab"}
      >
        <NavigationControl position="top-left" />

        <Source id="farm-polygons" type="geojson" data={polygonGeoJson}>
          <Layer
            id="farm-polygons-fill"
            type="fill"
            minzoom={5}
            paint={{
              "fill-color": [
                "match",
                ["downcase", ["to-string", ["get", "status_current"]]],
                "operational", statusFillFaint("operational"),
                "under construction", statusFillFaint("under construction"),
                "planned", statusFillFaint("planned"),
                "decommissioned", statusFillFaint("decommissioned"),
                statusFillFaint("unknown"),
              ],
              "fill-opacity": hasSelection ? 0.35 : 0.95,
            }}
          />
          <Layer
            id="farm-polygons-line"
            type="line"
            minzoom={4.5}
            paint={{
              "line-color": [
                "match",
                ["downcase", ["to-string", ["get", "status_current"]]],
                "operational", statusColor("operational"),
                "under construction", statusColor("under construction"),
                "planned", statusColor("planned"),
                "decommissioned", statusColor("decommissioned"),
                statusColor("unknown"),
              ],
              "line-width": 2.1,
              "line-opacity": hasSelection ? 0.35 : 0.78,
            }}
          />
        </Source>

        <Source id="farms" type="geojson" data={farmGeoJson}>
          <Layer
            id="farms-launch-circle"
            type="circle"
            minzoom={3}
            maxzoom={9}
            paint={{
              "circle-color": "rgba(59,130,246,0.35)",
              "circle-stroke-color": "rgba(255,255,255,0.92)",
              "circle-stroke-width": 1.5,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 7, 8.9, 8.5],
              "circle-opacity": hasSelection ? 0.35 : 0.95,
            }}
          />
          <Layer
            id="farms-symbol"
            type="symbol"
            minzoom={3}
            maxzoom={9}
            layout={{
              "text-field": "🌀",
              "text-size": ["interpolate", ["linear"], ["zoom"], 3, 12, 8.9, 16],
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "rgba(191,219,254,1)",
              "text-halo-color": "rgba(8,15,30,0.95)",
              "text-halo-width": 2.3,
              "text-opacity": hasSelection ? 0.3 : 0.95,
            }}
          />
          <Layer
            id="farms-circle"
            type="circle"
            minzoom={9}
            paint={{
              "circle-color": [
                "case",
                ["==", ["get", "highlighted"], true],
                "rgba(255,240,80,1)",
                [
                  "match",
                  ["downcase", ["to-string", ["get", "status_current"]]],
                  "operational", statusColor("operational"),
                  "under construction", statusColor("under construction"),
                  "planned", statusColor("planned"),
                  "decommissioned", statusColor("decommissioned"),
                  statusColor("unknown"),
                ],
              ],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "highlighted"], true],
                "rgba(255,255,220,1)",
                "rgba(255,255,255,0.55)",
              ],
              "circle-stroke-width": ["case", ["==", ["get", "highlighted"], true], 2.5, 1.2],
              "circle-opacity": hasSelection ? 0.25 : 0.9,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 10, 7, 12, 10],
            }}
          />
        </Source>

        <Source id="turbines" type="geojson" data={turbineGeoJson}>
          <Layer
            id="turbines-circle"
            type="circle"
            minzoom={10}
            paint={{
              "circle-color": hasSelection ? "rgba(180,220,255,0.3)" : "rgba(180,220,255,0.9)",
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 12, 3.8],
            }}
          />
        </Source>

        {networkGeoJson.features.length > 0 && (
          <Source id="network" type="geojson" data={networkGeoJson}>
            <Layer
              id="network-glow"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": ["case", ["==", ["get", "hovered"], true], 14, 10],
                "line-opacity": 0.55,
                "line-blur": 0.4,
              }}
            />
            <Layer
              id="network-mid"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": ["case", ["==", ["get", "hovered"], true], 8, 6],
                "line-opacity": 0.78,
              }}
            />
            <Layer
              id="network-core"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": ["case", ["==", ["get", "hovered"], true], 4, 3],
                "line-opacity": 0.92,
              }}
            />
          </Source>
        )}

        <Source id="companies" type="geojson" data={companyGeoJson}>
          <Layer
            id="companies-circle"
            type="circle"
            filter={["!=", ["downcase", ["to-string", ["get", "actor_type"]]], "offtaker"]}
            paint={{
              "circle-color": ["case", ["==", ["get", "selected"], true], "rgba(56,189,248,1)", "rgba(56,189,248,0.8)"],
              "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "rgba(186,230,253,1)", "rgba(186,230,253,0.85)"],
              "circle-stroke-width": 2,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 6, 9, 9],
              "circle-opacity": hasSelection ? 0.3 : 0.95,
            }}
          />
          <Layer
            id="offtakers-symbol"
            type="symbol"
            filter={["==", ["downcase", ["to-string", ["get", "actor_type"]]], "offtaker"]}
            layout={{
              "text-field": "⚡",
              "text-size": ["interpolate", ["linear"], ["zoom"], 3, 12, 9, 16],
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "rgba(250,204,21,1)",
              "text-halo-color": "rgba(25,22,10,0.95)",
              "text-halo-width": 1.5,
              "text-opacity": hasSelection ? 0.35 : 1,
            }}
          />
        </Source>
      </Map>

      {loading && (
        <div style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(15,20,30,0.85)",
          color: "#60a5fa",
          fontSize: 11,
          padding: "5px 10px",
          borderRadius: 5,
          border: "1px solid rgba(96,165,250,0.2)",
        }}>
          Loading…
        </div>
      )}

      {!loading && (
        <div style={{
          position: "absolute",
          bottom: 24,
          left: 12,
          background: "rgba(10,15,25,0.78)",
          color: "#4b5563",
          fontSize: 11,
          padding: "5px 10px",
          borderRadius: 5,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          gap: 10,
        }}>
          <span>{farms.length} projects</span>
          {companies.length > 0 && <span>· {companies.length} companies</span>}
          {zoom >= 10 && turbines.length > 0 && <span>· {turbines.length} turbines</span>}
        </div>
      )}

      {hasSelection && networkLines.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: 24,
          right: 12,
          background: "rgba(8,12,22,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 7,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          minWidth: 180,
        }}>
          <div style={{ color: "#334155", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
            Relationship
          </div>
          {activeRoles.map((role) => {
            const c = roleColor(role)
            return (
              <div key={role} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 24, height: 3, background: c, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ color: "#94a3b8", fontSize: 11 }}>{role}</span>
              </div>
            )
          })}
        </div>
      )}

      {!hasSelection && (
        <div style={{
          position: "absolute",
          bottom: 24,
          right: 12,
          background: "rgba(10,15,25,0.75)",
          color: "#64748b",
          fontSize: 10,
          padding: "5px 10px",
          borderRadius: 5,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span>🌀 Wind Farms</span>
          <span>● Companies</span>
          <span>⚡ Offtakers</span>
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

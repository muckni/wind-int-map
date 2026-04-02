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
  operational: "rgba(52,211,153,0.96)",
  "under construction": "rgba(251,191,36,0.95)",
  planned: "rgba(96,165,250,0.95)",
  decommissioned: "rgba(107,114,128,0.86)",
  unknown: "rgba(148,163,184,0.86)",
}

const STATUS_FILL_FAINT: Record<string, string> = {
  operational: "rgba(52,211,153,0.18)",
  "under construction": "rgba(251,191,36,0.18)",
  planned: "rgba(96,165,250,0.17)",
  decommissioned: "rgba(107,114,128,0.14)",
  unknown: "rgba(148,163,184,0.13)",
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
  "mp fabricator": "rgba(251,113,133,1)",
  "tp fabricator": "rgba(244,114,182,1)",
  "jacket fabricator": "rgba(232,121,249,1)",
  "foundation fabricator": "rgba(251,113,133,1)",
  "foundation installer": "rgba(248,165,90,1)",
  "iac supplier": "rgba(52,211,153,1)",
  "iac installer": "rgba(34,197,94,1)",
  "export cable supplier": "rgba(45,212,191,1)",
  "export cable installer": "rgba(20,184,166,1)",
  "wtg oem": "rgba(139,92,246,1)",
  "wtg installer": "rgba(167,139,250,1)",
  "epc contractor": "rgba(251,191,36,1)",
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

function isFiniteLngLat(lng: unknown, lat: unknown) {
  const a = Number(lng)
  const b = Number(lat)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 180 && Math.abs(b) <= 85
}

function approxBbox(vs: { longitude: number; latitude: number; zoom: number }): [number, number, number, number] {
  const span = (360 / Math.pow(2, vs.zoom)) * 1.25
  return [
    Math.max(-180, vs.longitude - span),
    Math.max(-85, vs.latitude - span * 0.7),
    Math.min(180, vs.longitude + span),
    Math.min(85, vs.latitude + span * 0.7),
  ]
}

function spreadPoint(lng: number, lat: number, index: number): [number, number] {
  if (index === 0) return [lng, lat]

  const angle = index * 2.399963229728653
  const radius = 0.045 * Math.sqrt(index)
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2)

  return [
    Number((lng + (Math.cos(angle) * radius) / cosLat).toFixed(4)),
    Number((lat + Math.sin(angle) * radius).toFixed(4)),
  ]
}

function normalizeLinks(rawLinks: unknown[]): NetworkLink[] {
  const dedupe = new Set<string>()
  const out: NetworkLink[] = []

  for (const x of rawLinks) {
    const r = x as Record<string, unknown>
    if (!r?.company_id || !r?.farm_id) continue
    if (!isFiniteLngLat(r.company_lng, r.company_lat) || !isFiniteLngLat(r.farm_lng, r.farm_lat)) continue

    const link: NetworkLink = {
      company_id: String(r.company_id),
      company_name: String(r.company_name ?? "Unknown"),
      farm_id: String(r.farm_id),
      farm_name: String(r.farm_name ?? "Unknown"),
      status_current: String(r.status_current ?? "unknown"),
      capacity_mw: r.capacity_mw == null ? null : Number(r.capacity_mw),
      country_code: String(r.country_code ?? ""),
      farm_lng: Number(r.farm_lng),
      farm_lat: Number(r.farm_lat),
      role_type: String(r.role_type ?? "unknown"),
      equity_share_pct: r.equity_share_pct == null ? null : Number(r.equity_share_pct),
      company_lng: Number(r.company_lng),
      company_lat: Number(r.company_lat),
    }

    const key = `${link.company_id}|${link.farm_id}|${link.role_type.toLowerCase()}|${link.equity_share_pct ?? ""}`
    if (dedupe.has(key)) continue
    dedupe.add(key)
    out.push(link)
  }

  return out
}

const INITIAL_VIEW = { longitude: 5, latitude: 54, zoom: 4.5 }

interface Props {
  onSelectFarm: (farm: WindFarmDetail | null) => void
  onSelectCompany: (company: CompanyPoint | null, links?: NetworkLink[]) => void
  statusFilter: Set<string>
  hideIncomplete: boolean
  activeSelectionId: string | null
}

export default function MapView({ onSelectFarm, onSelectCompany, statusFilter, hideIncomplete, activeSelectionId }: Props) {
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
    let active = true
    fetch("/api/companies?with_location=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!active) return
        const rows = (Array.isArray(j.data) ? j.data : []).filter((c: CompanyPoint) => isFiniteLngLat(c.lng, c.lat))
        setCompanies(rows)
      })
      .catch(() => {})

    fetch("/api/wind-farm-polygons?bbox=-180,-85,180,85", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!active) return
        setPolygons(Array.isArray(j.features) ? j.features : [])
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({
      bbox: "-180,-85,180,85",
      limit: "2500",
    })

    if (hideIncomplete) {
      params.set("hide_incomplete", "true")
    }

    setLoading(true)

    fetch(`/api/wind-farms?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!active) return
        const rows = Array.isArray(j.data) ? j.data : []
        setAllFarms(rows.filter((f: WindFarmPoint) => isFiniteLngLat(f.lng, f.lat)))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      clearTimeout(turbineTimerRef.current)
    }
  }, [hideIncomplete])

  function handleMove(vs: { longitude: number; latitude: number; zoom: number }) {
    setViewState(vs)
    clearTimeout(turbineTimerRef.current)

    if (vs.zoom >= 9.8) {
      turbineTimerRef.current = setTimeout(() => {
        const bbox = approxBbox(vs)
        fetch(`/api/turbines?bbox=${bbox.join(",")}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((j) => {
            const rows = Array.isArray(j.data) ? j.data : []
            setTurbines(rows.filter((t: TurbinePoint) => isFiniteLngLat(t.lng, t.lat)))
          })
          .catch(() => {})
      }, 260)
    } else if (vs.zoom < 9.3) {
      setTurbines([])
    }
  }

  const farms = useMemo(
    () => (statusFilter.size === 0
      ? allFarms
      : allFarms.filter((d) => statusFilter.has(d.status_current?.toLowerCase()))),
    [allFarms, statusFilter]
  )

  const visibleFarmIds = useMemo(
    () => new Set(farms.map((farm) => farm.id)),
    [farms]
  )

  const zoom = viewState.zoom ?? INITIAL_VIEW.zoom
  const hasSelection = selectedCompanyId !== null || networkLines.length > 0

  const companyById = useMemo(
    () => new globalThis.Map(companies.map((c) => [c.id, c])),
    [companies]
  )

  const highlightedFarmIds = useMemo(
    () => new Set(networkLines.map((l) => l.farm_id)),
    [networkLines]
  )

  const relatedCompanyIds = useMemo(
    () => new Set(networkLines.map((l) => l.company_id)),
    [networkLines]
  )

  const activeRoles = useMemo(
    () => Array.from(new Set(networkLines.map((l) => l.role_type?.toLowerCase()).filter(Boolean))),
    [networkLines]
  )

  async function handleFarmClick(farm: WindFarmPoint) {
    setSelectedCompanyId(null)
    setHoveredLineId(null)
    onSelectCompany(null, [])

    try {
      const res = await fetch(`/api/wind-farms/${farm.id}`, { cache: "no-store" })
      if (!res.ok) return
      const detail = await res.json() as WindFarmDetail & { network_links?: unknown[] }
      onSelectFarm(detail)

      if (Array.isArray(detail.network_links)) {
        const normalized = normalizeLinks(detail.network_links)
        setNetworkLines(normalized)
        return
      }

      const fallbackLinks: NetworkLink[] = []
      const pushLine = (
        companyId: string | null | undefined,
        roleType: string | null | undefined,
        equitySharePct: number | null | undefined
      ) => {
        if (!companyId) return
        const c = companyById.get(companyId)
        if (!c || !isFiniteLngLat(c.lng, c.lat)) return
        fallbackLinks.push({
          company_id: c.id,
          company_name: c.name,
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
      for (const o of detail?.ownership ?? []) pushLine(o.company_id, o.role_type, o.equity_share_pct)
      for (const ct of detail?.contracts ?? []) pushLine(ct.counterparty_company_id, ct.contract_type, null)
      for (const e of detail?.epc ?? []) pushLine(e.company_id, e.role_type, null)

      setNetworkLines(normalizeLinks(fallbackLinks))
    } catch {
      // no-op
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
      const res = await fetch(`/api/companies/${company.id}/network`, { cache: "no-store" })
      if (!res.ok) {
        setNetworkLines([])
        onSelectCompany(company, [])
        return
      }

      const data = await res.json()
      const validLinks = normalizeLinks(Array.isArray(data.links) ? data.links : [])
      setNetworkLines(validLinks)
      onSelectCompany(company, validLinks)
    } catch {
      setNetworkLines([])
      onSelectCompany(company, [])
    }
  }, [selectedCompanyId, onSelectCompany])

  useEffect(() => {
    const companyId = new URLSearchParams(window.location.search).get("companyId")
    if (!companyId || companies.length === 0 || selectedCompanyId === companyId) return
    const company = companies.find((c) => c.id === companyId)
    if (company) void handleCompanyClick(company)
  }, [companies, selectedCompanyId, handleCompanyClick])

  useEffect(() => {
    if (activeSelectionId !== null) return
    setSelectedCompanyId(null)
    setNetworkLines([])
    setHoveredLineId(null)
    setTooltip(null)
  }, [activeSelectionId])

  const farmGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const grouped = new globalThis.Map<string, WindFarmPoint[]>()

    for (const farm of farms) {
      if (!isFiniteLngLat(farm.lng, farm.lat)) continue
      const key = `${farm.lng.toFixed(4)}|${farm.lat.toFixed(4)}`
      const bucket = grouped.get(key)
      if (bucket) {
        bucket.push(farm)
      } else {
        grouped.set(key, [farm])
      }
    }

    return {
      type: "FeatureCollection",
      features: Array.from(grouped.values()).flatMap((group) =>
        group
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .map((farm, index) => {
            const [displayLng, displayLat] =
              group.length > 1 ? spreadPoint(farm.lng, farm.lat, index) : [farm.lng, farm.lat]

            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [displayLng, displayLat] },
              properties: {
                id: farm.id,
                name: farm.name,
                country_code: farm.country_code,
                status_current: farm.status_current,
                capacity_mw: farm.capacity_mw,
                highlighted: highlightedFarmIds.has(farm.id),
              },
            }
          })
      ),
    }
  }, [farms, highlightedFarmIds])

  const polygonGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: polygons
      .filter((feature) => {
        const p = (feature.properties ?? {}) as Record<string, unknown>
        if (!visibleFarmIds.has(String(p.id ?? ""))) return false
        const status = String(p.status_current ?? "").toLowerCase()
        if (statusFilter.size > 0 && !statusFilter.has(status)) return false
        const g = feature.geometry
        return g?.type === "Polygon" || g?.type === "MultiPolygon"
      })
      .map((feature) => {
        const p = (feature.properties ?? {}) as Record<string, unknown>
        return {
          ...feature,
          properties: {
            ...p,
            highlighted: highlightedFarmIds.has(String(p.id ?? "")),
          },
        }
      }),
  }), [polygons, statusFilter, highlightedFarmIds, visibleFarmIds])

  const companyGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: companies
      .filter((c) => isFiniteLngLat(c.lng, c.lat))
      .map((c) => {
        const markerClass = c.marker_class ?? (c.actor_type?.toLowerCase() === "offtaker" ? "offtaker" : "company")
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          properties: {
            id: c.id,
            name: c.name,
            actor_type: c.actor_type,
            city: c.city,
            marker_class: markerClass,
            is_skyborn: String(c.name ?? "").toLowerCase() === "skyborn renewables",
            selected: selectedCompanyId === c.id,
            related: relatedCompanyIds.has(c.id),
            location_source: c.location_source ?? null,
          },
        }
      }),
  }), [companies, selectedCompanyId, relatedCompanyIds])

  const turbineGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: turbines
      .filter((t) => isFiniteLngLat(t.lng, t.lat))
      .map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lng, t.lat] },
        properties: {
          id: t.id,
          wind_farm_id: t.wind_farm_id,
          related: highlightedFarmIds.has(t.wind_farm_id),
        },
      })),
  }), [turbines, highlightedFarmIds])

  const networkGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: networkLines.map((l, i) => {
      const id = `${l.company_id}-${l.farm_id}-${i}`
      const selected = selectedCompanyId ? l.company_id === selectedCompanyId : true
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
          company_id: l.company_id,
          company_name: l.company_name,
          farm_id: l.farm_id,
          farm_name: l.farm_name,
          role_type: l.role_type,
          color: roleColor(l.role_type),
          hovered: hoveredLineId === id,
          selected,
        },
      }
    }),
  }), [networkLines, hoveredLineId, selectedCompanyId])

  const companyCount = companies.filter((c) => c.marker_class !== "epc" && c.marker_class !== "offtaker").length
  const epcCount = companies.filter((c) => c.marker_class === "epc").length
  const offtakerCount = companies.filter((c) => c.marker_class === "offtaker").length

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
      const role = String(p.role_type ?? "relationship")
      const farm = String(p.farm_name ?? "")
      const company = String(p.company_name ?? "")
      setTooltip({ x: event.point.x, y: event.point.y, label: `${company} → ${farm} · ${role}` })
      return
    }

    setHoveredLineId(null)

    if (
      layerId === "farms-symbol" ||
      layerId === "farms-circle" ||
      layerId === "farms-launch-circle" ||
      layerId === "farm-polygons-fill" ||
      layerId === "farm-polygons-line"
    ) {
      const label = `${p.name} · ${p.country_code}${p.capacity_mw != null ? ` · ${p.capacity_mw} MW` : ""} · ${p.status_current}`
      setTooltip({ x: event.point.x, y: event.point.y, label })
      return
    }

    if (
      layerId === "companies-core-circle"
      || layerId === "skyborn-highlight-ring"
      || layerId === "skyborn-label"
    ) {
      const actor = String(p.actor_type ?? "company")
      const city = p.city ? ` · ${p.city}` : ""
      setTooltip({ x: event.point.x, y: event.point.y, label: `${p.name} · ${actor}${city}` })
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
      layerId === "farms-launch-circle" ||
      layerId === "farm-polygons-fill" ||
      layerId === "farm-polygons-line"
    ) {
      const farm = farms.find((f) => f.id === p.id)
      if (farm) void handleFarmClick(farm)
      return
    }

    if (
      layerId === "companies-core-circle"
      || layerId === "skyborn-highlight-ring"
      || layerId === "skyborn-label"
    ) {
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
        interactiveLayerIds={[
          "farm-polygons-fill",
          "farm-polygons-line",
          "farms-symbol",
          "farms-circle",
          "farms-launch-circle",
          "companies-core-circle",
          "skyborn-highlight-ring",
          "skyborn-label",
          "network-core",
        ]}
        cursor={tooltip ? "pointer" : "grab"}
      >
        <NavigationControl position="top-left" />

        <Source id="farm-polygons" type="geojson" data={polygonGeoJson}>
          <Layer
            id="farm-polygons-fill"
            type="fill"
            minzoom={6.8}
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
              "fill-opacity": hasSelection
                ? ["case", ["==", ["get", "highlighted"], true], 0.45, 0.08]
                : 0.2,
            }}
          />
          <Layer
            id="farm-polygons-line"
            type="line"
            minzoom={6.8}
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
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                6.8,
                ["case", ["==", ["get", "highlighted"], true], 2.2, 1.4],
                11,
                ["case", ["==", ["get", "highlighted"], true], 3.6, 2.6],
              ],
              "line-opacity": hasSelection
                ? ["case", ["==", ["get", "highlighted"], true], 0.98, 0.24]
                : 0.92,
            }}
          />
        </Source>

        <Source id="farms" type="geojson" data={farmGeoJson}>
          <Layer
            id="farms-launch-circle"
            type="circle"
            minzoom={3}
            maxzoom={8.4}
            paint={{
              "circle-color": "rgba(59,130,246,0.32)",
              "circle-stroke-color": "rgba(255,255,255,0.9)",
              "circle-stroke-width": 1.4,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 7, 8.3, 9],
              "circle-opacity": hasSelection
                ? ["case", ["==", ["get", "highlighted"], true], 0.9, 0.18]
                : 0.9,
            }}
          />
          <Layer
            id="farms-symbol"
            type="symbol"
            minzoom={3}
            maxzoom={8.4}
            layout={{
              "text-field": "🌀",
              "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11.5, 8.3, 16],
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "rgba(191,219,254,1)",
              "text-halo-color": "rgba(8,15,30,0.95)",
              "text-halo-width": 2.2,
              "text-opacity": hasSelection
                ? ["case", ["==", ["get", "highlighted"], true], 1, 0.25]
                : 0.95,
            }}
          />
          <Layer
            id="farms-circle"
            type="circle"
            minzoom={8.2}
            maxzoom={11.2}
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
              "circle-stroke-width": ["case", ["==", ["get", "highlighted"], true], 2.4, 1.2],
              "circle-opacity": hasSelection
                ? ["case", ["==", ["get", "highlighted"], true], 0.98, 0.16]
                : 0.88,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.2, 4.2, 10.8, 8.5],
            }}
          />
        </Source>

        <Source id="turbines" type="geojson" data={turbineGeoJson}>
          <Layer
            id="turbines-circle"
            type="circle"
            minzoom={9.8}
            paint={{
              "circle-color": "rgba(180,220,255,0.95)",
              "circle-opacity": hasSelection
                ? ["case", ["==", ["get", "related"], true], 0.92, 0.06]
                : 0.86,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9.8, 1.5, 12, 3.6],
            }}
          />
        </Source>

        <Source id="companies" type="geojson" data={companyGeoJson}>
          <Layer
            id="companies-core-circle"
            type="circle"
            paint={{
              "circle-color": [
                "match",
                ["to-string", ["get", "marker_class"]],
                "offtaker", "rgba(250,204,21,1)",
                "epc", "rgba(251,146,60,1)",
                "rgba(56,189,248,0.95)",
              ],
              "circle-stroke-color": "rgba(255,255,255,0.95)",
              "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 2.8, 1.8],
              "circle-radius": [
                "case",
                ["==", ["get", "selected"], true],
                10,
                ["==", ["get", "related"], true],
                8,
                ["==", ["to-string", ["get", "marker_class"]], "offtaker"],
                8,
                ["==", ["to-string", ["get", "marker_class"]], "epc"],
                7,
                6,
              ],
              "circle-opacity": hasSelection
                ? [
                    "case",
                    ["==", ["get", "selected"], true], 1,
                    ["==", ["get", "related"], true], 0.98,
                    0.16,
                  ]
                : 0.94,
            }}
          />

          <Layer
            id="skyborn-highlight-ring"
            type="circle"
            filter={[
              "all",
              ["==", ["get", "is_skyborn"], true],
            ]}
            paint={{
              "circle-color": "rgba(37,99,235,0.2)",
              "circle-stroke-color": "rgba(191,219,254,1)",
              "circle-stroke-width": 2.4,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 18],
              "circle-opacity": 1,
            }}
          />
          <Layer
            id="skyborn-label"
            type="symbol"
            filter={[
              "all",
              ["==", ["get", "is_skyborn"], true],
            ]}
            minzoom={4}
            layout={{
              "text-field": "Skyborn",
              "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 9, 15],
              "text-offset": [0, -1.4],
              "text-anchor": "bottom",
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "rgba(219,234,254,1)",
              "text-halo-color": "rgba(15,23,42,0.95)",
              "text-halo-width": 1.8,
              "text-opacity": 1,
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
                "line-width": [
                  "case",
                  ["==", ["get", "hovered"], true], 9,
                  ["==", ["get", "selected"], true], 8,
                  5,
                ],
                "line-opacity": [
                  "case",
                  ["==", ["get", "selected"], true], 0.62,
                  selectedCompanyId ? 0.16 : 0.44,
                ],
                "line-blur": 0.55,
              }}
            />
            <Layer
              id="network-mid"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": [
                  "case",
                  ["==", ["get", "hovered"], true], 4.8,
                  ["==", ["get", "selected"], true], 3.8,
                  2.5,
                ],
                "line-opacity": [
                  "case",
                  ["==", ["get", "selected"], true], 0.92,
                  selectedCompanyId ? 0.35 : 0.76,
                ],
              }}
            />
            <Layer
              id="network-core"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": [
                  "case",
                  ["==", ["get", "hovered"], true], 3,
                  ["==", ["get", "selected"], true], 2.3,
                  1.6,
                ],
                "line-opacity": [
                  "case",
                  ["==", ["get", "selected"], true], 1,
                  selectedCompanyId ? 0.5 : 0.94,
                ],
              }}
            />
          </Source>
        )}
      </Map>

      {loading && (
        <div style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(15,20,30,0.86)",
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
          {companyCount > 0 && <span>· {companyCount} companies</span>}
          {epcCount > 0 && <span>· {epcCount} EPC</span>}
          {offtakerCount > 0 && <span>· {offtakerCount} offtakers</span>}
          {zoom >= 9.8 && turbines.length > 0 && <span>· {turbines.length} turbines</span>}
        </div>
      )}

      {hasSelection && networkLines.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: 24,
          right: 12,
          background: "rgba(8,12,22,0.93)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 7,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          minWidth: 180,
        }}>
          <div style={{ color: "#334155", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
            Relationships
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
          <span>● EPC</span>
          <span>● Offtakers</span>
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

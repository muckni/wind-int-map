"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "react-map-gl/maplibre"
import type { CompanyPoint, NetworkLink, WindFarmDetail } from "../lib/types"

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

const INITIAL_VIEW = { longitude: 5, latitude: 54, zoom: 4.5 }

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

function buildIdMatchExpression(ids: string[], property = "id") {
  if (ids.length === 0) return ["==", 1, 0] as any[]
  return ["in", ["to-string", ["get", property]], ["literal", ids]] as any[]
}

function buildFarmVisibilityExpression(statusFilter: Set<string>, hideIncomplete: boolean, timelineYear: number | null) {
  const expr: any[] = ["all"]

  if (statusFilter.size > 0) {
    expr.push([
      "in",
      ["downcase", ["to-string", ["coalesce", ["get", "status_current"], "unknown"]]],
      ["literal", Array.from(statusFilter)],
    ])
  }

  if (hideIncomplete) {
    expr.push(["==", ["to-number", ["get", "is_complete"]], 1])
  }

  if (timelineYear !== null) {
    // Show farms where commissioned_date year <= timelineYear, or commissioned_date is null
    expr.push([
      "any",
      ["!", ["has", "commissioned_date"]],
      ["==", ["typeof", ["get", "commissioned_date"]], "null"],
      ["==", ["to-string", ["get", "commissioned_date"]], ""],
      [
        "<=",
        ["to-number", ["slice", ["to-string", ["get", "commissioned_date"]], 0, 4]],
        timelineYear,
      ],
    ])
  }

  return expr
}

function inferMarkerClass(actorType: string | null | undefined, markerClass?: string | null) {
  if (markerClass === "offtaker" || markerClass === "epc" || markerClass === "company") {
    return markerClass
  }

  return actorType?.toLowerCase() === "offtaker" ? "offtaker" : "company"
}

interface Props {
  onSelectFarm: (farm: WindFarmDetail | null) => void
  onSelectCompany: (company: CompanyPoint | null, links?: NetworkLink[]) => void
  statusFilter: Set<string>
  hideIncomplete: boolean
  tileServerUrl: string
  activeSelectionId: string | null
  timelineYear: number | null
}

export default function MapView({ onSelectFarm, onSelectCompany, statusFilter, hideIncomplete, tileServerUrl, activeSelectionId, timelineYear }: Props) {
  const [networkLines, setNetworkLines] = useState<NetworkLink[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)

  const martinBaseUrl = useMemo(() => tileServerUrl.replace(/\/+$/, ""), [tileServerUrl])
  const zoom = viewState.zoom ?? INITIAL_VIEW.zoom
  const hasSelection = selectedCompanyId !== null || networkLines.length > 0

  const highlightedFarmIds = useMemo(
    () => Array.from(new Set(networkLines.map((l) => l.farm_id))),
    [networkLines]
  )

  const relatedCompanyIds = useMemo(
    () => Array.from(new Set(networkLines.map((l) => l.company_id))),
    [networkLines]
  )

  const activeRoles = useMemo(
    () => Array.from(new Set(networkLines.map((l) => l.role_type?.toLowerCase()).filter(Boolean))),
    [networkLines]
  )

  const farmVisibilityFilter: any = useMemo(
    () => buildFarmVisibilityExpression(statusFilter, hideIncomplete, timelineYear),
    [statusFilter, hideIncomplete, timelineYear]
  )

  const highlightedFarmExpr: any = useMemo(
    () => buildIdMatchExpression(highlightedFarmIds),
    [highlightedFarmIds]
  )

  const relatedCompanyExpr: any = useMemo(
    () => buildIdMatchExpression(relatedCompanyIds),
    [relatedCompanyIds]
  )

  const selectedCompanyExpr: any = useMemo(
    () => ["==", ["to-string", ["get", "id"]], selectedCompanyId ?? "__none__"],
    [selectedCompanyId]
  )

  const turbineRelatedExpr: any = useMemo(
    () => buildIdMatchExpression(highlightedFarmIds, "wind_farm_id"),
    [highlightedFarmIds]
  )

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

  async function handleFarmClick(farmId: string) {
    setSelectedCompanyId(null)
    setHoveredLineId(null)
    onSelectCompany(null, [])

    try {
      const res = await fetch(`/api/wind-farms/${farmId}`, { cache: "no-store" })
      if (!res.ok) return
      const detail = await res.json() as WindFarmDetail & { network_links?: unknown[] }
      onSelectFarm(detail)
      setNetworkLines(normalizeLinks(Array.isArray(detail.network_links) ? detail.network_links : []))
    } catch {
      // no-op
    }
  }

  const handleCompanyClick = useCallback(async (
    companyId: string,
    companySeed?: Partial<CompanyPoint> & { marker_class?: string | null }
  ) => {
    if (selectedCompanyId === companyId) {
      setSelectedCompanyId(null)
      setNetworkLines([])
      setHoveredLineId(null)
      onSelectCompany(null, [])
      return
    }

    setSelectedCompanyId(companyId)

    try {
      const res = await fetch(`/api/companies/${companyId}/network`, { cache: "no-store" })
      if (!res.ok) {
        setNetworkLines([])
        if (companySeed?.name && companySeed.actor_type) {
          onSelectCompany({
            id: companyId,
            name: companySeed.name,
            actor_type: companySeed.actor_type,
            hq_country_code: companySeed.hq_country_code ?? null,
            website: companySeed.website ?? null,
            lng: Number(companySeed.lng ?? 0),
            lat: Number(companySeed.lat ?? 0),
            city: companySeed.city ?? null,
            marker_class: inferMarkerClass(companySeed.actor_type, companySeed.marker_class) as CompanyPoint["marker_class"],
            location_source: companySeed.location_source ?? null,
          }, [])
        }
        return
      }

      const data = await res.json()
      const validLinks = normalizeLinks(Array.isArray(data.links) ? data.links : [])
      setNetworkLines(validLinks)

      const companyRow = data.company as Partial<CompanyPoint> | undefined
      if (!companyRow?.id || !companyRow?.name || !companyRow?.actor_type) {
        onSelectCompany(null, validLinks)
        return
      }

      onSelectCompany({
        id: companyRow.id,
        name: companyRow.name,
        actor_type: companyRow.actor_type,
        hq_country_code: companyRow.hq_country_code ?? null,
        website: companyRow.website ?? null,
        lng: Number(companyRow.lng ?? companySeed?.lng ?? 0),
        lat: Number(companyRow.lat ?? companySeed?.lat ?? 0),
        city: companyRow.city ?? companySeed?.city ?? null,
        marker_class: inferMarkerClass(companyRow.actor_type, companySeed?.marker_class) as CompanyPoint["marker_class"],
        location_source: companyRow.location_source ?? companySeed?.location_source ?? null,
      }, validLinks)
    } catch {
      setNetworkLines([])
      onSelectCompany(null, [])
    }
  }, [selectedCompanyId, onSelectCompany])

  useEffect(() => {
    const companyId = new URLSearchParams(window.location.search).get("companyId")
    if (!companyId || selectedCompanyId === companyId) return
    void handleCompanyClick(companyId)
  }, [selectedCompanyId, handleCompanyClick])

  useEffect(() => {
    if (activeSelectionId !== null) return
    setSelectedCompanyId(null)
    setNetworkLines([])
    setHoveredLineId(null)
    setTooltip(null)
  }, [activeSelectionId])

  function onMapMove(event: any) {
    const vs = event.viewState
    setViewState({ longitude: vs.longitude, latitude: vs.latitude, zoom: vs.zoom })
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
      const capacity = p.capacity_mw != null ? Number(p.capacity_mw) : null
      const label = `${p.name} · ${p.country_code}${capacity != null ? ` · ${capacity} MW` : ""} · ${p.status_current}`
      setTooltip({ x: event.point.x, y: event.point.y, label })
      return
    }

    if (
      layerId === "companies-core-circle" ||
      layerId === "skyborn-highlight-ring" ||
      layerId === "skyborn-label"
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
      if (p.id) void handleFarmClick(String(p.id))
      return
    }

    if (
      layerId === "companies-core-circle" ||
      layerId === "skyborn-highlight-ring" ||
      layerId === "skyborn-label"
    ) {
      if (p.id) {
        void handleCompanyClick(String(p.id), {
          id: String(p.id),
          name: String(p.name ?? "Unknown"),
          actor_type: String(p.actor_type ?? "company"),
          hq_country_code: p.hq_country_code ? String(p.hq_country_code) : null,
          website: p.website ? String(p.website) : null,
          lng: event.lngLat.lng,
          lat: event.lngLat.lat,
          city: p.city ? String(p.city) : null,
          marker_class: p.marker_class ? String(p.marker_class) as CompanyPoint["marker_class"] : undefined,
          location_source: p.location_source ? String(p.location_source) as CompanyPoint["location_source"] : null,
        })
      }
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Map
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

        <Source id="farm-polygons" type="vector" url={`${martinBaseUrl}/wind_farm_polygons_tiles`}>
          <Layer
            id="farm-polygons-fill"
            type="fill"
            source-layer="wind_farm_polygons_tiles"
            minzoom={6.8}
            filter={farmVisibilityFilter as any}
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
                ? ["case", highlightedFarmExpr, 0.45, 0.08]
                : 0.2,
            } as any}
          />
          <Layer
            id="farm-polygons-line"
            type="line"
            source-layer="wind_farm_polygons_tiles"
            minzoom={6.8}
            filter={farmVisibilityFilter as any}
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
                ["case", highlightedFarmExpr, 2.2, 1.4],
                11,
                ["case", highlightedFarmExpr, 3.6, 2.6],
              ],
              "line-opacity": hasSelection
                ? ["case", highlightedFarmExpr, 0.98, 0.24]
                : 0.92,
            } as any}
          />
        </Source>

        <Source id="farms" type="vector" url={`${martinBaseUrl}/wind_farm_points_tiles`}>
          <Layer
            id="farms-launch-circle"
            type="circle"
            source-layer="wind_farm_points_tiles"
            minzoom={3}
            maxzoom={8.4}
            filter={farmVisibilityFilter as any}
            paint={{
              "circle-color": "rgba(59,130,246,0.32)",
              "circle-stroke-color": "rgba(255,255,255,0.9)",
              "circle-stroke-width": 1.4,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 7, 8.3, 9],
              "circle-opacity": hasSelection
                ? ["case", highlightedFarmExpr, 0.9, 0.18]
                : 0.9,
            } as any}
          />
          <Layer
            id="farms-symbol"
            type="symbol"
            source-layer="wind_farm_points_tiles"
            minzoom={3}
            maxzoom={8.4}
            filter={farmVisibilityFilter as any}
            layout={{
              "text-field": "🌀",
              "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11.5, 8.3, 16],
              "text-allow-overlap": true,
            } as any}
            paint={{
              "text-color": "rgba(191,219,254,1)",
              "text-halo-color": "rgba(8,15,30,0.95)",
              "text-halo-width": 2.2,
              "text-opacity": hasSelection
                ? ["case", highlightedFarmExpr, 1, 0.25]
                : 0.95,
            } as any}
          />
          <Layer
            id="farms-circle"
            type="circle"
            source-layer="wind_farm_points_tiles"
            minzoom={8.2}
            maxzoom={11.2}
            filter={farmVisibilityFilter as any}
            paint={{
              "circle-color": [
                "case",
                highlightedFarmExpr,
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
                highlightedFarmExpr,
                "rgba(255,255,220,1)",
                "rgba(255,255,255,0.55)",
              ],
              "circle-stroke-width": ["case", highlightedFarmExpr, 2.4, 1.2],
              "circle-opacity": hasSelection
                ? ["case", highlightedFarmExpr, 0.98, 0.16]
                : 0.88,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.2, 4.2, 10.8, 8.5],
            } as any}
          />
        </Source>

        <Source id="turbines" type="vector" url={`${martinBaseUrl}/turbines_tiles`}>
          <Layer
            id="turbines-circle"
            type="circle"
            source-layer="turbines_tiles"
            minzoom={9.8}
            paint={{
              "circle-color": "rgba(180,220,255,0.95)",
              "circle-opacity": hasSelection
                ? ["case", turbineRelatedExpr, 0.92, 0.06]
                : 0.86,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9.8, 1.5, 12, 3.6],
            } as any}
          />
        </Source>

        <Source id="companies" type="vector" url={`${martinBaseUrl}/company_locations_tiles`}>
          <Layer
            id="companies-core-circle"
            type="circle"
            source-layer="company_locations_tiles"
            paint={{
              "circle-color": [
                "match",
                ["to-string", ["get", "marker_class"]],
                "offtaker", "rgba(250,204,21,1)",
                "epc", "rgba(251,146,60,1)",
                "rgba(56,189,248,0.95)",
              ],
              "circle-stroke-color": "rgba(255,255,255,0.95)",
              "circle-stroke-width": ["case", selectedCompanyExpr, 2.8, 1.8],
              "circle-radius": [
                "case",
                selectedCompanyExpr,
                10,
                relatedCompanyExpr,
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
                    selectedCompanyExpr, 1,
                    relatedCompanyExpr, 0.98,
                    0.16,
                  ]
                : 0.94,
            } as any}
          />

          <Layer
            id="skyborn-highlight-ring"
            type="circle"
            source-layer="company_locations_tiles"
            filter={["==", ["to-number", ["get", "is_skyborn"]], 1] as any}
            paint={{
              "circle-color": "rgba(37,99,235,0.2)",
              "circle-stroke-color": "rgba(191,219,254,1)",
              "circle-stroke-width": 2.4,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 18],
              "circle-opacity": 1,
            } as any}
          />
          <Layer
            id="skyborn-label"
            type="symbol"
            source-layer="company_locations_tiles"
            filter={["==", ["to-number", ["get", "is_skyborn"]], 1] as any}
            minzoom={4}
            layout={{
              "text-field": "Skyborn",
              "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 9, 15],
              "text-offset": [0, -1.4],
              "text-anchor": "bottom",
              "text-allow-overlap": true,
            } as any}
            paint={{
              "text-color": "rgba(219,234,254,1)",
              "text-halo-color": "rgba(15,23,42,0.95)",
              "text-halo-width": 1.8,
              "text-opacity": 1,
            } as any}
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
        <span>Martin vector tiles</span>
        {statusFilter.size > 0 && <span>· {statusFilter.size} status filter{statusFilter.size === 1 ? "" : "s"}</span>}
        {hideIncomplete && <span>· complete farms only</span>}
        {zoom >= 9.8 && <span>· turbines active</span>}
      </div>

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

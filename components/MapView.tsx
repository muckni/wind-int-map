"use client";

import { useEffect, useMemo, useState } from "react";
import Map from "react-map-gl/maplibre";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { FilterOptions, WindFarmDetail, WindFarmFilters, WindFarmPoint } from "../lib/types";
import WindFarmPanel from "./WindFarmPanel";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

function buildQueryParams(bbox: string, filters: WindFarmFilters) {
  const params = new URLSearchParams({ bbox });
  if (filters.country_code) params.set("country_code", filters.country_code);
  if (filters.status_current) params.set("status_current", filters.status_current);
  if (filters.sea_basin) params.set("sea_basin", filters.sea_basin);
  if (filters.developer_company_id) {
    params.set("developer_company_id", filters.developer_company_id);
  }
  return params.toString();
}

export default function MapView() {
  const [data, setData] = useState<WindFarmPoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<WindFarmDetail | null>(null);
  const [bbox, setBbox] = useState<string>("-10,45,20,62");
  const [filters, setFilters] = useState<WindFarmFilters>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  useEffect(() => {
    fetch("/api/filter-options")
      .then((res) => res.json())
      .then((json) => setFilterOptions(json))
      .catch(() => setFilterOptions(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      const qs = buildQueryParams(bbox, filters);
      fetch(`/api/wind-farms?${qs}`)
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setData(json.data || []);
        })
        .catch(() => {
          if (!cancelled) setData([]);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [bbox, filters]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/wind-farms/${selectedId}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setSelectedDetail(json);
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const layer = useMemo(
    () =>
      new ScatterplotLayer<WindFarmPoint>({
        id: "wind-farms",
        data,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 4000,
        radiusUnits: "meters",
        radiusMinPixels: 3,
        radiusMaxPixels: 12,
        getFillColor: [0, 120, 255, 180],
        pickable: true,
        onClick: (info) => setSelectedId(info.object?.id ?? null),
      }),
    [data]
  );

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <DeckGL
          layers={[layer]}
          initialViewState={{ longitude: 2, latitude: 54, zoom: 4 }}
          controller
        >
          <Map
            mapStyle={MAP_STYLE}
            onMoveEnd={(evt) => {
              const bounds = evt.target.getBounds();
              const nextBbox = [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth(),
              ].join(",");
              setBbox(nextBbox);
            }}
          />
        </DeckGL>

        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            background: "white",
            padding: 12,
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
            fontSize: 13,
            display: "grid",
            gap: 8,
            minWidth: 240,
          }}
        >
          <div style={{ fontWeight: 600 }}>Filters</div>
          <select
            value={filters.country_code ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, country_code: e.target.value || undefined }))}
          >
            <option value="">Country (All)</option>
            {filterOptions?.country_code?.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select
            value={filters.status_current ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status_current: e.target.value || undefined }))
            }
          >
            <option value="">Status (All)</option>
            {filterOptions?.status_current?.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={filters.sea_basin ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, sea_basin: e.target.value || undefined }))}
          >
            <option value="">Sea Basin (All)</option>
            {filterOptions?.sea_basin?.map((basin) => (
              <option key={basin} value={basin}>
                {basin}
              </option>
            ))}
          </select>
          <select
            value={filters.developer_company_id ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, developer_company_id: e.target.value || undefined }))
            }
          >
            <option value="">Developer (All)</option>
            {filterOptions?.developers?.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          width: 320,
          borderLeft: "1px solid #e5e9ec",
          background: "#f8fafb",
        }}
      >
        <WindFarmPanel windFarm={selectedDetail} />
      </div>
    </div>
  );
}

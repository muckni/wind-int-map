import type { WindFarmDetail } from "../lib/types";

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Unknown";
  return value;
}

export default function WindFarmPanel({ windFarm }: { windFarm: WindFarmDetail | null }) {
  if (!windFarm) {
    return (
      <div style={{ padding: 16, color: "#5b6770" }}>
        Select a wind farm to view details.
      </div>
    );
  }

  const wf = windFarm.wind_farm;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{formatValue(wf.name)}</h2>
      <div style={{ marginTop: 8, fontSize: 14, color: "#5b6770" }}>
        {formatValue(wf.country_code)} · {formatValue(wf.sea_basin)}
      </div>

      <div style={{ marginTop: 12, fontSize: 14, display: "grid", gap: 6 }}>
        <div>Status: {formatValue(wf.status_current)}</div>
        <div>Capacity: {formatValue(wf.capacity_mw)} MW</div>
        <div>Turbines: {formatValue(wf.turbine_count)}</div>
        <div>Developer: {formatValue(wf.developer_name)}</div>
        <div>Water depth: {formatValue(wf.water_depth_m)} m</div>
        <div>Foundation: {formatValue(wf.foundation_type)}</div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#8a97a0" }}>
        Ownership and contracts panels will be added in a later phase.
      </div>
    </div>
  );
}

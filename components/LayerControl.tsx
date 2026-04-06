"use client"

import { useCallback, useState } from "react"

interface LayerConfig {
  id: string
  label: string
  icon: string
  color: string
  visible: boolean
  opacity?: number
  hasOpacity?: boolean
}

interface Props {
  layers: LayerConfig[]
  onToggle: (id: string) => void
  onOpacityChange: (id: string, opacity: number) => void
}

const WIND_SPEED_RAMP = [
  { value: "< 7", color: "#3c82f6" },
  { value: "8",   color: "#34d399" },
  { value: "9",   color: "#facc15" },
  { value: "10",  color: "#f97316" },
  { value: "> 11", color: "#ef4444" },
]

export default function LayerControl({ layers, onToggle, onOpacityChange }: Props) {
  const [expanded, setExpanded] = useState(false)

  const handleOpacity = useCallback((id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    onOpacityChange(id, parseFloat(e.target.value))
  }, [onOpacityChange])

  const windLayer = layers.find((l) => l.id === "wind-resource")

  return (
    <div style={{
      position: "absolute",
      top: 60,
      right: 12,
      zIndex: 5,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 6,
    }}>
      {/* Toggle button */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          background: expanded ? "rgba(30,41,59,0.95)" : "rgba(10,15,25,0.85)",
          color: expanded ? "#e2e8f0" : "#64748b",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          backdropFilter: "blur(8px)",
          transition: "all 0.15s ease",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
        title="Layer Control"
      >
        ☰
      </button>

      {/* Panel */}
      {expanded && (
        <div style={{
          background: "rgba(10,15,25,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "10px 0",
          minWidth: 210,
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{
            padding: "2px 14px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            marginBottom: 4,
          }}>
            <span style={{
              color: "#334155",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              Layers
            </span>
          </div>

          {layers.map((layer) => (
            <div key={layer.id}>
              <button
                onClick={() => onToggle(layer.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 14px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{layer.icon}</span>
                <span style={{
                  flex: 1,
                  textAlign: "left",
                  fontSize: 12,
                  color: layer.visible ? "#e2e8f0" : "#475569",
                  fontWeight: layer.visible ? 500 : 400,
                  transition: "color 0.1s ease",
                }}>
                  {layer.label}
                </span>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: layer.visible ? layer.color : "rgba(30,41,59,0.8)",
                  border: `1px solid ${layer.visible ? layer.color + "80" : "rgba(255,255,255,0.08)"}`,
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                  boxShadow: layer.visible ? `0 0 6px ${layer.color}40` : "none",
                }} />
              </button>

              {/* Opacity slider for layers that support it */}
              {layer.hasOpacity && layer.visible && (
                <div style={{
                  padding: "2px 14px 8px 42px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span style={{ color: "#475569", fontSize: 10, width: 42, flexShrink: 0 }}>
                    {Math.round((layer.opacity ?? 0.6) * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={layer.opacity ?? 0.6}
                    onChange={(e) => handleOpacity(layer.id, e)}
                    style={{
                      flex: 1,
                      height: 3,
                      appearance: "none",
                      background: `linear-gradient(to right, ${layer.color}60 0%, ${layer.color} ${(layer.opacity ?? 0.6) * 100}%, #1e293b ${(layer.opacity ?? 0.6) * 100}%)`,
                      borderRadius: 2,
                      outline: "none",
                      cursor: "pointer",
                      accentColor: layer.color,
                    }}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Wind speed legend */}
          {windLayer?.visible && (
            <div style={{
              margin: "6px 14px 4px",
              padding: "8px 10px",
              background: "rgba(30,41,59,0.5)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{
                color: "#475569",
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}>
                Wind Speed (100m)
              </div>
              <div style={{ display: "flex", gap: 0, borderRadius: 3, overflow: "hidden" }}>
                {WIND_SPEED_RAMP.map((entry) => (
                  <div
                    key={entry.value}
                    style={{
                      flex: 1,
                      height: 6,
                      background: entry.color,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                {WIND_SPEED_RAMP.map((entry) => (
                  <span key={entry.value} style={{ color: "#64748b", fontSize: 8 }}>
                    {entry.value}
                  </span>
                ))}
              </div>
              <div style={{ color: "#334155", fontSize: 8, marginTop: 4 }}>m/s</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

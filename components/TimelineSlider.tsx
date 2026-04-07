"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const MIN_YEAR = 1991
const MAX_YEAR = 2035

type YearData = { year: number; total_mw: number }

interface Props {
  onYearChange: (year: number) => void
  selectedYear: number
}

export default function TimelineSlider({ onYearChange, selectedYear }: Props) {
  const [playing, setPlaying] = useState(false)
  const [yearData, setYearData] = useState<YearData[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch aggregate data for bar chart
  useEffect(() => {
    fetch("/api/timeline")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) setYearData(d.data)
      })
      .catch(() => {})
  }, [])

  // Build lookup maps
  const mwByYear = new Map<number, number>()
  for (const d of yearData) mwByYear.set(d.year, d.total_mw)

  const maxMw = Math.max(1, ...yearData.map((d) => d.total_mw))

  // Cumulative GW up to selectedYear
  let cumulativeMw = 0
  for (const d of yearData) {
    if (d.year <= selectedYear) cumulativeMw += d.total_mw
  }
  const cumulativeGw = (cumulativeMw / 1000).toFixed(1)

  // Play/pause logic
  const advance = useCallback(() => {
    onYearChange(selectedYear >= MAX_YEAR ? MIN_YEAR : selectedYear + 1)
  }, [selectedYear, onYearChange])

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(advance, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, advance])

  // Stop at end
  useEffect(() => {
    if (playing && selectedYear >= MAX_YEAR) setPlaying(false)
  }, [playing, selectedYear])

  const years: number[] = []
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) years.push(y)

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        background: "rgba(24,24,27,0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "12px 20px 16px",
        minWidth: 620,
        maxWidth: "90vw",
        boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
      }}
    >
      {/* Mini bar chart */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 1,
          height: 38,
          marginBottom: 6,
          padding: "0 2px",
        }}
      >
        {years.map((y) => {
          const mw = mwByYear.get(y) ?? 0
          const h = mw > 0 ? Math.max(2, (mw / maxMw) * 34) : 0
          const active = y <= selectedYear
          const isCurrent = y === selectedYear
          return (
            <div
              key={y}
              style={{
                flex: 1,
                height: h,
                minWidth: 0,
                borderRadius: 2,
                background: isCurrent
                  ? "rgba(96,165,250,0.95)"
                  : active
                    ? "rgba(52,211,153,0.7)"
                    : "rgba(255,255,255,0.1)",
                transition: "height 0.15s ease, background 0.15s ease",
                cursor: "pointer",
              }}
              title={`${y}: ${mw.toFixed(0)} MW`}
              onClick={() => {
                onYearChange(y)
                setPlaying(false)
              }}
            />
          )
        })}
      </div>

      {/* Controls row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Play/pause */}
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: playing ? "rgba(248,113,113,0.18)" : "rgba(52,211,153,0.14)",
            color: playing ? "#f87171" : "#34d399",
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all 0.12s ease",
          }}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        {/* Year display */}
        <span
          style={{
            color: "#e2e8f0",
            fontSize: 22,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            minWidth: 52,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {selectedYear}
        </span>

        {/* Cumulative GW */}
        <span
          style={{
            color: "#34d399",
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
            minWidth: 70,
          }}
        >
          {cumulativeGw} GW
        </span>

        {/* Slider */}
        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={selectedYear}
          onChange={(e) => {
            onYearChange(Number(e.target.value))
            setPlaying(false)
          }}
          style={{
            flex: 1,
            height: 4,
            accentColor: "#60a5fa",
            cursor: "pointer",
          }}
        />

        {/* Min / max labels */}
        <div
          style={{
            display: "flex",
            gap: 6,
            color: "#4b5563",
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <span>{MIN_YEAR}</span>
          <span>–</span>
          <span>{MAX_YEAR}</span>
        </div>
      </div>
    </div>
  )
}

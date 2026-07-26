"use client";

import { useMemo } from "react";
import type { SofaGraphPoint } from "@/lib/sofascore/types";

export function PressureSparkline({
  points,
  compact = false,
  className = "",
}: {
  points: SofaGraphPoint[];
  compact?: boolean;
  className?: string;
}) {
  const chart = useMemo(() => {
    if (!points.length) return null;
    const width = compact ? 220 : 520;
    const height = compact ? 44 : 140;
    const pad = compact
      ? { top: 4, right: 4, bottom: 4, left: 4 }
      : { top: 12, right: 12, bottom: 22, left: 28 };
    const maxAbs = Math.max(20, ...points.map((p) => Math.abs(p.value)));
    const minM = points[0].minute;
    const maxM = points[points.length - 1].minute || minM + 1;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const midY = pad.top + innerH / 2;

    const xy = points.map((p) => {
      const x =
        pad.left +
        ((p.minute - minM) / Math.max(maxM - minM, 1)) * innerW;
      const y = midY - (p.value / maxAbs) * (innerH / 2);
      return { ...p, x, y };
    });

    const line = xy
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");

    const areaHome = [
      `M${xy[0].x},${midY}`,
      ...xy.map((p) => `L${p.x},${p.value >= 0 ? p.y : midY}`),
      `L${xy[xy.length - 1].x},${midY} Z`,
    ].join(" ");
    const areaAway = [
      `M${xy[0].x},${midY}`,
      ...xy.map((p) => `L${p.x},${p.value < 0 ? p.y : midY}`),
      `L${xy[xy.length - 1].x},${midY} Z`,
    ].join(" ");

    return { width, height, pad, midY, line, areaHome, areaAway, minM, maxM };
  }, [points, compact]);

  if (!chart) return null;

  return (
    <svg
      className={`pressure-svg ${compact ? "pressure-svg-compact" : ""} ${className}`.trim()}
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Pressão Sofascore"
    >
      <line
        x1={chart.pad.left}
        x2={chart.width - chart.pad.right}
        y1={chart.midY}
        y2={chart.midY}
        className="pressure-mid"
      />
      <path d={chart.areaHome} className="pressure-area-home" />
      <path d={chart.areaAway} className="pressure-area-away" />
      <path d={chart.line} className="pressure-line" fill="none" />
      {!compact && (
        <>
          <text x={chart.pad.left} y={chart.height - 6} className="pressure-tick">
            {chart.minM}′
          </text>
          <text
            x={chart.width - chart.pad.right}
            y={chart.height - 6}
            textAnchor="end"
            className="pressure-tick"
          >
            {Math.round(chart.maxM)}′
          </text>
          <text x={4} y={chart.pad.top + 8} className="pressure-tick">
            casa
          </text>
          <text x={4} y={chart.height - chart.pad.bottom} className="pressure-tick">
            fora
          </text>
        </>
      )}
    </svg>
  );
}

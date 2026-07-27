"use client";

import { useMemo } from "react";
import type { SofaGraphPoint } from "@/lib/sofascore/types";

function buildSignedAreas(
  xy: Array<{ x: number; y: number; value: number }>,
  midY: number,
) {
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
  return { areaHome, areaAway };
}

/** Quebra a linha em segmentos positivos (casa) e negativos (fora). */
function buildColoredSegments(
  xy: Array<{ x: number; y: number; value: number }>,
  midY: number,
) {
  const home: string[] = [];
  const away: string[] = [];

  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const aPos = a.value >= 0;
    const bPos = b.value >= 0;

    if (aPos === bPos) {
      const d = `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
      (aPos ? home : away).push(d);
      continue;
    }

    // cruza o zero — interpola ponto no eixo
    const t = Math.abs(a.value) / (Math.abs(a.value) + Math.abs(b.value) || 1);
    const cx = a.x + (b.x - a.x) * t;
    const cy = midY;
    const d1 = `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${cx.toFixed(1)},${cy.toFixed(1)}`;
    const d2 = `M${cx.toFixed(1)},${cy.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    (aPos ? home : away).push(d1);
    (bPos ? home : away).push(d2);
  }

  return { homePath: home.join(" "), awayPath: away.join(" ") };
}

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

    const { areaHome, areaAway } = buildSignedAreas(xy, midY);
    const { homePath, awayPath } = buildColoredSegments(xy, midY);

    return {
      width,
      height,
      pad,
      midY,
      areaHome,
      areaAway,
      homePath,
      awayPath,
      minM,
      maxM,
    };
  }, [points, compact]);

  if (!chart) return null;

  return (
    <svg
      className={`pressure-svg ${compact ? "pressure-svg-compact" : ""} ${className}`.trim()}
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Gráfico de pressão colorido"
    >
      <defs>
        <linearGradient id="pressureHomeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="pressureAwayFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      <line
        x1={chart.pad.left}
        x2={chart.width - chart.pad.right}
        y1={chart.midY}
        y2={chart.midY}
        className="pressure-mid"
      />
      <path d={chart.areaHome} className="pressure-area-home" />
      <path d={chart.areaAway} className="pressure-area-away" />
      {chart.homePath ? (
        <path d={chart.homePath} className="pressure-line-home" fill="none" />
      ) : null}
      {chart.awayPath ? (
        <path d={chart.awayPath} className="pressure-line-away" fill="none" />
      ) : null}
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
          <text x={4} y={chart.pad.top + 8} className="pressure-tick pressure-tick-home">
            casa
          </text>
          <text
            x={4}
            y={chart.height - chart.pad.bottom}
            className="pressure-tick pressure-tick-away"
          >
            fora
          </text>
        </>
      )}
    </svg>
  );
}

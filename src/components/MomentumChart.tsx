"use client";

import { useMemo } from "react";
import type { SofaGraphPoint } from "@/lib/sofascore/types";
import type { FotmobGoalMarker } from "@/lib/fotmob/rich";

export function MomentumChart({
  points,
  goals = [],
  homeColor = "#3C9BDB",
  awayColor = "#F5C400",
  currentMinute,
}: {
  points: SofaGraphPoint[];
  goals?: FotmobGoalMarker[];
  homeColor?: string;
  awayColor?: string;
  currentMinute?: number | null;
}) {
  const chart = useMemo(() => {
    if (!points.length) return null;
    const width = 560;
    const height = 180;
    const pad = { top: 14, right: 12, bottom: 28, left: 10 };
    const maxAbs = Math.max(18, ...points.map((p) => Math.abs(p.value)));
    const minM = 0;
    const maxM = Math.max(
      90,
      points[points.length - 1]?.minute ?? 90,
      currentMinute ?? 0,
    );
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const midY = pad.top + innerH / 2;

    const xAt = (minute: number) =>
      pad.left + ((minute - minM) / Math.max(maxM - minM, 1)) * innerW;
    const yAt = (value: number) => midY - (value / maxAbs) * (innerH / 2);

    const xy = points.map((p) => ({
      ...p,
      x: xAt(p.minute),
      y: yAt(p.value),
    }));

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

    const htX = xAt(45);
    const liveX = currentMinute != null ? xAt(currentMinute) : null;

    return {
      width,
      height,
      pad,
      midY,
      maxM,
      areaHome,
      areaAway,
      htX,
      liveX,
      goals: goals.map((g) => ({
        ...g,
        x: xAt(g.minute),
        y: midY,
      })),
    };
  }, [points, goals, currentMinute]);

  if (!chart) return null;

  const uid = "mom";

  return (
    <svg
      className="fm-momentum-svg"
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Momentum"
    >
      <defs>
        <linearGradient id={`${uid}-home`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={homeColor} stopOpacity="0.75" />
          <stop offset="100%" stopColor={homeColor} stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={`${uid}-away`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={awayColor} stopOpacity="0.75" />
          <stop offset="100%" stopColor={awayColor} stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <line
        x1={chart.pad.left}
        x2={chart.width - chart.pad.right}
        y1={chart.midY}
        y2={chart.midY}
        className="fm-momentum-axis"
      />
      <line
        x1={chart.htX}
        x2={chart.htX}
        y1={chart.pad.top}
        y2={chart.height - chart.pad.bottom}
        className="fm-momentum-ht"
      />

      <path d={chart.areaHome} fill={`url(#${uid}-home)`} />
      <path d={chart.areaAway} fill={`url(#${uid}-away)`} />

      {chart.liveX != null ? (
        <>
          <line
            x1={chart.liveX}
            x2={chart.liveX}
            y1={chart.pad.top}
            y2={chart.height - chart.pad.bottom}
            className="fm-momentum-live"
          />
          <circle
            cx={chart.liveX}
            cy={chart.height - chart.pad.bottom}
            r={4}
            className="fm-momentum-live-dot"
          />
        </>
      ) : null}

      {chart.goals.map((g, i) => (
        <g key={`${g.minute}-${i}`} transform={`translate(${g.x}, ${g.y})`}>
          <circle r={7} className="fm-goal-ball" />
          <text textAnchor="middle" dy="3.5" className="fm-goal-ball-icon">
            ⚽
          </text>
        </g>
      ))}

      <text x={chart.pad.left} y={chart.height - 8} className="fm-momentum-tick">
        0&apos;
      </text>
      <text
        x={chart.htX}
        y={chart.height - 8}
        textAnchor="middle"
        className="fm-momentum-tick"
      >
        HT
      </text>
      <text
        x={chart.width - chart.pad.right}
        y={chart.height - 8}
        textAnchor="end"
        className="fm-momentum-tick"
      >
        FT
      </text>
    </svg>
  );
}

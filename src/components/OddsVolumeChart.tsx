"use client";

import { useEffect, useMemo, useState } from "react";

type HistoryPoint = {
  odd: number;
  volume: number;
  matched: number;
  createdAt: string;
};

type ChartPayload = {
  runnerId: string;
  runnerName?: string;
  inPlayAt?: string | null;
  minOdd: number;
  maxOdd: number;
  data: HistoryPoint[];
  source?: string;
  summary?: {
    lastOdd: number | null;
    minOdd: number | null;
    maxOdd: number | null;
    volume: number;
    totalMatchedDelta: number;
  };
  tradePlan?: {
    inEntryWindow: boolean;
    entryReady: boolean;
    layOdds: number | null;
    targetBackOdds: number | null;
    summary: string;
    oscillation: null | { active: boolean; detail: string };
    correction?: null | {
      entryBias: string;
      summary: string;
      underdogCrash?: null | {
        matched: boolean;
        quality: string;
        peakOdd: number;
        troughOdd: number;
        detail: string;
      };
    };
  };
  error?: string;
};

const RANGES = [
  { id: "all", label: "Todo período", minutes: 1440 },
  { id: "live", label: "Ao vivo", minutes: 180, inPlay: true },
  { id: "10m", label: "10min", minutes: 10 },
  { id: "1h", label: "1h", minutes: 60 },
  { id: "3h", label: "3h", minutes: 180 },
  { id: "24h", label: "24h", minutes: 1440 },
] as const;

function formatMoney(v: number | null | undefined) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ —";
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `R$ ${n.toFixed(0)}`;
}

function formatClock(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OddsVolumeChart({
  runnerId,
  marketId,
  eventId,
  title,
  layOddsHint,
}: {
  runnerId?: string;
  marketId?: string;
  eventId?: string;
  title?: string;
  layOddsHint?: number | null;
}) {
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("1h");
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[3];

  useEffect(() => {
    if (!runnerId) {
      setPayload(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          minutesBefore: String(range.minutes),
          limit: "1000",
        });
        if ("inPlay" in range && range.inPlay) params.set("inPlay", "1");
        if (marketId) params.set("marketId", marketId);
        if (eventId) params.set("eventId", eventId);
        if (layOddsHint != null) params.set("layOdds", String(layOddsHint));

        const res = await fetch(`/api/charts/${runnerId}?${params}`);
        const json = (await res.json()) as ChartPayload;
        if (!res.ok) throw new Error(json.error || "Falha ao carregar gráfico");
        if (!cancelled) setPayload(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro no gráfico");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runnerId, marketId, eventId, range, layOddsHint]);

  const chart = useMemo(() => {
    const points = payload?.data ?? [];
    if (points.length < 1) return null;

    const width = 640;
    const height = 220;
    const pad = { top: 16, right: 12, bottom: 28, left: 40 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const times = points.map((p) => new Date(p.createdAt).getTime());
    const odds = points.map((p) => p.odd);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const minO = Math.min(...odds, payload?.minOdd || Infinity, 1);
    const maxO = Math.max(...odds, payload?.maxOdd || 0, minO + 1);
    const spanT = Math.max(maxT - minT, 1);
    const spanO = Math.max(maxO - minO, 1);

    const xy = points.map((p) => {
      const t = new Date(p.createdAt).getTime();
      const x = pad.left + ((t - minT) / spanT) * innerW;
      const y = pad.top + (1 - (p.odd - minO) / spanO) * innerH;
      return { x, y, ...p };
    });

    const line = xy
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");

    let liveX: number | null = null;
    if (payload?.inPlayAt) {
      const liveT = new Date(payload.inPlayAt).getTime();
      if (liveT >= minT && liveT <= maxT) {
        liveX = pad.left + ((liveT - minT) / spanT) * innerW;
      }
    }

    const yTicks = [minO, minO + spanO / 3, minO + (2 * spanO) / 3, maxO];

    return {
      width,
      height,
      pad,
      xy,
      line,
      liveX,
      yTicks,
      minO,
      maxO,
      minT,
      maxT,
    };
  }, [payload]);

  if (!runnerId) {
    return (
      <div className="chart-empty">Selecione um evento com runner 3-3.</div>
    );
  }

  const summary = payload?.summary;

  return (
    <section className="chart-panel">
      <div className="chart-head">
        <div>
          <h3>{title ?? `Odd 3-3 · ${payload?.runnerName ?? "—"}`}</h3>
          <p>Movimentação da odd e capital correspondido (matched)</p>
        </div>
        <div className="chart-ranges">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === rangeId ? "active" : ""}
              onClick={() => setRangeId(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-metrics">
        <div>
          <span>Última</span>
          <strong>{summary?.lastOdd ?? "—"}</strong>
        </div>
        <div>
          <span>Menor</span>
          <strong>{summary?.minOdd ?? "—"}</strong>
        </div>
        <div>
          <span>Maior</span>
          <strong>{summary?.maxOdd ?? "—"}</strong>
        </div>
        <div>
          <span>Correspondido</span>
          <strong>{formatMoney(summary?.volume ?? 0)}</strong>
        </div>
      </div>

      {payload?.tradePlan && (
        <div className={`trade-chip ${payload.tradePlan.entryReady ? "ready" : ""}`}>
          <strong>
            {payload.tradePlan.entryReady
              ? payload.tradePlan.correction?.underdogCrash?.matched
                ? "Entrada liberada (bounce zebra)"
                : "Entrada liberada"
              : payload.tradePlan.correction?.underdogCrash?.matched
                ? payload.tradePlan.correction.entryBias === "favor"
                  ? "Zebra-crash · corrigindo ↑"
                  : "Zebra-crash · aguardar tick ↑"
                : payload.tradePlan.inEntryWindow
                  ? "Na janela · aguardar correção"
                  : "Fora da janela (preferir lay baixo)"}
          </strong>
          <span>
            Lay {payload.tradePlan.layOdds?.toFixed(0) ?? "—"} → Back{" "}
            {payload.tradePlan.targetBackOdds?.toFixed(0) ?? "—"}
          </span>
          {payload.tradePlan.correction?.underdogCrash?.matched && (
            <span>
              Crash {payload.tradePlan.correction.underdogCrash.peakOdd.toFixed(0)}→
              {payload.tradePlan.correction.underdogCrash.troughOdd.toFixed(0)}
            </span>
          )}
          {payload.tradePlan.oscillation && (
            <span>{payload.tradePlan.oscillation.detail}</span>
          )}
          {payload.tradePlan.summary && (
            <span className="trade-chip-summary">{payload.tradePlan.summary}</span>
          )}
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}
      {loading && !payload && <div className="banner-info">Carregando histórico…</div>}

      {chart ? (
        <svg
          className="odds-svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label="Gráfico de odd 3-3"
        >
          {chart.yTicks.map((tick) => {
            const y =
              chart.pad.top +
              (1 - (tick - chart.minO) / Math.max(chart.maxO - chart.minO, 1)) *
                (chart.height - chart.pad.top - chart.pad.bottom);
            return (
              <g key={tick}>
                <line
                  x1={chart.pad.left}
                  x2={chart.width - chart.pad.right}
                  y1={y}
                  y2={y}
                  className="grid"
                />
                <text x={4} y={y + 3} className="tick">
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          {chart.liveX != null && (
            <g>
              <line
                x1={chart.liveX}
                x2={chart.liveX}
                y1={chart.pad.top}
                y2={chart.height - chart.pad.bottom}
                className="live-line"
              />
              <text x={chart.liveX + 4} y={chart.pad.top + 10} className="live-label">
                Ao vivo
              </text>
            </g>
          )}

          <path d={chart.line} className="odds-line" fill="none" />

          {chart.xy.map((p) => (
            <circle key={p.createdAt} cx={p.x} cy={p.y} r={3.2} className="odds-dot">
              <title>
                {formatClock(p.createdAt)} · odd {p.odd} · vol {formatMoney(p.volume)} · matched{" "}
                {formatMoney(p.matched)}
              </title>
            </circle>
          ))}

          <text
            x={chart.pad.left}
            y={chart.height - 8}
            className="tick"
          >
            {formatClock(new Date(chart.minT).toISOString())}
          </text>
          <text
            x={chart.width - chart.pad.right}
            y={chart.height - 8}
            className="tick"
            textAnchor="end"
          >
            {formatClock(new Date(chart.maxT).toISOString())}
          </text>
        </svg>
      ) : (
        !loading && <div className="chart-empty">Sem histórico matched neste período.</div>
      )}

      {payload?.data?.length ? (
        <div className="chart-volume-list">
          <h4>Entradas de capital (matched)</h4>
          <ul>
            {[...payload.data].reverse().slice(0, 8).map((p) => (
              <li key={`${p.createdAt}-${p.odd}-${p.matched}`}>
                <span>{formatClock(p.createdAt)}</span>
                <span>odd {p.odd}</span>
                <span>+{formatMoney(p.matched)}</span>
                <span>vol {formatMoney(p.volume)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

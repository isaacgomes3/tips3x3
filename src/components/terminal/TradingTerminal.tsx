"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { Entry } from "@/lib/central/types";
import type { useBankrollData } from "@/hooks/useBankrollData";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type Bankroll = ReturnType<typeof useBankrollData>;

type QovSnap = {
  entryReady?: boolean;
  entryOdds?: number | null;
  layOdds?: number | null;
  backOdds?: number | null;
};

type EventosRarosSnap = {
  entryReady?: boolean;
  entryOdds?: number | null;
  layOdds?: number | null;
  backOdds?: number | null;
  scoreLabel?: string | null;
  scoreLabels?: string[];
  entries?: Array<{ label: string; layOdds: number }>;
};

type LiveRow = {
  confirmed: boolean;
  mexchangeUrl: string;
  tradePlan?: {
    layOdds: number | null;
    targetBackOdds: number | null;
    example?: { profit: number | null; layStake: number } | null;
  };
  qovLayUnderdog?: QovSnap;
  eventosRaros?: EventosRarosSnap;
  live: null | {
    scoreLabel: string;
    minute: number | null;
    status: string;
  };
  analysis: {
    eventId: string;
    eventName: string;
    home?: string;
    away?: string;
    competition?: string;
    quotes?: {
      back: { odds: number | null };
      lay: { odds: number | null };
    };
    tradePlan?: LiveRow["tradePlan"];
    qovLayUnderdog?: QovSnap;
    eventosRaros?: EventosRarosSnap;
  };
};

type SignalStats = {
  lay3x3: { filters: number; entries: number; waiting: number; operating: boolean };
  qovLay: { events: number; entries: number; monitoring: boolean };
  eventosRaros: { events: number; entries: number; monitoring: boolean };
};

function fmtBrl(n: number, signed = false) {
  const abs = Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `R$ ${abs}`;
  if (n > 0) return `+R$ ${abs}`;
  if (n < 0) return `-R$ ${abs}`;
  return `R$ ${abs}`;
}

function resolveLiveMarket(row: LiveRow, lay: number | null | undefined): string {
  const er = row.eventosRaros ?? row.analysis.eventosRaros;
  if (
    er?.entryReady ||
    (lay != null &&
      er?.layOdds != null &&
      Math.abs(lay - er.layOdds) < 0.01)
  ) {
    const n = er?.entries?.length ?? er?.scoreLabels?.length ?? 0;
    if (n > 1) return `Eventos raros · ${n} placares`;
    return er?.scoreLabel
      ? `Eventos raros · ${er.scoreLabel}`
      : "Eventos raros";
  }
  const qovLay = row.qovLayUnderdog ?? row.analysis.qovLayUnderdog;
  if (
    qovLay?.entryReady ||
    (lay != null &&
      qovLay?.entryOdds != null &&
      Math.abs(lay - qovLay.entryOdds) < 0.01)
  ) {
    return "Lay QOV zebra";
  }
  return "Lay 3x3";
}

function fmtPct(n: number, signed = false) {
  const v = Math.abs(n).toFixed(2).replace(".", ",");
  if (!signed) return `${n.toFixed(2).replace(".", ",")}%`;
  if (n > 0) return `+${v}%`;
  if (n < 0) return `-${v}%`;
  return `${v}%`;
}

function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

function AnimatedValue({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}

function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const angle = -90 + (pct / 100) * 180;
  return (
    <div className="term-gauge">
      <svg viewBox="0 0 200 120" className="term-gauge-svg" aria-hidden>
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 251} 251`}
        />
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5adf8a" />
            <stop offset="100%" stopColor="#d9ff00" />
          </linearGradient>
        </defs>
        <line
          x1="100"
          y1="100"
          x2={100 + 55 * Math.cos((angle * Math.PI) / 180)}
          y2={100 + 55 * Math.sin((angle * Math.PI) / 180)}
          stroke="#d9ff00"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="6" fill="#d9ff00" />
      </svg>
      <div className="term-gauge-copy">
        <span className="term-gauge-label">{label}</span>
        <strong>{fmtPct(value)}</strong>
        <em>Hoje · meta {fmtPct(max)}</em>
      </div>
    </div>
  );
}

function Donut({
  lay3x3Pct,
  overPct,
  availablePct,
}: {
  lay3x3Pct: number;
  overPct: number;
  availablePct: number;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const segs = [
    { pct: lay3x3Pct, color: "#d9ff00" },
    { pct: overPct, color: "#6ec8ff" },
    { pct: availablePct, color: "rgba(255,255,255,0.12)" },
  ];
  let offset = 0;
  return (
    <div className="term-donut-wrap">
      <svg viewBox="0 0 120 120" className="term-donut" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
        {segs.map((s, i) => {
          const dash = (s.pct / 100) * c;
          const el = (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="term-donut-center">
        <span>Banca</span>
        <strong>{Math.round(lay3x3Pct + overPct)}%</strong>
        <em>alocado</em>
      </div>
    </div>
  );
}

function BankrollLineChart({ points }: { points: number[] }) {
  const labels = points.map((_, i) => (i === 0 ? "Início" : `Op ${i}`));
  const data = {
    labels,
    datasets: [
      {
        data: points,
        borderColor: "#d9ff00",
        backgroundColor: "rgba(217, 255, 0, 0.08)",
        fill: true,
        tension: 0.42,
        pointRadius: 3,
        pointBackgroundColor: "#d9ff00",
        pointBorderColor: "#050505",
        pointBorderWidth: 2,
      },
    ],
  };
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "rgba(255,255,255,0.45)", font: { size: 10 } },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: {
          color: "rgba(255,255,255,0.45)",
          font: { family: "Rajdhani", size: 11 },
        },
      },
    },
  };
  return (
    <div className="term-chart-wrap">
      <Line data={data} options={options} />
    </div>
  );
}

function buildTimeline(entries: Entry[]) {
  const items: Array<{
    time: string;
    kind: "entrada" | "hedge" | "pendente";
    label: string;
    profit?: number;
    done: boolean;
  }> = [];

  for (const e of [...entries].reverse().slice(0, 8)) {
    const match = `${e.home_team} x ${e.away_team}`;
    items.push({
      time: fmtTime(e.created_at),
      kind: "entrada",
      label: match,
      done: e.result !== "pending",
    });
    if (e.cashout_odd && e.cashout_odd > 1) {
      items.push({
        time: fmtTime(e.created_at),
        kind: "hedge",
        label: "Hedge Back",
        profit: e.profit,
        done: true,
      });
    } else if (e.result === "green" || e.result === "red") {
      items.push({
        time: fmtTime(e.created_at),
        kind: "hedge",
        label: e.result === "green" ? "Lucro" : "Prejuízo",
        profit: e.profit,
        done: true,
      });
    } else {
      items.push({
        time: "—",
        kind: "pendente",
        label: "Aguardando saída",
        done: false,
      });
    }
  }
  return items;
}

export function TradingTerminal({
  bankroll,
  liveRows,
  signalStats,
  lastSyncSec,
  onOpenEvent,
}: {
  bankroll: Bankroll;
  liveRows: LiveRow[];
  signalStats: SignalStats;
  lastSyncSec: number;
  onOpenEvent?: (eventId: string) => void;
}) {
  const {
    currentBankroll,
    todayProfit,
    todayRoiPct,
    todayBankrollChangePct,
    winRate,
    stats,
    evolution,
    committed,
    riskTier,
    lay3x3StakePct,
    overStakePct,
    dailyMetaPct,
    entries,
    configured,
    loading: bankrollLoading,
  } = bankroll;

  const inplay = useMemo(
    () =>
      liveRows
        .filter((r) => r.live)
        .sort((a, b) => (b.live?.minute ?? 0) - (a.live?.minute ?? 0))
        .slice(0, 8),
    [liveRows],
  );

  const extractRows = useMemo(() => {
    return [...entries]
      .reverse()
      .slice(0, 12)
      .map((e) => ({
        id: e.id,
        time: fmtTime(e.created_at),
        event: `${e.home_team} x ${e.away_team}`,
        market: e.cashout_odd ? "Lay Over" : "Lay 3x3",
        entryOdd: e.odd.toFixed(2),
        exitOdd: e.cashout_odd?.toFixed(2) ?? (e.result === "pending" ? "—" : "—"),
        stake: e.stake,
        profit: e.result === "pending" ? null : e.profit,
        pending: e.result === "pending",
      }));
  }, [entries]);

  const timeline = useMemo(() => buildTimeline(entries), [entries]);

  const riskLabel = { baixo: "Baixo", moderado: "Moderado", alto: "Alto" }[riskTier];
  const riskClass = `term-risk-${riskTier}`;

  const lay3x3AllocPct = (committed.lay3x3 / Math.max(currentBankroll, 1)) * 100;
  const overAllocPct = (committed.over / Math.max(currentBankroll, 1)) * 100;
  const availPct = (committed.available / Math.max(currentBankroll, 1)) * 100;

  return (
    <div className="term-root">
      {/* KPI Row */}
      <section className="term-kpi-row">
        <article className="term-kpi term-kpi-hero">
          <span className="term-kpi-label">Banca</span>
          <AnimatedValue
            value={currentBankroll}
            format={(n) => fmtBrl(n)}
            className="term-kpi-value term-glow"
          />
          <span className={`term-kpi-delta ${todayBankrollChangePct >= 0 ? "is-up" : "is-down"}`}>
            {fmtPct(todayBankrollChangePct, true)} Hoje
          </span>
        </article>

        <article className="term-kpi">
          <span className="term-kpi-label">Lucro</span>
          <AnimatedValue
            value={todayProfit}
            format={(n) => fmtBrl(n, true)}
            className={`term-kpi-value ${todayProfit >= 0 ? "is-up" : "is-down"}`}
          />
          <div className="term-progress">
            <i style={{ width: `${Math.min(100, Math.abs(todayBankrollChangePct) * 8)}%` }} />
          </div>
        </article>

        <article className="term-kpi">
          <span className="term-kpi-label">ROI</span>
          <strong className="term-kpi-value">{fmtPct(todayRoiPct)}</strong>
        </article>

        <article className="term-kpi">
          <span className="term-kpi-label">Acerto</span>
          <strong className="term-kpi-value">{winRate.pct.toFixed(0)}%</strong>
          <span className="term-kpi-sub">
            {winRate.wins} / {winRate.total} operações
          </span>
        </article>

        <article className="term-kpi">
          <span className="term-kpi-label">Operações hoje</span>
          <strong className="term-kpi-value">{stats.todayOps}</strong>
          <span className="term-kpi-sub">Em andamento: {stats.pending}</span>
        </article>
      </section>

      {/* Painéis fixos — gestão, evolução e indicadores */}
      <section className="term-main-grid">
        <div className="term-col-left">
          <article className="term-panel term-bankroll-panel">
            <header className="term-panel-head">
              <h3>Gestão Inteligente</h3>
              <span className={`term-risk ${riskClass}`}>
                Risco {riskLabel}
              </span>
            </header>
            <div className="term-bankroll-center">
              <span>Banca</span>
              <strong>{fmtBrl(currentBankroll)}</strong>
            </div>
            <div className="term-stake-grid">
              <div className="term-stake-block">
                <div className="term-stake-head">
                  <strong>Lay 3x3</strong>
                  <span>{lay3x3StakePct}% · {fmtBrl(committed.lay3x3)}</span>
                </div>
                <div className="term-stake-bar is-green">
                  <i style={{ width: `${lay3x3StakePct}%` }} />
                </div>
              </div>
              <div className="term-stake-block">
                <div className="term-stake-head">
                  <strong>Lay Over</strong>
                  <span>{overStakePct}% · {fmtBrl(committed.over)}</span>
                </div>
                <div className="term-stake-bar is-blue">
                  <i style={{ width: `${overStakePct}%` }} />
                </div>
              </div>
            </div>
            <div className="term-available-row">
              <div>
                <span>Capital disponível</span>
                <strong>{fmtBrl(committed.available)}</strong>
              </div>
              <Donut lay3x3Pct={lay3x3AllocPct} overPct={overAllocPct} availablePct={availPct} />
            </div>
            {!configured && !bankrollLoading && (
              <p className="term-hint">
                Conecte o Supabase (central3x3) para sincronizar banca e extrato reais.
              </p>
            )}
          </article>

          <article className="term-panel">
            <header className="term-panel-head">
              <h3>Evolução da banca</h3>
            </header>
            <BankrollLineChart points={evolution} />
          </article>

          <div className="term-signals-row">
            <article className="term-panel term-signal-card">
              <h4>LAY 3x3</h4>
              <div className="term-signal-status">
                <span className="term-dot is-live" />
                {signalStats.lay3x3.operating ? "OPERANDO" : "MONITORANDO"}
              </div>
              <dl className="term-signal-stats">
                <div><dt>Filtros</dt><dd>{signalStats.lay3x3.filters}</dd></div>
                <div><dt>Entradas</dt><dd>{signalStats.lay3x3.entries}</dd></div>
                <div><dt>Aguardando</dt><dd>{signalStats.lay3x3.waiting}</dd></div>
              </dl>
            </article>
            <article className="term-panel term-signal-card">
              <h4>LAY QOV ZEBRA</h4>
              <div className="term-signal-status">
                <span className="term-dot is-watch" />
                {signalStats.qovLay.monitoring ? "Monitorando" : "Standby"}
              </div>
              <dl className="term-signal-stats">
                <div><dt>Eventos</dt><dd>{signalStats.qovLay.events}</dd></div>
                <div><dt>Entradas</dt><dd>{signalStats.qovLay.entries}</dd></div>
              </dl>
            </article>
            <article className="term-panel term-signal-card">
              <h4>EVENTOS RAROS</h4>
              <div className="term-signal-status">
                <span className="term-dot is-watch" />
                {signalStats.eventosRaros.monitoring ? "Monitorando" : "Standby"}
              </div>
              <dl className="term-signal-stats">
                <div><dt>Eventos</dt><dd>{signalStats.eventosRaros.events}</dd></div>
                <div><dt>Entradas</dt><dd>{signalStats.eventosRaros.entries}</dd></div>
              </dl>
            </article>
          </div>
        </div>

        <aside className="term-col-right term-insights-stack">
          <article className="term-panel">
            <Gauge value={todayRoiPct} max={dailyMetaPct} label="META" />
          </article>

          <article className="term-panel term-mini-stats">
            <div><span>Maior Green</span><strong className="is-up">{fmtBrl(stats.maxGreen, true)}</strong></div>
            <div><span>Maior Red</span><strong className="is-down">{fmtBrl(stats.maxRed, true)}</strong></div>
            <div><span>Sequência</span><strong>{stats.streak} Greens</strong></div>
            <div><span>Operações</span><strong>{stats.operations}</strong></div>
            <div><span>Dias positivos</span><strong>{stats.positiveDayPct.toFixed(0)}%</strong></div>
          </article>

          <article className="term-panel term-timeline-panel">
            <header className="term-panel-head">
              <h3>Linha do tempo</h3>
            </header>
            <ol className="term-timeline">
              {timeline.length === 0 && (
                <li className="term-timeline-empty">Sem operações recentes</li>
              )}
              {timeline.map((item, i) => (
                <li key={i} className={item.done ? "is-done" : "is-pending"}>
                  <time>{item.time}</time>
                  <div>
                    <strong>
                      {item.done ? "✔" : "○"}{" "}
                      {item.kind === "entrada" ? "Entrada Lay" : item.kind === "hedge" ? item.label : item.label}
                    </strong>
                    {item.kind === "entrada" && <p>{item.label}</p>}
                    {item.profit != null && (
                      <p className={item.profit >= 0 ? "is-up" : "is-down"}>
                        {fmtBrl(item.profit, true)}
                      </p>
                    )}
                  </div>
                  {i < timeline.length - 1 && <span className="term-timeline-arrow">↓</span>}
                </li>
              ))}
            </ol>
          </article>
        </aside>
      </section>

      {/* Tabelas dinâmicas — crescem conforme eventos/operações */}
      <section className="term-dynamic-stack">
        <article className="term-panel term-live-panel">
          <header className="term-panel-head">
            <h3>Eventos em Tempo Real</h3>
            <span className="term-live-count">{inplay.length} ao vivo</span>
          </header>
          <div className="term-table-scroll">
            <table className="term-table">
              <thead>
                <tr>
                  <th>Liga</th>
                  <th>Jogo</th>
                  <th>Mercado</th>
                  <th>Tempo</th>
                  <th>Lay</th>
                  <th>Back</th>
                  <th>Lucro</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inplay.length === 0 && (
                  <tr>
                    <td colSpan={8} className="term-empty-cell">
                      Nenhum evento ao vivo monitorado
                    </td>
                  </tr>
                )}
                {inplay.map((row) => {
                  const plan = row.tradePlan ?? row.analysis.tradePlan;
                  const lay = plan?.layOdds ?? row.analysis.quotes?.lay.odds;
                  const back = plan?.targetBackOdds ?? row.analysis.quotes?.back.odds;
                  const profit = plan?.example?.profit;
                  const [home, away] = row.analysis.home && row.analysis.away
                    ? [row.analysis.home, row.analysis.away]
                    : row.analysis.eventName.split(/\s+vs\s+/i);
                  const open = row.confirmed || row.live?.status !== "CLOSED";
                  const market = resolveLiveMarket(row, lay);
                  const marketClass =
                    market.startsWith("Lay QOV") || market.startsWith("Lay Over")
                    ? "term-market is-over"
                    : "term-market";
                  return (
                    <tr
                      key={row.analysis.eventId}
                      className="term-table-row-click"
                      onClick={() => onOpenEvent?.(row.analysis.eventId)}
                    >
                      <td>{row.analysis.competition ?? "—"}</td>
                      <td>
                        <span className="term-match">
                          {home} <em>x</em> {away}
                        </span>
                      </td>
                      <td>
                        <span className={marketClass}>{market}</span>
                      </td>
                      <td>{row.live?.minute != null ? `${row.live.minute}′` : "—"}</td>
                      <td>{lay?.toFixed(2) ?? "—"}</td>
                      <td>{back?.toFixed(2) ?? "—"}</td>
                      <td className={profit != null && profit >= 0 ? "is-up" : profit != null ? "is-down" : ""}>
                        {profit != null ? fmtBrl(profit, true) : "—"}
                      </td>
                      <td>
                        <span className={`term-status ${open ? "is-open" : "is-closed"}`}>
                          {open ? "● Aberto" : "✔ Fechado"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="term-panel term-extract-panel">
          <header className="term-panel-head">
            <h3>Extrato das Operações</h3>
          </header>
          <div className="term-table-scroll">
            <table className="term-table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Evento</th>
                  <th>Mercado</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Stake</th>
                  <th>Lucro</th>
                </tr>
              </thead>
              <tbody>
                {extractRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="term-empty-cell">
                      Nenhuma operação registrada
                    </td>
                  </tr>
                )}
                {extractRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.time}</td>
                    <td>{r.event}</td>
                    <td>{r.market}</td>
                    <td>Lay {r.entryOdd}</td>
                    <td>{r.exitOdd === "—" ? "—" : `Back ${r.exitOdd}`}</td>
                    <td>{fmtBrl(r.stake)}</td>
                    <td className={r.profit == null ? "" : r.profit >= 0 ? "is-up" : "is-down"}>
                      {r.profit == null ? "—" : fmtBrl(r.profit, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <footer className="term-foot">
        <span><i className="term-dot is-live" /> Sistema conectado</span>
        <span>API Online</span>
        <span>Odds em Tempo Real</span>
        <span>Última sincronização · {lastSyncSec}s atrás</span>
      </footer>
    </div>
  );
}

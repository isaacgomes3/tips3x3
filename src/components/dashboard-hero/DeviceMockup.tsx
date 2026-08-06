"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const MARKETS = [
  { label: "Lay 3x3", odds: ["2,05", "2,86"], dot: "brand" as const },
  { label: "Under 3.5", odds: ["2,10", "1,72"], dot: "info" as const },
  { label: "Under 4.5", odds: ["1,88", "2,24"], dot: "info" as const },
  { label: "Under Limite", odds: ["1,95", "2,12"], dot: "brand" as const },
  { label: "Lay QOV Zebra", odds: ["2,50", "3,05"], dot: "violet" as const },
];

function MarketList({ compact = false }: { compact?: boolean }) {
  const items = compact ? MARKETS.slice(0, 4) : MARKETS;
  return (
    <div className="dvm-list">
      {items.map((m) => (
        <div className="dvm-list-row" key={m.label}>
          <span className={`dvm-dot dvm-dot-${m.dot}`} />
          <span className="dvm-list-label">{m.label}</span>
          <span className="dvm-odd">{m.odds[0]}</span>
          <span className="dvm-odd dvm-odd-brand">{m.odds[1]}</span>
        </div>
      ))}
    </div>
  );
}

function ProfitChart() {
  return (
    <div className="dvm-chart">
      <div className="dvm-chart-head">
        <span>Gráfico de lucro</span>
        <strong>+12,82%</strong>
      </div>
      <svg viewBox="0 0 160 56" className="dvm-sparkline" aria-hidden>
        <defs>
          <linearGradient id="dvmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points="0,44 20,40 40,42 60,30 80,32 100,18 120,22 140,8 160,10"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon
          points="0,44 20,40 40,42 60,30 80,32 100,18 120,22 140,8 160,10 160,56 0,56"
          fill="url(#dvmFill)"
        />
      </svg>
    </div>
  );
}

function RecentOps() {
  const ops = [
    { label: "Lay 3x3 · 2-2", result: "+R$ 42,00", ok: true },
    { label: "Under 3.5", result: "+R$ 18,50", ok: true },
    { label: "Lay QOV Zebra", result: "+R$ 27,10", ok: true },
  ];
  return (
    <div className="dvm-ops">
      <span className="dvm-ops-head">Últimas operações</span>
      {ops.map((op) => (
        <div className="dvm-ops-row" key={op.label}>
          <span>{op.label}</span>
          <span className="dvm-ops-result">{op.result}</span>
        </div>
      ))}
    </div>
  );
}

export default function DeviceMockup({
  onSeeOperations,
}: {
  onSeeOperations?: () => void;
}) {
  return (
    <div className="dvm-stage">
      <div className="dvm-glow" aria-hidden />

      <motion.div
        className="dvm-laptop"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: [0, -8, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: "easeOut" },
          y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.7 },
        }}
      >
        <div className="dvm-laptop-screen">
          <div className="dvm-topbar">
            <span className="dvm-logo">tips3x3</span>
            <span className="dvm-live-badge">
              <span className="dvm-live-dot" />
              Mercados Ativos
            </span>
          </div>
          <div className="dvm-body">
            <div className="dvm-col">
              <span className="dvm-col-head">Mercados Ativos</span>
              <MarketList />
            </div>
            <div className="dvm-col">
              <ProfitChart />
              <RecentOps />
              <div className="dvm-status-row">
                <span className="dvm-status-pill dvm-status-ok">
                  Lucro diário +R$ 312,40
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="dvm-laptop-base" />
        <div className="dvm-laptop-shadow" aria-hidden />
      </motion.div>

      <motion.div
        className="dvm-phone"
        initial={{ opacity: 0, y: 30, rotate: 0 }}
        animate={{ opacity: 1, y: [0, -6, 0], rotate: -6 }}
        transition={{
          opacity: { duration: 0.7, ease: "easeOut", delay: 0.15 },
          y: { duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.9 },
          rotate: { duration: 0.7, ease: "easeOut", delay: 0.15 },
        }}
      >
        <div className="dvm-phone-screen">
          <div className="dvm-topbar dvm-topbar-sm">
            <span className="dvm-logo">tips3x3</span>
            <span className="dvm-live-dot" />
          </div>
          <div className="dvm-phone-card">
            <span className="dvm-phone-label">Automação Ativa</span>
            <strong className="dvm-phone-value">Lucro do dia +R$ 312,40</strong>
          </div>
          <span className="dvm-col-head">Mercados ativos</span>
          <MarketList compact />
          <button
            type="button"
            className="dvm-phone-cta"
            onClick={onSeeOperations}
          >
            Ver Operações <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

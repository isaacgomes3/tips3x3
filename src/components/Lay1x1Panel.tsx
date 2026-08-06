"use client";

import { useState, useEffect } from "react";
import { LAY_1X1 } from "@/lib/analysis/lay-1x1";
import { syncAutoLayBackground } from "@/lib/betbra/auto-lay-bg";
import { isLay1x1Enabled, setLay1x1Enabled } from "@/lib/strategy-settings";
import { CollapsePanel } from "./CollapsePanel";
import type { Lay1x1Snapshot } from "@/lib/analysis/lay-1x1";

interface Lay1x1PanelProps {
  snapshots?: (Lay1x1Snapshot & {
    mexchangeUrl?: string;
    eventId?: string;
    eventName?: string;
  })[];
}

const TONE_COLORS: Record<string, string> = {
  good: "text-green-400",
  warn: "text-yellow-400",
  bad: "text-red-400",
  idle: "text-zinc-500",
};

const TONE_BG: Record<string, string> = {
  good: "bg-green-900/30 border-green-700/40",
  warn: "bg-yellow-900/30 border-yellow-700/40",
  bad: "bg-red-900/30 border-red-700/40",
  idle: "bg-zinc-800/30 border-zinc-700/40",
};

export function Lay1x1Panel({ snapshots = [] }: Lay1x1PanelProps) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isLay1x1Enabled());
  }, []);

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    setLay1x1Enabled(checked);
    void syncAutoLayBackground();
  };

  const readySnaps = snapshots.filter((s) => s.entryReady && !s.settled);
  const watchSnaps = snapshots.filter((s) => !s.entryReady && !s.settled);

  const badge =
    readySnaps.length > 0 ? (
      <span className="badge badge-entry animate-pulse">
        ⚽ {readySnaps.length} ENTRADA
      </span>
    ) : enabled ? (
      <span className="badge badge-success">Ativo</span>
    ) : (
      <span className="badge badge-muted">Desativado</span>
    );

  return (
    <CollapsePanel
      title="Lay 1x1"
      subtitle={`Favorito 1x0 + pressão → Lay Placar Exato 1-1 · odd ${LAY_1X1.oddsBand.min}–${LAY_1X1.oddsBand.max}`}
      open={open}
      onToggle={() => setOpen(!open)}
      badge={badge}
      className="lay-1x1-panel"
    >
      <div className="panel-content">
        {/* Ativação */}
        <div className="setting-group">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleEnabledChange(e.target.checked)}
              className="setting-checkbox"
            />
            <span>Ativar filtro Lay 1x1</span>
          </label>
          <p className="setting-hint">
            Quando ativo, monitora jogos com favorito vencendo 1x0 e mantendo
            pressão. No 2º tempo, sinaliza entrada Lay no Placar Exato 1-1 com
            odd entre {LAY_1X1.oddsBand.min}–{LAY_1X1.oddsBand.max}. Somente
            Lay — sem Back.
          </p>
        </div>

        {/* Configuração da faixa */}
        <div className="setting-group mt-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/40">
          <p className="text-xs font-semibold text-zinc-300 mb-2">
            Faixa de Odd Lay
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
            <div>
              <span className="block text-zinc-500">Mínima</span>
              <span className="text-white font-mono">
                x{LAY_1X1.oddsBand.min.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500">Máxima</span>
              <span className="text-white font-mono">
                x{LAY_1X1.oddsBand.max.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500">Faixa preferida</span>
              <span className="text-green-400 font-mono">
                x{LAY_1X1.oddsBand.preferredMin}–{LAY_1X1.oddsBand.preferredMax}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500">2º tempo a partir de</span>
              <span className="text-white font-mono">
                {LAY_1X1.secondHalfMinute}&apos;
              </span>
            </div>
          </div>
        </div>

        {/* Entradas disponíveis */}
        {readySnaps.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
              ⚽ Entradas prontas ({readySnaps.length})
            </p>
            <div className="space-y-2">
              {readySnaps.map((snap, i) => (
                <SnapCard key={snap.marketId ?? i} snap={snap} />
              ))}
            </div>
          </div>
        )}

        {/* Monitorando */}
        {watchSnaps.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2">
              Monitorando ({watchSnaps.length})
            </p>
            <div className="space-y-2">
              {watchSnaps.map((snap, i) => (
                <SnapCard key={snap.marketId ?? `w${i}`} snap={snap} />
              ))}
            </div>
          </div>
        )}

        {snapshots.length === 0 && (
          <p className="mt-4 text-xs text-zinc-500 text-center py-4">
            Nenhum jogo com setup 1x0 no momento
          </p>
        )}
      </div>
    </CollapsePanel>
  );
}

function SnapCard({
  snap,
}: {
  snap: Lay1x1Snapshot & {
    mexchangeUrl?: string;
    eventId?: string;
    eventName?: string;
  };
}) {
  const borderClass = snap.entryReady
    ? "border-green-600/60 bg-green-900/20"
    : "border-zinc-700/40 bg-zinc-800/20";

  return (
    <div
      className={`rounded-lg border p-3 text-xs ${borderClass}`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-2">
        <div>
          {snap.eventName && (
            <span className="font-semibold text-zinc-200 block">
              {snap.eventName}
            </span>
          )}
          <span className="text-zinc-400">
            {snap.homeScore ?? "?"}-{snap.awayScore ?? "?"}{" "}
            {snap.minute != null ? `· ${snap.minute}'` : ""}
            {snap.favoriteSide
              ? ` · fav. ${snap.favoriteSide === "home" ? "casa" : "fora"}`
              : ""}
          </span>
        </div>
        <div className="text-right">
          {snap.layOdds != null && (
            <span className="font-mono text-sm font-bold text-white">
              x{snap.layOdds.toFixed(2)}
            </span>
          )}
          <span className="block text-zinc-500">Lay 1-1</span>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        {snap.indicators.map((ind) => (
          <div
            key={ind.id}
            className={`rounded border px-1 py-1 text-center ${TONE_BG[ind.tone]}`}
            title={ind.detail}
          >
            <span className="block text-base leading-none">{ind.icon}</span>
            <span className={`block text-[10px] mt-0.5 ${TONE_COLORS[ind.tone]}`}>
              {ind.label}
            </span>
          </div>
        ))}
      </div>

      {/* Resumo */}
      <p className="text-zinc-400 leading-tight">{snap.summary}</p>

      {/* Botão mexchange */}
      {snap.mexchangeUrl && (
        <a
          href={snap.mexchangeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[10px] text-blue-400 hover:text-blue-300 underline"
        >
          Abrir na exchange →
        </a>
      )}
    </div>
  );
}

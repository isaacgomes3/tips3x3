/**
 * Filtros de estratégia do painel (localStorage).
 * - Definem quais estratégias aparecem nas pills / na lista de jogos.
 * - Lay 3x3, Eventos raros e Lucro certo são também as chaves de execução do
 *   Auto Lay no APK (sincronizadas por syncAutoLayBackground).
 * - Mandam também na execução pela extensão: `activeExtSignalKinds()` vai no
 *   /api/live e o servidor só publica na fila o que estiver ligado aqui.
 * - NÃO silenciam o alerta ENTRAR. Stake e lucro da extensão ficam no HUD dela.
 */

import type { SignalStrategy } from "@/lib/strategy-priority";

const LAY3X3_KEY = "tips3x3-strategy-lay-3x3";
const LAY_1X1_KEY = "tips3x3-strategy-lay-1x1";
const QOV_KEY = "tips3x3-strategy-qov";
const EVENTOS_RAROS_KEY = "tips3x3-strategy-eventos-raros";
const LUCRO_CERTO_KEY = "tips3x3-strategy-lucro-certo";
const OVER35_KEY = "tips3x3-strategy-over-35";
const OVER45_KEY = "tips3x3-strategy-over-45";
const LAY_OVER_LIMIT_PRESSURE_KEY = "tips3x3-strategy-lay-over-limit-pressure";
const ACTIVE_STRATEGY_KEY = "tips3x3-active-strategy";
const ONLY_LIVE_KEY = "tips3x3-filter-only-live";
const ONLY_FAVORITES_KEY = "tips3x3-filter-only-favorites";

/** Mesmo conjunto de estratégias da precedência de sinal. */
export type PanelStrategyId = SignalStrategy;

/** Ordem das pills no painel — não é a precedência de sinal. */
const STRATEGY_IDS: PanelStrategyId[] = [
  "lay-3x3",
  "lay-1x1",
  "qov-lay-zebra",
  "eventos-raros",
  "lucro-certo",
  "over-3.5",
  "over-4.5",
  "lay-over-limit-pressure",
];

function readFlag(key: string, defaultOn: boolean): boolean {
  if (typeof window === "undefined") return defaultOn;
  try {
    const v = window.localStorage.getItem(key);
    if (v == null) return defaultOn;
    return v === "1";
  } catch {
    return defaultOn;
  }
}

function writeFlag(key: string, on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Default ON. */
export function isLay3x3Enabled(): boolean {
  return readFlag(LAY3X3_KEY, true);
}

export function setLay3x3Enabled(on: boolean) {
  writeFlag(LAY3X3_KEY, on);
}

/** QOV lay zebra — Lay→Back automático na zebra do Placar Exato. */
export function isQovEnabled(): boolean {
  return readFlag(QOV_KEY, true);
}

export function setQovEnabled(on: boolean) {
  writeFlag(QOV_KEY, on);
}

/** Default ON (admin + extensão já expõem Eventos raros). */
export function isEventosRarosEnabled(): boolean {
  return readFlag(EVENTOS_RAROS_KEY, true);
}

export function setEventosRarosEnabled(on: boolean) {
  writeFlag(EVENTOS_RAROS_KEY, on);
}

/** Lucro certo (placar já impossível) — independente de Eventos raros. Default ON. */
export function isLucroCertoEnabled(): boolean {
  return readFlag(LUCRO_CERTO_KEY, true);
}

export function setLucroCertoEnabled(on: boolean) {
  writeFlag(LUCRO_CERTO_KEY, on);
}

/** Lay Over 3.5 — default ON. */
export function isOver35Enabled(): boolean {
  return readFlag(OVER35_KEY, true);
}

export function setOver35Enabled(on: boolean) {
  writeFlag(OVER35_KEY, on);
}

/** Lay Over 4.5 — default ON. */
export function isOver45Enabled(): boolean {
  return readFlag(OVER45_KEY, true);
}

export function setOver45Enabled(on: boolean) {
  writeFlag(OVER45_KEY, on);
}

export function getActiveStrategy(): PanelStrategyId {
  if (typeof window === "undefined") return "lay-3x3";
  try {
    const v = window.localStorage.getItem(ACTIVE_STRATEGY_KEY);
    if (v && (STRATEGY_IDS as string[]).includes(v)) {
      return v as PanelStrategyId;
    }
  } catch {
    /* ignore */
  }
  return "lay-3x3";
}

export function setActiveStrategy(id: PanelStrategyId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_STRATEGY_KEY, id);
  } catch {
    /* ignore */
  }
}

export function isOnlyLiveFilter(): boolean {
  return readFlag(ONLY_LIVE_KEY, false);
}

export function setOnlyLiveFilter(on: boolean) {
  writeFlag(ONLY_LIVE_KEY, on);
}

export function isOnlyFavoritesFilter(): boolean {
  return readFlag(ONLY_FAVORITES_KEY, false);
}

export function setOnlyFavoritesFilter(on: boolean) {
  writeFlag(ONLY_FAVORITES_KEY, on);
}

/** Lay Over Limite com Pressão — default ON. */
export function isLayOverLimitPressureEnabled(): boolean {
  return readFlag(LAY_OVER_LIMIT_PRESSURE_KEY, true);
}

export function setLayOverLimitPressureEnabled(on: boolean) {
  writeFlag(LAY_OVER_LIMIT_PRESSURE_KEY, on);
}

/** Lay 1x1 — favorito 1x0 com pressão → lay no placar exato 1-1. Default ON. */
export function isLay1x1Enabled(): boolean {
  return readFlag(LAY_1X1_KEY, true);
}

export function setLay1x1Enabled(on: boolean) {
  writeFlag(LAY_1X1_KEY, on);
}

/**
 * Estratégias liberadas para a execução automática, no formato `kind` da fila
 * da extensão. É o que o painel manda no /api/live (`extMarkets`).
 */
export function activeExtSignalKinds(): string[] {
  const kinds: string[] = [];
  if (isLay3x3Enabled()) kinds.push("lay-3x3");
  if (isLay1x1Enabled()) kinds.push("lay-1x1");
  if (isQovEnabled()) kinds.push("qov-lay-zebra");
  if (isEventosRarosEnabled()) kinds.push("eventos-raros");
  if (isLucroCertoEnabled()) kinds.push("lucro-certo");
  if (isOver35Enabled()) kinds.push("over-3.5");
  if (isOver45Enabled()) kinds.push("over-4.5");
  if (isLayOverLimitPressureEnabled()) kinds.push("lay-over-limit-pressure");
  return kinds;
}

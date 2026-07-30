import { getLayOddsWindow, getPreliveMinScore } from "../betbra/config";
import type { BetBraEvent } from "../betbra/types";
import {
  extractBttsYes,
  extractLay3x3,
  extractMatchOdds,
  extractOver25,
  extractOverMarket,
  splitTeams,
} from "./markets";
import {
  emptyEventosRarosSnapshot,
  type EventosRarosSnapshot,
} from "./eventos-raros";
import { buildOverLimiteSnapshot, type OverLimiteSnapshot } from "./over-limite";
import { emptyQovSnapshot, type QovSnapshot } from "./qov";
import { buildTradePlan, type TradePlan } from "./trade-plan";

export type SignalLevel = "strong" | "ok" | "weak" | "fail";

export interface AnalysisSignal {
  id: string;
  label: string;
  detail: string;
  level: SignalLevel;
  weight: number;
  score: number;
}

export interface PreLiveAnalysis {
  eventId: string;
  eventName: string;
  home: string;
  away: string;
  start: string;
  competition?: string;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  oddsSource: "lay" | "last-matched" | "back" | "none";
  /** Cotações do book 3-3 (back azul / lay rosa) */
  quotes: {
    back: { odds: number | null; amount: number };
    lay: { odds: number | null; amount: number };
    lastMatched: number | null;
  };
  liquidity: number;
  volume3x3: number;
  matchOdds: ReturnType<typeof extractMatchOdds>;
  bttsYes: number | null;
  over25: number | null;
  /** Snapshot Lay Over 2.5 (indicadores + ícones) */
  overLimite: OverLimiteSnapshot;
  /** Snapshot Lay Over 3.5 (mesma lógica, linha 3.5) */
  overLimite35: OverLimiteSnapshot;
  /** QOV live-only — stub pré-live com entryReady=false */
  qovLayUnderdog: QovSnapshot;
  /** Eventos raros CS lay≥100 — stub pré-live */
  eventosRaros: EventosRarosSnapshot;
  signals: AnalysisSignal[];
  score: number;
  idealOdds: boolean;
  watchlist: boolean;
  summary: string;
  pattern: LivePatternExpectation;
  tradePlan: TradePlan;
  analyzedAt: string;
}

export interface LivePatternExpectation {
  allowScores: string[];
  preferMinuteFrom: number;
  preferMinuteTo: number;
  maxGoalsBeforeEntry: number;
  requireCompetitive: boolean;
}

function levelFromScore(score: number): SignalLevel {
  if (score >= 85) return "strong";
  if (score >= 65) return "ok";
  if (score >= 40) return "weak";
  return "fail";
}

function oddsInWindow(odds: number | null, min: number, max: number) {
  if (odds == null || !Number.isFinite(odds)) return false;
  return odds >= min && odds <= max;
}

function buildSummary(opts: {
  watchlist: boolean;
  idealOdds: boolean;
  score: number;
  minScore: number;
  layOdds: number | null;
  preferredMax: number;
  windowMin: number;
  windowMax: number;
  targetBack: number | null;
}): string {
  const {
    watchlist,
    idealOdds,
    score,
    minScore,
    layOdds,
    preferredMax,
    windowMin,
    windowMax,
    targetBack,
  } = opts;

  if (watchlist) {
    return `Pré-live OK (${score}/100): lay ${layOdds?.toFixed(0)} · preferir ≤${preferredMax} para ~1% rápido. Alvo back ~${targetBack?.toFixed(0) ?? "—"}.`;
  }
  if (idealOdds) {
    return `Odd na janela, mas score ${score}/100 abaixo do mínimo ${minScore}. Revisar sinais fracos.`;
  }
  return `Fora da janela (${windowMin}–${windowMax}). Preferir lay ${windowMin}–${preferredMax} (menos risco, correção ~1% mais rápida).`;
}

export function analyzePreLive(
  event: BetBraEvent,
  opts?: { targetProfitPct?: number },
): PreLiveAnalysis {
  const window = getLayOddsWindow();
  const minScore = getPreliveMinScore();
  const { home, away } = splitTeams(event.name);
  const lay3x3 = extractLay3x3(event);
  const matchOdds = extractMatchOdds(event);
  const bttsYes = extractBttsYes(event);
  const over25 = extractOver25(event);
  const overMkt = extractOverMarket(event, 2.5);
  const overMkt35 = extractOverMarket(event, 3.5);
  const competition = event["meta-tags"]?.find((t) => t.type === "COMPETITION")
    ?.name;

  const signals: AnalysisSignal[] = [];

  // 1) Odd lay 3-3 — favorece faixa baixa (correção 1% rápida, menos risco)
  {
    const odds = lay3x3.referenceOdds;
    const inHard = oddsInWindow(odds, window.min, window.max);
    const inPreferred =
      odds != null &&
      Number.isFinite(odds) &&
      odds >= window.min &&
      odds <= window.preferredMax;
    let score = 10;
    if (inPreferred) {
      score = lay3x3.source === "lay" ? 100 : 85;
    } else if (inHard) {
      const t =
        (odds! - window.preferredMax) /
        Math.max(window.max - window.preferredMax, 1);
      score = Math.round(72 - t * 28);
      if (lay3x3.source !== "lay") score = Math.max(40, score - 12);
    } else if (odds) {
      score = 35;
    }
    signals.push({
      id: "odds-window",
      label: "Odd lay 3-3",
      detail: odds
        ? `${odds.toFixed(2)} (${lay3x3.source}) · preferir ${window.min}–${window.preferredMax} (janela dura ${window.min}–${window.max})`
        : "Sem odd de referência no book",
      level: levelFromScore(score),
      weight: 30,
      score,
    });
  }

  // 2) Liquidez / volume no 3-3
  {
    const hasBook = lay3x3.liquidity >= window.minLiquidity;
    const hasVol = lay3x3.volume > 0;
    const score = hasBook ? 95 : hasVol ? 70 : 25;
    signals.push({
      id: "liquidity",
      label: "Liquidez 3-3",
      detail: `Lay disponível R$ ${lay3x3.liquidity.toFixed(2)} · volume ${lay3x3.volume.toFixed(2)}`,
      level: levelFromScore(score),
      weight: 15,
      score,
    });
  }

  // 3) Match Odds equilibrado
  {
    const homeOdds = matchOdds.home.back ?? null;
    const awayOdds = matchOdds.away.back ?? null;
    const favorite = Math.min(homeOdds ?? Infinity, awayOdds ?? Infinity);
    let score = 40;
    if (Number.isFinite(favorite)) {
      if (favorite >= 1.7 && favorite <= 2.8) score = 95;
      else if (favorite >= 1.45 && favorite <= 3.4) score = 75;
      else if (favorite < 1.35) score = 25;
      else score = 55;
    }
    signals.push({
      id: "balance",
      label: "Equilíbrio 1X2",
      detail:
        homeOdds && awayOdds
          ? `Casa ${homeOdds.toFixed(2)} · Fora ${awayOdds.toFixed(2)}`
          : "1X2 indisponível",
      level: levelFromScore(score),
      weight: 20,
      score,
    });
  }

  // 4) BTTS / gols
  {
    let score = 45;
    if (bttsYes != null) {
      if (bttsYes <= 1.7) score = 90;
      else if (bttsYes <= 2.1) score = 75;
      else score = 50;
    }
    if (over25 != null && over25 <= 1.85) score = Math.min(100, score + 8);
    signals.push({
      id: "goals-profile",
      label: "Perfil de gols",
      detail: `BTTS Sim ${bttsYes?.toFixed(2) ?? "—"} · Over 2.5 ${over25?.toFixed(2) ?? "—"}`,
      level: levelFromScore(score),
      weight: 20,
      score,
    });
  }

  // 5) Volume geral do evento
  {
    const vol = event.volume ?? 0;
    const score = vol > 20000 ? 90 : vol > 5000 ? 70 : vol > 1000 ? 55 : 30;
    signals.push({
      id: "event-volume",
      label: "Volume do evento",
      detail: `R$ ${vol.toFixed(0)}`,
      level: levelFromScore(score),
      weight: 15,
      score,
    });
  }

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const score = Math.round(
    signals.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight,
  );

  const idealOdds = oddsInWindow(lay3x3.referenceOdds, window.min, window.max);
  const watchlist = idealOdds && score >= minScore;
  const tradePlan = buildTradePlan({
    layOdds: lay3x3.referenceOdds,
    matchOdds,
    targetProfitPct: opts?.targetProfitPct,
  });

  const favoriteSide =
    (matchOdds.home.back ?? 99) <= (matchOdds.away.back ?? 99) ? "home" : "away";

  const overLimite = buildOverLimiteSnapshot({
    layOdds: overMkt.layOdds,
    backOdds: overMkt.backOdds,
    layLiquidity: overMkt.liquidity,
    marketId: overMkt.marketId,
    runnerId: overMkt.runnerId,
    over25Back: over25,
    matchOdds,
    favoriteSide,
    line: 2.5,
  });

  const overLimite35 = buildOverLimiteSnapshot({
    layOdds: overMkt35.layOdds,
    backOdds: overMkt35.backOdds,
    layLiquidity: overMkt35.liquidity,
    marketId: overMkt35.marketId,
    runnerId: overMkt35.runnerId,
    over25Back: overMkt35.backOdds,
    matchOdds,
    favoriteSide,
    line: 3.5,
  });

  const summaryText = buildSummary({
    watchlist,
    idealOdds,
    score,
    minScore,
    layOdds: lay3x3.referenceOdds,
    preferredMax: window.preferredMax,
    windowMin: window.min,
    windowMax: window.max,
    targetBack: tradePlan.targetBackOdds,
  });

  return {
    eventId: event.id,
    eventName: event.name,
    home,
    away,
    start: event.start,
    competition,
    marketId: lay3x3.market?.id,
    runnerId: lay3x3.runner?.id,
    layOdds: lay3x3.referenceOdds,
    oddsSource: lay3x3.source,
    quotes: lay3x3.quotes,
    liquidity: lay3x3.liquidity,
    volume3x3: lay3x3.volume,
    matchOdds,
    bttsYes,
    over25,
    overLimite,
    overLimite35,
    qovLayUnderdog: emptyQovSnapshot("lay-underdog"),
    eventosRaros: emptyEventosRarosSnapshot(),
    signals,
    score,
    idealOdds,
    watchlist,
    summary: summaryText,
    pattern: {
      allowScores: [
        "0-0",
        "1-0",
        "0-1",
        "1-1",
        "2-0",
        "0-2",
        "2-1",
        "1-2",
        "3-0",
        "0-3",
        "3-1",
        "1-3",
      ],
      preferMinuteFrom: 15,
      preferMinuteTo: 70,
      maxGoalsBeforeEntry: 3,
      requireCompetitive: true,
    },
    tradePlan,
    analyzedAt: new Date().toISOString(),
  };
}

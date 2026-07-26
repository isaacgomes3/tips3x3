import type { OddsHistoryPoint } from "../betbra/odds-history";
import type { InplayEvent } from "../betbra/types";
import { getLayOddsWindow, getTradeConfig } from "../betbra/config";
import type { TeamFormReport } from "../fotmob/form";
import {
  analyzeCorrection,
  type CorrectionAnalysis,
} from "./correction";
import { analyzeFluidity, type FluidityReport } from "./fluidity";
import {
  isEntryScoreAllowed,
  resolveInitialFavorite,
  scoreFromInplay,
} from "./score-entry";

export type RiskTier = "baixo" | "medio" | "alto" | "fora";

export interface TradeRiskProfile {
  tier: RiskTier;
  /** Quanto a odd precisa subir (%) do lay até o back-alvo */
  requiredMovePct: number | null;
  /** Liability por R$ 1 de stake (lay - 1) */
  liabilityMultiple: number | null;
  /** Lay favorece saída rápida de ~1% (faixa preferida) */
  favorsQuickCorrection: boolean;
  detail: string;
}

export interface TradePlan {
  layOdds: number | null;
  inEntryWindow: boolean;
  window: { min: number; max: number; preferredMax: number };
  /** Odd back alvo para ~targetProfitPct da liability */
  targetBackOdds: number | null;
  targetProfitPct: number;
  /** Lucro estimado / liability se sair no alvo */
  expectedProfitOnLiability: number | null;
  risk: TradeRiskProfile;
  /** Exemplo com stake de referência */
  example: {
    layStake: number;
    liability: number;
    backStake: number | null;
    profit: number | null;
  } | null;
  oscillation: OscillationSignal | null;
  fluidity: FluidityReport | null;
  correction: CorrectionAnalysis | null;
  /** Favorito inicial (informativo) + elegibilidade do placar live */
  scoreGate: {
    favoriteOdd: number | null;
    favoriteSide: "home" | "away" | null;
    favoriteOk: boolean;
    scoreAllowed: boolean;
    scoreLabel: string | null;
    detail: string;
  };
  /** Histórico de gols / casa-fora — libera lay alta (RISCO) quando confirma. */
  teamForm: TeamFormReport | null;
  entryReady: boolean;
  summary: string;
}

export interface OscillationSignal {
  active: boolean;
  swingPct: number;
  recentMin: number;
  recentMax: number;
  lastOdd: number;
  matchedSpike: boolean;
  direction: "drop" | "spike" | "range" | "flat";
  detail: string;
}

/**
 * Odd back para greening com lucro ≈ targetPct da liability do lay.
 *
 * profit = layStake * (1 - layOdds/backOdds)
 * liability = layStake * (layOdds - 1)
 * profit/liability = targetPct
 * ⇒ backOdds = layOdds / (1 - targetPct * (layOdds - 1))
 *
 * Lay baixo → gap menor e menos risco (ex.: 25 → ~33).
 * Lay alto → gap grande (ex.: 50 → ~98) e liability alta.
 */
export function targetBackForLiabilityProfit(
  layOdds: number,
  targetPct = 0.01,
): number | null {
  if (!Number.isFinite(layOdds) || layOdds <= 1) return null;
  const denom = 1 - targetPct * (layOdds - 1);
  if (denom <= 0.05) return null;
  return layOdds / denom;
}

export function assessTradeRisk(
  layOdds: number | null,
  targetBackOdds: number | null,
  window: { min: number; max: number; preferredMax: number },
): TradeRiskProfile {
  if (layOdds == null || !Number.isFinite(layOdds)) {
    return {
      tier: "fora",
      requiredMovePct: null,
      liabilityMultiple: null,
      favorsQuickCorrection: false,
      detail: "Sem lay de referência.",
    };
  }

  const liabilityMultiple = layOdds - 1;
  const requiredMovePct =
    targetBackOdds != null && layOdds > 0
      ? ((targetBackOdds - layOdds) / layOdds) * 100
      : null;

  const inWindow = layOdds >= window.min && layOdds <= window.max;
  if (!inWindow) {
    return {
      tier: "fora",
      requiredMovePct,
      liabilityMultiple,
      favorsQuickCorrection: false,
      detail: `Fora da janela ${window.min}–${window.max}.`,
    };
  }

  const favorsQuickCorrection = layOdds <= window.preferredMax;

  if (favorsQuickCorrection) {
    return {
      tier: "baixo",
      requiredMovePct,
      liabilityMultiple,
      favorsQuickCorrection: true,
      detail: `Lay ${layOdds.toFixed(0)} favorece correção rápida (~${requiredMovePct?.toFixed(0) ?? "—"}% na odd) com liability menor.`,
    };
  }

  if (layOdds <= (window.preferredMax + window.max) / 2) {
    return {
      tier: "medio",
      requiredMovePct,
      liabilityMultiple,
      favorsQuickCorrection: false,
      detail: `Lay ${layOdds.toFixed(0)} ok, mas prefere ≤${window.preferredMax} para 1% mais rápido e menos risco.`,
    };
  }

  return {
    tier: "alto",
    requiredMovePct,
    liabilityMultiple,
    favorsQuickCorrection: false,
    detail: `Lay ${layOdds.toFixed(0)} exige movimento grande (~${requiredMovePct?.toFixed(0) ?? "—"}% → back ${targetBackOdds?.toFixed(0) ?? "—"}) e liability alta. Melhor esperar odd cair na faixa ${window.min}–${window.preferredMax}.`,
  };
}

export function greenBackStake(layStake: number, layOdds: number, backOdds: number) {
  if (backOdds <= 0) return null;
  return (layStake * layOdds) / backOdds;
}

export function greenProfit(layStake: number, layOdds: number, backOdds: number) {
  const backStake = greenBackStake(layStake, layOdds, backOdds);
  if (backStake == null) return null;
  return layStake - backStake;
}

export function detectOscillation(
  points: OddsHistoryPoint[],
  opts?: { lookback?: number; minSwingPct?: number; matchedSpikeFactor?: number },
): OscillationSignal | null {
  const lookback = opts?.lookback ?? 8;
  const minSwingPct = opts?.minSwingPct ?? 0.15;
  const matchedSpikeFactor = opts?.matchedSpikeFactor ?? 2;

  if (!points.length) return null;

  const recent = points.slice(-lookback);
  const odds = recent.map((p) => p.odd).filter((n) => n > 0);
  if (odds.length < 2) return null;

  const lastOdd = odds[odds.length - 1];
  const recentMin = Math.min(...odds);
  const recentMax = Math.max(...odds);
  const swingPct = (recentMax - recentMin) / Math.max(recentMin, 1e-9);

  const matched = recent.map((p) => Number(p.matched) || 0);
  const avgMatched =
    matched.reduce((s, n) => s + n, 0) / Math.max(matched.length, 1);
  const lastMatched = matched[matched.length - 1] ?? 0;
  const matchedSpike =
    avgMatched > 0 && lastMatched >= avgMatched * matchedSpikeFactor;

  const first = odds[0];
  let direction: OscillationSignal["direction"] = "flat";
  if (swingPct < minSwingPct * 0.4) direction = "flat";
  else if (lastOdd <= first * 0.92) direction = "drop";
  else if (lastOdd >= first * 1.08) direction = "spike";
  else direction = "range";

  const active = swingPct >= minSwingPct || matchedSpike;

  const detail = active
    ? `Oscilação ${(swingPct * 100).toFixed(0)}% (${recentMin.toFixed(0)}→${recentMax.toFixed(0)}) · agora ${lastOdd.toFixed(0)}${matchedSpike ? " · spike de matched" : ""}`
    : `Movimento fraco (${(swingPct * 100).toFixed(0)}%) · aguardar oscilação`;

  return {
    active,
    swingPct,
    recentMin,
    recentMax,
    lastOdd,
    matchedSpike,
    direction,
    detail,
  };
}

export function buildTradePlan(opts: {
  layOdds: number | null;
  historyPoints?: OddsHistoryPoint[];
  referenceStake?: number;
  inplay?: InplayEvent;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
  teamForm?: TeamFormReport | null;
}): TradePlan {
  const window = getLayOddsWindow();
  const trade = getTradeConfig();
  const layOdds = opts.layOdds;
  const inEntryWindow =
    layOdds != null &&
    Number.isFinite(layOdds) &&
    layOdds >= window.min &&
    layOdds <= window.max;

  const targetBackOdds =
    layOdds != null
      ? targetBackForLiabilityProfit(layOdds, trade.targetProfitPct)
      : null;

  const expectedProfitOnLiability =
    layOdds != null && targetBackOdds != null
      ? greenProfit(1, layOdds, targetBackOdds)! /
        Math.max(layOdds - 1, 1e-9)
      : null;

  const risk = assessTradeRisk(layOdds, targetBackOdds, window);

  const layStake = opts.referenceStake ?? trade.referenceStake;
  const example =
    layOdds != null && targetBackOdds != null
      ? {
          layStake,
          liability: layStake * (layOdds - 1),
          backStake: greenBackStake(layStake, layOdds, targetBackOdds),
          profit: greenProfit(layStake, layOdds, targetBackOdds),
        }
      : null;

  const oscillation = opts.historyPoints?.length
    ? detectOscillation(opts.historyPoints, {
        lookback: trade.oscillationLookback,
        minSwingPct: trade.minOscillationPct,
      })
    : null;

  const fluidity = opts.historyPoints?.length
    ? analyzeFluidity(opts.historyPoints, {
        lookback: Math.max(trade.oscillationLookback, 12),
        minSwingPct: trade.minOscillationPct,
      })
    : null;

  const correction = opts.historyPoints?.length
    ? analyzeCorrection({
        historyPoints: opts.historyPoints,
        inplay: opts.inplay,
        matchOdds: opts.matchOdds,
        crashOpts: {
          highLayPeakMin: trade.highLayPeakMin,
          minDropPct: trade.underdogCrashMinDropPct,
          goalShockMaxMinutes: trade.goalShockMaxMinutes,
          maxRecoveryPct: trade.crashMaxRecoveryPct,
        },
      })
    : null;

  const crash = correction?.underdogCrash;
  const crashSetup = Boolean(crash?.matched && crash.quality !== "none");

  const favorableCorrection = correction?.entryBias === "favor";
  const avoidCorrection = correction?.entryBias === "avoid";

  // Crash brutal (ex. 170→50): lay na borda da janela ainda é setup válido
  // se a correção ↑ acabou de começar — não exigir faixa ≤32.
  const crashEarlyBounce = Boolean(
    crashSetup &&
      crash?.quality === "strong" &&
      crash.favorsQuickBounce &&
      favorableCorrection &&
      (crash.recoveredPct ?? 1) <= trade.crashMaxRecoveryPct,
  );

  const favorite = resolveInitialFavorite(opts.matchOdds);
  const liveScore = scoreFromInplay(opts.inplay);
  let scoreAllowed = true;
  let scoreDetail = favorite.detail;
  let scoreLabel: string | null = null;

  if (!liveScore) {
    scoreAllowed = false;
    scoreDetail = "Aguardando placar live.";
  } else {
    scoreLabel = `${liveScore.home}-${liveScore.away}`;
    const gate = isEntryScoreAllowed(liveScore.home, liveScore.away);
    scoreAllowed = gate.allowed;
    scoreDetail = gate.reason;
  }

  const teamForm = opts.teamForm ?? null;
  const formConfirms = Boolean(teamForm?.confirmsHighScoring);
  const riskOk =
    risk.tier !== "alto" || crashEarlyBounce || formConfirms;

  const scoreGate = {
    favoriteOdd: favorite.odd,
    favoriteSide: favorite.side,
    favoriteOk: favorite.qualifies,
    scoreAllowed,
    scoreLabel,
    detail: scoreDetail,
  };

  const entryReady = Boolean(
    inEntryWindow &&
      targetBackOdds != null &&
      (fluidity?.tradable ?? false) &&
      !(fluidity?.lateralized ?? true) &&
      favorableCorrection &&
      !avoidCorrection &&
      riskOk &&
      scoreGate.scoreAllowed,
  );

  const pctLabel = `${(trade.targetProfitPct * 100).toFixed(0)}%`;
  const backLabel = targetBackOdds?.toFixed(0) ?? "—";

  let summary: string;
  if (layOdds == null) {
    summary = "Sem odd lay 3-3 de referência.";
  } else if (liveScore && !scoreGate.scoreAllowed) {
    summary = `Placar ${scoreGate.scoreLabel}: ${scoreGate.detail}`;
  } else if (crashSetup && crash) {
    if (!inEntryWindow && crash.phase === "trough") {
      summary = `${crash.detail} Odd atual ${layOdds.toFixed(0)} ainda fora de ${window.min}–${window.max} — se corrigir para baixo na janela ou subir após tick ↑, reavaliar.`;
    } else if (!inEntryWindow) {
      summary = `${crash.detail} Lay ${layOdds.toFixed(0)} fora da janela ${window.min}–${window.max}.`;
    } else if (crash.phase === "trough" || crash.phase === "shock") {
      summary = `${crash.detail} Setup armado na janela (lay ${layOdds.toFixed(0)}) — entrada só no 1º movimento ↑.`;
    } else if (entryReady) {
      summary = `ENTRADA (zebra-crash): lay ~${layOdds.toFixed(0)} em correção rápida pós ${crash.peakOdd.toFixed(0)}→${crash.troughOdd.toFixed(0)} → back ~${backLabel} (~${pctLabel}).`;
    } else if (favorableCorrection) {
      summary = `${crash.detail} Correção ↑ em curso; falta fluidez/liquidez para liberar entrada.`;
    } else {
      summary = crash.detail;
    }
  } else if (!inEntryWindow) {
    summary = `Lay ${layOdds.toFixed(0)} fora da janela ${window.min}–${window.max}. Preferir ${window.min}–${window.preferredMax} (correção ${pctLabel} mais rápida).`;
  } else if (risk.tier === "alto" && !riskOk) {
    summary = `Lay ${layOdds.toFixed(0)} alta (risco): ${teamForm?.detail ?? "sem histórico de gols confirmando abertura do jogo."} Preferir ≤${window.preferredMax} ou forma ofensiva.`;
  } else if (risk.tier === "alto" && formConfirms) {
    summary = entryReady
      ? `ENTRADA: lay ~${layOdds.toFixed(0)} (risco mitigado pela forma). ${teamForm?.detail ?? ""}`
      : `Lay ${layOdds.toFixed(0)} alta, mas forma sugere gols. ${teamForm?.detail ?? ""} Aguardando fluidez/correção.`;
  } else if (fluidity?.lateralized) {
    summary = `Lay ${layOdds.toFixed(0)} ok para ${pctLabel}, mas mercado lateral — sem fluidez. Não entrar só pela odd.`;
  } else if (correction && !favorableCorrection) {
    summary = `Lay ${layOdds.toFixed(0)} favorece ${pctLabel} (back ~${backLabel}), mas ainda sem correção. ${correction.summary}`;
  } else if (entryReady) {
    summary = `ENTRADA: lay ~${layOdds.toFixed(0)} em correção → back ~${backLabel} (~${pctLabel} liability, risco ${risk.tier}).`;
  } else if (risk.favorsQuickCorrection) {
    summary = `Lay ${layOdds.toFixed(0)} favorece correção rápida (~${pctLabel}, back ~${backLabel}). Espere movimento pós-choque — não só a odd.`;
  } else {
    summary = `Lay ${layOdds.toFixed(0)} na janela (risco ${risk.tier}). Ideal ≤${window.preferredMax} para ${pctLabel} em menos tempo. Alvo back ~${backLabel}.`;
  }

  return {
    layOdds,
    inEntryWindow,
    window: {
      min: window.min,
      max: window.max,
      preferredMax: window.preferredMax,
    },
    targetBackOdds,
    targetProfitPct: trade.targetProfitPct,
    expectedProfitOnLiability,
    risk,
    example,
    oscillation,
    fluidity,
    correction,
    scoreGate,
    teamForm,
    entryReady,
    summary,
  };
}

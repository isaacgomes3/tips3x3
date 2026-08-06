"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActiveAlertsPanel, type ActiveAlertItem } from "@/components/ActiveAlertsPanel";
import { CollapsePanel } from "@/components/CollapsePanel";
import { FavoriteStarButton } from "@/components/FavoriteStarButton";
import { MatchIntelCard } from "@/components/MatchIntelCard";
import { MomentAnalysisCard } from "@/components/MomentAnalysisCard";
import { OddsQuoteButtons } from "@/components/OddsQuoteButtons";
import { OddsVolumeChart } from "@/components/OddsVolumeChart";
import { LiveAlertToasts } from "@/components/LiveAlertToasts";
import { TradingTerminal } from "@/components/terminal/TradingTerminal";
import DashboardHero from "@/components/DashboardHero";
import DashboardShell from "@/components/dashboard-hero/DashboardShell";
import { OddsComparePanel } from "@/components/OddsComparePanel";
import { IndicationsStats } from "@/components/IndicationsStats";
import WalletPanel from "@/components/WalletPanel";
import AfiliadosPanel from "@/components/AfiliadosPanel";
import DownloadsPanel from "@/components/DownloadsPanel";
import WalletBalanceBadge from "@/components/WalletBalanceBadge";
import { useBankrollData } from "@/hooks/useBankrollData";
import { LayOverLimitPressurePanel } from "@/components/LayOverLimitPressurePanel";
import { Lay1x1Panel } from "@/components/Lay1x1Panel";
import { StrategyConfigRow } from "@/components/StrategyConfigRow";
import {
  isMarketAllowedForTier,
  tierRequiredForMarket,
  CREDIT_TIER_LABEL,
  type CreditTier,
  type StrategyMarketKey,
} from "@/lib/wallet/credit-tier";
import { type LayOverLimitPressureResult } from "@/components/LayOverLimitPressureResults";
import {
  EXCHANGE_DOMAIN_OPTIONS,
  getExchangeDomain,
  setExchangeDomain,
  withExchangeDomain,
  type ExchangeDomain,
} from "@/lib/betbra/exchange-domain";
import {
  activeExtSignalKinds,
  getActiveStrategy,
  isEventosRarosEnabled,
  isLay1x1Enabled,
  isLay3x3Enabled,
  isLayOverLimitPressureEnabled,
  isLucroCertoEnabled,
  isOnlyFavoritesFilter,
  isOnlyLiveFilter,
  isOver35Enabled,
  isOver45Enabled,
  isQovEnabled,
  setActiveStrategy,
  setEventosRarosEnabled,
  setLay1x1Enabled,
  setLay3x3Enabled,
  setLayOverLimitPressureEnabled,
  setLucroCertoEnabled,
  setOnlyFavoritesFilter,
  setOnlyLiveFilter,
  setOver35Enabled,
  setOver45Enabled,
  setQovEnabled,
} from "@/lib/strategy-settings";
import type { SignalStrategy } from "@/lib/strategy-priority";
import { seedDefaultsFromServer } from "@/lib/app-defaults";
import { useGamesLiveEnrichment, type EnrichedLiveSnapshot } from "@/hooks/useGamesLiveEnrichment";
import { MatchStatsDrawer, type StatsTarget } from "@/components/MatchStatsDrawer";
import { useFavorites } from "@/hooks/useFavorites";
import { useLiveAlerts } from "@/hooks/useLiveAlerts";
import {
  getTargetProfitPctPoints,
  setTargetProfitPctPoints,
} from "@/lib/panel-settings";
import { isNativeApp, nativeNotify } from "@/lib/native-alerts";
import { getNotifyOnlyMatched, setNotifyOnlyMatched } from "@/lib/notify-settings";
import {
  fetchActiveTrade,
  syncAutoLayBackground,
  type ActiveTradeSnapshot,
} from "@/lib/betbra/auto-lay-bg";
import {
  clearNativeLayLastResult,
  fetchBetBraBalance,
  fetchBetBraBalanceSnapshot,
  fetchBetBraOffers,
  getCachedBetBraSession,
  getNativeLayLastResult,
  getNativeLay1x1StakePct,
  getNativeLay3x3StakePct,
  getNativeLucroCertoStake,
  getNativeEventosRarosStake,
  getNativeOver45StakePct,
  getNativeOverStakePct,
  getNativeQovStakePct,
  getNativeReservedLucroCerto,
  openBetBraLogin,
  refreshBetBraSession,
  setNativeLay1x1StakePct,
  setNativeLay3x3StakePct,
  setNativeLucroCertoStake,
  setNativeEventosRarosStake,
  setNativeOver45StakePct,
  setNativeOverStakePct,
  setNativeQovStakePct,
  setNativeReservedLucroCerto,
  subscribeNativeLay,
  type BetBraOfferCard,
  type NativeLayLastResult,
} from "@/lib/betbra/native-lay";
import {
  getLolpStakePct,
  setLolpStakePct,
} from "@/lib/analysis/lay-over-limit-pressure/settings";
import {
  BarChart3,
  Grid3x3,
  List,
  Radio,
  Star,
  Sparkles,
} from "lucide-react";

function mexchangeEventUrl(eventId: string, marketId?: string) {
  const base = `https://${getExchangeDomain()}/b`;
  if (marketId) {
    return `${base}/exchange/sport/soccer/event/${eventId}/market/${marketId}`;
  }
  return `${base}/exchange/sport/soccer/event/${eventId}`;
}

type OverIndicatorTone = "good" | "warn" | "bad" | "idle";
type OverLimiteSnapshot = {
  line: number;
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity: number;
  gapTicks: number | null;
  goodCount: number;
  entryReady: boolean;
  exitPlan: {
    entryLayOdds: number;
    targetBackOdds: number;
    targetProfitPct: number;
    ticksPerMin: number;
    targetTicks: number;
    etaMinutes: number | null;
    minute: number | null;
    favoritePressureBias: number | null;
    confidence: "high" | "medium" | "low";
    summary: string;
  } | null;
  summary: string;
  indicators: Array<{
    id: string;
    label: string;
    icon: string;
    tone: OverIndicatorTone;
    good: boolean;
    detail: string;
    value?: number | null;
  }>;
};

type TradePlan = {
  layOdds: number | null;
  inEntryWindow: boolean;
  targetBackOdds: number | null;
  targetProfitPct: number;
  entryReady: boolean;
  summary: string;
  risk?: {
    tier: "baixo" | "medio" | "alto" | "fora";
    requiredMovePct: number | null;
    liabilityMultiple: number | null;
    favorsQuickCorrection: boolean;
    detail: string;
  };
  oscillation: null | {
    active: boolean;
    detail: string;
    swingPct: number;
  };
  fluidity?: null | {
    level: string;
    score: number;
    tradable: boolean;
    lateralized: boolean;
    detail: string;
  };
  correction?: null | {
    entryBias: "favor" | "neutral" | "avoid";
    summary: string;
    avgCorrectionMinutes: number | null;
    underdogCrash?: null | {
      matched: boolean;
      quality: "strong" | "weak" | "none";
      peakOdd: number;
      troughOdd: number;
      dropPct: number;
      favorsQuickBounce: boolean;
      phase: string;
      detail: string;
    };
    episode: null | {
      phase: string;
      favorableMove: boolean;
      recoveredPct: number;
      minutesSinceTrough: number;
      detail: string;
    };
  };
  example: null | {
    layStake: number;
    liability: number;
    backStake: number | null;
    profit: number | null;
  };
  teamForm?: null | {
    confirmsHighScoring: boolean;
    projectedTotalGoals: number | null;
    detail: string;
  };
};

type QovSnapshot = {
  mode: "lay-underdog" | "back-favorite";
  selection: "any-other-home" | "any-other-away" | null;
  favoriteSide: "home" | "away" | null;
  underdogSide: "home" | "away" | null;
  side: "lay" | "back";
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  entryOdds: number | null;
  liquidity: number;
  gapTicks: number | null;
  favoritePressureBias: number | null;
  goodCount: number;
  entryReady: boolean;
  exitPlan: {
    entryOdds: number;
    exitOdds: number;
    targetProfitPct: number;
    entrySide: "lay" | "back";
    exitSide: "lay" | "back";
    summary: string;
  } | null;
  summary: string;
  blockers: string[];
  indicators: Array<{
    id: string;
    label: string;
    icon: string;
    tone: OverIndicatorTone;
    good: boolean;
    detail: string;
    value?: number | null;
  }>;
};

type EventosRarosSnapshot = {
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  best: {
    label: string;
    home: number;
    away: number;
    layOdds: number;
    backOdds: number | null;
    liquidity: number;
    goalsNeeded: number;
    remainingMinutes: number;
    timeBlocked: boolean;
    impliedProb: number;
    modelProb: number | null;
    stillPossible: boolean;
    alreadyImpossible?: boolean;
    entryReady?: boolean;
  } | null;
  entries: Array<{
    label: string;
    layOdds: number;
    backOdds: number | null;
    liquidity: number;
    goalsNeeded: number;
    remainingMinutes: number;
    timeBlocked: boolean;
    stillPossible: boolean;
    alreadyImpossible?: boolean;
    impliedProb: number;
    modelProb: number | null;
    entryReady?: boolean;
    runnerId?: string;
    marketId?: string;
  }>;
  candidates: Array<{
    label: string;
    layOdds: number;
    goalsNeeded: number;
    remainingMinutes: number;
    timeBlocked: boolean;
    stillPossible: boolean;
    alreadyImpossible?: boolean;
    impliedProb: number;
    modelProb: number | null;
    entryReady?: boolean;
  }>;
  layOdds: number | null;
  backOdds: number | null;
  scoreLabel: string | null;
  scoreLabels: string[];
  liquidity: number;
  gapTicks: number | null;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  goodCount: number;
  entryReady: boolean;
  exitPlan: null;
  summary: string;
  blockers: string[];
  indicators: Array<{
    id: string;
    label: string;
    icon: string;
    tone: OverIndicatorTone;
    good: boolean;
    detail: string;
    value?: number | null;
  }>;
};

type OpportunityPayload = {
  generatedAt: string;
  window: { min: number; max: number; preferredMax?: number; minLiquidity: number };
  totalEvents: number;
  opportunities: Array<{
    mexchangeUrl: string;
    overMexchangeUrl?: string;
    overMexchangeUrl35?: string;
    overMexchangeUrl45?: string;
    qovMexchangeUrl?: string;
    eventosRarosMexchangeUrl?: string;
    analysis: {
      eventId: string;
      eventName: string;
      home: string;
      away: string;
      start: string;
      competition?: string;
      marketId?: string;
      runnerId?: string;
      layOdds: number | null;
      oddsSource: string;
      quotes?: {
        back: { odds: number | null; amount: number };
        lay: { odds: number | null; amount: number };
        lastMatched: number | null;
      };
      liquidity: number;
      volume3x3: number;
      bttsYes: number | null;
      over25: number | null;
      overLimite?: OverLimiteSnapshot;
      overLimite35?: OverLimiteSnapshot;
      overLimite45?: OverLimiteSnapshot;
      qovLayUnderdog?: QovSnapshot;
      qovBackFavorite?: QovSnapshot;
      eventosRaros?: EventosRarosSnapshot;
      score: number;
      idealOdds: boolean;
      watchlist: boolean;
      summary: string;
      tradePlan?: TradePlan;
      signals: Array<{
        id: string;
        label: string;
        detail: string;
        level: string;
        score: number;
      }>;
      matchOdds: {
        home: { name?: string; back?: number };
        draw: { name?: string; back?: number };
        away: { name?: string; back?: number };
      };
    };
  }>;
  error?: string;
};

type OpportunityRow = OpportunityPayload["opportunities"][number];

type LivePayload = {
  generatedAt: string;
  inplayCount: number;
  monitored: number;
  entries: number;
  alerts: Array<{
    id: string;
    severity: "info" | "watch" | "entry" | "abort";
    title: string;
    message: string;
    at: string;
    eventId?: string;
    eventName?: string;
    mexchangeUrl?: string;
    strategy?: StrategyId;
  }>;
  rows: Array<{
    confirmed: boolean;
    mexchangeUrl: string;
    overMexchangeUrl?: string;
    overMexchangeUrl35?: string;
    overMexchangeUrl45?: string;
    qovMexchangeUrl?: string;
    eventosRarosMexchangeUrl?: string;
    reasons: string[];
    tradePlan?: TradePlan;
    overLimite?: OverLimiteSnapshot;
    overLimite35?: OverLimiteSnapshot;
    overLimite45?: OverLimiteSnapshot;
    layOverLimitPressure?: LayOverLimitPressureResult[];
    lay1x1?: {
      settled: boolean;
      entryReady: boolean;
      layOdds: number | null;
      backOdds: number | null;
      layLiquidity: number;
      homeScore: number | null;
      awayScore: number | null;
      minute: number | null;
      favoriteSide: "home" | "away" | null;
      favoritePressureBias: number | null;
      goodCount: number;
      summary: string;
      marketId?: string;
      runnerId?: string;
      mexchangeUrl?: string;
      eventId?: string;
      eventName?: string;
      indicators: Array<{
        id: string;
        label: string;
        icon: string;
        tone: string;
        good: boolean;
        detail: string;
        value?: number | null;
      }>;
    };
    qovLayUnderdog?: QovSnapshot;
    qovBackFavorite?: QovSnapshot;
    eventosRaros?: EventosRarosSnapshot;
    live: null | {
      scoreLabel: string;
      minute: number | null;
      status: string;
      stillPossible33: boolean;
    };
    analysis: {
      eventId: string;
      eventName: string;
      home?: string;
      away?: string;
      start?: string;
      competition?: string;
      marketId?: string;
      runnerId?: string;
      score: number;
      layOdds: number | null;
      oddsSource?: string;
      quotes?: {
        back: { odds: number | null; amount: number };
        lay: { odds: number | null; amount: number };
        lastMatched: number | null;
      };
      liquidity?: number;
      volume3x3?: number;
      bttsYes?: number | null;
      over25?: number | null;
      idealOdds?: boolean;
      watchlist?: boolean;
      summary?: string;
      signals?: OpportunityRow["analysis"]["signals"];
      matchOdds?: OpportunityRow["analysis"]["matchOdds"];
      tradePlan?: TradePlan;
      overLimite?: OverLimiteSnapshot;
      overLimite35?: OverLimiteSnapshot;
      overLimite45?: OverLimiteSnapshot;
      qovLayUnderdog?: QovSnapshot;
      qovBackFavorite?: QovSnapshot;
      eventosRaros?: EventosRarosSnapshot;
    };
  }>;
  error?: string;
};

type NavView =
  | "dashboard"
  | "jogos"
  | "live"
  | "alertas"
  | "estatisticas"
  | "comparar"
  | "evento"
  | "carteira"
  | "config"
  | "afiliados"
  | "downloads";
type StrategyId = SignalStrategy;

function isQovStrategy(strategy: StrategyId): boolean {
  return strategy === "qov-lay-zebra";
}

function isEventosRarosStrategy(strategy: StrategyId): boolean {
  return strategy === "eventos-raros";
}

function isLucroCertoStrategy(strategy: StrategyId): boolean {
  return strategy === "lucro-certo";
}

function isOverStrategy(strategy: StrategyId): boolean {
  return strategy === "over-3.5" || strategy === "over-4.5";
}

function isLayOverLimitPressureStrategy(strategy: StrategyId): boolean {
  return strategy === "lay-over-limit-pressure";
}

function isLay1x1Strategy(strategy: StrategyId): boolean {
  return strategy === "lay-1x1";
}

function isLiveOnlyStrategy(strategy: StrategyId): boolean {
  if (isLay1x1Strategy(strategy)) return true;
  return (
    isQovStrategy(strategy) ||
    isEventosRarosStrategy(strategy) ||
    isLucroCertoStrategy(strategy) ||
    isOverStrategy(strategy) ||
    isLayOverLimitPressureStrategy(strategy)
  );
}

function erHasLucroCertoEntry(
  er: EventosRarosSnapshot | null | undefined,
): boolean {
  return Boolean(
    er?.entries?.some((e) => e.entryReady !== false && e.alreadyImpossible),
  );
}

function erHasPatternEntry(
  er: EventosRarosSnapshot | null | undefined,
): boolean {
  return Boolean(
    er?.entries?.some((e) => e.entryReady !== false && !e.alreadyImpossible),
  );
}

function resolveOver(
  row: OpportunityRow,
  liveRow: LivePayload["rows"][number] | undefined,
  strategy: StrategyId,
): OverLimiteSnapshot | null {
  if (strategy === "over-3.5") {
    return (
      liveRow?.overLimite35 ??
      liveRow?.analysis?.overLimite35 ??
      row.analysis.overLimite35 ??
      null
    );
  }
  if (strategy === "over-4.5") {
    return (
      liveRow?.overLimite45 ??
      liveRow?.analysis?.overLimite45 ??
      row.analysis.overLimite45 ??
      null
    );
  }
  return null;
}

function resolveLolp(
  row: OpportunityRow,
  liveRow: LivePayload["rows"][number] | undefined,
): LayOverLimitPressureResult | null {
  const list = liveRow?.layOverLimitPressure ?? [];
  const candidates = list.filter((snap) => !snap.settled && snap.layOdds != null);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.entryReady !== b.entryReady) return a.entryReady ? -1 : 1;
    return b.goodCount - a.goodCount;
  })[0];
}

function resolveQov(
  row: OpportunityRow,
  liveRow?: LivePayload["rows"][number],
): QovSnapshot | null {
  return (
    liveRow?.qovLayUnderdog ??
    liveRow?.analysis?.qovLayUnderdog ??
    row.analysis.qovLayUnderdog ??
    null
  );
}

function resolveEventosRaros(
  row: OpportunityRow,
  liveRow?: LivePayload["rows"][number],
): EventosRarosSnapshot | null {
  return (
    liveRow?.eventosRaros ??
    liveRow?.analysis?.eventosRaros ??
    row.analysis.eventosRaros ??
    null
  );
}

function normalizeTeamKey(home: string, away: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(home)}|${norm(away)}`;
}

function isNavView(v: string | null): v is NavView {
  return (
    v === "dashboard" ||
    v === "jogos" ||
    v === "live" ||
    v === "alertas" ||
    v === "estatisticas" ||
    v === "comparar" ||
    v === "evento" ||
    v === "carteira" ||
    v === "config"
  );
}

function formatKickTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

function formatKickDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return "HOJE";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function formatKickoff(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function splitScoreLabel(label?: string | null): [string, string] {
  if (!label) return ["—", "—"];
  const m = label.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!m) return ["—", "—"];
  return [m[1], m[2]];
}

function severityClass(severity: string) {
  switch (severity) {
    case "entry":
      return "alert-entry";
    case "abort":
      return "alert-abort";
    case "watch":
      return "alert-watch";
    default:
      return "alert-info";
  }
}

function tradeStatus(plan?: TradePlan | null) {
  if (!plan) return "—";
  if (plan.entryReady) return "ENTRAR";
  if (plan.correction?.underdogCrash?.matched) {
    if (plan.correction.entryBias === "favor") return "BOUNCE";
    return "ZEBRA↓";
  }
  if (plan.risk?.tier === "alto") {
    if (plan.teamForm?.confirmsHighScoring) return "FORMA";
    return "RISCO";
  }
  if (plan.correction?.entryBias === "favor") return "CORRIGINDO";
  if (plan.fluidity?.lateralized) return "LATERAL";
  if (plan.inEntryWindow && plan.risk?.favorsQuickCorrection) return "FAVORAVEL";
  if (plan.inEntryWindow) return "AGUARDAR";
  return "FORA";
}

/** Alertas ativos = só ENTRAR (entry). Abort/watch ficam fora do painel. */
function isPanelActiveAlert(alert: {
  severity: LivePayload["alerts"][number]["severity"];
  title: string;
}) {
  if (alert.severity !== "entry") return false;
  const title = alert.title.toLowerCase();
  // Armado / monitoramento não são entrada real.
  if (title.includes("sem correção") || title.includes("aguardando")) return false;
  if (title.includes("monitorar") || title.includes("live ativo")) return false;
  return true;
}

/** Estratégia dona do alerta — para esconder quando o filtro estiver off. */
function alertStrategyId(alert: {
  id: string;
  title: string;
  strategy?: StrategyId;
}): StrategyId | null {
  // A API marca a estratégia dona; o texto só resolve payloads antigos.
  if (alert.strategy) return alert.strategy;
  const id = alert.id.toLowerCase();
  const title = alert.title.toUpperCase();
  if (
    id.includes("lucro-certo") ||
    title.includes("LUCRO CERTO")
  ) {
    return "lucro-certo";
  }
  if (
    id.includes("eventos-raros") ||
    id.includes("raros") ||
    title.includes("EVENTOS RAROS") ||
    (title.includes("RAROS") && !title.includes("3-3"))
  ) {
    return "eventos-raros";
  }
  if (id.includes("over-45") || title.includes("OVER 4.5")) {
    return "over-4.5";
  }
  if (id.includes("over-35") || title.includes("OVER 3.5")) {
    return "over-3.5";
  }
  if (id.includes("qov") || title.includes("QOV") || title.includes("ZEBRA")) {
    return "qov-lay-zebra";
  }
  // trade-*, abort placar 3-3, janela, forma, lateral → Lay 3x3
  if (
    id.includes("trade") ||
    id.includes("-entry") ||
    id.includes("-watch") ||
    id.includes("abort") ||
    title.includes("LAY 3-3") ||
    title.includes("3-3") ||
    title.includes("CORREÇÃO") ||
    title.includes("JANELA") ||
    title.includes("ROTEIRO") ||
    title.includes("DESEQUILIBRADO") ||
    title.includes("EXCLUÍDO") ||
    title.includes("INVALIDADO")
  ) {
    return "lay-3x3";
  }
  return "lay-3x3";
}

function alertBadgeLabel(
  alert: LivePayload["alerts"][number],
  row?: LivePayload["rows"][number],
) {
  const title = alert.title.toUpperCase();
  if (title.includes("QOV") || title.includes("ZEBRA")) return "ZEBRA ↓";
  if (title.includes("EVENTOS RAROS") || title.includes("RAROS") || title.includes("LUCRO CERTO")) {
    return title.includes("LUCRO CERTO") ? "LUCRO" : "RARO";
  }
  if (title.includes("OVER 4.5")) return "O4.5";
  if (title.includes("OVER 3.5")) return "O3.5";
  // Só severity entry / título de ENTRADA real — "sem correção" NÃO é ENTRAR
  // (antes "CORREÇÃO" no título virava badge falso e a extensão parecia falhar).
  if (alert.severity === "entry" || /\bENTRADA\b/.test(title)) {
    return "ENTRAR";
  }
  if (title.includes("FORA DO ROTEIRO") || title.includes("EXCLUÍDO")) return "FORA";
  if (row?.qovLayUnderdog?.entryReady) return "ZEBRA ↓";
  if (row?.eventosRaros?.entryReady) return "RARO";
  if (row?.tradePlan) {
    const status = tradeStatus(row.tradePlan);
    if (status === "ZEBRA↓") return "ZEBRA ↓";
    return status;
  }
  const short = alert.title.split("·")[0]?.trim() || alert.title;
  return short.slice(0, 14).toUpperCase();
}

function alertMarketLabel(
  alert: LivePayload["alerts"][number],
  row?: LivePayload["rows"][number],
) {
  const id = alert.id.toLowerCase();
  const title = alert.title.toUpperCase();
  const er = row?.eventosRaros ?? row?.analysis.eventosRaros;
  const qov = row?.qovLayUnderdog ?? row?.analysis.qovLayUnderdog;
  const plan = row?.tradePlan ?? row?.analysis.tradePlan;

  if (
    id.includes("eventos-raros") ||
    id.includes("raros") ||
    title.includes("EVENTOS RAROS") ||
    title.includes("RAROS")
  ) {
    const labels =
      er?.scoreLabels && er.scoreLabels.length > 0
        ? er.scoreLabels.join(", ")
        : er?.scoreLabel;
    const odds = er?.layOdds != null ? ` @ ${er.layOdds.toFixed(0)}` : "";
    return labels
      ? `Eventos raros · CS ${labels}${odds}`
      : `Eventos raros · CS lay${odds}`;
  }

  if (id.includes("qov") || title.includes("QOV") || title.includes("ZEBRA")) {
    const odds =
      qov?.entryOdds != null
        ? ` @ ${qov.entryOdds.toFixed(2)}`
        : qov?.layOdds != null
          ? ` @ ${qov.layOdds.toFixed(2)}`
          : "";
    return `Lay QOV zebra${odds}`;
  }

  if (
    id.includes("trade") ||
    title.includes("LAY 3-3") ||
    title.includes("CORREÇÃO") ||
    title.includes("JANELA")
  ) {
    const odds = plan?.layOdds != null ? ` @ ${plan.layOdds.toFixed(0)}` : "";
    return `Lay 3x3 · placar 3-3${odds}`;
  }

  if (er?.entryReady) {
    const labels =
      er.scoreLabels && er.scoreLabels.length > 0
        ? er.scoreLabels.join(", ")
        : er.scoreLabel;
    return labels ? `Eventos raros · CS ${labels}` : "Eventos raros · CS lay";
  }
  if (qov?.entryReady) return "Lay QOV zebra";
  if (plan?.entryReady || plan?.inEntryWindow) {
    return "Lay 3x3 · placar 3-3";
  }

  return alert.message?.replace(/^[^:]+:\s*/, "").slice(0, 64) || "Mercado ao vivo";
}

function resolveAlertLink(
  alert: LivePayload["alerts"][number],
  row?: LivePayload["rows"][number],
) {
  const id = alert.id.toLowerCase();
  const fallback = alert.eventId
    ? mexchangeEventUrl(alert.eventId, row?.analysis.marketId)
    : "";
  if (id.includes("qov")) {
    return (
      row?.qovMexchangeUrl ??
      alert.mexchangeUrl ??
      row?.mexchangeUrl ??
      fallback
    );
  }
  if (id.includes("eventos-raros") || id.includes("raros")) {
    return (
      row?.eventosRarosMexchangeUrl ??
      alert.mexchangeUrl ??
      row?.mexchangeUrl ??
      fallback
    );
  }
  return alert.mexchangeUrl ?? row?.mexchangeUrl ?? fallback;
}

export function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [opps, setOpps] = useState<OpportunityPayload | null>(null);
  const [live, setLive] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyLive, setOnlyLive] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<NavView>("dashboard");
  const [strategy, setStrategy] = useState<StrategyId>("lay-3x3");
  const [statsTarget, setStatsTarget] = useState<StatsTarget | null>(null);
  const [topNavOpen, setTopNavOpen] = useState(false);
  const [targetProfitPct, setTargetProfitPct] = useState(0.5);
  const [profitDraft, setProfitDraft] = useState("0,5");
  const [lay3x3On, setLay3x3On] = useState(true);
  const [qovOn, setQovOn] = useState(true);
  const [eventosRarosOn, setEventosRarosOn] = useState(true);
  const [lucroCertoOn, setLucroCertoOn] = useState(true);
  const [over35On, setOver35On] = useState(true);
  const [over45On, setOver45On] = useState(true);
  const [layOverLimitPressureOn, setLayOverLimitPressureOn] = useState(true);
  const [lay1x1On, setLay1x1On] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [nativeApp, setNativeApp] = useState(false);
  const didAutoResetFilters = useRef(false);
  const [betBraConnected, setBetBraConnected] = useState(false);
  const [betBraBalance, setBetBraBalance] = useState<number | null>(null);
  const [betBraBalanceError, setBetBraBalanceError] = useState<string | null>(
    null,
  );
  const [betBraOpenOffers, setBetBraOpenOffers] = useState(0);
  const [betBraOffersSummary, setBetBraOffersSummary] = useState("");
  const [betBraOffers, setBetBraOffers] = useState<BetBraOfferCard[]>([]);
  const [betBraOpenExposure, setBetBraOpenExposure] = useState(0);
  const [activeTradeSnap, setActiveTradeSnap] =
    useState<ActiveTradeSnapshot | null>(null);
  const wasTradeMatchedRef = useRef(false);
  const [notifyOnlyMatched, setNotifyOnlyMatchedState] = useState(false);
  const [exchangeDomain, setExchangeDomainState] = useState<ExchangeDomain>(
    "betbra.bet.br",
  );
  const [nativeLay3x3StakePct, setNativeLay3x3StakePctState] = useState(20);
  const [nativeQovStakePct, setNativeQovStakePctState] = useState(20);
  const [nativeEventosRarosStake, setNativeEventosRarosStakeState] =
    useState(500);
  const [nativeOverStakePct, setNativeOverStakePctState] = useState(10);
  const [nativeOver45StakePct, setNativeOver45StakePctState] = useState(10);
  const [nativeLucroCertoStake, setNativeLucroCertoStakeState] = useState(1001);
  const [nativeReservedLc, setNativeReservedLcState] = useState(1001);
  const [nativeLolpStakePct, setNativeLolpStakePctState] = useState(5);
  const [nativeLay1x1StakePct, setNativeLay1x1StakePctState] = useState(5);
  const [nativeLayLast, setNativeLayLast] = useState<NativeLayLastResult | null>(
    null,
  );
  const [betBraBusy, setBetBraBusy] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [creditTier, setCreditTier] = useState<CreditTier>("none");
  const [walletBlocked, setWalletBlocked] = useState(false);
  const bankroll = useBankrollData();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; isMaster?: boolean }) => {
        if (!cancelled) setIsMaster(Boolean(data.authenticated && data.isMaster));
      })
      .catch(() => {
        if (!cancelled) setIsMaster(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWallet = async () => {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          wallet?: { blocked?: boolean; tier?: CreditTier };
        };
        if (cancelled) return;
        setWalletBlocked(Boolean(json.wallet?.blocked));
        setCreditTier((json.wallet?.tier as CreditTier) || "none");
      } catch {
        /* mantém último estado conhecido */
      }
    };
    void loadWallet();
    const id = window.setInterval(() => void loadWallet(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  /** Master enxerga todos os filtros que o admin habilitar, sem travar por faixa. */
  const isMarketLocked = (market: StrategyMarketKey) =>
    !isMaster && !isMarketAllowedForTier(market, creditTier);

  useEffect(() => {
    setLay3x3On(isLay3x3Enabled());
    setQovOn(isQovEnabled());
    setEventosRarosOn(isEventosRarosEnabled());
    setLucroCertoOn(isLucroCertoEnabled());
    setOver35On(isOver35Enabled());
    setOver45On(isOver45Enabled());
    setLayOverLimitPressureOn(isLayOverLimitPressureEnabled());
    setLay1x1On(isLay1x1Enabled());
    setStrategy(getActiveStrategy());
    setOnlyLive(isOnlyLiveFilter());
    setOnlyFavorites(isOnlyFavoritesFilter());
  }, []);

  useEffect(() => {
    const enabled: StrategyId[] = [];
    if (lay3x3On) enabled.push("lay-3x3");
    if (qovOn) enabled.push("qov-lay-zebra");
    if (eventosRarosOn) enabled.push("eventos-raros");
    if (lucroCertoOn) enabled.push("lucro-certo");
    if (over35On) enabled.push("over-3.5");
    if (over45On) enabled.push("over-4.5");
    if (layOverLimitPressureOn) enabled.push("lay-over-limit-pressure");
    if (lay1x1On) enabled.push("lay-1x1");
    if (enabled.length === 0) return;
    if (!enabled.includes(strategy)) {
      const next = enabled[0];
      setStrategy(next);
      setActiveStrategy(next);
    }
  }, [
    lay3x3On,
    qovOn,
    eventosRarosOn,
    lucroCertoOn,
    over35On,
    over45On,
    layOverLimitPressureOn,
    strategy,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const applied = await seedDefaultsFromServer();
      if (!applied || cancelled) return;
      setLay3x3On(isLay3x3Enabled());
      setQovOn(isQovEnabled());
      setEventosRarosOn(isEventosRarosEnabled());
      setLucroCertoOn(isLucroCertoEnabled());
      setOver35On(isOver35Enabled());
      setOver45On(isOver45Enabled());
      setLayOverLimitPressureOn(isLayOverLimitPressureEnabled());
      setLay1x1On(isLay1x1Enabled());
      const p = getTargetProfitPctPoints();
      setTargetProfitPct(p);
      setProfitDraft(String(p).replace(".", ","));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setNotifyOnlyMatchedState(getNotifyOnlyMatched());
    setExchangeDomainState(getExchangeDomain());
  }, []);

  const refreshExchangeSnapshot = useCallback(async () => {
    if (!isNativeApp()) return;
    try {
      const s = await refreshBetBraSession();
      setBetBraConnected(Boolean(s.connected));
      const [balSnap, offers, trade] = await Promise.all([
        fetchBetBraBalanceSnapshot(),
        fetchBetBraOffers(),
        fetchActiveTrade(),
      ]);
      setBetBraBalance(balSnap.balance);
      setBetBraBalanceError(balSnap.error ?? null);
      const openCount = offers?.openCount ?? 0;
      setBetBraOpenOffers(openCount);
      setBetBraOffersSummary(offers?.summary ?? "");
      setBetBraOffers(offers?.offers ?? []);
      setBetBraOpenExposure(offers?.openExposure ?? 0);
      setActiveTradeSnap(trade);
      const isMatchedNow = Boolean(trade?.active && trade.matched !== false);
      if (
        isMatchedNow &&
        !wasTradeMatchedRef.current &&
        getNotifyOnlyMatched()
      ) {
        void nativeNotify({
          kind: "enter",
          title: "Lay casado na Bolsa",
          body:
            trade?.eventName || trade?.score
              ? `Entrada confirmada · ${trade.eventName ?? ""}${trade.score ? ` (${trade.score})` : ""}`
              : "Sua entrada foi casada na Bolsa.",
          tag: `matched-${trade?.eventId ?? Date.now()}`,
        });
      }
      wasTradeMatchedRef.current = isMatchedNow;
      setNativeReservedLcState(getNativeReservedLucroCerto());
      setLastSyncAt(Date.now());
      if (openCount === 0 && !trade?.active) {
        const last = getNativeLayLastResult();
        if (last?.ok) clearNativeLayLastResult();
      }
      setNativeLayLast(getNativeLayLastResult());
    } catch (e) {
      setBetBraBalanceError(
        e instanceof Error ? e.message : "Falha ao atualizar Bolsa",
      );
    }
  }, []);

  useEffect(() => {
    if (!searchParams.get("view")) {
      router.replace("/app?view=dashboard", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    const v = searchParams.get("view");
    if (isNavView(v)) setView(v);
  }, [searchParams]);

  /**
   * Troca de aba usa router.replace (não empilha histórico), então o botão
   * "Voltar" do navegador tende a sair do app direto para a landing/login.
   * Aqui garantimos uma entrada extra no histórico ao montar e, se o usuário
   * voltar para fora de /app, "engolimos" essa navegação e mandamos de volta
   * para o dashboard em vez de deixar sair do painel.
   */
  useEffect(() => {
    if (nativeApp || typeof window === "undefined") return;
    window.history.pushState(
      { tips3x3Dashboard: true },
      "",
      window.location.href,
    );
    const onPopState = () => {
      if (!window.location.pathname.startsWith("/app")) {
        window.history.pushState(
          { tips3x3Dashboard: true },
          "",
          "/app?view=dashboard",
        );
        setView("dashboard");
        setTopNavOpen(false);
        setSelectedId(null);
        router.replace("/app?view=dashboard", { scroll: false });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeApp]);

  useEffect(() => {
    setMounted(true);
    setLastSyncAt(Date.now());
    const native = isNativeApp();
    setNativeApp(native);
    setNativeLay3x3StakePctState(getNativeLay3x3StakePct());
    setNativeQovStakePctState(getNativeQovStakePct());
    setNativeEventosRarosStakeState(getNativeEventosRarosStake());
    setNativeOverStakePctState(getNativeOverStakePct());
    setNativeOver45StakePctState(getNativeOver45StakePct());
    setNativeLucroCertoStakeState(getNativeLucroCertoStake());
    setNativeReservedLcState(getNativeReservedLucroCerto());
    setNativeLolpStakePctState(Math.round(getLolpStakePct() * 100));
    setNativeLay1x1StakePctState(getNativeLay1x1StakePct());
    setNativeLayLast(getNativeLayLastResult());
    if (!native) return;
    void refreshExchangeSnapshot();
    const poll = window.setInterval(() => {
      void refreshExchangeSnapshot();
    }, 30_000);
    const unsub = subscribeNativeLay(() => {
      setNativeLay3x3StakePctState(getNativeLay3x3StakePct());
      setNativeQovStakePctState(getNativeQovStakePct());
      setNativeEventosRarosStakeState(getNativeEventosRarosStake());
      setNativeOverStakePctState(getNativeOverStakePct());
      setNativeOver45StakePctState(getNativeOver45StakePct());
      setNativeLucroCertoStakeState(getNativeLucroCertoStake());
      setNativeReservedLcState(getNativeReservedLucroCerto());
      setNativeLolpStakePctState(Math.round(getLolpStakePct() * 100));
      setNativeLay1x1StakePctState(getNativeLay1x1StakePct());
      setNativeLayLast(getNativeLayLastResult());
      const cached = getCachedBetBraSession();
      if (cached) setBetBraConnected(Boolean(cached.connected));
      void fetchBetBraBalanceSnapshot().then((snap) => {
        setBetBraBalance(snap.balance);
        setBetBraBalanceError(snap.error ?? null);
      });
      void fetchBetBraOffers().then((o) => {
        const openCount = o?.openCount ?? 0;
        setBetBraOpenOffers(openCount);
        setBetBraOffersSummary(o?.summary ?? "");
        setBetBraOffers(o?.offers ?? []);
        setBetBraOpenExposure(o?.openExposure ?? 0);
        setNativeLayLast(getNativeLayLastResult());
      });
      void fetchActiveTrade().then((t) => setActiveTradeSnap(t));
    });
    return () => {
      window.clearInterval(poll);
      unsub();
    };
  }, [refreshExchangeSnapshot]);
  const { favorites, favoriteIds, toggleFavorite, isFavorite, reconcileWithLive } =
    useFavorites();

  useEffect(() => {
    if (!live || !opps) return;
    const activeIds = new Set<string>();
    for (const row of live.rows ?? []) activeIds.add(row.analysis.eventId);
    for (const row of opps.opportunities ?? []) {
      activeIds.add(row.analysis.eventId);
    }
    reconcileWithLive(live.rows, activeIds);
  }, [live, opps, reconcileWithLive]);

  useEffect(() => {
    const p = getTargetProfitPctPoints();
    setTargetProfitPct(p);
    setProfitDraft(String(p).replace(".", ","));
  }, []);

  useEffect(() => {
    if (!topNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTopNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topNavOpen]);

  const {
    toasts,
    dismiss,
    alertsArmed,
    armAlerts,
    extAutoSend,
    setExtAutoSend: setExtAutoSendBase,
  } = useLiveAlerts(favorites, live?.rows);

  const setExtAutoSend = useCallback(
    (on: boolean) => {
      setExtAutoSendBase(on);
      // Não força estratégias ON — respeita o que o utilizador desligou.
      if (on) {
        setLay3x3On(isLay3x3Enabled());
        setEventosRarosOn(isEventosRarosEnabled());
        setLucroCertoOn(isLucroCertoEnabled());
        setLayOverLimitPressureOn(isLayOverLimitPressureEnabled());
        setLay1x1On(isLay1x1Enabled());
      }
    },
    [setExtAutoSendBase],
  );
  const [detailOpen, setDetailOpen] = useState<Record<string, boolean>>({
    trade: true,
    moment: true,
    intel: true,
    signals: false,
    live: true,
    chart: false,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const profitQ = `&profitPct=${encodeURIComponent(String(targetProfitPct))}`;
      // Lê do localStorage na hora do fetch: as pills mudam sem recriar o load.
      const autoExtQ = extAutoSend
        ? `&autoExt=1&extMarkets=${encodeURIComponent(activeExtSignalKinds().join(","))}`
        : "";
      const [oRes, lRes] = await Promise.all([
        fetch(`/api/opportunities?limit=40${profitQ}`, {
          credentials: "include",
        }),
        fetch(`/api/live?limit=40${profitQ}${autoExtQ}`, {
          credentials: "include",
        }),
      ]);
      const oJson = (await oRes.json()) as OpportunityPayload;
      const lJson = (await lRes.json()) as LivePayload;
      if (!oRes.ok) throw new Error(oJson.error || "Falha ao carregar oportunidades");
      if (!lRes.ok) throw new Error(lJson.error || "Falha ao carregar live");
      setOpps(oJson);
      setLive(lJson);
      setLastSyncAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setLoading(false);
    }
  }, [extAutoSend, targetProfitPct]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    // 4s: menor amostragem reduz aliasing temporal em entradas rápidas
    // (janelas de odds que abrem/fecham entre um poll e outro).
    const id = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  const liveMap = useMemo(() => {
    const map = new Map<string, LivePayload["rows"][number]>();
    for (const row of live?.rows ?? []) {
      map.set(row.analysis.eventId, row);
    }
    return map;
  }, [live]);

  const liveByTeams = useMemo(() => {
    const map = new Map<string, LivePayload["rows"][number]>();
    for (const row of live?.rows ?? []) {
      const a = row.analysis;
      const home = a.home ?? "";
      const away = a.away ?? "";
      if (home && away) map.set(normalizeTeamKey(home, away), row);
    }
    return map;
  }, [live]);

  const resolveLiveRow = useCallback(
    (row: OpportunityRow) => {
      const byId = liveMap.get(row.analysis.eventId);
      if (byId?.live) return byId;
      const byTeams = liveByTeams.get(
        normalizeTeamKey(row.analysis.home, row.analysis.away),
      );
      return byTeams ?? byId;
    },
    [liveMap, liveByTeams],
  );

  const hasBetbraLive = useCallback(
    (eventId: string) => {
      const row = liveMap.get(eventId);
      return Boolean(row?.live?.scoreLabel);
    },
    [liveMap],
  );

  const liveAsOpportunities = useMemo((): OpportunityRow[] => {
    return (live?.rows ?? [])
      .filter((r) => r.live)
      .map((r) => {
        const a = r.analysis;
        const [homeFallback, awayFallback] = (a.eventName ?? "").split(/\s+vs\s+/i);
        return {
          mexchangeUrl: r.mexchangeUrl,
          overMexchangeUrl: r.overMexchangeUrl,
          overMexchangeUrl35: r.overMexchangeUrl35,
          overMexchangeUrl45: r.overMexchangeUrl45,
          qovMexchangeUrl: r.qovMexchangeUrl,
          eventosRarosMexchangeUrl: r.eventosRarosMexchangeUrl,
          analysis: {
            eventId: a.eventId,
            eventName: a.eventName,
            home: a.home ?? homeFallback ?? "Casa",
            away: a.away ?? awayFallback ?? "Fora",
            start: a.start ?? new Date().toISOString(),
            competition: a.competition,
            marketId: a.marketId,
            runnerId: a.runnerId,
            layOdds: a.layOdds,
            oddsSource: (a.oddsSource as OpportunityRow["analysis"]["oddsSource"]) ?? "none",
            quotes: a.quotes,
            liquidity: a.liquidity ?? 0,
            volume3x3: a.volume3x3 ?? 0,
            bttsYes: a.bttsYes ?? null,
            over25: a.over25 ?? null,
            overLimite: r.overLimite ?? a.overLimite,
            overLimite35: r.overLimite35 ?? a.overLimite35,
            overLimite45: r.overLimite45 ?? a.overLimite45,
            qovLayUnderdog: r.qovLayUnderdog ?? a.qovLayUnderdog,
            eventosRaros: r.eventosRaros ?? a.eventosRaros,
            score: a.score,
            idealOdds: a.idealOdds ?? false,
            watchlist: a.watchlist ?? true,
            summary: a.summary ?? "",
            tradePlan: r.tradePlan ?? a.tradePlan,
            signals: a.signals ?? [],
            matchOdds: a.matchOdds ?? {
              home: {},
              draw: {},
              away: {},
            },
          },
        };
      });
  }, [live]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    const oppsList = opps?.opportunities ?? [];
    const liveList = liveAsOpportunities;

    let source: OpportunityRow[];
    // QOV / Eventos raros são live-only
    if (onlyLive || isLiveOnlyStrategy(strategy)) {
      source = liveList;
    } else {
      // Live primeiro (com placar/minuto), depois pré-live sem duplicar
      const liveIds = new Set(liveList.map((r) => r.analysis.eventId));
      source = [
        ...liveList,
        ...oppsList.filter((r) => !liveIds.has(r.analysis.eventId)),
      ];
    }

    const filtered = source.filter((row) => {
      const a = row.analysis;
      if (onlyFavorites && !favoriteIds.has(a.eventId)) return false;
      if (isQovStrategy(strategy)) {
        const qov = resolveQov(row, liveMap.get(a.eventId));
        if (!qov || (qov.entryOdds == null && qov.layOdds == null)) {
          return false;
        }
      }
      if (isEventosRarosStrategy(strategy)) {
        const er = resolveEventosRaros(row, liveMap.get(a.eventId));
        if (!er || (er.layOdds == null && er.candidates.length === 0)) {
          return false;
        }
      }
      if (isLucroCertoStrategy(strategy)) {
        const er = resolveEventosRaros(row, liveMap.get(a.eventId));
        if (!er || !erHasLucroCertoEntry(er)) return false;
      }
      if (isOverStrategy(strategy)) {
        const over = resolveOver(row, liveMap.get(a.eventId), strategy);
        if (!over || over.layOdds == null) return false;
      }
      if (isLayOverLimitPressureStrategy(strategy)) {
        const lolp = resolveLolp(row, liveMap.get(a.eventId));
        if (!lolp || lolp.layOdds == null) return false;
      }
      if (strategy === "lay-3x3") {
        const marketId = liveMap.get(a.eventId)?.analysis?.marketId ?? a.marketId;
        if (!marketId) return false;
      }
      if (!q) return true;
      const hay = `${a.home} ${a.away} ${a.eventName} ${a.competition ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    // Organização padrão: por horário (kickoff). Live primeiro, depois pré-live.
    const startMs = (row: OpportunityRow) => {
      const t = Date.parse(row.analysis.start);
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };
    const liveMinute = (row: OpportunityRow) => {
      const lr = resolveLiveRow(row);
      const m = lr?.live?.minute;
      return Number.isFinite(Number(m)) ? Number(m) : -1;
    };
    const isLiveRow = (row: OpportunityRow) => {
      if (resolveLiveRow(row)?.live) return true;
      const start = Date.parse(row.analysis.start);
      return (
        Number.isFinite(start) &&
        start <= Date.now() + 8 * 60_000 &&
        start >= Date.now() - 4 * 60 * 60_000
      );
    };
    const isEntry = (row: OpportunityRow) => {
      if (isQovStrategy(strategy)) {
        const qov = resolveQov(row, liveMap.get(row.analysis.eventId));
        return Boolean(qov?.entryReady);
      }
      if (isEventosRarosStrategy(strategy)) {
        const er = resolveEventosRaros(row, liveMap.get(row.analysis.eventId));
        return erHasPatternEntry(er);
      }
      if (isLucroCertoStrategy(strategy)) {
        const er = resolveEventosRaros(row, liveMap.get(row.analysis.eventId));
        return erHasLucroCertoEntry(er);
      }
      if (isOverStrategy(strategy)) {
        const over = resolveOver(
          row,
          liveMap.get(row.analysis.eventId),
          strategy,
        );
        return Boolean(over?.entryReady);
      }
      if (isLayOverLimitPressureStrategy(strategy)) {
        const lolp = resolveLolp(row, liveMap.get(row.analysis.eventId));
        return Boolean(lolp?.entryReady);
      }
      const plan =
        liveMap.get(row.analysis.eventId)?.tradePlan ?? row.analysis.tradePlan;
      return Boolean(plan?.entryReady);
    };
    const favRank = new Map(favorites.map((f, i) => [f.eventId, i]));

    return [...filtered].sort((a, b) => {
      const aLive = isLiveRow(a) ? 0 : 1;
      const bLive = isLiveRow(b) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;

      // ENTRAR e favoritos vêm antes do horário: com o kickoff decidindo
      // primeiro, os dois nunca chegavam a ser avaliados.
      const ae = isEntry(a) ? 0 : 1;
      const be = isEntry(b) ? 0 : 1;
      if (ae !== be) return ae - be;

      const ai = favRank.has(a.analysis.eventId)
        ? (favRank.get(a.analysis.eventId) as number)
        : Number.POSITIVE_INFINITY;
      const bi = favRank.has(b.analysis.eventId)
        ? (favRank.get(b.analysis.eventId) as number)
        : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;

      if (aLive === 0) {
        // Ao vivo: mais avançados primeiro; empate por kickoff
        const am = liveMinute(a);
        const bm = liveMinute(b);
        if (am !== bm) return bm - am;
      }

      const at = startMs(a);
      const bt = startMs(b);
      if (at !== bt) return at - bt;

      if (isQovStrategy(strategy)) {
        const ag =
          resolveQov(a, liveMap.get(a.analysis.eventId))?.goodCount ?? 0;
        const bg =
          resolveQov(b, liveMap.get(b.analysis.eventId))?.goodCount ?? 0;
        if (ag !== bg) return bg - ag;
      }
      if (isEventosRarosStrategy(strategy)) {
        const ag =
          resolveEventosRaros(a, liveMap.get(a.analysis.eventId))?.goodCount ?? 0;
        const bg =
          resolveEventosRaros(b, liveMap.get(b.analysis.eventId))?.goodCount ?? 0;
        if (ag !== bg) return bg - ag;
      }
      if (isOverStrategy(strategy)) {
        const ag =
          resolveOver(a, liveMap.get(a.analysis.eventId), strategy)?.goodCount ??
          0;
        const bg =
          resolveOver(b, liveMap.get(b.analysis.eventId), strategy)?.goodCount ??
          0;
        if (ag !== bg) return bg - ag;
      }
      if (isLayOverLimitPressureStrategy(strategy)) {
        const ag = resolveLolp(a, liveMap.get(a.analysis.eventId))?.goodCount ?? 0;
        const bg = resolveLolp(b, liveMap.get(b.analysis.eventId))?.goodCount ?? 0;
        if (ag !== bg) return bg - ag;
      }
      return 0;
    });
  }, [
    opps,
    query,
    onlyLive,
    onlyFavorites,
    strategy,
    liveAsOpportunities,
    liveMap,
    resolveLiveRow,
    favoriteIds,
    favorites,
  ]);

  const enrichmentGames = useMemo(
    () =>
      games.map((g) => ({
        eventId: g.analysis.eventId,
        home: g.analysis.home,
        away: g.analysis.away,
        start: g.analysis.start,
      })),
    [games],
  );

  const liveEnrichment = useGamesLiveEnrichment(
    enrichmentGames,
    hasBetbraLive,
  );

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      games.find((o) => o.analysis.eventId === selectedId) ??
      liveAsOpportunities.find((o) => o.analysis.eventId === selectedId) ??
      opps?.opportunities.find((o) => o.analysis.eventId === selectedId) ??
      null
    );
  }, [opps, selectedId, games, liveAsOpportunities]);

  const liveForSelected = selectedId ? liveMap.get(selectedId) : undefined;
  const activeTrade = liveForSelected?.tradePlan ?? selected?.analysis.tradePlan;
  const entryAlerts = (live?.alerts ?? []).filter((a) => a.severity === "entry").length;

  const activeAlertItems = useMemo<ActiveAlertItem[]>(() => {
    const severityRank: Record<ActiveAlertItem["severity"], number> = {
      entry: 0,
      abort: 1,
      watch: 2,
      info: 3,
    };
    const rowsById = new Map(
      (live?.rows ?? []).map((row) => [row.analysis.eventId, row]),
    );

    const strategyEnabled = (id: StrategyId | null): boolean => {
      if (id === "lay-3x3") return lay3x3On;
      if (id === "eventos-raros") return eventosRarosOn;
      if (id === "lucro-certo") return lucroCertoOn;
      if (id === "over-3.5") return over35On;
      if (id === "over-4.5") return over45On;
      if (id === "qov-lay-zebra") return qovOn;
      if (id === "lay-over-limit-pressure") return layOverLimitPressureOn;
      if (id === "lay-1x1") return lay1x1On;
      return false;
    };

    return (live?.alerts ?? [])
      .filter(isPanelActiveAlert)
      .filter((alert): alert is typeof alert & { eventId: string } =>
        Boolean(alert.eventId),
      )
      .filter((alert) => {
        const owner = alertStrategyId(alert);
        // Só alertas da estratégia selecionada e com filtro ligado.
        if (owner !== strategy) return false;
        return strategyEnabled(owner);
      })
      .map((alert) => {
        const row = rowsById.get(alert.eventId);
        const eventName =
          alert.eventName ?? row?.analysis.eventName ?? "Evento ao vivo";
        const href = resolveAlertLink(alert, row);
        return {
          id: alert.id,
          severity: alert.severity,
          badge: alertBadgeLabel(alert, row),
          eventId: alert.eventId,
          eventName,
          subtitle: alertMarketLabel(alert, row),
          scoreLabel: row?.live?.scoreLabel,
          minute: row?.live?.minute,
          status: row?.live?.status,
          href,
        } satisfies ActiveAlertItem;
      })
      .sort((a, b) => {
        const bySeverity =
          severityRank[a.severity] - severityRank[b.severity];
        if (bySeverity !== 0) return bySeverity;
        const aMin = Number.isFinite(Number(a.minute)) ? Number(a.minute) : -1;
        const bMin = Number.isFinite(Number(b.minute)) ? Number(b.minute) : -1;
        return bMin - aMin;
      });
  }, [
    eventosRarosOn,
    lay3x3On,
    layOverLimitPressureOn,
    live,
    lucroCertoOn,
    over35On,
    over45On,
    qovOn,
    strategy,
  ]);

  const lastSyncSec =
    lastSyncAt == null
      ? 0
      : Math.max(0, Math.floor((Date.now() - lastSyncAt) / 1000));

  const signalStats = useMemo(() => {
    const oppsList = opps?.opportunities ?? [];
    const liveList = live?.rows ?? [];
    const lay3x3Ready = (row: OpportunityRow) => {
      const plan =
        liveMap.get(row.analysis.eventId)?.tradePlan ?? row.analysis.tradePlan;
      return Boolean(plan?.entryReady);
    };
    const lay3x3Filters = oppsList.length;
    const lay3x3Entries = oppsList.filter(lay3x3Ready).length;
    const lay3x3Waiting = oppsList.filter((r) => {
      const plan =
        liveMap.get(r.analysis.eventId)?.tradePlan ?? r.analysis.tradePlan;
      return Boolean(plan?.inEntryWindow && !plan?.entryReady);
    }).length;
    const qovLayReady = (row: LivePayload["rows"][number]) =>
      Boolean(row.qovLayUnderdog?.entryReady);
    const qovLayEvents = liveList.filter(
      (r) =>
        r.qovLayUnderdog &&
        (r.qovLayUnderdog.entryOdds != null ||
          r.qovLayUnderdog.layOdds != null),
    ).length;
    const erReady = (row: LivePayload["rows"][number]) =>
      Boolean(row.eventosRaros?.entryReady);
    const erEvents = liveList.filter(
      (r) =>
        r.eventosRaros &&
        (r.eventosRaros.layOdds != null ||
          (r.eventosRaros.candidates?.length ?? 0) > 0),
    ).length;
    return {
      lay3x3: {
        filters: lay3x3Filters,
        entries: lay3x3Entries,
        waiting: lay3x3Waiting,
        operating: lay3x3Entries > 0 || (live?.entries ?? 0) > 0,
      },
      qovLay: {
        events: qovLayEvents,
        entries: liveList.filter(qovLayReady).length,
        monitoring: qovLayEvents > 0,
      },
      eventosRaros: {
        events: erEvents,
        entries: liveList.filter(erReady).length,
        monitoring: erEvents > 0,
      },
    };
  }, [opps, live, liveMap]);

  const openEvent = (eventId: string) => {
    setSelectedId(eventId);
    setView("evento");
    setTopNavOpen(false);
    router.replace("/app?view=evento", { scroll: false });
    setDetailOpen({
      trade: true,
      moment: true,
      intel: true,
      signals: false,
      live: true,
      chart: false,
    });
  };

  const goNav = (next: NavView) => {
    setView(next);
    setTopNavOpen(false);
    if (next !== "evento") setSelectedId(null);
    router.replace(`/app?view=${next}`, { scroll: false });
  };

  const goStrategy = (next: StrategyId) => {
    setStrategy(next);
    setActiveStrategy(next);
    goNav("jogos");
  };

  /** Volta a lista completa (Lay 3x3 + Todos) — evita APK “vazio” por filtro estreito. */
  const resetListFilters = useCallback(() => {
    setStrategy("lay-3x3");
    setActiveStrategy("lay-3x3");
    setOnlyLive(false);
    setOnlyLiveFilter(false);
    setOnlyFavorites(false);
    setOnlyFavoritesFilter(false);
    setQuery("");
    if (!lay3x3On) {
      setLay3x3Enabled(true);
      setLay3x3On(true);
      if (isNativeApp()) void syncAutoLayBackground({ lay3x3On: true });
    }
    setView("jogos");
    setTopNavOpen(false);
    router.replace("/app?view=jogos", { scroll: false });
  }, [lay3x3On, router]);

  // APK: filtro gravado (ex. Lucro certo / Favoritos) esconde tudo enquanto o site
  // (outro storage) ainda mostra jogos — uma vez por sessão, volta a Lay 3x3.
  useEffect(() => {
    if (didAutoResetFilters.current || loading || !nativeApp) return;
    const feed =
      (live?.rows?.length ?? 0) + (opps?.opportunities?.length ?? 0);
    if (feed === 0 || games.length > 0) return;
    const narrow =
      strategy !== "lay-3x3" || onlyFavorites || onlyLive || Boolean(query.trim());
    if (!narrow) return;
    didAutoResetFilters.current = true;
    resetListFilters();
  }, [
    nativeApp,
    loading,
    live,
    opps,
    games.length,
    strategy,
    onlyFavorites,
    onlyLive,
    query,
    resetListFilters,
  ]);

  const toggleDetail = (key: string) => {
    setDetailOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const topNavItems: Array<{ id: NavView; label: string; href?: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "jogos", label: "Sinais" },
    { id: "estatisticas", label: "Estatísticas" },
    { id: "carteira", label: "Carteira" },
  ];

  return (
    <div className="app-frame is-terminal">
      <LiveAlertToasts
        toasts={toasts}
        onDismiss={dismiss}
        alertsArmed={alertsArmed}
        onArmAlerts={() => void armAlerts()}
      />
      <MatchStatsDrawer
        target={statsTarget}
        onClose={() => setStatsTarget(null)}
      />

      {nativeApp && (
      <header className="term-topbar">
        <div className="term-topbar-left">
          <button
            type="button"
            className="term-menu-btn"
            aria-label="Menu"
            aria-expanded={topNavOpen}
            onClick={() => setTopNavOpen((v) => !v)}
          >
            ☰
          </button>
          <img
            className="term-topbar-logo"
            src="/logo-tips3x3.png"
            alt="Tips3x3"
            width={120}
            height={36}
          />
          <nav className={`term-topnav ${topNavOpen ? "is-open" : ""}`} aria-label="Menu principal">
            {topNavItems.map((item) =>
              item.href ? (
                <a key={item.id} href={item.href}>
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? "is-active" : ""}
                  onClick={() => goNav(item.id as NavView)}
                >
                  {item.label}
                  {item.id === "live" && (live?.inplayCount ?? 0) > 0
                    ? ` (${live?.inplayCount})`
                    : ""}
                  {item.id === "jogos" && entryAlerts > 0 ? ` · ${entryAlerts}` : ""}
                </button>
              ),
            )}
          </nav>
        </div>
        <div className="term-topbar-right">
          <WalletBalanceBadge onClick={() => goNav("carteira")} />
          <label
            className="term-ext-switch"
            title={
              nativeApp
                ? "Auto Lay no app (Lay 3x3 green / Eventos raros hold — requer BetBra)"
                : "Envio automático via extensão Bolsa Manual"
            }
          >
            <span className="term-ext-switch-label">
              {nativeApp ? "Auto Lay" : "Ativar extensão"}
            </span>
            <input
              type="checkbox"
              checked={!!extAutoSend}
              onChange={(e) => setExtAutoSend(e.target.checked)}
              aria-label={nativeApp ? "Auto Lay" : "Ativar extensão"}
            />
            <span className="term-ext-switch-track" aria-hidden />
          </label>
          <span className="term-sys-status">
            <i className="term-dot is-live" aria-hidden />
            Sistema Online
          </span>
          <span className="term-sync-age" suppressHydrationWarning>
            {mounted ? `Atualizado há ${lastSyncSec}s` : "Sincronizando…"}
          </span>
          <button
            type="button"
            className="btn-icon"
            title="Atualizar"
            onClick={() => {
              setTick((t) => t + 1);
              void bankroll.reload();
            }}
          >
            ↻
          </button>
          <button
            type="button"
            className="btn-secondary term-logout-btn"
            title="Sair"
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).then(() => {
                window.location.href = "/login";
              });
            }}
          >
            Sair
          </button>
        </div>
      </header>
      )}

      <DashboardShell
        disabled={nativeApp}
        activeView={view}
        alertCount={entryAlerts}
        onNavigate={(next) => goNav(next)}
        onBuyCredits={() => goNav("carteira")}
        onLogout={() => {
          void fetch("/api/auth/logout", { method: "POST" }).then(() => {
            window.location.href = "/login";
          });
        }}
      >
      <main className="main-pane is-terminal">
        {view !== "dashboard" &&
          view !== "comparar" &&
          view !== "estatisticas" &&
          view !== "carteira" && (
        <header className="main-head">
          <div className="main-head-left">
            <div>
              <h2
                className={
                  view === "jogos" ? "main-head-title is-brand" : "main-head-title"
                }
              >
                {view === "evento" && selected ? (
                  selected.analysis.eventName
                ) : view === "live" ? (
                  "Live"
                ) : view === "alertas" ? (
                  "Alertas"
                ) : view === "config" ? (
                  "Configurações"
                ) : strategy === "qov-lay-zebra" ? (
                  <>
                    Lay <span>QOV zebra</span>
                  </>
                ) : strategy === "eventos-raros" ? (
                  <>
                    Eventos <span>raros</span>
                  </>
                ) : (
                  <>
                    Lay <span>3x3</span>
                  </>
                )}
              </h2>
              {view === "evento" && (
                <p>Todas as informações do evento selecionado</p>
              )}
            </div>
          </div>
          {view === "evento" && (
            <div className="main-head-actions">
              <button type="button" className="btn-secondary" onClick={() => goNav("jogos")}>
                ← Voltar aos jogos
              </button>
            </div>
          )}
        </header>
        )}

        {error && <div className="banner-error">{error}</div>}

        {view === "dashboard" && nativeApp && (
          <TradingTerminal
            bankroll={bankroll}
            liveRows={live?.rows ?? []}
            signalStats={signalStats}
            lastSyncSec={lastSyncSec}
            onOpenEvent={openEvent}
            exchange={{
              connected: betBraConnected,
              balance: betBraBalance,
              balanceError: betBraBalanceError,
              openOffers: betBraOpenOffers,
              openExposure: betBraOpenExposure,
              offersSummary: betBraOffersSummary,
              offers: betBraOffers,
              activeTrade: activeTradeSnap,
              reservedLc: nativeReservedLc,
              lucroCertoOn,
              lastLay: nativeLayLast,
              busy: betBraBusy,
              onConnect: () => {
                setBetBraBusy(true);
                void openBetBraLogin()
                  .then(() => refreshExchangeSnapshot())
                  .finally(() => setBetBraBusy(false));
              },
              onRefresh: () => {
                setBetBraBusy(true);
                void refreshExchangeSnapshot().finally(() =>
                  setBetBraBusy(false),
                );
              },
              onOpenSettings: () => goNav("config"),
            }}
          />
        )}

        {view === "dashboard" && !nativeApp && (
          <DashboardHero
            currentTier={isMaster ? "250" : creditTier}
            onActivate={() => goNav("carteira")}
          />
        )}

        {view === "jogos" && (
          <>
            <div className="filter-bar">
              <div className="filter-pills">
                {lay3x3On ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "lay-3x3" ? "active" : ""}`}
                    onClick={() => goStrategy("lay-3x3")}
                  >
                    <Grid3x3 aria-hidden className="pill-icon" />
                    Lay 3x3
                  </button>
                ) : null}
                {qovOn ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "qov-lay-zebra" ? "active" : ""}`}
                    onClick={() => goStrategy("qov-lay-zebra")}
                  >
                    <Sparkles aria-hidden className="pill-icon" />
                    Lay QOV zebra
                  </button>
                ) : null}
                {eventosRarosOn ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "eventos-raros" ? "active" : ""}`}
                    onClick={() => goStrategy("eventos-raros")}
                  >
                    <Sparkles aria-hidden className="pill-icon" />
                    Eventos raros
                  </button>
                ) : null}
                {lucroCertoOn ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "lucro-certo" ? "active" : ""}`}
                    onClick={() => goStrategy("lucro-certo")}
                  >
                    <Sparkles aria-hidden className="pill-icon" />
                    Lucro certo
                  </button>
                ) : null}
                {over35On ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "over-3.5" ? "active" : ""}`}
                    onClick={() => goStrategy("over-3.5")}
                  >
                    Over 3.5
                  </button>
                ) : null}
                {over45On ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "over-4.5" ? "active" : ""}`}
                    onClick={() => goStrategy("over-4.5")}
                  >
                    Over 4.5
                  </button>
                ) : null}
                {layOverLimitPressureOn ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "lay-over-limit-pressure" ? "active" : ""}`}
                    onClick={() => goStrategy("lay-over-limit-pressure")}
                  >
                    LOLP
                  </button>
                ) : null}
                {lay1x1On ? (
                  <button
                    type="button"
                    className={`pill ${strategy === "lay-1x1" ? "active" : ""}`}
                    onClick={() => goStrategy("lay-1x1")}
                  >
                    Lay 1x1
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`pill ${!onlyLive ? "active" : ""}`}
                  onClick={() => {
                    setOnlyLive(false);
                    setOnlyLiveFilter(false);
                  }}
                >
                  <List aria-hidden className="pill-icon" />
                  Todos
                </button>
                <button
                  type="button"
                  className={`pill ${onlyLive ? "active" : ""}`}
                  onClick={() => {
                    setOnlyLive(true);
                    setOnlyLiveFilter(true);
                  }}
                >
                  <Radio aria-hidden className="pill-icon pill-icon-live" />
                  Ao vivo
                </button>
                <button
                  type="button"
                  className={`pill ${onlyFavorites ? "active" : ""}`}
                  onClick={() => {
                    setOnlyFavorites((v) => {
                      const next = !v;
                      setOnlyFavoritesFilter(next);
                      return next;
                    });
                  }}
                >
                  <Star aria-hidden className="pill-icon" />
                  Favoritos{favorites.length > 0 ? ` (${favorites.length})` : ""}
                </button>
              </div>
              <label className="search-field">
                <span aria-hidden>⌕</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar jogo ou campeonato"
                />
              </label>
            </div>

            {activeAlertItems.length > 0 ? (
              <ActiveAlertsPanel
                items={activeAlertItems}
                onOpenEvent={openEvent}
              />
            ) : null}

            {isLayOverLimitPressureStrategy(strategy) ? (
              <LayOverLimitPressurePanel />
            ) : null}

            {isLay1x1Strategy(strategy) ? (
              <Lay1x1Panel
                snapshots={(live?.rows ?? [])
                  .map((r) => r.lay1x1)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .filter((s): s is any => s != null && !s.settled)}
              />
            ) : null}

            <div
              className={`match-board ${isLiveOnlyStrategy(strategy) ? "is-over-limite" : ""}`}
            >
              <div className="match-board-head" aria-hidden>
                <span className="match-col-fav">★</span>
                <span className="match-col-time">Tempo</span>
                <span className="match-col-sides">Times</span>
                <span className="match-col-inds">
                  {isLiveOnlyStrategy(strategy) ? "Filtros" : "Sinais"}
                </span>
                <span className="match-col-status">Status</span>
                <span className="match-col-odds">Mercado</span>
              </div>

              {loading && games.length === 0 && (
                <div className="banner-info">Carregando jogos do Mexchange…</div>
              )}

              {!loading && games.length === 0 && (
                <div className="empty-state panel-block">
                  <div className="empty-icon" aria-hidden>
                    ≡
                  </div>
                  <strong>
                    {isQovStrategy(strategy)
                      ? "Nenhum Lay QOV zebra com setup agora"
                      : isEventosRarosStrategy(strategy)
                        ? "Nenhum evento raro (CS lay ≥ 100) agora"
                        : isLucroCertoStrategy(strategy)
                          ? "Nenhum Lucro certo (placar impossível) agora"
                        : isOverStrategy(strategy)
                          ? `Nenhum Lay Over ${strategy === "over-3.5" ? "3.5" : "4.5"} com setup agora`
                        : isLayOverLimitPressureStrategy(strategy)
                          ? "Nenhum Lay Over Limite com Pressão com setup agora"
                        : isLay1x1Strategy(strategy)
                          ? "Nenhum jogo com favorito 1x0 e pressão agora"
                        : onlyFavorites
                        ? "Nenhum favorito nesta lista"
                        : onlyLive
                          ? "Nenhum jogo ao vivo agora"
                          : "Sem partidas com liquidez"}
                  </strong>
                  <p>
                    {isQovStrategy(strategy)
                      ? "Lay QOV zebra · live-only · trade com saída ~1%."
                      : isEventosRarosStrategy(strategy)
                        ? "Eventos raros · live late · hold até settle."
                        : isLucroCertoStrategy(strategy)
                          ? "Lucro certo · placar alvo já impossível · hold até settle."
                        : isOverStrategy(strategy)
                          ? `Lay Over ${strategy === "over-3.5" ? "3.5" : "4.5"} · lay→back com meta de lucro do painel.`
                      : isLayOverLimitPressureStrategy(strategy)
                        ? "Lay Over Limite com Pressão · varre todos os jogos ao vivo com análise cruzada."
                      : isLay1x1Strategy(strategy)
                        ? "Lay 1x1 · favorito abre 1x0 com pressão → lay no Placar Exato 1-1 · odd back fav. 1.05–1.15."
                      : onlyFavorites
                        ? "Toque na estrela de um jogo para fixá-lo no topo e receber gols."
                        : onlyLive
                          ? `Feed in-play: ${live?.inplayCount ?? 0} evento(s). Atualize em instantes.`
                          : "Só aparecem jogos com mercado 3-3 no dia."}
                  </p>
                  {(live?.rows?.length ?? 0) > 0 ||
                  (opps?.opportunities?.length ?? 0) > 0 ? (
                    <p className="ops-hint" style={{ marginTop: "0.75rem" }}>
                      Há {(live?.rows?.length ?? 0) + (opps?.opportunities?.length ?? 0)}{" "}
                      jogo(s) no feed, mas o filtro atual esconde todos.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="pill active"
                    style={{ marginTop: "0.85rem" }}
                    onClick={resetListFilters}
                  >
                    Ver todos · Lay 3x3
                  </button>
                </div>
              )}

              <div className="match-card-list">
                {games.map((row) => (
                  <GameRow
                    key={row.analysis.eventId}
                    row={row}
                    liveRow={resolveLiveRow(row)}
                    enrichedLive={liveEnrichment.resolve({
                      eventId: row.analysis.eventId,
                      home: row.analysis.home,
                      away: row.analysis.away,
                      start: row.analysis.start,
                    })}
                    strategy={strategy}
                    active={row.analysis.eventId === selectedId}
                    favorited={isFavorite(row.analysis.eventId)}
                    onToggleFavorite={() =>
                      void toggleFavorite({
                        eventId: row.analysis.eventId,
                        home: row.analysis.home,
                        away: row.analysis.away,
                        competition: row.analysis.competition,
                        start: row.analysis.start,
                      })
                    }
                    onOpen={() => openEvent(row.analysis.eventId)}
                    onOpenStats={() => {
                      const lr = resolveLiveRow(row);
                      const en = liveEnrichment.resolve({
                        eventId: row.analysis.eventId,
                        home: row.analysis.home,
                        away: row.analysis.away,
                        start: row.analysis.start,
                      });
                      setStatsTarget({
                        eventId: row.analysis.eventId,
                        home: row.analysis.home,
                        away: row.analysis.away,
                        start: row.analysis.start,
                        scoreLabel: lr?.live?.scoreLabel ?? en?.scoreLabel,
                        minute: lr?.live?.minute ?? en?.minute,
                        status: lr?.live?.status ?? en?.status,
                        competition: row.analysis.competition,
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {view === "live" && (
          <div className="panel-block">
            <ul className="live-list">
              {[...(live?.rows ?? [])]
                .sort((a, b) => {
                  const am = Number(a.live?.minute);
                  const bm = Number(b.live?.minute);
                  const aMin = Number.isFinite(am) ? am : -1;
                  const bMin = Number.isFinite(bm) ? bm : -1;
                  if (aMin !== bMin) return bMin - aMin;
                  const at = Date.parse(a.analysis.start ?? "");
                  const bt = Date.parse(b.analysis.start ?? "");
                  const aOk = Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
                  const bOk = Number.isFinite(bt) ? bt : Number.POSITIVE_INFINITY;
                  return aOk - bOk;
                })
                .map((row) => (
                <li key={row.analysis.eventId}>
                  <button type="button" className="live-card" onClick={() => openEvent(row.analysis.eventId)}>
                    <div className="live-card-main">
                      <LiveScoreBadge
                        scoreLabel={row.live?.scoreLabel}
                        minute={row.live?.minute}
                        status={row.live?.status}
                        compact
                      />
                      <div>
                        <strong>{row.analysis.eventName}</strong>
                        <p>{row.analysis.home && row.analysis.away ? `${row.analysis.home} vs ${row.analysis.away}` : "Ao vivo"}</p>
                      </div>
                    </div>
                    <span className={`tag ${row.confirmed ? "tag-entry" : ""}`}>
                      {row.confirmed ? "ENTRADA" : tradeStatus(row.tradePlan)}
                    </span>
                  </button>
                </li>
              ))}
              {(live?.rows.length ?? 0) === 0 && (
                <li className="empty">Nenhum jogo live monitorado.</li>
              )}
            </ul>
          </div>
        )}

        {view === "alertas" && (
          <div className="panel-block">
            <div className="alertas-ext-bar">
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={!!extAutoSend}
                  onChange={(e) => setExtAutoSend(e.target.checked)}
                />
                <span>
                  <strong>
                    {nativeApp ? "Auto Lay" : "Auto ENVIAR na extensão"}
                  </strong>
                  <em>
                    {nativeApp
                      ? "Envia ordens na BetBra pelas estratégias ligadas abaixo (3x3 = Lay+Back · Eventos raros = hold)."
                      : "No alerta ENTRAR das estratégias ligadas, envia Lay (e Back no 3x3) pela extensão."}
                  </em>
                </span>
              </label>
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={lay3x3On}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLay3x3Enabled(on);
                    setLay3x3On(on);
                    if (nativeApp) void syncAutoLayBackground({ lay3x3On: on });
                  }}
                />
                <span>
                  <strong>Auto Lay 3x3</strong>
                  <em>
                    Enviar Lay→Back (lucro{" "}
                    {String(targetProfitPct).replace(".", ",")}%). Desligado =
                    sem envio; os alertas continuam.
                  </em>
                </span>
              </label>
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={eventosRarosOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setEventosRarosEnabled(on);
                    setEventosRarosOn(on);
                    if (nativeApp)
                      void syncAutoLayBackground({ eventosRarosOn: on });
                  }}
                />
                <span>
                  <strong>Auto Eventos raros</strong>
                  <em>
                    Lay hold no padrão CS raro (ainda possível). Desligado = sem
                    envio; os alertas continuam.
                  </em>
                </span>
              </label>
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={lucroCertoOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLucroCertoEnabled(on);
                    setLucroCertoOn(on);
                    if (nativeApp)
                      void syncAutoLayBackground({ lucroCertoOn: on });
                  }}
                />
                <span>
                  <strong>Auto Lucro certo</strong>
                  <em>
                    Lay em placar já impossível, com carteira reservada.
                    Independente de Eventos raros.
                  </em>
                </span>
              </label>
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={over35On}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setOver35Enabled(on);
                    setOver35On(on);
                  }}
                />
                <span>
                  <strong>Lay Over 3.5</strong>
                  <em>
                    Lay→Back (meta{" "}
                    {String(targetProfitPct).replace(".", ",")}%) pela extensão
                    — o Auto Lay do app não opera Over.
                  </em>
                </span>
              </label>
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={over45On}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setOver45Enabled(on);
                    setOver45On(on);
                  }}
                />
                <span>
                  <strong>Lay Over 4.5</strong>
                  <em>
                    Lay→Back (meta{" "}
                    {String(targetProfitPct).replace(".", ",")}%) pela extensão
                    — o Auto Lay do app não opera Over.
                  </em>
                </span>
              </label>

              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={layOverLimitPressureOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLayOverLimitPressureEnabled(on);
                    setLayOverLimitPressureOn(on);
                    if (nativeApp)
                      void syncAutoLayBackground({
                        layOverLimitPressureOn: on,
                      });
                  }}
                />
                <span>
                  <strong>Lay Over Limite com Pressão (LOLP)</strong>
                  <em>
                    Varre Over 0.5/1.5/2.5/3.5/4.5, cruza estatísticas e valida pressão em tempo real.
                    Configurável no painel — lucro alvo (default 1%) e % banca (default 5%).
                  </em>
                </span>
              </label>

              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={lay1x1On}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLay1x1Enabled(on);
                    setLay1x1On(on);
                    if (nativeApp)
                      void syncAutoLayBackground({ lay1x1On: on });
                  }}
                />
                <span>
                  <strong>Auto Lay 1x1</strong>
                  <em>
                    Favorito abre 1×0 e mantém pressão → Lay no Placar Exato 1-1.
                    Odd back fav. 1.05–1.15 · Lay 15–30 · Somente Lay.
                  </em>
                </span>
              </label>
              <p className="alertas-ext-hint">
                {nativeApp
                  ? extAutoSend
                    ? betBraConnected
                      ? `Ligado — ${[
                          lay3x3On ? "Lay 3x3" : null,
                          eventosRarosOn ? "Eventos raros" : null,
                          lucroCertoOn ? "Lucro certo" : null,
                        ]
                          .filter(Boolean)
                          .join(" + ") || "nenhuma estratégia"} com sessão BetBra. Notificação persistente “Auto Lay ativo” mantém ordens com a tela desligada.`
                      : "Ligado — conecte a BetBra em Perfil para enviar ordens."
                    : "Desligado — marque Auto Lay para enviar no app."
                  : extAutoSend
                    ? "Ligado — mantenha a extensão Bolsa Manual atualizada e logada."
                    : "Desligado — marque para ligar o envio automático."}
              </p>
              <p className="alertas-ext-hint">
                {nativeApp
                  ? "Com Auto Lay ligado, o serviço em segundo plano faz poll a cada ~10s e envia Lay/Back mesmo com a tela desligada (não feche o app pelo gestor de tarefas). No browser desktop ainda precisa do painel aberto."
                  : "Notificações exigem o painel aberto. Com a tela desligada o navegador suspende o JavaScript — nenhum sinal novo é detectado."}
              </p>
            </div>
            <ul className="alerts">
              {(live?.alerts ?? []).map((a) => (
                <li key={a.id} className={severityClass(a.severity)}>
                  <strong>{a.title}</strong>
                  <div className="alert-event-row">
                    <p>{a.message}</p>
                    {a.mexchangeUrl ? (
                      <a
                        className="btn-primary btn-alert-bolsa"
                        href={withExchangeDomain(a.mexchangeUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir na Bolsa
                      </a>
                    ) : null}
                  </div>
                  <time>{formatKickoff(a.at)}</time>
                </li>
              ))}
              {(live?.alerts.length ?? 0) === 0 && (
                <li className="empty">Nenhum alerta ainda.</li>
              )}
            </ul>
          </div>
        )}

        {view === "estatisticas" && (
          <div className="panel-block">
            <header className="main-head" style={{ marginBottom: "1rem" }}>
              <div className="main-head-left">
                <div>
                  <h2 className="main-head-title">
                    Estatísticas <span>de indicações</span>
                  </h2>
                  <p>Eventos raros e Lucro certo registrados pelo scanner</p>
                </div>
              </div>
            </header>
            <IndicationsStats />
          </div>
        )}

        {view === "comparar" && (
          <div className="panel-block">
            <OddsComparePanel />
          </div>
        )}

        {view === "carteira" && <WalletPanel />}

        {view === "afiliados" && (
          <div className="panel-block">
            <AfiliadosPanel />
          </div>
        )}

        {view === "downloads" && (
          <div className="panel-block">
            <DownloadsPanel />
          </div>
        )}

        {view === "config" && (
          <div className="panel-block config-panel">
            {walletBlocked && !isMaster ? (
              <div className="banner-error">
                Sem crédito — a automação não executa novas operações.
                Adicione crédito para liberar os filtros.
              </div>
            ) : null}
            {nativeApp ? (
              <section className="config-card">
                <h3>Notificações</h3>
                <div className="cfg-row-list">
                  <div className="cfg-row">
                    <span className="cfg-row-icon" aria-hidden>
                      🔔
                    </span>
                    <div className="cfg-row-main">
                      <strong>Notificar todos os alertas</strong>
                    </div>
                    <label className="cfg-switch">
                      <input
                        type="radio"
                        name="notify-mode"
                        checked={!notifyOnlyMatched}
                        onChange={() => {
                          setNotifyOnlyMatchedState(false);
                          setNotifyOnlyMatched(false);
                        }}
                      />
                      <span className="cfg-switch-track" aria-hidden />
                    </label>
                  </div>
                  <div className="cfg-row">
                    <span className="cfg-row-icon" aria-hidden>
                      ✅
                    </span>
                    <div className="cfg-row-main">
                      <strong>Notificar só entradas correspondidas</strong>
                    </div>
                    <label className="cfg-switch">
                      <input
                        type="radio"
                        name="notify-mode"
                        checked={notifyOnlyMatched}
                        onChange={() => {
                          setNotifyOnlyMatchedState(true);
                          setNotifyOnlyMatched(true);
                        }}
                      />
                      <span className="cfg-switch-track" aria-hidden />
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="config-card">
              <h3>Domínio da Bolsa</h3>
              <p className="config-lead">
                BetBra e Bolsa de Aposta usam a mesma Bolsa (Mexchange) por
                baixo, mas cada domínio tem login/sessão próprios. Escolha
                onde você tem conta — os links e o Auto Lay do app vão abrir
                nesse domínio.
              </p>
              <div className="cfg-row-list">
                {EXCHANGE_DOMAIN_OPTIONS.map((opt) => (
                  <div className="cfg-row" key={opt.value}>
                    <span className="cfg-row-icon" aria-hidden>
                      🏦
                    </span>
                    <div className="cfg-row-main">
                      <strong>{opt.label}</strong>
                    </div>
                    <label className="cfg-switch">
                      <input
                        type="radio"
                        name="exchange-domain"
                        checked={exchangeDomain === opt.value}
                        onChange={() => {
                          setExchangeDomainState(opt.value);
                          setExchangeDomain(opt.value);
                        }}
                      />
                      <span className="cfg-switch-track" aria-hidden />
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="config-card">
              <h3>Filtros estratégicos</h3>
              <div className="cfg-row-list">
                <StrategyConfigRow
                  icon="3×3"
                  name="Lay 3x3"
                  tag="Lay + Back"
                  checked={lay3x3On}
                  locked={isMarketLocked("lay_3_3")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_3_3")]}`}
                  onToggle={(on) => {
                    setLay3x3Enabled(on);
                    setLay3x3On(on);
                    if (nativeApp) void syncAutoLayBackground({ lay3x3On: on });
                  }}
                  stake={{
                    value: nativeLay3x3StakePct,
                    unit: "%",
                    step: 1,
                    min: 1,
                    max: 100,
                    onChange: (n) => {
                      setNativeLay3x3StakePctState(n);
                      setNativeLay3x3StakePct(n);
                      bankroll.updateLay3x3StakePct(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeLay3x3Pct: n });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="🦓"
                  name="Lay QOV zebra"
                  tag="Lay + Back"
                  checked={qovOn}
                  locked={isMarketLocked("lay_qov")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_qov")]}`}
                  onToggle={(on) => {
                    setQovEnabled(on);
                    setQovOn(on);
                    if (nativeApp) void syncAutoLayBackground({ qovOn: on });
                  }}
                  stake={{
                    value: nativeQovStakePct,
                    unit: "%",
                    step: 1,
                    min: 1,
                    max: 100,
                    onChange: (n) => {
                      setNativeQovStakePctState(n);
                      setNativeQovStakePct(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeQovPct: n });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="🛡️"
                  name="Eventos raros"
                  tag="Hold"
                  checked={eventosRarosOn}
                  locked={isMarketLocked("lay_eventos_raros")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_eventos_raros")]}`}
                  onToggle={(on) => {
                    setEventosRarosEnabled(on);
                    setEventosRarosOn(on);
                    if (nativeApp)
                      void syncAutoLayBackground({ eventosRarosOn: on });
                  }}
                  stake={{
                    value: nativeEventosRarosStake,
                    unit: "R$",
                    step: 50,
                    min: 1,
                    onChange: (n) => {
                      setNativeEventosRarosStakeState(n);
                      setNativeEventosRarosStake(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeFixedEr: n });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="🎯"
                  name="Lucro certo"
                  tag="Stake fixa"
                  checked={lucroCertoOn}
                  locked={isMarketLocked("lay_lucro_certo")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_lucro_certo")]}`}
                  onToggle={(on) => {
                    setLucroCertoEnabled(on);
                    setLucroCertoOn(on);
                    if (nativeApp)
                      void syncAutoLayBackground({ lucroCertoOn: on });
                  }}
                  stake={{
                    value: nativeLucroCertoStake,
                    unit: "R$",
                    step: 50,
                    min: 1,
                    onChange: (n) => {
                      setNativeLucroCertoStakeState(n);
                      setNativeLucroCertoStake(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeFixedLc: n });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="📈"
                  name="Lay Over 3.5"
                  tag="Lay + Back"
                  checked={over35On}
                  locked={isMarketLocked("lay_over_35")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_over_35")]}`}
                  onToggle={(on) => {
                    setOver35Enabled(on);
                    setOver35On(on);
                    if (nativeApp) void syncAutoLayBackground({ over35On: on });
                  }}
                  stake={{
                    value: nativeOverStakePct,
                    unit: "%",
                    step: 1,
                    min: 1,
                    max: 100,
                    onChange: (n) => {
                      setNativeOverStakePctState(n);
                      setNativeOverStakePct(n);
                      bankroll.updateOverStakePct(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeOver35Pct: n });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="📊"
                  name="Lay Over 4.5"
                  tag="Lay + Back"
                  checked={over45On}
                  locked={isMarketLocked("lay_over_45")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_over_45")]}`}
                  onToggle={(on) => {
                    setOver45Enabled(on);
                    setOver45On(on);
                    if (nativeApp) void syncAutoLayBackground({ over45On: on });
                  }}
                  stake={{
                    value: nativeOver45StakePct,
                    unit: "%",
                    step: 1,
                    min: 1,
                    max: 100,
                    onChange: (n) => {
                      setNativeOver45StakePctState(n);
                      setNativeOver45StakePct(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeOver45Pct: n });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="⚡"
                  name="Lay Over Limite"
                  tag="Lay + Back"
                  checked={layOverLimitPressureOn}
                  locked={isMarketLocked("lay_over_limit_pressure")}
                  lockedNote={`Disponível a partir de ${CREDIT_TIER_LABEL[tierRequiredForMarket("lay_over_limit_pressure")]}`}
                  onToggle={(on) => {
                    setLayOverLimitPressureEnabled(on);
                    setLayOverLimitPressureOn(on);
                    if (nativeApp)
                      void syncAutoLayBackground({
                        layOverLimitPressureOn: on,
                      });
                  }}
                  stake={{
                    value: nativeLolpStakePct,
                    unit: "%",
                    step: 1,
                    min: 1,
                    max: 25,
                    onChange: (n) => {
                      const applied = Math.round(setLolpStakePct(n / 100) * 100);
                      setNativeLolpStakePctState(applied);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeLolpPct: applied });
                    },
                  }}
                />
                <StrategyConfigRow
                  icon="⚽"
                  name="Lay 1x1"
                  tag="Somente Lay"
                  checked={lay1x1On}
                  onToggle={(on) => {
                    setLay1x1Enabled(on);
                    setLay1x1On(on);
                    if (nativeApp)
                      void syncAutoLayBackground({ lay1x1On: on });
                  }}
                  stake={{
                    value: nativeLay1x1StakePct,
                    unit: "%",
                    step: 1,
                    min: 1,
                    max: 25,
                    onChange: (n) => {
                      setNativeLay1x1StakePctState(n);
                      setNativeLay1x1StakePct(n);
                      if (nativeApp)
                        void syncAutoLayBackground({ stakeLay1x1Pct: n });
                    },
                  }}
                />
              </div>
              <label className="config-field" style={{ marginTop: "0.85rem" }}>
                Reserva Lucro certo (R$)
                <div className="config-field-row">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={nativeReservedLc}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setNativeReservedLcState(n);
                      setNativeReservedLucroCerto(n);
                      if (nativeApp)
                        void syncAutoLayBackground({
                          reservedLucroCerto: n,
                        });
                    }}
                  />
                  <span>R$</span>
                </div>
              </label>
            </section>

            <section className="config-card">
              <h3>Lucro alvo · Lay→Back</h3>
              <label className="config-field">
                <span>Lucro alvo %</span>
                <div className="config-field-row">
                  <input
                    type="number"
                    min={0.1}
                    max={100}
                    step={0.1}
                    inputMode="decimal"
                    value={profitDraft.replace(",", ".")}
                    onChange={(e) => setProfitDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      const n = Number(String(profitDraft).replace(",", "."));
                      if (!Number.isFinite(n) || n < 0.1 || n > 100) {
                        setProfitDraft(String(targetProfitPct).replace(".", ","));
                        return;
                      }
                      const rounded = Math.round(n * 100) / 100;
                      setTargetProfitPctPoints(rounded);
                      setTargetProfitPct(rounded);
                      setProfitDraft(String(rounded).replace(".", ","));
                      setTick((t) => t + 1);
                      if (nativeApp)
                        void syncAutoLayBackground({
                          profitPctPoints: rounded,
                        });
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </label>
              <div className="config-presets">
                {[0.1, 0.5, 1, 2].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pill ${targetProfitPct === p ? "active" : ""}`}
                    onClick={() => {
                      setTargetProfitPctPoints(p);
                      setTargetProfitPct(p);
                      setProfitDraft(String(p).replace(".", ","));
                      setTick((t) => t + 1);
                      if (nativeApp)
                        void syncAutoLayBackground({ profitPctPoints: p });
                    }}
                  >
                    {String(p).replace(".", ",")}%
                  </button>
                ))}
              </div>
            </section>

            {isMaster && !nativeApp ? (
              <section className="config-card">
                <h3>Administração</h3>
                <a href="/admin" className="btn-primary">
                  Abrir administração
                </a>
              </section>
            ) : null}
          </div>
        )}

        {view === "evento" && selected && (
          <EventDetail
            selected={selected}
            liveForSelected={liveForSelected}
            activeTrade={activeTrade}
            strategy={strategy}
            detailOpen={detailOpen}
            favorited={isFavorite(selected.analysis.eventId)}
            onToggleFavorite={() =>
              void toggleFavorite({
                eventId: selected.analysis.eventId,
                home: selected.analysis.home,
                away: selected.analysis.away,
                competition: selected.analysis.competition,
                start: selected.analysis.start,
              })
            }
            onToggle={toggleDetail}
          />
        )}

        {view === "evento" && !selected && (
          <div className="empty-state panel-block">
            <strong>Selecione um jogo</strong>
            <p>Volte à lista e clique em um evento para ver a análise completa.</p>
            <button type="button" className="btn-primary" onClick={() => goNav("jogos")}>
              Ver jogos
            </button>
          </div>
        )}
      </main>
      </DashboardShell>
    </div>
  );
}

function formatLiveMinute(minute: number | null | undefined, status?: string) {
  if (minute == null || !Number.isFinite(minute)) {
    if (status && /HT|intervalo/i.test(status)) return "HT";
    return "—";
  }
  return `${Math.max(0, Math.floor(minute))}′`;
}

function indicatorToneLabel(tone: OverIndicatorTone): string {
  switch (tone) {
    case "good":
      return "OK";
    case "warn":
      return "Atenção";
    case "bad":
      return "Fora";
    default:
      return "Aguardando";
  }
}

function formatIndicatorValue(id: string, value: number): string {
  if (id === "liquidity") return `R$ ${value.toFixed(0)}`;
  if (id === "momentum") return value.toFixed(2);
  if (id === "ticks" || id === "gap") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (id === "oddsBand" || id === "misprice" || id === "correction") {
    return value.toFixed(2);
  }
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function LiveScoreBadge({
  scoreLabel,
  minute,
  status,
  compact = false,
}: {
  scoreLabel?: string | null;
  minute?: number | null;
  status?: string;
  compact?: boolean;
}) {
  if (!scoreLabel) {
    return <span className="live-score-empty">—</span>;
  }

  return (
    <div className={`live-score-badge ${compact ? "compact" : ""}`}>
      <strong className="live-score-num">{scoreLabel}</strong>
      <span className="live-score-min">
        <span className="dot-live" aria-hidden />
        {formatLiveMinute(minute, status)}
      </span>
    </div>
  );
}

function GameRow({
  row,
  liveRow,
  enrichedLive,
  strategy = "eventos-raros",
  active,
  favorited,
  onToggleFavorite,
  onOpen,
  onOpenStats,
}: {
  row: OpportunityRow;
  liveRow?: LivePayload["rows"][number];
  enrichedLive?: EnrichedLiveSnapshot | null;
  strategy?: StrategyId;
  active?: boolean;
  favorited: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  onOpenStats: () => void;
}) {
  const a = row.analysis;
  const plan = liveRow?.tradePlan ?? a.tradePlan;
  const qovStrategy = isQovStrategy(strategy);
  const erStrategy = isEventosRarosStrategy(strategy);
  const lucroStrategy = isLucroCertoStrategy(strategy);
  const overStrategy = isOverStrategy(strategy);
  const lolpStrategy = isLayOverLimitPressureStrategy(strategy);
  const lay1x1Strat = isLay1x1Strategy(strategy);
  const indicatorStrategy =
    qovStrategy || erStrategy || lucroStrategy || overStrategy || lolpStrategy || lay1x1Strat;
  const qov = resolveQov(row, liveRow);
  const er = resolveEventosRaros(row, liveRow);
  const over = resolveOver(row, liveRow, strategy);
  const lolp = lolpStrategy ? resolveLolp(row, liveRow) : null;
  const lay1x1Live = lay1x1Strat ? (liveRow?.lay1x1 ?? null) : null;
  const lucroEntries =
    er?.entries?.filter((e) => e.entryReady !== false && e.alreadyImpossible) ??
    [];
  const patternEntries =
    er?.entries?.filter((e) => e.entryReady !== false && !e.alreadyImpossible) ??
    [];
  const marketLabel = qovStrategy
    ? "QOV · Lay zebra"
    : lucroStrategy
      ? lucroEntries.length > 1
        ? `CS · LUCRO CERTO · ${lucroEntries.length}`
        : `CS · LUCRO CERTO · ${lucroEntries[0]?.label ?? er?.scoreLabel ?? "—"}`
    : erStrategy
      ? patternEntries.length > 1
        ? `CS · ${patternEntries.length} placares`
        : `CS · ${patternEntries[0]?.label ?? er?.scoreLabel ?? "raro"}`
      : overStrategy
        ? `Total · Over ${strategy === "over-3.5" ? "3.5" : "4.5"}`
      : lolpStrategy
        ? `Total · Over ${lolp?.line != null ? lolp.line.toFixed(1) : "Limite"} (pressão)`
      : lay1x1Strat
        ? "Placar Correto · 1-1"
      : "Placar Correto · 3-3";
  const marketUrl = qovStrategy
    ? liveRow?.qovMexchangeUrl ?? row.qovMexchangeUrl ?? row.mexchangeUrl
    : erStrategy || lucroStrategy
      ? liveRow?.eventosRarosMexchangeUrl ??
        row.eventosRarosMexchangeUrl ??
        row.mexchangeUrl
      : strategy === "over-3.5"
        ? liveRow?.overMexchangeUrl35 ??
          row.overMexchangeUrl35 ??
          row.mexchangeUrl
        : strategy === "over-4.5"
          ? liveRow?.overMexchangeUrl45 ??
            row.overMexchangeUrl45 ??
            row.mexchangeUrl
      : lolpStrategy
        ? lolp?.mexchangeUrl ?? row.mexchangeUrl
      : lay1x1Strat
        ? lay1x1Live?.mexchangeUrl ?? row.mexchangeUrl
      : row.mexchangeUrl;
  const marketUrlResolved = withExchangeDomain(marketUrl);
  const live =
    liveRow?.live ??
    (enrichedLive
      ? {
          scoreLabel: enrichedLive.scoreLabel,
          minute: enrichedLive.minute,
          status: enrichedLive.status,
          stillPossible33: true,
        }
      : null);
  const isLive = Boolean(live?.minute != null || live?.scoreLabel);
  const status = qovStrategy
    ? qov?.settled
      ? "ENCERRADO"
      : qov?.entryReady
        ? "ENTRAR"
        : qov && qov.goodCount >= 1
          ? "ALINHANDO"
          : "QOV"
    : lucroStrategy
      ? er?.settled
        ? "ENCERRADO"
        : erHasLucroCertoEntry(er)
          ? "LUCRO CERTO"
          : "—"
    : erStrategy
      ? er?.settled
        ? "ENCERRADO"
        : erHasPatternEntry(er)
          ? "ENTRAR"
          : er && er.goodCount >= 1
            ? "ALINHANDO"
            : "RARO"
      : overStrategy
        ? over?.settled
          ? "ENCERRADO"
          : over?.entryReady
            ? "ENTRAR"
            : over && over.goodCount >= 1
              ? "ALINHANDO"
              : "OVER"
      : lolpStrategy
        ? lolp?.settled
          ? "ENCERRADO"
          : lolp?.entryReady
            ? "ENTRAR"
            : lolp && lolp.goodCount >= 1
              ? "ALINHANDO"
              : "LOLP"
      : lay1x1Strat
        ? lay1x1Live?.settled
          ? "ENCERRADO"
          : lay1x1Live?.entryReady
            ? "ENTRAR"
            : lay1x1Live && lay1x1Live.goodCount >= 1
              ? "ALINHANDO"
              : "1x1"
      : tradeStatus(plan);
  const statusKey = status.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const [homeGoals, awayGoals] = splitScoreLabel(live?.scoreLabel);
  const pulse =
    status === "ENTRAR" || status === "LUCRO CERTO"
      ? "is-pulse-entrar"
      : !indicatorStrategy &&
          (status === "CORRIGINDO" || status === "ALINHANDO")
        ? "is-pulse-corrigindo"
        : "";
  const showStatus =
    !indicatorStrategy || status === "ENTRAR" || status === "LUCRO CERTO";
  const rowIndicators = qovStrategy && qov && !qov.settled
    ? qov.indicators
    : (erStrategy || lucroStrategy) && er && !er.settled
      ? er.indicators
      : overStrategy && over && !over.settled
        ? over.indicators
      : lolpStrategy && lolp && !lolp.settled
        ? lolp.indicators
      : [];
  const indSnap = qovStrategy
    ? qov
    : erStrategy || lucroStrategy
      ? er
      : overStrategy
        ? over
        : lolpStrategy
          ? lolp
          : null;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`match-card ${indicatorStrategy ? "is-over-limite" : ""} ${active ? "is-active" : ""} ${isLive ? "is-live" : ""} ${favorited ? "is-fav" : ""} ${pulse}`.trim()}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="match-card-fav">
        <FavoriteStarButton active={favorited} onToggle={onToggleFavorite} size="sm" />
      </div>

      <div className="match-card-time">
        {isLive ? (
          <strong className="match-card-minute-badge">
            {formatLiveMinute(live?.minute, live?.status)}
          </strong>
        ) : (
          <div className="match-card-kick">
            <span className="match-card-date">{formatKickDate(a.start)}</span>
            <strong>{formatKickTime(a.start)}</strong>
          </div>
        )}
      </div>

      <div className="match-card-sides">
        <div className="match-card-side">
          <span className={`match-card-side-score ${isLive ? "" : "is-empty"}`}>
            {isLive ? homeGoals : ""}
          </span>
          <span className="match-card-side-name">{a.home}</span>
        </div>
        <div className="match-card-side">
          <span className={`match-card-side-score ${isLive ? "" : "is-empty"}`}>
            {isLive ? awayGoals : ""}
          </span>
          <span className="match-card-side-name">{a.away}</span>
        </div>
      </div>

      <div className="match-card-inds">
        {rowIndicators.map((indicator) => (
          <span
            key={indicator.id}
            className={`match-ind match-ind-${indicator.tone}${indicator.good ? " is-good" : ""}`}
            tabIndex={0}
            aria-label={`${indicator.label}: ${indicator.detail}`}
          >
            <span className="match-ind-glyph" aria-hidden>
              {indicator.icon}
            </span>
            <span className="match-ind-popup" role="tooltip">
              <span className="match-ind-popup-head">
                <span className="match-ind-popup-icon" aria-hidden>
                  {indicator.icon}
                </span>
                <strong>{indicator.label}</strong>
                <em className={`match-ind-popup-tone is-${indicator.tone}`}>
                  {indicatorToneLabel(indicator.tone)}
                </em>
              </span>
              <span className="match-ind-popup-detail">{indicator.detail}</span>
              {indicator.value != null && Number.isFinite(indicator.value) && (
                <span className="match-ind-popup-value">
                  Valor: {formatIndicatorValue(indicator.id, indicator.value)}
                </span>
              )}
            </span>
          </span>
        ))}
      </div>

      <div
        className={`match-card-status ${indicatorStrategy ? "is-over-limite" : ""}`}
      >
        {showStatus && (
          <span className={`status-chip status-${statusKey}`}>{status}</span>
        )}
        {indicatorStrategy && indSnap && !indSnap.settled && (
          <span className="match-ind-count">
            {indSnap.goodCount}/{indSnap.indicators.length}
          </span>
        )}
      </div>

      <div className="match-card-odds">
        <button
          type="button"
          className="match-stats-btn"
          title="Estatísticas do jogo"
          aria-label="Ver estatísticas"
          onClick={(e) => {
            e.stopPropagation();
            onOpenStats();
          }}
        >
          <BarChart3 />
        </button>
        <OddsQuoteButtons
          backOdds={
            qovStrategy
              ? qov?.backOdds ?? null
              : erStrategy || lucroStrategy
                ? er?.backOdds ?? null
                : overStrategy
                  ? over?.backOdds ?? null
                  : lay1x1Strat
                    ? null
                    : a.quotes?.back.odds
          }
          backAmount={
            indicatorStrategy ? 0 : a.quotes?.back.amount ?? 0
          }
          layOdds={
            qovStrategy
              ? qov?.layOdds ?? null
              : erStrategy || lucroStrategy
                ? er?.layOdds ?? null
                : overStrategy
                  ? over?.layOdds ?? null
                  : lay1x1Strat
                    ? lay1x1Live?.layOdds ?? null
                    : a.quotes?.lay.odds
          }
          layAmount={
            qovStrategy
              ? qov?.liquidity ?? 0
              : erStrategy || lucroStrategy
                ? er?.liquidity ?? 0
                : overStrategy
                  ? over?.layLiquidity ?? 0
                  : lay1x1Strat
                    ? lay1x1Live?.layLiquidity ?? 0
                    : a.quotes?.lay.amount ?? 0
          }
          label={marketLabel}
          href={marketUrlResolved}
          size="sm"
        />
      </div>
    </div>
  );
}

function EventDetail({
  selected,
  liveForSelected,
  activeTrade,
  strategy,
  detailOpen,
  favorited,
  onToggleFavorite,
  onToggle,
}: {
  selected: OpportunityRow;
  liveForSelected?: LivePayload["rows"][number];
  activeTrade?: TradePlan;
  strategy: StrategyId;
  detailOpen: Record<string, boolean>;
  favorited: boolean;
  onToggleFavorite: () => void;
  onToggle: (key: string) => void;
}) {
  const a = selected.analysis;
  const qov = resolveQov(selected, liveForSelected);
  const er = resolveEventosRaros(selected, liveForSelected);
  const over = resolveOver(selected, liveForSelected, strategy);
  const isQov = isQovStrategy(strategy);
  // Lucro certo lê o mesmo snapshot de Eventos raros — sem isto caía no 3-3.
  const isEr =
    isEventosRarosStrategy(strategy) || isLucroCertoStrategy(strategy);
  const isOver = isOverStrategy(strategy);
  const isInd = isQov || isEr || isOver;
  const qovStatus = qov?.entryReady
    ? "ENTRAR"
    : qov?.settled
      ? "ENCERRADO"
      : "MONITORAR";
  const erStatus = er?.entryReady
    ? "ENTRAR"
    : er?.settled
      ? "ENCERRADO"
      : "MONITORAR";
  const overStatus = over?.entryReady
    ? "ENTRAR"
    : over?.settled
      ? "ENCERRADO"
      : "MONITORAR";
  const indStatus = isQov
    ? qovStatus
    : isEr
      ? erStatus
      : isOver
        ? overStatus
        : null;
  const overLine = strategy === "over-3.5" ? "3.5" : "4.5";
  const marketLabel = isQov
    ? "QOV · Lay zebra"
    : isEr
      ? er?.entries && er.entries.length > 1
        ? `CS · ${er.entries.length} placares`
        : `CS · ${er?.scoreLabel ?? "Eventos raros"}`
      : isOver
        ? `Total · Over ${overLine}`
        : "Placar Correto · 3-3";
  const marketUrl = isQov
    ? liveForSelected?.qovMexchangeUrl ??
      selected.qovMexchangeUrl ??
      selected.mexchangeUrl
    : isEr
      ? liveForSelected?.eventosRarosMexchangeUrl ??
        selected.eventosRarosMexchangeUrl ??
        selected.mexchangeUrl
      : isOver
        ? strategy === "over-3.5"
          ? liveForSelected?.overMexchangeUrl35 ??
            selected.overMexchangeUrl35 ??
            selected.mexchangeUrl
          : liveForSelected?.overMexchangeUrl45 ??
            selected.overMexchangeUrl45 ??
            selected.mexchangeUrl
        : selected.mexchangeUrl;
  const marketUrlResolved = withExchangeDomain(marketUrl);
  const backOdds = isQov
    ? qov?.backOdds ?? null
    : isEr
      ? er?.backOdds ?? null
      : isOver
        ? over?.backOdds ?? null
        : a.quotes?.back.odds;
  const layOdds = isQov
    ? qov?.layOdds ?? null
    : isEr
      ? er?.layOdds ?? null
      : isOver
        ? over?.layOdds ?? null
        : a.quotes?.lay.odds;
  const backAmount = isInd ? 0 : a.quotes?.back.amount ?? 0;
  const layAmount = isQov
    ? qov?.liquidity ?? 0
    : isEr
      ? er?.liquidity ?? 0
      : isOver
        ? over?.layLiquidity ?? 0
        : a.quotes?.lay.amount ?? 0;

  return (
    <div className="event-detail">
      <div className="event-hero">
        <div>
          <div className="event-hero-title-row">
            <p className="eyebrow">{a.competition || "Futebol"}</p>
            <FavoriteStarButton
              active={favorited}
              onToggle={onToggleFavorite}
              size="md"
            />
          </div>
          <h3>
            {a.home} <span>vs</span> {a.away}
          </h3>
          {favorited && (
            <p className="fav-hint">
              Favorito · no topo da lista · notificações de gol ativas
            </p>
          )}
          {liveForSelected?.live ? (
            <LiveScoreBadge
              scoreLabel={liveForSelected.live.scoreLabel}
              minute={liveForSelected.live.minute}
              status={liveForSelected.live.status}
            />
          ) : (
            <p className="event-kick">Início {formatKickoff(a.start)}</p>
          )}
          <p className="event-summary">
            {isEr ? er?.summary ?? a.summary : a.summary}
          </p>
        </div>
        <div className="event-hero-actions">
          <OddsQuoteButtons
            label={marketLabel}
            backOdds={backOdds}
            backAmount={backAmount}
            layOdds={layOdds}
            layAmount={layAmount}
            href={marketUrlResolved}
            size="md"
          />
          {marketUrlResolved ? (
            <a className="btn-primary" href={marketUrlResolved} target="_blank" rel="noreferrer">
              Abrir na Bolsa
            </a>
          ) : null}
          <span
            className={`status-chip status-${(
              indStatus ?? tradeStatus(activeTrade)
            ).toLowerCase()}`}
          >
            {indStatus ?? tradeStatus(activeTrade)}
          </span>
        </div>
      </div>

      <div className="metric-strip">
        <div>
          <span>
            {isQov
              ? "Lay QOV"
              : isEr
                ? "Lay CS"
                : isOver
                  ? `Lay Over ${overLine}`
                  : "Lay"}
          </span>
          <strong>
            {isQov
              ? qov?.entryOdds?.toFixed(2) ?? "—"
              : isEr
                ? er?.layOdds?.toFixed(0) ?? "—"
                : isOver
                  ? over?.layOdds?.toFixed(2) ?? "—"
                  : activeTrade?.layOdds?.toFixed(0) ?? a.layOdds?.toFixed(0) ?? "—"}
          </strong>
        </div>
        <div>
          <span>{isEr ? "Placares" : isQov ? "Back alvo" : "Alvo back"}</span>
          <strong>
            {isEr
              ? er?.scoreLabels?.length
                ? er.scoreLabels.length > 2
                  ? `${er.scoreLabels.slice(0, 2).join(", ")} +${er.scoreLabels.length - 2}`
                  : er.scoreLabels.join(", ")
                : er?.scoreLabel ?? "—"
              : isQov
                ? qov?.exitPlan?.exitOdds.toFixed(2) ?? "—"
                : isOver
                  ? over?.exitPlan?.targetBackOdds?.toFixed(2) ?? "—"
                  : activeTrade?.targetBackOdds?.toFixed(0) ?? "—"}
          </strong>
        </div>
        <div>
          <span>{isInd ? "Liquidez" : "Score"}</span>
          <strong>
            {isQov
              ? `R$ ${qov?.liquidity.toFixed(0) ?? "—"}`
              : isEr
                ? `R$ ${er?.liquidity.toFixed(0) ?? "—"}`
                : isOver
                  ? `R$ ${over?.layLiquidity.toFixed(0) ?? "—"}`
                  : a.score}
          </strong>
        </div>
        <div>
          <span>{isInd ? "Indicadores" : "BTTS / Over"}</span>
          <strong>
            {isQov
              ? `${qov?.goodCount ?? 0}/${qov?.indicators.length ?? 0}`
              : isEr
                ? `${er?.goodCount ?? 0}/${er?.indicators.length ?? 0}`
                : isOver
                  ? `${over?.goodCount ?? 0}/${over?.indicators.length ?? 0}`
                  : `${a.bttsYes?.toFixed(2) ?? "—"} / ${a.over25?.toFixed(2) ?? "—"}`}
          </strong>
        </div>
      </div>

      <div className="detail-stack">
        <CollapsePanel
          title={isInd ? marketLabel : "Plano de trade"}
          subtitle={
            isQov
              ? qov?.summary ?? "QOV live · saída ~1%"
              : isEr
                ? er?.summary ?? "CS lay ≥ 100 · hold até settle"
                : isOver
                  ? over?.summary ?? `Lay Over ${overLine} · saída no back`
                  : activeTrade?.summary ?? "Lay 3-3 e saída no back"
          }
          open={detailOpen.trade}
          onToggle={() => onToggle("trade")}
          badge={
            <span className="tag tag-watch">
              {indStatus ?? tradeStatus(activeTrade)}
            </span>
          }
        >
          {isQov ? (
            <div className="signals">
              {qov?.exitPlan && (
                <p className="trade-oscillation">Saída: {qov.exitPlan.summary}</p>
              )}
              {(qov?.indicators ?? []).map((indicator) => (
                <article
                  key={indicator.id}
                  className={`signal level-${indicator.tone}`}
                >
                  <header>
                    <strong>
                      {indicator.icon} {indicator.label}
                    </strong>
                    <span>{indicator.good ? "OK" : "—"}</span>
                  </header>
                  <p>{indicator.detail}</p>
                </article>
              ))}
              {(qov?.blockers ?? [])
                .filter((b) => !/liquidez|momento|pressão/i.test(b))
                .map((b) => (
                  <article key={b} className="signal level-warn">
                    <header>
                      <strong>Filtro</strong>
                      <span>—</span>
                    </header>
                    <p>{b}</p>
                  </article>
                ))}
              {qov?.entryReady && (
                <p className="trade-oscillation">Setup pronto para entrada live.</p>
              )}
              {!qov && <p className="empty">QOV indisponível neste evento.</p>}
            </div>
          ) : isEr ? (
            <div className="signals">
              <p className="trade-oscillation">
                Saída: Hold até settle
                {er?.entries && er.entries.length > 1
                  ? ` · ${er.entries.length} lays no mesmo CS (mesmo saldo)`
                  : ""}
              </p>
              {(er?.entries ?? []).map((e) => (
                <article key={`entry-${e.label}`} className="signal level-good">
                  <header>
                    <strong>ENTRAR · {e.label}</strong>
                    <span>lay {e.layOdds.toFixed(0)}</span>
                  </header>
                  <p>
                    +{e.goalsNeeded} gols · {e.remainingMinutes.toFixed(0)}&apos;
                    {e.modelProb != null
                      ? ` · P ${(e.modelProb * 100).toFixed(2)}%`
                      : ""}
                    {" · hold"}
                  </p>
                </article>
              ))}
              {er?.best && !(er.entries?.length) && (
                <p className="trade-oscillation">
                  Alvo {er.best.label} · +{er.best.goalsNeeded} gols · ~
                  {er.best.remainingMinutes.toFixed(0)}&apos; · P implícita{" "}
                  {(er.best.impliedProb * 100).toFixed(2)}%
                  {er.best.modelProb != null
                    ? ` · P modelo ${(er.best.modelProb * 100).toFixed(2)}%`
                    : ""}
                </p>
              )}
              {(er?.indicators ?? []).map((indicator) => (
                <article
                  key={indicator.id}
                  className={`signal level-${indicator.tone}`}
                >
                  <header>
                    <strong>
                      {indicator.icon} {indicator.label}
                    </strong>
                    <span>{indicator.good ? "OK" : "—"}</span>
                  </header>
                  <p>{indicator.detail}</p>
                </article>
              ))}
              {(er?.candidates ?? [])
                .filter(
                  (c) =>
                    !c.entryReady &&
                    (c.stillPossible || c.alreadyImpossible),
                )
                .slice(0, 5)
                .map((c) => (
                  <article
                    key={c.label}
                    className={`signal level-${
                      c.alreadyImpossible || c.timeBlocked ? "good" : "warn"
                    }`}
                  >
                    <header>
                      <strong>{c.label}</strong>
                      <span>lay {c.layOdds.toFixed(0)}</span>
                    </header>
                    <p>
                      {c.alreadyImpossible
                        ? "LUCRO CERTO · placar live já invalida"
                        : `+${c.goalsNeeded} gols · ${c.remainingMinutes.toFixed(0)}'${
                            c.timeBlocked ? " · tempo bloqueia" : " · watch"
                          }`}
                      {!c.alreadyImpossible && c.modelProb != null
                        ? ` · P ${(c.modelProb * 100).toFixed(2)}%`
                        : ""}
                    </p>
                  </article>
                ))}
              {(er?.blockers ?? [])
                .filter((b) => !/liquidez|janela|tempo|modelo/i.test(b))
                .map((b) => (
                  <article key={b} className="signal level-warn">
                    <header>
                      <strong>Filtro</strong>
                      <span>—</span>
                    </header>
                    <p>{b}</p>
                  </article>
                ))}
              {er?.entryReady && (
                <p className="trade-oscillation">
                  Setup pronto · multi-lay CS permitido · hold até settle.
                </p>
              )}
              {!er && (
                <p className="empty">Eventos raros indisponível neste evento.</p>
              )}
            </div>
          ) : isOver ? (
            <div className="signals">
              {over?.exitPlan && (
                <p className="trade-oscillation">
                  Saída: {over.exitPlan.summary}
                </p>
              )}
              {(over?.indicators ?? []).map((indicator) => (
                <article
                  key={indicator.id}
                  className={`signal level-${indicator.tone}`}
                >
                  <header>
                    <strong>
                      {indicator.icon} {indicator.label}
                    </strong>
                    <span>{indicator.good ? "OK" : "—"}</span>
                  </header>
                  <p>{indicator.detail}</p>
                </article>
              ))}
              {over?.entryReady && (
                <p className="trade-oscillation">
                  Setup pronto para entrada live.
                </p>
              )}
              {!over && (
                <p className="empty">
                  Over {overLine} indisponível neste evento.
                </p>
              )}
            </div>
          ) : (
            <>
              {activeTrade?.example && (
                <p className="trade-example">
                  Ex. stake R$ {activeTrade.example.layStake}: liability R${" "}
                  {activeTrade.example.liability.toFixed(2)} → back R${" "}
                  {activeTrade.example.backStake?.toFixed(2) ?? "—"} · lucro R${" "}
                  {activeTrade.example.profit?.toFixed(2) ?? "—"}
                  {activeTrade.risk?.requiredMovePct != null
                    ? ` · odd precisa subir ~${activeTrade.risk.requiredMovePct.toFixed(0)}%`
                    : ""}
                </p>
              )}
              {activeTrade?.risk && (
                <p className={`trade-oscillation risk-${activeTrade.risk.tier}`}>
                  Risco {activeTrade.risk.tier}: {activeTrade.risk.detail}
                </p>
              )}
              {activeTrade?.fluidity && (
                <p className="trade-oscillation">{activeTrade.fluidity.detail}</p>
              )}
              {activeTrade?.correction && (
                <p className="trade-oscillation">
                  Correção: {activeTrade.correction.summary}
                  {activeTrade.correction.avgCorrectionMinutes != null
                    ? ` · média ${activeTrade.correction.avgCorrectionMinutes.toFixed(1)} min`
                    : ""}
                </p>
              )}
              {activeTrade?.correction?.underdogCrash?.matched && (
                <p className="trade-oscillation crash-pattern">
                  Zebra-crash {activeTrade.correction.underdogCrash.quality}:{" "}
                  {activeTrade.correction.underdogCrash.peakOdd.toFixed(0)}→
                  {activeTrade.correction.underdogCrash.troughOdd.toFixed(0)} (
                  {(activeTrade.correction.underdogCrash.dropPct * 100).toFixed(0)}
                  %)
                  {activeTrade.correction.underdogCrash.favorsQuickBounce
                    ? " · bounce rápido provável"
                    : ""}
                </p>
              )}
            </>
          )}
        </CollapsePanel>

        <CollapsePanel
          title="Confirmação live"
          subtitle={
            liveForSelected?.live
              ? `${liveForSelected.live.scoreLabel} · ${liveForSelected.live.minute ?? "?"}′`
              : "Feed ao vivo"
          }
          open={detailOpen.live}
          onToggle={() => onToggle("live")}
          badge={
            liveForSelected?.confirmed ? (
              <span className="tag tag-entry">ENTRADA</span>
            ) : undefined
          }
        >
          {liveForSelected?.live ? (
            <div className="live-box bare">
              <p>
                Placar <strong>{liveForSelected.live.scoreLabel}</strong> ·{" "}
                {liveForSelected.live.minute ?? "?"}′ ·{" "}
                {liveForSelected.confirmed ? (
                  <span className="tag tag-entry">ENTRADA</span>
                ) : (
                  <span className="tag">monitorando</span>
                )}
              </p>
              {liveForSelected.reasons?.length ? (
                <ul>
                  {liveForSelected.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="empty">Sem feed ao vivo para este evento no momento.</p>
          )}
        </CollapsePanel>

        <CollapsePanel
          title="Análise de momento"
          subtitle="Pré × live × fluidez × correção"
          open={detailOpen.moment}
          onToggle={() => onToggle("moment")}
        >
          <MomentAnalysisCard eventId={a.eventId} />
        </CollapsePanel>

        <CollapsePanel
          title="xG & pressão"
          subtitle="Expected goals e attack momentum"
          open={detailOpen.intel}
          onToggle={() => onToggle("intel")}
        >
          <MatchIntelCard home={a.home} away={a.away} start={a.start} />
        </CollapsePanel>

        <CollapsePanel
          title="Sinais pré-live"
          subtitle={`Score ${a.score}/100`}
          open={detailOpen.signals}
          onToggle={() => onToggle("signals")}
        >
          <div className="signals">
            {a.signals.map((s) => (
              <article key={s.id} className={`signal level-${s.level}`}>
                <header>
                  <strong>{s.label}</strong>
                  <span>{s.score}</span>
                </header>
                <p>{s.detail}</p>
              </article>
            ))}
          </div>
        </CollapsePanel>

        <CollapsePanel
          title="Gráfico odd & volume"
          subtitle="Movimentação e matched"
          open={detailOpen.chart}
          onToggle={() => onToggle("chart")}
        >
          <OddsVolumeChart
            runnerId={isQov ? qov?.runnerId : a.runnerId}
            marketId={isQov ? qov?.marketId : a.marketId}
            eventId={a.eventId}
            layOddsHint={isQov ? qov?.layOdds : a.layOdds}
            title={
              isQov
                ? `${marketLabel} · ${a.home} vs ${a.away}`
                : `Odd 3-3 · ${a.home} vs ${a.away}`
            }
          />
        </CollapsePanel>
      </div>
    </div>
  );
}

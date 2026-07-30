"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CollapsePanel } from "@/components/CollapsePanel";
import { FavoriteStarButton } from "@/components/FavoriteStarButton";
import { MatchIntelCard } from "@/components/MatchIntelCard";
import { MomentAnalysisCard } from "@/components/MomentAnalysisCard";
import { OddsQuoteButtons } from "@/components/OddsQuoteButtons";
import { OddsVolumeChart } from "@/components/OddsVolumeChart";
import { LiveAlertToasts } from "@/components/LiveAlertToasts";
import { NativeShell } from "@/components/NativeShell";
import { CentralGestao } from "@/components/CentralGestao";
import { TradingTerminal } from "@/components/terminal/TradingTerminal";
import { OddsComparePanel } from "@/components/OddsComparePanel";
import { useBankrollData } from "@/hooks/useBankrollData";
import { useGamesLiveEnrichment, type EnrichedLiveSnapshot } from "@/hooks/useGamesLiveEnrichment";
import { MatchStatsDrawer, type StatsTarget } from "@/components/MatchStatsDrawer";
import { useFavorites } from "@/hooks/useFavorites";
import { useLiveAlerts } from "@/hooks/useLiveAlerts";
import {
  getTargetProfitPctPoints,
  setTargetProfitPctPoints,
} from "@/lib/panel-settings";
import {
  BarChart3,
  Grid3x3,
  List,
  Radio,
  Star,
  Target,
  Sparkles,
} from "lucide-react";

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
  }>;
  rows: Array<{
    confirmed: boolean;
    mexchangeUrl: string;
    overMexchangeUrl?: string;
    overMexchangeUrl35?: string;
    qovMexchangeUrl?: string;
    eventosRarosMexchangeUrl?: string;
    reasons: string[];
    tradePlan?: TradePlan;
    overLimite?: OverLimiteSnapshot;
    overLimite35?: OverLimiteSnapshot;
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
  | "gestao"
  | "comparar"
  | "evento"
  | "config";
type StrategyId = "lay-3x3" | "qov-lay-zebra" | "eventos-raros";

function isQovStrategy(strategy: StrategyId): boolean {
  return strategy === "qov-lay-zebra";
}

function isEventosRarosStrategy(strategy: StrategyId): boolean {
  return strategy === "eventos-raros";
}

function isLiveOnlyStrategy(strategy: StrategyId): boolean {
  return isQovStrategy(strategy) || isEventosRarosStrategy(strategy);
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
    v === "gestao" ||
    v === "comparar" ||
    v === "evento" ||
    v === "config"
  );
}

function strategyFilterReady(strategy: StrategyId): boolean {
  return (
    strategy === "lay-3x3" ||
    strategy === "qov-lay-zebra" ||
    strategy === "eventos-raros"
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
  const [targetProfitPct, setTargetProfitPct] = useState(1);
  const [profitDraft, setProfitDraft] = useState("1");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const bankroll = useBankrollData();

  useEffect(() => {
    if (!searchParams.get("view")) {
      router.replace("/app?view=dashboard", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    const v = searchParams.get("view");
    if (isNavView(v)) setView(v);
  }, [searchParams]);

  useEffect(() => {
    setMounted(true);
    setLastSyncAt(Date.now());
  }, []);
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

  const { toasts, dismiss, alertsArmed, armAlerts, extAutoSend, setExtAutoSend } =
    useLiveAlerts(favorites, live?.rows);
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
      const [oRes, lRes] = await Promise.all([
        fetch(`/api/opportunities?limit=40${profitQ}`),
        fetch(`/api/live?limit=40${profitQ}`),
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
  }, [targetProfitPct]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 10000);
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
        return Boolean(er?.entryReady);
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

      if (aLive === 0) {
        // Ao vivo: mais avançados primeiro; empate por kickoff
        const am = liveMinute(a);
        const bm = liveMinute(b);
        if (am !== bm) return bm - am;
      }

      const at = startMs(a);
      const bt = startMs(b);
      if (at !== bt) return at - bt;

      // Desempate: ENTRAR → favoritos → over goodCount
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
    goNav("jogos");
  };

  const toggleDetail = (key: string) => {
    setDetailOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const topNavItems: Array<{ id: NavView | "planos"; label: string; href?: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "jogos", label: "Sinais" },
    { id: "comparar", label: "Comparar" },
    { id: "live", label: "Resultados" },
    { id: "gestao", label: "Histórico" },
    { id: "planos", label: "Planos", href: "/" },
    { id: "config", label: "Perfil" },
  ];

  return (
    <div className="app-frame is-terminal">
      <NativeShell />
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
          <label className="term-ext-switch" title="Envio automático via extensão Bolsa Manual">
            <span className="term-ext-switch-label">Ativar extensão</span>
            <input
              type="checkbox"
              checked={!!extAutoSend}
              onChange={(e) => setExtAutoSend(e.target.checked)}
              aria-label="Ativar extensão"
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

      <main className="main-pane is-terminal">
        {view !== "dashboard" && view !== "gestao" && view !== "comparar" && (
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

        {view === "dashboard" && (
          <TradingTerminal
            bankroll={bankroll}
            liveRows={live?.rows ?? []}
            signalStats={signalStats}
            lastSyncSec={lastSyncSec}
            onOpenEvent={openEvent}
          />
        )}

        {view === "jogos" && (
          <>
            <div className="filter-bar">
              <div className="filter-pills">
                <button
                  type="button"
                  className={`pill ${strategy === "lay-3x3" ? "active" : ""}`}
                  onClick={() => goStrategy("lay-3x3")}
                >
                  <Grid3x3 aria-hidden className="pill-icon" />
                  Lay 3x3
                </button>
                <button
                  type="button"
                  className={`pill ${strategy === "qov-lay-zebra" ? "active" : ""}`}
                  onClick={() => goStrategy("qov-lay-zebra")}
                >
                  <Target aria-hidden className="pill-icon" />
                  Lay QOV zebra
                </button>
                <button
                  type="button"
                  className={`pill ${strategy === "eventos-raros" ? "active" : ""}`}
                  onClick={() => goStrategy("eventos-raros")}
                >
                  <Sparkles aria-hidden className="pill-icon" />
                  Eventos raros
                </button>
                <button
                  type="button"
                  className={`pill ${!onlyLive ? "active" : ""}`}
                  onClick={() => setOnlyLive(false)}
                >
                  <List aria-hidden className="pill-icon" />
                  Todos
                </button>
                <button
                  type="button"
                  className={`pill ${onlyLive ? "active" : ""}`}
                  onClick={() => setOnlyLive(true)}
                >
                  <Radio aria-hidden className="pill-icon pill-icon-live" />
                  Ao vivo
                </button>
                <button
                  type="button"
                  className={`pill ${onlyFavorites ? "active" : ""}`}
                  onClick={() => setOnlyFavorites((v) => !v)}
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

            {!strategyFilterReady(strategy) ? (
              <div className="empty-state panel-block">
                <div className="empty-icon" aria-hidden>
                  ≡
                </div>
                <strong>Estratégia indisponível</strong>
                <p>
                  Quando o filtro desta estratégia for cadastrado, os jogos
                  aparecerão aqui com as mesmas ferramentas da lista.
                </p>
              </div>
            ) : (
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
                      : onlyFavorites
                        ? "Toque na estrela de um jogo para fixá-lo no topo e receber gols."
                        : onlyLive
                          ? `Feed in-play: ${live?.inplayCount ?? 0} evento(s). Atualize em instantes.`
                          : "Só aparecem jogos com mercado 3-3 no dia."}
                  </p>
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
            )}
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
                  <strong>Auto ENVIAR na extensão</strong>
                  <em>
                    No alerta ENTRAR (3-3 / QOV zebra), envia Lay com a odd
                    do painel e a saída Back pela % da extensão.
                  </em>
                </span>
              </label>
              <p className="alertas-ext-hint">
                {extAutoSend
                  ? "Ligado — mantenha a extensão Bolsa Manual atualizada (v1.6+) e logada (Lay 3-3 / QOV zebra)."
                  : "Desligado — marque para ligar o envio automático."}
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
                        href={a.mexchangeUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir na BetBra
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

        {view === "gestao" && (
          <div className="panel-block">
            <CentralGestao />
          </div>
        )}

        {view === "comparar" && (
          <div className="panel-block">
            <OddsComparePanel />
          </div>
        )}

        {view === "config" && (
          <div className="panel-block config-panel">
            <section className="config-card">
              <h3>Filtro · percentual alvo</h3>
              <p className="config-lead">
                Define o lucro alvo sobre a liability para calcular a odd de saída
                Back e os sinais ENTRAR do painel (ex.: 0,1 ou 1).
              </p>
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
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </label>
              <p className="config-hint">
                Atual: <strong>{String(targetProfitPct).replace(".", ",")}%</strong>
                {" · "}
                ex. lay 50 → back ~
                {(
                  50 / Math.max(1 - (targetProfitPct / 100) * 50, 0.01)
                ).toFixed(2)}
              </p>
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
                    }}
                  >
                    {String(p).replace(".", ",")}%
                  </button>
                ))}
              </div>
            </section>

            <section className="config-card">
              <h3>Extensão Bolsa Manual</h3>
              <label className="alertas-ext-toggle">
                <input
                  type="checkbox"
                  checked={!!extAutoSend}
                  onChange={(e) => setExtAutoSend(e.target.checked)}
                />
                <span>
                  <strong>Auto ENVIAR na extensão</strong>
                  <em>
                    No alerta ENTRAR (Lay 3-3 / QOV zebra), envia Lay com a
                    odd do painel. A saída Back usa o lucro % da extensão.
                  </em>
                </span>
              </label>
            </section>
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
  strategy = "lay-3x3",
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
  const indicatorStrategy = qovStrategy || erStrategy;
  const qov = resolveQov(row, liveRow);
  const er = resolveEventosRaros(row, liveRow);
  const marketLabel = qovStrategy
    ? "QOV · Lay zebra"
    : erStrategy
      ? er?.entries?.some((e) => e.alreadyImpossible)
        ? er.entries.length > 1
          ? `CS · LUCRO CERTO · ${er.entries.length}`
          : `CS · LUCRO CERTO · ${er?.scoreLabel ?? "raro"}`
        : er?.entries && er.entries.length > 1
          ? `CS · ${er.entries.length} placares`
          : `CS · ${er?.scoreLabel ?? "raro"}`
      : "Placar Correto · 3-3";
  const marketUrl = qovStrategy
    ? liveRow?.qovMexchangeUrl ?? row.qovMexchangeUrl ?? row.mexchangeUrl
    : erStrategy
      ? liveRow?.eventosRarosMexchangeUrl ??
        row.eventosRarosMexchangeUrl ??
        row.mexchangeUrl
      : row.mexchangeUrl;
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
    : erStrategy
      ? er?.settled
        ? "ENCERRADO"
        : er?.entryReady && er.entries?.some((e) => e.alreadyImpossible)
          ? "LUCRO CERTO"
          : er?.entryReady
            ? "ENTRAR"
            : er && er.goodCount >= 1
              ? "ALINHANDO"
              : "RARO"
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
    : erStrategy && er && !er.settled
      ? er.indicators
      : [];
  const indSnap = qovStrategy ? qov : erStrategy ? er : null;

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
              : erStrategy
                ? er?.backOdds ?? null
                : a.quotes?.back.odds
          }
          backAmount={
            qovStrategy || erStrategy ? 0 : a.quotes?.back.amount ?? 0
          }
          layOdds={
            qovStrategy
              ? qov?.layOdds ?? null
              : erStrategy
                ? er?.layOdds ?? null
                : a.quotes?.lay.odds
          }
          layAmount={
            qovStrategy
              ? qov?.liquidity ?? 0
              : erStrategy
                ? er?.liquidity ?? 0
                : a.quotes?.lay.amount ?? 0
          }
          label={marketLabel}
          href={marketUrl}
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
  const isQov = isQovStrategy(strategy);
  const isEr = isEventosRarosStrategy(strategy);
  const isInd = isQov || isEr;
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
  const indStatus = isQov ? qovStatus : isEr ? erStatus : null;
  const marketLabel = isQov
    ? "QOV · Lay zebra"
    : isEr
      ? er?.entries && er.entries.length > 1
        ? `CS · ${er.entries.length} placares`
        : `CS · ${er?.scoreLabel ?? "Eventos raros"}`
      : "Placar Correto · 3-3";
  const marketUrl = isQov
    ? liveForSelected?.qovMexchangeUrl ??
      selected.qovMexchangeUrl ??
      selected.mexchangeUrl
    : isEr
      ? liveForSelected?.eventosRarosMexchangeUrl ??
        selected.eventosRarosMexchangeUrl ??
        selected.mexchangeUrl
      : selected.mexchangeUrl;
  const backOdds = isQov
    ? qov?.backOdds ?? null
    : isEr
      ? er?.backOdds ?? null
      : a.quotes?.back.odds;
  const layOdds = isQov
    ? qov?.layOdds ?? null
    : isEr
      ? er?.layOdds ?? null
      : a.quotes?.lay.odds;
  const backAmount = isInd ? 0 : a.quotes?.back.amount ?? 0;
  const layAmount = isQov
    ? qov?.liquidity ?? 0
    : isEr
      ? er?.liquidity ?? 0
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
            href={marketUrl}
            size="md"
          />
          {marketUrl ? (
            <a className="btn-primary" href={marketUrl} target="_blank" rel="noreferrer">
              Abrir na BetBra
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
          <span>{isQov ? "Lay QOV" : isEr ? "Lay CS" : "Lay"}</span>
          <strong>
            {isQov
              ? qov?.entryOdds?.toFixed(2) ?? "—"
              : isEr
                ? er?.layOdds?.toFixed(0) ?? "—"
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

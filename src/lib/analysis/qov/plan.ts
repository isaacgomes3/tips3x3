import type { OddsHistoryPoint } from "@/lib/betbra/odds-history";
import type { TeamFormReport } from "@/lib/fotmob/form";
import {
  floorToTick,
  gapTicks,
  prevTradableOdd,
} from "@/lib/analysis/over-limite/ticks";
import { targetBackForLiabilityProfit } from "@/lib/analysis/trade-plan";
import { QOV } from "./config";
import type {
  IndicatorTone,
  MatchSide,
  QovExitPlan,
  QovIndicator,
  QovMode,
  QovSelection,
  QovSnapshot,
} from "./types";
import { QOV_INDICATOR_META } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tone(good: boolean, warn: boolean): IndicatorTone {
  if (good) return "good";
  if (warn) return "warn";
  return "bad";
}

function resolveSides(matchOdds?: {
  home?: { back?: number | null };
  away?: { back?: number | null };
}): {
  favoriteSide: MatchSide | null;
  underdogSide: MatchSide | null;
  favoriteOdd: number | null;
  underdogOdd: number | null;
} {
  const h = matchOdds?.home?.back;
  const a = matchOdds?.away?.back;
  if (
    h == null ||
    a == null ||
    !Number.isFinite(h) ||
    !Number.isFinite(a) ||
    h <= 1 ||
    a <= 1
  ) {
    return {
      favoriteSide: null,
      underdogSide: null,
      favoriteOdd: null,
      underdogOdd: null,
    };
  }
  const homeFav = h <= a;
  return {
    favoriteSide: homeFav ? "home" : "away",
    underdogSide: homeFav ? "away" : "home",
    favoriteOdd: homeFav ? h : a,
    underdogOdd: homeFav ? a : h,
  };
}

function sideLambda(
  form: TeamFormReport | null | undefined,
  side: MatchSide,
): number | null {
  if (!form) return null;
  if (side === "home") {
    const h = form.home;
    if (!h) return null;
    const v = h.homePlayed >= 2 ? h.homeAvgScored : h.avgScored;
    return Number.isFinite(v) ? v : null;
  }
  const a = form.away;
  if (!a) return null;
  const v = a.awayPlayed >= 2 ? a.awayAvgScored : a.avgScored;
  return Number.isFinite(v) ? v : null;
}

function selectionFor(side: MatchSide): QovSelection {
  return side === "home" ? "any-other-home" : "any-other-away";
}

/** Saída Lay após Back com ~targetPct do stake (greening). */
export function targetLayForStakeProfit(
  backOdds: number,
  targetPct = QOV.exit.targetProfitPct,
): number | null {
  if (!Number.isFinite(backOdds) || backOdds <= 1) return null;
  const raw = backOdds / (1 + targetPct);
  if (!(raw > 1)) return null;
  return prevTradableOdd(backOdds, raw) ?? floorToTick(raw);
}

function buildLayExit(entryLay: number): QovExitPlan | null {
  const pct = QOV.exit.targetProfitPct;
  const exitOdds = targetBackForLiabilityProfit(entryLay, pct);
  if (exitOdds == null || !(exitOdds > 1)) return null;
  return {
    entryOdds: entryLay,
    exitOdds,
    targetProfitPct: pct,
    entrySide: "lay",
    exitSide: "back",
    summary: `Lay x${entryLay.toFixed(2)} → Back x${exitOdds.toFixed(2)} (~${(pct * 100).toFixed(0)}% liability)`,
  };
}

function buildBackExit(entryBack: number): QovExitPlan | null {
  const pct = QOV.exit.targetProfitPct;
  const exitOdds = targetLayForStakeProfit(entryBack, pct);
  if (exitOdds == null || !(exitOdds > 1)) return null;
  return {
    entryOdds: entryBack,
    exitOdds,
    targetProfitPct: pct,
    entrySide: "back",
    exitSide: "lay",
    summary: `Back x${entryBack.toFixed(2)} → Lay x${exitOdds.toFixed(2)} (~${(pct * 100).toFixed(0)}% stake)`,
  };
}

function buildLiquidityIndicator(
  liquidity: number,
  minLiquidity: number,
  sideLabel: string,
): QovIndicator {
  const m = QOV_INDICATOR_META.liquidity;
  const good = liquidity >= minLiquidity;
  const warn = liquidity >= minLiquidity * 0.5;
  return {
    id: "liquidity",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `${sideLabel} R$ ${liquidity.toFixed(0)} (mín. ${minLiquidity})`
      : `Liquidez fraca R$ ${liquidity.toFixed(0)} · mín. R$ ${minLiquidity}`,
    value: liquidity,
  };
}

/**
 * Momento = pressão do favorito (FotMob).
 * Lay zebra e Back fav: ambos querem favorito dominando.
 */
function buildMomentumIndicator(
  mode: QovMode,
  pressure: number | null,
): QovIndicator {
  const m = QOV_INDICATOR_META.momentum;
  const min =
    mode === "lay-underdog"
      ? QOV.layUnderdog.minFavoritePressure
      : QOV.backFavorite.minFavoritePressure;

  if (pressure == null || !Number.isFinite(pressure)) {
    return {
      id: "momentum",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Momento/pressão do favorito indisponível",
      value: null,
    };
  }

  const abs = Math.abs(pressure);
  const good = abs >= min;
  const warn = abs >= min * 0.6;
  const thesis =
    mode === "lay-underdog"
      ? "favorito pressionando (protege lay na zebra)"
      : "favorito pressionando (caminho 4+)";

  return {
    id: "momentum",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Pressão fav. ${abs.toFixed(2)} ≥ ${min.toFixed(2)} — ${thesis}`
      : `Pressão fav. baixa (${abs.toFixed(2)} < ${min.toFixed(2)}) — sem momento`,
    value: abs,
  };
}

export function emptyQovSnapshot(mode: QovMode): QovSnapshot {
  return {
    mode,
    selection: null,
    favoriteSide: null,
    underdogSide: null,
    side: mode === "lay-underdog" ? "lay" : "back",
    settled: false,
    layOdds: null,
    backOdds: null,
    entryOdds: null,
    liquidity: 0,
    gapTicks: null,
    favoritePressureBias: null,
    indicators: [],
    goodCount: 0,
    entryReady: false,
    exitPlan: null,
    summary: "QOV disponível apenas ao vivo.",
    blockers: ["Pré-live / sem feed live"],
  };
}

export function buildQovSnapshot(opts: {
  mode: QovMode;
  layOdds: number | null;
  backOdds: number | null;
  liquidity?: number;
  marketId?: string;
  runnerId?: string;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: number | null;
  over25Back?: number | null;
  teamForm?: TeamFormReport | null;
  /** Pressão do favorito (FotMob) — filtro Momento. */
  favoritePressureBias?: number | null;
  /** Live obrigatório — sem placar/minuto não libera. */
  isLive?: boolean;
  historyPoints?: OddsHistoryPoint[];
}): QovSnapshot {
  const mode = opts.mode;
  const sides = resolveSides(opts.matchOdds);
  const blockers: string[] = [];
  const isLive = opts.isLive === true;
  const hs =
    opts.homeScore != null && Number.isFinite(opts.homeScore)
      ? opts.homeScore
      : null;
  const as =
    opts.awayScore != null && Number.isFinite(opts.awayScore)
      ? opts.awayScore
      : null;
  const minute =
    opts.minute != null && Number.isFinite(opts.minute) ? opts.minute : null;
  const projected = opts.teamForm?.projectedTotalGoals ?? null;
  const over25 =
    opts.over25Back != null && Number.isFinite(opts.over25Back)
      ? opts.over25Back
      : null;
  const pressure =
    opts.favoritePressureBias != null &&
    Number.isFinite(opts.favoritePressureBias)
      ? opts.favoritePressureBias
      : null;

  const targetSide: MatchSide | null =
    mode === "lay-underdog" ? sides.underdogSide : sides.favoriteSide;
  const selection = targetSide ? selectionFor(targetSide) : null;

  const layOdds = opts.layOdds;
  const backOdds = opts.backOdds;
  const gap = gapTicks(backOdds, layOdds);
  const liquidity = Number(opts.liquidity ?? 0) || 0;
  const minLiq =
    mode === "lay-underdog"
      ? QOV.layUnderdog.minLiquidity
      : QOV.backFavorite.minLiquidity;
  const sideLabel = mode === "lay-underdog" ? "Lay" : "Back";

  const entryOdds =
    mode === "lay-underdog"
      ? layOdds != null && layOdds > 1
        ? layOdds
        : null
      : backOdds != null && backOdds > 1
        ? backOdds
        : null;

  let settled = false;

  if (!isLive) {
    blockers.push("Somente live");
  }
  if (!sides.favoriteSide || !sides.underdogSide) {
    blockers.push("Sem Match Odds de favorito/zebra");
  }
  if (!selection || !opts.runnerId) {
    blockers.push("Runner QOV indisponível");
  }
  if (minute == null) {
    blockers.push("Sem minuto live");
  } else if (minute < QOV.minute.min || minute > QOV.minute.max) {
    blockers.push(`Minuto fora ${QOV.minute.min}–${QOV.minute.max}'`);
  }
  if (hs == null || as == null) {
    blockers.push("Sem placar live");
  }

  const favGoals =
    sides.favoriteSide === "home"
      ? hs
      : sides.favoriteSide === "away"
        ? as
        : null;
  const dogGoals =
    sides.underdogSide === "home"
      ? hs
      : sides.underdogSide === "away"
        ? as
        : null;

  const liquidityInd = buildLiquidityIndicator(liquidity, minLiq, sideLabel);
  const momentumInd = buildMomentumIndicator(mode, pressure);
  const indicators: QovIndicator[] = [liquidityInd, momentumInd];

  if (!liquidityInd.good) {
    blockers.push(liquidityInd.detail);
  }
  if (!momentumInd.good) {
    blockers.push(
      momentumInd.tone === "idle"
        ? "Sem momento (pressão)"
        : `Momento fraco (${Number(momentumInd.value ?? 0).toFixed(2)})`,
    );
  }

  if (mode === "lay-underdog") {
    const cfg = QOV.layUnderdog;
    if (
      sides.favoriteOdd == null ||
      sides.favoriteOdd > QOV.favoriteMaxOdds
    ) {
      blockers.push(`Favorito > ${QOV.favoriteMaxOdds.toFixed(2)}`);
    }
    if (entryOdds == null) {
      blockers.push("Sem odd lay QOV");
    } else if (entryOdds < cfg.oddsBand.min || entryOdds > cfg.oddsBand.max) {
      blockers.push(`Lay fora ${cfg.oddsBand.min}–${cfg.oddsBand.max}`);
    }
    if (gap != null && gap > cfg.maxGapTicks) {
      blockers.push(`Gap ${gap} > ${cfg.maxGapTicks} ticks`);
    }
    if (dogGoals != null && dogGoals > cfg.maxUnderdogGoals) {
      blockers.push(`Zebra com ${dogGoals} gols`);
      if (dogGoals >= 4 && favGoals != null && dogGoals > favGoals) {
        settled = true;
      }
    }
    if (projected != null && projected > cfg.maxProjectedTotal) {
      blockers.push(`Projeção alta (~${projected.toFixed(1)})`);
    }
    const dogLambda = sides.underdogSide
      ? sideLambda(opts.teamForm, sides.underdogSide)
      : null;
    if (dogLambda != null && dogLambda > cfg.maxUnderdogLambda) {
      blockers.push(`λ zebra ${dogLambda.toFixed(1)} alta`);
    }
    if (over25 != null && over25 < cfg.over25BackMin) {
      blockers.push(`Over 2.5 barato (${over25.toFixed(2)})`);
    }
  } else {
    const cfg = QOV.backFavorite;
    if (
      sides.favoriteOdd == null ||
      sides.favoriteOdd > cfg.favoriteMaxOdds
    ) {
      blockers.push(`Favorito > ${cfg.favoriteMaxOdds.toFixed(2)}`);
    }
    if (entryOdds == null) {
      blockers.push("Sem odd back QOV");
    } else if (entryOdds < cfg.oddsBand.min || entryOdds > cfg.oddsBand.max) {
      blockers.push(`Back fora ${cfg.oddsBand.min}–${cfg.oddsBand.max}`);
    }
    if (gap != null && gap > cfg.maxGapTicks) {
      blockers.push(`Gap ${gap} > ${cfg.maxGapTicks} ticks`);
    }
    if (favGoals != null && favGoals >= 4) {
      settled = true;
      blockers.push("Favorito já com 4+ gols");
    }
    if (dogGoals != null && dogGoals > cfg.maxUnderdogGoals) {
      blockers.push(`Zebra com ${dogGoals} gols`);
    }
    if (favGoals != null && favGoals < cfg.minFavoriteGoalsSoft) {
      blockers.push(`Favorito com <${cfg.minFavoriteGoalsSoft} gols`);
    }
    if (projected != null && projected < cfg.minProjectedTotal) {
      blockers.push(`Projeção baixa (~${projected.toFixed(1)})`);
    }
    const favLambda = sides.favoriteSide
      ? sideLambda(opts.teamForm, sides.favoriteSide)
      : null;
    if (favLambda != null && favLambda < cfg.minFavoriteLambda) {
      blockers.push(`λ favorito ${favLambda.toFixed(1)} baixa`);
    }
    if (over25 != null && over25 > cfg.over25BackMax) {
      blockers.push(`Over 2.5 caro (${over25.toFixed(2)})`);
    }
  }

  if (mode === "back-favorite" && favGoals != null) {
    const preferred =
      entryOdds != null &&
      entryOdds >= QOV.backFavorite.oddsBand.preferredMin &&
      entryOdds <= QOV.backFavorite.oddsBand.preferredMax;
    const strong = favGoals >= QOV.backFavorite.minFavoriteGoalsStrong;
    if (
      favGoals >= QOV.backFavorite.minFavoriteGoalsSoft &&
      !strong &&
      !preferred
    ) {
      blockers.push("Com 2 gols do fav. preferir faixa 10–20");
    }
  }

  const exitPlan =
    settled || entryOdds == null
      ? null
      : mode === "lay-underdog"
        ? buildLayExit(entryOdds)
        : buildBackExit(entryOdds);

  const criticalOk = indicators.every((i) => i.good);
  const goodCount = settled ? 0 : indicators.filter((i) => i.good).length;

  const entryReady =
    !settled &&
    isLive &&
    blockers.length === 0 &&
    criticalOk &&
    entryOdds != null &&
    exitPlan != null;

  const label =
    mode === "lay-underdog"
      ? `Lay QOV ${sides.underdogSide === "home" ? "casa" : sides.underdogSide === "away" ? "fora" : "?"}`
      : `Back QOV ${sides.favoriteSide === "home" ? "casa" : sides.favoriteSide === "away" ? "fora" : "?"}`;

  const summary = settled
    ? `${label} encerrado pelo placar.`
    : entryReady
      ? `${label} · ENTRAR · liq+momento ok · ${exitPlan?.summary ?? ""}`
      : blockers.length
        ? `${label} · ${blockers.slice(0, 2).join(" · ")}`
        : `${label} · aguardando setup`;

  return {
    mode,
    selection,
    favoriteSide: sides.favoriteSide,
    underdogSide: sides.underdogSide,
    side: mode === "lay-underdog" ? "lay" : "back",
    settled,
    marketId: opts.marketId,
    runnerId: opts.runnerId,
    layOdds,
    backOdds,
    entryOdds,
    liquidity,
    gapTicks: gap,
    favoritePressureBias: pressure,
    indicators: settled ? [] : indicators,
    goodCount,
    entryReady,
    exitPlan,
    summary: summary.trim(),
    blockers,
  };
}

/** Ajuste fino de % de saída (mantém clamp do over-limite). */
export function qovExitPct(): number {
  return clamp(QOV.exit.targetProfitPct, QOV.exit.minProfitPct, 0.02);
}

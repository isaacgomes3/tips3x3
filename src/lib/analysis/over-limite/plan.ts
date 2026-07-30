import type { OddsHistoryPoint } from "@/lib/betbra/odds-history";
import type { TeamFormReport } from "@/lib/fotmob/form";
import {
  analyzeCorrection,
  type CorrectionAnalysis,
} from "@/lib/analysis/correction";
import { analyzeFluidity } from "@/lib/analysis/fluidity";
import { OVER_LIMITE } from "./config";
import { gapTicks, tickSizeAt, ticksBetween, nextTradableOdd } from "./ticks";
import {
  OVER_INDICATOR_META,
  type OverIndicator,
  type OverExitPlan,
  type OverLimiteSnapshot,
  type IndicatorTone,
} from "./types";

function tone(good: boolean, warn: boolean): IndicatorTone {
  if (good) return "good";
  if (warn) return "warn";
  return "bad";
}

function meta(id: OverIndicator["id"]) {
  return OVER_INDICATOR_META[id];
}

/** Ticks/min a favor da estratégia = odd lay subindo (correção). */
export function measureFavorTicksPerMin(
  points: OddsHistoryPoint[],
  lookbackMin = 5,
): { ticksPerMin: number; favorTicks: number; minutes: number } {
  if (points.length < 2) return { ticksPerMin: 0, favorTicks: 0, minutes: 0 };
  const sorted = [...points].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const lastT = new Date(sorted[sorted.length - 1].createdAt).getTime();
  const cut = lastT - lookbackMin * 60_000;
  const window = sorted.filter((p) => new Date(p.createdAt).getTime() >= cut);
  if (window.length < 2) return { ticksPerMin: 0, favorTicks: 0, minutes: 0 };

  let favorTicks = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1].odd;
    const cur = window[i].odd;
    if (cur > prev + 1e-9) {
      const n = ticksBetween(prev, cur);
      if (Number.isFinite(n)) favorTicks += n;
    }
  }
  const t0 = new Date(window[0].createdAt).getTime();
  const t1 = new Date(window[window.length - 1].createdAt).getTime();
  const minutes = Math.max((t1 - t0) / 60_000, 0.25);
  return { ticksPerMin: favorTicks / minutes, favorTicks, minutes };
}

export function buildCorrectionIndicator(
  correction: CorrectionAnalysis | null,
  fluidityTradable: boolean,
): OverIndicator {
  const m = meta("correction");
  const favor = correction?.entryBias === "favor";
  const avoid = correction?.entryBias === "avoid";
  const good = Boolean(favor && fluidityTradable);
  return {
    id: "correction",
    label: m.label,
    icon: m.icon,
    tone: tone(good, favor && !fluidityTradable),
    good,
    detail:
      correction?.summary ||
      (avoid
        ? "Sem correção ativa / fase ruim"
        : favor
          ? "Corrigindo — aguardar fluidez"
          : "Aguardando choque→correção rápida"),
    value: correction?.episode?.slopePerMinute ?? null,
  };
}

export function buildTicksIndicator(points: OddsHistoryPoint[]): OverIndicator {
  const m = meta("ticks");
  const { ticksPerMin, favorTicks } = measureFavorTicksPerMin(points);
  const good = ticksPerMin >= OVER_LIMITE.minFavorTicksPerMin;
  const warn = ticksPerMin >= OVER_LIMITE.minFavorTicksPerMin * 0.55;
  return {
    id: "ticks",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: `${ticksPerMin.toFixed(1)} ticks/min a favor · ${favorTicks.toFixed(0)} ticks (5 min)`,
    value: ticksPerMin,
  };
}

export function buildMomentumIndicator(opts: {
  /** Bias de pressão do favorito (−1..1 ou 0..1). Positivo = favorito pressionando. */
  favoritePressureBias?: number | null;
  /** Pressão baixa no favorito = bom para lay Over (jogo menos aberto). */
  homeBias?: number | null;
  awayBias?: number | null;
  favoriteSide?: "home" | "away" | "unknown";
}): OverIndicator {
  const m = meta("momentum");
  const side = opts.favoriteSide ?? "unknown";
  let favBias: number | null = opts.favoritePressureBias ?? null;
  if (favBias == null && opts.homeBias != null && opts.awayBias != null) {
    favBias =
      side === "away"
        ? Number(opts.awayBias)
        : side === "home"
          ? Number(opts.homeBias)
          : Math.max(Number(opts.homeBias), Number(opts.awayBias));
  }
  if (favBias == null || !Number.isFinite(favBias)) {
    return {
      id: "momentum",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Momento/pressão ainda sem leitura",
      value: null,
    };
  }
  const abs = Math.abs(favBias);
  const good = abs <= OVER_LIMITE.maxFavoritePressureBias;
  const warn = abs <= OVER_LIMITE.maxFavoritePressureBias * 1.6;
  return {
    id: "momentum",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Pressão do favorito baixa (${abs.toFixed(2)}) — timing ok p/ lay contra Over`
      : `Pressão do favorito elevada (${abs.toFixed(2)}) — risco iminente no lay`,
    value: abs,
  };
}

export function buildMispriceIndicator(
  form: TeamFormReport | null,
  over25Back?: number | null,
): OverIndicator {
  const m = meta("misprice");
  const projected = form?.projectedTotalGoals ?? null;
  const overBack = over25Back != null && Number.isFinite(over25Back) ? over25Back : null;

  if (projected == null && overBack == null) {
    return {
      id: "misprice",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Sem leitura pré-live de viés Over",
      value: null,
    };
  }

  // Tendência pré-live de Over = setup (não bloqueio): mercado precifica gols
  const pricedForOver =
    (overBack != null && overBack <= OVER_LIMITE.overBiasBackMax) ||
    form?.confirmsHighScoring === true ||
    (projected != null && projected >= OVER_LIMITE.minProjectedGoalsForBias);

  const mild =
    !pricedForOver &&
    ((overBack != null && overBack <= OVER_LIMITE.overBiasBackMax + 0.25) ||
      (projected != null && projected >= OVER_LIMITE.minProjectedGoalsForBias - 0.3));

  return {
    id: "misprice",
    label: m.label,
    icon: m.icon,
    tone: tone(pricedForOver, mild),
    good: pricedForOver,
    detail: pricedForOver
      ? `Viés Over pré-live · back ${overBack?.toFixed(2) ?? "—"} · proj. ${projected?.toFixed(1) ?? "?"} — caçar correção/desajuste`
      : `Pouca precificação de Over · back ${overBack?.toFixed(2) ?? "—"} · proj. ${projected?.toFixed(1) ?? "?"}`,
    value: overBack ?? projected,
  };
}

export function buildLiquidityIndicator(layLiquidity: number): OverIndicator {
  const m = meta("liquidity");
  const good = layLiquidity >= OVER_LIMITE.minLayLiquidity;
  const warn = layLiquidity >= OVER_LIMITE.minLayLiquidity * 0.5;
  return {
    id: "liquidity",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: `Lay disponível R$ ${layLiquidity.toFixed(0)} (mín. ${OVER_LIMITE.minLayLiquidity})`,
    value: layLiquidity,
  };
}

export function buildGapIndicator(
  backOdds: number | null,
  layOdds: number | null,
): OverIndicator {
  const m = meta("gap");
  const gap = gapTicks(backOdds, layOdds);
  if (gap == null) {
    return {
      id: "gap",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Gap back/lay indisponível",
      value: null,
    };
  }
  const good = gap <= OVER_LIMITE.maxGapTicks;
  const warn = gap <= OVER_LIMITE.maxGapTicks + 1;
  return {
    id: "gap",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Gap ${gap} tick(s) — mercado justo`
      : `Gap ${gap} ticks — acima do máx. ${OVER_LIMITE.maxGapTicks}`,
    value: gap,
  };
}

export function buildOddsBandIndicator(layOdds: number | null): OverIndicator {
  const m = meta("oddsBand");
  const band = OVER_LIMITE.oddsBand;
  if (layOdds == null || !(layOdds > 1)) {
    return {
      id: "oddsBand",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Sem odd lay Over para faixa",
      value: null,
    };
  }
  const preferred = layOdds >= band.preferredMin && layOdds <= band.preferredMax;
  const inBand = layOdds >= band.min && layOdds <= band.max;
  const exposure = layOdds - 1;
  const good = preferred;
  const warn = inBand && !preferred;
  return {
    id: "oddsBand",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: preferred
      ? `Faixa ótima x${layOdds.toFixed(2)} · exp. ${exposure.toFixed(2)}× stake`
      : inBand
        ? `Faixa aceitável x${layOdds.toFixed(2)} · preferido ${band.preferredMin}–${band.preferredMax}`
        : `Fora da faixa ${band.min}–${band.max} (x${layOdds.toFixed(2)})`,
    value: layOdds,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildExitPlan(opts: {
  layOdds: number | null;
  historyPoints: OddsHistoryPoint[];
  minute?: number | null;
  favoritePressureBias?: number | null;
}): OverExitPlan | null {
  const layOdds = opts.layOdds;
  if (layOdds == null || !(layOdds > 1)) return null;

  const { ticksPerMin } = measureFavorTicksPerMin(opts.historyPoints);
  const speedFactor = clamp(
    ticksPerMin / OVER_LIMITE.exit.referenceTicksPerMin,
    0.5,
    1,
  );
  const minute = opts.minute ?? null;
  const minuteFactor =
    minute == null ? 0.85 : minute <= 55 ? 1 : minute <= 65 ? 0.88 : minute <= 70 ? 0.72 : 0.55;
  const pressure = opts.favoritePressureBias ?? null;
  const pressureFactor =
    pressure == null
      ? 0.9
      : pressure <= OVER_LIMITE.maxFavoritePressureBias
        ? 1
        : pressure <= 0.4
          ? 0.82
          : 0.65;
  const targetProfitPct = clamp(
    OVER_LIMITE.exit.targetProfitPct * speedFactor * minuteFactor * pressureFactor,
    OVER_LIMITE.exit.minProfitPct,
    OVER_LIMITE.exit.targetProfitPct,
  );
  const denominator = 1 - targetProfitPct * (layOdds - 1);
  if (denominator <= 0.05) return null;

  const rawTarget = layOdds / denominator;
  const targetBackOdds = nextTradableOdd(layOdds, rawTarget);
  if (targetBackOdds == null || !(targetBackOdds > 1)) return null;
  const targetTicks = ticksBetween(layOdds, targetBackOdds);
  const etaMinutes =
    ticksPerMin > 0 && Number.isFinite(targetTicks)
      ? targetTicks / ticksPerMin
      : null;
  const confidence =
    ticksPerMin >= OVER_LIMITE.exit.referenceTicksPerMin &&
    minute != null &&
    minute >= 15 &&
    minute <= 55 &&
    pressure != null &&
    pressure <= OVER_LIMITE.maxFavoritePressureBias
      ? "high"
      : ticksPerMin >= 0.5 && minute != null && minute <= 70
        ? "medium"
        : "low";
  const etaLabel = etaMinutes != null ? ` · ETA ~${etaMinutes.toFixed(0)} min` : "";
  const pressureLabel =
    pressure == null ? "pressão indisponível" : `pressão fav. ${pressure.toFixed(2)}`;

  return {
    entryLayOdds: layOdds,
    targetBackOdds,
    targetProfitPct,
    ticksPerMin,
    targetTicks: Number.isFinite(targetTicks) ? targetTicks : 0,
    etaMinutes,
    minute,
    favoritePressureBias: pressure,
    confidence,
    summary: `Back alvo x${targetBackOdds.toFixed(2)} · ${targetTicks.toFixed(0)} ticks · ${ticksPerMin.toFixed(1)} ticks/min · ${pressureLabel}${etaLabel}`,
  };
}

export function buildOverLimiteSnapshot(opts: {
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity?: number;
  marketId?: string;
  runnerId?: string;
  historyPoints?: OddsHistoryPoint[];
  teamForm?: TeamFormReport | null;
  over25Back?: number | null;
  favoriteSide?: "home" | "away" | "unknown";
  favoritePressureBias?: number | null;
  homeBias?: number | null;
  awayBias?: number | null;
  totalGoals?: number | null;
  minute?: number | null;
  /** Linha do Over (2.5, 3.5, …). Default: OVER_LIMITE.line */
  line?: number;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
}): OverLimiteSnapshot {
  const line = opts.line ?? OVER_LIMITE.line;
  const points = opts.historyPoints ?? [];
  const layLiquidity = Number(opts.layLiquidity ?? 0) || 0;
  const totalGoals =
    opts.totalGoals != null && Number.isFinite(opts.totalGoals)
      ? opts.totalGoals
      : null;
  const settled = totalGoals != null && totalGoals > line;

  const fluidity = points.length
    ? analyzeFluidity(points, { ...OVER_LIMITE.fluidity })
    : null;

  const correction =
    points.length >= 4
      ? analyzeCorrection({
          historyPoints: points,
          matchOdds: opts.matchOdds,
          shockOpts: { ...OVER_LIMITE.correction },
        })
      : null;

  const indicators: OverIndicator[] = [
    buildCorrectionIndicator(correction, fluidity?.tradable ?? false),
    buildTicksIndicator(points),
    buildMomentumIndicator({
      favoritePressureBias: opts.favoritePressureBias,
      homeBias: opts.homeBias,
      awayBias: opts.awayBias,
      favoriteSide: opts.favoriteSide,
    }),
    buildMispriceIndicator(opts.teamForm ?? null, opts.over25Back),
    buildLiquidityIndicator(layLiquidity),
    buildGapIndicator(opts.backOdds, opts.layOdds),
    buildOddsBandIndicator(opts.layOdds),
  ];

  // Gate por placar:
  // ≤1 gol: 4 índices (correção, ticks, liquidez, gap)
  // 2 gols: regra completa (5 críticos + momento sem pressão bad)
  const goalsKnown = totalGoals != null;
  const earlyScore =
    !goalsKnown || totalGoals <= OVER_LIMITE.earlyScoreMaxGoals;
  const criticalIds = earlyScore
    ? new Set(["correction", "ticks", "liquidity", "gap"])
    : new Set(["correction", "ticks", "liquidity", "gap", "oddsBand"]);
  const goodCount = settled ? 0 : indicators.filter((i) => i.good).length;
  const criticalOk = indicators
    .filter((i) => criticalIds.has(i.id))
    .every((i) => i.good);
  const momentum = indicators.find((i) => i.id === "momentum");
  // Com 2 gols, pressão alta (bad) atrasa entrada; até 1 gol o momento não bloqueia.
  const momentumOk = earlyScore || !momentum || momentum.tone !== "bad";
  const entryReady = !settled && criticalOk && momentumOk;
  const exitPlan = settled
    ? null
    : buildExitPlan({
        layOdds: opts.layOdds,
        historyPoints: points,
        minute: opts.minute,
        favoritePressureBias: opts.favoritePressureBias,
      });

  const gateLabel = earlyScore
    ? `≤${OVER_LIMITE.earlyScoreMaxGoals} gol · 4 filtros`
    : `${OVER_LIMITE.earlyScoreMaxGoals + 1}+ gols · regra completa`;
  const summary = settled
    ? `Over ${line} já atingido (${totalGoals} gols) — mercado encerrado para entrada.`
    : entryReady
    ? `Lay Over ${line} · ${gateLabel} · ${goodCount}/${indicators.length} ok`
    : `Lay Over ${line} · ${gateLabel} · ${goodCount}/${indicators.length} ok — caçar correção`;

  return {
    line,
    settled,
    marketId: opts.marketId,
    runnerId: opts.runnerId,
    layOdds: opts.layOdds,
    backOdds: opts.backOdds,
    layLiquidity,
    gapTicks: gapTicks(opts.backOdds, opts.layOdds),
    indicators: settled ? [] : indicators,
    goodCount,
    entryReady,
    exitPlan,
    summary,
  };
}

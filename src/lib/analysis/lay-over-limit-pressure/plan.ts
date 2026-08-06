import type { OddsHistoryPoint } from "@/lib/betbra/odds-history";
import type { TeamFormReport } from "@/lib/fotmob/form";
import {
  analyzeCorrection,
  type CorrectionAnalysis,
} from "@/lib/analysis/correction";
import { analyzeFluidity } from "@/lib/analysis/fluidity";
import { LAY_OVER_LIMIT_PRESSURE } from "./config";
import {
  gapTicks,
  tickSizeAt,
  ticksBetween,
  nextTradableOdd,
} from "@/lib/analysis/over-limite/ticks";
import {
  LAY_OVER_LIMIT_PRESSURE_INDICATOR_META,
  type LayOverLimitPressureIndicator,
  type LayOverLimitPressureExitPlan,
  type LayOverLimitPressureSnapshot,
  type IndicatorTone,
  type PressureMetrics,
} from "./types";

function tone(good: boolean, warn: boolean): IndicatorTone {
  if (good) return "good";
  if (warn) return "warn";
  return "bad";
}

function meta(id: LayOverLimitPressureIndicator["id"]) {
  return LAY_OVER_LIMIT_PRESSURE_INDICATOR_META[id];
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
): LayOverLimitPressureIndicator {
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

export function buildTicksIndicator(
  points: OddsHistoryPoint[],
): LayOverLimitPressureIndicator {
  const m = meta("ticks");
  const { ticksPerMin, favorTicks } = measureFavorTicksPerMin(points);
  const good = ticksPerMin >= LAY_OVER_LIMIT_PRESSURE.minFavorTicksPerMin;
  const warn = ticksPerMin >= LAY_OVER_LIMIT_PRESSURE.minFavorTicksPerMin * 0.55;
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

export function buildLiquidityIndicator(
  layLiquidity: number,
): LayOverLimitPressureIndicator {
  const m = meta("liquidity");
  const good = layLiquidity >= LAY_OVER_LIMIT_PRESSURE.minLayLiquidity;
  const warn = layLiquidity >= LAY_OVER_LIMIT_PRESSURE.minLayLiquidity * 0.5;
  return {
    id: "liquidity",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: `Lay disponível R$ ${layLiquidity.toFixed(0)} (mín. ${LAY_OVER_LIMIT_PRESSURE.minLayLiquidity})`,
    value: layLiquidity,
  };
}

export function buildGapIndicator(
  backOdds: number | null,
  layOdds: number | null,
): LayOverLimitPressureIndicator {
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
  const good = gap <= LAY_OVER_LIMIT_PRESSURE.maxGapTicks;
  const warn = gap <= LAY_OVER_LIMIT_PRESSURE.maxGapTicks + 1;
  return {
    id: "gap",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Gap ${gap} tick(s) — mercado justo`
      : `Gap ${gap} ticks — acima do máx. ${LAY_OVER_LIMIT_PRESSURE.maxGapTicks}`,
    value: gap,
  };
}

export function buildOddsBandIndicator(
  layOdds: number | null,
): LayOverLimitPressureIndicator {
  const m = meta("oddsBand");
  const band = LAY_OVER_LIMIT_PRESSURE.oddsBand;
  if (layOdds == null || !(layOdds > 1)) {
    return {
      id: "oddsBand",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Sem odd lay para faixa",
      value: null,
    };
  }
  const preferred = layOdds >= band.preferredMin && layOdds <= band.preferredMax;
  const inBand = layOdds >= band.min && layOdds <= band.max;
  const exposure = layOdds - 1;
  // Aprova toda a faixa operável (a mesma que o nativo usa como teto). A faixa
  // preferida sobra como tom visual: entra, mas sinaliza exposição maior.
  return {
    id: "oddsBand",
    label: m.label,
    icon: m.icon,
    tone: tone(preferred, inBand),
    good: inBand,
    detail: preferred
      ? `Faixa ótima x${layOdds.toFixed(2)} · exp. ${exposure.toFixed(2)}× stake`
      : inBand
        ? `Faixa aceitável x${layOdds.toFixed(2)} · exp. ${exposure.toFixed(2)}× stake · ótimo ${band.preferredMin}–${band.preferredMax}`
        : `Fora da faixa ${band.min}–${band.max} (x${layOdds.toFixed(2)})`,
    value: layOdds,
  };
}

export function buildFluidityIndicator(
  points: OddsHistoryPoint[],
): LayOverLimitPressureIndicator {
  const m = meta("fluidez");
  const fluidity = points.length
    ? analyzeFluidity(points, { ...LAY_OVER_LIMIT_PRESSURE.fluidity })
    : null;

  if (!fluidity) {
    return {
      id: "fluidez",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Histórico insuficiente",
      value: null,
    };
  }

  const good = fluidity.tradable;
  const warn = fluidity.level === "lateral";
  return {
    id: "fluidez",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: fluidity.detail,
    value: fluidity.score,
  };
}

export function buildPressureIndicators(
  metrics: PressureMetrics | null,
): [LayOverLimitPressureIndicator, LayOverLimitPressureIndicator] {
  const m1 = meta("pressao-chutes");
  const m2 = meta("pressao-area");

  if (!metrics) {
    return [
      {
        id: "pressao-chutes",
        label: m1.label,
        icon: m1.icon,
        tone: "idle",
        good: false,
        detail: "Dados de chutes indisponíveis",
        value: null,
      },
      {
        id: "pressao-area",
        label: m2.label,
        icon: m2.icon,
        tone: "idle",
        good: false,
        detail: "Dados de pressão indisponíveis",
        value: null,
      },
    ];
  }

  const shotsGood =
    metrics.shotsPerMinFavorite == null ||
    metrics.shotsPerMinFavorite <= LAY_OVER_LIMIT_PRESSURE.pressure.maxShotsPerMinFavorite;
  const shotsWarn =
    metrics.shotsPerMinFavorite != null &&
    metrics.shotsPerMinFavorite <= LAY_OVER_LIMIT_PRESSURE.pressure.maxShotsPerMinFavorite * 1.3;

  const areaGood =
    metrics.areaPressurePerMin == null ||
    metrics.areaPressurePerMin <= LAY_OVER_LIMIT_PRESSURE.pressure.maxAreaPressurePerMin;
  const areaWarn =
    metrics.areaPressurePerMin != null &&
    metrics.areaPressurePerMin <= LAY_OVER_LIMIT_PRESSURE.pressure.maxAreaPressurePerMin * 1.2;

  return [
    {
      id: "pressao-chutes",
      label: m1.label,
      icon: m1.icon,
      tone: tone(shotsGood, shotsWarn),
      good: shotsGood,
      detail: `Chutes/min fav: ${metrics.shotsPerMinFavorite?.toFixed(1) ?? "?"}`,
      value: metrics.shotsPerMinFavorite,
    },
    {
      id: "pressao-area",
      label: m2.label,
      icon: m2.icon,
      tone: tone(areaGood, areaWarn),
      good: areaGood,
      detail: `Passes/min na área: ${metrics.areaPressurePerMin?.toFixed(1) ?? "?"}`,
      value: metrics.areaPressurePerMin,
    },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildExitPlan(opts: {
  layOdds: number | null;
  historyPoints: OddsHistoryPoint[];
  minute?: number | null;
  favoritePressureBias?: number | null;
  targetProfitPct?: number | null;
}): LayOverLimitPressureExitPlan | null {
  const layOdds = opts.layOdds;
  if (layOdds == null || !(layOdds > 1)) return null;

  const { ticksPerMin } = measureFavorTicksPerMin(opts.historyPoints);
  const speedFactor = clamp(
    ticksPerMin / LAY_OVER_LIMIT_PRESSURE.exit.referenceTicksPerMin,
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
      : pressure <= LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBias
        ? 1
        : pressure <= 0.4
          ? 0.82
          : 0.65;

  const panelPct =
    opts.targetProfitPct != null &&
    Number.isFinite(opts.targetProfitPct) &&
    opts.targetProfitPct > 0
      ? opts.targetProfitPct
      : null;

  const targetProfitPct = panelPct
    ? clamp(panelPct, LAY_OVER_LIMIT_PRESSURE.exit.minProfitPct, 0.05)
    : clamp(
        LAY_OVER_LIMIT_PRESSURE.exit.targetProfitPct *
          speedFactor *
          minuteFactor *
          pressureFactor,
        LAY_OVER_LIMIT_PRESSURE.exit.minProfitPct,
        LAY_OVER_LIMIT_PRESSURE.exit.targetProfitPct,
      );

  const denominator = 1 - targetProfitPct * (layOdds - 1);
  if (denominator <= 0.05) return null;

  const rawTarget = layOdds / denominator;
  const targetBackOdds = nextTradableOdd(layOdds, rawTarget);
  if (targetBackOdds == null || !(targetBackOdds > 1)) return null;

  const targetTicks = ticksBetween(layOdds, targetBackOdds);
  const etaMinutes =
    ticksPerMin > 0 && Number.isFinite(targetTicks) ? targetTicks / ticksPerMin : null;

  const confidence =
    ticksPerMin >= LAY_OVER_LIMIT_PRESSURE.exit.referenceTicksPerMin &&
    minute != null &&
    minute >= 15 &&
    minute <= 55 &&
    pressure != null &&
    pressure <= LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBias
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

export function buildLayOverLimitPressureSnapshot(opts: {
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity?: number;
  marketId?: string;
  runnerId?: string;
  historyPoints?: OddsHistoryPoint[];
  line?: number;
  targetProfitPct?: number | null;
  minute?: number | null;
  totalGoals?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  favoritePressureBias?: number | null;
  shotsPerMinFavorite?: number | null;
  areaPressurePerMin?: number | null;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
}): LayOverLimitPressureSnapshot {
  const line = opts.line ?? LAY_OVER_LIMIT_PRESSURE.lines[0];
  const points = opts.historyPoints ?? [];
  const layLiquidity = Number(opts.layLiquidity ?? 0) || 0;

  const totalGoals =
    opts.totalGoals != null && Number.isFinite(opts.totalGoals)
      ? opts.totalGoals
      : opts.homeScore != null &&
          opts.awayScore != null &&
          Number.isFinite(opts.homeScore) &&
          Number.isFinite(opts.awayScore)
        ? Math.floor(opts.homeScore) + Math.floor(opts.awayScore)
        : null;

  const settled = totalGoals != null && totalGoals > line;
  const maxEntryGoals = LAY_OVER_LIMIT_PRESSURE.maxEntryGoalsByLine[line] ?? 99;
  const scoreGateOk =
    totalGoals == null || totalGoals <= maxEntryGoals;

  const fluidity = points.length
    ? analyzeFluidity(points, { ...LAY_OVER_LIMIT_PRESSURE.fluidity })
    : null;

  const correction =
    points.length >= 4
      ? analyzeCorrection({
          historyPoints: points,
          matchOdds: opts.matchOdds,
          shockOpts: { ...LAY_OVER_LIMIT_PRESSURE.correction },
        })
      : null;

  // Montar métricas de pressão
  const pressureMetrics: PressureMetrics | null =
    opts.favoritePressureBias != null
      ? {
          favoritePressureBias: opts.favoritePressureBias,
          shotsPerMinFavorite: opts.shotsPerMinFavorite ?? null,
          areaPressurePerMin: opts.areaPressurePerMin ?? null,
          momentRecommendation:
            opts.favoritePressureBias <= LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBias
              ? "entrada-rapida"
              : opts.favoritePressureBias <= LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBiasWarn
                ? "esperar"
                : "evitar",
          detail: `Pressão do favorito: ${opts.favoritePressureBias.toFixed(2)} · Recomendação: ${
            opts.favoritePressureBias <= LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBias
              ? "Entrada rápida favorável"
              : opts.favoritePressureBias <= LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBiasWarn
                ? "Esperar melhora de pressão"
                : "Pressão elevada — evitar agora"
          }`,
        }
      : null;

  const indicators: LayOverLimitPressureIndicator[] = [
    buildCorrectionIndicator(correction, fluidity?.tradable ?? false),
    buildTicksIndicator(points),
    buildLiquidityIndicator(layLiquidity),
    buildGapIndicator(opts.backOdds, opts.layOdds),
    buildOddsBandIndicator(opts.layOdds),
    buildFluidityIndicator(points),
    ...buildPressureIndicators(pressureMetrics),
  ];

  const goalsKnown = totalGoals != null;
  const earlyScore = !goalsKnown || totalGoals <= LAY_OVER_LIMIT_PRESSURE.earlyScoreMaxGoals;

  // Indicadores críticos por fase. A faixa de odd é sempre crítica: fora dela a
  // responsabilidade por stake dispara, o oposto do objetivo da estratégia.
  const criticalIds = earlyScore
    ? new Set(["correction", "ticks", "liquidity", "gap", "oddsBand"])
    : new Set([
        "correction",
        "ticks",
        "liquidity",
        "gap",
        "oddsBand",
        "fluidez",
      ]);

  const goodCount = settled ? 0 : indicators.filter((i) => i.good).length;
  const criticalOk = indicators
    .filter((i) => criticalIds.has(i.id))
    .every((i) => i.good);

  // Pressão deve estar OK para entrada
  const pressureOk =
    pressureMetrics == null ||
    pressureMetrics.momentRecommendation !== "evitar";

  const entryReady = !settled && criticalOk && pressureOk && scoreGateOk;

  const exitPlan = settled
    ? null
    : buildExitPlan({
        layOdds: opts.layOdds,
        historyPoints: points,
        minute: opts.minute,
        favoritePressureBias: opts.favoritePressureBias,
        targetProfitPct: opts.targetProfitPct,
      });

  const gateLabel = earlyScore
    ? `≤${LAY_OVER_LIMIT_PRESSURE.earlyScoreMaxGoals} gol · 4 filtros`
    : `${LAY_OVER_LIMIT_PRESSURE.earlyScoreMaxGoals + 1}+ gols · regra completa`;

  const scoreLabel =
    totalGoals == null
      ? `placar ? (máx ${maxEntryGoals} gols)`
      : totalGoals <= maxEntryGoals
        ? `${totalGoals}≤${maxEntryGoals} gols`
        : `${totalGoals} gols > máx ${maxEntryGoals}`;

  const summary = settled
    ? `Over ${line} já atingido (${totalGoals} gols) — mercado encerrado.`
    : !scoreGateOk
      ? `Lay Over ${line} · ${scoreLabel} — só entra com até ${maxEntryGoals} gol${maxEntryGoals === 1 ? "" : "s"}`
      : !pressureOk
        ? `Lay Over ${line} · Pressão elevada — ${pressureMetrics?.detail ?? "aguardando dados"}`
        : entryReady
          ? `Lay Over ${line} · ${scoreLabel} · ${gateLabel} · ${goodCount}/${indicators.length} ok · Pressão FAVORÁVEL`
          : `Lay Over ${line} · ${scoreLabel} · ${gateLabel} · ${goodCount}/${indicators.length} ok`;

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
    pressureMetrics,
    summary,
  };
}

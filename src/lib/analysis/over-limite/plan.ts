import type { OddsHistoryPoint } from "@/lib/betbra/odds-history";
import type { TeamFormReport } from "@/lib/fotmob/form";
import {
  analyzeCorrection,
  type CorrectionAnalysis,
} from "@/lib/analysis/correction";
import { analyzeFluidity } from "@/lib/analysis/fluidity";
import { OVER_LIMITE } from "./config";
import { gapTicks, ticksBetween } from "./ticks";
import {
  OVER_INDICATOR_META,
  type OverIndicator,
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
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
}): OverLimiteSnapshot {
  const points = opts.historyPoints ?? [];
  const layLiquidity = Number(opts.layLiquidity ?? 0) || 0;

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

  // Gate: correção + book justo. Viés Over pré-live e momento são reforço, não bloqueio.
  const criticalIds = new Set(["correction", "ticks", "liquidity", "gap", "oddsBand"]);
  const goodCount = indicators.filter((i) => i.good).length;
  const criticalOk = indicators
    .filter((i) => criticalIds.has(i.id))
    .every((i) => i.good);
  const momentum = indicators.find((i) => i.id === "momentum");
  // Pressão alta (bad) atrasa entrada; idle/good libera
  const momentumOk = !momentum || momentum.tone !== "bad";
  const entryReady = criticalOk && momentumOk;

  const summary = entryReady
    ? `Lay Over ${OVER_LIMITE.line} · correção/desajuste · ${goodCount}/${indicators.length} ok`
    : `Lay Over ${OVER_LIMITE.line} · ${goodCount}/${indicators.length} ok — caçar correção`;

  return {
    line: OVER_LIMITE.line,
    marketId: opts.marketId,
    runnerId: opts.runnerId,
    layOdds: opts.layOdds,
    backOdds: opts.backOdds,
    layLiquidity,
    gapTicks: gapTicks(opts.backOdds, opts.layOdds),
    indicators,
    goodCount,
    entryReady,
    summary,
  };
}

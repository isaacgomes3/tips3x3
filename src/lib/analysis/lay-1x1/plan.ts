import { LAY_1X1 } from "./config";
import {
  LAY_1X1_INDICATOR_META,
  type IndicatorTone,
  type Lay1x1Indicator,
  type Lay1x1IndicatorId,
  type Lay1x1Snapshot,
} from "./types";

function tone(good: boolean, warn: boolean): IndicatorTone {
  if (good) return "good";
  if (warn) return "warn";
  return "bad";
}

function meta(id: Lay1x1IndicatorId) {
  return LAY_1X1_INDICATOR_META[id];
}

/**
 * Determina o lado favorito com base nas odds de Match Odds.
 * Menor odd = favorito.
 */
function deriveFavoriteSide(matchOdds?: {
  home?: { back?: number | null };
  away?: { back?: number | null };
}): "home" | "away" | null {
  const h = matchOdds?.home?.back;
  const a = matchOdds?.away?.back;
  if (h == null || a == null) return null;
  return h <= a ? "home" : "away";
}

/** Placar: favorito deve estar ganhando por 1x0. */
function buildPlacarIndicator(opts: {
  homeScore: number | null;
  awayScore: number | null;
  favoriteSide: "home" | "away" | null;
}): Lay1x1Indicator {
  const m = meta("placar");
  const { homeScore, awayScore, favoriteSide } = opts;

  if (homeScore == null || awayScore == null || favoriteSide == null) {
    return {
      id: "placar",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Placar indisponível",
      value: null,
    };
  }

  const favScore = favoriteSide === "home" ? homeScore : awayScore;
  const dogScore = favoriteSide === "home" ? awayScore : homeScore;
  const is1x0 = favScore === 1 && dogScore === 0;

  return {
    id: "placar",
    label: m.label,
    icon: m.icon,
    tone: is1x0 ? "good" : "bad",
    good: is1x0,
    detail: is1x0
      ? `Favorito ${favoriteSide === "home" ? "casa" : "fora"} vence 1x0 — setup ideal`
      : `Placar ${homeScore}-${awayScore} — aguardando favorito abrir 1x0`,
    value: favScore - dogScore,
  };
}

/** Período: 2º tempo é preferencial; 1º tempo é aceito com indicadores fortes. */
function buildHalfIndicator(minute: number | null): Lay1x1Indicator {
  const m = meta("half");

  if (minute == null) {
    return {
      id: "half",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Minuto indisponível",
      value: null,
    };
  }

  const isSecondHalf = minute >= LAY_1X1.secondHalfMinute;
  const isLateSecondHalf = minute >= 70;

  if (isLateSecondHalf) {
    return {
      id: "half",
      label: m.label,
      icon: m.icon,
      tone: "warn",
      good: true,
      detail: `${minute}' — 2º tempo tardio · risco de desespero do adversário`,
      value: minute,
    };
  }

  if (isSecondHalf) {
    return {
      id: "half",
      label: m.label,
      icon: m.icon,
      tone: "good",
      good: true,
      detail: `${minute}' — 2º tempo · janela ideal para Lay 1x1`,
      value: minute,
    };
  }

  // 1º tempo: aceito mas com warn
  return {
    id: "half",
    label: m.label,
    icon: m.icon,
    tone: "warn",
    good: true, // permite entrada no 1º tempo se pressão for boa
    detail: `${minute}' — 1º tempo · exige pressão mais alta do favorito`,
    value: minute,
  };
}

/** Pressão do favorito: deve manter domínio sobre o adversário. */
function buildPressaoIndicator(opts: {
  favoritePressureBias: number | null;
  minute: number | null;
}): Lay1x1Indicator {
  const m = meta("pressao");
  const { favoritePressureBias, minute } = opts;
  const isFirstHalf = minute != null && minute < LAY_1X1.secondHalfMinute;
  const minBias = isFirstHalf
    ? LAY_1X1.firstHalfMinPressureBias
    : LAY_1X1.minFavoritePressureBias;

  if (favoritePressureBias == null) {
    return {
      id: "pressao",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Dados de pressão indisponíveis",
      value: null,
    };
  }

  const good = favoritePressureBias >= minBias;
  const warn = favoritePressureBias >= minBias * 0.5;

  return {
    id: "pressao",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Bias ${favoritePressureBias.toFixed(2)} — favorito dominando (mín. ${minBias.toFixed(2)})`
      : warn
        ? `Bias ${favoritePressureBias.toFixed(2)} — pressão fraca, aguardar`
        : `Bias ${favoritePressureBias.toFixed(2)} — pressão insuficiente (mín. ${minBias.toFixed(2)})`,
    value: favoritePressureBias,
  };
}

/**
 * Odd back do favorito no Match Odds: deve estar entre 1.05 e 1.15.
 * Confirma dominância extrema — adversário sem força real de empatar.
 */
function buildFavoriteBackIndicator(opts: {
  matchOdds?: { home?: { back?: number | null }; away?: { back?: number | null } };
  favoriteSide: "home" | "away" | null;
}): Lay1x1Indicator {
  const m = meta("favoriteBack");
  const band = LAY_1X1.favoriteBackOddsBand;

  if (!opts.favoriteSide || !opts.matchOdds) {
    return {
      id: "favoriteBack",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Odd back do favorito indisponível",
      value: null,
    };
  }

  const favBack =
    opts.favoriteSide === "home"
      ? opts.matchOdds.home?.back
      : opts.matchOdds.away?.back;

  if (favBack == null || !(favBack > 1)) {
    return {
      id: "favoriteBack",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Odd back do favorito indisponível",
      value: null,
    };
  }

  const inBand = favBack >= band.min && favBack <= band.max;
  const close = favBack > band.max && favBack <= band.max + 0.05;

  return {
    id: "favoriteBack",
    label: m.label,
    icon: m.icon,
    tone: tone(inBand, close),
    good: inBand,
    detail: inBand
      ? `Back fav. x${favBack.toFixed(2)} — faixa ${band.min}–${band.max} · domínio confirmado`
      : close
        ? `Back fav. x${favBack.toFixed(2)} — perto da faixa (mín. ${band.min} / máx. ${band.max})`
        : favBack < band.min
          ? `Back fav. x${favBack.toFixed(2)} — abaixo do mínimo ${band.min} (odd muito curta)`
          : `Back fav. x${favBack.toFixed(2)} — acima do máximo ${band.max} (favorito muito incerto)`,
    value: favBack,
  };
}

/** Faixa de odd lay: 1.50–3.00. */
function buildOddsBandIndicator(layOdds: number | null): Lay1x1Indicator {
  const m = meta("oddsBand");
  const band = LAY_1X1.oddsBand;

  if (layOdds == null || !(layOdds > 1)) {
    return {
      id: "oddsBand",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Odd lay indisponível",
      value: null,
    };
  }

  const preferred = layOdds >= band.preferredMin && layOdds <= band.preferredMax;
  const inBand = layOdds >= band.min && layOdds <= band.max;
  const exposure = layOdds - 1;

  return {
    id: "oddsBand",
    label: m.label,
    icon: m.icon,
    tone: tone(preferred, inBand),
    good: inBand,
    detail: preferred
      ? `x${layOdds.toFixed(2)} — faixa ótima · exp. ${exposure.toFixed(2)}× stake`
      : inBand
        ? `x${layOdds.toFixed(2)} — faixa aceitável · ótimo ${band.preferredMin}–${band.preferredMax}`
        : `x${layOdds.toFixed(2)} — fora da faixa ${band.min}–${band.max}`,
    value: layOdds,
  };
}

/** Liquidez mínima no Lay. */
function buildLiquidityIndicator(layLiquidity: number): Lay1x1Indicator {
  const m = meta("liquidity");
  const good = layLiquidity >= LAY_1X1.minLayLiquidity;
  const warn = layLiquidity >= LAY_1X1.minLayLiquidity * 0.5;

  return {
    id: "liquidity",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: `Lay disponível R$ ${layLiquidity.toFixed(0)} (mín. ${LAY_1X1.minLayLiquidity})`,
    value: layLiquidity,
  };
}

export function buildLay1x1Snapshot(opts: {
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity?: number;
  marketId?: string;
  runnerId?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: number | null;
  favoritePressureBias?: number | null;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
}): Lay1x1Snapshot {
  const layLiquidity = Number(opts.layLiquidity ?? 0) || 0;
  const homeScore = opts.homeScore ?? null;
  const awayScore = opts.awayScore ?? null;
  const minute = opts.minute ?? null;
  const favoritePressureBias = opts.favoritePressureBias ?? null;

  const favoriteSide = deriveFavoriteSide(opts.matchOdds);

  // Placar já tornou 1-1 impossível ou o jogo foi além
  const totalGoals =
    homeScore != null && awayScore != null ? homeScore + awayScore : null;
  const settled =
    totalGoals != null &&
    (totalGoals > 2 ||
      (homeScore != null && homeScore >= 2) ||
      (awayScore != null && awayScore >= 2) ||
      (homeScore === 1 && awayScore === 1));

  const indicators: Lay1x1Indicator[] = [
    buildPlacarIndicator({ homeScore, awayScore, favoriteSide }),
    buildHalfIndicator(minute),
    buildPressaoIndicator({ favoritePressureBias, minute }),
    buildFavoriteBackIndicator({ matchOdds: opts.matchOdds, favoriteSide }),
    buildOddsBandIndicator(opts.layOdds),
    buildLiquidityIndicator(layLiquidity),
  ];

  const goodCount = settled ? 0 : indicators.filter((i) => i.good).length;

  // Todos os 5 indicadores são críticos
  const allCriticalOk = indicators.every((i) => i.good);
  const entryReady = !settled && allCriticalOk;

  const scoreStr =
    homeScore != null && awayScore != null
      ? `${homeScore}-${awayScore}`
      : "?-?";
  const minuteStr = minute != null ? `${minute}'` : "?'";

  const summary = settled
    ? `Lay 1x1 encerrado · placar ${scoreStr} tornou 1-1 ${homeScore === 1 && awayScore === 1 ? "realidade (loss)" : "impossível (win)"}`
    : entryReady
      ? `✅ ENTRADA LAY 1x1 · ${minuteStr} · ${scoreStr} · odd x${opts.layOdds?.toFixed(2) ?? "?"} · ${goodCount}/6 ok`
      : `Lay 1x1 · ${minuteStr} · ${scoreStr} · ${goodCount}/6 ok · aguardando condições`;

  return {
    settled,
    marketId: opts.marketId,
    runnerId: opts.runnerId,
    layOdds: opts.layOdds,
    backOdds: opts.backOdds,
    layLiquidity,
    homeScore,
    awayScore,
    minute,
    favoriteSide,
    favoritePressureBias,
    indicators: settled ? [] : indicators,
    goodCount,
    entryReady,
    summary,
  };
}

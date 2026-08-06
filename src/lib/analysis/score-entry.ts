/**
 * Filtro de placar para indicação de entrada (lay 3-3).
 *
 * Exclusões duras (sempre):
 * - 2-2
 * - 3-2 / 2-3
 * - 3-3
 *
 * 2-1 / 1-2: só se for zebra (azarão à frente) e com placar live.
 * Sem placar → não libera (trade-plan).
 *
 * Favorito ≤1.80 é informativo para o gate clássico.
 * Super favorito (≤1.40) libera janela de odd Lay estendida (50–100).
 */

export const INITIAL_FAVORITE_MAX_ODDS = Number(
  process.env.INITIAL_FAVORITE_MAX_ODDS ?? 1.8,
);

/** Super favorito: libera odd Lay até a faixa 50–100. */
export const SUPER_FAVORITE_MAX_ODDS = Number(
  process.env.SUPER_FAVORITE_MAX_ODDS ?? 1.4,
);

export type FavoriteSide = "home" | "away";

export type InitialFavorite = {
  side: FavoriteSide | null;
  odd: number | null;
  qualifies: boolean;
  /** Favorito forte o bastante para janela Lay 50–100. */
  isSuper: boolean;
  detail: string;
};

export function resolveInitialFavorite(matchOdds?: {
  home?: { back?: number | null };
  away?: { back?: number | null };
}): InitialFavorite {
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
      side: null,
      odd: null,
      qualifies: false,
      isSuper: false,
      detail: "Sem match odds de favorito inicial.",
    };
  }

  const homeIsFav = h <= a;
  const favOdd = homeIsFav ? h : a;
  const side: FavoriteSide = homeIsFav ? "home" : "away";
  const isSuper = favOdd <= SUPER_FAVORITE_MAX_ODDS + 1e-9;

  if (favOdd > INITIAL_FAVORITE_MAX_ODDS) {
    return {
      side: null,
      odd: favOdd,
      qualifies: false,
      isSuper: false,
      detail: `Sem favorito ≤${INITIAL_FAVORITE_MAX_ODDS.toFixed(2)} (menor odd ${favOdd.toFixed(2)}).`,
    };
  }

  return {
    side,
    odd: favOdd,
    qualifies: true,
    isSuper,
    detail: isSuper
      ? `Super favorito ${side === "home" ? "casa" : "fora"} @ ${favOdd.toFixed(2)} (janela Lay até 100).`
      : `Favorito ${side === "home" ? "casa" : "fora"} @ ${favOdd.toFixed(2)} (informativo).`,
  };
}

export type ScoreEntryOpts = {
  /** Lado do favorito — necessário para liberar 2-1 / 1-2 como zebra. */
  favoriteSide?: FavoriteSide | null;
};

/** Exclusões duras de placar + 2-1/1-2 só em zebra. */
export function isEntryScoreAllowed(
  homeScore: number,
  awayScore: number,
  opts?: ScoreEntryOpts,
): { allowed: boolean; reason: string } {
  const hs = homeScore;
  const as = awayScore;
  const label = `${hs}-${as}`;

  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) {
    return { allowed: false, reason: "Placar inválido." };
  }

  if (label === "2-2") {
    return { allowed: false, reason: "Empate 2-2 não indica." };
  }
  if (label === "3-2" || label === "2-3") {
    return { allowed: false, reason: `Placar ${label} não indica.` };
  }
  if (label === "3-3") {
    return { allowed: false, reason: "3-3 encerra a tese." };
  }

  // 2-1 / 1-2: só zebra (azarão vencendo). Sem favorito → não libera.
  if (label === "2-1" || label === "1-2") {
    const fav = opts?.favoriteSide ?? null;
    if (!fav) {
      return {
        allowed: false,
        reason: `Placar ${label}: sem favorito para confirmar zebra.`,
      };
    }
    const zebraLeads =
      (label === "2-1" && fav === "away") ||
      (label === "1-2" && fav === "home");
    if (!zebraLeads) {
      return {
        allowed: false,
        reason: `Placar ${label}: favorito à frente — não é zebra.`,
      };
    }
    return {
      allowed: true,
      reason: `Placar ${label} zebra (azarão à frente).`,
    };
  }

  return { allowed: true, reason: `Placar ${label} elegível.` };
}

export function scoreFromInplay(inplay?: {
  score?: {
    home?: { score?: string };
    away?: { score?: string };
  };
}): { home: number; away: number } | null {
  if (!inplay?.score) return null;
  const home = Number(inplay.score.home?.score);
  const away = Number(inplay.score.away?.score);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

export type XgSides = {
  home?: number | null;
  away?: number | null;
};

export type XgBalanceGate = {
  home: number | null;
  away: number | null;
  diff: number | null;
  ratio: number | null;
  /** true = pode indicar (desequilíbrio ou sem xG). */
  allowed: boolean;
  balanced: boolean;
  detail: string;
};

/**
 * xG equilibrado → não indica Lay 3x3.
 * Sem xG nos dois lados → não bloqueia (fonte indisponível).
 */
export function evaluateXgBalanceGate(
  xg: XgSides | null | undefined,
  opts?: { minDiff?: number; minRatio?: number },
): XgBalanceGate {
  const minDiff = Number(opts?.minDiff ?? 0.4);
  const minRatio = Number(opts?.minRatio ?? 1.3);
  const home = Number(xg?.home);
  const away = Number(xg?.away);

  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    return {
      home: Number.isFinite(home) ? home : null,
      away: Number.isFinite(away) ? away : null,
      diff: null,
      ratio: null,
      allowed: true,
      balanced: false,
      detail: "Sem xG live — gate de equilíbrio não aplica.",
    };
  }

  const hi = Math.max(home, away);
  const lo = Math.min(home, away);
  const diff = Math.round(Math.abs(home - away) * 100) / 100;
  const ratio = lo > 0.05 ? Math.round((hi / lo) * 100) / 100 : hi > 0 ? 99 : 1;
  const imbalanced = diff + 1e-9 >= minDiff || ratio + 1e-9 >= minRatio;

  if (!imbalanced) {
    return {
      home,
      away,
      diff,
      ratio,
      allowed: false,
      balanced: true,
      detail: `xG equilibrado ${home.toFixed(2)}–${away.toFixed(2)} (Δ${diff.toFixed(2)} · razão ${ratio.toFixed(2)}) — sem indicação.`,
    };
  }

  return {
    home,
    away,
    diff,
    ratio,
    allowed: true,
    balanced: false,
    detail: `xG ${home.toFixed(2)}–${away.toFixed(2)} (Δ${diff.toFixed(2)}) — desequilíbrio ok.`,
  };
}

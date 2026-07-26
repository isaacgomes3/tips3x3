/**
 * Filtro de placar para indicação de entrada (lay 3-3).
 *
 * Exclusões duras (sempre):
 * - 2-2
 * - 3-2 / 2-3
 * - 3-3
 *
 * Demais placares podem indicar se as outras estatísticas confirmarem
 * (fluidez, correção, e — em lay alta — histórico de gols / casa-fora).
 *
 * A regra de favorito ≤1.80 é apenas informativa (não bloqueia mais a entrada).
 */

export const INITIAL_FAVORITE_MAX_ODDS = Number(
  process.env.INITIAL_FAVORITE_MAX_ODDS ?? 1.8,
);

export type FavoriteSide = "home" | "away";

export type InitialFavorite = {
  side: FavoriteSide | null;
  odd: number | null;
  qualifies: boolean;
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
      detail: "Sem match odds de favorito inicial.",
    };
  }

  const homeIsFav = h <= a;
  const favOdd = homeIsFav ? h : a;
  const side: FavoriteSide = homeIsFav ? "home" : "away";

  if (favOdd > INITIAL_FAVORITE_MAX_ODDS) {
    return {
      side: null,
      odd: favOdd,
      qualifies: false,
      detail: `Sem favorito ≤${INITIAL_FAVORITE_MAX_ODDS.toFixed(2)} (menor odd ${favOdd.toFixed(2)}).`,
    };
  }

  return {
    side,
    odd: favOdd,
    qualifies: true,
    detail: `Favorito ${side === "home" ? "casa" : "fora"} @ ${favOdd.toFixed(2)} (informativo).`,
  };
}

/** Exclusões duras de placar — independente de favorito. */
export function isEntryScoreAllowed(
  homeScore: number,
  awayScore: number,
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

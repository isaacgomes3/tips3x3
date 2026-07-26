/**
 * Filtro de placar para indicação de entrada (lay 3-3),
 * ancorado no favorito inicial (match odds ≤ 1.80).
 *
 * Permitidos:
 * - Empates 0-0 e 1-1
 * - Favorito perdendo por exatamente 1 gol em 0-1 / 1-0
 * - Placar 3-0 ou 0-3
 *
 * Bloqueados (entre outros):
 * - 2-2
 * - 3-2 / 2-3 (qualquer lado)
 * - Favorito ganhando 2-1 / 1-2
 * - Favorito perdendo em qualquer placar além de 0-1 / 1-0
 */

export const INITIAL_FAVORITE_MAX_ODDS = Number(
  process.env.INITIAL_FAVORITE_MAX_ODDS ?? 1.8,
);

export type FavoriteSide = "home" | "away";

export type InitialFavorite = {
  side: FavoriteSide | null;
  odd: number | null;
  /** true se existe favorito com odd ≤ INITIAL_FAVORITE_MAX_ODDS */
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
      detail: "Sem match odds para definir favorito inicial.",
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
      detail: `Favorito @ ${favOdd.toFixed(2)} acima de ${INITIAL_FAVORITE_MAX_ODDS.toFixed(2)} — sem indicação.`,
    };
  }

  return {
    side,
    odd: favOdd,
    qualifies: true,
    detail: `Favorito inicial ${side === "home" ? "casa" : "fora"} @ ${favOdd.toFixed(2)}.`,
  };
}

export function isEntryScoreAllowed(
  homeScore: number,
  awayScore: number,
  favoriteSide: FavoriteSide,
): { allowed: boolean; reason: string } {
  const hs = homeScore;
  const as = awayScore;
  const label = `${hs}-${as}`;

  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) {
    return { allowed: false, reason: "Placar inválido." };
  }

  // Nunca
  if (label === "2-2") {
    return { allowed: false, reason: "Empate 2-2 não indica." };
  }
  if (label === "3-2" || label === "2-3") {
    return { allowed: false, reason: `Placar ${label} não indica.` };
  }
  if (label === "3-3") {
    return { allowed: false, reason: "3-3 encerra a tese." };
  }

  // Empates liberados
  if (label === "0-0" || label === "1-1") {
    return { allowed: true, reason: `Empate ${label} ok.` };
  }

  // 3-0 / 0-3 liberados
  if (label === "3-0" || label === "0-3") {
    return { allowed: true, reason: `Placar ${label} ok.` };
  }

  // Favorito ganhando 2-1 / 1-2 — nunca
  if (favoriteSide === "home" && label === "2-1") {
    return { allowed: false, reason: "Favorito ganhando 2-1 não indica." };
  }
  if (favoriteSide === "away" && label === "1-2") {
    return { allowed: false, reason: "Favorito ganhando 1-2 não indica." };
  }
  // Também bloqueia 2-1/1-2 no sentido inverso (favorito perdendo nesses placares)
  if (label === "2-1" || label === "1-2") {
    return {
      allowed: false,
      reason: `Placar ${label} não indica (só 0-1/1-0 quando favorito perde).`,
    };
  }

  // Favorito perdendo por exatamente 1 gol — somente 0-1 ou 1-0
  if (favoriteSide === "home" && label === "0-1") {
    return { allowed: true, reason: "Favorito casa perdendo 0-1." };
  }
  if (favoriteSide === "away" && label === "1-0") {
    return { allowed: true, reason: "Favorito fora perdendo 1-0." };
  }

  const favGoals = favoriteSide === "home" ? hs : as;
  const dogGoals = favoriteSide === "home" ? as : hs;
  if (dogGoals > favGoals) {
    return {
      allowed: false,
      reason: `Favorito perdendo ${label} — só libera 0-1/1-0.`,
    };
  }

  return {
    allowed: false,
    reason: `Placar ${label} fora da lista de indicação.`,
  };
}

/** Extrai placar do feed in-play (se existir). */
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

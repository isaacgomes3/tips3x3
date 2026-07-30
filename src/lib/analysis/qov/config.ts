/** Config QOV Correct Score — live only, trade saída ~1%. */
export const QOV = {
  liveOnly: true,
  minute: { min: 15, max: 70 },
  /** Favorito máximo para assimetria (lay zebra / contexto). */
  favoriteMaxOdds: 1.55,
  favoriteStrongMaxOdds: 1.4,
  exit: {
    targetProfitPct: 0.01,
    minProfitPct: 0.005,
  },
  /** Lay ANY OTHER no lado da zebra. */
  layUnderdog: {
    oddsBand: {
      min: 18,
      max: 45,
      preferredMin: 22,
      preferredMax: 35,
    },
    minLiquidity: 30,
    maxGapTicks: 3,
    /**
     * Momento: favorito precisa estar pressionando (protege lay na zebra).
     * Bias FotMob 0–1; mínimo para liberar entrada.
     */
    minFavoritePressure: 0.12,
    /** Zebra com 2+ gols → não entrar. */
    maxUnderdogGoals: 1,
    maxProjectedTotal: 2.8,
    maxUnderdogLambda: 1.3,
    /** Over 2.5 não pode estar “barato demais”. */
    over25BackMin: 1.75,
  },
  /** Back ANY OTHER no lado do favorito. */
  backFavorite: {
    oddsBand: {
      min: 8,
      max: 25,
      preferredMin: 10,
      preferredMax: 20,
    },
    minLiquidity: 20,
    maxGapTicks: 3,
    /** Momento: pressão do favorito alta para caminho 4+. */
    minFavoritePressure: 0.18,
    favoriteMaxOdds: 1.35,
    minFavoriteLambda: 2.3,
    minProjectedTotal: 3.2,
    over25BackMax: 1.65,
    /** Preferir caminho com ≥3 gols do favorito. */
    minFavoriteGoalsSoft: 2,
    minFavoriteGoalsStrong: 3,
    maxUnderdogGoals: 1,
  },
} as const;

export type QovConfig = typeof QOV;

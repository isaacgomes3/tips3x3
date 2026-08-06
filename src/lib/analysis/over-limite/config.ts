/** Config Lay over limite: lay CONTRA o Over (caça correção / desajuste). */
export const OVER_LIMITE = {
  /** Linha padrão nesta base */
  line: 2.5 as const,
  /**
   * Gate de indicadores por placar:
   * - totalGoals ≤ 1: correction + ticks + liquidity + gap
   * - totalGoals = 2: regra completa (+ oddsBand + momento sem pressão bad)
   */
  earlyScoreMaxGoals: 1,
  /**
   * Teto de gols no placar para ARMAR entrada (por linha):
   * - Over 3.5 → até 1 gol
   * - Over 4.5 → até 2 gols
   */
  maxEntryGoalsByLine: {
    3.5: 1,
    4.5: 2,
  } as Record<number, number>,
  /** Gap máximo back→lay (ticks) para mercado “justo” */
  maxGapTicks: 2,
  /** Liquidez mínima no lay (BRL) */
  minLayLiquidity: 15,
  /** Ticks/min a favor (odd lay subindo = correção) */
  minFavorTicksPerMin: 1.2,
  /** Faixa de odd lay Over — exposição × retorno */
  oddsBand: {
    min: 1.45,
    max: 2.4,
    preferredMin: 1.55,
    preferredMax: 2.05,
  },
  /** Correção mais rápida que o 3x3 (mercado dinâmico) */
  correction: {
    minDropPct: 0.08,
    maxDropMinutes: 25,
    lookbackSlope: 3,
  },
  /** Fluidez em janela curta */
  fluidity: {
    lookback: 8,
    minSwingPct: 0.04,
    minMatchedTotal: 20,
    minTicks: 3,
  },
  /**
   * Desajuste pré-live: Over “barato” (back ≤) = mercado já precifica gols.
   * Isso NÃO bloqueia — é setup para caçar correção após choque.
   */
  overBiasBackMax: 1.9,
  /** Projeção mínima de gols que reforça viés Over pré-live */
  minProjectedGoalsForBias: 2.2,
  /** Pressão do favorito alta = risco iminente no timing do lay */
  maxFavoritePressureBias: 0.22,
  /** Saída Back projetada a partir da odd Lay de entrada. */
  exit: {
    targetProfitPct: 0.008,
    minProfitPct: 0.003,
    referenceTicksPerMin: 1.2,
  },
} as const;

export type OverLimiteConfig = typeof OVER_LIMITE;

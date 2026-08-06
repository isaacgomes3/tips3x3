/**
 * Config Lay 1x1:
 * - Pré-análise: favorito abre 1x0 e mantém pressão + posse
 * - 1º tempo: verifica indicadores a favor do favorito
 * - 2º tempo: a qualquer momento com odd favorável → entra Lay 1-1
 * - Somente Lay (sem Back)
 * - Faixa de odd lay: 1.50–3.00 ("15–30")
 */

export const LAY_1X1 = {
  /** Faixa de odd lay para entrada */
  oddsBand: {
    min: 1.50,
    max: 3.00,
    preferredMin: 1.60,
    preferredMax: 2.50,
  },

  /**
   * Pressão mínima do favorito (bias ≥ 0): favorito precisa dominar o adversário.
   * Quanto maior, mais exigente. Bias ≈ diferença de pressão (0–1).
   */
  minFavoritePressureBias: 0.05,

  /**
   * No 1º tempo (< 46') exige bias maior para validar domínio precoce.
   */
  firstHalfMinPressureBias: 0.18,

  /** A partir de qual minuto considera-se 2º tempo */
  secondHalfMinute: 46,

  /**
   * Odd back do favorito no Match Odds no momento da entrada.
   * Confirma domínio extremo: favorito muito curto = adversário sem
   * capacidade real de empatar.
   */
  favoriteBackOddsBand: {
    min: 1.05,
    max: 1.15,
  },

  /** Liquidez mínima no Lay do mercado Placar Exato 1-1 */
  minLayLiquidity: 8,

  /** % da banca por aposta (default 5%) — editável no painel */
  defaultStakePct: 0.05,

  /** Lucro alvo por operação (default 1%) — editável no painel */
  defaultTargetProfitPct: 0.01,
} as const;

export type Lay1x1Config = typeof LAY_1X1;

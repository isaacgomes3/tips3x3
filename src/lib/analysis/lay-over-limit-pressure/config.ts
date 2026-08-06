/**
 * Config Lay Over Limite com Pressão:
 * - Varre jogos com mercado no gol limite (Over 2.5, 3.5, 4.5…)
 * - Cruza estatísticas: ticks/min, fluidez, correção, faixa de odd favorável
 * - Valida pressão em tempo real (chute a gol, pressão na área)
 * - Dinâmico: lucro alvo editável (default 1%) e % banca editável (default 5%)
 */

export const LAY_OVER_LIMIT_PRESSURE = {
  /** Linhas de Over padrão para varredura */
  lines: [0.5, 1.5, 2.5, 3.5, 4.5] as const,
  
  /** Objetivo de lucro default (1%) — editável no painel */
  defaultTargetProfitPct: 0.01,
  
  /** % da banca por aposta (5%) — editável no painel */
  defaultStakePct: 0.05,
  
  /**
   * Ticks/min a favor da estratégia (odd lay subindo = correção).
   * Mínimo esperado para considerar entrada.
   */
  minFavorTicksPerMin: 1.0,
  
  /** Liquidez mínima no lay (BRL) */
  minLayLiquidity: 15,
  
  /** Gap máximo back→lay (ticks) para mercado "justo" */
  maxGapTicks: 2,
  
  /** Faixa de odd lay — exposição × retorno */
  oddsBand: {
    min: 1.45,
    max: 2.4,
    preferredMin: 1.55,
    preferredMax: 2.05,
  },
  
  /** Correção — choque seguido de recuperação */
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
   * Pressão do favorito — análise de chutes e área.
   * Altos valores = risco iminente (evitar lay agora).
   * Baixos valores = setup favorável (entrada rápida segura).
   */
  pressure: {
    /** Limiar máximo de pressão para entrada confortável */
    maxFavoritePressureBias: 0.22,
    /** Limiar de alerta (warn) — ainda permite entrada mas com risco elevado */
    maxFavoritePressureBiasWarn: 0.35,
    /** Chutes a gol por minuto decorrido do favorito — acima desestimula entrada */
    maxShotsPerMinFavorite: 0.12,
    /** Toques na área por minuto decorrido do favorito — acima indica ataque ativo */
    maxAreaPressurePerMin: 0.55,
  },
  
  /**
   * Gate por placar:
   * - totalGoals ≤ 1: correção + ticks + liquidez + gap (4 filtros)
   * - totalGoals = 2: regra completa (+ oddsBand + pressão)
   */
  earlyScoreMaxGoals: 1,
  
  /** Teto de gols no placar para ARMAR entrada (por linha) */
  maxEntryGoalsByLine: {
    0.5: 0, // Over 0.5 = só 0-0 (com 1 gol o mercado já resolveu)
    1.5: 0,  // Over 1.5 = até 0 gol (0-0 entra, 1-0 não)
    2.5: 1,  // Over 2.5 = até 1 gol
    3.5: 2,  // Over 3.5 = até 2 gols
    4.5: 3,  // Over 4.5 = até 3 gols
  } as Record<number, number>,
  
  /** Exit: tempo mínimo para deixar a posição "respirar" (em minutos) */
  exit: {
    targetProfitPct: 0.01,
    minProfitPct: 0.003,
    referenceTicksPerMin: 1.2,
    /** Não fechar antes deste tempo */
    minHoldMinutes: 2,
  },
} as const;

export type LayOverLimitPressureConfig = typeof LAY_OVER_LIMIT_PRESSURE;

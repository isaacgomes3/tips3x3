export const BETBRA = {
  origin: "https://betbra.bet.br",
  /** Origin/Referer das chamadas à API do exchange. */
  mexchangeWeb: "https://mexchange.betbra.bet.br",
  /** Link “Abrir” no front — Bolsa de Aposta (mesmo event/market id). */
  openExchangeWeb: "https://bolsadeaposta.bet.br/b",
  clientApi: "https://betbra.bet.br/client/api",
  mexchangeApi: "https://mexchange-api.betbra.bet.br/api",
  sportIds: {
    soccer: 15,
  },
  /** Token público embutido no front do Mexchange (somente leitura; pode expirar). */
  guestSessionToken: "577717_e8a11c8e70edcbd95c5e9db17d0f6f4",
} as const;

export function getSessionToken(): string {
  return (
    process.env.BETBRA_SESSION_TOKEN?.trim() ||
    BETBRA.guestSessionToken
  );
}

/** Janela dura de entrada lay 3-3 (padrão 20–50). */
export function getLayOddsWindow() {
  return {
    min: Number(process.env.LAY_3X3_MIN_ODDS ?? 20),
    max: Number(process.env.LAY_3X3_MAX_ODDS ?? 50),
    /** Faixa preferida: correção ~1% mais rápida e menos liability. */
    preferredMax: Number(process.env.LAY_3X3_PREFERRED_MAX ?? 32),
    minLiquidity: Number(process.env.LAY_3X3_MIN_LIQUIDITY ?? 5),
  };
}

export function getPreliveMinScore() {
  return Number(process.env.PRELIVE_MIN_SCORE ?? 55);
}

/**
 * Trade lay → saída back com ~1% da liability.
 * Prefere lays baixos (ex. 22–32): gap lay→back menor e risco menor.
 * Lay alto (perto de 50) exige odd quase dobrar e liability bem maior.
 */
export function getTradeConfig() {
  return {
    targetProfitPct: Number(process.env.TARGET_PROFIT_PCT ?? 0.01),
    referenceStake: Number(process.env.REFERENCE_LAY_STAKE ?? 10),
    minOscillationPct: Number(process.env.MIN_OSCILLATION_PCT ?? 0.15),
    oscillationLookback: Number(process.env.OSCILLATION_LOOKBACK ?? 8),
    /** Pico de lay “sem padrão back 3-3” (ex.: 170). */
    highLayPeakMin: Number(process.env.HIGH_LAY_PEAK_MIN ?? 55),
    /** Queda mínima pico→fundo para crash relevante. */
    underdogCrashMinDropPct: Number(process.env.UNDERDOG_CRASH_MIN_DROP ?? 0.35),
    /** Gol da zebra alinhado ao choque (± minutos). */
    goalShockMaxMinutes: Number(process.env.GOAL_SHOCK_MAX_MINUTES ?? 12),
    /** Entrada rápida só no início da correção (recuperação ainda baixa). */
    crashMaxRecoveryPct: Number(process.env.CRASH_MAX_RECOVERY_PCT ?? 0.45),
  };
}

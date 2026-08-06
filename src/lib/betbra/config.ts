export const BETBRA = {
  origin: "https://betbra.bet.br",
  /** Origin/Referer das chamadas à API do exchange. */
  mexchangeWeb: "https://mexchange.betbra.bet.br",
  /** Link “Abrir” no front — BetBra Mexchange (mesmo event/market id). */
  openExchangeWeb: "https://betbra.bet.br/b",
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

/**
 * Janela dura de entrada lay 3-3 (padrão 20–50).
 * superMax fica só como referência informativa — NÃO libera ENTRAR/Auto Lay.
 */
export function getLayOddsWindow() {
  return {
    min: Number(process.env.LAY_3X3_MIN_ODDS ?? 20),
    max: Number(process.env.LAY_3X3_MAX_ODDS ?? 50),
    /** Faixa preferida: correção ~1% mais rápida e menos liability (só informa). */
    preferredMax: Number(process.env.LAY_3X3_PREFERRED_MAX ?? 32),
    /** Histórico/informativo; entrada nunca usa este teto. */
    superMax: Number(process.env.LAY_3X3_SUPER_MAX_ODDS ?? 100),
    minLiquidity: Number(process.env.LAY_3X3_MIN_LIQUIDITY ?? 5),
  };
}

export function getPreliveMinScore() {
  return Number(process.env.PRELIVE_MIN_SCORE ?? 55);
}

/**
 * Gate xG Lay 3x3: times equilibrados no xG não indicam.
 * Ex.: 1.91–2.12 (Δ0.21) bloqueia; precisa Δ ≥ minDiff (default 0.40)
 * ou razão max/min ≥ minRatio (default 1.30).
 */
export function getLayXgGateConfig() {
  return {
    /** Diferença absoluta mínima |xG casa − xG fora|. */
    minDiff: Number(process.env.LAY_3X3_XG_MIN_DIFF ?? 0.4),
    /** Razão max/min mínima (alternativa se o Δ absoluto for apertado). */
    minRatio: Number(process.env.LAY_3X3_XG_MIN_RATIO ?? 1.3),
  };
}

/**
 * Trade lay → saída back com ~0,5% da liability (padrão).
 * Prefere lays baixos (ex. 22–32): gap lay→back menor e risco menor.
 * Lay alto (perto de 50) exige odd quase dobrar e liability bem maior.
 */
export function getTradeConfig(overrides?: { targetProfitPct?: number }) {
  const fromEnv = Number(process.env.TARGET_PROFIT_PCT ?? 0.005);
  const override = overrides?.targetProfitPct;
  const targetProfitPct =
    override != null && Number.isFinite(override) && override > 0
      ? override
      : fromEnv;
  return {
    targetProfitPct,
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

/** Query `profitPct=0.1` = 0,1% → decimal 0.001. */
export function parseProfitPctQuery(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0.1 || n > 100) return undefined;
  return n / 100;
}

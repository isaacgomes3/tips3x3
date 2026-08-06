export type IndicatorTone = "good" | "warn" | "bad" | "idle";

export type OverIndicatorId =
  | "correction"
  | "ticks"
  | "momentum"
  | "misprice"
  | "liquidity"
  | "gap"
  | "oddsBand";

export interface OverIndicator {
  id: OverIndicatorId;
  /** Rótulo curto no tooltip */
  label: string;
  /** Ícone unicode estável (sem emoji colorido) */
  icon: string;
  tone: IndicatorTone;
  /** true = índice bom o suficiente para destacar */
  good: boolean;
  detail: string;
  value?: number | null;
}

export interface OverExitPlan {
  /** Odd Lay usada como referência: "se entrar agora". */
  entryLayOdds: number;
  targetBackOdds: number;
  targetProfitPct: number;
  ticksPerMin: number;
  targetTicks: number;
  etaMinutes: number | null;
  minute: number | null;
  favoritePressureBias: number | null;
  confidence: "high" | "medium" | "low";
  summary: string;
}

export interface OverLimiteSnapshot {
  line: number;
  /** O mercado já foi resolvido pelo placar live e não pode indicar entrada. */
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity: number;
  gapTicks: number | null;
  indicators: OverIndicator[];
  /** Quantos indicadores estão “good” */
  goodCount: number;
  /** Pronto para considerar entrada (gate de correção/desajuste) */
  entryReady: boolean;
  /** Plano estimado de saída Back, recalculado para a odd Lay atual. */
  exitPlan: OverExitPlan | null;
  summary: string;
}

export const OVER_INDICATOR_META: Record<
  OverIndicatorId,
  { label: string; icon: string }
> = {
  correction: { label: "Corrigindo", icon: "↻" },
  ticks: { label: "Ticks/min", icon: "⌁" },
  momentum: { label: "Momento", icon: "◎" },
  misprice: { label: "Desajuste", icon: "⬡" },
  liquidity: { label: "Liquidez", icon: "≡" },
  gap: { label: "Gap", icon: "⇄" },
  oddsBand: { label: "Faixa", icon: "▣" },
};

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

export interface OverLimiteSnapshot {
  line: number;
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

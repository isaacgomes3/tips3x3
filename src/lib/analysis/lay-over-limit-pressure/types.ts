export type IndicatorTone = "good" | "warn" | "bad" | "idle";

export type LayOverLimitPressureIndicatorId =
  | "correction"
  | "ticks"
  | "liquidity"
  | "gap"
  | "oddsBand"
  | "fluidez"
  | "pressao-chutes"
  | "pressao-area";

export interface LayOverLimitPressureIndicator {
  id: LayOverLimitPressureIndicatorId;
  label: string;
  icon: string;
  tone: IndicatorTone;
  good: boolean;
  detail: string;
  value?: number | null;
}

export interface PressureMetrics {
  /** Bias de pressão do favorito (0–1, onde 1 = máxima pressão) */
  favoritePressureBias: number | null;
  /** Chutes por minuto do favorito */
  shotsPerMinFavorite: number | null;
  /** Passes na área por minuto do favorito */
  areaPressurePerMin: number | null;
  /** Recomendação: "entrada-rapida" | "esperar" | "evitar" */
  momentRecommendation: "entrada-rapida" | "esperar" | "evitar";
  detail: string;
}

export interface LayOverLimitPressureExitPlan {
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

export interface LayOverLimitPressureSnapshot {
  line: number;
  /** O mercado já foi resolvido pelo placar live */
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity: number;
  gapTicks: number | null;
  
  /** Indicadores cruzados */
  indicators: LayOverLimitPressureIndicator[];
  goodCount: number;
  
  /** Pronto para considerar entrada (todos os críticos OK + pressão favorável) */
  entryReady: boolean;
  
  /** Plano de saída Back, recalculado para a odd Lay atual */
  exitPlan: LayOverLimitPressureExitPlan | null;
  
  /** Métricas de pressão em tempo real */
  pressureMetrics: PressureMetrics | null;
  
  summary: string;
}

export const LAY_OVER_LIMIT_PRESSURE_INDICATOR_META: Record<
  LayOverLimitPressureIndicatorId,
  { label: string; icon: string }
> = {
  correction: { label: "Corrigindo", icon: "↻" },
  ticks: { label: "Ticks/min", icon: "⌁" },
  liquidity: { label: "Liquidez", icon: "≡" },
  gap: { label: "Gap", icon: "⇄" },
  oddsBand: { label: "Faixa odd", icon: "▣" },
  fluidez: { label: "Fluidez", icon: "≋" },
  "pressao-chutes": { label: "Chutes", icon: "→" },
  "pressao-area": { label: "Área", icon: "◎" },
};

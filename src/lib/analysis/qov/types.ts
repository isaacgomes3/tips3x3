export type MatchSide = "home" | "away";
export type QovMode = "lay-underdog" | "back-favorite";
export type QovSelection = "any-other-home" | "any-other-away";
export type QovActionSide = "lay" | "back";
export type IndicatorTone = "good" | "warn" | "bad" | "idle";

export type QovIndicatorId = "liquidity" | "momentum";

export interface QovIndicator {
  id: QovIndicatorId;
  label: string;
  icon: string;
  tone: IndicatorTone;
  good: boolean;
  detail: string;
  value?: number | null;
}

export interface QovExitPlan {
  entryOdds: number;
  exitOdds: number;
  targetProfitPct: number;
  /** Ação de entrada na exchange. */
  entrySide: QovActionSide;
  /** Ação de saída (oposta). */
  exitSide: QovActionSide;
  summary: string;
}

export interface QovSnapshot {
  mode: QovMode;
  selection: QovSelection | null;
  favoriteSide: MatchSide | null;
  underdogSide: MatchSide | null;
  /** Ação de entrada. */
  side: QovActionSide;
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  /** Odd da ação (lay no modo lay; back no modo back). */
  entryOdds: number | null;
  liquidity: number;
  gapTicks: number | null;
  favoritePressureBias: number | null;
  indicators: QovIndicator[];
  goodCount: number;
  entryReady: boolean;
  exitPlan: QovExitPlan | null;
  summary: string;
  blockers: string[];
}

export const QOV_INDICATOR_META: Record<
  QovIndicatorId,
  { label: string; icon: string }
> = {
  liquidity: { label: "Liquidez", icon: "≡" },
  momentum: { label: "Momento", icon: "◎" },
};

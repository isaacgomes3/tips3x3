export type IndicatorTone = "good" | "warn" | "bad" | "idle";

export type Lay1x1IndicatorId =
  | "placar"
  | "half"
  | "pressao"
  | "favoriteBack"
  | "oddsBand"
  | "liquidity";

export interface Lay1x1Indicator {
  id: Lay1x1IndicatorId;
  label: string;
  icon: string;
  tone: IndicatorTone;
  good: boolean;
  detail: string;
  value?: number | null;
}

export interface Lay1x1Snapshot {
  /** Mercado já resolvido (placar impossibilitou 1-1 ou o jogo encerrou) */
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity: number;

  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;

  /** Lado favorito identificado por match odds */
  favoriteSide: "home" | "away" | null;
  favoritePressureBias: number | null;

  indicators: Lay1x1Indicator[];
  goodCount: number;

  /** Todos os críticos OK → entrada liberada */
  entryReady: boolean;

  summary: string;
}

export const LAY_1X1_INDICATOR_META: Record<
  Lay1x1IndicatorId,
  { label: string; icon: string }
> = {
  placar: { label: "Placar 1x0", icon: "⚽" },
  half: { label: "Período", icon: "⏱" },
  pressao: { label: "Pressão fav.", icon: "🔥" },
  favoriteBack: { label: "Back fav.", icon: "★" },
  oddsBand: { label: "Faixa odd", icon: "▣" },
  liquidity: { label: "Liquidez", icon: "≡" },
};

export type IndicatorTone = "good" | "warn" | "bad" | "idle";

export type EventosRarosIndicatorId =
  | "liquidity"
  | "late-window"
  | "time-impossibility"
  | "model-edge";

export interface EventosRarosIndicator {
  id: EventosRarosIndicatorId;
  label: string;
  icon: string;
  tone: IndicatorTone;
  good: boolean;
  detail: string;
  value?: number | null;
}

/** Candidato CS com lay alto + análise A/B + modelo. */
export interface EventosRarosCandidate {
  label: string;
  home: number;
  away: number;
  marketId?: string;
  runnerId?: string;
  layOdds: number;
  backOdds: number | null;
  liquidity: number;
  gapTicks: number | null;
  /** Ainda matematicamente possível dado o placar live. */
  stillPossible: boolean;
  /**
   * Placar alvo já impossível (ex.: live 4-2 e alvo 3-2).
   * Lay é green certo se o mercado ainda aceitar — entrada imediata.
   */
  alreadyImpossible: boolean;
  /** Placar live já bateu o alvo (lay perde). */
  settledHit: boolean;
  goalsNeeded: number;
  remainingMinutes: number;
  goalsPerRemainingMin: number | null;
  /** Gate B: tempo torna o placar quase inviável. */
  timeBlocked: boolean;
  impliedProb: number;
  modelProb: number | null;
  /** Modelo ≪ implícita → edge a favor do lay. */
  modelEdge: number | null;
  rarityScore: number;
  /** Este placar liberou entrada (pode haver vários no mesmo evento). */
  entryReady: boolean;
}

export interface EventosRarosSnapshot {
  settled: boolean;
  marketId?: string;
  runnerId?: string;
  /** Melhor candidato (maior rarityScore elegível). */
  best: EventosRarosCandidate | null;
  /**
   * Placares com entrada liberada no mesmo evento.
   * Correct Score usa o mesmo saldo/mercado — multi-lay é intencional.
   */
  entries: EventosRarosCandidate[];
  candidates: EventosRarosCandidate[];
  layOdds: number | null;
  backOdds: number | null;
  scoreLabel: string | null;
  /** Labels dos placares prontos (ex. "4-0, 0-4, 5-1"). */
  scoreLabels: string[];
  liquidity: number;
  gapTicks: number | null;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  /** Vermelhos no jogo — bloqueiam o padrão, não o LUCRO CERTO. */
  redCards: number;
  indicators: EventosRarosIndicator[];
  goodCount: number;
  /** True se pelo menos um placar está entryReady. */
  entryReady: boolean;
  /** Sempre null — estratégia hold até settle. */
  exitPlan: null;
  summary: string;
  blockers: string[];
}

export const EVENTOS_RAROS_INDICATOR_META: Record<
  EventosRarosIndicatorId,
  { label: string; icon: string }
> = {
  liquidity: { label: "Liquidez", icon: "≡" },
  "late-window": { label: "Janela late", icon: "◷" },
  "time-impossibility": { label: "Tempo", icon: "⊘" },
  "model-edge": { label: "Edge modelo", icon: "◈" },
};

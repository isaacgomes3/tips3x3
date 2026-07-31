export type IndicationKind = "eventos-raros" | "lucro-certo";
export type IndicationResult = "pending" | "green" | "red";

export type Indication = {
  id: string;
  kind: IndicationKind;
  eventId: string;
  eventName: string;
  home: string;
  away: string;
  /** Placar alvo do Correct Score (ex. "4-0"). */
  scoreLabel: string;
  layOdds: number;
  indicatedAt: string;
  minute: number | null;
  liveScoreAtIndication: string | null;
  /** Último placar visto no feed (atualizado a cada poll). */
  lastLiveScore: string | null;
  /** ISO da última vez que o evento apareceu no /api/live. */
  lastSeenAt: string | null;
  result: IndicationResult;
  finalScore: string | null;
  settledAt: string | null;
};

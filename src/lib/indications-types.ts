export type IndicationKind = "eventos-raros" | "lucro-certo" | "lay-3x3";
export type IndicationResult = "pending" | "green" | "red";
export type IndicationSource = "apk" | "painel" | "extensao" | "sistema";

/**
 * Como a ordem terminou no executor.
 * "failed" = tentativa registrada que não virou posição — fica fora das
 * métricas de performance, mas o master enxerga o motivo.
 */
export type IndicationExecStatus = "placed" | "failed";

export type IndicationEventType =
  | "lay-sent"
  | "lay-matched"
  | "back-sent"
  | "green"
  | "cancelled"
  | "failed";

/** Passo do ciclo de vida da ordem, reportado pelo executor. */
export type IndicationEvent = {
  at: string;
  type: IndicationEventType;
  odds?: number | null;
  stake?: number | null;
  profit?: number | null;
  message?: string | null;
};

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
  /** Quem executou a ordem. Ausente = indicação gerada pelo sistema. */
  userEmail?: string | null;
  /** De onde veio a ordem: app Android, painel web ou varredura do sistema. */
  source?: IndicationSource | null;
  /** Stake enviada na ordem (BRL), quando informada pelo executor. */
  stake?: number | null;
  /** Responsabilidade do lay: stake × (odds − 1). */
  liability?: number | null;
  /** Lucro esperado no green (Lay+Back usa alvo %, hold usa a stake). */
  expectedProfit?: number | null;
  /** Ausente = ordem confirmada (comportamento histórico). */
  execStatus?: IndicationExecStatus | null;
  /** Motivo da última falha reportada pelo executor. */
  lastError?: string | null;
  /** Lucro efetivamente realizado quando o executor fecha o green. */
  realizedProfit?: number | null;
  /** Ciclo de vida da ordem (Lay enviado, casado, Back, green, falha). */
  events?: IndicationEvent[];
  /** Lay confirmado na Bolsa (remaining ≈ 0). Ausente = legado / desconhecido. */
  layMatched?: boolean | null;
};

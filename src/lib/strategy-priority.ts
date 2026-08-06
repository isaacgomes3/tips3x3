/**
 * Ordem única de precedência entre estratégias.
 *
 * Antes cada camada tinha a sua ordem acidental: a lista de alertas da API saía
 * invertida (efeito do `unshift`), o corte de 5 toasts descartava o Lay 3x3
 * primeiro e a fila da extensão jogava fora o sinal mais antigo. Todas passam
 * a usar este ranking.
 *
 * Critério: Lucro certo primeiro (green matemático, placar já impossível),
 * depois Lay 3x3 (núcleo do produto), Eventos raros, os dois Over e por fim
 * QOV, que é indicação manual.
 *
 * Não vale para a ordem de execução do Auto Lay no APK: lá o Lay 3x3 é
 * avaliado antes por causa do `greenBusy`, e o Lucro certo usa carteira
 * reservada, então as duas não competem pelo mesmo saldo.
 */

export type SignalStrategy =
  | "lucro-certo"
  | "lay-3x3"
  | "lay-1x1"
  | "eventos-raros"
  | "over-3.5"
  | "over-4.5"
  | "lay-over-limit-pressure"
  | "qov-lay-zebra";

export const SIGNAL_PRIORITY: SignalStrategy[] = [
  "lucro-certo",
  "lay-3x3",
  "lay-1x1",
  "eventos-raros",
  "over-3.5",
  "over-4.5",
  "lay-over-limit-pressure",
  "qov-lay-zebra",
];

const RANK = new Map<string, number>(
  SIGNAL_PRIORITY.map((id, index) => [id, index]),
);

/** Estratégia desconhecida fica atrás de todas, sem quebrar a ordenação. */
export const UNKNOWN_SIGNAL_RANK = SIGNAL_PRIORITY.length;

export function signalRank(id?: string | null): number {
  if (!id) return UNKNOWN_SIGNAL_RANK;
  // "qov" é o rótulo curto que os toasts usam.
  if (id === "qov") return RANK.get("qov-lay-zebra") ?? UNKNOWN_SIGNAL_RANK;
  return RANK.get(id) ?? UNKNOWN_SIGNAL_RANK;
}

/** Ordena do sinal mais importante para o menos importante. */
export function bySignalPriority(
  a: { strategy?: string | null },
  b: { strategy?: string | null },
): number {
  return signalRank(a.strategy) - signalRank(b.strategy);
}

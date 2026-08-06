import type { Indication } from "@/lib/indications-types";
import {
  isFailedAttempt,
  isLayMatchedOnExchange,
  isLayUnmatchedOnExchange,
  isScannerOnlyIndication,
  isUserExecutedOperation,
} from "@/lib/indications-status";

export type OperationMetrics = {
  /** Lay casado na Bolsa. */
  matched: number;
  green: number;
  red: number;
  /** Casado, aguardando resultado do jogo. */
  inPlay: number;
  /** Lay enviado, ainda no book (não correspondido). */
  unmatched: number;
  staked: number;
  profit: number;
};

function operationProfit(item: Indication): number {
  if (!isLayMatchedOnExchange(item)) return 0;
  if (item.result === "green") {
    return Number(item.realizedProfit ?? item.expectedProfit ?? item.stake ?? 0);
  }
  if (item.result === "red") return -Number(item.liability ?? 0);
  return 0;
}

/** Métricas só de ordens reais do usuário, sincronizadas com match na Bolsa. */
export function tallyUserOperations(items: Indication[]): OperationMetrics {
  const executed = items.filter(
    (i) => isUserExecutedOperation(i) && !isScannerOnlyIndication(i),
  );

  let matched = 0;
  let green = 0;
  let red = 0;
  let inPlay = 0;
  let unmatched = 0;
  let staked = 0;
  let profit = 0;

  for (const item of executed) {
    if (isLayUnmatchedOnExchange(item)) {
      unmatched += 1;
      continue;
    }
    if (!isLayMatchedOnExchange(item)) continue;

    matched += 1;
    staked += Number(item.liability ?? item.stake ?? 0);
    profit += operationProfit(item);

    if (item.result === "green") green += 1;
    else if (item.result === "red") red += 1;
    else inPlay += 1;
  }

  return {
    matched,
    green,
    red,
    inPlay,
    unmatched,
    staked: Math.round(staked * 100) / 100,
    profit: Math.round(profit * 100) / 100,
  };
}

export function tallyUserOperationsByEmail(
  items: Indication[],
): Map<string, OperationMetrics & { email: string }> {
  const executed = items.filter(
    (i) => isUserExecutedOperation(i) && !isScannerOnlyIndication(i),
  );
  const byEmail = new Map<string, Indication[]>();

  for (const item of executed) {
    const key = item.userEmail!.trim().toLowerCase();
    const list = byEmail.get(key) ?? [];
    list.push(item);
    byEmail.set(key, list);
  }

  const out = new Map<string, OperationMetrics & { email: string }>();
  for (const [email, list] of byEmail) {
    out.set(email, { email, ...tallyUserOperations(list) });
  }
  return out;
}

export {
  isFailedAttempt,
  isLayMatchedOnExchange,
  isLayUnmatchedOnExchange,
  isUserExecutedOperation,
};

/**
 * Extrato de operações de um usuário, agrupado por dia.
 *
 * Só entra ordem com Lay casado na Bolsa: tentativa que falhou e oferta que
 * ficou no book não são operação e ficariam poluindo o extrato.
 *
 * Sem acesso a disco — a leitura do store fica na API.
 */

import type { Indication, IndicationKind } from "@/lib/indications-types";
import {
  isLayMatchedOnExchange,
  isUserExecutedOperation,
} from "@/lib/indications-status";

/** Fuso do extrato: o dia é o dia do operador, não o UTC do servidor. */
const TZ = "America/Sao_Paulo";

const STRATEGY_LABEL: Record<IndicationKind, string> = {
  "lay-3x3": "Lay 3x3",
  "eventos-raros": "Eventos raros",
  "lucro-certo": "Lucro certo",
};

export type StatementRow = {
  id: string;
  eventId: string;
  eventName: string;
  at: string;
  /** aaaa-mm-dd no fuso de São Paulo. */
  dayKey: string;
  date: string;
  time: string;
  market: string;
  strategy: IndicationKind;
  strategyLabel: string;
  source: string | null;
  /** Valor enviado no Lay. */
  stake: number | null;
  /** Responsabilidade do Lay: stake × (odd − 1). */
  liability: number | null;
  entryOdds: number;
  /** Odd do Back que fechou a operação; null = Lay sem Back (hold). */
  exitOdds: number | null;
  /** Valor efetivamente enviado no Back. */
  exitStake: number | null;
  /** true = Lay→Back fechado; false = resultado depende do jogo. */
  closed: boolean;
  result: "green" | "red" | "pending";
  /** null enquanto o jogo corre sem Back casado. */
  profit: number | null;
};

export type StatementDay = {
  dayKey: string;
  label: string;
  rows: StatementRow[];
  totals: {
    count: number;
    green: number;
    red: number;
    pending: number;
    staked: number;
    profit: number;
  };
};

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRow(item: Indication): StatementRow {
  const at = new Date(item.indicatedAt);
  const events = Array.isArray(item.events) ? item.events : [];
  const backEvent = [...events].reverse().find((e) => e.type === "back-sent");
  const greenEvent = [...events].reverse().find((e) => e.type === "green");

  const closed = Boolean(backEvent);
  const awaitingBack = item.kind === "lay-3x3" && !closed;
  const result: StatementRow["result"] =
    awaitingBack
      ? "pending"
      : item.result === "green" || greenEvent
        ? "green"
        : item.result === "red"
          ? "red"
          : "pending";

  const stake = positive(item.stake);
  const liability = positive(item.liability);
  const profit =
    result === "green"
      ? (positive(item.realizedProfit) ??
        positive(greenEvent?.profit) ??
        positive(backEvent?.profit) ??
        positive(item.expectedProfit) ??
        stake)
      : result === "red"
        ? liability != null
          ? -liability
          : null
        : null;

  return {
    id: item.id,
    eventId: item.eventId,
    eventName: item.eventName || `${item.home} vs ${item.away}`,
    at: item.indicatedAt,
    dayKey: dayKeyFmt.format(at),
    date: dateFmt.format(at),
    time: timeFmt.format(at),
    market: `Placar correto ${item.scoreLabel}`,
    strategy: item.kind,
    strategyLabel: STRATEGY_LABEL[item.kind] ?? item.kind,
    source: item.source ?? null,
    stake,
    liability,
    entryOdds: Number(item.layOdds),
    exitOdds: positive(backEvent?.odds),
    exitStake: positive(backEvent?.stake),
    closed,
    result,
    profit,
  };
}

/** Operações do usuário agrupadas por dia, do dia mais recente para o antigo. */
export function buildStatementDays(items: Indication[]): StatementDay[] {
  const rows = items
    .filter((i) => isUserExecutedOperation(i) && isLayMatchedOnExchange(i))
    .map(toRow)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const byDay = new Map<string, StatementRow[]>();
  for (const row of rows) {
    const list = byDay.get(row.dayKey) ?? [];
    list.push(row);
    byDay.set(row.dayKey, list);
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([dayKey, dayRows]) => ({
      dayKey,
      label: dayLabelFmt.format(new Date(dayRows[0].at)),
      rows: dayRows,
      totals: {
        count: dayRows.length,
        green: dayRows.filter((r) => r.result === "green").length,
        red: dayRows.filter((r) => r.result === "red").length,
        pending: dayRows.filter((r) => r.result === "pending").length,
        staked: round(
          dayRows.reduce((sum, r) => sum + (r.liability ?? r.stake ?? 0), 0),
        ),
        profit: round(dayRows.reduce((sum, r) => sum + (r.profit ?? 0), 0)),
      },
    }));
}

/**
 * Fila de sinais por usuário (email) para a extensão Bolsa Manual.
 * In-memory: adequado a 1 instância Node. TTL alinhado ao stale da extensão.
 * Suporta vários placares CS no mesmo evento (multi-lay / mesmo saldo).
 */

import { resolveExtEventName } from "@/lib/ext-event-label";
import { signalRank } from "@/lib/strategy-priority";

export type ExtSignalPayload = {
  eventId: string;
  eventName?: string;
  /**
   * Aliases que versões antigas da extensão leem para "Último Evento".
   * Sem isso a UI mostra só "Event {id}".
   */
  name?: string;
  matchName?: string;
  title?: string;
  score: string;
  /** Estratégia — a extensão reporta a operação com este rótulo. */
  kind?: string;
  home?: string;
  away?: string;
  minute?: number | null;
  liveScore?: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
  /** hold = sem green (Eventos raros); green = Lay+Back (3x3). */
  exitMode?: "hold" | "green" | "";
  targetBackOdds?: number | null;
  targetProfitPct?: number | null;
  at: number;
  dedupeKey: string;
};

export type ExtSignal = {
  id: string;
  email: string;
  status: "pending" | "claimed";
  createdAt: number;
  expiresAt: number;
  claimedAt?: number;
  payload: ExtSignalPayload;
};

const SIGNAL_TTL_MS = 90_000;
const CLAIM_HOLD_MS = 90_000;
/** Máx. sinais pending por usuário (multi CS no mesmo evento). */
const MAX_PENDING = 8;

const queues = new Map<string, ExtSignal[]>();

/**
 * Sinal que expira sem nenhum claim = a extensão não estava ouvindo (fechada,
 * sem aba da bolsa ou sem sessão). Sem este registro o painel avisava a entrada
 * e o sumiço ficava invisível para todo mundo.
 */
function reportDropped(sig: ExtSignal, reason: string) {
  const p = sig.payload;
  console.warn(
    "[ext-signal] dropped",
    sig.status,
    sig.email,
    p.dedupeKey,
    p.score,
    p.kind || "-",
    reason,
  );
  // O histórico só conhece 3x3 / eventos raros / lucro certo. Over caía no
  // rótulo de eventos raros e sujava as estatísticas da estratégia.
  const kind =
    p.kind === "lay-3x3" ||
    p.kind === "lucro-certo" ||
    p.kind === "eventos-raros"
      ? p.kind
      : null;
  if (!kind) return;
  void import("@/lib/indications-store")
    .then(({ recordPlacedIndication }) => {
      recordPlacedIndication({
        kind,
        eventId: p.eventId,
        eventName: p.eventName,
        home: p.home,
        away: p.away,
        scoreLabel: p.score,
        layOdds: p.layOdds,
        minute: p.minute ?? null,
        liveScoreLabel: p.liveScore ?? null,
        userEmail: sig.email,
        source: "extensao",
        execStatus: "failed",
        event: {
          type: "failed",
          odds: p.layOdds,
          message: reason,
        },
      });
    })
    .catch(() => {
      /* registro nunca pode derrubar a fila */
    });
}

function now() {
  return Date.now();
}

function isExpired(sig: ExtSignal, t = now()) {
  if (t > sig.expiresAt) return true;
  if (sig.status === "claimed" && sig.claimedAt != null) {
    return t - sig.claimedAt > CLAIM_HOLD_MS;
  }
  return false;
}

function prune(email: string) {
  const key = email.toLowerCase();
  const list = queues.get(key);
  if (!list?.length) {
    queues.delete(key);
    return;
  }
  const kept: ExtSignal[] = [];
  for (const sig of list) {
    if (!isExpired(sig)) {
      kept.push(sig);
      continue;
    }
    if (sig.status === "pending") {
      reportDropped(
        sig,
        "extensão não buscou o sinal em 90s (fechada, sem aba da bolsa ou sem sessão)",
      );
    } else if (sig.status === "claimed") {
      reportDropped(
        sig,
        "extensão claimou o sinal mas não confirmou ack em 90s (falha no bilhete/DOM)",
      );
    }
  }
  if (!kept.length) queues.delete(key);
  else queues.set(key, kept);
}

/**
 * A extensão só chama a fila quando está viva — sem varredura, um sinal órfão
 * ficaria parado até o próximo publish do painel.
 */
declare global {
  var __tips3x3ExtSignalSweeper: NodeJS.Timeout | undefined;
}

if (!globalThis.__tips3x3ExtSignalSweeper) {
  globalThis.__tips3x3ExtSignalSweeper = setInterval(() => {
    for (const email of [...queues.keys()]) prune(email);
  }, 30_000);
  globalThis.__tips3x3ExtSignalSweeper.unref?.();
}

export function publishExtSignal(
  email: string,
  payload: ExtSignalPayload,
): ExtSignal {
  const key = email.toLowerCase();
  prune(key);

  const list = queues.get(key) ?? [];
  const dedupeKey = String(
    payload.dedupeKey || `${payload.eventId}:${payload.score}`,
  );

  // Evita duplicar enquanto pending OU claimed (extensão ainda processando).
  const existing = list.find(
    (s) => !isExpired(s) && s.payload.dedupeKey === dedupeKey,
  );
  if (existing) return existing;

  const t = now();
  const eventId = String(payload.eventId);
  const eventName = resolveExtEventName({
    eventName: payload.eventName,
    home: payload.home,
    away: payload.away,
    eventId,
  });
  const signal: ExtSignal = {
    id: crypto.randomUUID(),
    email: key,
    status: "pending",
    createdAt: t,
    expiresAt: t + SIGNAL_TTL_MS,
    payload: {
      ...payload,
      eventId,
      eventName,
      name: eventName,
      matchName: eventName,
      title: eventName,
      home: payload.home || undefined,
      away: payload.away || undefined,
      score: payload.score || "3-3",
      layOdds: Number(payload.layOdds),
      exitMode: payload.exitMode || "",
      at: Number(payload.at) || t,
      dedupeKey,
    },
  };

  // Mantém claimed recentes + pending. Com a fila lotada sai o sinal de menor
  // precedência (empate = o mais antigo): descartar sempre o mais antigo jogava
  // fora o Lay 3x3, que é publicado primeiro em cada varredura.
  const claimed = list.filter((s) => s.status === "claimed" && !isExpired(s));
  const pending = list.filter((s) => s.status === "pending" && !isExpired(s));
  pending.push(signal);
  while (pending.length > MAX_PENDING) {
    let worst = 0;
    for (let i = 1; i < pending.length; i += 1) {
      const diff =
        signalRank(pending[i].payload.kind) -
        signalRank(pending[worst].payload.kind);
      if (diff > 0 || (diff === 0 && pending[i].createdAt < pending[worst].createdAt)) {
        worst = i;
      }
    }
    const [out] = pending.splice(worst, 1);
    reportDropped(out, "fila cheia: sinal de menor precedência foi descartado");
  }

  queues.set(key, [...claimed, ...pending]);
  console.info(
    "[ext-signal] publish",
    key,
    signal.id,
    payload.score,
    payload.kind || "-",
    payload.dedupeKey,
    `lay=${payload.layOdds}`,
  );
  return signal;
}

/**
 * Próximo pending por precedência de estratégia; empate resolve em FIFO.
 * Antes era FIFO puro, então a ordem de entrega dependia da ordem em que a
 * varredura publicava os sinais.
 */
function nextPendingIndex(list: ExtSignal[]): number {
  let best = -1;
  for (let i = 0; i < list.length; i += 1) {
    const sig = list[i];
    if (sig.status !== "pending" || isExpired(sig)) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const diff =
      signalRank(sig.payload.kind) - signalRank(list[best].payload.kind);
    if (diff < 0 || (diff === 0 && sig.createdAt < list[best].createdAt)) {
      best = i;
    }
  }
  return best;
}

/** Peek do próximo pending sem claim. */
export function peekExtSignal(email: string): ExtSignal | null {
  const key = email.toLowerCase();
  prune(key);
  const list = queues.get(key) ?? [];
  const idx = nextPendingIndex(list);
  return idx < 0 ? null : list[idx];
}

/**
 * Claim atômico do próximo pending: pending → claimed.
 * Retorna null se vazio ou só claimed em hold.
 */
export function claimExtSignal(email: string): ExtSignal | null {
  const key = email.toLowerCase();
  prune(key);
  const list = queues.get(key) ?? [];
  if (!list.length) {
    queues.delete(key);
    return null;
  }

  const idx = nextPendingIndex(list);
  if (idx < 0) return null;

  const t = now();
  const claimed: ExtSignal = {
    ...list[idx],
    status: "claimed",
    claimedAt: t,
  };
  const next = [...list];
  next[idx] = claimed;
  queues.set(key, next);
  console.info(
    "[ext-signal] claim",
    key,
    claimed.id,
    claimed.payload.score,
    claimed.payload.dedupeKey,
  );
  return claimed;
}

export function ackExtSignal(
  email: string,
  id: string,
  status: "acked" | "failed",
): { ok: boolean; cleared: boolean } {
  const key = email.toLowerCase();
  const list = queues.get(key) ?? [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, cleared: false };

  if (status === "acked" || status === "failed") {
    list.splice(idx, 1);
    if (!list.length) queues.delete(key);
    else queues.set(key, list);
    return { ok: true, cleared: true };
  }
  return { ok: true, cleared: false };
}

export { SIGNAL_TTL_MS, CLAIM_HOLD_MS, MAX_PENDING };

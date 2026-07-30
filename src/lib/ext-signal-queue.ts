/**
 * Fila de sinais por usuário (email) para a extensão Bolsa Manual.
 * In-memory: adequado a 1 instância Node. TTL alinhado ao stale da extensão.
 * Suporta vários placares CS no mesmo evento (multi-lay / mesmo saldo).
 */

export type ExtSignalPayload = {
  eventId: string;
  eventName?: string;
  score: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
  /** hold = sem green (Eventos raros). */
  exitMode?: "hold" | "green" | "";
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
  const kept = list.filter((s) => !isExpired(s));
  if (!kept.length) queues.delete(key);
  else queues.set(key, kept);
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

  const existing = list.find(
    (s) =>
      s.status === "pending" &&
      !isExpired(s) &&
      s.payload.dedupeKey === dedupeKey,
  );
  if (existing) return existing;

  const t = now();
  const signal: ExtSignal = {
    id: crypto.randomUUID(),
    email: key,
    status: "pending",
    createdAt: t,
    expiresAt: t + SIGNAL_TTL_MS,
    payload: {
      ...payload,
      eventId: String(payload.eventId),
      score: payload.score || "3-3",
      layOdds: Number(payload.layOdds),
      exitMode: payload.exitMode || "",
      at: Number(payload.at) || t,
      dedupeKey,
    },
  };

  // Mantém claimed recentes + pending; descarta pending mais antigos se lotar
  const claimed = list.filter((s) => s.status === "claimed" && !isExpired(s));
  const pending = list.filter((s) => s.status === "pending" && !isExpired(s));
  pending.push(signal);
  while (pending.length > MAX_PENDING) pending.shift();

  queues.set(key, [...claimed, ...pending]);
  return signal;
}

/** Peek do próximo pending (FIFO) sem claim. */
export function peekExtSignal(email: string): ExtSignal | null {
  const key = email.toLowerCase();
  prune(key);
  const list = queues.get(key) ?? [];
  return list.find((s) => s.status === "pending" && !isExpired(s)) ?? null;
}

/**
 * Claim atômico do próximo pending (FIFO): pending → claimed.
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

  const idx = list.findIndex((s) => s.status === "pending" && !isExpired(s));
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

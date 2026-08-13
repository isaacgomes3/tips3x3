/**
 * Histórico de indicações Eventos raros / Lucro certo.
 * Disco é a fonte da verdade (PM2 / reinícios).
 */

import fs from "fs";
import path from "path";
import type {
  Indication,
  IndicationEvent,
  IndicationEventType,
  IndicationExecStatus,
  IndicationKind,
  IndicationResult,
  IndicationSource,
} from "@/lib/indications-types";
import {
  inferExecStatus,
  inferLayMatched,
  isFailedAttempt,
  isLayMatchedOnExchange,
} from "@/lib/indications-status";

export type {
  Indication,
  IndicationEvent,
  IndicationEventType,
  IndicationExecStatus,
  IndicationKind,
  IndicationResult,
  IndicationSource,
} from "@/lib/indications-types";

export {
  isFailedAttempt,
  isLayMatchedOnExchange,
  isLayUnmatchedOnExchange,
  isScannerOnlyIndication,
  isUserExecutedOperation,
} from "@/lib/indications-status";

type FileShape = {
  items: Indication[];
};

const MAX_ITEMS = 500;
/** Evento sumiu do feed live → settle após este tempo. */
const ABSENT_GRACE_MS = 90_000;
/** Passos guardados por ordem — o suficiente para auditar sem inflar o disco. */
const MAX_EVENTS_PER_ITEM = 20;

function resolveStorePath() {
  if (process.env.INDICATIONS_PATH) return process.env.INDICATIONS_PATH;
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "indications.json",
  );
}

function readFile(): FileShape {
  const STORE_PATH = resolveStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) return { items: [] };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as FileShape;
    return {
      items: Array.isArray(raw.items) ? raw.items : [],
    };
  } catch (err) {
    console.error("[indications-store] read failed", resolveStorePath(), err);
    return { items: [] };
  }
}

function writeFileAtomic(data: FileShape) {
  const STORE_PATH = resolveStorePath();
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}

function indicationId(eventId: string, scoreLabel: string, kind: IndicationKind) {
  return `${eventId}:${kind}:${scoreLabel}`;
}

function parseScore(label?: string | null): { home: number; away: number } | null {
  if (!label) return null;
  const m = label.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function trimItems(items: Indication[]): Indication[] {
  if (items.length <= MAX_ITEMS) return items;
  return [...items]
    .sort((a, b) => Date.parse(b.indicatedAt) - Date.parse(a.indicatedAt))
    .slice(0, MAX_ITEMS);
}

/** `Number(null)` é 0 — sem esta guarda, "não informado" virava R$ 0,00. */
function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Valor monetário só conta se for maior que zero. */
function positiveOrNull(value: unknown): number | null {
  const n = numOrNull(value);
  return n != null && n > 0 ? n : null;
}

function normalizeItem(raw: Indication): Indication {
  const layMatched = inferLayMatched(raw);
  return {
    ...raw,
    lastLiveScore: raw.lastLiveScore ?? raw.liveScoreAtIndication ?? null,
    lastSeenAt: raw.lastSeenAt ?? raw.indicatedAt ?? null,
    userEmail: raw.userEmail ?? null,
    source: raw.source ?? null,
    // Zero aqui sempre veio de registro sem valor informado — vira ausência
    // para não poluir o financeiro nem travar o preenchimento posterior.
    stake: positiveOrNull(raw.stake),
    liability: positiveOrNull(raw.liability),
    expectedProfit: positiveOrNull(raw.expectedProfit),
    execStatus: inferExecStatus(raw),
    lastError: raw.lastError ?? null,
    realizedProfit: positiveOrNull(raw.realizedProfit),
    events: Array.isArray(raw.events) ? raw.events : [],
    layMatched,
  };
}

function pushEvent(item: Indication, event: IndicationEvent) {
  const list = Array.isArray(item.events) ? item.events : [];
  list.push(event);
  item.events = list.slice(-MAX_EVENTS_PER_ITEM);
}

/**
 * Registra o passo e reflete o que ele muda no resumo da ordem.
 * "failed" guarda só o motivo: quem decide se a ordem existe é o execStatus.
 */
function applyEvent(item: Indication, event: IndicationEvent) {
  pushEvent(item, event);

  if (event.type === "failed") {
    item.lastError = event.message ?? item.lastError ?? null;
    return;
  }
  if (event.type === "lay-sent") {
    item.layMatched = false;
    return;
  }
  if (event.type === "lay-matched") {
    item.layMatched = true;
    const st = positiveOrNull(event.stake);
    const od = numOrNull(event.odds);
    if (st != null) item.stake = st;
    if (od != null && od > 1) item.layOdds = od;
    if (st != null && od != null && od > 1.01) {
      item.liability = Math.round(st * (od - 1) * 100) / 100;
    }
    return;
  }
  if (event.type === "back-sent" && event.profit != null) {
    item.expectedProfit = event.profit;
    return;
  }
  if (event.type === "green") {
    item.realizedProfit = event.profit ?? item.realizedProfit ?? null;
    if (item.result === "pending" && isLayMatchedOnExchange(item)) {
      item.result = "green";
      item.settledAt = event.at;
      item.finalScore = item.lastLiveScore ?? item.liveScoreAtIndication;
    }
  }
}

function layResult(
  target: { home: number; away: number },
  final: { home: number; away: number },
): IndicationResult {
  return final.home === target.home && final.away === target.away
    ? "red"
    : "green";
}

/** Live já tornou o placar alvo impossível → lay é green. */
function isTargetImpossible(
  target: { home: number; away: number },
  live: { home: number; away: number },
) {
  return live.home > target.home || live.away > target.away;
}

function settleItem(
  item: Indication,
  opts: {
    result: IndicationResult;
    finalScore: string;
    at: string;
  },
) {
  item.result = opts.result;
  item.finalScore = opts.finalScore;
  item.settledAt = opts.at;
}

export function listIndications(opts?: {
  kind?: IndicationKind;
  limit?: number;
  /** Tentativas que falharam só interessam à auditoria do master. */
  includeFailed?: boolean;
}): Indication[] {
  let items = readFile().items.map(normalizeItem);
  if (!opts?.includeFailed) items = items.filter((i) => !isFailedAttempt(i));
  if (opts?.kind) items = items.filter((i) => i.kind === opts.kind);
  items = [...items].sort(
    (a, b) => Date.parse(b.indicatedAt) - Date.parse(a.indicatedAt),
  );
  if (opts?.limit && opts.limit > 0) items = items.slice(0, opts.limit);
  return items;
}

export type SyncEventosRarosInput = {
  eventId: string;
  eventName: string;
  home: string;
  away: string;
  minute: number | null;
  liveScoreLabel: string | null;
  status?: string | null;
  finished?: boolean;
  entries: Array<{
    label: string;
    layOdds: number;
    alreadyImpossible?: boolean;
    settledHit?: boolean;
    entryReady?: boolean;
  }>;
};

/**
 * Grava entradas prontas e resolve resultado quando:
 * - placar alvo sai (red)
 * - live torna o alvo impossível (green)
 * - FT / finished no feed
 */
export function syncEventosRarosIndications(input: SyncEventosRarosInput): {
  created: number;
  settled: number;
} {
  const data = readFile();
  const byId = new Map(data.items.map((i) => [i.id, normalizeItem(i)]));
  let created = 0;
  let settled = 0;
  const now = new Date().toISOString();
  const liveParsed = parseScore(input.liveScoreLabel);

  for (const entry of input.entries) {
    const score = String(entry.label || "").trim();
    if (!score) continue;
    const ready = entry.entryReady !== false;
    if (!ready && !entry.settledHit) continue;

    const kind: IndicationKind = entry.alreadyImpossible
      ? "lucro-certo"
      : "eventos-raros";
    const id = indicationId(input.eventId, score, kind);
    const existing = byId.get(id);

    if (!existing && ready) {
      const layOdds = Number(entry.layOdds);
      if (!(layOdds > 1)) continue;
      const instantGreen = kind === "lucro-certo";
      const next: Indication = {
        id,
        kind,
        eventId: input.eventId,
        eventName: input.eventName,
        home: input.home,
        away: input.away,
        scoreLabel: score,
        layOdds,
        indicatedAt: now,
        minute: input.minute,
        liveScoreAtIndication: input.liveScoreLabel,
        lastLiveScore: input.liveScoreLabel,
        lastSeenAt: now,
        result: instantGreen ? "green" : "pending",
        finalScore: instantGreen ? input.liveScoreLabel : null,
        settledAt: instantGreen ? now : null,
      };
      byId.set(id, next);
      created += 1;
    }
  }

  let touched = created > 0;

  // Atualiza lastSeen / placar de todas as indicações deste evento.
  for (const item of byId.values()) {
    if (item.eventId !== input.eventId) continue;
    item.lastSeenAt = now;
    if (input.liveScoreLabel) item.lastLiveScore = input.liveScoreLabel;
    if (input.minute != null) item.minute = input.minute;
    touched = true;
  }

  const finished = Boolean(input.finished);

  for (const item of byId.values()) {
    if (item.eventId !== input.eventId) continue;
    if (item.result !== "pending") continue;
    if (isFailedAttempt(item)) continue;
    // Ordem do usuário ainda no book — placar não liquida sem match real.
    if (item.userEmail && !isLayMatchedOnExchange(item)) continue;

    const target = parseScore(item.scoreLabel);
    if (!target) continue;

    const entry = input.entries.find((e) => e.label === item.scoreLabel);
    const hitNow = Boolean(entry?.settledHit);
    const scoreForSettle =
      input.liveScoreLabel?.trim() ||
      item.lastLiveScore ||
      item.liveScoreAtIndication;
    const scoreParsed = parseScore(scoreForSettle);

    if (hitNow) {
      settleItem(item, {
        result: "red",
        finalScore: scoreForSettle || item.scoreLabel,
        at: now,
      });
      settled += 1;
      continue;
    }

    if (scoreParsed && isTargetImpossible(target, scoreParsed)) {
      settleItem(item, {
        result: "green",
        finalScore: scoreForSettle!,
        at: now,
      });
      settled += 1;
      continue;
    }

    if (finished && scoreParsed) {
      settleItem(item, {
        result: layResult(target, scoreParsed),
        finalScore: scoreForSettle!,
        at: now,
      });
      settled += 1;
      continue;
    }

    if (finished && item.kind === "lucro-certo") {
      settleItem(item, {
        result: "green",
        finalScore: scoreForSettle || item.liveScoreAtIndication || "?",
        at: now,
      });
      settled += 1;
    }
  }

  if (settled > 0) touched = true;

  if (touched) {
    data.items = trimItems([...byId.values()]);
    try {
      writeFileAtomic(data);
    } catch (err) {
      console.error(
        "[indications-store] write failed",
        resolveStorePath(),
        err,
      );
    }
  }

  return { created, settled };
}

/**
 * Eventos que sumiram do feed inplay (FT costuma não chegar) — resolve
 * pendentes com o último placar conhecido após grace period.
 */
export function reconcileAbsentIndications(activeEventIds: Iterable<string>): {
  settled: number;
} {
  const active = new Set(
    [...activeEventIds].map((id) => String(id)).filter(Boolean),
  );
  const data = readFile();
  const items = data.items.map(normalizeItem);
  let settled = 0;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  for (const item of items) {
    if (item.result !== "pending") continue;
    if (isFailedAttempt(item)) continue;
    if (item.userEmail && !isLayMatchedOnExchange(item)) continue;
    if (active.has(item.eventId)) continue;

    const lastSeen = Date.parse(item.lastSeenAt || item.indicatedAt);
    if (!Number.isFinite(lastSeen) || now - lastSeen < ABSENT_GRACE_MS) continue;

    const scoreLabel =
      item.lastLiveScore || item.liveScoreAtIndication || null;
    const finalParsed = parseScore(scoreLabel);
    const target = parseScore(item.scoreLabel);
    if (!target || !finalParsed || !scoreLabel) continue;

    settleItem(item, {
      result: layResult(target, finalParsed),
      finalScore: scoreLabel,
      at: nowIso,
    });
    settled += 1;
  }

  if (settled > 0) {
    data.items = trimItems(items);
    try {
      writeFileAtomic(data);
    } catch (err) {
      console.error(
        "[indications-store] reconcile write failed",
        resolveStorePath(),
        err,
      );
    }
  }

  return { settled };
}

/**
 * Resolve pendentes com placar final informado (ex.: FotMob FT).
 */
export function settleEventIndications(
  eventId: string,
  finalScoreLabel: string,
  opts?: { finished?: boolean },
): { settled: number } {
  const finalParsed = parseScore(finalScoreLabel);
  if (!finalParsed) return { settled: 0 };

  const data = readFile();
  const items = data.items.map(normalizeItem);
  let settled = 0;
  const now = new Date().toISOString();
  const finished = opts?.finished !== false;

  for (const item of items) {
    if (item.eventId !== eventId) continue;
    if (item.result !== "pending") continue;
    if (isFailedAttempt(item)) continue;
    if (item.userEmail && !isLayMatchedOnExchange(item)) continue;
    const target = parseScore(item.scoreLabel);
    if (!target) continue;

    item.lastLiveScore = finalScoreLabel;
    item.lastSeenAt = now;

    if (
      finished ||
      isTargetImpossible(target, finalParsed) ||
      (finalParsed.home === target.home && finalParsed.away === target.away)
    ) {
      settleItem(item, {
        result: layResult(target, finalParsed),
        finalScore: finalScoreLabel,
        at: now,
      });
      settled += 1;
    }
  }

  if (settled > 0) {
    data.items = trimItems(items);
    try {
      writeFileAtomic(data);
    } catch (err) {
      console.error(
        "[indications-store] settleEvent write failed",
        resolveStorePath(),
        err,
      );
    }
  }

  return { settled };
}

export type RecordPlacedIndicationInput = {
  kind: IndicationKind;
  eventId: string;
  eventName?: string;
  home?: string;
  away?: string;
  scoreLabel: string;
  layOdds: number;
  minute?: number | null;
  liveScoreLabel?: string | null;
  alreadyImpossible?: boolean;
  userEmail?: string | null;
  source?: IndicationSource | null;
  stake?: number | null;
  /** Responsabilidade real cobrada pela casa; sem ela, derivamos da stake. */
  liability?: number | null;
  expectedProfit?: number | null;
  realizedProfit?: number | null;
  appProduct?: "surebet-betbra" | "surebet-bolsa" | null;
  marketName?: string | null;
  surebetLegs?: Array<{
    selection: string;
    venue: "betbra" | "bolsa";
    odds: number;
    stake: number;
  }>;
  /** "failed" registra a tentativa sem contaminar as métricas. */
  execStatus?: IndicationExecStatus | null;
  /** Passo do ciclo de vida que originou esta chamada. */
  event?: {
    type: IndicationEventType;
    odds?: number | null;
    stake?: number | null;
    profit?: number | null;
    message?: string | null;
  } | null;
};

/**
 * Grava indicação após ordem nativa (APK). Idempotente por eventId+kind+score.
 */
export function recordPlacedIndication(
  input: RecordPlacedIndicationInput,
): { created: boolean; item: Indication | null } {
  const eventId = String(input.eventId || "").trim();
  const score = String(input.scoreLabel || "").trim();
  const layOdds = Number(input.layOdds);
  if (!eventId || !score || !(layOdds > 1)) {
    return { created: false, item: null };
  }

  const kind: IndicationKind =
    input.kind === "surebet" ||
    input.kind === "lucro-certo" ||
    input.kind === "lay-3x3" ||
    input.kind === "eventos-raros"
      ? input.kind
      : input.alreadyImpossible
        ? "lucro-certo"
        : "eventos-raros";

  const id = indicationId(eventId, score, kind);
  const data = readFile();
  const byId = new Map(data.items.map((i) => [i.id, normalizeItem(i)]));
  const existing = byId.get(id);
  const now = new Date().toISOString();

  const stake = positiveOrNull(input.stake);
  const liability =
    positiveOrNull(input.liability) ??
    (stake != null ? Math.round(stake * (layOdds - 1) * 100) / 100 : null);
  const expectedProfit = numOrNull(input.expectedProfit) ?? stake;
  const userEmail = input.userEmail?.trim().toLowerCase() || null;
  const execStatus: IndicationExecStatus =
    input.execStatus === "failed" ||
    (input.event?.type === "failed" && stake == null)
      ? "failed"
      : "placed";
  const event: IndicationEvent | null = input.event
    ? {
        at: now,
        type: input.event.type,
        odds: input.event.odds ?? null,
        stake: input.event.stake ?? null,
        profit: input.event.profit ?? null,
        message: input.event.message?.slice(0, 300) ?? null,
      }
    : null;

  if (existing) {
    existing.lastSeenAt = now;
    if (input.liveScoreLabel) existing.lastLiveScore = input.liveScoreLabel;
    if (input.minute != null) existing.minute = input.minute;
    if (layOdds > existing.layOdds) existing.layOdds = layOdds;
    if (userEmail && !existing.userEmail) existing.userEmail = userEmail;
    if (input.appProduct) existing.appProduct = input.appProduct;
    if (input.marketName) existing.marketName = input.marketName.slice(0, 100);
    if (input.surebetLegs?.length === 3) existing.surebetLegs = input.surebetLegs;
    if (input.realizedProfit != null) existing.realizedProfit = numOrNull(input.realizedProfit);
    // Uma confirmação do APK prevalece sobre uma tentativa anterior da fila
    // da extensão: a origem exibida deve ser de quem executou a operação.
    if (input.source === "apk") existing.source = "apk";
    else if (input.source && !existing.source) existing.source = input.source;
    // Indicação criada pela varredura do sistema nasce sem valor: quando o
    // executor confirma a ordem, é aqui que o valor real entra.
    if (stake != null && !(Number(existing.stake) > 0)) {
      existing.stake = stake;
      existing.liability = liability;
      existing.expectedProfit = expectedProfit;
    } else if (liability != null && !(Number(existing.liability) > 0)) {
      existing.liability = liability;
    }
    // Uma confirmação posterior promove a tentativa que havia falhado; um
    // cancelamento antes de casar devolve a ordem para fora das métricas.
    // Evento "failed" não promove a tentativa: sem isso um sinal recusado
    // ficava gravado como ordem colocada e contava como green.
    const eventConfirmsOrder =
      input.event == null ||
      input.event.type === "lay-matched" ||
      input.event.type === "back-sent" ||
      input.event.type === "green" ||
      (input.event.type === "lay-sent" &&
        (stake != null || Number(input.event.stake) > 0));
    if (execStatus === "placed" && eventConfirmsOrder) {
      existing.execStatus = "placed";
    } else if (input.event?.type === "cancelled") {
      existing.execStatus = "failed";
    }
    // Falha da fila da extensão não pertence a um Lay já confirmado no APK.
    const ignoreExtensionFailure =
      existing.source === "apk" &&
      input.source === "extensao" &&
      input.event?.type === "failed";
    if (event && !ignoreExtensionFailure) applyEvent(existing, event);
    else if (stake != null && kind === "lay-3x3") existing.layMatched = true;
    data.items = trimItems([...byId.values()]);
    try {
      writeFileAtomic(data);
    } catch (err) {
      console.error("[indications-store] record update failed", err);
    }
    return { created: false, item: existing };
  }

  const instantGreen =
    kind === "surebet" || kind === "lucro-certo" || Boolean(input.alreadyImpossible);
  const next: Indication = {
    id,
    kind:
      instantGreen && kind !== "lay-3x3" && kind !== "surebet"
        ? "lucro-certo"
        : kind,
    eventId,
    eventName:
      input.eventName || `${input.home ?? "?"} vs ${input.away ?? "?"}`,
    home: input.home || "",
    away: input.away || "",
    scoreLabel: score,
    layOdds,
    indicatedAt: now,
    minute: input.minute ?? null,
    liveScoreAtIndication: input.liveScoreLabel ?? null,
    lastLiveScore: input.liveScoreLabel ?? null,
    lastSeenAt: now,
    result: instantGreen ? "green" : "pending",
    finalScore: instantGreen ? (input.liveScoreLabel ?? null) : null,
    settledAt: instantGreen ? now : null,
    userEmail,
    source: input.source ?? null,
    stake,
    liability,
    expectedProfit,
    execStatus,
    lastError: null,
    realizedProfit: null,
    appProduct: input.appProduct ?? null,
    marketName: input.marketName?.slice(0, 100) ?? null,
    surebetLegs: input.surebetLegs?.length === 3 ? input.surebetLegs : [],
    events: [],
    layMatched:
      event?.type === "lay-matched" || (kind === "lay-3x3" && stake != null)
        ? true
        : event?.type === "lay-sent"
          ? false
          : null,
  };
  if (event) applyEvent(next, event);
  if (input.realizedProfit != null) next.realizedProfit = numOrNull(input.realizedProfit);
  byId.set(id, next);
  data.items = trimItems([...byId.values()]);
  try {
    writeFileAtomic(data);
  } catch (err) {
    console.error("[indications-store] record write failed", err);
    return { created: false, item: null };
  }
  return { created: true, item: next };
}

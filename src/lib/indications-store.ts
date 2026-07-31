/**
 * Histórico de indicações Eventos raros / Lucro certo.
 * Disco é a fonte da verdade (PM2 / reinícios).
 */

import fs from "fs";
import path from "path";
import type {
  Indication,
  IndicationKind,
  IndicationResult,
} from "@/lib/indications-types";

export type {
  Indication,
  IndicationKind,
  IndicationResult,
} from "@/lib/indications-types";

type FileShape = {
  items: Indication[];
};

const MAX_ITEMS = 500;
/** Evento sumiu do feed live → settle após este tempo. */
const ABSENT_GRACE_MS = 90_000;

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

function normalizeItem(raw: Indication): Indication {
  return {
    ...raw,
    lastLiveScore: raw.lastLiveScore ?? raw.liveScoreAtIndication ?? null,
    lastSeenAt: raw.lastSeenAt ?? raw.indicatedAt ?? null,
  };
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
}): Indication[] {
  let items = readFile().items.map(normalizeItem);
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

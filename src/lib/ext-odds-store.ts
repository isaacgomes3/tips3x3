/**
 * Odds 1X2 capturadas pelas extensões Bet365 / Betnacional.
 * Disco é a fonte da verdade (Next pode duplicar módulos / PM2 reinicia).
 */

import fs from "fs";
import path from "path";

export type ExtBookmaker = "bet365" | "betnacional";

export type ExtOddsEvent = {
  bookmaker: ExtBookmaker;
  home: string;
  away: string;
  start?: string;
  externalId?: string;
  url?: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  capturedAt: number;
  eventIdBolsa?: string;
};

export type ExtOddsStoreSnapshot = {
  updatedAt: number;
  byBookmaker: Record<ExtBookmaker, ExtOddsEvent[]>;
  count: number;
};

const TTL_MS = 8 * 60_000;

function resolveStorePath() {
  if (process.env.EXT_ODDS_PATH) return process.env.EXT_ODDS_PATH;
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "ext-odds.json");
}

type FileShape = {
  users: Record<string, ExtOddsEvent[]>;
};

function keyOf(e: ExtOddsEvent) {
  if (e.eventIdBolsa) return `${e.bookmaker}:bolsa:${e.eventIdBolsa}`;
  if (e.externalId) return `${e.bookmaker}:ext:${e.externalId}`;
  return `${e.bookmaker}:names:${e.home.toLowerCase()}|${e.away.toLowerCase()}`;
}

function readFile(): FileShape {
  const STORE_PATH = resolveStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) return { users: {} };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as FileShape;
    return { users: raw.users && typeof raw.users === "object" ? raw.users : {} };
  } catch (err) {
    console.error("[ext-odds-store] read failed", resolveStorePath(), err);
    return { users: {} };
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

function pruneList(list: ExtOddsEvent[]): ExtOddsEvent[] {
  const t = Date.now();
  return list.filter((e) => t - Number(e.capturedAt) <= TTL_MS);
}

function mapFromList(list: ExtOddsEvent[]): Map<string, ExtOddsEvent> {
  const map = new Map<string, ExtOddsEvent>();
  for (const e of pruneList(list)) {
    const k = keyOf(e);
    const prev = map.get(k);
    if (!prev || Number(e.capturedAt) >= Number(prev.capturedAt)) {
      map.set(k, e);
    }
  }
  return map;
}

export function upsertExtOdds(
  email: string,
  events: ExtOddsEvent[],
): { upserted: number; total: number } {
  const key = email.toLowerCase();
  const data = readFile();
  const map = mapFromList(data.users[key] || []);

  let upserted = 0;
  const t = Date.now();
  for (const raw of events) {
    const homeOdds = Number(raw.homeOdds);
    const drawOdds = Number(raw.drawOdds);
    const awayOdds = Number(raw.awayOdds);
    if (!(homeOdds > 1.01 && drawOdds > 1.01 && awayOdds > 1.01)) continue;
    if (raw.bookmaker !== "bet365" && raw.bookmaker !== "betnacional") continue;
    const home = String(raw.home || "").trim();
    const away = String(raw.away || "").trim();
    if (!home || !away) continue;

    const ev: ExtOddsEvent = {
      bookmaker: raw.bookmaker,
      home,
      away,
      start: raw.start ? String(raw.start) : undefined,
      externalId: raw.externalId ? String(raw.externalId) : undefined,
      url: raw.url ? String(raw.url) : undefined,
      homeOdds,
      drawOdds,
      awayOdds,
      capturedAt: Number(raw.capturedAt) || t,
      eventIdBolsa: raw.eventIdBolsa ? String(raw.eventIdBolsa) : undefined,
    };
    map.set(keyOf(ev), ev);
    upserted += 1;
  }

  const nextList = [...map.values()];
  if (nextList.length === 0) delete data.users[key];
  else data.users[key] = nextList;

  try {
    writeFileAtomic(data);
  } catch (err) {
    console.error("[ext-odds-store] write failed", resolveStorePath(), err);
    throw err;
  }

  console.info(
    `[ext-odds-store] upsert email=${key} upserted=${upserted} total=${nextList.length} path=${resolveStorePath()}`,
  );
  return { upserted, total: nextList.length };
}

export function listExtOdds(email: string): ExtOddsEvent[] {
  const key = email.toLowerCase();
  const list = pruneList(readFile().users[key] || []);
  return list.sort((a, b) => b.capturedAt - a.capturedAt);
}

export function extOddsSnapshot(email: string): ExtOddsStoreSnapshot {
  const list = listExtOdds(email);
  const byBookmaker: Record<ExtBookmaker, ExtOddsEvent[]> = {
    bet365: [],
    betnacional: [],
  };
  for (const e of list) byBookmaker[e.bookmaker].push(e);
  return {
    updatedAt: list.reduce((m, e) => Math.max(m, e.capturedAt), 0),
    byBookmaker,
    count: list.length,
  };
}

export function hasFreshExtOdds(email?: string | null): boolean {
  if (email) return listExtOdds(email).length > 0;
  const data = readFile();
  for (const list of Object.values(data.users || {})) {
    if (pruneList(list || []).length) return true;
  }
  return false;
}

export function listAllExtOdds(): ExtOddsEvent[] {
  const data = readFile();
  const out: ExtOddsEvent[] = [];
  for (const list of Object.values(data.users || {})) {
    out.push(...pruneList(list || []));
  }
  return out.sort((a, b) => b.capturedAt - a.capturedAt);
}

export const EXT_ODDS_TTL_MS = TTL_MS;

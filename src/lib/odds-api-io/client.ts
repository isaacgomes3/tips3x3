import type { OddsIoEvent, OddsIoEventOdds } from "./types";

const BASE = "https://api.odds-api.io/v3";

/**
 * Casas usadas na comparação.
 * Plano Free da Odds-API.io: máx. 2 bookmakers (selecionar no dashboard/API).
 * Override: ODDS_API_IO_BOOKMAKERS=Bet365,Betnacional
 */
export const BR_BOOKMAKERS_DEFAULT = ["Bet365", "Betnacional"] as const;

export function resolveBookmakers(): string[] {
  const fromEnv = process.env.ODDS_API_IO_BOOKMAKERS?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [...BR_BOOKMAKERS_DEFAULT];
}

/** @deprecated use resolveBookmakers() — mantido p/ imports existentes */
export const BR_BOOKMAKERS = BR_BOOKMAKERS_DEFAULT;

type CacheEntry<T> = { at: number; value: T };

let eventsCache: CacheEntry<OddsIoEvent[]> | null = null;
const oddsCache = new Map<string, CacheEntry<OddsIoEventOdds>>();

const EVENTS_TTL_MS = 10 * 60_000;
const ODDS_TTL_MS = 60_000;

export function getOddsApiIoKey(): string | null {
  return (
    process.env.ODDS_API_IO_KEY?.trim() ||
    process.env.ODDS_API_KEY?.trim() ||
    null
  );
}

async function ioFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = getOddsApiIoKey();
  if (!key) throw new Error("ODDS_API_IO_KEY não configurada");

  const qs = new URLSearchParams({ ...params, apiKey: key });
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Odds-API.io ${res.status}: ${body.slice(0, 220) || res.statusText}`,
    );
  }

  return (await res.json()) as T;
}

/** Lista eventos de futebol (pending + live). */
export async function listFootballEvents(opts?: {
  limit?: number;
  bookmaker?: string;
}): Promise<OddsIoEvent[]> {
  const now = Date.now();
  const cacheKey = opts?.bookmaker ?? "all";
  if (
    !opts?.bookmaker &&
    eventsCache &&
    now - eventsCache.at < EVENTS_TTL_MS
  ) {
    return eventsCache.value;
  }

  const from = new Date(now - 3 * 60 * 60_000).toISOString();
  const to = new Date(now + 36 * 60 * 60_000).toISOString();
  const params: Record<string, string> = {
    sport: "football",
    status: "pending,live",
    from,
    to,
    limit: String(opts?.limit ?? 400),
  };
  if (opts?.bookmaker) params.bookmaker = opts.bookmaker;

  const data = await ioFetch<OddsIoEvent[]>("/events", params);
  const list = Array.isArray(data) ? data : [];
  if (!opts?.bookmaker) eventsCache = { at: now, value: list };
  return list;
}

export async function fetchMultiOdds(
  eventIds: number[],
  bookmakers: readonly string[] = resolveBookmakers(),
): Promise<OddsIoEventOdds[]> {
  if (!eventIds.length) return [];

  const bm = bookmakers.slice(0, 30).join(",");
  const out: OddsIoEventOdds[] = [];
  const now = Date.now();
  const missing: number[] = [];

  for (const id of eventIds) {
    const hit = oddsCache.get(String(id));
    if (hit && now - hit.at < ODDS_TTL_MS) out.push(hit.value);
    else missing.push(id);
  }

  // /odds/multi aceita até 10 IDs e conta como 1 request
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    const data = await ioFetch<OddsIoEventOdds[] | OddsIoEventOdds>(
      "/odds/multi",
      {
        eventIds: chunk.join(","),
        bookmakers: bm,
      },
    );
    const list = Array.isArray(data) ? data : data ? [data] : [];
    for (const ev of list) {
      oddsCache.set(String(ev.id), { at: Date.now(), value: ev });
      out.push(ev);
    }
  }

  return out;
}

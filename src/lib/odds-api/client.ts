import type {
  OddsApiEventMeta,
  OddsApiEventOdds,
  OddsApiSport,
} from "./types";

const BASE = "https://api.the-odds-api.com/v4";

/** Ligas priorizadas (créditos: 1 por liga com /odds). */
export const PRIORITY_SOCCER_KEYS = [
  "soccer_brazil_campeonato",
  "soccer_brazil_serie_b",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_portugal_primeira_liga",
  "soccer_netherlands_eredivisie",
  "soccer_usa_mls",
  "soccer_mexico_ligamx",
  "soccer_argentina_primera_division",
] as const;

type CacheEntry<T> = { at: number; value: T };

let sportsCache: CacheEntry<OddsApiSport[]> | null = null;
const eventsCache = new Map<string, CacheEntry<OddsApiEventMeta[]>>();
const oddsCache = new Map<string, CacheEntry<OddsApiEventOdds[]>>();

const SPORTS_TTL_MS = 6 * 60 * 60_000;
const EVENTS_TTL_MS = 15 * 60_000;
const ODDS_TTL_MS = 8 * 60_000;

export function getOddsApiKey(): string | null {
  const key = process.env.THE_ODDS_API_KEY?.trim();
  return key || null;
}

async function oddsFetch<T>(path: string): Promise<{
  data: T;
  remaining: number | null;
  used: number | null;
}> {
  const key = getOddsApiKey();
  if (!key) throw new Error("THE_ODDS_API_KEY não configurada");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const remaining = Number(res.headers.get("x-requests-remaining"));
  const used = Number(res.headers.get("x-requests-used"));

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `The Odds API ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }

  const data = (await res.json()) as T;
  return {
    data,
    remaining: Number.isFinite(remaining) ? remaining : null,
    used: Number.isFinite(used) ? used : null,
  };
}

export async function listActiveSoccerSports(): Promise<OddsApiSport[]> {
  const now = Date.now();
  if (sportsCache && now - sportsCache.at < SPORTS_TTL_MS) {
    return sportsCache.value;
  }

  const { data } = await oddsFetch<OddsApiSport[]>("/sports/?all=false");
  const soccer = data.filter(
    (s) => s.active && (s.group === "Soccer" || s.key.startsWith("soccer_")),
  );
  sportsCache = { at: now, value: soccer };
  return soccer;
}

export async function listSportEvents(
  sportKey: string,
): Promise<OddsApiEventMeta[]> {
  const now = Date.now();
  const hit = eventsCache.get(sportKey);
  if (hit && now - hit.at < EVENTS_TTL_MS) return hit.value;

  const { data } = await oddsFetch<OddsApiEventMeta[]>(
    `/sports/${encodeURIComponent(sportKey)}/events`,
  );
  const list = Array.isArray(data) ? data : [];
  eventsCache.set(sportKey, { at: now, value: list });
  return list;
}

export async function fetchSportH2hOdds(
  sportKey: string,
  regions = "eu",
): Promise<{
  events: OddsApiEventOdds[];
  remaining: number | null;
  used: number | null;
}> {
  const cacheKey = `${sportKey}:${regions}:h2h`;
  const now = Date.now();
  const hit = oddsCache.get(cacheKey);
  if (hit && now - hit.at < ODDS_TTL_MS) {
    return { events: hit.value, remaining: null, used: null };
  }

  const qs = new URLSearchParams({
    regions,
    markets: "h2h",
    oddsFormat: "decimal",
  });
  const { data, remaining, used } = await oddsFetch<OddsApiEventOdds[]>(
    `/sports/${encodeURIComponent(sportKey)}/odds/?${qs}`,
  );
  const list = Array.isArray(data) ? data : [];
  oddsCache.set(cacheKey, { at: now, value: list });
  return { events: list, remaining, used };
}

/** Escolhe ligas ativas priorizadas (+ extras se poucas). */
export async function resolveSoccerKeysToScan(limit = 10): Promise<string[]> {
  const active = await listActiveSoccerSports();
  const activeKeys = new Set(active.map((s) => s.key));
  const picked: string[] = [];

  for (const key of PRIORITY_SOCCER_KEYS) {
    if (activeKeys.has(key)) picked.push(key);
    if (picked.length >= limit) break;
  }

  if (picked.length < Math.min(6, limit)) {
    for (const s of active) {
      if (picked.includes(s.key)) continue;
      picked.push(s.key);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

import { parseLiveMinute } from "@/lib/live-minute";
import { BETBRA, getSessionToken } from "./config";
import type {
  BetBraEvent,
  BetBraEventsResponse,
  InplayEvent,
  RadarMap,
} from "./types";

function mexHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    Origin: BETBRA.mexchangeWeb,
    Referer: `${BETBRA.mexchangeWeb}/`,
    Cookie: `session-token=${getSessionToken()}`,
  };
}

function clientHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    Origin: BETBRA.origin,
    Referer: `${BETBRA.origin}/`,
  };
}

async function getJson<T>(url: string, headers: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BetBra ${res.status} ${url} ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export function dayWindowUnix(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  // margem para jogos que cruzam meia-noite
  end.setHours(end.getHours() + 6);

  return {
    after: Math.floor(start.getTime() / 1000),
    before: Math.floor(end.getTime() / 1000),
  };
}

export async function listSoccerEvents(opts?: {
  after?: number;
  before?: number;
  perPage?: number;
  offset?: number;
}): Promise<BetBraEventsResponse> {
  const { after, before } = opts?.after && opts?.before
    ? { after: opts.after, before: opts.before }
    : dayWindowUnix();

  const params = new URLSearchParams({
    offset: String(opts?.offset ?? 0),
    "per-page": String(opts?.perPage ?? 50),
    after: String(after),
    before: String(before),
    "sport-ids": String(BETBRA.sportIds.soccer),
    "sort-by": "volume",
    "sort-direction": "desc",
    "en-market-names": "Match Odds,Correct Score,Both Teams To Score,Total",
    "market-types": "one_x_two,correct_score,both_to_score,total",
  });

  return getJson<BetBraEventsResponse>(
    `${BETBRA.mexchangeApi}/events?${params}`,
    mexHeaders(),
  );
}

export async function getEvent(
  eventId: string,
  priceDepth = 3,
  marketIds?: string[],
): Promise<BetBraEvent> {
  const params = new URLSearchParams({
    "odds-type": "DECIMAL",
  });

  // O book completo de Correct Score (e outros) só vem com market-ids.
  // price-depth sozinho costuma preencher só Match Odds.
  if (marketIds?.length) {
    params.set("market-ids", marketIds.join(","));
  } else {
    params.set("price-depth", String(priceDepth));
  }

  return getJson<BetBraEvent>(
    `${BETBRA.mexchangeApi}/events/${eventId}?${params}`,
    mexHeaders(),
  );
}

/** Busca o evento e hidrata o book do Correct Score + Total (Over) via market-ids. */
export async function getEventWithScoreBook(
  eventId: string,
  priceDepth = 3,
): Promise<BetBraEvent> {
  const base = await getEvent(eventId, priceDepth);
  const markets = base.markets ?? [];
  const cs = markets.find(
    (m) => (m["name-original"] ?? m.name)?.toLowerCase() === "correct score",
  );
  const totals = markets.filter(
    (m) => (m["name-original"] ?? m.name)?.toLowerCase() === "total",
  );

  const needIds: string[] = [];
  const csNeeds =
    cs?.id &&
    !(cs.runners ?? []).some((r) => (r.prices?.length ?? 0) > 0);
  if (csNeeds && cs?.id) needIds.push(cs.id);

  for (const t of totals) {
    if (!t.id) continue;
    const priced = (t.runners ?? []).some((r) => (r.prices?.length ?? 0) > 0);
    if (!priced) needIds.push(t.id);
  }

  if (!needIds.length) return base;

  try {
    const priced = await getEvent(eventId, priceDepth, needIds);
    const pricedById = new Map(
      (priced.markets ?? []).map((m) => [m.id, m] as const),
    );
    return {
      ...base,
      markets: markets.map((m) => pricedById.get(m.id) ?? m),
    };
  } catch {
    return base;
  }
}

let inplayCache: { at: number; data: InplayEvent[] } | null = null;
const INPLAY_CACHE_TTL_MS = 8_000;
let inplayInflight: Promise<InplayEvent[]> | null = null;

function splitEventNames(name: string): [string, string] {
  const parts = name.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2) {
    return [parts[0]!.trim(), parts.slice(1).join(" vs ").trim()];
  }
  return [name.trim(), ""];
}

/**
 * Monta InplayEvent mínimo a partir do evento mexchange (quando o feed de placar falha).
 * NÃO estima minuto por relógio de parede desde o kickoff — atraso de início
 * inventava 90' com o jogo ainda no 1º tempo e liberava Eventos raros cedo.
 * O minuto vem depois do FotMob (liveTime) ou fica null (gates ficam fechados).
 */
export function eventToSyntheticInplay(ev: BetBraEvent): InplayEvent {
  const participants = ev["event-participants"] ?? [];
  const homeP =
    participants.find((p) => Number(p.number) === 1) ?? participants[0];
  const awayP =
    participants.find((p) => Number(p.number) === 2) ?? participants[1];
  const [homeFallback, awayFallback] = splitEventNames(ev.name);

  return {
    eventId: ev.id,
    score: {
      home: {
        name:
          homeP?.["participant-name"] ??
          homeP?.name ??
          homeFallback ??
          "Casa",
      },
      away: {
        name:
          awayP?.["participant-name"] ??
          awayP?.name ??
          awayFallback ??
          "Fora",
      },
    },
    status: "In Play",
    inPlayMatchStatus: "InPlay",
  };
}

async function fetchInplayFeedRaw(): Promise<InplayEvent[]> {
  try {
    const data = await getJson<InplayEvent[]>(
      `${BETBRA.clientApi}/jumper/feedSports/inplay-info`,
      clientHeaders(),
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fallback: eventos soccer com in-running-flag no mexchange (+ placar FotMob se houver). */
async function listInRunningAsInplay(): Promise<InplayEvent[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const res = await listSoccerEvents({
    after: nowSec - 6 * 3600,
    before: nowSec + 90 * 60,
    perPage: 50,
  });
  const base = (res.events ?? [])
    .filter((e) => Boolean(e["in-running-flag"]))
    .map(eventToSyntheticInplay);

  if (!base.length) return base;

  // Hidrata placar + minuto real via FotMob (não usar wall-clock).
  const { getFotmobMatchIntel } = await import("@/lib/fotmob/intel");
  const enriched = await Promise.all(
    base.map(async (ip) => {
      const home = ip.score?.home?.name;
      const away = ip.score?.away?.name;
      if (!home || !away) return ip;
      const ev = (res.events ?? []).find((e) => e.id === ip.eventId);
      const intel = await getFotmobMatchIntel({
        home,
        away,
        start: ev?.start,
      }).catch(() => null);
      if (!intel) return ip;

      const minute = parseLiveMinute(intel.status);
      const minuteStr = minute != null ? String(minute) : undefined;
      const m = intel.scoreLabel
        ?.replace(/\s+/g, "")
        .match(/^(\d+)[-–:](\d+)$/);

      return {
        ...ip,
        score: m
          ? {
              home: { ...ip.score?.home, name: home, score: m[1] },
              away: { ...ip.score?.away, name: away, score: m[2] },
            }
          : ip.score,
        timeElapsed: minuteStr,
        elapsedRegularTime: minuteStr,
        status: intel.status ?? ip.status,
      };
    }),
  );
  return enriched;
}

export async function getInplayInfo(): Promise<InplayEvent[]> {
  const now = Date.now();
  if (inplayCache && now - inplayCache.at < INPLAY_CACHE_TTL_MS) {
    return inplayCache.data;
  }
  if (inplayInflight) return inplayInflight;

  inplayInflight = (async () => {
    let data = await fetchInplayFeedRaw();
    // BetBra tem devolvido [] no inplay-info mesmo com jogos ao vivo no exchange.
    if (!data.length) {
      data = await listInRunningAsInplay().catch(() => []);
    }
    inplayCache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    inplayInflight = null;
  });

  return inplayInflight;
}

export async function getInplayByEventId(
  eventId: string,
): Promise<InplayEvent | null> {
  const list = await getInplayInfo();
  return list.find((e) => e.eventId === eventId) ?? null;
}

export async function getEventsRadar(): Promise<RadarMap[]> {
  return getJson<RadarMap[]>(
    `${BETBRA.clientApi}/jumper/feedSports/inplayInfo/eventsRadar`,
    clientHeaders(),
  );
}

/** Converte o feed live da Bolsa em linhas de estatística casa/fora. */
export function inplayToStatRows(ip: InplayEvent): Array<{
  name: string;
  home: string;
  away: string;
}> {
  const h = ip.score?.home;
  const a = ip.score?.away;
  if (!h || !a) return [];

  const rows: Array<{ name: string; home: string; away: string }> = [
    {
      name: "Placar",
      home: String(h.score ?? "0"),
      away: String(a.score ?? "0"),
    },
    {
      name: "Placar HT",
      home: String(h.halfTimeScore ?? "—"),
      away: String(a.halfTimeScore ?? "—"),
    },
    {
      name: "Escanteios",
      home: String(h.numberOfCorners ?? 0),
      away: String(a.numberOfCorners ?? 0),
    },
    {
      name: "Cartões Amarelos",
      home: String(h.numberOfYellowCards ?? 0),
      away: String(a.numberOfYellowCards ?? 0),
    },
    {
      name: "Cartões Vermelhos",
      home: String(h.numberOfRedCards ?? 0),
      away: String(a.numberOfRedCards ?? 0),
    },
    {
      name: "Cartões (total)",
      home: String(h.numberOfCards ?? 0),
      away: String(a.numberOfCards ?? 0),
    },
  ];

  return rows;
}

export function mexchangeEventUrl(eventId: string, marketId?: string) {
  const base = BETBRA.openExchangeWeb;
  if (marketId) {
    return `${base}/exchange/sport/soccer/event/${eventId}/market/${marketId}`;
  }
  return `${base}/exchange/sport/soccer/event/${eventId}`;
}

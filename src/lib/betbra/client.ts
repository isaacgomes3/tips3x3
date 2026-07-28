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

export async function getInplayInfo(): Promise<InplayEvent[]> {
  return getJson<InplayEvent[]>(
    `${BETBRA.clientApi}/jumper/feedSports/inplay-info`,
    clientHeaders(),
  );
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

export interface OddsHistoryPoint {
  odd: number;
  volume: number;
  matched: number;
  status?: string;
  createdAt: string;
}

export interface OddsHistoryResponse {
  runnerId: string;
  runnerName?: string;
  inPlayAt?: string | null;
  minOdd: number;
  maxOdd: number;
  volume?: number;
  data: OddsHistoryPoint[];
  source: "bolsa-statistics" | "matchbook-historical";
}

const BOLSA_STATS =
  "https://data-center-bolsa-statistics-api.layback.trade/api";
const MATCHBOOK_HIST =
  "https://api-matchbook-historical-data.layback.trade/api";

function historyHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    Origin: "https://mexchange2.bolsadeaposta.bet.br",
    Referer: "https://mexchange2.bolsadeaposta.bet.br/",
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: historyHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`odds-history ${res.status}: ${body.slice(0, 180)}`);
  }
  return res.json() as Promise<T>;
}

function normalize(
  raw: Partial<OddsHistoryResponse> & { data?: OddsHistoryPoint[] },
  source: OddsHistoryResponse["source"],
): OddsHistoryResponse {
  const data = [...(raw.data ?? [])]
    .map((p) => ({
      odd: Number(p.odd) || 0,
      volume: Number(p.volume) || 0,
      matched: Number(p.matched) || 0,
      status: p.status,
      createdAt: p.createdAt,
    }))
    .filter((p) => Boolean(p.createdAt))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  return {
    runnerId: String(raw.runnerId ?? ""),
    runnerName: raw.runnerName,
    inPlayAt: raw.inPlayAt ?? null,
    minOdd: Number(raw.minOdd ?? 0),
    maxOdd: Number(raw.maxOdd ?? 0),
    volume: Number(raw.volume ?? data.at(-1)?.volume ?? 0),
    data,
    source,
  };
}

/**
 * Cache curto (3s) por runner/market: o painel agora faz poll a cada 4s e o
 * APK costuma pedir /api/live em ciclo parecido — sem isso, cada ciclo
 * refaria a mesma chamada externa e a latência (0,8–2,4s) comeria boa
 * parte do ganho de reduzir o intervalo de amostragem.
 */
const HISTORY_CACHE_TTL_MS = 3_000;
const historyCache = new Map<
  string,
  { at: number; promise: Promise<OddsHistoryResponse> }
>();

function historyCacheKey(opts: {
  runnerId: string;
  marketId?: string;
  minutesBefore?: number;
  inPlay?: boolean;
  limit?: number;
}): string {
  return [
    opts.runnerId,
    opts.marketId ?? "",
    opts.minutesBefore ?? 60,
    opts.inPlay ?? false,
    opts.limit ?? 500,
  ].join("|");
}

export async function getOddsHistory(opts: {
  runnerId: string;
  marketId?: string;
  minutesBefore?: number;
  inPlay?: boolean;
  limit?: number;
}): Promise<OddsHistoryResponse> {
  const key = historyCacheKey(opts);
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchOddsHistory(opts);
  historyCache.set(key, { at: Date.now(), promise });
  // Se a chamada falhar, não deixa a entrada quebrada no cache.
  promise.catch(() => historyCache.delete(key));
  return promise;
}

async function fetchOddsHistory(opts: {
  runnerId: string;
  marketId?: string;
  minutesBefore?: number;
  inPlay?: boolean;
  limit?: number;
}): Promise<OddsHistoryResponse> {
  const minutesBefore = opts.minutesBefore ?? 60;
  const limit = opts.limit ?? 500;
  const inPlay = opts.inPlay ?? false;

  if (opts.marketId) {
    try {
      const params = new URLSearchParams({
        provider: "matchbook",
        marketId: opts.marketId,
        runnerId: opts.runnerId,
        minutesBefore: String(minutesBefore),
        inPlay: String(inPlay),
        limit: String(limit),
      });
      const raw = await fetchJson<Partial<OddsHistoryResponse>>(
        `${BOLSA_STATS}/odds-history?${params}`,
      );
      const normalized = normalize(raw, "bolsa-statistics");
      if (normalized.data.length > 0 || normalized.minOdd > 0) {
        return normalized;
      }
    } catch {
      // fallback abaixo
    }
  }

  const params = new URLSearchParams({
    runnerId: opts.runnerId,
    minutesBefore: String(minutesBefore),
    inPlay: String(inPlay),
    limit: String(limit),
  });

  const raw = await fetchJson<Partial<OddsHistoryResponse>>(
    `${MATCHBOOK_HIST}/odds-history?${params}`,
  );
  return normalize(raw, "matchbook-historical");
}

export function summarizeHistory(history: OddsHistoryResponse) {
  const last = history.data.at(-1);
  const totalMatched = history.data.reduce(
    (sum, p) => sum + (Number(p.matched) || 0),
    0,
  );

  return {
    lastOdd: last?.odd ?? history.minOdd ?? null,
    minOdd: history.minOdd || null,
    maxOdd: history.maxOdd || null,
    volume: last?.volume ?? history.volume ?? 0,
    totalMatchedDelta: totalMatched,
    inPlayAt: history.inPlayAt,
    points: history.data.length,
  };
}

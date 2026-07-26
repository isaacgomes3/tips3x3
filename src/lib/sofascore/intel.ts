import { sofascoreFetchJson } from "./browser";
import type { MatchIntel, SofaEventLite, SofaGraphPoint } from "./types";

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeTeamName(name: string) {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(fc|cf|sc|ac|afc|fk|sk|bk|if|ff|united|city|club|de|da|do|the)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(name: string) {
  return new Set(normalizeTeamName(name).split(" ").filter((t) => t.length > 1));
}

/** Similaridade 0–1 entre dois nomes de time. */
export function teamSimilarity(a: string, b: string) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

function dayKeyFromUnix(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function dayKeyFromIso(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function parseStatNumber(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

type StatsResponse = {
  statistics?: Array<{
    period: string;
    groups?: Array<{
      groupName?: string;
      statisticsItems?: Array<{
        name?: string;
        home?: string;
        away?: string;
        homeValue?: number;
        awayValue?: number;
      }>;
    }>;
  }>;
};

type GraphResponse = {
  graphPoints?: SofaGraphPoint[];
  graphPointsV2?: SofaGraphPoint[];
  periodTime?: number;
};

function extractXg(stats: StatsResponse | null) {
  const extras: Array<{ name: string; home: string; away: string }> = [];
  let xgHome: number | null = null;
  let xgAway: number | null = null;
  let period = "ALL";
  let xgPeriodRank = -1;

  const periodRank = (p: string) => {
    const u = p.toUpperCase();
    if (u === "ALL") return 3;
    if (u === "2ND") return 2;
    if (u === "1ST") return 1;
    return 0;
  };

  for (const block of stats?.statistics ?? []) {
    for (const group of block.groups ?? []) {
      for (const item of group.statisticsItems ?? []) {
        const name = item.name ?? "";
        const home = item.home ?? String(item.homeValue ?? "—");
        const away = item.away ?? String(item.awayValue ?? "—");
        if (/expected goals|^xg$/i.test(name)) {
          const rank = periodRank(block.period);
          if (rank >= xgPeriodRank) {
            xgHome = parseStatNumber(item.homeValue ?? item.home);
            xgAway = parseStatNumber(item.awayValue ?? item.away);
            period = block.period;
            xgPeriodRank = rank;
          }
        }
        if (
          /expected goals|big chances|total shots|shots on target|ball possession|dangerous attacks|corner/i.test(
            name,
          )
        ) {
          extras.push({ name, home, away });
        }
      }
    }
  }

  // dedupe by name keeping first (ALL period usually first)
  const seen = new Set<string>();
  const unique = extras.filter((e) => {
    const k = e.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { xgHome, xgAway, period, extras: unique.slice(0, 8) };
}

function pressureSummary(points: SofaGraphPoint[]) {
  if (!points.length) {
    return {
      homeBias: 0,
      awayBias: 0,
      latest: null as number | null,
      summary: "Sem gráfico de pressão disponível para este jogo.",
    };
  }
  let home = 0;
  let away = 0;
  for (const p of points) {
    if (p.value > 0) home += p.value;
    else if (p.value < 0) away += Math.abs(p.value);
  }
  const latest = points[points.length - 1]?.value ?? null;
  const total = home + away || 1;
  const homeShare = home / total;
  let summary: string;
  if (Math.abs(homeShare - 0.5) < 0.08) {
    summary = "Pressão equilibrada no momento.";
  } else if (homeShare > 0.5) {
    summary = `Pressão concentrada no ataque da casa (${Math.round(homeShare * 100)}% do momentum).`;
  } else {
    summary = `Pressão concentrada no ataque do visitante (${Math.round((1 - homeShare) * 100)}% do momentum).`;
  }
  if (latest != null && Math.abs(latest) >= 20) {
    summary +=
      latest > 0
        ? " Pico recente a favor da casa."
        : " Pico recente a favor do visitante.";
  }
  return { homeBias: homeShare, awayBias: 1 - homeShare, latest, summary };
}

export async function listLiveEvents(): Promise<SofaEventLite[]> {
  const data = await sofascoreFetchJson<{ events?: SofaEventLite[] }>(
    "/api/v1/sport/football/events/live",
  );
  return data.events ?? [];
}

export async function listScheduledEvents(dayIso: string): Promise<SofaEventLite[]> {
  const data = await sofascoreFetchJson<{ events?: SofaEventLite[] }>(
    `/api/v1/sport/football/scheduled-events/${dayIso}`,
  );
  return data.events ?? [];
}

export async function findSofaEvent(opts: {
  home: string;
  away: string;
  start?: string;
}): Promise<{ event: SofaEventLite; score: number; matchedBy: string } | null> {
  const day = opts.start ? dayKeyFromIso(opts.start) : new Date().toISOString().slice(0, 10);
  const [live, scheduled] = await Promise.all([
    listLiveEvents().catch(() => [] as SofaEventLite[]),
    listScheduledEvents(day).catch(() => [] as SofaEventLite[]),
  ]);

  const pool = new Map<number, SofaEventLite>();
  for (const e of [...live, ...scheduled]) pool.set(e.id, e);

  let best: { event: SofaEventLite; score: number; matchedBy: string } | null =
    null;

  for (const event of pool.values()) {
    const homeScore = Math.max(
      teamSimilarity(opts.home, event.homeTeam.name),
      teamSimilarity(opts.home, event.homeTeam.shortName ?? ""),
    );
    const awayScore = Math.max(
      teamSimilarity(opts.away, event.awayTeam.name),
      teamSimilarity(opts.away, event.awayTeam.shortName ?? ""),
    );
    // também tenta invertido (às vezes feed troca)
    const homeScoreRev = Math.max(
      teamSimilarity(opts.home, event.awayTeam.name),
      teamSimilarity(opts.home, event.awayTeam.shortName ?? ""),
    );
    const awayScoreRev = Math.max(
      teamSimilarity(opts.away, event.homeTeam.name),
      teamSimilarity(opts.away, event.homeTeam.shortName ?? ""),
    );

    const direct = (homeScore + awayScore) / 2;
    const reversed = (homeScoreRev + awayScoreRev) / 2;
    let score = Math.max(direct, reversed);
    let matchedBy = direct >= reversed ? "nome direto" : "nome invertido";

    if (opts.start && event.startTimestamp) {
      const deltaMin =
        Math.abs(event.startTimestamp * 1000 - new Date(opts.start).getTime()) /
        60_000;
      if (deltaMin <= 30) {
        score += 0.08;
        matchedBy += " + horário";
      } else if (dayKeyFromUnix(event.startTimestamp) === day) {
        score += 0.03;
      } else if (deltaMin > 180) {
        score -= 0.15;
      }
    }

    if (!best || score > best.score) {
      best = { event, score, matchedBy };
    }
  }

  if (!best || best.score < 0.45) return null;
  return best;
}

export async function getMatchIntel(opts: {
  home: string;
  away: string;
  start?: string;
}): Promise<MatchIntel | null> {
  const found = await findSofaEvent(opts);
  if (!found) return null;

  const { event, matchedBy } = found;
  const [graph, stats] = await Promise.all([
    sofascoreFetchJson<GraphResponse>(`/api/v1/event/${event.id}/graph`).catch(
      () => null,
    ),
    sofascoreFetchJson<StatsResponse>(
      `/api/v1/event/${event.id}/statistics`,
    ).catch(() => null),
  ]);

  const points = graph?.graphPointsV2?.length
    ? graph.graphPointsV2
    : (graph?.graphPoints ?? []);
  const { xgHome, xgAway, period, extras } = extractXg(stats);
  const pressure = pressureSummary(points);

  const homeScore = event.homeScore?.current;
  const awayScore = event.awayScore?.current;

  return {
    source: "sofascore",
    sofaEventId: event.id,
    matchName: `${event.homeTeam.name} vs ${event.awayTeam.name}`,
    competition: event.tournament?.name,
    status: event.status?.description ?? event.status?.type,
    scoreLabel:
      homeScore != null && awayScore != null
        ? `${homeScore}-${awayScore}`
        : undefined,
    xg: {
      home: xgHome,
      away: xgAway,
      period,
    },
    pressure: {
      points,
      periodTime: graph?.periodTime,
      ...pressure,
    },
    extras,
    matchedBy,
    sofascoreUrl: `https://www.sofascore.com/event/${event.id}`,
  };
}

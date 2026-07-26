import { teamSimilarity } from "@/lib/sofascore/intel";
import type { MatchIntel, SofaGraphPoint } from "@/lib/sofascore/types";

const FOTMOB_ORIGIN = "https://www.fotmob.com";

type FotmobMatch = {
  id: number;
  leagueId?: number;
  time?: string;
  home?: { id?: number; name?: string; longName?: string; score?: number };
  away?: { id?: number; name?: string; longName?: string; score?: number };
  status?: {
    ongoing?: boolean;
    started?: boolean;
    finished?: boolean;
    scoreStr?: string;
    utcTime?: string;
    liveTime?: { short?: string; long?: string };
  };
};

type FotmobLeague = {
  name?: string;
  ccode?: string;
  matches?: FotmobMatch[];
};

async function fotmobJson<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${FOTMOB_ORIGIN}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: `${FOTMOB_ORIGIN}/`,
      Origin: FOTMOB_ORIGIN,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`FotMob ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

function dayStamp(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, "");
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

function extractXgFromFotmob(details: Record<string, unknown>) {
  const extras: Array<{ name: string; home: string; away: string }> = [];
  let xgHome: number | null = null;
  let xgAway: number | null = null;

  const periods =
    (details as { content?: { stats?: { Periods?: Record<string, unknown> } } })
      .content?.stats?.Periods ?? {};
  const all = (periods.All ?? periods.all ?? []) as Array<{
    title?: string;
    stats?: Array<{ title?: string; stats?: Array<{ title?: string; home?: string; away?: string }> }>;
  }>;

  // FotMob shapes vary: All can be array of groups
  const groups = Array.isArray(all) ? all : [];
  for (const group of groups) {
    const items = group.stats ?? [];
    for (const item of items) {
      // nested again in some payloads
      const nested = item.stats ?? [item];
      for (const row of nested as Array<{
        title?: string;
        home?: string;
        away?: string;
      }>) {
        const title = row.title ?? "";
        if (/expected goals|^xg$/i.test(title)) {
          xgHome = parseFloat(String(row.home ?? "").replace(",", ".")) || null;
          xgAway = parseFloat(String(row.away ?? "").replace(",", ".")) || null;
        }
        if (
          /expected goals|big chances|total shots|shots on target|ball possession|corner/i.test(
            title,
          )
        ) {
          extras.push({
            name: title,
            home: String(row.home ?? "—"),
            away: String(row.away ?? "—"),
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  const unique = extras.filter((e) => {
    const k = e.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { xgHome, xgAway, extras: unique.slice(0, 8) };
}

export async function getFotmobMatchIntel(opts: {
  home: string;
  away: string;
  start?: string;
}): Promise<MatchIntel | null> {
  const day = dayStamp(opts.start);
  const data = await fotmobJson<{ leagues?: FotmobLeague[] }>(
    `/api/data/matches?date=${day}`,
  );

  let best: { match: FotmobMatch; league?: string; score: number; matchedBy: string } | null =
    null;

  for (const league of data.leagues ?? []) {
    for (const match of league.matches ?? []) {
      const homeNames = [match.home?.longName, match.home?.name].filter(
        Boolean,
      ) as string[];
      const awayNames = [match.away?.longName, match.away?.name].filter(
        Boolean,
      ) as string[];
      if (!homeNames.length || !awayNames.length) continue;

      let homeScore = 0;
      let awayScore = 0;
      for (const n of homeNames) homeScore = Math.max(homeScore, teamSimilarity(opts.home, n));
      for (const n of awayNames) awayScore = Math.max(awayScore, teamSimilarity(opts.away, n));
      let homeRev = 0;
      let awayRev = 0;
      for (const n of awayNames) homeRev = Math.max(homeRev, teamSimilarity(opts.home, n));
      for (const n of homeNames) awayRev = Math.max(awayRev, teamSimilarity(opts.away, n));

      const direct = (homeScore + awayScore) / 2;
      const reversed = (homeRev + awayRev) / 2;
      let score = Math.max(direct, reversed);
      let matchedBy = direct >= reversed ? "fotmob nome" : "fotmob nome invertido";

      if (opts.start && match.status?.utcTime) {
        const deltaMin =
          Math.abs(
            new Date(match.status.utcTime).getTime() - new Date(opts.start).getTime(),
          ) / 60_000;
        if (deltaMin <= 30) {
          score += 0.08;
          matchedBy += " + horário";
        }
      }
      if (match.status?.ongoing) score += 0.05;

      if (!best || score > best.score) {
        best = { match, league: league.name, score, matchedBy };
      }
    }
  }

  if (!best || best.score < 0.45) return null;

  const details = await fotmobJson<Record<string, unknown>>(
    `/api/data/matchDetails?matchId=${best.match.id}`,
  );

  const momentum = (
    details as {
      content?: {
        momentum?:
          | boolean
          | {
              main?: { data?: SofaGraphPoint[] };
              data?: SofaGraphPoint[];
            };
      };
    }
  ).content?.momentum;

  const points: SofaGraphPoint[] =
    momentum && typeof momentum === "object"
      ? (momentum.main?.data ?? momentum.data ?? [])
      : [];

  const { xgHome, xgAway, extras } = extractXgFromFotmob(details);
  const pressure = pressureSummary(points);

  const header = details as {
    header?: {
      status?: { scoreStr?: string; liveTime?: { short?: string } };
      teams?: Array<{ name?: string; score?: number }>;
    };
    general?: { matchName?: string };
  };

  const homeName =
    best.match.home?.longName ?? best.match.home?.name ?? opts.home;
  const awayName =
    best.match.away?.longName ?? best.match.away?.name ?? opts.away;
  const scoreLabel =
    header.header?.status?.scoreStr?.replace(/\s+/g, "") ??
    (best.match.home?.score != null && best.match.away?.score != null
      ? `${best.match.home.score}-${best.match.away.score}`
      : undefined);

  return {
    source: "fotmob",
    sofaEventId: best.match.id,
    matchName: `${homeName} vs ${awayName}`,
    competition: best.league,
    status:
      header.header?.status?.liveTime?.short ??
      (best.match.status?.ongoing ? "Ao vivo" : undefined),
    scoreLabel,
    xg: { home: xgHome, away: xgAway, period: "ALL" },
    pressure: {
      points,
      ...pressure,
    },
    extras,
    matchedBy: best.matchedBy,
    sofascoreUrl: `${FOTMOB_ORIGIN}/match/${best.match.id}`,
  };
}

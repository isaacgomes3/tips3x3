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

function translateStatName(title: string): string {
  const t = title.trim();
  const map: Array<[RegExp, string]> = [
    [/ball possession|possession/i, "Posse de Bola (%)"],
    [/expected goals|^xg$/i, "Expected Goals (xG)"],
    [/total shots|shots$/i, "Finalizações"],
    [/shots on target/i, "Finalizações no Gol"],
    [/shots off target|off target/i, "Finalizações para Fora"],
    [/blocked shots|shots blocked/i, "Chutes Bloqueados"],
    [/corners?/i, "Escanteios"],
    [/offsides?/i, "Impedimentos"],
    [/fouls?/i, "Faltas"],
    [/yellow cards?/i, "Cartões Amarelos"],
    [/red cards?/i, "Cartões Vermelhos"],
    [/dangerous attacks?/i, "Ataques Perigosos"],
    [/^attacks?$/i, "Ataques"],
    [/big chances?/i, "Grandes chances"],
    [/accurate passes|passes accurate/i, "Passes certos"],
    [/pass(?:es)? accuracy|accurate pass/i, "Precisão de passe (%)"],
    [/touches in opposition box|touches in opp/i, "Toques na área"],
    [/woodwork|hit woodwork/i, "Traves"],
    [/saves?/i, "Defesas"],
    [/tackles?/i, "Desarmes"],
    [/duels won/i, "Duelos ganhos"],
  ];
  for (const [re, label] of map) {
    if (re.test(t)) return label;
  }
  return t;
}

type FotmobStatRow = {
  title?: string;
  key?: string;
  type?: string;
  home?: string | number | null;
  away?: string | number | null;
  stats?: Array<string | number | null> | FotmobStatRow[];
};

function cellValue(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function extractRowsFromPeriodBlock(block: unknown): Array<{
  name: string;
  home: string;
  away: string;
  key?: string;
}> {
  const out: Array<{ name: string; home: string; away: string; key?: string }> = [];

  // Shape nova: { stats: [ { title, stats: [ rows ] } ] }
  // Shape antiga: [ { title, stats: [ rows ] } ]
  const groups: Array<{ title?: string; stats?: FotmobStatRow[] }> = Array.isArray(block)
    ? (block as Array<{ title?: string; stats?: FotmobStatRow[] }>)
    : block && typeof block === "object" && Array.isArray((block as { stats?: unknown }).stats)
      ? ((block as { stats: Array<{ title?: string; stats?: FotmobStatRow[] }> }).stats)
      : [];

  for (const group of groups) {
    for (const row of group.stats ?? []) {
      if (!row?.title || row.type === "title") continue;

      let home: string | number | null | undefined = row.home;
      let away: string | number | null | undefined = row.away;

      // Shape atual: stats: [homeValue, awayValue]
      if (
        Array.isArray(row.stats) &&
        row.stats.length >= 2 &&
        (typeof row.stats[0] !== "object" || row.stats[0] == null)
      ) {
        home = row.stats[0] as string | number | null;
        away = row.stats[1] as string | number | null;
      }

      // Nested rows (legado)
      if (
        Array.isArray(row.stats) &&
        row.stats.length > 0 &&
        typeof row.stats[0] === "object" &&
        row.stats[0] != null
      ) {
        for (const nested of row.stats as FotmobStatRow[]) {
          if (!nested?.title || nested.type === "title") continue;
          let nh = nested.home;
          let na = nested.away;
          if (
            Array.isArray(nested.stats) &&
            nested.stats.length >= 2 &&
            (typeof nested.stats[0] !== "object" || nested.stats[0] == null)
          ) {
            nh = nested.stats[0] as string | number | null;
            na = nested.stats[1] as string | number | null;
          }
          out.push({
            name: translateStatName(nested.title),
            home: cellValue(nh),
            away: cellValue(na),
            key: nested.key,
          });
        }
        continue;
      }

      out.push({
        name: translateStatName(row.title),
        home: cellValue(home),
        away: cellValue(away),
        key: row.key,
      });
    }
  }

  return out;
}

function extractXgFromFotmob(details: Record<string, unknown>) {
  const periods =
    (details as { content?: { stats?: { Periods?: Record<string, unknown> } } })
      .content?.stats?.Periods ?? {};

  const allBlock = periods.All ?? periods.all ?? periods.FirstHalf ?? periods.firstHalf;
  const rows = extractRowsFromPeriodBlock(allBlock);

  let xgHome: number | null = null;
  let xgAway: number | null = null;
  const extras: Array<{ name: string; home: string; away: string }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const k = row.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    if (/expected goals|^xg$/i.test(row.name) || row.key === "expected_goals") {
      const h = parseFloat(String(row.home).replace(",", "."));
      const a = parseFloat(String(row.away).replace(",", "."));
      xgHome = Number.isFinite(h) ? h : null;
      xgAway = Number.isFinite(a) ? a : null;
    }

    // ignora linhas sem dado útil
    if (row.home === "—" && row.away === "—") continue;

    extras.push({ name: row.name, home: row.home, away: row.away });
  }

  return { xgHome, xgAway, extras };
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

  const detailsWithStats = {
    ...details,
    __allStats: extras,
  } as Record<string, unknown>;

  let rich = null as Awaited<
    ReturnType<typeof import("@/lib/fotmob/rich").buildFotmobRichFromDetails>
  > | null;
  try {
    const { buildFotmobRichFromDetails } = await import("@/lib/fotmob/rich");
    rich = await buildFotmobRichFromDetails(detailsWithStats, best.match.id, {
      home: homeName,
      away: awayName,
      competition: best.league,
    });
  } catch {
    rich = null;
  }

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
    rich,
  };
}

import type { SofaGraphPoint } from "@/lib/sofascore/types";

const FOTMOB_ORIGIN = "https://www.fotmob.com";
const FOTMOB_IMG = "https://images.fotmob.com/image_resources";

export type FotmobGoalMarker = {
  minute: number;
  isHome: boolean;
  player?: string;
};

export type FotmobFormMatch = {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "D" | "L";
  scoreLabel: string;
};

export type FotmobPlayerCard = {
  id: number;
  name: string;
  shortName: string;
  shirtNumber: string;
  rating: number | null;
  x: number;
  y: number;
  isCaptain: boolean;
  goals: number;
  yellow: boolean;
  red: boolean;
  subOutMinute: number | null;
};

export type FotmobLineupSide = {
  id: number;
  name: string;
  formation: string;
  rating: number | null;
  coach: string | null;
  logoUrl: string | null;
  starters: FotmobPlayerCard[];
};

export type FotmobTableRow = {
  idx: number;
  id: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoresStr: string;
  gd: number;
  pts: number;
  qualColor: string | null;
  ongoingScore: string | null;
  highlight: boolean;
  form: Array<"W" | "D" | "L">;
};

export type FotmobRichMatch = {
  matchId: number;
  homeId: number | null;
  awayId: number | null;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeColor: string;
  awayColor: string;
  scoreLabel: string | null;
  status: string | null;
  competition: string | null;
  goals: FotmobGoalMarker[];
  momentum: SofaGraphPoint[];
  topStats: Array<{ name: string; home: string; away: string; key?: string }>;
  allStats: Array<{ name: string; home: string; away: string }>;
  teamForm: { home: FotmobFormMatch[]; away: FotmobFormMatch[] };
  lineup: { home: FotmobLineupSide | null; away: FotmobLineupSide | null } | null;
  table: {
    leagueName: string;
    rows: FotmobTableRow[];
  } | null;
  url: string;
};

const TOP_STAT_KEYS = [
  /ball possession|posse/i,
  /expected goals|^xg$/i,
  /total shots|finaliza/i,
  /touches in opposition|toques na área/i,
  /big chances|grandes chances/i,
  /shots on target|no gol/i,
];

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
  if (!res.ok) throw new Error(`FotMob ${res.status} ${path}`);
  return (await res.json()) as T;
}

function teamLogo(id: number | string | null | undefined) {
  if (id == null || id === "") return null;
  return `${FOTMOB_IMG}/logo/teamlogo/${id}_small.png`;
}

function playerShortName(first?: string, last?: string, full?: string) {
  if (last) return last;
  if (full) {
    const parts = full.trim().split(/\s+/);
    return parts[parts.length - 1] ?? full;
  }
  return first ?? "—";
}

function parseFormSide(raw: unknown): FotmobFormMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((item) => {
    const row = item as {
      resultString?: string;
      score?: string;
      home?: { name?: string };
      away?: { name?: string };
      tooltipText?: {
        homeTeam?: string;
        awayTeam?: string;
        homeScore?: string;
        awayScore?: string;
      };
    };
    const homeName =
      row.tooltipText?.homeTeam ?? row.home?.name ?? "Casa";
    const awayName =
      row.tooltipText?.awayTeam ?? row.away?.name ?? "Fora";
    const homeScore = Number(
      row.tooltipText?.homeScore ?? row.score?.split(/\s*-\s*/)[0] ?? 0,
    );
    const awayScore = Number(
      row.tooltipText?.awayScore ?? row.score?.split(/\s*-\s*/)[1] ?? 0,
    );
    const rs = (row.resultString ?? "D").toUpperCase();
    const result: "W" | "D" | "L" =
      rs === "W" || rs === "L" || rs === "D" ? rs : "D";
    return {
      homeName,
      awayName,
      homeScore: Number.isFinite(homeScore) ? homeScore : 0,
      awayScore: Number.isFinite(awayScore) ? awayScore : 0,
      result,
      scoreLabel: `${Number.isFinite(homeScore) ? homeScore : 0} - ${Number.isFinite(awayScore) ? awayScore : 0}`,
    };
  });
}

function parsePlayer(p: Record<string, unknown>): FotmobPlayerCard {
  const perf = (p.performance ?? {}) as {
    rating?: number;
    events?: Array<{ type?: string; time?: number }> | Record<string, unknown>;
  };
  const layout = (p.verticalLayout ?? p.horizontalLayout ?? {}) as {
    x?: number;
    y?: number;
  };
  const eventList = Array.isArray(perf.events) ? perf.events : [];
  const eventTypes = eventList.map((e) => String(e.type ?? "").toLowerCase());
  const goals = eventTypes.filter((t) => t === "goal" || t === "owngoal").length;
  const subOut = eventList.find((e) =>
    /subbed.?out|substitutionout/i.test(String(e.type ?? "")),
  );

  return {
    id: Number(p.id) || 0,
    name: String(p.name ?? ""),
    shortName: playerShortName(
      p.firstName as string | undefined,
      p.lastName as string | undefined,
      p.name as string | undefined,
    ),
    shirtNumber: String(p.shirtNumber ?? ""),
    rating:
      typeof perf.rating === "number" && Number.isFinite(perf.rating)
        ? perf.rating
        : null,
    x: typeof layout.x === "number" ? layout.x : 0.5,
    y: typeof layout.y === "number" ? layout.y : 0.5,
    isCaptain: Boolean(p.isCaptain),
    goals,
    yellow: eventTypes.some((t) => /yellow/.test(t)),
    red: eventTypes.some((t) => /red/.test(t)),
    subOutMinute:
      typeof subOut?.time === "number" ? subOut.time : null,
  };
}

function parseLineupSide(
  side: Record<string, unknown> | null | undefined,
  fallbackName: string,
): FotmobLineupSide | null {
  if (!side) return null;
  const id = Number(side.id) || 0;
  const coach = side.coach as { name?: string } | undefined;
  const starters = Array.isArray(side.starters)
    ? (side.starters as Record<string, unknown>[]).map(parsePlayer)
    : [];
  return {
    id,
    name: String(side.name ?? fallbackName),
    formation: String(side.formation ?? "—"),
    rating:
      typeof side.rating === "number" && Number.isFinite(side.rating)
        ? side.rating
        : null,
    coach: coach?.name ?? null,
    logoUrl: teamLogo(id || null),
    starters,
  };
}

function pickTopStats(
  all: Array<{ name: string; home: string; away: string; key?: string }>,
) {
  const picked: typeof all = [];
  const used = new Set<string>();
  for (const re of TOP_STAT_KEYS) {
    const row = all.find(
      (r) => !used.has(r.name) && (re.test(r.name) || re.test(r.key ?? "")),
    );
    if (row) {
      picked.push(row);
      used.add(row.name);
    }
  }
  if (picked.length < 4) {
    for (const row of all) {
      if (used.has(row.name)) continue;
      picked.push(row);
      used.add(row.name);
      if (picked.length >= 6) break;
    }
  }
  return picked.slice(0, 6);
}

async function fetchLeagueTable(
  leagueId: string | number | undefined,
  homeId: number | null,
  awayId: number | null,
): Promise<FotmobRichMatch["table"]> {
  if (leagueId == null || leagueId === "") return null;
  try {
    const payload = await fotmobJson<
      Array<{
        data?: {
          leagueName?: string;
          tables?: Array<{
            leagueName?: string;
            table?: {
              all?: Array<Record<string, unknown>>;
            };
          }>;
        };
        teamForm?: Record<string, Array<{ resultString?: string }>>;
      }>
    >(`/api/data/tltable?leagueId=${leagueId}`);

    const block = Array.isArray(payload) ? payload[0] : null;
    if (!block?.data) return null;

    const tables = block.data.tables ?? [];
    let chosen =
      tables.find((t) => {
        const rows = t.table?.all ?? [];
        const ids = new Set(rows.map((r) => Number(r.id)));
        return (
          (homeId != null && ids.has(homeId)) ||
          (awayId != null && ids.has(awayId))
        );
      }) ?? tables[0];

    if (!chosen?.table?.all?.length) return null;

    const formMap = block.teamForm ?? {};
    const rows: FotmobTableRow[] = chosen.table.all.map((r) => {
      const id = Number(r.id) || 0;
      const ongoing = r.ongoing as
        | { hScore?: number; aScore?: number }
        | null
        | undefined;
      const formRaw = formMap[String(id)] ?? formMap[id as unknown as string];
      const form = Array.isArray(formRaw)
        ? formRaw
            .slice(-5)
            .map((f) => {
              const s = String(f.resultString ?? "D").toUpperCase();
              return (s === "W" || s === "L" || s === "D" ? s : "D") as
                | "W"
                | "D"
                | "L";
            })
        : [];
      return {
        idx: Number(r.idx) || 0,
        id,
        name: String(r.shortName ?? r.name ?? "—"),
        played: Number(r.played) || 0,
        wins: Number(r.wins) || 0,
        draws: Number(r.draws) || 0,
        losses: Number(r.losses) || 0,
        scoresStr: String(r.scoresStr ?? "—"),
        gd: Number(r.goalConDiff) || 0,
        pts: Number(r.pts) || 0,
        qualColor: (r.qualColor as string) ?? null,
        ongoingScore:
          ongoing && ongoing.hScore != null && ongoing.aScore != null
            ? `${ongoing.hScore}-${ongoing.aScore}`
            : null,
        highlight: id === homeId || id === awayId,
        form,
      };
    });

    return {
      leagueName:
        chosen.leagueName ?? block.data.leagueName ?? "Classificação",
      rows,
    };
  } catch {
    return null;
  }
}

/** Monta pacote visual FotMob a partir do JSON de matchDetails (+ tabela). */
export async function buildFotmobRichFromDetails(
  details: Record<string, unknown>,
  matchId: number,
  opts?: { home?: string; away?: string; competition?: string },
): Promise<FotmobRichMatch> {
  const content = (details.content ?? {}) as Record<string, unknown>;
  const header = (details.header ?? {}) as {
    teams?: Array<{ id?: number; name?: string; score?: number; imageUrl?: string }>;
    status?: { scoreStr?: string; liveTime?: { short?: string } };
  };
  const general = (details.general ?? {}) as {
    teamColors?: { darkMode?: { home?: string; away?: string } };
    matchName?: string;
  };
  const matchFacts = (content.matchFacts ?? {}) as {
    teamForm?: unknown;
    events?: { events?: Array<Record<string, unknown>> };
  };

  const homeTeam = header.teams?.[0];
  const awayTeam = header.teams?.[1];
  const homeId = homeTeam?.id ?? null;
  const awayId = awayTeam?.id ?? null;
  const homeName = homeTeam?.name ?? opts?.home ?? "Casa";
  const awayName = awayTeam?.name ?? opts?.away ?? "Fora";

  const momentumRaw = content.momentum as
    | boolean
    | { main?: { data?: SofaGraphPoint[] }; data?: SofaGraphPoint[] }
    | undefined;
  const momentum: SofaGraphPoint[] =
    momentumRaw && typeof momentumRaw === "object"
      ? (momentumRaw.main?.data ?? momentumRaw.data ?? [])
      : [];

  const goals: FotmobGoalMarker[] = (matchFacts.events?.events ?? [])
    .filter((e) => String(e.type).toLowerCase() === "goal")
    .map((e) => ({
      minute: Number(e.time) || 0,
      isHome: Boolean(e.isHome),
      player: String(e.nameStr ?? e.fullName ?? ""),
    }));

  // stats já traduzidos pelo caller via extract — aqui reutilizamos Periods bruto se passado em details.__extras
  const allStats =
    (details.__allStats as Array<{ name: string; home: string; away: string }>) ??
    [];
  const topStats = pickTopStats(allStats);

  const formArr = matchFacts.teamForm;
  const teamForm = {
    home: parseFormSide(Array.isArray(formArr) ? formArr[0] : []),
    away: parseFormSide(Array.isArray(formArr) ? formArr[1] : []),
  };

  const lineupRaw = content.lineup as
    | {
        homeTeam?: Record<string, unknown>;
        awayTeam?: Record<string, unknown>;
      }
    | undefined;

  const lineup = lineupRaw
    ? {
        home: parseLineupSide(lineupRaw.homeTeam, homeName),
        away: parseLineupSide(lineupRaw.awayTeam, awayName),
      }
    : null;

  const tableMeta = content.table as { leagueId?: string | number } | undefined;
  const table = await fetchLeagueTable(tableMeta?.leagueId, homeId, awayId);

  const scoreLabel =
    header.status?.scoreStr?.replace(/\s+/g, "") ??
    (homeTeam?.score != null && awayTeam?.score != null
      ? `${homeTeam.score}-${awayTeam.score}`
      : null);

  return {
    matchId,
    homeId,
    awayId,
    homeName,
    awayName,
    homeLogo: homeTeam?.imageUrl ?? teamLogo(homeId),
    awayLogo: awayTeam?.imageUrl ?? teamLogo(awayId),
    homeColor: general.teamColors?.darkMode?.home || "#3C9BDB",
    awayColor: general.teamColors?.darkMode?.away || "#F5C400",
    scoreLabel,
    status: header.status?.liveTime?.short ?? null,
    competition: opts?.competition ?? null,
    goals,
    momentum,
    topStats,
    allStats,
    teamForm,
    lineup,
    table,
    url: `${FOTMOB_ORIGIN}/match/${matchId}`,
  };
}

export { fotmobJson as fotmobFetchJson, FOTMOB_ORIGIN };

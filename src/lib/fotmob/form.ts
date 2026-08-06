import { teamSimilarity } from "@/lib/sofascore/intel";

const FOTMOB_ORIGIN = "https://www.fotmob.com";

type TeamSideStats = {
  teamId: number;
  name: string;
  played: number;
  avgScored: number;
  avgConceded: number;
  homePlayed: number;
  homeAvgScored: number;
  homeAvgConceded: number;
  awayPlayed: number;
  awayAvgScored: number;
  awayAvgConceded: number;
};

export type TeamFormReport = {
  source: "fotmob";
  home: TeamSideStats | null;
  away: TeamSideStats | null;
  /** Média combinada de gols esperados no confronto (casa marca em casa + visitante marca fora). */
  projectedTotalGoals: number | null;
  /** Casa tende a marcar e visitante a sofrer (e/ou o inverso). */
  attackingBias: boolean;
  confirmsHighScoring: boolean;
  detail: string;
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
  if (!res.ok) throw new Error(`FotMob ${res.status} ${path}`);
  return (await res.json()) as T;
}

function dayStamp(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

type FotmobMatchLite = {
  id: number;
  home?: { id?: number; name?: string; longName?: string };
  away?: { id?: number; name?: string; longName?: string };
};

async function findTeamIds(opts: {
  home: string;
  away: string;
  start?: string;
}): Promise<{ homeId: number; awayId: number; homeName: string; awayName: string } | null> {
  const day = dayStamp(opts.start);
  const data = await fotmobJson<{
    leagues?: Array<{ matches?: FotmobMatchLite[] }>;
  }>(`/api/data/matches?date=${day}`);

  let best: {
    score: number;
    homeId: number;
    awayId: number;
    homeName: string;
    awayName: string;
  } | null = null;

  for (const league of data.leagues ?? []) {
    for (const match of league.matches ?? []) {
      const homeName = match.home?.longName ?? match.home?.name ?? "";
      const awayName = match.away?.longName ?? match.away?.name ?? "";
      if (!homeName || !awayName || !match.home?.id || !match.away?.id) continue;

      const direct =
        (teamSimilarity(opts.home, homeName) + teamSimilarity(opts.away, awayName)) /
        2;
      const rev =
        (teamSimilarity(opts.home, awayName) + teamSimilarity(opts.away, homeName)) /
        2;
      const score = Math.max(direct, rev);
      if (!best || score > best.score) {
        if (direct >= rev) {
          best = {
            score,
            homeId: Number(match.home.id),
            awayId: Number(match.away.id),
            homeName,
            awayName,
          };
        } else {
          // nomes invertidos no feed vs nosso evento
          best = {
            score,
            homeId: Number(match.away.id),
            awayId: Number(match.home.id),
            homeName: awayName,
            awayName: homeName,
          };
        }
      }
    }
  }

  if (!best || best.score < 0.45) return null;
  return best;
}

type FixtureRow = {
  home?: { id?: number; name?: string; score?: number };
  away?: { id?: number; name?: string; score?: number };
  status?: { finished?: boolean; cancelled?: boolean; started?: boolean };
  notStarted?: boolean;
};

function summarizeTeamFixtures(
  teamId: number,
  name: string,
  fixtures: FixtureRow[],
  lookback = 8,
): TeamSideStats | null {
  const finished = fixtures
    .filter(
      (f) =>
        f.status?.finished &&
        !f.status?.cancelled &&
        !f.notStarted &&
        f.home?.score != null &&
        f.away?.score != null,
    )
    .slice(-lookback);

  if (!finished.length) return null;

  let scored = 0;
  let conceded = 0;
  let homeN = 0;
  let homeScored = 0;
  let homeConceded = 0;
  let awayN = 0;
  let awayScored = 0;
  let awayConceded = 0;

  for (const f of finished) {
    const isHome = Number(f.home?.id) === teamId;
    const gf = isHome ? Number(f.home?.score) : Number(f.away?.score);
    const ga = isHome ? Number(f.away?.score) : Number(f.home?.score);
    scored += gf;
    conceded += ga;
    if (isHome) {
      homeN += 1;
      homeScored += gf;
      homeConceded += ga;
    } else {
      awayN += 1;
      awayScored += gf;
      awayConceded += ga;
    }
  }

  const n = finished.length;
  return {
    teamId,
    name,
    played: n,
    avgScored: scored / n,
    avgConceded: conceded / n,
    homePlayed: homeN,
    homeAvgScored: homeN ? homeScored / homeN : 0,
    homeAvgConceded: homeN ? homeConceded / homeN : 0,
    awayPlayed: awayN,
    awayAvgScored: awayN ? awayScored / awayN : 0,
    awayAvgConceded: awayN ? awayConceded / awayN : 0,
  };
}

async function loadTeamFixtures(teamId: number): Promise<FixtureRow[]> {
  const data = await fotmobJson<{
    fixtures?: {
      allFixtures?: {
        fixtures?: FixtureRow[];
        allMatches?: FixtureRow[];
      };
    };
  }>(`/api/data/teams?id=${teamId}`);
  const block = data.fixtures?.allFixtures;
  return block?.fixtures ?? block?.allMatches ?? [];
}

/**
 * Lê histórico recente de gols marcados/sofridos e fator casa/fora via FotMob.
 * Usado para não descartar lay alta (RISCO) quando o jogo tende a ter gols.
 */
export async function analyzeTeamForm(opts: {
  home: string;
  away: string;
  start?: string;
}): Promise<TeamFormReport | null> {
  const ids = await findTeamIds(opts).catch(() => null);
  if (!ids) return null;

  const [homeFx, awayFx] = await Promise.all([
    loadTeamFixtures(ids.homeId).catch(() => [] as FixtureRow[]),
    loadTeamFixtures(ids.awayId).catch(() => [] as FixtureRow[]),
  ]);

  const home = summarizeTeamFixtures(ids.homeId, ids.homeName, homeFx);
  const away = summarizeTeamFixtures(ids.awayId, ids.awayName, awayFx);
  if (!home || !away) {
    return {
      source: "fotmob",
      home,
      away,
      projectedTotalGoals: null,
      attackingBias: false,
      confirmsHighScoring: false,
      detail: "Histórico de gols insuficiente nos times.",
    };
  }

  // Projeção: gols da casa em casa + gols do visitante fora
  // fallback para média geral se split casa/fora fraco
  const homeAttack =
    home.homePlayed >= 2 ? home.homeAvgScored : home.avgScored;
  const awayAttack =
    away.awayPlayed >= 2 ? away.awayAvgScored : away.avgScored;
  const homeDefend =
    home.homePlayed >= 2 ? home.homeAvgConceded : home.avgConceded;
  const awayDefend =
    away.awayPlayed >= 2 ? away.awayAvgConceded : away.avgConceded;

  const projectedTotalGoals =
    (homeAttack + awayDefend) / 2 + (awayAttack + homeDefend) / 2;

  const attackingBias =
    homeAttack >= 1.2 ||
    awayAttack >= 1.1 ||
    homeDefend >= 1.2 ||
    awayDefend >= 1.2;

  // Confirma jogo aberto / com gols — suficiente para não descartar lay alta
  const confirmsHighScoring =
    projectedTotalGoals >= 2.35 ||
    (home.avgScored + away.avgScored >= 2.4 &&
      home.avgConceded + away.avgConceded >= 2.2) ||
    (attackingBias && projectedTotalGoals >= 2.1);

  const detail = confirmsHighScoring
    ? `Forma ok: projeção ~${projectedTotalGoals.toFixed(1)} gols · casa ${homeAttack.toFixed(1)} GF / ${homeDefend.toFixed(1)} GA (casa) · fora ${awayAttack.toFixed(1)} GF / ${awayDefend.toFixed(1)} GA (fora).`
    : `Forma fraca p/ 3-3: projeção ~${projectedTotalGoals.toFixed(1)} gols (casa ${homeAttack.toFixed(1)}/${homeDefend.toFixed(1)}, fora ${awayAttack.toFixed(1)}/${awayDefend.toFixed(1)}).`;

  return {
    source: "fotmob",
    home,
    away,
    projectedTotalGoals,
    attackingBias,
    confirmsHighScoring,
    detail,
  };
}

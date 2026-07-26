export type SofaGraphPoint = {
  minute: number;
  value: number;
};

export type SofaEventLite = {
  id: number;
  startTimestamp?: number;
  homeTeam: { id?: number; name: string; shortName?: string };
  awayTeam: { id?: number; name: string; shortName?: string };
  tournament?: { name?: string; category?: { name?: string } };
  status?: { type?: string; description?: string };
  homeScore?: { current?: number };
  awayScore?: { current?: number };
};

export type MatchIntel = {
  source: "sofascore";
  sofaEventId: number;
  matchName: string;
  competition?: string;
  status?: string;
  scoreLabel?: string;
  xg: {
    home: number | null;
    away: number | null;
    period: string;
  };
  pressure: {
    points: SofaGraphPoint[];
    periodTime?: number;
    homeBias: number;
    awayBias: number;
    latest: number | null;
    summary: string;
  };
  extras: Array<{ name: string; home: string; away: string }>;
  matchedBy: string;
  sofascoreUrl: string;
};

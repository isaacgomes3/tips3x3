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
  source: "sofascore" | "fotmob";
  sofaEventId: number;
  matchName: string;
  competition?: string;
  status?: string;
  /** Relógio oficial dos acréscimos, quando a FotMob informa o total concedido. */
  stoppage?: {
    active: boolean;
    addedTime: number | null;
    elapsed: number | null;
    maxTime: number | null;
    raw: string | null;
  };
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
  /** Pacote visual FotMob (lineup/form/table/momentum). Só quando source=fotmob. */
  rich?: import("@/lib/fotmob/rich").FotmobRichMatch | null;
};

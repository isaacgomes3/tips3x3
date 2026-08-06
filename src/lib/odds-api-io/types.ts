export type OddsIoSport = { name: string; slug: string };
export type OddsIoLeague = { name: string; slug: string };

export type OddsIoEvent = {
  id: number;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
  date: string;
  status?: string;
  bookmakerCount?: number;
  sport?: OddsIoSport;
  league?: OddsIoLeague;
};

export type OddsIoLine = {
  home?: string;
  draw?: string;
  away?: string;
  homeLink?: string;
  drawLink?: string;
  awayLink?: string;
  hdp?: number;
  max?: number;
  over?: string;
  under?: string;
};

export type OddsIoMarket = {
  name: string;
  odds: OddsIoLine[];
  updatedAt?: string;
};

/** Resposta /odds e /odds/multi */
export type OddsIoEventOdds = {
  id: number;
  home: string;
  away: string;
  date: string;
  status?: string;
  sport?: OddsIoSport;
  league?: OddsIoLeague;
  bookmakers: Record<string, OddsIoMarket[]>;
  urls?: Record<string, string>;
};

export type OddsApiOutcome = {
  name: string;
  price: number;
};

export type OddsApiMarket = {
  key: string;
  last_update?: string;
  outcomes: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsApiMarket[];
};

export type OddsApiEventOdds = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
};

export type OddsApiEventMeta = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

export type OddsApiSport = {
  key: string;
  group: string;
  title: string;
  description?: string;
  active: boolean;
  has_outrights?: boolean;
};

export type PriceSide = "back" | "lay";

export interface BetBraPrice {
  currency?: string;
  odds: number;
  side: PriceSide;
  "available-amount"?: number;
  "odds-type"?: string;
  "decimal-odds"?: number;
  "exchange-type"?: string;
}

export interface BetBraRunner {
  id: string;
  name: string;
  status?: string;
  volume?: number;
  prices?: BetBraPrice[];
  locked?: boolean;
  "event-id"?: string;
  "market-id"?: string;
  "last-matched-odds"?: number;
  "last-price-update-time"?: string;
  "event-participant-id"?: string;
}

export interface BetBraMarket {
  id: string;
  name: string;
  live?: boolean;
  product?: string;
  start?: string;
  status?: string;
  type?: string;
  volume?: number;
  runners?: BetBraRunner[];
  "name-original"?: string;
  "event-id"?: string;
  "market-type"?: string;
  "in-running-flag"?: boolean;
  "allow-live-betting"?: boolean;
}

export interface BetBraParticipant {
  id?: string;
  name?: string;
  "participant-name"?: string;
  "participant-id"?: string;
  "number"?: number;
}

export interface BetBraMetaTag {
  id?: string;
  name?: string;
  type?: string;
  "url-name"?: string;
}

export interface BetBraEvent {
  id: string;
  name: string;
  start: string;
  status?: string;
  volume?: number;
  markets?: BetBraMarket[];
  "sport-id"?: number | string;
  "in-running-flag"?: boolean;
  "allow-live-betting"?: boolean;
  "event-participants"?: BetBraParticipant[];
  "meta-tags"?: BetBraMetaTag[];
  lastUpdated?: string;
}

export interface BetBraEventsResponse {
  offset: number;
  total: number;
  events: BetBraEvent[];
  lastUpdated?: string;
  "per-page"?: number;
}

export interface InplayScoreSide {
  name?: string;
  score?: string;
  halfTimeScore?: string;
  fullTimeScore?: string;
  numberOfYellowCards?: number;
  numberOfRedCards?: number;
  numberOfCards?: number;
  numberOfCorners?: number;
}

export interface InplayEvent {
  eventId: string;
  score?: {
    home?: InplayScoreSide;
    away?: InplayScoreSide;
    numberOfYellowCards?: number;
    numberOfRedCards?: number;
    numberOfCorners?: number;
  };
  timeElapsed?: string;
  elapsedRegularTime?: string;
  status?: string;
  inPlayMatchStatus?: string;
  updateDetails?: Array<{
    updateTime?: string;
    team?: string;
    teamName?: string;
    matchTime?: string;
    elapsedRegularTime?: string;
    type?: string;
    updateType?: string;
    updateId?: string;
  }>;
}

export interface RadarMap {
  eventIdMbook: string;
  eventIdSportRadar: string;
}

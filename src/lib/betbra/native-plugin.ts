"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type BetBraSessionStatus = {
  connected: boolean;
  hasToken: boolean;
};

export type BetBraBalanceResult = {
  ok: boolean;
  connected?: boolean;
  balance?: number;
  currency?: string;
  error?: string;
};

export type BetBraOffersResult = {
  ok: boolean;
  connected?: boolean;
  count?: number;
  openCount?: number;
  summary?: string;
  raw?: string;
  error?: string;
};

export type BetBraPlaceLayOptions = {
  eventId: string;
  score: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
  stakePct?: number;
  liability?: number;
  at?: number;
};

export type BetBraPlaceLayResult = {
  ok: boolean;
  error?: string;
  status?: number;
  stake?: number;
  odds?: number;
  liability?: number;
  requestedLiability?: number;
  bumped?: boolean;
  marketId?: string;
  runnerId?: string;
  score?: string;
  eventId?: string;
  mexchangeUrl?: string;
  data?: string;
};

export type BetBraPlaceBackOptions = {
  eventId: string;
  score?: string;
  backOdds: number;
  stake: number;
  marketId?: string;
  runnerId?: string;
  at?: number;
};

export type BetBraPlaceBackResult = {
  ok: boolean;
  error?: string;
  status?: number;
  stake?: number;
  odds?: number;
  marketId?: string;
  runnerId?: string;
  score?: string;
  eventId?: string;
  data?: string;
};

export interface BetBraPlugin {
  openLogin(options?: { url?: string }): Promise<BetBraSessionStatus>;
  getSessionStatus(): Promise<BetBraSessionStatus>;
  getBalance(): Promise<BetBraBalanceResult>;
  listOffers(): Promise<BetBraOffersResult>;
  placeLay(options: BetBraPlaceLayOptions): Promise<BetBraPlaceLayResult>;
  placeBack(options: BetBraPlaceBackOptions): Promise<BetBraPlaceBackResult>;
  addListener(
    eventName: "sessionChanged",
    listenerFunc: (status: BetBraSessionStatus) => void,
  ): Promise<PluginListenerHandle>;
}

export const BetBra = registerPlugin<BetBraPlugin>("BetBra");

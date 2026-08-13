"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "@/lib/native-alerts";

export type AutoLayStatus = {
  autoOn?: boolean;
  running?: boolean;
  ok?: boolean;
  managedInApk?: boolean;
  surebetEdition?: boolean;
  bolsaOnly?: boolean;
  exchangeDisplayName?: string;
  lucroCertoOn?: boolean;
  reservedLucroCerto?: number;
};

export type AutoLaySettings = {
  autoOn: boolean;
  lay3x3On: boolean;
  eventosRarosOn: boolean;
  lucroCertoOn: boolean;
  layOverLimitPressureOn?: boolean;
  qovOn?: boolean;
  /** % da banca por entrada LOLP (pontos: 5 = 5%). */
  stakeLolpPct?: number;
  /** Lucro alvo LOLP (pontos: 1 = 1%). */
  lolpProfitPct?: number;
  /** % da banca por entrada QOV — filtro independente do Lay 3x3. */
  stakeQovPct?: number;
  over35On?: boolean;
  over45On?: boolean;
  /** % da banca Lay Over 3.5 — filtro independente. */
  stakeOver35Pct?: number;
  /** % da banca Lay Over 4.5 — filtro independente do Over 3.5. */
  stakeOver45Pct?: number;
  stakeLay3x3Pct: number;
  /** Stake fixa Eventos raros (responsabilidade R$) — igual ao Lucro certo. */
  stakeFixedEr: number;
  /** Stake fixa Lucro certo (responsabilidade R$). */
  stakeFixedLc: number;
  /** Carteira isolada LC — não entra em 3x3 / Eventos raros. */
  reservedLucroCerto: number;
  profitPctPoints: number;
  apiBase?: string;
};

export type ActiveTradeSnapshot = {
  ok?: boolean;
  /** Entrada confirmada (Lay casado + valores exatos). */
  active?: boolean;
  /** Lay no book ainda sem match — não mostrar stake como entrada. */
  pending?: boolean;
  matched?: boolean;
  eventId?: string;
  eventName?: string;
  score?: string;
  layOdds?: number;
  layStake?: number;
  liability?: number;
  marketId?: string;
  runnerId?: string;
  targetBack?: number;
  backStake?: number;
  profitFrac?: number;
  phase?: string;
  at?: number;
  offerId?: string;
  betId?: string;
  error?: string;
};

interface AutoLayPlugin {
  openSettings(): Promise<{ ok?: boolean }>;
  syncSettings(options: AutoLaySettings): Promise<AutoLayStatus>;
  start(): Promise<AutoLayStatus>;
  stop(): Promise<AutoLayStatus>;
  getStatus(): Promise<AutoLayStatus>;
  getActiveTrade(): Promise<ActiveTradeSnapshot>;
}

const AutoLay = registerPlugin<AutoLayPlugin>("AutoLay");

export async function openAutoLaySettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const result = await AutoLay.openSettings();
    return result?.ok !== false;
  } catch {
    return false;
  }
}

/** Cache: FGS a correr → WebView não deve placeLay (evita ordem dupla). */
let bgActive = false;

export function isAutoLayBgActive(): boolean {
  return bgActive;
}

export async function refreshAutoLayBgStatus(): Promise<boolean> {
  if (!isNativeApp()) {
    bgActive = false;
    return false;
  }
  try {
    const s = await AutoLay.getStatus();
    bgActive = Boolean(s.running || s.autoOn);
    return bgActive;
  } catch {
    bgActive = false;
    return false;
  }
}

export async function getAutoLayNativeStatus(): Promise<AutoLayStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await AutoLay.getStatus();
  } catch {
    return null;
  }
}

export async function fetchActiveTrade(): Promise<ActiveTradeSnapshot | null> {
  if (!isNativeApp()) return null;
  try {
    const t = await AutoLay.getActiveTrade();
    // matched (active) ou ainda aguardando casar (pending)
    if (!t?.active && !t?.pending) return null;
    return t;
  } catch {
    return null;
  }
}

/**
 * Compatibilidade com telas antigas: o painel não envia nem altera qualquer
 * preferência operacional. O APK é a única fonte de verdade.
 */
export async function syncAutoLayBackground(
  _overrides?: Partial<AutoLaySettings>,
): Promise<boolean> {
  void _overrides;
  if (!isNativeApp()) return false;
  try {
    const res = await AutoLay.getStatus();
    bgActive = Boolean(res.running || res.autoOn);
    return bgActive;
  } catch {
    bgActive = false;
    return false;
  }
}

/** Acorda o serviço após reconectar, sem mudar Auto Lay, filtros ou gestão. */
export async function wakeAutoLayBackground(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await AutoLay.start();
    bgActive = Boolean(res.running || res.autoOn);
    return bgActive;
  } catch {
    return false;
  }
}

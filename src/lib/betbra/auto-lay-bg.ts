"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "@/lib/native-alerts";
import {
  getNativeEventosRarosStake,
  getNativeLay1x1StakePct,
  getNativeLay3x3StakePct,
  getNativeLucroCertoStake,
  getNativeOver45StakePct,
  getNativeOverStakePct,
  getNativeQovStakePct,
  getNativeReservedLucroCerto,
} from "@/lib/betbra/native-lay";
import {
  getLolpStakePct,
  getLolpTargetProfitPct,
} from "@/lib/analysis/lay-over-limit-pressure";
import { getTargetProfitPctPoints } from "@/lib/panel-settings";
import {
  isEventosRarosEnabled,
  isLay1x1Enabled,
  isLay3x3Enabled,
  isLayOverLimitPressureEnabled,
  isLucroCertoEnabled,
  isOver35Enabled,
  isOver45Enabled,
  isQovEnabled,
} from "@/lib/strategy-settings";
import { LAY_1X1 } from "@/lib/analysis/lay-1x1";

/** Mesma key que bolsa-bridge — evita import circular. */
function readAutoOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("tips3x3-ext-auto-send") === "1";
  } catch {
    return false;
  }
}

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
  /** Lay 1x1 — favorito 1x0 com pressão → lay placar exato 1-1. */
  lay1x1On?: boolean;
  /** Faixa de odd lay aceita pelo Lay 1x1 (pontos: ex. 150 = 1.50). */
  lay1x1OddsMin?: number;
  lay1x1OddsMax?: number;
  /** % da banca por entrada Lay 1x1 (pontos: 5 = 5%). */
  stakeLay1x1Pct?: number;
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
 * Crédito zerado desliga o Auto Lay. Falha de rede mantém ligado — não
 * queremos parar o cliente por instabilidade do painel.
 */
async function walletBlocksAuto(): Promise<boolean> {
  try {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as { wallet?: { blocked?: boolean } };
    return Boolean(json.wallet?.blocked);
  } catch {
    return false;
  }
}

/** Sincroniza prefs + inicia/para o Foreground Service. */
export async function syncAutoLayBackground(
  overrides?: Partial<AutoLaySettings>,
): Promise<boolean> {
  if (!isNativeApp()) return false;
  const wantsAuto = overrides?.autoOn ?? readAutoOn();
  const blocked = wantsAuto ? await walletBlocksAuto() : false;
  const settings: AutoLaySettings = {
    autoOn: blocked ? false : wantsAuto,
    lay3x3On: overrides?.lay3x3On ?? isLay3x3Enabled(),
    eventosRarosOn: overrides?.eventosRarosOn ?? isEventosRarosEnabled(),
    lucroCertoOn: overrides?.lucroCertoOn ?? isLucroCertoEnabled(),
    layOverLimitPressureOn:
      overrides?.layOverLimitPressureOn ?? isLayOverLimitPressureEnabled(),
    lay1x1On: overrides?.lay1x1On ?? isLay1x1Enabled(),
    lay1x1OddsMin:
      overrides?.lay1x1OddsMin ??
      Math.round(LAY_1X1.oddsBand.min * 100),
    lay1x1OddsMax:
      overrides?.lay1x1OddsMax ??
      Math.round(LAY_1X1.oddsBand.max * 100),
    stakeLay1x1Pct:
      overrides?.stakeLay1x1Pct ?? getNativeLay1x1StakePct(),
    qovOn: overrides?.qovOn ?? isQovEnabled(),
    // Nativo trabalha em pontos (5 = 5%); o painel guarda fração.
    stakeLolpPct: overrides?.stakeLolpPct ?? getLolpStakePct() * 100,
    lolpProfitPct: overrides?.lolpProfitPct ?? getLolpTargetProfitPct() * 100,
    // QOV é um filtro independente — % de banca própria (não herda do 3x3).
    stakeQovPct: overrides?.stakeQovPct ?? getNativeQovStakePct(),
    over35On: overrides?.over35On ?? isOver35Enabled(),
    over45On: overrides?.over45On ?? isOver45Enabled(),
    // Over 3.5 e Over 4.5 são filtros independentes, cada um com sua % própria.
    stakeOver35Pct: overrides?.stakeOver35Pct ?? getNativeOverStakePct(),
    stakeOver45Pct: overrides?.stakeOver45Pct ?? getNativeOver45StakePct(),
    stakeLay3x3Pct: overrides?.stakeLay3x3Pct ?? getNativeLay3x3StakePct(),
    stakeFixedEr: overrides?.stakeFixedEr ?? getNativeEventosRarosStake(),
    stakeFixedLc: overrides?.stakeFixedLc ?? getNativeLucroCertoStake(),
    reservedLucroCerto:
      overrides?.reservedLucroCerto ?? getNativeReservedLucroCerto(),
    profitPctPoints: overrides?.profitPctPoints ?? getTargetProfitPctPoints(),
    apiBase: overrides?.apiBase ?? "https://tips3x3.com",
  };
  try {
    const res = await AutoLay.syncSettings(settings);
    bgActive = Boolean(settings.autoOn && (res.running || res.ok !== false));
    return bgActive;
  } catch {
    bgActive = false;
    return false;
  }
}

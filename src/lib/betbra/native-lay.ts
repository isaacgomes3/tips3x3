"use client";

import { isNativeApp, nativeNotify } from "@/lib/native-alerts";
import {
  getTargetProfitPctPoints,
  profitPointsToDecimal,
} from "@/lib/panel-settings";
import {
  BetBra,
  type BetBraPlaceLayResult,
  type BetBraSessionStatus,
} from "@/lib/betbra/native-plugin";

/** Espelho leve de trade-plan (evita puxar análise inteira no bundle do APK). */
function targetBackForLiabilityProfit(
  layOdds: number,
  targetPct: number,
): number | null {
  if (!Number.isFinite(layOdds) || layOdds <= 1) return null;
  const denom = 1 - targetPct * (layOdds - 1);
  if (denom <= 0.05) return null;
  return Math.round((layOdds / denom) * 100) / 100;
}

function greenBackStake(layStake: number, layOdds: number, backOdds: number) {
  if (!(backOdds > 0) || !(layStake > 0) || !(layOdds > 1)) return null;
  return (layStake * layOdds) / backOdds;
}

export type NativeHoldLayPayload = {
  eventId: string;
  score?: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
  exitMode?: "hold" | "green";
  /** Odd Back alvo (Lay 3x3 green). Se omitido, calcula pelo % lucro. */
  targetBackOdds?: number;
  /** Fração (0.005 = 0,5%). */
  targetProfitPct?: number;
  /** % da banca para Lay 3x3 (default 20). */
  stakePct?: number;
  at?: number;
};

const LAY3X3_STAKE_KEY = "tips3x3-stake-lay3x3-pct";
const DEFAULT_LAY3X3_STAKE_PCT = 20;

export function getNativeLay3x3StakePct(): number {
  if (typeof window === "undefined") return DEFAULT_LAY3X3_STAKE_PCT;
  try {
    const raw = window.localStorage.getItem(LAY3X3_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_LAY3X3_STAKE_PCT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LAY3X3_STAKE_PCT;
    return Math.min(100, Math.max(1, n));
  } catch {
    return DEFAULT_LAY3X3_STAKE_PCT;
  }
}

/** Mensagem curta a partir do JSON/erro bruto da BetBra. */
function humanizeLayError(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "Falha ao enviar Lay";
  const upper = s.toUpperCase();
  if (upper.includes("INSUFFICIENT_FUNDS") || upper.includes("INSUFFICIENT_BUNDS")) {
    const m = s.match(/"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const value = m ? Number(m[1]) : NaN;
    if (Number.isFinite(value) && value > 0) {
      return `Saldo insuficiente na Exchange (pedido ~R$ ${value.toFixed(2)}). Cancele ofertas abertas ou use % menor.`;
    }
    return "Saldo insuficiente na Exchange. Cancele ofertas abertas ou use % menor da banca.";
  }
  if (/unable to resolve host|no address associated/i.test(s)) {
    return "Sem rede/DNS para a API BetBra. Confira Wi‑Fi/4G e tente Reconectar.";
  }
  if (upper.includes("UNAUTHORIZED") || /"status"\s*:\s*401/.test(s)) {
    return "Sessão BetBra expirada ou fundos insuficientes — toque em Reconectar / Atualizar.";
  }
  // Evita dump de JSON enorme no card da Bolsa
  if (s.startsWith("{") && s.length > 120) {
    try {
      const data = JSON.parse(s) as {
        detail?: string;
        title?: string;
        properties?: { messageDetail?: string; value?: number };
      };
      const detail = data.detail || data.properties?.messageDetail || data.title || "";
      if (detail) return humanizeLayError(detail);
    } catch {
      /* keep */
    }
    return s.slice(0, 160);
  }
  return s.length > 200 ? s.slice(0, 200) : s;
}

/** v3: default 99% (Eventos raros hold — folga contra INSUFFICIENT_FUNDS). */
const STAKE_PCT_KEY = "tips3x3-native-stake-pct-v3";
const DEFAULT_STAKE_PCT = 99;
const LAST_RESULT_KEY = "tips3x3-native-lay-last";
const SESSION_TTL_MS = 5 * 60_000;
const STALE_MS = 45_000;

export type NativeLayLastResult = {
  at: number;
  ok: boolean;
  message: string;
  eventId?: string;
  score?: string;
  odds?: number;
  liability?: number;
};

let cachedSession: { status: BetBraSessionStatus; at: number } | null = null;
let lastResult: NativeLayLastResult | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeNativeLay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNativeStakePct(): number {
  if (typeof window === "undefined") return DEFAULT_STAKE_PCT;
  try {
    const raw = window.localStorage.getItem(STAKE_PCT_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_STAKE_PCT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_STAKE_PCT;
    return Math.min(100, Math.max(1, n));
  } catch {
    return DEFAULT_STAKE_PCT;
  }
}

export function setNativeStakePct(pct: number) {
  if (typeof window === "undefined") return;
  const n = Math.min(100, Math.max(1, Number(pct) || DEFAULT_STAKE_PCT));
  try {
    window.localStorage.setItem(STAKE_PCT_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

export function getNativeLayLastResult(): NativeLayLastResult | null {
  if (lastResult) return lastResult;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    lastResult = JSON.parse(raw) as NativeLayLastResult;
    return lastResult;
  } catch {
    return null;
  }
}

function setLastResult(result: NativeLayLastResult) {
  lastResult = result;
  try {
    window.sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
  } catch {
    /* ignore */
  }
  emit();
}

export function isBetBraSessionFresh(): boolean {
  if (!cachedSession?.status.connected) return false;
  return Date.now() - cachedSession.at < SESSION_TTL_MS;
}

export function getCachedBetBraSession(): BetBraSessionStatus | null {
  return cachedSession?.status ?? null;
}

export async function refreshBetBraSession(): Promise<BetBraSessionStatus> {
  if (!isNativeApp()) {
    const status = { connected: false, hasToken: false };
    cachedSession = { status, at: Date.now() };
    emit();
    return status;
  }
  const status = await BetBra.getSessionStatus();
  cachedSession = { status, at: Date.now() };
  emit();
  return status;
}

export async function openBetBraLogin(): Promise<BetBraSessionStatus> {
  if (!isNativeApp()) {
    return { connected: false, hasToken: false };
  }
  // Exchange — sportsbook sozinho não gera session-token da Bolsa.
  const status = await BetBra.openLogin({
    url: "https://betbra.bet.br/b/exchange/sport/soccer",
  });
  cachedSession = { status, at: Date.now() };
  emit();
  return status;
}

export type BetBraBalanceSnapshot = {
  balance: number | null;
  error?: string;
};

export async function fetchBetBraBalance(): Promise<number | null> {
  const snap = await fetchBetBraBalanceSnapshot();
  return snap.balance;
}

export async function fetchBetBraBalanceSnapshot(): Promise<BetBraBalanceSnapshot> {
  if (!isNativeApp()) return { balance: null };
  try {
    const res = await BetBra.getBalance();
    if (res.ok && typeof res.balance === "number") {
      return { balance: res.balance };
    }
    const raw = res.error || "Saldo não encontrado";
    // API /account etc. dá 404 na BetBra — mensagem curta p/ o usuário
    const error = /HTTP 404|API sem saldo/i.test(raw)
      ? "Não deu para ler o saldo na Exchange. Toque Reconectar, espere a Bolsa carregar e Pronto."
      : raw;
    return { balance: null, error };
  } catch (e) {
    return {
      balance: null,
      error: e instanceof Error ? e.message : "Erro ao ler saldo",
    };
  }
}

export type BetBraOffersSnapshot = {
  count: number;
  openCount: number;
  summary: string;
};

export async function fetchBetBraOffers(): Promise<BetBraOffersSnapshot | null> {
  if (!isNativeApp()) return null;
  try {
    const res = await BetBra.listOffers();
    if (!res.ok) return null;
    return {
      count: typeof res.count === "number" ? res.count : 0,
      openCount: typeof res.openCount === "number" ? res.openCount : 0,
      summary: res.summary ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Executa Lay hold (Eventos raros) via plugin nativo.
 * Retorna null se não for APK / não aplicável.
 */
export async function executeNativeHoldLay(
  payload: NativeHoldLayPayload,
): Promise<BetBraPlaceLayResult | null> {
  if (!isNativeApp()) return null;
  if (payload.exitMode !== "hold") return null;

  const at = payload.at ?? Date.now();
  if (Date.now() - at > STALE_MS) {
    const failed: BetBraPlaceLayResult = {
      ok: false,
      error: "Sinal expirado (>45s)",
    };
    setLastResult({
      at: Date.now(),
      ok: false,
      message: failed.error!,
      eventId: payload.eventId,
      score: payload.score,
    });
    return failed;
  }

  let session = cachedSession?.status;
  if (!isBetBraSessionFresh()) {
    session = await refreshBetBraSession();
  }
  if (!session?.connected) {
    const failed: BetBraPlaceLayResult = {
      ok: false,
      error: "Conecte a BetBra no app antes do Auto Lay",
    };
    setLastResult({
      at: Date.now(),
      ok: false,
      message: failed.error!,
      eventId: payload.eventId,
      score: payload.score,
    });
    void nativeNotify({
      kind: "enter",
      title: "BetBra desconectada",
      body: "Abra Config → Conectar BetBra para Auto Lay",
      tag: `tips3x3-betbra-session-${Date.now()}`,
    });
    return failed;
  }

  try {
    const result = await BetBra.placeLay({
      eventId: String(payload.eventId),
      score: payload.score || "",
      layOdds: Number(payload.layOdds),
      marketId: payload.marketId || "",
      runnerId: payload.runnerId || "",
      mexchangeUrl: payload.mexchangeUrl || "",
      stakePct: getNativeStakePct(),
      at,
    });

    const score = result.score || payload.score || "";
    const msg = result.ok
      ? `Lay ${score} x${result.odds ?? payload.layOdds} · resp R$ ${
          result.liability?.toFixed?.(2) ?? "?"
        }`
      : humanizeLayError(result.error || "Falha ao enviar Lay");

    setLastResult({
      at: Date.now(),
      ok: Boolean(result.ok),
      message: msg,
      eventId: payload.eventId,
      score,
      odds: result.odds ?? payload.layOdds,
      liability: result.liability,
    });

    void nativeNotify({
      kind: "enter",
      title: result.ok ? "Lay enviado · Eventos raros" : "Lay falhou",
      body: msg,
      tag: `tips3x3-native-lay-${payload.eventId}-${score}-${Date.now()}`,
    });

    return result;
  } catch (e) {
    const message = humanizeLayError(
      e instanceof Error ? e.message : "Falha ao enviar Lay",
    );
    const failed: BetBraPlaceLayResult = { ok: false, error: message };
    setLastResult({
      at: Date.now(),
      ok: false,
      message,
      eventId: payload.eventId,
      score: payload.score,
    });
    void nativeNotify({
      kind: "enter",
      title: "Lay falhou",
      body: message,
      tag: `tips3x3-native-lay-err-${Date.now()}`,
    });
    return failed;
  }
}

/** true se o APK deve executar o Lay localmente (Eventos raros / hold). */
export function shouldUseNativeHoldLay(
  payload: Pick<NativeHoldLayPayload, "exitMode">,
): boolean {
  return isNativeApp() && payload.exitMode === "hold";
}

/** true se o APK deve Lay + Back green (Lay 3x3). */
export function shouldUseNativeGreenLay(
  payload: Pick<NativeHoldLayPayload, "exitMode">,
): boolean {
  return isNativeApp() && payload.exitMode === "green";
}

async function ensureBetBraSession(
  payload: NativeHoldLayPayload,
): Promise<{ ok: true } | { ok: false; result: BetBraPlaceLayResult }> {
  const at = payload.at ?? Date.now();
  if (Date.now() - at > STALE_MS) {
    const failed: BetBraPlaceLayResult = {
      ok: false,
      error: "Sinal expirado (>45s)",
    };
    setLastResult({
      at: Date.now(),
      ok: false,
      message: failed.error!,
      eventId: payload.eventId,
      score: payload.score,
    });
    return { ok: false, result: failed };
  }

  let session = cachedSession?.status;
  if (!isBetBraSessionFresh()) {
    session = await refreshBetBraSession();
  }
  if (!session?.connected) {
    const failed: BetBraPlaceLayResult = {
      ok: false,
      error: "Conecte a BetBra no app antes do Auto Lay",
    };
    setLastResult({
      at: Date.now(),
      ok: false,
      message: failed.error!,
      eventId: payload.eventId,
      score: payload.score,
    });
    void nativeNotify({
      kind: "enter",
      title: "BetBra desconectada",
      body: "Abra Config → Conectar BetBra para Auto Lay",
      tag: `tips3x3-betbra-session-${Date.now()}`,
    });
    return { ok: false, result: failed };
  }
  return { ok: true };
}

/**
 * Lay 3x3 nativo: Lay de entrada + Back de saída (green) com odd alvo automática.
 */
export async function executeNativeGreenLay(
  payload: NativeHoldLayPayload,
): Promise<BetBraPlaceLayResult | null> {
  if (!isNativeApp()) return null;
  if (payload.exitMode !== "green") return null;

  const at = payload.at ?? Date.now();
  const gate = await ensureBetBraSession({ ...payload, at });
  if (!gate.ok) return gate.result;

  const layOdds = Number(payload.layOdds);
  const profitPct =
    payload.targetProfitPct != null && payload.targetProfitPct > 0
      ? payload.targetProfitPct
      : profitPointsToDecimal(getTargetProfitPctPoints());
  const targetBack =
    payload.targetBackOdds != null && payload.targetBackOdds > 1.01
      ? payload.targetBackOdds
      : targetBackForLiabilityProfit(layOdds, profitPct);

  if (targetBack == null || !(targetBack > 1.01)) {
    const failed: BetBraPlaceLayResult = {
      ok: false,
      error: "Não foi possível calcular a odd Back alvo",
    };
    setLastResult({
      at: Date.now(),
      ok: false,
      message: failed.error!,
      eventId: payload.eventId,
      score: payload.score || "3-3",
    });
    return failed;
  }

  try {
    const layResult = await BetBra.placeLay({
      eventId: String(payload.eventId),
      score: payload.score || "3-3",
      layOdds,
      marketId: payload.marketId || "",
      runnerId: payload.runnerId || "",
      mexchangeUrl: payload.mexchangeUrl || "",
      stakePct: payload.stakePct ?? getNativeLay3x3StakePct(),
      at,
    });

    const score = layResult.score || payload.score || "3-3";
    const placedLayOdds = Number(layResult.odds ?? layOdds);
    const layStake = Number(layResult.stake ?? 0);

    if (!layResult.ok || !(layStake > 0)) {
      const msg = humanizeLayError(layResult.error || "Falha no Lay 3x3");
      setLastResult({
        at: Date.now(),
        ok: false,
        message: msg,
        eventId: payload.eventId,
        score,
        odds: placedLayOdds,
      });
      void nativeNotify({
        kind: "enter",
        title: "Lay 3x3 falhou",
        body: msg,
        tag: `tips3x3-native-green-${payload.eventId}-${Date.now()}`,
      });
      return { ...layResult, ok: false, error: msg };
    }

    const backStakeRaw = greenBackStake(layStake, placedLayOdds, targetBack);
    const backStake =
      backStakeRaw != null
        ? Math.max(1, Math.round(backStakeRaw * 100) / 100)
        : null;

    if (backStake == null) {
      const msg = `Lay ok x${placedLayOdds} · sem stake Back (alvo x${targetBack.toFixed(2)})`;
      setLastResult({
        at: Date.now(),
        ok: true,
        message: msg,
        eventId: payload.eventId,
        score,
        odds: placedLayOdds,
        liability: layResult.liability,
      });
      void nativeNotify({
        kind: "enter",
        title: "Lay 3x3 · Back pendente",
        body: msg,
        tag: `tips3x3-native-green-${payload.eventId}-${Date.now()}`,
      });
      return layResult;
    }

    const backResult = await BetBra.placeBack({
      eventId: String(payload.eventId),
      score,
      backOdds: targetBack,
      stake: backStake,
      marketId: layResult.marketId || payload.marketId || "",
      runnerId: layResult.runnerId || payload.runnerId || "",
      at: Date.now(),
    });

    const msg = backResult.ok
      ? `Lay 3x3 x${placedLayOdds} → Back x${targetBack.toFixed(2)} · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`
      : `Lay ok x${placedLayOdds} · Back falhou: ${humanizeLayError(backResult.error || "erro")}`;

    setLastResult({
      at: Date.now(),
      ok: Boolean(backResult.ok),
      message: msg,
      eventId: payload.eventId,
      score,
      odds: placedLayOdds,
      liability: layResult.liability,
    });

    void nativeNotify({
      kind: "enter",
      title: backResult.ok ? "Lay 3x3 · green enviado" : "Lay 3x3 · Back falhou",
      body: msg,
      tag: `tips3x3-native-green-${payload.eventId}-${Date.now()}`,
    });

    return {
      ...layResult,
      ok: Boolean(backResult.ok),
      error: backResult.ok ? undefined : msg,
    };
  } catch (e) {
    const message = humanizeLayError(
      e instanceof Error ? e.message : "Falha no Lay 3x3",
    );
    const failed: BetBraPlaceLayResult = { ok: false, error: message };
    setLastResult({
      at: Date.now(),
      ok: false,
      message,
      eventId: payload.eventId,
      score: payload.score || "3-3",
    });
    void nativeNotify({
      kind: "enter",
      title: "Lay 3x3 falhou",
      body: message,
      tag: `tips3x3-native-green-err-${Date.now()}`,
    });
    return failed;
  }
}

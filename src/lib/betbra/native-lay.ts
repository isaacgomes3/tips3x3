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
import { getExchangeDomain, withExchangeDomain } from "@/lib/betbra/exchange-domain";

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
  eventName?: string;
  score?: string;
  kind?: "lay-3x3" | "eventos-raros" | "lucro-certo" | string;
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
  /** Responsabilidade fixa (Lucro certo). */
  liability?: number;
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

export function setNativeLay3x3StakePct(pct: number) {
  if (typeof window === "undefined") return;
  const n = Math.min(100, Math.max(1, Number(pct) || DEFAULT_LAY3X3_STAKE_PCT));
  try {
    window.localStorage.setItem(LAY3X3_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

const OVER_STAKE_KEY = "tips3x3-stake-over-pct";
const DEFAULT_OVER_STAKE_PCT = 10;

export function getNativeOverStakePct(): number {
  if (typeof window === "undefined") return DEFAULT_OVER_STAKE_PCT;
  try {
    const raw = window.localStorage.getItem(OVER_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_OVER_STAKE_PCT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_OVER_STAKE_PCT;
    return Math.min(100, Math.max(1, n));
  } catch {
    return DEFAULT_OVER_STAKE_PCT;
  }
}

export function setNativeOverStakePct(pct: number) {
  if (typeof window === "undefined") return;
  const n = Math.min(100, Math.max(1, Number(pct) || DEFAULT_OVER_STAKE_PCT));
  try {
    window.localStorage.setItem(OVER_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

/** % da banca Lay Over 4.5 — filtro independente do Over 3.5. */
const OVER45_STAKE_KEY = "tips3x3-stake-over45-pct";
const DEFAULT_OVER45_STAKE_PCT = 10;

export function getNativeOver45StakePct(): number {
  if (typeof window === "undefined") return DEFAULT_OVER45_STAKE_PCT;
  try {
    const raw = window.localStorage.getItem(OVER45_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_OVER45_STAKE_PCT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_OVER45_STAKE_PCT;
    return Math.min(100, Math.max(1, n));
  } catch {
    return DEFAULT_OVER45_STAKE_PCT;
  }
}

export function setNativeOver45StakePct(pct: number) {
  if (typeof window === "undefined") return;
  const n = Math.min(100, Math.max(1, Number(pct) || DEFAULT_OVER45_STAKE_PCT));
  try {
    window.localStorage.setItem(OVER45_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

/** % da banca Lay 1x1 — filtro independente. Default 5%. */
const LAY_1X1_STAKE_KEY = "tips3x3-stake-lay1x1-pct";
const DEFAULT_LAY_1X1_STAKE_PCT = 5;

export function getNativeLay1x1StakePct(): number {
  if (typeof window === "undefined") return DEFAULT_LAY_1X1_STAKE_PCT;
  try {
    const raw = window.localStorage.getItem(LAY_1X1_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_LAY_1X1_STAKE_PCT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LAY_1X1_STAKE_PCT;
    return Math.min(100, Math.max(1, n));
  } catch {
    return DEFAULT_LAY_1X1_STAKE_PCT;
  }
}

export function setNativeLay1x1StakePct(pct: number) {
  if (typeof window === "undefined") return;
  const n = Math.min(100, Math.max(1, Number(pct) || DEFAULT_LAY_1X1_STAKE_PCT));
  try {
    window.localStorage.setItem(LAY_1X1_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

/** % da banca Lay QOV zebra — filtro independente do Lay 3x3. */
const QOV_STAKE_KEY = "tips3x3-stake-qov-pct";
const DEFAULT_QOV_STAKE_PCT = 20;

export function getNativeQovStakePct(): number {
  if (typeof window === "undefined") return DEFAULT_QOV_STAKE_PCT;
  try {
    const raw = window.localStorage.getItem(QOV_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_QOV_STAKE_PCT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_QOV_STAKE_PCT;
    return Math.min(100, Math.max(1, n));
  } catch {
    return DEFAULT_QOV_STAKE_PCT;
  }
}

export function setNativeQovStakePct(pct: number) {
  if (typeof window === "undefined") return;
  const n = Math.min(100, Math.max(1, Number(pct) || DEFAULT_QOV_STAKE_PCT));
  try {
    window.localStorage.setItem(QOV_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
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

/** Stake fixa Eventos raros (responsabilidade R$) — igual ao Lucro certo. */
const EVENTOS_RAROS_STAKE_KEY = "tips3x3-stake-eventos-raros-fixed";
const DEFAULT_EVENTOS_RAROS_STAKE = 500;
/** Stake fixa Lucro certo (responsabilidade R$). */
const LUCRO_CERTO_STAKE_KEY = "tips3x3-stake-lucro-certo";
const DEFAULT_LUCRO_CERTO_STAKE = 1001;
/** Carteira isolada LC (não entra em outras ops). */
const LUCRO_CERTO_RESERVED_KEY = "tips3x3-reserved-lucro-certo";
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

/** Stake fixa Eventos raros (default R$ 500) — mesmo formato do Lucro certo. */
export function getNativeEventosRarosStake(): number {
  if (typeof window === "undefined") return DEFAULT_EVENTOS_RAROS_STAKE;
  try {
    const raw = window.localStorage.getItem(EVENTOS_RAROS_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_EVENTOS_RAROS_STAKE;
    if (!Number.isFinite(n) || n < 1) return DEFAULT_EVENTOS_RAROS_STAKE;
    return Math.round(n * 100) / 100;
  } catch {
    return DEFAULT_EVENTOS_RAROS_STAKE;
  }
}

export function setNativeEventosRarosStake(amount: number) {
  if (typeof window === "undefined") return;
  const n =
    Number.isFinite(amount) && amount >= 1
      ? Math.round(amount * 100) / 100
      : DEFAULT_EVENTOS_RAROS_STAKE;
  try {
    window.localStorage.setItem(EVENTOS_RAROS_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

/** Stake fixa Lucro certo (default R$ 1001). */
export function getNativeLucroCertoStake(): number {
  if (typeof window === "undefined") return DEFAULT_LUCRO_CERTO_STAKE;
  try {
    const raw = window.localStorage.getItem(LUCRO_CERTO_STAKE_KEY);
    const n = raw != null ? Number(raw) : DEFAULT_LUCRO_CERTO_STAKE;
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LUCRO_CERTO_STAKE;
    return Math.round(n * 100) / 100;
  } catch {
    return DEFAULT_LUCRO_CERTO_STAKE;
  }
}

export function setNativeLucroCertoStake(amount: number) {
  if (typeof window === "undefined") return;
  const n =
    Number.isFinite(amount) && amount >= 1
      ? Math.round(amount * 100) / 100
      : DEFAULT_LUCRO_CERTO_STAKE;
  try {
    window.localStorage.setItem(LUCRO_CERTO_STAKE_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

/** Valor da carteira Lucro certo isolada das outras operações. */
export function getNativeReservedLucroCerto(): number {
  if (typeof window === "undefined") return DEFAULT_LUCRO_CERTO_STAKE;
  try {
    const raw = window.localStorage.getItem(LUCRO_CERTO_RESERVED_KEY);
    if (raw == null) return getNativeLucroCertoStake();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return getNativeLucroCertoStake();
    return Math.round(n * 100) / 100;
  } catch {
    return DEFAULT_LUCRO_CERTO_STAKE;
  }
}

export function setNativeReservedLucroCerto(amount: number) {
  if (typeof window === "undefined") return;
  const n =
    Number.isFinite(amount) && amount >= 0
      ? Math.round(amount * 100) / 100
      : getNativeLucroCertoStake();
  try {
    window.localStorage.setItem(LUCRO_CERTO_RESERVED_KEY, String(n));
  } catch {
    /* ignore */
  }
  emit();
}

const LAST_RESULT_TTL_MS = 45 * 60_000;

export function getNativeLayLastResult(): NativeLayLastResult | null {
  const cached = lastResult ?? readLastResultFromStorage();
  if (!cached) return null;
  if (Date.now() - cached.at > LAST_RESULT_TTL_MS) {
    clearNativeLayLastResult();
    return null;
  }
  lastResult = cached;
  return cached;
}

function readLastResultFromStorage(): NativeLayLastResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NativeLayLastResult;
  } catch {
    return null;
  }
}

/** Limpa “Último Lay” da UI (ex.: oferta já casada / evento acabou). */
export function clearNativeLayLastResult() {
  lastResult = null;
  try {
    window.sessionStorage.removeItem(LAST_RESULT_KEY);
  } catch {
    /* ignore */
  }
  emit();
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

async function recordIndicationApi(opts: {
  kind: "lay-3x3" | "eventos-raros" | "lucro-certo" | "lay-1x1";
  eventId: string;
  eventName?: string;
  scoreLabel: string;
  layOdds: number;
  stake?: number;
  /** Responsabilidade real: é o que sai do saldo no Lay. */
  liability?: number;
  expectedProfit?: number;
  event?: {
    type: "lay-sent" | "lay-matched" | "back-sent" | "green" | "cancelled" | "failed";
    odds?: number;
    stake?: number;
    profit?: number;
    message?: string;
  };
}) {
  try {
    await fetch("/api/indications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...opts,
        source: isNativeApp() ? "apk" : "painel",
      }),
    });
  } catch {
    /* histórico não deve bloquear a ordem */
  }
}

async function reportLayMatched(opts: {
  kind: "lay-3x3" | "eventos-raros" | "lucro-certo" | "lay-1x1";
  eventId: string;
  eventName?: string;
  scoreLabel: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
}) {
  const matched = await waitNativeLayMatched({
    eventId: opts.eventId,
    marketId: opts.marketId || "",
    runnerId: opts.runnerId || "",
    timeoutMs: 120_000,
  });
  if (!matched) return;

  let stake = 0;
  let odds = opts.layOdds;
  let liability = 0;
  try {
    const offers = await fetchBetBraOffers();
    const hit = (offers?.offers ?? []).find((o) => {
      if (o.side !== "lay") return false;
      if (opts.eventId && o.eventId !== String(opts.eventId)) return false;
      if (o.open || (Number(o.remaining) || 0) >= 0.01) return false;
      return true;
    });
    if (hit) {
      stake = hit.stake;
      if (hit.odds > 1.01) odds = hit.odds;
      liability =
        hit.liability > 0
          ? hit.liability
          : Math.round(stake * (odds - 1) * 100) / 100;
    }
  } catch {
    /* keep zeros */
  }

  void recordIndicationApi({
    kind: opts.kind,
    eventId: opts.eventId,
    eventName: opts.eventName,
    scoreLabel: opts.scoreLabel,
    layOdds: odds,
    stake: stake > 0 ? stake : undefined,
    liability: liability > 0 ? liability : undefined,
    event: {
      type: "lay-matched",
      odds,
      stake: stake > 0 ? stake : undefined,
    },
  });
}

function refreshBalanceAfterPlace() {
  void fetchBetBraBalanceSnapshot().then(() => emit());
  void fetchBetBraOffers().then(() => emit());
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
    url: `https://${getExchangeDomain()}/b/exchange/sport/soccer`,
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

export type BetBraOfferCard = {
  id: string;
  betId: string;
  offerId: string;
  side: "lay" | "back" | string;
  odds: number;
  stake: number;
  remaining: number;
  liability: number;
  profit: number;
  eventId: string;
  eventName: string;
  marketName: string;
  runnerName: string;
  status: string;
  open: boolean;
  /** true só quando remaining≈0 e size-matched (nunca unmatched). */
  matched?: boolean;
  placedAt: string;
  eventDate: string;
  loginId: string;
};

export type BetBraOffersSnapshot = {
  count: number;
  openCount: number;
  openExposure: number;
  summary: string;
  offers: BetBraOfferCard[];
};

function normalizeOfferRow(raw: Record<string, unknown>): BetBraOfferCard | null {
  const id = String(raw.id ?? raw.offerId ?? raw.betId ?? "").trim();
  const odds = Number(raw.odds);
  const stake = Number(raw.stake);
  if (!(odds > 1.01) && !(stake > 0) && !id) return null;
  const sideRaw = String(raw.side ?? "").toLowerCase();
  const side = sideRaw.includes("back")
    ? "back"
    : sideRaw.includes("lay")
      ? "lay"
      : sideRaw || "lay";
  const remaining = Number(raw.remaining);
  const rem = Number.isFinite(remaining) ? remaining : 0;
  // Preferir flag nativa; se remaining > 0, forçar unmatched.
  const openFromApi = Boolean(raw.open);
  const open = rem >= 0.01 ? true : openFromApi;
  const matched =
    rem < 0.01 &&
    (raw.matched === true ||
      (!open && String(raw.status || "").toLowerCase() === "matched"));
  return {
    id: id || String(raw.betId ?? "—"),
    betId: String(raw.betId ?? id) || "—",
    offerId: String(raw.offerId ?? id) || "—",
    side,
    odds: Number.isFinite(odds) ? odds : 0,
    stake: Number.isFinite(stake) ? stake : 0,
    remaining: rem,
    liability: Number(raw.liability) || 0,
    profit: Number(raw.profit) || 0,
    eventId: String(raw.eventId ?? ""),
    eventName: String(raw.eventName ?? ""),
    marketName: String(raw.marketName ?? "Placar Exato"),
    runnerName: String(raw.runnerName ?? ""),
    status: String(raw.status ?? ""),
    open,
    matched,
    placedAt: String(raw.placedAt ?? ""),
    eventDate: String(raw.eventDate ?? ""),
    loginId: String(raw.loginId ?? ""),
  };
}

export async function fetchBetBraOffers(): Promise<BetBraOffersSnapshot | null> {
  if (!isNativeApp()) return null;
  try {
    const res = await BetBra.listOffers();
    if (!res.ok) return null;
    const offers: BetBraOfferCard[] = [];
    const list = Array.isArray(res.offers) ? res.offers : [];
    for (const item of list) {
      const row = normalizeOfferRow(item as Record<string, unknown>);
      if (row) offers.push(row);
    }
    return {
      count: typeof res.count === "number" ? res.count : offers.length,
      openCount: typeof res.openCount === "number" ? res.openCount : 0,
      openExposure:
        typeof res.openExposure === "number" ? res.openExposure : 0,
      summary: res.summary ?? "",
      offers,
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

  const isLucroCerto = payload.kind === "lucro-certo";
  const isEventosRaros = payload.kind === "eventos-raros";
  const fixedLiability =
    Number(payload.liability) >= 1
      ? Number(payload.liability)
      : isLucroCerto
        ? getNativeLucroCertoStake()
        : isEventosRaros
          ? getNativeEventosRarosStake()
          : undefined;

  try {
    const result = await BetBra.placeLay({
      eventId: String(payload.eventId),
      score: payload.score || "",
      layOdds: Number(payload.layOdds),
      marketId: payload.marketId || "",
      runnerId: payload.runnerId || "",
      mexchangeUrl: withExchangeDomain(payload.mexchangeUrl) || "",
      liability: fixedLiability,
      at,
    });

    const score = result.score || payload.score || "";
    const isLay1x1 = payload.kind === "lay-1x1";
    const kindLabel = isLucroCerto ? "Lucro certo" : isLay1x1 ? "Lay 1x1" : "Eventos raros";
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

    if (result.ok) {
      void recordIndicationApi({
        kind: isLucroCerto ? "lucro-certo" : isLay1x1 ? "lay-1x1" : "eventos-raros",
        eventId: String(payload.eventId),
        eventName: payload.eventName,
        scoreLabel: score,
        layOdds: Number(result.odds ?? payload.layOdds),
        event: {
          type: "lay-sent",
          odds: Number(result.odds ?? payload.layOdds),
          stake: result.stake,
        },
      });
      void reportLayMatched({
        kind: isLucroCerto ? "lucro-certo" : isLay1x1 ? "lay-1x1" : "eventos-raros",
        eventId: String(payload.eventId),
        eventName: payload.eventName,
        scoreLabel: score,
        layOdds: Number(result.odds ?? payload.layOdds),
        marketId: payload.marketId,
        runnerId: payload.runnerId,
      });
      refreshBalanceAfterPlace();
    }

    void nativeNotify({
      kind: "enter",
      title: result.ok ? `Lay enviado · ${kindLabel}` : "Lay falhou",
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

function sleepMs(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera Lay casar no book (paridade com a extensão). */
async function waitNativeLayMatched(opts: {
  eventId: string;
  marketId?: string;
  runnerId?: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? 40_000);
  const wantEvent = String(opts.eventId || "");
  const wantMarket = String(opts.marketId || "");
  const wantRunner = String(opts.runnerId || "");
  let everSawOpen = false;
  while (Date.now() < deadline) {
    try {
      const snap = await BetBra.listOffers();
      if (!snap?.ok) {
        await sleepMs(1500);
        continue;
      }
      let arr: unknown[] = [];
      try {
        const parsed = JSON.parse(String(snap.raw || "[]")) as unknown;
        if (Array.isArray(parsed)) arr = parsed;
        else if (parsed && typeof parsed === "object") {
          const o = parsed as Record<string, unknown>;
          const inner = o.offers || o.data || o.items;
          if (Array.isArray(inner)) arr = inner;
        }
      } catch {
        arr = [];
      }
      let sawOpenLay = false;
      let sawMatched = false;
      for (const row of arr) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const side = String(o.side || o.type || "").toLowerCase();
        if (side && !side.includes("lay")) continue;
        const eid = String(o["event-id"] || o.eventId || o.event_id || "");
        const mid = String(o["market-id"] || o.marketId || o.market_id || "");
        const rid = String(o["runner-id"] || o.runnerId || o.runner_id || "");
        if (wantEvent && eid && eid !== wantEvent) continue;
        if (wantMarket && mid && mid !== wantMarket) continue;
        if (wantRunner && rid && rid !== wantRunner) continue;
        const status = String(o.status || o.state || "").toLowerCase().trim();
        const rem = Number(
          o["size-remaining"] ??
            o.sizeRemaining ??
            o["remaining-stake"] ??
            o.remainingStake ??
            o.remaining ??
            NaN,
        );
        const sizeMatched = Number(
          o["size-matched"] ?? o.sizeMatched ?? o["matched-stake"] ?? 0,
        );
        // remaining > 0 ⇒ ainda unmatched (nunca tratar como casada).
        if (Number.isFinite(rem) && rem >= 0.01) {
          sawOpenLay = true;
          everSawOpen = true;
          continue;
        }
        if (
          status.includes("unmatched") ||
          status === "open" ||
          status === "pending" ||
          status === "edited" ||
          status === "delayed" ||
          status === "active" ||
          status === "created"
        ) {
          sawOpenLay = true;
          everSawOpen = true;
          continue;
        }
        const statusFilled =
          status === "matched" ||
          status === "filled" ||
          status === "executed" ||
          status === "settled" ||
          (sizeMatched >= 0.01 && (!Number.isFinite(rem) || rem < 0.01));
        if (statusFilled) {
          sawMatched = true;
        }
      }
      if (sawOpenLay) {
        everSawOpen = true;
        await sleepMs(1500);
        continue;
      }
      if (sawMatched) return true;
      // Só assume casado se já vimos a oferta aberta e ela sumiu.
      if (everSawOpen && !sawOpenLay) return true;
    } catch {
      /* retry */
    }
    await sleepMs(1500);
  }
  return false;
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
      mexchangeUrl: withExchangeDomain(payload.mexchangeUrl) || "",
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

    refreshBalanceAfterPlace();

    // Não confirma entrada na UI/indicação até o Lay casar (valor exato).
    setLastResult({
      at: Date.now(),
      ok: true,
      message: `Lay no book · aguarda casar (pedido x${placedLayOdds})`,
      eventId: payload.eventId,
      score,
      odds: placedLayOdds,
    });

    const matched = await waitNativeLayMatched({
      eventId: String(payload.eventId),
      marketId: layResult.marketId || payload.marketId || "",
      runnerId: layResult.runnerId || payload.runnerId || "",
      timeoutMs: 40_000,
    });
    if (!matched) {
      const msg = `Lay no book · aguarda casar → Back x${targetBack.toFixed(2)}`;
      setLastResult({
        at: Date.now(),
        ok: true,
        message: msg,
        eventId: payload.eventId,
        score,
        odds: placedLayOdds,
      });
      void nativeNotify({
        kind: "enter",
        title: "Lay 3x3 · aguarda casar",
        body: msg,
        tag: `tips3x3-native-green-${payload.eventId}-${Date.now()}`,
      });
      return layResult;
    }

    // Preferir size matched da lista de ofertas quando disponível.
    let finalStake = layStake;
    let finalOdds = placedLayOdds;
    let finalLiab = Number(layResult.liability ?? 0);
    try {
      const offers = await fetchBetBraOffers();
      const hit = (offers?.offers ?? []).find((o) => {
        if (o.side !== "lay") return false;
        if (payload.eventId && o.eventId !== String(payload.eventId)) return false;
        if (o.open) return false; // unmatched ainda no book
        const st = String(o.status || "").toLowerCase();
        if (st.includes("unmatched")) return false;
        return !o.open;
      });
      if (hit && hit.stake > 0) {
        finalStake = hit.stake;
        if (hit.odds > 1.01) finalOdds = hit.odds;
        finalLiab =
          hit.liability > 0
            ? hit.liability
            : Math.round(finalStake * (finalOdds - 1) * 100) / 100;
      }
    } catch {
      /* keep placed */
    }
    if (!(finalLiab > 0) && finalStake > 0 && finalOdds > 1.01) {
      finalLiab = Math.round(finalStake * (finalOdds - 1) * 100) / 100;
    }

    void recordIndicationApi({
      kind: "lay-3x3",
      eventId: String(payload.eventId),
      eventName: payload.eventName,
      scoreLabel: score,
      layOdds: finalOdds,
      stake: finalStake,
      liability: finalLiab,
      expectedProfit:
        Math.round(finalStake * (finalOdds - 1) * profitPct * 100) / 100,
      event: {
        type: "lay-matched",
        odds: finalOdds,
        stake: finalStake,
      },
    });

    const backStakeRaw = greenBackStake(finalStake, finalOdds, targetBack);
    const backStake =
      backStakeRaw != null
        ? Math.max(1, Math.round(backStakeRaw * 100) / 100)
        : null;

    if (backStake == null) {
      const msg = `Lay casado x${finalOdds} stake R$${finalStake.toFixed(2)} · sem Back (alvo x${targetBack.toFixed(2)})`;
      setLastResult({
        at: Date.now(),
        ok: true,
        message: msg,
        eventId: payload.eventId,
        score,
        odds: finalOdds,
        liability: finalLiab,
      });
      void nativeNotify({
        kind: "enter",
        title: "Lay 3x3 casado · Back pendente",
        body: msg,
        tag: `tips3x3-native-green-${payload.eventId}-${Date.now()}`,
      });
      return { ...layResult, stake: finalStake, odds: finalOdds, liability: finalLiab };
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
      ? `Lay casado x${finalOdds} R$${finalStake.toFixed(2)} → Back x${targetBack.toFixed(2)} · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`
      : `Lay casado x${finalOdds} · Back falhou: ${humanizeLayError(backResult.error || "erro")}`;

    setLastResult({
      at: Date.now(),
      ok: Boolean(backResult.ok),
      message: msg,
      eventId: payload.eventId,
      score,
      odds: finalOdds,
      liability: finalLiab,
    });

    void nativeNotify({
      kind: "enter",
      title: backResult.ok
        ? "Lay 3x3 · Back proposto no alvo"
        : "Lay 3x3 · Back falhou",
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

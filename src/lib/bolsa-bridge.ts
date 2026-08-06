/**
 * Bridge: página tips3x3 → extensão Bolsa Manual (via content script).
 * Sem precisar do ID da extensão.
 *
 * Caminho robusto: também publica em POST /api/ext/signal (fila 1-sinal)
 * para a extensão pollear com cookie de sessão — painel fechado / mobile ok.
 *
 * No APK:
 * - Eventos raros (hold): Lay via BetBra, sem fila.
 * - Lay 3x3 (green): Lay + Back alvo via BetBra, sem fila.
 */
import { isAutoLayBgActive } from "@/lib/betbra/auto-lay-bg";
import { isNativeApp } from "@/lib/native-alerts";
import {
  executeNativeGreenLay,
  executeNativeHoldLay,
  shouldUseNativeGreenLay,
  shouldUseNativeHoldLay,
} from "@/lib/betbra/native-lay";
import { resolveExtEventName } from "@/lib/ext-event-label";

/** Estratégia da ordem — a extensão usa isso para reportar a operação. */
export type Tips3x3EntryKind =
  | "lay-3x3"
  | "eventos-raros"
  | "lucro-certo"
  | "over-3.5"
  | "over-4.5"
  | "lay-over-limit-pressure"
  | "qov-lay-zebra"
  | "lay-1x1";

export type Tips3x3AutoEntryPayload = {
  eventId: string;
  eventName?: string;
  /** "3-3" | "QOV Casa" | "QOV Fora" | placar CS "4-0" etc. */
  score?: string;
  kind?: Tips3x3EntryKind;
  home?: string;
  away?: string;
  minute?: number | null;
  /** Placar live no momento do sinal. */
  liveScore?: string | null;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
  /** hold = sem green (Eventos raros); green = Lay+Back (3x3); omitido = extensão. */
  exitMode?: "hold" | "green";
  targetBackOdds?: number;
  /** Fração (0.005 = 0,5%). */
  targetProfitPct?: number;
  /** Chave de dedupe do painel (ex.: eventId:over-2-5) */
  dedupeKey?: string;
};

const STORAGE_KEY = "tips3x3-ext-auto-send";
const ENTRY_STORAGE_PREFIX = "tips3x3-ext-entry:";

export function isExtAutoSendEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setExtAutoSendEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function entryStorageKey(key: string) {
  return `${ENTRY_STORAGE_PREFIX}${key}`;
}

/**
 * Evita reenviar a mesma entrada quando a página é recarregada enquanto o
 * sinal ainda está ativo. O registro é da sessão atual e é removido quando
 * o sinal deixa de estar pronto ou a partida termina.
 */
export function hasExtAutoEntryBeenDispatched(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(entryStorageKey(key)) === "1";
  } catch {
    return false;
  }
}

export function markExtAutoEntryDispatched(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(entryStorageKey(key), "1");
  } catch {
    /* ignore */
  }
}

export function clearExtAutoEntryDispatched(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(entryStorageKey(key));
  } catch {
    /* ignore */
  }
}

export function overSelectionLabel(line: number): string {
  return `Over ${line}`;
}

export function qovSelectionLabel(side: "home" | "away"): string {
  return side === "home" ? "QOV Casa" : "QOV Fora";
}

/** Publica na fila server-side (extensão faz poll). Retorna true só com HTTP 200. */
export async function publishExtSignalApi(
  payload: Tips3x3AutoEntryPayload & { dedupeKey?: string },
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!payload?.eventId || !(Number(payload.layOdds) > 1.01)) return false;
  const at = Date.now();
  const score = payload.score || "3-3";
  const eventName = resolveExtEventName({
    eventName: payload.eventName,
    home: payload.home,
    away: payload.away,
    eventId: payload.eventId,
  });
  try {
    const res = await fetch("/api/ext/signal", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: String(payload.eventId),
        eventName,
        name: eventName,
        matchName: eventName,
        title: eventName,
        score,
        kind: payload.kind || "",
        home: payload.home || "",
        away: payload.away || "",
        minute: payload.minute ?? null,
        liveScore: payload.liveScore || "",
        layOdds: Number(payload.layOdds),
        marketId: payload.marketId || "",
        runnerId: payload.runnerId || "",
        mexchangeUrl: payload.mexchangeUrl || "",
        exitMode: payload.exitMode || "",
        targetBackOdds: payload.targetBackOdds ?? null,
        targetProfitPct: payload.targetProfitPct ?? null,
        at,
        dedupeKey: payload.dedupeKey || `${payload.eventId}:${score}`,
      }),
    });
    if (!res.ok) {
      console.warn(
        "[tips3x3] publish /api/ext/signal falhou",
        res.status,
        payload.dedupeKey || `${payload.eventId}:${score}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[tips3x3] publish /api/ext/signal rede", err);
    return false;
  }
}

/**
 * Dispara auto-LAY.
 * - Desktop: fila API (obrigatória) + postMessage para a extensão Bolsa Manual.
 * - APK hold: Lay BetBra. APK green (3x3): Lay+Back BetBra.
 * Retorna true só quando a entrega principal (fila ou nativo) confirmou.
 */
export async function dispatchExtAutoEntry(
  payload: Tips3x3AutoEntryPayload,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!payload?.eventId || !(Number(payload.layOdds) > 1.01)) return false;

  // Foreground Service nativo já faz poll + placeLay com tela off —
  // evita ordem dupla enquanto o painel estiver visível.
  if (isNativeApp() && isAutoLayBgActive()) {
    return true;
  }

  if (shouldUseNativeHoldLay(payload)) {
    void executeNativeHoldLay({ ...payload, at: Date.now() });
    return true;
  }

  if (shouldUseNativeGreenLay(payload)) {
    void executeNativeGreenLay({ ...payload, at: Date.now() });
    return true;
  }

  // Desktop / sinais sem plugin nativo: fila para a extensão no PC.
  // A fila é o caminho real na aba da Bolsa (Bearer); postMessage é atalho
  // só se o content script estiver na origem tips3x3.
  const queued = await publishExtSignalApi(payload);

  if (isNativeApp()) {
    return queued;
  }

  const eventName = resolveExtEventName({
    eventName: payload.eventName,
    home: payload.home,
    away: payload.away,
    eventId: payload.eventId,
  });
  try {
    window.postMessage(
      {
        source: "tips3x3",
        type: "TIPS3X3_AUTO_ENTRY",
        payload: {
          eventId: String(payload.eventId),
          eventName,
          name: eventName,
          matchName: eventName,
          title: eventName,
          score: payload.score || "3-3",
          kind: payload.kind || "",
          home: payload.home || "",
          away: payload.away || "",
          minute: payload.minute ?? null,
          liveScore: payload.liveScore || "",
          layOdds: Number(payload.layOdds),
          marketId: payload.marketId || "",
          runnerId: payload.runnerId || "",
          mexchangeUrl: payload.mexchangeUrl || "",
          exitMode: payload.exitMode || "",
          targetBackOdds: payload.targetBackOdds ?? null,
          targetProfitPct: payload.targetProfitPct ?? null,
          at: Date.now(),
        },
      },
      window.location.origin,
    );
  } catch {
    /* postMessage opcional — fila decide o sucesso */
  }
  return queued;
}

/**
 * Informa a extensão que a partida terminou para ela não manter uma operação
 * pendente. Extensões anteriores podem ignorar essa mensagem sem afetar a
 * entrada automática já existente.
 */
export function dispatchExtMatchFinished(payload: {
  eventId: string;
  score?: string;
  status?: string;
}): boolean {
  if (typeof window === "undefined" || !payload.eventId) return false;
  try {
    window.postMessage(
      {
        source: "tips3x3",
        type: "TIPS3X3_MATCH_FINISHED",
        payload: {
          eventId: String(payload.eventId),
          score: payload.score || "",
          status: payload.status || "FT",
          at: Date.now(),
        },
      },
      window.location.origin,
    );
    return true;
  } catch {
    return false;
  }
}

/** Atualiza placar live na extensão (Último evento / settle Lay 3-3). */
export function dispatchExtScoreUpdate(payload: {
  eventId: string;
  score: string;
  eventName?: string;
}): boolean {
  if (typeof window === "undefined" || !payload.eventId || !payload.score) {
    return false;
  }
  try {
    window.postMessage(
      {
        source: "tips3x3",
        type: "TIPS3X3_SCORE_UPDATE",
        payload: {
          eventId: String(payload.eventId),
          score: String(payload.score),
          eventName: payload.eventName || "",
          at: Date.now(),
        },
      },
      window.location.origin,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Bridge: página tips3x3 → extensão Bolsa Manual (via content script).
 * Sem precisar do ID da extensão.
 *
 * Caminho robusto: também publica em POST /api/ext/signal (fila 1-sinal)
 * para a extensão pollear com cookie de sessão — painel fechado / mobile ok.
 */
export type Tips3x3AutoEntryPayload = {
  eventId: string;
  eventName?: string;
  /** "3-3" | "QOV Casa" | "QOV Fora" | placar CS "4-0" etc. */
  score?: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
  /** hold = sem green (Eventos raros); omitido = extensão decide saída. */
  exitMode?: "hold" | "green";
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

/** Publica na fila server-side (extensão faz poll). Fire-and-forget. */
export function publishExtSignalApi(
  payload: Tips3x3AutoEntryPayload & { dedupeKey?: string },
): void {
  if (typeof window === "undefined") return;
  if (!payload?.eventId || !(Number(payload.layOdds) > 1.01)) return;
  const at = Date.now();
  const score = payload.score || "3-3";
  void fetch("/api/ext/signal", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: String(payload.eventId),
      eventName: payload.eventName || "",
      score,
      layOdds: Number(payload.layOdds),
      marketId: payload.marketId || "",
      runnerId: payload.runnerId || "",
      mexchangeUrl: payload.mexchangeUrl || "",
      exitMode: payload.exitMode || "",
      at,
      dedupeKey: payload.dedupeKey || `${payload.eventId}:${score}`,
    }),
  }).catch(() => {
    /* rede / 401 — bridge postMessage ainda pode salvar */
  });
}

/** Dispara auto-LAY na extensão (odd do painel; saída Back fica com a extensão). */
export function dispatchExtAutoEntry(payload: Tips3x3AutoEntryPayload): boolean {
  if (typeof window === "undefined") return false;
  if (!payload?.eventId || !(Number(payload.layOdds) > 1.01)) return false;

  // Fila API: funciona com painel fechado / outro device com extensão logada.
  publishExtSignalApi(payload);

  try {
    window.postMessage(
      {
        source: "tips3x3",
        type: "TIPS3X3_AUTO_ENTRY",
        payload: {
          eventId: String(payload.eventId),
          eventName: payload.eventName || "",
          score: payload.score || "3-3",
          layOdds: Number(payload.layOdds),
          marketId: payload.marketId || "",
          runnerId: payload.runnerId || "",
          mexchangeUrl: payload.mexchangeUrl || "",
          exitMode: payload.exitMode || "",
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

/**
 * Bridge: página tips3x3 → extensão Bolsa Manual (via content script).
 * Sem precisar do ID da extensão.
 */
export type Tips3x3AutoEntryPayload = {
  eventId: string;
  eventName?: string;
  score?: string;
  layOdds: number;
  marketId?: string;
  runnerId?: string;
  mexchangeUrl?: string;
};

const STORAGE_KEY = "tips3x3-ext-auto-send";

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

/** Dispara auto-LAY na extensão (odd do painel; saída Back fica com a extensão). */
export function dispatchExtAutoEntry(payload: Tips3x3AutoEntryPayload): boolean {
  if (typeof window === "undefined") return false;
  if (!payload?.eventId || !(Number(payload.layOdds) > 1.01)) return false;
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

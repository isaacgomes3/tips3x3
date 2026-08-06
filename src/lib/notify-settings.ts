/** Preferência de notificação de entradas (app nativo). */

const NOTIFY_ONLY_MATCHED_KEY = "tips3x3-notify-only-matched";

/**
 * false (padrão) = notifica todo sinal de entrada assim que ele fica pronto.
 * true = notifica só quando o Lay realmente casar na Bolsa (matched).
 */
export function getNotifyOnlyMatched(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(NOTIFY_ONLY_MATCHED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotifyOnlyMatched(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIFY_ONLY_MATCHED_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

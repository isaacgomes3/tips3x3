/**
 * Estratégias ligadas no painel / Auto Lay.
 * Default: só Lay 3x3 ativo (Eventos raros off).
 */

const LAY3X3_KEY = "tips3x3-strategy-lay-3x3";
const EVENTOS_RAROS_KEY = "tips3x3-strategy-eventos-raros";

function readFlag(key: string, defaultOn: boolean): boolean {
  if (typeof window === "undefined") return defaultOn;
  try {
    const v = window.localStorage.getItem(key);
    if (v == null) return defaultOn;
    return v === "1";
  } catch {
    return defaultOn;
  }
}

function writeFlag(key: string, on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Default ON. */
export function isLay3x3Enabled(): boolean {
  return readFlag(LAY3X3_KEY, true);
}

export function setLay3x3Enabled(on: boolean) {
  writeFlag(LAY3X3_KEY, on);
}

/** Default OFF. */
export function isEventosRarosEnabled(): boolean {
  return readFlag(EVENTOS_RAROS_KEY, false);
}

export function setEventosRarosEnabled(on: boolean) {
  writeFlag(EVENTOS_RAROS_KEY, on);
}

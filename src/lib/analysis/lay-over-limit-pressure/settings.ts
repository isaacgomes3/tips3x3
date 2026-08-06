/**
 * Lucro alvo e % de banca do LOLP, editáveis no painel.
 *
 * Guardados como fração (0.01 = 1%). O ON/OFF da estratégia não vive aqui: é o
 * mesmo flag das outras (strategy-settings), que o APK e a extensão já leem.
 */

import { LAY_OVER_LIMIT_PRESSURE } from "./config";

const PROFIT_KEY = "tips3x3-lay-over-limit-pressure-profit-pct";
const STAKE_KEY = "tips3x3-lay-over-limit-pressure-stake-pct";

/** Limites de segurança: lucro alvo 0,3%–5%; banca 1%–25%. */
export const LOLP_PROFIT_RANGE = { min: 0.003, max: 0.05 } as const;
export const LOLP_STAKE_RANGE = { min: 0.01, max: 0.25 } as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readFraction(
  key: string,
  fallback: number,
  range: { min: number; max: number },
): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return clamp(parsed, range.min, range.max);
  } catch {
    return fallback;
  }
}

function writeFraction(
  key: string,
  value: number,
  range: { min: number; max: number },
): number {
  const clamped = clamp(value, range.min, range.max);
  if (typeof window === "undefined") return clamped;
  try {
    window.localStorage.setItem(key, String(clamped));
  } catch {
    /* modo privado / storage cheio */
  }
  return clamped;
}

export function getLolpTargetProfitPct(): number {
  return readFraction(
    PROFIT_KEY,
    LAY_OVER_LIMIT_PRESSURE.defaultTargetProfitPct,
    LOLP_PROFIT_RANGE,
  );
}

export function setLolpTargetProfitPct(value: number): number {
  return writeFraction(PROFIT_KEY, value, LOLP_PROFIT_RANGE);
}

export function getLolpStakePct(): number {
  return readFraction(
    STAKE_KEY,
    LAY_OVER_LIMIT_PRESSURE.defaultStakePct,
    LOLP_STAKE_RANGE,
  );
}

export function setLolpStakePct(value: number): number {
  return writeFraction(STAKE_KEY, value, LOLP_STAKE_RANGE);
}

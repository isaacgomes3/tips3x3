/** Preferências do painel tips3x3 (browser). */

const PROFIT_KEY = "tips3x3-target-profit-pct";

/** Percentual alvo em pontos (ex.: 0.1 = 0,1%, 1 = 1%). Padrão 1. */
export function getTargetProfitPctPoints(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(PROFIT_KEY);
    if (raw == null) return 1;
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0.1 || n > 100) return 1;
    return Math.round(n * 100) / 100;
  } catch {
    return 1;
  }
}

export function setTargetProfitPctPoints(points: number) {
  if (typeof window === "undefined") return;
  const n = Number(points);
  if (!Number.isFinite(n) || n < 0.1 || n > 100) return;
  try {
    window.localStorage.setItem(PROFIT_KEY, String(Math.round(n * 100) / 100));
  } catch {
    /* ignore */
  }
}

/** Converte pontos % → fração (1 → 0.01). */
export function profitPointsToDecimal(points: number): number {
  return points / 100;
}

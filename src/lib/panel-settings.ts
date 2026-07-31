/** Preferências do painel tips3x3 (browser). */

/** v2: padrão 0,5% (Lay 3x3 green). */
const PROFIT_KEY = "tips3x3-target-profit-pct-v2";
const DEFAULT_PROFIT_POINTS = 0.5;

/** Percentual alvo em pontos (ex.: 0.5 = 0,5%, 1 = 1%). Padrão 0,5. */
export function getTargetProfitPctPoints(): number {
  if (typeof window === "undefined") return DEFAULT_PROFIT_POINTS;
  try {
    const raw = window.localStorage.getItem(PROFIT_KEY);
    if (raw == null) return DEFAULT_PROFIT_POINTS;
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0.1 || n > 100) return DEFAULT_PROFIT_POINTS;
    return Math.round(n * 100) / 100;
  } catch {
    return DEFAULT_PROFIT_POINTS;
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

/** Converte pontos % → fração (0.5 → 0.005). */
export function profitPointsToDecimal(points: number): number {
  return points / 100;
}

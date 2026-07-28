/**
 * Escada de ticks estilo exchange (decimal).
 * Usada para gap back↔lay e ticks/minuto.
 */
export function tickSizeAt(odds: number): number {
  const o = Number(odds);
  if (!Number.isFinite(o) || o <= 1) return 0.01;
  if (o < 2) return 0.01;
  if (o < 3) return 0.02;
  if (o < 4) return 0.05;
  if (o < 6) return 0.1;
  if (o < 10) return 0.2;
  if (o < 20) return 0.5;
  if (o < 50) return 1;
  if (o < 100) return 2;
  return 5;
}

/** Distância em ticks entre duas odds (sempre ≥ 0). */
export function ticksBetween(fromOdds: number, toOdds: number): number {
  const a = Number(fromOdds);
  const b = Number(toOdds);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 1 || b <= 1) return NaN;
  if (Math.abs(a - b) < 1e-9) return 0;

  let x = Math.min(a, b);
  const hi = Math.max(a, b);
  let ticks = 0;
  while (x < hi - 1e-9 && ticks < 5000) {
    const step = tickSizeAt(x);
    x = Math.min(x + step, hi);
    ticks += 1;
  }
  return ticks;
}

export function gapTicks(backOdds: number | null, layOdds: number | null): number | null {
  if (backOdds == null || layOdds == null) return null;
  if (!(backOdds > 1) || !(layOdds > 1)) return null;
  const n = ticksBetween(backOdds, layOdds);
  return Number.isFinite(n) ? n : null;
}

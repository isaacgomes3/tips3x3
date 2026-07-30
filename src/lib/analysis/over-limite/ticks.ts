/**
 * Escada de ticks estilo exchange (decimal).
 * Usada para gap back↔lay, ticks/minuto e alvos Back colocáveis.
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

function fixTick(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Menor odd válida >= target (arredonda para cima na escada). */
export function ceilToTick(odds: number): number | null {
  const target = Number(odds);
  if (!Number.isFinite(target) || target <= 1) return null;
  let x = 1.01;
  let guard = 0;
  while (x < target - 1e-9 && guard < 20000) {
    x = fixTick(x + tickSizeAt(x));
    guard += 1;
  }
  return fixTick(x);
}

/** Maior odd válida <= target (arredonda para baixo na escada). */
export function floorToTick(odds: number): number | null {
  const target = Number(odds);
  if (!Number.isFinite(target) || target <= 1) return null;
  let prev = 1.01;
  let x = 1.01;
  let guard = 0;
  while (x < target - 1e-9 && guard < 20000) {
    prev = x;
    x = fixTick(x + tickSizeAt(x));
    guard += 1;
  }
  if (Math.abs(x - target) < 1e-9) return fixTick(x);
  return fixTick(prev);
}

/**
 * Desce ticks a partir de `from` até odd <= `target` (saída Lay após Back).
 */
export function prevTradableOdd(from: number, target: number): number | null {
  const start = Number(from);
  const t = Number(target);
  if (!Number.isFinite(start) || start <= 1 || !Number.isFinite(t) || t <= 1) {
    return null;
  }
  const floored = floorToTick(Math.min(start, t));
  if (floored == null) return null;
  if (floored < start - 1e-9) return floored;
  // Já no mesmo degrau — desce 1 tick para greening.
  const step = tickSizeAt(Math.max(start - 1e-9, 1.01));
  const down = fixTick(start - step);
  return down > 1 ? down : null;
}

/**
 * Sobe ticks a partir de `from` até odd >= `target`.
 * Ex.: from 7.2, target 7.68 → 7.8
 */
export function nextTradableOdd(from: number, target: number): number | null {
  const start = Number(from);
  const t = Number(target);
  if (!Number.isFinite(start) || start <= 1 || !Number.isFinite(t) || t <= 1) {
    return null;
  }
  if (start >= t - 1e-9) return ceilToTick(start) ?? fixTick(start);

  let odd = fixTick(start);
  let steps = 0;
  while (odd < t - 1e-9 && steps < 5000) {
    odd = fixTick(odd + tickSizeAt(odd));
    steps += 1;
  }
  return odd;
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

export function gapTicks(
  backOdds: number | null,
  layOdds: number | null,
): number | null {
  if (backOdds == null || layOdds == null) return null;
  if (!(backOdds > 1) || !(layOdds > 1)) return null;
  const n = ticksBetween(backOdds, layOdds);
  return Number.isFinite(n) ? n : null;
}

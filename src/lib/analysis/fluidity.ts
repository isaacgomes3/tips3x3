import type { OddsHistoryPoint } from "../betbra/odds-history";

export type FluidityLevel = "dead" | "lateral" | "ok" | "liquid";

export interface FluidityReport {
  level: FluidityLevel;
  score: number; // 0-100
  tradable: boolean;
  lateralized: boolean;
  points: number;
  uniqueOdds: number;
  swingPct: number;
  totalMatched: number;
  avgMatched: number;
  lastMatched: number;
  volumeNow: number;
  volumeDelta: number;
  ticksPerHour: number;
  detail: string;
  blockers: string[];
}

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Fluidez = capacidade de entrar/sair sem ficar preso em mercado lateral.
 * Usa variação de odd, frequência de ticks e matched/volume.
 */
export function analyzeFluidity(
  points: OddsHistoryPoint[],
  opts?: {
    lookback?: number;
    minSwingPct?: number;
    minMatchedTotal?: number;
    minTicks?: number;
  },
): FluidityReport {
  const lookback = opts?.lookback ?? 12;
  const minSwingPct = opts?.minSwingPct ?? 0.12;
  const minMatchedTotal = opts?.minMatchedTotal ?? 30;
  const minTicks = opts?.minTicks ?? 3;

  const recent = points.slice(-lookback);
  const blockers: string[] = [];

  if (recent.length < 2) {
    return {
      level: "dead",
      score: 5,
      tradable: false,
      lateralized: true,
      points: recent.length,
      uniqueOdds: recent.length ? 1 : 0,
      swingPct: 0,
      totalMatched: 0,
      avgMatched: 0,
      lastMatched: 0,
      volumeNow: recent.at(-1)?.volume ?? 0,
      volumeDelta: 0,
      ticksPerHour: 0,
      detail: "Histórico insuficiente para medir fluidez.",
      blockers: ["Poucos ticks de odd/volume"],
    };
  }

  const odds = recent.map((p) => p.odd).filter((n) => n > 0);
  const matched = recent.map((p) => Number(p.matched) || 0);
  const volumes = recent.map((p) => Number(p.volume) || 0);
  const uniqueOdds = new Set(odds.map((o) => o.toFixed(2))).size;
  const recentMin = Math.min(...odds);
  const recentMax = Math.max(...odds);
  const swingPct = (recentMax - recentMin) / Math.max(recentMin, 1e-9);
  const totalMatched = matched.reduce((s, n) => s + n, 0);
  const avgMatched = totalMatched / matched.length;
  const lastMatched = matched[matched.length - 1] ?? 0;
  const volumeNow = volumes[volumes.length - 1] ?? 0;
  const volumeDelta = volumeNow - (volumes[0] ?? volumeNow);

  const t0 = new Date(recent[0].createdAt).getTime();
  const t1 = new Date(recent[recent.length - 1].createdAt).getTime();
  const hours = Math.max((t1 - t0) / 3_600_000, 1 / 60);
  const ticksPerHour = recent.length / hours;

  // Odd quase constante = lateralizado
  const oddChanges = odds.slice(1).filter((o, i) => o !== odds[i]).length;
  const lateralized =
    swingPct < minSwingPct * 0.5 ||
    (uniqueOdds <= 2 && swingPct < minSwingPct) ||
    oddChanges === 0;

  if (recent.length < minTicks) blockers.push("Poucos prints no book");
  if (lateralized) blockers.push("Mercado lateralizado (odd parada)");
  if (swingPct < minSwingPct) blockers.push("Oscilação fraca para entrar/sair");
  if (totalMatched < minMatchedTotal && volumeDelta < minMatchedTotal) {
    blockers.push("Volume/matched baixo");
  }
  if (ticksPerHour < 4) blockers.push("Baixa frequência de negócios");

  let score = 40;
  score += Math.min(25, swingPct * 100);
  score += Math.min(15, uniqueOdds * 3);
  score += Math.min(15, Math.log10(Math.max(totalMatched, 1)) * 6);
  score += Math.min(10, ticksPerHour);
  if (volumeDelta > 0) score += Math.min(10, Math.log10(volumeDelta + 1) * 4);
  if (lateralized) score -= 35;
  if (lastMatched >= median(matched.filter((n) => n > 0)) * 2) score += 8;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: FluidityLevel = "ok";
  if (score < 25 || (lateralized && totalMatched < minMatchedTotal)) level = "dead";
  else if (lateralized || score < 45) level = "lateral";
  else if (score >= 70) level = "liquid";
  else level = "ok";

  const tradable = level === "ok" || level === "liquid";

  const detail = tradable
    ? `Fluidez ${level} (${score}/100): swing ${(swingPct * 100).toFixed(0)}% · matched R$ ${totalMatched.toFixed(0)} · ${ticksPerHour.toFixed(1)} ticks/h`
    : `Sem fluidez (${level}, ${score}/100): ${blockers.slice(0, 2).join(" · ") || "mercado difícil de operar"}`;

  return {
    level,
    score,
    tradable,
    lateralized,
    points: recent.length,
    uniqueOdds,
    swingPct,
    totalMatched,
    avgMatched,
    lastMatched,
    volumeNow,
    volumeDelta,
    ticksPerHour,
    detail,
    blockers,
  };
}

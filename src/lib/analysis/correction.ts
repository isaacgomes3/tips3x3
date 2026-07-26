import type { OddsHistoryPoint } from "../betbra/odds-history";
import type { InplayEvent } from "../betbra/types";

export type CorrectionPhase =
  | "none"
  | "shock"
  | "trough"
  | "correcting"
  | "completed";

export interface OddsShock {
  peakOdd: number;
  troughOdd: number;
  peakAt: string;
  troughAt: string;
  dropPct: number;
  /** minutos entre pico e fundo */
  dropMinutes: number;
}

export interface CorrectionEpisode {
  shock: OddsShock;
  /** odd atual na série */
  currentOdd: number;
  currentAt: string;
  /** fração recuperada do drop (0–1+) */
  recoveredPct: number;
  /** minutos desde o fundo */
  minutesSinceTrough: number;
  /** minutos estimados/medios de correção observados */
  avgCorrectionMinutes: number | null;
  /** progresso vs média (0–1+) */
  timeProgressVsAvg: number | null;
  phase: CorrectionPhase;
  /** movimento favorável = corrigindo para cima (bom para lay→back) */
  favorableMove: boolean;
  slopePerMinute: number;
  detail: string;
}

export interface UnderdogGoalEvent {
  at: string;
  minute: number | null;
  team: "home" | "away" | "unknown";
  teamName?: string;
  isUnderdog: boolean;
}

export interface UnderdogCrashPattern {
  matched: boolean;
  quality: "strong" | "weak" | "none";
  peakOdd: number;
  troughOdd: number;
  currentOdd: number;
  dropPct: number;
  /** minutos do gol da zebra ao fundo (null se sem gol confirmado) */
  minutesGoalToTrough: number | null;
  minutesIntoCorrection: number;
  recoveredPct: number;
  goalLinked: boolean;
  goal?: UnderdogGoalEvent;
  /** alta chance de bounce rápido pós-crash de lay alto */
  favorsQuickBounce: boolean;
  phase: CorrectionPhase;
  detail: string;
}

export interface CorrectionAnalysis {
  favoriteSide: "home" | "away" | "unknown";
  underdogGoals: UnderdogGoalEvent[];
  latestShock: OddsShock | null;
  episode: CorrectionEpisode | null;
  underdogCrash: UnderdogCrashPattern | null;
  avgCorrectionMinutes: number | null;
  sampleSize: number;
  entryBias: "favor" | "neutral" | "avoid";
  summary: string;
}

function parseUpdateTime(raw?: string): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isFinite(t)) return t;
  // "Sun Jul 26 08:30:00 UTC 2026"
  const alt = Date.parse(raw.replace(" UTC ", " "));
  return Number.isFinite(alt) ? alt : null;
}

function slopePerMinute(points: OddsHistoryPoint[]): number {
  if (points.length < 2) return 0;
  const a = points[0];
  const b = points[points.length - 1];
  const dtMin =
    (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) /
    60_000;
  if (dtMin <= 0) return 0;
  return (b.odd - a.odd) / dtMin;
}

/**
 * Detecta choques (queda rápida de odd) e a fase de correção seguinte.
 * Correção favorável ao lay→back = odd subindo após o fundo.
 */
export function detectShocksAndCorrections(
  points: OddsHistoryPoint[],
  opts?: {
    minDropPct?: number;
    maxDropMinutes?: number;
    lookbackSlope?: number;
  },
): {
  shocks: OddsShock[];
  episodes: CorrectionEpisode[];
  avgCorrectionMinutes: number | null;
} {
  const minDropPct = opts?.minDropPct ?? 0.18;
  const maxDropMinutes = opts?.maxDropMinutes ?? 90;
  const lookbackSlope = opts?.lookbackSlope ?? 4;

  if (points.length < 4) {
    return { shocks: [], episodes: [], avgCorrectionMinutes: null };
  }

  const sorted = [...points].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const shocks: OddsShock[] = [];

  // Varre em busca de pico → fundo com queda relevante
  for (let i = 2; i < sorted.length; i++) {
    // local peak in previous window
    const window = sorted.slice(Math.max(0, i - 8), i + 1);
    const peak = window.reduce((best, p) => (p.odd > best.odd ? p : best));
    const trough = sorted[i];
    if (peak.createdAt >= trough.createdAt) continue;

    const dropPct = (peak.odd - trough.odd) / Math.max(peak.odd, 1e-9);
    const dropMinutes =
      (new Date(trough.createdAt).getTime() -
        new Date(peak.createdAt).getTime()) /
      60_000;

    if (dropPct < minDropPct) continue;
    if (dropMinutes <= 0 || dropMinutes > maxDropMinutes) continue;
    // trough should be near a local minimum
    const next = sorted[i + 1];
    if (next && next.odd < trough.odd) continue;

    // avoid duplicates close in time
    const last = shocks[shocks.length - 1];
    if (
      last &&
      Math.abs(
        new Date(trough.createdAt).getTime() -
          new Date(last.troughAt).getTime(),
      ) < 3 * 60_000
    ) {
      if (trough.odd < last.troughOdd) {
        shocks[shocks.length - 1] = {
          peakOdd: peak.odd,
          troughOdd: trough.odd,
          peakAt: peak.createdAt,
          troughAt: trough.createdAt,
          dropPct,
          dropMinutes,
        };
      }
      continue;
    }

    shocks.push({
      peakOdd: peak.odd,
      troughOdd: trough.odd,
      peakAt: peak.createdAt,
      troughAt: trough.createdAt,
      dropPct,
      dropMinutes,
    });
  }

  // Fallback: queda material no histórico inteiro terminando perto do fundo atual
  if (shocks.length === 0 && sorted.length >= 3) {
    const peak = sorted.reduce((b, p) => (p.odd > b.odd ? p : b));
    const trough = sorted.reduce((b, p) => (p.odd < b.odd ? p : b));
    const dropPct = (peak.odd - trough.odd) / Math.max(peak.odd, 1e-9);
    const dropMinutes =
      (new Date(trough.createdAt).getTime() -
        new Date(peak.createdAt).getTime()) /
      60_000;
    if (
      dropPct >= minDropPct &&
      dropMinutes > 0 &&
      new Date(trough.createdAt).getTime() >= new Date(peak.createdAt).getTime()
    ) {
      shocks.push({
        peakOdd: peak.odd,
        troughOdd: trough.odd,
        peakAt: peak.createdAt,
        troughAt: trough.createdAt,
        dropPct,
        dropMinutes,
      });
    }
  }

  const correctionDurations: number[] = [];
  const episodes: CorrectionEpisode[] = [];

  for (const shock of shocks) {
    const troughIdx = sorted.findIndex((p) => p.createdAt === shock.troughAt);
    if (troughIdx < 0) continue;
    const after = sorted.slice(troughIdx);
    const current = after[after.length - 1] ?? sorted[troughIdx];
    const dropSize = shock.peakOdd - shock.troughOdd;
    const recovered = current.odd - shock.troughOdd;
    const recoveredPct = dropSize > 0 ? recovered / dropSize : 0;
    const minutesSinceTrough =
      (new Date(current.createdAt).getTime() -
        new Date(shock.troughAt).getTime()) /
      60_000;

    // tempo até recuperar 50% do drop (proxy de correção)
    let halfRecoveryMin: number | null = null;
    for (const p of after) {
      const rec = (p.odd - shock.troughOdd) / Math.max(dropSize, 1e-9);
      if (rec >= 0.5) {
        halfRecoveryMin =
          (new Date(p.createdAt).getTime() -
            new Date(shock.troughAt).getTime()) /
          60_000;
        break;
      }
    }
    if (halfRecoveryMin != null && halfRecoveryMin > 0) {
      correctionDurations.push(halfRecoveryMin);
    }

    const recentSlopePts = after.slice(-lookbackSlope);
    const slope = slopePerMinute(
      recentSlopePts.length >= 2 ? recentSlopePts : after.slice(0, 2),
    );

    let phase: CorrectionPhase = "none";
    if (minutesSinceTrough <= 1.5 && slope <= 0) phase = "trough";
    else if (slope < -0.15 && recoveredPct < 0.15) phase = "shock";
    else if (recoveredPct >= 0.85 && slope < 0.05) phase = "completed";
    else if (slope > 0.05 || (recoveredPct > 0.08 && slope >= 0))
      phase = "correcting";
    else if (recoveredPct < 0.08) phase = "trough";
    else phase = "correcting";

    const favorableMove = phase === "correcting" && slope > 0;

    episodes.push({
      shock,
      currentOdd: current.odd,
      currentAt: current.createdAt,
      recoveredPct,
      minutesSinceTrough,
      avgCorrectionMinutes: null, // preenchido depois
      timeProgressVsAvg: null,
      phase,
      favorableMove,
      slopePerMinute: slope,
      detail: "",
    });
  }

  const avgCorrectionMinutes =
    correctionDurations.length > 0
      ? correctionDurations.reduce((s, n) => s + n, 0) /
        correctionDurations.length
      : null;

  for (const ep of episodes) {
    ep.avgCorrectionMinutes = avgCorrectionMinutes;
    ep.timeProgressVsAvg =
      avgCorrectionMinutes && avgCorrectionMinutes > 0
        ? ep.minutesSinceTrough / avgCorrectionMinutes
        : null;

    const avgTxt =
      avgCorrectionMinutes != null
        ? `média ~${avgCorrectionMinutes.toFixed(1)} min p/ 50% correção`
        : "sem média ainda";

    if (ep.phase === "correcting") {
      ep.detail = `Corrigindo ↑ ${(ep.recoveredPct * 100).toFixed(0)}% do drop (${ep.shock.peakOdd.toFixed(0)}→${ep.shock.troughOdd.toFixed(0)}→${ep.currentOdd.toFixed(0)}) · ${ep.minutesSinceTrough.toFixed(1)} min desde fundo · ${avgTxt}`;
    } else if (ep.phase === "trough" || ep.phase === "shock") {
      ep.detail = `Pós-choque (queda ${(ep.shock.dropPct * 100).toFixed(0)}%). Aguardar início da correção · ${avgTxt}`;
    } else if (ep.phase === "completed") {
      ep.detail = `Correção já avançada/completa (${(ep.recoveredPct * 100).toFixed(0)}%). Movimento favorável pode ter passado.`;
    } else {
      ep.detail = "Sem fase de correção clara.";
    }
  }

  return { shocks, episodes, avgCorrectionMinutes };
}

export function detectUnderdogGoals(
  inplay: InplayEvent | undefined,
  favoriteSide: "home" | "away" | "unknown",
): UnderdogGoalEvent[] {
  if (!inplay?.updateDetails?.length) return [];

  const goals = inplay.updateDetails.filter((u) => {
    const type = `${u.type ?? ""}|${(u as { updateType?: string }).updateType ?? ""}`.toUpperCase();
    return (
      type.includes("GOAL") ||
      type.includes("|G|") ||
      (u as { updateType?: string }).updateType === "G"
    );
  });

  return goals.map((g) => {
    const team =
      g.team === "home" || g.team === "away" ? g.team : ("unknown" as const);
    const isUnderdog =
      favoriteSide !== "unknown" &&
      team !== "unknown" &&
      team !== favoriteSide;
    return {
      at: g.updateTime ?? "",
      minute: g.matchTime ? Number(g.matchTime) : null,
      team,
      teamName: g.teamName,
      isUnderdog,
    };
  });
}

export function resolveFavoriteSide(matchOdds: {
  home?: { back?: number | null };
  away?: { back?: number | null };
}): "home" | "away" | "unknown" {
  const h = matchOdds.home?.back;
  const a = matchOdds.away?.back;
  if (h == null || a == null || !Number.isFinite(h) || !Number.isFinite(a)) {
    return "unknown";
  }
  if (h < a) return "home";
  if (a < h) return "away";
  return "unknown";
}

/**
 * Padrão: lay alto (sem tese back 3-3 clássica) → crash após gol da zebra
 * → probabilidade alta de correção rápida (odd sobe de novo).
 *
 * Entrada boa = no início da subida pós-fundo, não chasear o crash.
 */
export function detectUnderdogCrashPattern(opts: {
  episode: CorrectionEpisode | null;
  underdogGoals: UnderdogGoalEvent[];
  highLayPeakMin?: number;
  minDropPct?: number;
  goalShockMaxMinutes?: number;
  maxRecoveryPct?: number;
}): UnderdogCrashPattern | null {
  const ep = opts.episode;
  if (!ep) return null;

  const highLayPeakMin = opts.highLayPeakMin ?? 55;
  const minDropPct = opts.minDropPct ?? 0.35;
  const goalShockMaxMinutes = opts.goalShockMaxMinutes ?? 12;
  const maxRecoveryPct = opts.maxRecoveryPct ?? 0.45;

  const { shock } = ep;
  const highPeak = shock.peakOdd >= highLayPeakMin;
  const bigDrop = shock.dropPct >= minDropPct;
  if (!highPeak || !bigDrop) {
    return {
      matched: false,
      quality: "none",
      peakOdd: shock.peakOdd,
      troughOdd: shock.troughOdd,
      currentOdd: ep.currentOdd,
      dropPct: shock.dropPct,
      minutesGoalToTrough: null,
      minutesIntoCorrection: ep.minutesSinceTrough,
      recoveredPct: ep.recoveredPct,
      goalLinked: false,
      favorsQuickBounce: false,
      phase: ep.phase,
      detail: highPeak
        ? "Pico alto, mas queda ainda pequena para padrão zebra-crash."
        : "Sem lay alto pré-crash (padrão clássico de back 3-3 ausente só com pico elevado).",
    };
  }

  const peakTs = new Date(shock.peakAt).getTime();
  const troughTs = new Date(shock.troughAt).getTime();

  let bestGoal: UnderdogGoalEvent | undefined;
  let minutesGoalToTrough: number | null = null;
  let bestAlign = Number.POSITIVE_INFINITY;

  for (const g of opts.underdogGoals.filter((x) => x.isUnderdog)) {
    const gt = parseUpdateTime(g.at);
    if (gt == null) continue;
    // gol perto do pico ou entre pico e fundo
    const toPeakMin = Math.abs(gt - peakTs) / 60_000;
    const inDropWindow = gt >= peakTs - 3 * 60_000 && gt <= troughTs + 3 * 60_000;
    const align = inDropWindow ? toPeakMin : toPeakMin + 30;
    if (align < bestAlign && toPeakMin <= goalShockMaxMinutes + 5) {
      bestAlign = align;
      bestGoal = g;
      minutesGoalToTrough = (troughTs - gt) / 60_000;
    }
  }

  const goalLinked =
    bestGoal != null &&
    minutesGoalToTrough != null &&
    Math.abs(minutesGoalToTrough) <= goalShockMaxMinutes + 5;

  const earlyCorrection =
    ep.recoveredPct <= maxRecoveryPct &&
    (ep.phase === "correcting" ||
      ep.phase === "trough" ||
      ep.phase === "shock");

  const favorsQuickBounce = earlyCorrection && shock.dropPct >= minDropPct;

  let quality: UnderdogCrashPattern["quality"] = "weak";
  if (goalLinked && favorsQuickBounce) quality = "strong";
  else if (favorsQuickBounce && shock.peakOdd >= highLayPeakMin * 1.2)
    quality = "strong"; // crash brutal mesmo sem gol no feed
  else if (!favorsQuickBounce && ep.phase === "completed") quality = "weak";

  const matched = goalLinked || shock.dropPct >= 0.4;
  if (!matched) quality = "none";

  const goalTxt = bestGoal
    ? `gol zebra${bestGoal.teamName ? ` (${bestGoal.teamName})` : ""}${bestGoal.minute != null ? ` ${bestGoal.minute}'` : ""}`
    : "crash sem gol zebra no feed";

  let detail: string;
  if (ep.phase === "correcting" && ep.favorableMove) {
    detail = `Padrão zebra-crash (${shock.peakOdd.toFixed(0)}→${shock.troughOdd.toFixed(0)}, ${goalTxt}): correção ↑ em curso — boa janela de lay→back.`;
  } else if (ep.phase === "trough" || ep.phase === "shock") {
    detail = `Padrão zebra-crash (${shock.peakOdd.toFixed(0)}→${shock.troughOdd.toFixed(0)}, ${goalTxt}): alta chance de correção rápida — aguardar 1º tick ↑, não chasear o fundo.`;
  } else if (ep.phase === "completed") {
    detail = `Padrão zebra-crash já recuperou ${(ep.recoveredPct * 100).toFixed(0)}% — movimento rápido pode ter passado.`;
  } else {
    detail = `Lay alto ${shock.peakOdd.toFixed(0)} caiu ${(shock.dropPct * 100).toFixed(0)}% (${goalTxt}). Monitorar início da correção.`;
  }

  return {
    matched,
    quality: matched ? quality : "none",
    peakOdd: shock.peakOdd,
    troughOdd: shock.troughOdd,
    currentOdd: ep.currentOdd,
    dropPct: shock.dropPct,
    minutesGoalToTrough,
    minutesIntoCorrection: ep.minutesSinceTrough,
    recoveredPct: ep.recoveredPct,
    goalLinked,
    goal: bestGoal,
    favorsQuickBounce,
    phase: ep.phase,
    detail,
  };
}

export function analyzeCorrection(opts: {
  historyPoints: OddsHistoryPoint[];
  inplay?: InplayEvent;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
  crashOpts?: {
    highLayPeakMin?: number;
    minDropPct?: number;
    goalShockMaxMinutes?: number;
    maxRecoveryPct?: number;
  };
}): CorrectionAnalysis {
  const favoriteSide = resolveFavoriteSide(opts.matchOdds ?? {});
  const underdogGoals = detectUnderdogGoals(opts.inplay, favoriteSide);
  const { shocks, episodes, avgCorrectionMinutes } = detectShocksAndCorrections(
    opts.historyPoints,
  );

  const latestEpisode = episodes.at(-1) ?? null;
  const latestShock = shocks.at(-1) ?? null;

  const underdogCrash = detectUnderdogCrashPattern({
    episode: latestEpisode,
    underdogGoals,
    ...opts.crashOpts,
  });

  // Se houve gol da zebra recente, reforça narrativa mesmo sem shock perfeito
  const recentUnderdogGoal = [...underdogGoals]
    .reverse()
    .find((g) => g.isUnderdog);

  let entryBias: CorrectionAnalysis["entryBias"] = "neutral";
  if (latestEpisode?.favorableMove) entryBias = "favor";
  else if (
    latestEpisode?.phase === "completed" ||
    latestEpisode?.phase === "shock" ||
    latestEpisode?.phase === "trough"
  ) {
    entryBias = latestEpisode.phase === "completed" ? "avoid" : "neutral";
  }
  if (!latestEpisode && !recentUnderdogGoal) entryBias = "avoid";

  // Crash forte no fundo: não evitar — é setup de espera ativa
  if (
    underdogCrash?.matched &&
    (latestEpisode?.phase === "trough" || latestEpisode?.phase === "shock")
  ) {
    entryBias = "neutral";
  }

  // Correção já começou após crash alto: reforça favor
  if (
    underdogCrash?.matched &&
    underdogCrash.favorsQuickBounce &&
    latestEpisode?.favorableMove
  ) {
    entryBias = "favor";
  }

  // Correção avançada demais no padrão: evitar chase
  if (
    underdogCrash?.matched &&
    latestEpisode?.phase === "completed" &&
    (underdogCrash.recoveredPct ?? 0) >= 0.7
  ) {
    entryBias = "avoid";
  }

  let summary: string;
  if (underdogCrash?.matched) {
    summary = underdogCrash.detail;
    if (latestEpisode?.favorableMove) {
      summary += ` Odd ${latestEpisode.currentOdd.toFixed(0)} subindo após o fundo.`;
    }
  } else if (latestEpisode?.favorableMove) {
    summary = `Mercado em correção favorável (odd subindo). ${latestEpisode.detail}`;
  } else if (latestEpisode) {
    summary = latestEpisode.detail;
  } else if (recentUnderdogGoal) {
    summary = `Gol da zebra (${recentUnderdogGoal.teamName ?? recentUnderdogGoal.team}${recentUnderdogGoal.minute != null ? ` ${recentUnderdogGoal.minute}'` : ""}). Aguardar choque→correção na odd antes de entrar.`;
  } else {
    summary =
      "Sem correção detectada. Não entrar só pela odd — espere movimento favorável pós-choque.";
  }

  if (avgCorrectionMinutes != null) {
    summary += ` Noção média de correção: ~${avgCorrectionMinutes.toFixed(1)} min.`;
  }

  return {
    favoriteSide,
    underdogGoals,
    latestShock,
    episode: latestEpisode,
    underdogCrash,
    avgCorrectionMinutes,
    sampleSize: shocks.length,
    entryBias,
    summary,
  };
}

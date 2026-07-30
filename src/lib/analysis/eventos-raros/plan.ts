import type { TeamFormReport } from "@/lib/fotmob/form";
import { gapTicks } from "@/lib/analysis/over-limite/ticks";
import { EVENTOS_RAROS } from "./config";
import type {
  EventosRarosCandidate,
  EventosRarosIndicator,
  EventosRarosSnapshot,
  IndicatorTone,
} from "./types";
import { EVENTOS_RAROS_INDICATOR_META } from "./types";

function tone(good: boolean, warn: boolean): IndicatorTone {
  if (good) return "good";
  if (warn) return "warn";
  return "bad";
}

function sideLambda(
  form: TeamFormReport | null | undefined,
  side: "home" | "away",
): number | null {
  if (!form) return null;
  if (side === "home") {
    const h = form.home;
    if (!h) return null;
    const v = h.homePlayed >= 2 ? h.homeAvgScored : h.avgScored;
    return Number.isFinite(v) ? v : null;
  }
  const a = form.away;
  if (!a) return null;
  const v = a.awayPlayed >= 2 ? a.awayAvgScored : a.avgScored;
  return Number.isFinite(v) ? v : null;
}

/** P(X = k) Poisson. */
function poissonPmf(lambda: number, k: number): number {
  if (!(lambda >= 0) || k < 0 || !Number.isFinite(lambda)) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  let logP = -lambda;
  for (let i = 1; i <= k; i += 1) logP += Math.log(lambda) - Math.log(i);
  return Math.exp(logP);
}

function remainingFraction(minute: number): number {
  const full = EVENTOS_RAROS.fullTimeMinute;
  return Math.max(0.02, Math.min(1, (full - minute) / full));
}

/**
 * P(exato alvo | placar atual) com λ restantes = λ90 × fração restante.
 * Independente se needed=0 (já bateu) → 1. Impossível → 0.
 */
function modelExactScoreProb(opts: {
  targetHome: number;
  targetAway: number;
  homeScore: number;
  awayScore: number;
  minute: number;
  teamForm?: TeamFormReport | null;
}): number | null {
  const needH = opts.targetHome - opts.homeScore;
  const needA = opts.targetAway - opts.awayScore;
  if (needH < 0 || needA < 0) return 0;
  if (needH === 0 && needA === 0) return 1;

  const lh90 = sideLambda(opts.teamForm, "home");
  const la90 = sideLambda(opts.teamForm, "away");
  if (lh90 == null || la90 == null) return null;

  const frac = remainingFraction(opts.minute);
  const lh = Math.max(0.01, lh90 * frac);
  const la = Math.max(0.01, la90 * frac);
  return poissonPmf(lh, needH) * poissonPmf(la, needA);
}

function isTimeBlocked(
  goalsNeeded: number,
  remainingMinutes: number,
  minute: number,
): boolean {
  const cfg = EVENTOS_RAROS.time;
  if (goalsNeeded < cfg.minGoalsNeeded) return false;
  if (
    minute >= EVENTOS_RAROS.minute.min &&
    goalsNeeded >= cfg.lateMinGoalsHard
  ) {
    return true;
  }
  if (remainingMinutes <= 0) return goalsNeeded > 0;
  const rate = goalsNeeded / remainingMinutes;
  return rate >= cfg.maxGoalsPerRemainingMin;
}

function rarityScore(c: {
  alreadyImpossible: boolean;
  timeBlocked: boolean;
  minute: number | null;
  layOdds: number;
  modelProb: number | null;
  stillPossible: boolean;
}): number {
  if (c.alreadyImpossible) {
    let s = EVENTOS_RAROS.alreadyImpossible.rarityBonus;
    s += Math.min(20, Math.log10(Math.max(c.layOdds, 100)) * 10);
    return s;
  }
  if (!c.stillPossible) return -1e9;
  let s = 0;
  if (c.timeBlocked) s += 40;
  if (c.minute != null) s += Math.min(25, Math.max(0, c.minute - 60) * 0.7);
  s += Math.min(20, Math.log10(Math.max(c.layOdds, 100)) * 10);
  if (c.modelProb != null) {
    s += Math.min(25, (1 - Math.min(1, c.modelProb * 50)) * 25);
  }
  return s;
}

function bookOk(c: {
  layOdds: number;
  liquidity: number;
}): boolean {
  if (!(c.layOdds >= EVENTOS_RAROS.minLayOdds)) return false;
  if (c.layOdds > EVENTOS_RAROS.oddsBand.max) return false;
  if (c.liquidity < EVENTOS_RAROS.minLayLiquidity) return false;
  // Gap back/lay não filtra: em CS raro o spread é sempre largo.
  return true;
}

/**
 * Gate por placar.
 * - alreadyImpossible: imediato — só live + lay ≥ min (sem liq/gap/late/modelo)
 * - stillPossible: late + time-gate B (+ modelo se disponível) + bookOk
 */
function candidateEntryReady(
  c: Omit<EventosRarosCandidate, "entryReady">,
  eventLiveOk: boolean,
  eventLateOk: boolean,
): boolean {
  if (c.settledHit) return false;

  if (c.alreadyImpossible && EVENTOS_RAROS.alreadyImpossible.enabled) {
    return (
      eventLiveOk &&
      c.layOdds >= EVENTOS_RAROS.minLayOdds &&
      c.layOdds <= EVENTOS_RAROS.oddsBand.max
    );
  }

  if (!bookOk(c)) return false;

  if (!eventLateOk) return false;
  if (!c.stillPossible) return false;
  if (!c.timeBlocked) return false;

  if (
    c.modelProb != null &&
    c.modelEdge != null &&
    !(c.modelEdge > 0 && c.modelProb < c.impliedProb * 0.85) &&
    c.modelEdge <= 0
  ) {
    return false;
  }
  return true;
}

function buildLiquidityIndicator(
  liquidity: number,
  opts?: { alreadyImpossible?: boolean },
): EventosRarosIndicator {
  const m = EVENTOS_RAROS_INDICATOR_META.liquidity;
  if (opts?.alreadyImpossible) {
    return {
      id: "liquidity",
      label: m.label,
      icon: m.icon,
      tone: "good",
      good: true,
      detail: `Sem filtro · impossível · book R$ ${liquidity.toFixed(0)}`,
      value: liquidity,
    };
  }
  const min = EVENTOS_RAROS.minLayLiquidity;
  const good = liquidity >= min;
  const warn = liquidity >= min * 0.5;
  return {
    id: "liquidity",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Lay R$ ${liquidity.toFixed(0)} (mín. ${min})`
      : `Liquidez fraca R$ ${liquidity.toFixed(0)} · mín. R$ ${min}`,
    value: liquidity,
  };
}

function buildLateWindowIndicator(
  minute: number | null,
  hasImpossibleEntry: boolean,
): EventosRarosIndicator {
  const m = EVENTOS_RAROS_INDICATOR_META["late-window"];
  const { min, max } = EVENTOS_RAROS.minute;
  if (hasImpossibleEntry) {
    return {
      id: "late-window",
      label: m.label,
      icon: m.icon,
      tone: "good",
      good: true,
      detail: "Placar já impossível — entrada imediata (sem janela late)",
      value: minute,
    };
  }
  if (minute == null) {
    return {
      id: "late-window",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Sem minuto live",
      value: null,
    };
  }
  const good = minute >= min && minute <= max;
  const warn = minute >= min - 10 && minute < min;
  return {
    id: "late-window",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `Minuto ${minute}' na janela ${min}–${max}'`
      : `Minuto ${minute}' fora ${min}–${max}'`,
    value: minute,
  };
}

function buildTimeImpossibilityIndicator(
  best: EventosRarosCandidate | null,
  entryCount: number,
): EventosRarosIndicator {
  const m = EVENTOS_RAROS_INDICATOR_META["time-impossibility"];
  if (best?.alreadyImpossible) {
    return {
      id: "time-impossibility",
      label: m.label,
      icon: m.icon,
      tone: "good",
      good: true,
      detail: `Placar ${best.label} já impossível pelo live — lay imediato`,
      value: 0,
    };
  }
  if (!best || !best.stillPossible) {
    return {
      id: "time-impossibility",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Sem candidato ainda possível",
      value: null,
    };
  }
  const rate = best.goalsPerRemainingMin;
  const good = best.timeBlocked || entryCount > 0;
  const warn =
    !good &&
    best.goalsNeeded >= EVENTOS_RAROS.time.minGoalsNeeded &&
    rate != null &&
    rate >= EVENTOS_RAROS.time.maxGoalsPerRemainingMin * 0.6;
  return {
    id: "time-impossibility",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail:
      entryCount > 1
        ? `${entryCount} placares com tempo quase inviável`
        : good
          ? `+${best.goalsNeeded} gols em ~${best.remainingMinutes.toFixed(0)}' — quase inviável`
          : `+${best.goalsNeeded} gols · ${best.remainingMinutes.toFixed(0)}' restantes (taxa ${rate?.toFixed(2) ?? "?"} g/min)`,
    value: rate,
  };
}

function buildModelEdgeIndicator(
  best: EventosRarosCandidate | null,
): EventosRarosIndicator {
  const m = EVENTOS_RAROS_INDICATOR_META["model-edge"];
  if (best?.alreadyImpossible) {
    return {
      id: "model-edge",
      label: m.label,
      icon: m.icon,
      tone: "good",
      good: true,
      detail: `P modelo 0% (impossível) ≪ implícita ${(best.impliedProb * 100).toFixed(2)}%`,
      value: best.impliedProb,
    };
  }
  if (!best || best.modelProb == null || best.modelEdge == null) {
    return {
      id: "model-edge",
      label: m.label,
      icon: m.icon,
      tone: "idle",
      good: false,
      detail: "Modelo/forma indisponível",
      value: null,
    };
  }
  const good = best.modelEdge > 0 && best.modelProb < best.impliedProb * 0.85;
  const warn = best.modelEdge > 0;
  return {
    id: "model-edge",
    label: m.label,
    icon: m.icon,
    tone: tone(good, warn),
    good,
    detail: good
      ? `P modelo ${(best.modelProb * 100).toFixed(2)}% ≪ implícita ${(best.impliedProb * 100).toFixed(2)}%`
      : `P modelo ${(best.modelProb * 100).toFixed(2)}% · implícita ${(best.impliedProb * 100).toFixed(2)}%`,
    value: best.modelEdge,
  };
}

export type HighLayCsInput = {
  label: string;
  home: number;
  away: number;
  marketId?: string;
  runnerId?: string;
  layOdds: number;
  backOdds: number | null;
  layLiquidity: number;
};

export function emptyEventosRarosSnapshot(): EventosRarosSnapshot {
  return {
    settled: false,
    best: null,
    entries: [],
    candidates: [],
    layOdds: null,
    backOdds: null,
    scoreLabel: null,
    scoreLabels: [],
    liquidity: 0,
    gapTicks: null,
    minute: null,
    homeScore: null,
    awayScore: null,
    indicators: [],
    goodCount: 0,
    entryReady: false,
    exitPlan: null,
    summary: "Eventos raros disponível ao vivo (CS lay ≥ 100).",
    blockers: ["Pré-live / sem feed live"],
  };
}

export function buildEventosRarosSnapshot(opts: {
  rawCandidates: HighLayCsInput[];
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: number | null;
  teamForm?: TeamFormReport | null;
  isLive?: boolean;
}): EventosRarosSnapshot {
  const isLive = opts.isLive === true;
  const hs =
    opts.homeScore != null && Number.isFinite(opts.homeScore)
      ? opts.homeScore
      : null;
  const as =
    opts.awayScore != null && Number.isFinite(opts.awayScore)
      ? opts.awayScore
      : null;
  const minute =
    opts.minute != null && Number.isFinite(opts.minute) ? opts.minute : null;
  const projected = opts.teamForm?.projectedTotalGoals ?? null;
  const blockers: string[] = [];

  if (!isLive) blockers.push("Somente live");
  if (hs == null || as == null) blockers.push("Sem placar live");

  const remainingMinutes =
    minute != null
      ? Math.max(EVENTOS_RAROS.fullTimeMinute - minute, 1)
      : EVENTOS_RAROS.fullTimeMinute;

  const minuteInWindow =
    minute != null &&
    minute >= EVENTOS_RAROS.minute.min &&
    minute <= EVENTOS_RAROS.minute.max;

  /** Live + placar — basta para placares já impossíveis. */
  const eventLiveOk = isLive && hs != null && as != null;

  /** Late + forma — só para candidatos ainda possíveis. */
  const eventLateOk =
    eventLiveOk &&
    minute != null &&
    minuteInWindow &&
    !(projected != null && projected > EVENTOS_RAROS.maxProjectedTotal);

  if (
    eventLiveOk &&
    !eventLateOk &&
    minute != null &&
    !minuteInWindow
  ) {
    // Só relevante se não houver impossível; senão não bloqueia o snapshot.
    blockers.push(
      `Minuto fora ${EVENTOS_RAROS.minute.min}–${EVENTOS_RAROS.minute.max}' (só late)`,
    );
  }
  if (
    eventLiveOk &&
    projected != null &&
    projected > EVENTOS_RAROS.maxProjectedTotal
  ) {
    blockers.push(`Projeção alta (~${projected.toFixed(1)}) (só late)`);
  }

  const analyzedBase: Array<Omit<EventosRarosCandidate, "entryReady">> = [];

  for (const raw of opts.rawCandidates) {
    if (
      !(raw.layOdds >= EVENTOS_RAROS.minLayOdds) ||
      raw.layOdds > EVENTOS_RAROS.oddsBand.max
    ) {
      continue;
    }

    const gap = gapTicks(raw.backOdds, raw.layOdds);
    const settledHit =
      hs != null && as != null && hs === raw.home && as === raw.away;
    /** Live já passou do alvo (ex. 4-2 vs 3-2). */
    const alreadyImpossible =
      !settledHit &&
      hs != null &&
      as != null &&
      (hs > raw.home || as > raw.away);
    const stillPossible =
      hs != null &&
      as != null &&
      raw.home >= hs &&
      raw.away >= as &&
      !settledHit;
    const goalsNeeded =
      hs != null && as != null && stillPossible
        ? raw.home - hs + (raw.away - as)
        : settledHit || alreadyImpossible
          ? 0
          : Number.POSITIVE_INFINITY;
    const goalsPerRemainingMin =
      Number.isFinite(goalsNeeded) && stillPossible
        ? goalsNeeded / remainingMinutes
        : alreadyImpossible
          ? 0
          : null;
    const timeBlocked =
      stillPossible &&
      minute != null &&
      Number.isFinite(goalsNeeded) &&
      isTimeBlocked(goalsNeeded, remainingMinutes, minute);

    const impliedProb = 1 / raw.layOdds;
    const modelProb = alreadyImpossible
      ? 0
      : stillPossible && hs != null && as != null && minute != null
        ? modelExactScoreProb({
            targetHome: raw.home,
            targetAway: raw.away,
            homeScore: hs,
            awayScore: as,
            minute,
            teamForm: opts.teamForm,
          })
        : settledHit
          ? 1
          : null;
    const modelEdge =
      modelProb != null ? impliedProb - modelProb : null;

    analyzedBase.push({
      label: raw.label,
      home: raw.home,
      away: raw.away,
      marketId: raw.marketId,
      runnerId: raw.runnerId,
      layOdds: raw.layOdds,
      backOdds: raw.backOdds,
      liquidity: raw.layLiquidity,
      gapTicks: gap,
      stillPossible,
      alreadyImpossible,
      settledHit,
      goalsNeeded: Number.isFinite(goalsNeeded) ? goalsNeeded : -1,
      remainingMinutes,
      goalsPerRemainingMin,
      timeBlocked: alreadyImpossible ? true : timeBlocked,
      impliedProb,
      modelProb,
      modelEdge,
      rarityScore: rarityScore({
        alreadyImpossible,
        timeBlocked,
        minute,
        layOdds: raw.layOdds,
        modelProb,
        stillPossible,
      }),
    });
  }

  analyzedBase.sort((a, b) => b.rarityScore - a.rarityScore);

  const analyzed: EventosRarosCandidate[] = analyzedBase.map((c) => ({
    ...c,
    entryReady: candidateEntryReady(c, eventLiveOk, eventLateOk),
  }));

  const entries = analyzed
    .filter((c) => c.entryReady)
    .slice(0, EVENTOS_RAROS.maxEntriesPerEvent);

  if (entries.length < analyzed.filter((c) => c.entryReady).length) {
    const keep = new Set(entries.map((e) => e.label));
    for (const c of analyzed) {
      if (c.entryReady && !keep.has(c.label)) c.entryReady = false;
    }
  }

  const top = analyzed.slice(0, EVENTOS_RAROS.topN);
  const hitSettled = analyzed.some((c) => c.settledHit);
  const bestReady = entries[0] ?? null;
  const bestImpossible =
    analyzed.find((c) => c.alreadyImpossible) ?? null;
  const bestPossible =
    analyzed.find((c) => c.stillPossible) ?? null;
  const best =
    bestReady ?? bestImpossible ?? bestPossible ?? top[0] ?? null;

  const hasImpossibleEntry = entries.some((e) => e.alreadyImpossible);
  const lateInd = buildLateWindowIndicator(minute, hasImpossibleEntry);
  const liqInd = buildLiquidityIndicator(
    bestReady?.liquidity ?? best?.liquidity ?? 0,
    {
      alreadyImpossible:
        hasImpossibleEntry ||
        Boolean(bestReady?.alreadyImpossible || best?.alreadyImpossible),
    },
  );
  const timeInd = buildTimeImpossibilityIndicator(best, entries.length);
  const edgeInd = buildModelEdgeIndicator(bestReady ?? best);
  const indicators: EventosRarosIndicator[] = [
    liqInd,
    lateInd,
    timeInd,
    edgeInd,
  ];

  // Blockers: não poluir se já há entrada impossível pronta
  if (!hasImpossibleEntry) {
    if (!best || analyzed.length === 0) {
      blockers.push("Sem CS com lay ≥ 100");
    }
    if (
      best &&
      !best.stillPossible &&
      !best.alreadyImpossible &&
      !hitSettled
    ) {
      blockers.push("Nenhum placar alto ainda possível / impossível");
    }
    if (
      eventLateOk &&
      bestPossible &&
      entries.length === 0 &&
      bestPossible.stillPossible &&
      !bestPossible.timeBlocked
    ) {
      blockers.push("Tempo ainda permite o placar (sem gate B)");
    }
    if (
      eventLiveOk &&
      analyzed.length > 0 &&
      entries.length === 0 &&
      !liqInd.good
    ) {
      blockers.push(liqInd.detail);
    }
  } else {
    // Limpa blockers de late que não se aplicam
    blockers.length = 0;
  }

  const settled = hitSettled && !bestPossible && !bestImpossible;
  const goodCount = settled
    ? 0
    : indicators.filter((i) => i.good).length;

  const entryReady = !settled && entries.length > 0;
  const scoreLabels = entries.map((e) => e.label);
  const scoreLabel = scoreLabels[0] ?? best?.label ?? null;

  const summary = settled
    ? `Eventos raros: placar ${analyzed.find((c) => c.settledHit)?.label ?? "?"} saiu — lay settled.`
    : entryReady
      ? hasImpossibleEntry
        ? entries.length > 1
          ? `IMEDIATO · Lay ${scoreLabels.join(", ")} (já impossíveis) · Hold`
          : `IMEDIATO · Lay ${bestReady!.label} x${bestReady!.layOdds.toFixed(0)} · placar live já invalida · Hold`
        : entries.length > 1
          ? `Lay ${scoreLabels.join(", ")} (${entries.length} placares) · mesmo saldo CS · Hold até settle`
          : `Lay ${bestReady!.label} x${bestReady!.layOdds.toFixed(0)} · +${bestReady!.goalsNeeded} gols / ${bestReady!.remainingMinutes.toFixed(0)}' · Hold até settle`
      : blockers.length
        ? `Eventos raros · ${blockers.slice(0, 2).join(" · ")}`
        : best?.alreadyImpossible
          ? `Watch impossível ${best.label} lay ${best.layOdds.toFixed(0)}`
          : best?.stillPossible
            ? `Watch ${best.label} lay ${best.layOdds.toFixed(0)} · +${best.goalsNeeded} gols`
            : "Sem candidato CS raro";

  return {
    settled,
    marketId: bestReady?.marketId ?? best?.marketId,
    runnerId: bestReady?.runnerId ?? best?.runnerId,
    best:
      best?.stillPossible || best?.settledHit || best?.alreadyImpossible
        ? best
        : null,
    entries,
    candidates: top,
    layOdds: bestReady?.layOdds ?? best?.layOdds ?? null,
    backOdds: bestReady?.backOdds ?? best?.backOdds ?? null,
    scoreLabel,
    scoreLabels,
    liquidity: bestReady?.liquidity ?? best?.liquidity ?? 0,
    gapTicks: bestReady?.gapTicks ?? best?.gapTicks ?? null,
    minute,
    homeScore: hs,
    awayScore: as,
    indicators: settled ? [] : indicators,
    goodCount,
    entryReady,
    exitPlan: null,
    summary: summary.trim(),
    blockers,
  };
}

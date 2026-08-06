/**
 * Geração de sinais para Lay Over Limite com Pressão
 * Converte snapshots ready em sinais para fila de extensão
 */

import type { ExtSignalPayload } from "@/lib/ext-signal-queue";
import type { LayOverLimitPressureSnapshot } from "@/lib/analysis/lay-over-limit-pressure";

export function layOverLimitPressureToSignal(
  snapshot: LayOverLimitPressureSnapshot,
  eventId: string,
  eventName: string,
  homeScore?: number | null,
  awayScore?: number | null,
  minute?: number | null,
): ExtSignalPayload | null {
  if (!snapshot.entryReady || !snapshot.layOdds) return null;

  const liveScore = homeScore != null && awayScore != null 
    ? `${Math.floor(homeScore)}-${Math.floor(awayScore)}`
    : "?-?";

  const signal: ExtSignalPayload = {
    eventId,
    eventName,
    name: eventName,
    matchName: eventName,
    title: eventName,
    score: `Over ${snapshot.line}`,
    kind: "lay-over-limit-pressure",
    liveScore,
    minute: minute ?? null,
    layOdds: snapshot.layOdds,
    marketId: snapshot.marketId,
    runnerId: snapshot.runnerId,
    /** Saída: green (lay→back) */
    exitMode: "green",
    targetBackOdds: snapshot.exitPlan?.targetBackOdds ?? null,
    targetProfitPct: snapshot.exitPlan?.targetProfitPct ?? null,
    at: Date.now(),
    /** Dedupe: eventId + Over line + placar live */
    dedupeKey: `${eventId}:over-${snapshot.line}:${liveScore}`,
  };

  return signal;
}

/** Gerar signal de LOLP com métodos simples */
export function generateLOLPSignalFromSnapshot(
  snapshot: LayOverLimitPressureSnapshot,
  eventId: string,
  eventName: string,
  homeScore?: number | null,
  awayScore?: number | null,
  minute?: number | null,
  mexchangeUrl?: string,
): ExtSignalPayload | null {
  const signal = layOverLimitPressureToSignal(
    snapshot,
    eventId,
    eventName,
    homeScore,
    awayScore,
    minute,
  );

  if (!signal) return null;

  // Adicionar URL do mexchange se disponível
  if (mexchangeUrl) {
    signal.mexchangeUrl = mexchangeUrl;
  }

  return signal;
}

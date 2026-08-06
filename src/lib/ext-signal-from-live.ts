/**
 * Publica na fila da extensão os ENTRAR detectados no /api/live.
 * Publica só as estratégias que o painel do cliente autoriza em `allowedKinds`
 * (as pills ligadas). Sem essa lista — painel antigo — publica tudo e a
 * extensão decide sozinha, como era antes.
 * O painel precisa pedir `autoExt=1` e estar logado; a extensão faz claim.
 */

import { overSelectionLabel, qovSelectionLabel } from "@/lib/bolsa-bridge";
import { resolveExtEventName } from "@/lib/ext-event-label";
import { publishExtSignal } from "@/lib/ext-signal-queue";

type OverSnapLike = {
  entryReady?: boolean;
  settled?: boolean;
  marketId?: string;
  runnerId?: string;
  layOdds?: number | null;
  exitPlan?: {
    targetBackOdds?: number | null;
    targetProfitPct?: number | null;
  } | null;
} | null;

type LiveRowLike = {
  analysis?: {
    eventId?: string;
    eventName?: string;
    home?: string;
    away?: string;
    marketId?: string;
    runnerId?: string;
    layOdds?: number | null;
  };
  live?: {
    scoreLabel?: string;
    minute?: number | null;
  } | null;
  mexchangeUrl?: string;
  eventosRarosMexchangeUrl?: string;
  overMexchangeUrl35?: string;
  overMexchangeUrl45?: string;
  tradePlan?: {
    entryReady?: boolean;
    layOdds?: number | null;
    targetBackOdds?: number | null;
    targetProfitPct?: number | null;
  } | null;
  eventosRaros?: {
    entryReady?: boolean;
    settled?: boolean;
    marketId?: string;
    runnerId?: string;
    scoreLabel?: string | null;
    layOdds?: number | null;
    entries?: Array<{
      label: string;
      layOdds: number;
      runnerId?: string;
      marketId?: string;
      entryReady?: boolean;
      alreadyImpossible?: boolean;
    }>;
  } | null;
  qovMexchangeUrl?: string;
  qovLayUnderdog?: {
    entryReady?: boolean;
    settled?: boolean;
    underdogSide?: "home" | "away" | null;
    marketId?: string;
    runnerId?: string;
    layOdds?: number | null;
    entryOdds?: number | null;
    exitPlan?: {
      exitOdds?: number | null;
      targetProfitPct?: number | null;
    } | null;
  } | null;
  overLimite35?: OverSnapLike;
  overLimite45?: OverSnapLike;
  layOverLimitPressure?: Array<
    (NonNullable<OverSnapLike> & { line?: number; mexchangeUrl?: string }) | null
  >;
};

export function publishExtSignalsFromLive(
  email: string,
  rows: LiveRowLike[],
  allowedKinds?: Set<string> | null,
): { published: number } {
  let published = 0;
  const at = Date.now();
  const allows = (kind: string) => !allowedKinds || allowedKinds.has(kind);

  for (const row of rows) {
    const eventId = String(row.analysis?.eventId || "").trim();
    if (!eventId) continue;
    const home = row.analysis?.home;
    const away = row.analysis?.away;
    const eventName = resolveExtEventName({
      eventName: row.analysis?.eventName,
      home,
      away,
      eventId,
    });
    const minute = row.live?.minute ?? null;
    const liveScore = row.live?.scoreLabel ?? undefined;

    if (row.tradePlan?.entryReady && allows("lay-3x3")) {
      const layOdds = Number(
        row.tradePlan.layOdds ?? row.analysis?.layOdds ?? 0,
      );
      if (layOdds > 1.01) {
        const score = "3-3";
        const dedupeKey = `${eventId}:lay-3x3`;
        publishExtSignal(email, {
          eventId,
          eventName,
          score,
          kind: "lay-3x3",
          home,
          away,
          minute,
          liveScore,
          layOdds,
          marketId: row.analysis?.marketId,
          runnerId: row.analysis?.runnerId,
          mexchangeUrl: row.mexchangeUrl,
          exitMode: "green",
          targetBackOdds: row.tradePlan.targetBackOdds ?? null,
          targetProfitPct: row.tradePlan.targetProfitPct ?? null,
          at,
          dedupeKey,
        });
        published += 1;
      }
    }

    const er = row.eventosRaros;
    if (er?.entryReady && !er.settled) {
      const entries =
        er.entries?.filter((e) => e.entryReady !== false && e.label) ??
        (er.scoreLabel
          ? [
              {
                label: er.scoreLabel,
                layOdds: Number(er.layOdds ?? 0),
                runnerId: er.runnerId,
                marketId: er.marketId,
                alreadyImpossible: false,
              },
            ]
          : []);

      for (const entry of entries) {
        const score = String(entry.label).trim();
        const layOdds = Number(entry.layOdds ?? 0);
        if (!score || !(layOdds > 1.01)) continue;
        const immediate = Boolean(entry.alreadyImpossible);
        const kind = immediate ? "lucro-certo" : "eventos-raros";
        if (!allows(kind)) continue;
        const dedupeKey = `${eventId}:eventos-raros:${score}`;
        publishExtSignal(email, {
          eventId,
          eventName,
          score,
          kind,
          home,
          away,
          minute,
          liveScore,
          layOdds,
          marketId: entry.marketId ?? er.marketId,
          runnerId: entry.runnerId,
          mexchangeUrl: row.eventosRarosMexchangeUrl ?? row.mexchangeUrl,
          exitMode: "hold",
          targetBackOdds: null,
          targetProfitPct: null,
          at,
          dedupeKey,
        });
        published += 1;
      }
    }

    const qov = row.qovLayUnderdog;
    if (qov?.entryReady && !qov.settled && qov.underdogSide && allows("qov-lay-zebra")) {
      const layOdds = Number(qov.entryOdds ?? qov.layOdds ?? 0);
      if (layOdds > 1.01) {
        publishExtSignal(email, {
          eventId,
          eventName,
          score: qovSelectionLabel(qov.underdogSide),
          kind: "qov-lay-zebra",
          home,
          away,
          minute,
          liveScore,
          layOdds,
          marketId: qov.marketId,
          runnerId: qov.runnerId,
          mexchangeUrl: row.qovMexchangeUrl ?? row.mexchangeUrl,
          exitMode: "green",
          targetBackOdds: qov.exitPlan?.exitOdds ?? null,
          targetProfitPct: qov.exitPlan?.targetProfitPct ?? null,
          at,
          dedupeKey: `${eventId}:qov-lay-zebra`,
        });
        published += 1;
      }
    }

    const publishOver = (
      snap: OverSnapLike | undefined,
      line: 3.5 | 4.5,
      mexUrl?: string,
    ) => {
      if (!snap?.entryReady || snap.settled) return;
      const layOdds = Number(snap.layOdds ?? 0);
      if (!(layOdds > 1.01)) return;
      const score = overSelectionLabel(line);
      const kind = line === 3.5 ? ("over-3.5" as const) : ("over-4.5" as const);
      if (!allows(kind)) return;
      const dedupeKey = `${eventId}:${kind}`;
      publishExtSignal(email, {
        eventId,
        eventName,
        score,
        kind,
        home,
        away,
        minute,
        liveScore,
        layOdds,
        marketId: snap.marketId,
        runnerId: snap.runnerId,
        mexchangeUrl: mexUrl ?? row.mexchangeUrl,
        exitMode: "green",
        targetBackOdds: snap.exitPlan?.targetBackOdds ?? null,
        targetProfitPct: snap.exitPlan?.targetProfitPct ?? null,
        at,
        dedupeKey,
      });
      published += 1;
    };

    publishOver(row.overLimite35, 3.5, row.overMexchangeUrl35);
    publishOver(row.overLimite45, 4.5, row.overMexchangeUrl45);

    for (const snap of allows("lay-over-limit-pressure")
      ? (row.layOverLimitPressure ?? [])
      : []) {
      if (!snap?.entryReady || snap.settled) continue;
      const layOdds = Number(snap.layOdds ?? 0);
      if (!(layOdds > 1.01)) continue;
      const line = Number(snap.line);
      if (!Number.isFinite(line)) continue;
      publishExtSignal(email, {
        eventId,
        eventName,
        score: overSelectionLabel(line),
        kind: "lay-over-limit-pressure",
        home,
        away,
        minute,
        liveScore,
        layOdds,
        marketId: snap.marketId,
        runnerId: snap.runnerId,
        mexchangeUrl: snap.mexchangeUrl ?? row.mexchangeUrl,
        exitMode: "green",
        targetBackOdds: snap.exitPlan?.targetBackOdds ?? null,
        targetProfitPct: snap.exitPlan?.targetProfitPct ?? null,
        at,
        dedupeKey: `${eventId}:lay-over-limit-pressure:${line}`,
      });
      published += 1;
    }
  }

  if (published > 0) {
    console.info(
      "[ext-signal] live-publish",
      email,
      `n=${published}`,
    );
  }
  return { published };
}

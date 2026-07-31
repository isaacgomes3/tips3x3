import { NextResponse } from "next/server";
import { buildEventosRarosSnapshot } from "@/lib/analysis/eventos-raros";
import { confirmLivePattern, toLiveSnapshot } from "@/lib/analysis/live";
import {
  extractLay3x3,
  extractQovMarket,
  listHighLayCorrectScores,
} from "@/lib/analysis/markets";
import { analyzePreLive } from "@/lib/analysis/prelive";
import { buildQovSnapshot } from "@/lib/analysis/qov";
import { buildTradePlan } from "@/lib/analysis/trade-plan";
import {
  getEventWithScoreBook,
  getInplayInfo,
  mexchangeEventUrl,
} from "@/lib/betbra/client";
import { parseProfitPctQuery } from "@/lib/betbra/config";
import { getOddsHistory } from "@/lib/betbra/odds-history";
import { analyzeTeamForm } from "@/lib/fotmob/form";
import { getFotmobMatchIntel } from "@/lib/fotmob/intel";
import {
  listIndications,
  reconcileAbsentIndications,
  settleEventIndications,
  syncEventosRarosIndications,
} from "@/lib/indications-store";
import { isFinishedStatus } from "@/lib/live-status";

export const dynamic = "force-dynamic";

const pressureCache = new Map<string, { at: number; value: number | null }>();
const PRESSURE_TTL_MS = 45_000;

async function getFavoritePressure(opts: {
  home: string;
  away: string;
  start: string;
  favoriteSide: "home" | "away";
}) {
  const key = `${opts.home}|${opts.away}|${opts.start}`.toLowerCase();
  const cached = pressureCache.get(key);
  if (cached && Date.now() - cached.at < PRESSURE_TTL_MS) return cached.value;

  const intel = await Promise.race([
    getFotmobMatchIntel(opts).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
  ]);
  const value =
    intel == null
      ? null
      : Math.max(
          0,
          opts.favoriteSide === "home"
            ? intel.pressure.homeBias - intel.pressure.awayBias
            : intel.pressure.awayBias - intel.pressure.homeBias,
        );
  pressureCache.set(key, { at: Date.now(), value });
  return value;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyWindow = searchParams.get("ideal") === "1";
    const limitRaw = Number(searchParams.get("limit") ?? 40);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 40;
    const targetProfitPct = parseProfitPctQuery(searchParams.get("profitPct"));

    const inplay = await getInplayInfo().catch(() => []);
    const slice = inplay.slice(0, limit);

    const rows = (
      await Promise.all(
        slice.map(async (ip) => {
          try {
            const event = await getEventWithScoreBook(ip.eventId, 3);
            const lay = extractLay3x3(event);
            // Mantém jogos live mesmo sem runner 3-3 ainda (mostra placar/minuto)
            const analysis = analyzePreLive(event, { targetProfitPct });
            if (onlyWindow && !analysis.idealOdds && lay.runner) {
              // se pediu janela e tem mercado 3-3 fora dela, ainda mostra live
              // (filtro ideal só esconde se quiser estrito — aqui não corta live)
            }

            let tradePlan = analysis.tradePlan;
            let qovLayUnderdog = analysis.qovLayUnderdog;
            let eventosRaros = analysis.eventosRaros;
            const teamFormPromise = analyzeTeamForm({
              home: analysis.home,
              away: analysis.away,
              start: analysis.start,
            }).catch(() => null);

            if (analysis.runnerId) {
              try {
                const history = await getOddsHistory({
                  runnerId: analysis.runnerId,
                  marketId: analysis.marketId,
                  minutesBefore: 60,
                  limit: 200,
                });
                const teamForm = await teamFormPromise;
                tradePlan = buildTradePlan({
                  layOdds: analysis.layOdds ?? history.data.at(-1)?.odd ?? null,
                  historyPoints: history.data,
                  inplay: ip,
                  matchOdds: analysis.matchOdds,
                  teamForm,
                  targetProfitPct,
                });
              } catch {
                // mantém tradePlan base
              }
            }

            try {
              const teamForm = await teamFormPromise;
              const favoriteSide =
                (analysis.matchOdds.home.back ?? 99) <=
                (analysis.matchOdds.away.back ?? 99)
                  ? "home"
                  : "away";
              const liveSnap = toLiveSnapshot(ip);
              const favoritePressureBias = await getFavoritePressure({
                home: analysis.home,
                away: analysis.away,
                start: analysis.start,
                favoriteSide,
              });

              const dogSide =
                favoriteSide === "home" ? ("away" as const) : ("home" as const);
              const qovDog = extractQovMarket(event, dogSide);

              const hasLiveScore = Boolean(liveSnap.scoreLabel);
              qovLayUnderdog = buildQovSnapshot({
                mode: "lay-underdog",
                layOdds: qovDog.layOdds,
                backOdds: qovDog.backOdds,
                liquidity: qovDog.layLiquidity,
                marketId: qovDog.marketId,
                runnerId: qovDog.runnerId,
                matchOdds: analysis.matchOdds,
                homeScore: hasLiveScore ? liveSnap.homeScore : null,
                awayScore: hasLiveScore ? liveSnap.awayScore : null,
                minute: liveSnap.minute,
                over25Back: analysis.over25,
                teamForm,
                favoritePressureBias,
                isLive: true,
              });

              const highLay = listHighLayCorrectScores(event, 100);
              eventosRaros = buildEventosRarosSnapshot({
                rawCandidates: highLay.candidates.map((c) => ({
                  label: c.label,
                  home: c.home,
                  away: c.away,
                  marketId: c.marketId,
                  runnerId: c.runnerId,
                  layOdds: c.layOdds,
                  backOdds: c.backOdds,
                  layLiquidity: c.layLiquidity,
                })),
                homeScore: hasLiveScore ? liveSnap.homeScore : null,
                awayScore: hasLiveScore ? liveSnap.awayScore : null,
                minute: liveSnap.minute,
                teamForm,
                isLive: true,
              });

              try {
                syncEventosRarosIndications({
                  eventId: analysis.eventId,
                  eventName: analysis.eventName,
                  home: analysis.home,
                  away: analysis.away,
                  minute: liveSnap.minute,
                  liveScoreLabel: hasLiveScore
                    ? liveSnap.scoreLabel
                    : null,
                  status: liveSnap.status,
                  finished:
                    isFinishedStatus(liveSnap.status) ||
                    isFinishedStatus(liveSnap.matchStatus) ||
                    eventosRaros.settled,
                  entries: [
                    ...eventosRaros.entries,
                    ...eventosRaros.candidates.filter((c) => c.settledHit),
                  ].map((c) => ({
                    label: c.label,
                    layOdds: c.layOdds,
                    alreadyImpossible: c.alreadyImpossible,
                    settledHit: c.settledHit,
                    entryReady: c.entryReady,
                  })),
                });
              } catch {
                // histórico não deve derrubar o feed live
              }
            } catch {
              // mantém qov / eventos raros base
            }

            const confirmation = confirmLivePattern(analysis, ip);
            // A confirmação pré-live serve apenas para monitoramento. A entrada
            // só é liberada pelo gate completo do plano (fluidez + correção +
            // placar + risco), evitando sinais divergentes.
            const alerts = confirmation.alerts.filter(
              (alert) => alert.severity !== "entry",
            );

            if (tradePlan.entryReady) {
              alerts.unshift({
                id: `${analysis.eventId}-trade-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · CORREÇÃO",
                message: `${analysis.eventName}: ${tradePlan.summary}`,
                at: new Date().toISOString(),
              });
            } else if (tradePlan.inEntryWindow && tradePlan.targetBackOdds) {
              const lateral = tradePlan.fluidity?.lateralized;
              const noMove = tradePlan.correction?.entryBias !== "favor";
              alerts.push({
                id: `${analysis.eventId}-trade-wait`,
                severity: "watch" as const,
                title: lateral
                  ? "Janela OK · mercado lateral"
                  : noMove
                    ? "Janela OK · sem correção"
                    : "Lay na janela 20–50",
                message: `${analysis.eventName}: lay ${tradePlan.layOdds?.toFixed(0)} · alvo back ${tradePlan.targetBackOdds.toFixed(0)} · ${tradePlan.correction?.summary ?? tradePlan.fluidity?.detail ?? "aguardando movimento"}`,
                at: new Date().toISOString(),
              });
            }

            if (qovLayUnderdog.entryReady) {
              alerts.unshift({
                id: `${analysis.eventId}-qov-lay-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · QOV ZEBRA",
                message: `${analysis.eventName}: ${qovLayUnderdog.summary}`,
                at: new Date().toISOString(),
              });
            }

            if (eventosRaros.entryReady) {
              const labels =
                eventosRaros.scoreLabels?.length > 0
                  ? eventosRaros.scoreLabels.join(", ")
                  : eventosRaros.scoreLabel ?? "?";
              const n = eventosRaros.entries?.length ?? 1;
              alerts.unshift({
                id: `${analysis.eventId}-eventos-raros-entry`,
                severity: "entry" as const,
                title:
                  n > 1
                    ? `ENTRADA LAY · EVENTOS RAROS (${n})`
                    : "ENTRADA LAY · EVENTOS RAROS",
                message: `${analysis.eventName}: ${labels} · ${eventosRaros.summary}`,
                at: new Date().toISOString(),
              });
            }

            return {
              ...confirmation,
              live: confirmation.live ?? toLiveSnapshot(ip),
              alerts,
              confirmed: tradePlan.entryReady,
              mexchangeUrl: mexchangeEventUrl(event.id, analysis.marketId),
              qovMexchangeUrl: qovLayUnderdog.marketId
                ? mexchangeEventUrl(event.id, qovLayUnderdog.marketId)
                : undefined,
              eventosRarosMexchangeUrl: eventosRaros.marketId
                ? mexchangeEventUrl(event.id, eventosRaros.marketId)
                : undefined,
              tradePlan,
              analysis: {
                ...analysis,
                tradePlan,
                qovLayUnderdog,
                eventosRaros,
              },
              qovLayUnderdog,
              eventosRaros,
            };
          } catch {
            // Evento live sem mercado exchange acessível — ainda lista placar
            const live = toLiveSnapshot(ip);
            const home = ip.score?.home?.name ?? "Casa";
            const away = ip.score?.away?.name ?? "Fora";
            return {
              analysis: {
                eventId: ip.eventId,
                eventName: `${home} vs ${away}`,
                home,
                away,
                start: new Date().toISOString(),
                competition: "Ao vivo",
                layOdds: null,
                oddsSource: "none" as const,
                liquidity: 0,
                volume3x3: 0,
                score: 0,
                idealOdds: false,
                watchlist: false,
                summary: "Feed ao vivo sem detalhe de mercado 3-3.",
                signals: [],
                matchOdds: { home: {}, draw: {}, away: {} },
                quotes: {
                  back: { odds: null, amount: 0 },
                  lay: { odds: null, amount: 0 },
                  lastMatched: null,
                },
              },
              live,
              confirmed: false,
              alerts: [],
              reasons: ["Sem detalhe de mercado exchange"],
              mexchangeUrl: mexchangeEventUrl(ip.eventId),
              tradePlan: undefined,
            };
          }
        }),
      )
    ).filter(Boolean);

    if (onlyWindow) {
      // Opcional: prioriza quem está na janela, mas não zera a lista
      rows.sort((a, b) => {
        const ae = a.tradePlan?.inEntryWindow ? 1 : 0;
        const be = b.tradePlan?.inEntryWindow ? 1 : 0;
        return be - ae;
      });
    }

    const alerts = rows
      .flatMap((r) =>
        r.alerts.map((a) => ({
          ...a,
          eventId: r.analysis.eventId,
          eventName: r.analysis.eventName,
          mexchangeUrl: r.mexchangeUrl,
        })),
      )
      .sort((a, b) => {
        const rank = { entry: 0, abort: 1, watch: 2, info: 3 } as const;
        return rank[a.severity] - rank[b.severity];
      });

    // Jogos costumam sumir do inplay sem status FT — resolve pendentes.
    const activeIds = new Set(rows.map((r) => String(r.analysis.eventId)));
    try {
      const pendingAbsent = listIndications()
        .filter((i) => i.result === "pending" && !activeIds.has(i.eventId))
        .slice(0, 8);
      const seenEvents = new Set<string>();
      await Promise.all(
        pendingAbsent.map(async (ind) => {
          if (seenEvents.has(ind.eventId)) return;
          seenEvents.add(ind.eventId);
          const intel = await Promise.race([
            getFotmobMatchIntel({
              home: ind.home,
              away: ind.away,
            }).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_500)),
          ]);
          const score = intel?.scoreLabel?.replace(/\s+/g, "") ?? null;
          const status = intel?.status ?? "";
          const looksLive = /\d|ao vivo|in play|HT|1H|2H/i.test(status);
          const finished =
            isFinishedStatus(status) || Boolean(score && !looksLive);
          if (score && finished) {
            settleEventIndications(ind.eventId, score, { finished: true });
          }
        }),
      );
      reconcileAbsentIndications(activeIds);
    } catch {
      // settle não deve derrubar o feed
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      inplayCount: inplay.length,
      monitored: rows.length,
      entries: rows.filter((r) => r.confirmed).length,
      rows,
      alerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { buildEventosRarosSnapshot } from "@/lib/analysis/eventos-raros";
import { confirmLivePattern, toLiveSnapshot } from "@/lib/analysis/live";
import {
  extractLay3x3,
  extractOverMarket,
  extractQovMarket,
  listHighLayCorrectScores,
} from "@/lib/analysis/markets";
import {
  LAY_OVER_LIMIT_PRESSURE,
  buildLayOverLimitPressureSnapshot,
  derivePressureFromIntel,
  type LayOverLimitPressureSnapshot,
} from "@/lib/analysis/lay-over-limit-pressure";
import { buildOverLimiteSnapshot } from "@/lib/analysis/over-limite";
import { analyzePreLive } from "@/lib/analysis/prelive";
import { buildQovSnapshot } from "@/lib/analysis/qov";
import { evaluateXgBalanceGate } from "@/lib/analysis/score-entry";
import { buildTradePlan } from "@/lib/analysis/trade-plan";
import {
  getEventWithScoreBook,
  getInplayInfo,
  mexchangeEventUrl,
} from "@/lib/betbra/client";
import { getLayXgGateConfig, parseProfitPctQuery } from "@/lib/betbra/config";
import { getOddsHistory } from "@/lib/betbra/odds-history";
import { analyzeTeamForm } from "@/lib/fotmob/form";
import { getFotmobMatchIntel } from "@/lib/fotmob/intel";
import {
  listIndications,
  reconcileAbsentIndications,
  settleEventIndications,
  syncEventosRarosIndications,
} from "@/lib/indications-store";
import {
  parseLiveMinute,
  pickTrustedLiveMinute,
} from "@/lib/live-minute";
import { evaluateIndicationGate } from "@/lib/match-eligibility";
import { isFinishedStatus } from "@/lib/live-status";
import { signalRank, type SignalStrategy } from "@/lib/strategy-priority";

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
    const offsetRaw = Number(searchParams.get("offset") ?? 0);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
    const targetProfitPct = parseProfitPctQuery(searchParams.get("profitPct"));
    // LOLP tem lucro alvo próprio (default 1%): o painel/APK manda o valor do
    // utilizador, senão fica no default da estratégia.
    const lolpProfitPctRaw = Number(searchParams.get("lolpProfitPct"));
    const lolpProfitPct =
      Number.isFinite(lolpProfitPctRaw) &&
      lolpProfitPctRaw > 0 &&
      lolpProfitPctRaw <= 0.05
        ? lolpProfitPctRaw
        : LAY_OVER_LIMIT_PRESSURE.defaultTargetProfitPct;

    const inplay = await getInplayInfo().catch(() => []);
    const slice = inplay.slice(offset, offset + limit);

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
            let overLimite35 = analysis.overLimite35;
            let overLimite45 = analysis.overLimite45;
            let postGoalCorrection: {
              selected: {
                line: number;
                layOdds: number;
                marketId: string;
                runnerId: string;
                stable: boolean;
              } | null;
            } = { selected: null };
            let layOverLimitPressure: Array<
              LayOverLimitPressureSnapshot & {
                mexchangeUrl?: string;
                eventId?: string;
                eventName?: string;
              }
            > = [];
            const teamFormPromise = analyzeTeamForm({
              home: analysis.home,
              away: analysis.away,
              start: analysis.start,
            }).catch(() => null);
            // xG live para gate Lay 3x3 (equilibrado → sem indicação)
            const fotmobIntelPromise = getFotmobMatchIntel({
              home: analysis.home,
              away: analysis.away,
              start: analysis.start,
            }).catch(() => null);

            if (analysis.runnerId) {
              try {
                const [history, teamForm, fotmobForTrade] = await Promise.all([
                  getOddsHistory({
                    runnerId: analysis.runnerId,
                    marketId: analysis.marketId,
                    minutesBefore: 60,
                    limit: 200,
                  }),
                  teamFormPromise,
                  fotmobIntelPromise,
                ]);
                tradePlan = buildTradePlan({
                  layOdds: analysis.layOdds ?? history.data.at(-1)?.odd ?? null,
                  historyPoints: history.data,
                  inplay: ip,
                  matchOdds: analysis.matchOdds,
                  teamForm,
                  xg: fotmobForTrade?.xg ?? null,
                  targetProfitPct,
                });
              } catch {
                // mantém tradePlan base
              }
            }

            let correctedLive = toLiveSnapshot(ip);
            try {
              const [teamForm, fotmobIntel] = await Promise.all([
                teamFormPromise,
                fotmobIntelPromise,
              ]);
              // Garante gate xG mesmo se o 1º buildTradePlan falhou / veio do pré-live.
              if (tradePlan && fotmobIntel?.xg) {
                const xgCfg = getLayXgGateConfig();
                const xgGate = evaluateXgBalanceGate(fotmobIntel.xg, {
                  minDiff: xgCfg.minDiff,
                  minRatio: xgCfg.minRatio,
                });
                if (!xgGate.allowed) {
                  tradePlan = {
                    ...tradePlan,
                    xgGate,
                    entryReady: false,
                    summary: xgGate.detail,
                  };
                } else if (!tradePlan.xgGate) {
                  tradePlan = { ...tradePlan, xgGate };
                }
              }
              const favoriteSide =
                (analysis.matchOdds.home.back ?? 99) <=
                (analysis.matchOdds.away.back ?? 99)
                  ? "home"
                  : "away";
              const liveSnapRaw = correctedLive;
              // Relógio: BetBra inplay-info é a fonte; FotMob só preenche buraco.
              // Conflito ≥10' bloqueia indicação (evaluateIndicationGate).
              const betbraMinute = liveSnapRaw.minute;
              const fotmobMinute = parseLiveMinute(fotmobIntel?.status);
              const trustedMinute = pickTrustedLiveMinute({
                betbraMinute,
                fotmobMinute,
              });
              const liveSnap = {
                ...liveSnapRaw,
                minute: trustedMinute,
              };
              correctedLive = liveSnap;

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
              const indicationGate = evaluateIndicationGate({
                competition: analysis.competition,
                fotmobCompetition: fotmobIntel?.competition,
                scoreLabel: hasLiveScore ? liveSnap.scoreLabel : null,
                minute: liveSnap.minute,
                betbraMinute,
                fotmobMinute,
              });

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
                redCards: liveSnap.redCards,
                hardBlockers: indicationGate.blockers,
                stoppage: fotmobIntel?.stoppage ?? null,
              });

              const totalGoals =
                hasLiveScore &&
                liveSnap.homeScore != null &&
                liveSnap.awayScore != null
                  ? liveSnap.homeScore + liveSnap.awayScore
                  : null;

              // Over Limite e LOLP varrem as mesmas linhas: cada mercado (e o seu
              // histórico) é buscado uma única vez por evento.
              type OverMarketData = {
                mkt: ReturnType<typeof extractOverMarket>;
                historyPoints: Awaited<
                  ReturnType<typeof getOddsHistory>
                >["data"];
              };
              const overMarketCache = new Map<number, Promise<OverMarketData>>();
              const loadOverMarket = (line: number) => {
                const cached = overMarketCache.get(line);
                if (cached) return cached;
                const pending = (async (): Promise<OverMarketData> => {
                  const mkt = extractOverMarket(event, line);
                  if (!mkt.runnerId) return { mkt, historyPoints: [] };
                  try {
                    const history = await getOddsHistory({
                      runnerId: mkt.runnerId,
                      marketId: mkt.marketId,
                      minutesBefore: 30,
                      limit: 120,
                    });
                    return { mkt, historyPoints: history.data };
                  } catch {
                    return { mkt, historyPoints: [] };
                  }
                })();
                overMarketCache.set(line, pending);
                return pending;
              };

              const rebuildOver = async (line: 3.5 | 4.5) => {
                const { mkt, historyPoints } = await loadOverMarket(line);
                return buildOverLimiteSnapshot({
                  layOdds: mkt.layOdds ?? historyPoints.at(-1)?.odd ?? null,
                  backOdds: mkt.backOdds,
                  layLiquidity: mkt.liquidity,
                  marketId: mkt.marketId,
                  runnerId: mkt.runnerId,
                  historyPoints,
                  over25Back: mkt.backOdds,
                  matchOdds: analysis.matchOdds,
                  favoriteSide,
                  favoritePressureBias,
                  teamForm,
                  totalGoals,
                  homeScore: hasLiveScore ? liveSnap.homeScore : null,
                  awayScore: hasLiveScore ? liveSnap.awayScore : null,
                  minute: liveSnap.minute,
                  line,
                  targetProfitPct,
                });
              };

              overLimite35 = await rebuildOver(3.5);
              overLimite45 = await rebuildOver(4.5);

              // O aparelho confirma a mudanca de placar em dois polls e espera
              // 30 s. O feed apenas informa a unica linha elegivel: sempre dois
              // gols inteiros acima do placar atual (1 gol -> Over 3.5).
              const postGoalLine = totalGoals == null ? null : totalGoals + 2.5;
              const postGoalMarket =
                postGoalLine === 3.5
                  ? overLimite35
                  : postGoalLine === 4.5
                    ? overLimite45
                    : null;
              if (postGoalLine != null && postGoalMarket) {
                const layOdds = Number(postGoalMarket.layOdds ?? 0);
                const marketId = String(postGoalMarket.marketId ?? "");
                const runnerId = String(postGoalMarket.runnerId ?? "");
                postGoalCorrection = {
                  selected: {
                    line: postGoalLine,
                    layOdds,
                    marketId,
                    runnerId,
                    stable:
                      !postGoalMarket.settled &&
                      layOdds > 1.01 &&
                      Boolean(marketId) &&
                      Boolean(runnerId),
                  },
                };
              }

              const lolpPressure = derivePressureFromIntel({
                extras: fotmobIntel?.extras,
                momentum: fotmobIntel?.pressure?.points,
                favoriteSide,
                minute: liveSnap.minute,
              });

              layOverLimitPressure = await Promise.all(
                LAY_OVER_LIMIT_PRESSURE.lines.map(async (line) => {
                  const { mkt, historyPoints } = await loadOverMarket(line);
                  const snap = buildLayOverLimitPressureSnapshot({
                    layOdds: mkt.layOdds ?? historyPoints.at(-1)?.odd ?? null,
                    backOdds: mkt.backOdds,
                    layLiquidity: mkt.liquidity,
                    marketId: mkt.marketId,
                    runnerId: mkt.runnerId,
                    historyPoints,
                    line,
                    targetProfitPct: lolpProfitPct,
                    minute: liveSnap.minute,
                    totalGoals,
                    homeScore: hasLiveScore ? liveSnap.homeScore : null,
                    awayScore: hasLiveScore ? liveSnap.awayScore : null,
                    // Momento recente do gráfico de pressão manda; média do jogo
                    // só cobre quando o gráfico não veio.
                    favoritePressureBias:
                      lolpPressure.recentBias ?? favoritePressureBias,
                    shotsPerMinFavorite: lolpPressure.shotsPerMinFavorite,
                    areaPressurePerMin: lolpPressure.areaPressurePerMin,
                    matchOdds: analysis.matchOdds,
                  });
                  return {
                    ...snap,
                    eventId: analysis.eventId,
                    eventName: analysis.eventName,
                    mexchangeUrl: snap.marketId
                      ? mexchangeEventUrl(event.id, snap.marketId)
                      : undefined,
                  };
                }),
              );

              // Lay 3x3 / QOV / Over: sem ENTRAR se amistoso ou dados ruins.
              if (!indicationGate.ok) {
                if (tradePlan.entryReady) {
                  tradePlan = {
                    ...tradePlan,
                    entryReady: false,
                    summary: `Sem indicação · ${indicationGate.blockers[0]}`,
                  };
                }
                if (qovLayUnderdog.entryReady) {
                  qovLayUnderdog = {
                    ...qovLayUnderdog,
                    entryReady: false,
                    summary: `Sem indicação · ${indicationGate.blockers[0]}`,
                  };
                }
                if (overLimite35.entryReady) {
                  overLimite35 = {
                    ...overLimite35,
                    entryReady: false,
                    summary: `Sem indicação · ${indicationGate.blockers[0]}`,
                  };
                }
                if (overLimite45.entryReady) {
                  overLimite45 = {
                    ...overLimite45,
                    entryReady: false,
                    summary: `Sem indicação · ${indicationGate.blockers[0]}`,
                  };
                }
                layOverLimitPressure = layOverLimitPressure.map((snap) =>
                  snap.entryReady
                    ? {
                        ...snap,
                        entryReady: false,
                        summary: `Sem indicação · ${indicationGate.blockers[0]}`,
                      }
                    : snap,
                );
              }

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
            // Os alertas de padrão nascem da tese do 3-3; a estratégia dona vai
            // marcada em cada um para a precedência não depender da ordem de
            // inserção (a lista é ordenada por severidade + strategy-priority).
            const alerts = confirmation.alerts
              .filter((alert) => alert.severity !== "entry")
              .map((alert) => ({
                ...alert,
                strategy: alert.strategy ?? ("lay-3x3" as SignalStrategy),
              }));

            if (tradePlan.entryReady) {
              alerts.push({
                id: `${analysis.eventId}-trade-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · CORREÇÃO",
                message: `${analysis.eventName}: ${tradePlan.summary}`,
                at: new Date().toISOString(),
                strategy: "lay-3x3",
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
                strategy: "lay-3x3",
              });
            }

            if (qovLayUnderdog.entryReady) {
              alerts.push({
                id: `${analysis.eventId}-qov-lay-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · QOV ZEBRA",
                message: `${analysis.eventName}: ${qovLayUnderdog.summary}`,
                at: new Date().toISOString(),
                strategy: "qov-lay-zebra",
              });
            }

            if (eventosRaros.entryReady) {
              const lucroEntries =
                eventosRaros.entries?.filter(
                  (e) => e.entryReady !== false && e.alreadyImpossible,
                ) ?? [];
              const raroEntries =
                eventosRaros.entries?.filter(
                  (e) => e.entryReady !== false && !e.alreadyImpossible,
                ) ?? [];
              if (lucroEntries.length > 0) {
                const labels = lucroEntries.map((e) => e.label).join(", ");
                const n = lucroEntries.length;
                alerts.push({
                  id: `${analysis.eventId}-lucro-certo-entry`,
                  severity: "entry" as const,
                  title:
                    n > 1
                      ? `ENTRADA LAY · LUCRO CERTO (${n})`
                      : "ENTRADA LAY · LUCRO CERTO",
                  message: `${analysis.eventName}: ${labels} · placar já impossível`,
                  at: new Date().toISOString(),
                  strategy: "lucro-certo",
                });
              }
              if (raroEntries.length > 0) {
                const labels = raroEntries.map((e) => e.label).join(", ");
                const n = raroEntries.length;
                alerts.push({
                  id: `${analysis.eventId}-eventos-raros-entry`,
                  severity: "entry" as const,
                  title:
                    n > 1
                      ? `ENTRADA LAY · EVENTOS RAROS (${n})`
                      : "ENTRADA LAY · EVENTOS RAROS",
                  message: `${analysis.eventName}: ${labels} · ${eventosRaros.summary}`,
                  at: new Date().toISOString(),
                  strategy: "eventos-raros",
                });
              }
            }

            if (overLimite35.entryReady && !overLimite35.settled) {
              alerts.push({
                id: `${analysis.eventId}-over-35-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · OVER 3.5",
                message: `${analysis.eventName}: ${overLimite35.summary}`,
                at: new Date().toISOString(),
                strategy: "over-3.5",
              });
            }

            if (overLimite45.entryReady && !overLimite45.settled) {
              alerts.push({
                id: `${analysis.eventId}-over-45-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · OVER 4.5",
                message: `${analysis.eventName}: ${overLimite45.summary}`,
                at: new Date().toISOString(),
                strategy: "over-4.5",
              });
            }

            for (const snap of layOverLimitPressure) {
              if (!snap.entryReady || snap.settled) continue;
              alerts.push({
                id: `${analysis.eventId}-lolp-${snap.line}-entry`,
                severity: "entry" as const,
                title: `ENTRADA LAY · LOLP OVER ${snap.line}`,
                message: `${analysis.eventName}: ${snap.summary}`,
                at: new Date().toISOString(),
                strategy: "lay-over-limit-pressure",
              });
            }

            return {
              ...confirmation,
              live: correctedLive,
              alerts,
              confirmed: tradePlan.entryReady,
              mexchangeUrl: mexchangeEventUrl(event.id, analysis.marketId),
              qovMexchangeUrl: qovLayUnderdog.marketId
                ? mexchangeEventUrl(event.id, qovLayUnderdog.marketId)
                : undefined,
              eventosRarosMexchangeUrl: eventosRaros.marketId
                ? mexchangeEventUrl(event.id, eventosRaros.marketId)
                : undefined,
              overMexchangeUrl35: overLimite35.marketId
                ? mexchangeEventUrl(event.id, overLimite35.marketId)
                : undefined,
              overMexchangeUrl45: overLimite45.marketId
                ? mexchangeEventUrl(event.id, overLimite45.marketId)
                : undefined,
              tradePlan,
              analysis: {
                ...analysis,
                tradePlan,
                qovLayUnderdog,
                eventosRaros,
                overLimite35,
                overLimite45,
                layOverLimitPressure,
              },
              qovLayUnderdog,
              eventosRaros,
              overLimite35,
              overLimite45,
              postGoalCorrection,
              layOverLimitPressure,
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
        const bySeverity = rank[a.severity] - rank[b.severity];
        if (bySeverity !== 0) return bySeverity;
        return signalRank(a.strategy) - signalRank(b.strategy);
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
      // Uma página parcial não representa todo o feed. Reconciliar ausentes
      // aqui encerraria operações que apenas ficaram noutra página.
      if (offset === 0 && offset + limit >= inplay.length) {
        reconcileAbsentIndications(activeIds);
      }
    } catch {
      // settle não deve derrubar o feed
    }

    // Painel com Auto ENVIAR: publica ENTRAR direto na fila da extensão
    // (não depende do localStorage de estratégia / postMessage).
    // `extMarkets` traz as pills ligadas — é o painel que manda nos mercados
    // da execução automática; sem o parâmetro, publica tudo (painel antigo).
    // Execução pela extensão está suspensa. O APK usa o serviço nativo e
    // continua consultando este feed sem publicar uma segunda fila de sinais.
    const extSignalsPublished = 0;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      inplayCount: inplay.length,
      offset,
      monitored: rows.length,
      hasMore: offset + slice.length < inplay.length,
      nextOffset: offset + slice.length < inplay.length ? offset + slice.length : null,
      entries: rows.filter((r) => r.confirmed).length,
      extSignalsPublished,
      rows,
      alerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

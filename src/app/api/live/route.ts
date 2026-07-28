import { NextResponse } from "next/server";
import { confirmLivePattern, toLiveSnapshot } from "@/lib/analysis/live";
import { extractLay3x3, extractOverMarket } from "@/lib/analysis/markets";
import { buildOverLimiteSnapshot } from "@/lib/analysis/over-limite";
import { analyzePreLive } from "@/lib/analysis/prelive";
import { buildTradePlan } from "@/lib/analysis/trade-plan";
import {
  getEventWithScoreBook,
  getInplayInfo,
  mexchangeEventUrl,
} from "@/lib/betbra/client";
import { parseProfitPctQuery } from "@/lib/betbra/config";
import { getOddsHistory } from "@/lib/betbra/odds-history";
import { analyzeTeamForm } from "@/lib/fotmob/form";

export const dynamic = "force-dynamic";

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
            let overLimite = analysis.overLimite;
            const overMkt = extractOverMarket(event, 2.5);
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
              let overHistory: Awaited<ReturnType<typeof getOddsHistory>> | null =
                null;
              if (overMkt.runnerId) {
                overHistory = await getOddsHistory({
                  runnerId: overMkt.runnerId,
                  marketId: overMkt.marketId,
                  minutesBefore: 30,
                  limit: 120,
                }).catch(() => null);
              }
              overLimite = buildOverLimiteSnapshot({
                layOdds: overMkt.layOdds,
                backOdds: overMkt.backOdds,
                layLiquidity: overMkt.liquidity,
                marketId: overMkt.marketId,
                runnerId: overMkt.runnerId,
                historyPoints: overHistory?.data ?? [],
                teamForm,
                over25Back: analysis.over25,
                matchOdds: analysis.matchOdds,
                totalGoals: toLiveSnapshot(ip).totalGoals,
                favoriteSide:
                  (analysis.matchOdds.home.back ?? 99) <=
                  (analysis.matchOdds.away.back ?? 99)
                    ? "home"
                    : "away",
              });
            } catch {
              // mantém overLimite base
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

            if (overLimite.entryReady) {
              alerts.unshift({
                id: `${analysis.eventId}-over-entry`,
                severity: "entry" as const,
                title: "ENTRADA LAY · OVER 2.5",
                message: `${analysis.eventName}: ${overLimite.summary}`,
                at: new Date().toISOString(),
              });
            }

            return {
              ...confirmation,
              live: confirmation.live ?? toLiveSnapshot(ip),
              alerts,
              confirmed: tradePlan.entryReady,
              mexchangeUrl: mexchangeEventUrl(event.id, analysis.marketId),
              tradePlan,
              analysis: {
                ...analysis,
                tradePlan,
                overLimite,
              },
              overLimite,
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

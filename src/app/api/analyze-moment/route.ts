import { NextResponse } from "next/server";
import { analyzeFluidity } from "@/lib/analysis/fluidity";
import { toLiveSnapshot } from "@/lib/analysis/live";
import { enrichMomentWithLlm, isLlmConfigured } from "@/lib/analysis/llm";
import { buildRulesMomentAnalysis } from "@/lib/analysis/moment-analysis";
import { analyzePreLive } from "@/lib/analysis/prelive";
import { buildTradePlan } from "@/lib/analysis/trade-plan";
import { getEventWithScoreBook, getInplayInfo } from "@/lib/betbra/client";
import { getOddsHistory } from "@/lib/betbra/odds-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json(
        { error: "eventId é obrigatório" },
        { status: 400 },
      );
    }

    const minutesBefore = Number(searchParams.get("minutesBefore") ?? 60);
    const useLlm = searchParams.get("llm") !== "0";

    const event = await getEventWithScoreBook(eventId, 3);
    const pre = analyzePreLive(event);

    const [inplay, history] = await Promise.all([
      getInplayInfo().catch(() => []),
      pre.runnerId
        ? getOddsHistory({
            runnerId: pre.runnerId,
            marketId: pre.marketId,
            minutesBefore: Number.isFinite(minutesBefore) ? minutesBefore : 60,
            limit: 500,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const liveRaw = inplay.find((e) => e.eventId === eventId);
    const live = liveRaw ? toLiveSnapshot(liveRaw) : null;

    const trade = buildTradePlan({
      layOdds: pre.layOdds ?? history?.data.at(-1)?.odd ?? null,
      historyPoints: history?.data,
      inplay: liveRaw,
      matchOdds: pre.matchOdds,
    });

    const fluidity =
      trade.fluidity ??
      analyzeFluidity(history?.data ?? [], { lookback: 12 });

    let moment = buildRulesMomentAnalysis({
      pre,
      live,
      trade,
      fluidity,
      correction: trade.correction,
    });

    if (useLlm && isLlmConfigured()) {
      moment = await enrichMomentWithLlm(moment, {
        event: pre.eventName,
        competition: pre.competition,
        preScore: pre.score,
        layOdds: trade.layOdds,
        targetBack: trade.targetBackOdds,
        live,
        fluidity,
        oscillation: trade.oscillation,
        correction: trade.correction,
        signals: pre.signals,
      });
    }

    return NextResponse.json({
      eventId,
      pre,
      live,
      trade,
      fluidity,
      correction: trade.correction,
      moment,
      llmEnabled: isLlmConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

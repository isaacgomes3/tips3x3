import { NextResponse } from "next/server";
import { extractMatchOdds } from "@/lib/analysis/markets";
import { buildTradePlan } from "@/lib/analysis/trade-plan";
import { getEventWithScoreBook, getInplayInfo } from "@/lib/betbra/client";
import { getOddsHistory, summarizeHistory } from "@/lib/betbra/odds-history";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ runnerId: string }> },
) {
  try {
    const { runnerId } = await context.params;
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("marketId") ?? undefined;
    const eventId = searchParams.get("eventId") ?? undefined;
    const minutesBefore = Number(searchParams.get("minutesBefore") ?? 60);
    const inPlay = searchParams.get("inPlay") === "1";
    const limit = Number(searchParams.get("limit") ?? 500);
    const layOddsParam = searchParams.get("layOdds");
    const layOddsHint = layOddsParam ? Number(layOddsParam) : null;

    const history = await getOddsHistory({
      runnerId,
      marketId,
      minutesBefore: Number.isFinite(minutesBefore) ? minutesBefore : 60,
      inPlay,
      limit: Number.isFinite(limit) ? limit : 500,
    });

    const summary = summarizeHistory(history);
    const layOdds =
      (layOddsHint != null && Number.isFinite(layOddsHint) ? layOddsHint : null) ??
      summary.lastOdd;

    let inplay;
    let matchOdds;
    if (eventId) {
      const [event, inplayList] = await Promise.all([
        getEventWithScoreBook(eventId, 3).catch(() => null),
        getInplayInfo().catch(() => []),
      ]);
      if (event) matchOdds = extractMatchOdds(event);
      inplay = inplayList.find((e) => e.eventId === eventId);
    }

    const tradePlan = buildTradePlan({
      layOdds,
      historyPoints: history.data,
      inplay,
      matchOdds,
    });

    return NextResponse.json({
      ...history,
      summary,
      tradePlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { getEventWithScoreBook, listSoccerEvents, mexchangeEventUrl } from "../betbra/client";
import { getLayOddsWindow } from "../betbra/config";
import { analyzePreLive, type PreLiveAnalysis } from "./prelive";
import { extractLay3x3 } from "./markets";

export interface OpportunityRow {
  analysis: PreLiveAnalysis;
  mexchangeUrl: string;
  overMexchangeUrl?: string;
  overMexchangeUrl35?: string;
}

export async function scanDayOpportunities(options?: {
  limit?: number;
  onlyIdeal?: boolean;
  targetProfitPct?: number;
}): Promise<{
  generatedAt: string;
  window: ReturnType<typeof getLayOddsWindow>;
  totalEvents: number;
  opportunities: OpportunityRow[];
}> {
  const window = getLayOddsWindow();
  const listed = await listSoccerEvents({ perPage: options?.limit ?? 40 });

  const opportunities: OpportunityRow[] = [];

  // Busca detalhada em paralelo (lotes) para obter Correct Score + prices
  const chunkSize = 6;
  for (let i = 0; i < listed.events.length; i += chunkSize) {
    const chunk = listed.events.slice(i, i + chunkSize);
    const detailed = await Promise.all(
      chunk.map(async (e) => {
        try {
          return await getEventWithScoreBook(e.id, 3);
        } catch {
          return e;
        }
      }),
    );

    for (const event of detailed) {
      const lay = extractLay3x3(event);
      if (!lay.runner) continue;

      const analysis = analyzePreLive(event, {
        targetProfitPct: options?.targetProfitPct,
      });
      if (options?.onlyIdeal && !analysis.idealOdds) continue;

      opportunities.push({
        analysis,
        mexchangeUrl: mexchangeEventUrl(event.id, analysis.marketId),
        overMexchangeUrl: analysis.overLimite.marketId
          ? mexchangeEventUrl(event.id, analysis.overLimite.marketId)
          : undefined,
        overMexchangeUrl35: analysis.overLimite35.marketId
          ? mexchangeEventUrl(event.id, analysis.overLimite35.marketId)
          : undefined,
      });
    }
  }

  opportunities.sort((a, b) => {
    if (a.analysis.watchlist !== b.analysis.watchlist) {
      return a.analysis.watchlist ? -1 : 1;
    }
    if (a.analysis.idealOdds !== b.analysis.idealOdds) {
      return a.analysis.idealOdds ? -1 : 1;
    }
    return b.analysis.score - a.analysis.score;
  });

  return {
    generatedAt: new Date().toISOString(),
    window,
    totalEvents: listed.total || listed.events.length,
    opportunities,
  };
}

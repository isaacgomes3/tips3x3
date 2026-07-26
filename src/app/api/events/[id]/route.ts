import { NextResponse } from "next/server";
import { getEventWithScoreBook, mexchangeEventUrl } from "@/lib/betbra/client";
import { analyzePreLive } from "@/lib/analysis/prelive";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const event = await getEventWithScoreBook(id, 3);
    const analysis = analyzePreLive(event);

    return NextResponse.json({
      event,
      analysis,
      mexchangeUrl: mexchangeEventUrl(id, analysis.marketId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

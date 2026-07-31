import { NextResponse } from "next/server";
import {
  listIndications,
  type IndicationKind,
} from "@/lib/indications-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kindRaw = searchParams.get("kind");
    const kind =
      kindRaw === "eventos-raros" || kindRaw === "lucro-certo"
        ? (kindRaw as IndicationKind)
        : undefined;
    const limitRaw = Number(searchParams.get("limit") ?? 200);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : 200;

    const items = listIndications({ kind, limit });
    const eventosRaros = items.filter((i) => i.kind === "eventos-raros");
    const lucroCerto = items.filter((i) => i.kind === "lucro-certo");

    const tally = (list: typeof items) => {
      let green = 0;
      let red = 0;
      let pending = 0;
      for (const i of list) {
        if (i.result === "green") green += 1;
        else if (i.result === "red") red += 1;
        else pending += 1;
      }
      return { total: list.length, green, red, pending };
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      items,
      stats: {
        all: tally(items),
        eventosRaros: tally(eventosRaros),
        lucroCerto: tally(lucroCerto),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

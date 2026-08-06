import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { chargeMatchedOperationFee } from "@/lib/wallet/wallet-fees";
import {
  listIndications,
  recordPlacedIndication,
  type IndicationEventType,
  type IndicationKind,
  type IndicationSource,
} from "@/lib/indications-store";

const SOURCES: IndicationSource[] = ["apk", "painel", "extensao", "sistema"];
const EVENT_TYPES: IndicationEventType[] = [
  "lay-sent",
  "lay-matched",
  "back-sent",
  "green",
  "cancelled",
  "failed",
];

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kindRaw = searchParams.get("kind");
    const kind =
      kindRaw === "eventos-raros" ||
      kindRaw === "lucro-certo" ||
      kindRaw === "lay-3x3"
        ? (kindRaw as IndicationKind)
        : undefined;
    const limitRaw = Number(searchParams.get("limit") ?? 200);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : 200;

    const items = listIndications({ kind, limit });
    const eventosRaros = items.filter((i) => i.kind === "eventos-raros");
    const lucroCerto = items.filter((i) => i.kind === "lucro-certo");
    const lay3x3 = items.filter((i) => i.kind === "lay-3x3");

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
        lay3x3: tally(lay3x3),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Executores (APK, extensão e painel) gravam aqui a ordem e cada passo dela.
 * `event` é opcional: sem ele o POST se comporta como o registro de entrada.
 */
export async function POST(request: Request) {
  try {
    // Cookie no painel; Bearer no serviço em background do APK.
    const auth = await requireSessionFromRequest(request);
    const body = (await request.json()) as {
      kind?: string;
      eventId?: string;
      eventName?: string;
      home?: string;
      away?: string;
      scoreLabel?: string;
      score?: string;
      layOdds?: number;
      minute?: number | null;
      liveScoreLabel?: string | null;
      alreadyImpossible?: boolean;
      stake?: number;
      liability?: number;
      expectedProfit?: number;
      source?: string;
      execStatus?: string;
      event?: {
        type?: string;
        odds?: number;
        stake?: number;
        profit?: number;
        message?: string;
      };
    };

    const sourceRaw = String(body.source || "") as IndicationSource;
    const source: IndicationSource = SOURCES.includes(sourceRaw)
      ? sourceRaw
      : "painel";

    const eventTypeRaw = String(body.event?.type || "") as IndicationEventType;
    const event = EVENT_TYPES.includes(eventTypeRaw)
      ? {
          type: eventTypeRaw,
          odds: numberOrNull(body.event?.odds),
          stake: numberOrNull(body.event?.stake),
          profit: numberOrNull(body.event?.profit),
          message: body.event?.message ? String(body.event.message) : null,
        }
      : null;

    const kindRaw = String(body.kind || "");
    const kind: IndicationKind =
      kindRaw === "lucro-certo" || kindRaw === "lay-3x3"
        ? kindRaw
        : body.alreadyImpossible
          ? "lucro-certo"
          : "eventos-raros";

    const result = recordPlacedIndication({
      kind,
      eventId: String(body.eventId || ""),
      eventName: body.eventName,
      home: body.home,
      away: body.away,
      scoreLabel: String(body.scoreLabel || body.score || ""),
      layOdds: Number(body.layOdds),
      minute: body.minute,
      liveScoreLabel: body.liveScoreLabel,
      alreadyImpossible: Boolean(body.alreadyImpossible),
      userEmail: auth.ok ? auth.session.email : null,
      source,
      stake: body.stake,
      liability: body.liability,
      expectedProfit: body.expectedProfit,
      execStatus: body.execStatus === "failed" ? "failed" : "placed",
      event,
    });

    if (!result.item) {
      return NextResponse.json(
        { ok: false, error: "Dados inválidos (eventId, score, layOdds)" },
        { status: 400 },
      );
    }

    // Operação casada cobra a taxa da tips3x3 do crédito do cliente.
    const fee = chargeMatchedOperationFee(result.item);

    return NextResponse.json({
      ok: true,
      created: result.created,
      item: result.item,
      fee,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

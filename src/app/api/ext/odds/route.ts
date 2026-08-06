import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { listSoccerEvents } from "@/lib/betbra/client";
import { splitTeams } from "@/lib/analysis/markets";
import {
  extOddsSnapshot,
  listExtOdds,
  upsertExtOdds,
  type ExtBookmaker,
  type ExtOddsEvent,
} from "@/lib/ext-odds-store";

export const dynamic = "force-dynamic";

function teamNamesFromEvent(ev: {
  name: string;
  "event-participants"?: Array<{
    number?: number;
    name?: string;
    "participant-name"?: string;
  }>;
}) {
  const participants = ev["event-participants"] ?? [];
  const homeP =
    participants.find((p) => Number(p.number) === 1) ?? participants[0];
  const awayP =
    participants.find((p) => Number(p.number) === 2) ?? participants[1];
  const split = splitTeams(ev.name);
  return {
    home:
      homeP?.["participant-name"] ?? homeP?.name ?? split.home ?? ev.name,
    away: awayP?.["participant-name"] ?? awayP?.name ?? split.away ?? "",
  };
}

/** POST — extensão envia lote de odds 1X2. */
export async function POST(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: {
    bookmaker?: string;
    events?: Array<Partial<ExtOddsEvent>>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const bookmaker = String(body.bookmaker || "").toLowerCase() as ExtBookmaker;
  if (bookmaker !== "bet365" && bookmaker !== "betnacional") {
    return NextResponse.json(
      { error: "bookmaker deve ser bet365 ou betnacional" },
      { status: 400 },
    );
  }

  const raw = Array.isArray(body.events) ? body.events : [];
  const events: ExtOddsEvent[] = raw.map((e) => ({
    bookmaker,
    home: String(e.home || ""),
    away: String(e.away || ""),
    start: e.start ? String(e.start) : undefined,
    externalId: e.externalId ? String(e.externalId) : undefined,
    url: e.url ? String(e.url) : undefined,
    homeOdds: Number(e.homeOdds),
    drawOdds: Number(e.drawOdds),
    awayOdds: Number(e.awayOdds),
    capturedAt: Number(e.capturedAt) || Date.now(),
    eventIdBolsa: e.eventIdBolsa ? String(e.eventIdBolsa) : undefined,
  }));

  const result = upsertExtOdds(auth.session.email, events);
  return NextResponse.json({
    ok: true,
    bookmaker,
    ...result,
    snapshot: extOddsSnapshot(auth.session.email),
  });
}

/**
 * GET — status / lista.
 * ?targets=1 → jogos Bolsa do dia para a extensão procurar nas casas.
 */
export async function GET(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("targets") === "1") {
    try {
      const listed = await listSoccerEvents({ perPage: 40 });
      const targets = (listed.events ?? []).map((ev) => {
        const { home, away } = teamNamesFromEvent(ev);
        return {
          eventId: ev.id,
          home,
          away,
          start: ev.start,
          name: ev.name,
        };
      });
      return NextResponse.json({
        ok: true,
        targets,
        snapshot: extOddsSnapshot(auth.session.email),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro Bolsa";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json({
    ok: true,
    events: listExtOdds(auth.session.email),
    snapshot: extOddsSnapshot(auth.session.email),
  });
}

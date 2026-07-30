import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  claimExtSignal,
  peekExtSignal,
  publishExtSignal,
  type ExtSignalPayload,
} from "@/lib/ext-signal-queue";

export const dynamic = "force-dynamic";

/**
 * POST — painel publica 1 sinal (substitui pending anterior).
 * GET  — extensão poll; ?claim=1 faz claim atômico.
 * TTL do sinal: 90s (extensão poll ~2s com aba exchange aberta).
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: Partial<ExtSignalPayload> & { score?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  const layOdds = Number(body.layOdds);
  if (!eventId || !(layOdds > 1.01)) {
    return NextResponse.json(
      { error: "eventId e layOdds (>1.01) obrigatórios" },
      { status: 400 },
    );
  }

  const score = String(body.score || "3-3").trim() || "3-3";
  const dedupeKey =
    String(body.dedupeKey || "").trim() || `${eventId}:${score}`;
  const exitRaw = String(body.exitMode || "").trim();
  const exitMode =
    exitRaw === "hold" || exitRaw === "green" ? exitRaw : undefined;

  const signal = publishExtSignal(auth.session.email, {
    eventId,
    eventName: body.eventName ? String(body.eventName) : undefined,
    score,
    layOdds,
    marketId: body.marketId ? String(body.marketId) : undefined,
    runnerId: body.runnerId ? String(body.runnerId) : undefined,
    mexchangeUrl: body.mexchangeUrl ? String(body.mexchangeUrl) : undefined,
    exitMode,
    at: Number(body.at) || Date.now(),
    dedupeKey,
  });

  return NextResponse.json({
    ok: true,
    id: signal.id,
    status: signal.status,
    expiresAt: signal.expiresAt,
  });
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const claim =
    new URL(request.url).searchParams.get("claim") === "1" ||
    new URL(request.url).searchParams.get("claim") === "true";

  const signal = claim
    ? claimExtSignal(auth.session.email)
    : peekExtSignal(auth.session.email);

  return NextResponse.json({
    ok: true,
    signal: signal
      ? {
          id: signal.id,
          status: signal.status,
          createdAt: signal.createdAt,
          expiresAt: signal.expiresAt,
          payload: signal.payload,
        }
      : null,
  });
}

import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { resolveExtEventName } from "@/lib/ext-event-label";
import { isMasterEmail } from "@/lib/auth/users-store";
import { isWalletBlocked } from "@/lib/wallet/wallet-fees";
import { getWalletSummary } from "@/lib/wallet/wallet-store";
import {
  getCreditTier,
  isMarketAllowedForTier,
  tierRequiredForMarket,
  type StrategyMarketKey,
} from "@/lib/wallet/credit-tier";
import { effectiveCreditTier } from "@/lib/wallet/trial";
import {
  claimExtSignal,
  peekExtSignal,
  publishExtSignal,
  type ExtSignalPayload,
} from "@/lib/ext-signal-queue";

export const dynamic = "force-dynamic";

/** Mesmas estratégias de Tips3x3EntryKind (bolsa-bridge). */
const EXT_SIGNAL_KINDS = new Set([
  "lay-3x3",
  "eventos-raros",
  "lucro-certo",
  "over-3.5",
  "over-4.5",
  "lay-over-limit-pressure",
  "qov-lay-zebra",
]);

/** kind da fila de sinais -> mercado usado na classificação por crédito. */
const KIND_TO_MARKET: Record<string, StrategyMarketKey> = {
  "lay-3x3": "lay_3_3",
  "eventos-raros": "lay_eventos_raros",
  "lucro-certo": "lay_lucro_certo",
  "over-3.5": "lay_over_35",
  "over-4.5": "lay_over_45",
  "lay-over-limit-pressure": "lay_over_limit_pressure",
  "qov-lay-zebra": "lay_qov",
};

/**
 * POST — painel publica 1 sinal (substitui pending anterior).
 * GET  — extensão poll; ?claim=1 faz claim atômico.
 * TTL do sinal: 90s (extensão poll ~2s com aba exchange aberta).
 * Auth: cookie OU Bearer (igual /api/ext/config — a Bolsa Manual roda
 * em origem da casa e autentica com tips3x3_session no header).
 */
export async function POST(request: Request) {
  const auth = await requireSessionFromRequest(request);
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

  const targetBackOdds = Number(body.targetBackOdds);
  const targetProfitPct = Number(body.targetProfitPct);

  // Over vinha do painel e era descartado aqui — a extensão recebia o sinal
  // sem estratégia, ao contrário do publish server-side (autoExt=1).
  const kindRaw = String(body.kind || "");
  const kind = EXT_SIGNAL_KINDS.has(kindRaw) ? kindRaw : undefined;
  const minute = Number(body.minute);

  const home = body.home ? String(body.home).trim() : undefined;
  const away = body.away ? String(body.away).trim() : undefined;
  const eventName = resolveExtEventName({
    eventName: body.eventName ? String(body.eventName) : undefined,
    home,
    away,
    eventId,
  });

  console.info(
    "[ext-signal] POST",
    auth.session.email,
    eventName,
    eventId,
    score,
    kind || "-",
    `lay=${layOdds}`,
  );

  const signal = publishExtSignal(auth.session.email, {
    eventId,
    eventName,
    name: eventName,
    matchName: eventName,
    title: eventName,
    score,
    kind,
    home,
    away,
    minute: Number.isFinite(minute) ? minute : null,
    liveScore: body.liveScore ? String(body.liveScore) : undefined,
    layOdds,
    marketId: body.marketId ? String(body.marketId) : undefined,
    runnerId: body.runnerId ? String(body.runnerId) : undefined,
    mexchangeUrl: body.mexchangeUrl ? String(body.mexchangeUrl) : undefined,
    exitMode,
    targetBackOdds:
      Number.isFinite(targetBackOdds) && targetBackOdds > 1.01
        ? targetBackOdds
        : null,
    targetProfitPct:
      Number.isFinite(targetProfitPct) && targetProfitPct > 0
        ? targetProfitPct
        : null,
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
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Crédito zerado: não entrega sinal (a operação geraria taxa sem cobertura).
  if (isWalletBlocked(auth.session.email)) {
    return NextResponse.json({
      ok: true,
      signal: null,
      blocked: true,
      reason: "sem_credito",
      message: "Operação não realizada por falta de crédito.",
    });
  }

  const claim =
    new URL(request.url).searchParams.get("claim") === "1" ||
    new URL(request.url).searchParams.get("claim") === "true";

  const signal = claim
    ? claimExtSignal(auth.session.email)
    : peekExtSignal(auth.session.email);

  // Sinal existe mas o filtro dele não está liberado na faixa de crédito do
  // cliente (master enxerga tudo) — recusa e some com a fila, avisando o motivo.
  const marketKey = signal?.payload.kind ? KIND_TO_MARKET[signal.payload.kind] : undefined;
  if (signal && marketKey && !isMasterEmail(auth.session.email)) {
    const tier = effectiveCreditTier(
      auth.session.email,
      getCreditTier(getWalletSummary(auth.session.email).balance),
      false,
    );
    if (!isMarketAllowedForTier(marketKey, tier)) {
      const requiredTier = tierRequiredForMarket(marketKey);
      return NextResponse.json({
        ok: true,
        signal: null,
        blocked: true,
        reason: "fora_da_faixa_credito",
        message: `Operação não realizada — este filtro exige Crédito ${requiredTier}+.`,
      });
    }
  }

  if (claim && !signal) {
    // Poll quieto — sem log a cada 2s. Só publica quando há fila.
  } else if (claim && signal) {
    console.info(
      "[ext-signal] GET claim ok",
      auth.session.email,
      signal.payload.eventName || signal.payload.eventId,
      signal.id,
      signal.payload.score,
    );
  }

  const payload = signal?.payload;
  const label = payload
    ? resolveExtEventName({
        eventName: payload.eventName,
        home: payload.home,
        away: payload.away,
        eventId: payload.eventId,
      })
    : "";

  return NextResponse.json({
    ok: true,
    signal: signal
      ? {
          id: signal.id,
          status: signal.status,
          createdAt: signal.createdAt,
          expiresAt: signal.expiresAt,
          // Root aliases — algumas builds da extensão leem fora de payload.
          eventId: payload!.eventId,
          eventName: label,
          name: label,
          matchName: label,
          title: label,
          home: payload!.home ?? "",
          away: payload!.away ?? "",
          payload: {
            ...payload!,
            eventName: label,
            name: label,
            matchName: label,
            title: label,
          },
        }
      : null,
  });
}

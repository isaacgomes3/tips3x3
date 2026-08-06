import { NextResponse } from "next/server";
import { applyLucWebhook } from "@/lib/wallet/wallet-store";

export const dynamic = "force-dynamic";

/**
 * Notificação do gateway. Sempre responde 200 — erro aqui provoca retry
 * agressivo do Luc Paguei. O crédito é idempotente no store.
 */
export async function POST(request: Request) {
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  try {
    const result = applyLucWebhook(payload);
    console.info(
      "[luc-webhook]",
      result.matched ? "match" : "sem match",
      result.paid ? "pago" : "nao pago",
      result.deposit?.externalId || "-",
      result.deposit?.status || "-",
    );
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error("[luc-webhook] erro", e);
    return NextResponse.json(
      { ok: true, error: e instanceof Error ? e.message : "erro" },
      { status: 200 },
    );
  }
}

/** Alguns gateways validam o endpoint com GET antes de enviar eventos. */
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "luc-paguei" });
}

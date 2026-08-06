import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { ackExtSignal } from "@/lib/ext-signal-queue";

export const dynamic = "force-dynamic";

/** Extensão confirma sucesso/falha e libera o slot. Auth: cookie OU Bearer. */
export async function POST(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { id?: string; status?: string; error?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = String(body.id || "").trim();
  const status = body.status === "failed" ? "failed" : "acked";
  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  const result = ackExtSignal(auth.session.email, id, status);
  if (!result.ok) {
    console.warn("[ext-signal] ACK miss", auth.session.email, id, status);
    return NextResponse.json(
      { ok: false, error: "sinal não encontrado ou id divergente" },
      { status: 404 },
    );
  }

  console.info(
    "[ext-signal] ACK",
    auth.session.email,
    id,
    status,
    body.error ? String(body.error).slice(0, 120) : "",
  );

  return NextResponse.json({
    ok: true,
    cleared: result.cleared,
    status,
    error: body.error ? String(body.error).slice(0, 300) : undefined,
  });
}

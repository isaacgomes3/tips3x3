import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { activateUserTrial } from "@/lib/auth/users-store";
import { getTrialInfo } from "@/lib/wallet/trial";

export const dynamic = "force-dynamic";

/** Status do teste grátis 48h do usuário logado. */
export async function GET(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, trial: getTrialInfo(auth.session.email) });
}

/**
 * Ativa o teste grátis 48h — 1x só, para sempre, pelo próprio usuário no
 * seu ambiente. Libera todos os filtros durante a janela; depois expira e
 * só volta a liberar com depósito num dos planos.
 */
export async function POST(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const res = activateUserTrial(auth.session.email);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, trial: getTrialInfo(auth.session.email) });
}

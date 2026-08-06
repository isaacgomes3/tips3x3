import { NextResponse } from "next/server";
import { requireSession, type SessionUser } from "@/lib/auth/require-session";
import { isMasterEmail } from "@/lib/auth/users-store";

/** Gate das rotas administrativas: sessão válida + e-mail master. */
export async function requireMaster(): Promise<
  { ok: true; session: SessionUser } | { ok: false; res: NextResponse }
> {
  const auth = await requireSession();
  if (!auth.ok) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }
  if (!isMasterEmail(auth.session.email)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Apenas o master acessa a administração." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session: auth.session };
}

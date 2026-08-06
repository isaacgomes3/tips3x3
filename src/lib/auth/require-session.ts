import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export type SessionUser = { email: string; exp: number };

/** Lê cookie tips3x3_session. Retorna null se inválido/ausente. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

/** Auth obrigatória para rotas da extensão / painel. */
export async function requireSession(): Promise<
  { ok: true; session: SessionUser } | { ok: false; status: 401 }
> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  return { ok: true, session };
}

/**
 * Cookie OU `Authorization: Bearer <tips3x3_session>`.
 * Usado pelas extensões (origem da casa ≠ tips3x3).
 */
export async function requireSessionFromRequest(request: Request): Promise<
  { ok: true; session: SessionUser } | { ok: false; status: 401 }
> {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (/^bearer\s+/i.test(header)) {
    const token = header.replace(/^bearer\s+/i, "").trim();
    const session = await verifySessionToken(token);
    if (session) return { ok: true, session };
  }
  return requireSession();
}

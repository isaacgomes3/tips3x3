import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  deleteUser,
  isMasterEmail,
  setUserActive,
} from "@/lib/auth/users-store";

export const dynamic = "force-dynamic";

async function requireMaster() {
  const auth = await requireSession();
  if (!auth.ok) {
    return { ok: false as const, res: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (!isMasterEmail(auth.session.email)) {
    return {
      ok: false as const,
      res: NextResponse.json(
        { error: "Apenas o master pode gerenciar usuários." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const };
}

type Ctx = { params: Promise<{ email: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const { email: raw } = await ctx.params;
    const email = decodeURIComponent(raw || "");
    const body = (await request.json()) as {
      active?: boolean;
    };

    if (typeof body.active === "boolean") {
      const result = await setUserActive(email, body.active);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ ok: true, user: result.user });
    }

    return NextResponse.json(
      { error: "Informe active: true|false." },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "Falha ao atualizar usuário." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const { email: raw } = await ctx.params;
    const email = decodeURIComponent(raw || "");
    const result = await deleteUser(email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Falha ao remover usuário." }, { status: 500 });
  }
}

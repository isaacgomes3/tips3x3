import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  createUser,
  isMasterEmail,
  listUsers,
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
  return { ok: true as const, session: auth.session };
}

export async function GET() {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;
  return NextResponse.json({ ok: true, users: listUsers() });
}

export async function POST(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const result = await createUser({
      email: body.email ?? "",
      password: body.password ?? "",
      name: body.name,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, user: result.user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Falha ao criar usuário." }, { status: 500 });
  }
}

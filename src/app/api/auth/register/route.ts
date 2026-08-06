import { NextResponse } from "next/server";
import { createUser, resolveReferralCode } from "@/lib/auth/users-store";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      ref?: string;
    };

    const referredBy = body.ref ? resolveReferralCode(body.ref) ?? undefined : undefined;

    const result = await createUser({
      email: body.email ?? "",
      password: body.password ?? "",
      name: body.name,
      referredBy,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Auto-login após cadastro → redireciona para carteira
    const token = await createSessionToken(result.user.email);
    const res = NextResponse.json(
      { ok: true, redirect: "/app?view=wallet" },
      { status: 201 },
    );
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch {
    return NextResponse.json({ error: "Falha ao criar conta." }, { status: 500 });
  }
}

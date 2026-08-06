import { NextResponse } from "next/server";
import {
  createSessionToken,
  getMasterCredentials,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { verifyStoredUserCredentials } from "@/lib/auth/users-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const master = getMasterCredentials();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Informe e-mail e senha." },
        { status: 400 },
      );
    }

    let ok = false;
    if (email === master.email && password === master.password) {
      ok = true;
    } else {
      const stored = await verifyStoredUserCredentials(email, password);
      ok = stored.ok;
    }

    if (!ok) {
      return NextResponse.json(
        { error: "Credenciais inválidas." },
        { status: 401 },
      );
    }

    const token = await createSessionToken(email);
    const res = NextResponse.json({
      ok: true,
      email,
      redirect: "/app?view=dashboard",
    });
    const cookie = sessionCookieOptions(token);
    res.cookies.set(cookie);
    return res;
  } catch {
    return NextResponse.json({ error: "Falha no login." }, { status: 500 });
  }
}

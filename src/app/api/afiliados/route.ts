import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  ensureReferralCode,
  getReferrals,
} from "@/lib/auth/users-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { email } = auth.session;
  const code = ensureReferralCode(email);

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "tips3x3.com.br";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");

  const referralLink = `${proto}://${host}/cadastro?ref=${code}`;
  const referrals = getReferrals(email);

  return NextResponse.json({
    ok: true,
    referralLink,
    referralCode: code,
    referrals,
  });
}

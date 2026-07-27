import { NextResponse } from "next/server";
import { clearSessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const cookie = clearSessionCookieOptions();
  res.cookies.set(cookie);
  return res;
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  COOKIE_NAME,
  getMasterCredentials,
  verifySessionToken,
} from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  const redirectToLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  };

  if (pathname.startsWith("/admin")) {
    if (!session) return redirectToLogin();
    if (session.email.toLowerCase() !== getMasterCredentials().email) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/app")) {
    if (!session) return redirectToLogin();
    return NextResponse.next();
  }

  if (pathname === "/login" && session) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login"],
};

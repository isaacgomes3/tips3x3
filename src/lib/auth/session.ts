const COOKIE_NAME = "tips3x3_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 dias

function authSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.BETBRA_SESSION_TOKEN?.trim() ||
    "tips3x3-dev-secret-change-me"
  );
}

export function getMasterCredentials() {
  return {
    email: (
      process.env.MASTER_EMAIL?.trim() || "isaacgomes3@gmail.com"
    ).toLowerCase(),
    password: process.env.MASTER_PASSWORD?.trim() || "Tips3x3!Master",
  };
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toBase64Url(sig);
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(email: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const body = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ email: email.toLowerCase(), exp }),
    ),
  );
  return `${body}.${await sign(body)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<{ email: string; exp: number } | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await sign(body);
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(body));
    const data = JSON.parse(json) as { email?: string; exp?: number };
    if (!data.email || !data.exp) return null;
    if (data.exp * 1000 < Date.now()) return null;
    return { email: data.email, exp: data.exp };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export { COOKIE_NAME, MAX_AGE_SEC };

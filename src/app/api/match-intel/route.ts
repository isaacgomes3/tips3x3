import { NextResponse } from "next/server";
import { getFotmobMatchIntel } from "@/lib/fotmob/intel";
import { getMatchIntel as getSofascoreMatchIntel } from "@/lib/sofascore/intel";
import type { MatchIntel } from "@/lib/sofascore/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CacheEntry = { at: number; intel: MatchIntel | null };
const TTL_MS = 45_000;
const MISS_TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

function keyOf(home: string, away: string, start?: string) {
  return `${home}|${away}|${start ?? ""}`.toLowerCase();
}

async function resolveIntel(opts: {
  home: string;
  away: string;
  start?: string;
}): Promise<MatchIntel | null> {
  // FotMob primeiro: Sofascore costuma bloquear IP de VPS (403)
  const fotmob = await getFotmobMatchIntel(opts).catch(() => null);
  if (fotmob && fotmob.pressure.points.length > 0) return fotmob;

  const sofa = await Promise.race([
    getSofascoreMatchIntel(opts).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 6_000)),
  ]);
  if (sofa) return sofa;
  return fotmob;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const home = searchParams.get("home")?.trim();
    const away = searchParams.get("away")?.trim();
    const start = searchParams.get("start")?.trim() || undefined;

    if (!home || !away) {
      return NextResponse.json(
        { error: "Parâmetros home e away são obrigatórios" },
        { status: 400 },
      );
    }

    const key = keyOf(home, away, start);
    const hit = cache.get(key);
    const ttl = hit?.intel ? TTL_MS : MISS_TTL_MS;
    if (hit && Date.now() - hit.at < ttl) {
      if (!hit.intel) {
        return NextResponse.json({
          found: false,
          message: "Jogo não encontrado (xG/pressão).",
        });
      }
      return NextResponse.json({ found: true, intel: hit.intel });
    }

    const intel = await resolveIntel({ home, away, start });
    cache.set(key, { at: Date.now(), intel });

    if (!intel) {
      return NextResponse.json({
        found: false,
        message: "Jogo não encontrado (xG/pressão).",
      });
    }

    return NextResponse.json({ found: true, intel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

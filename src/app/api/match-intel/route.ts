import { NextResponse } from "next/server";
import { getMatchIntel } from "@/lib/sofascore/intel";
import type { MatchIntel } from "@/lib/sofascore/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CacheEntry = { at: number; intel: MatchIntel | null };
const TTL_MS = 45_000;
const cache = new Map<string, CacheEntry>();

function keyOf(home: string, away: string, start?: string) {
  return `${home}|${away}|${start ?? ""}`.toLowerCase();
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
    if (hit && Date.now() - hit.at < TTL_MS) {
      if (!hit.intel) {
        return NextResponse.json({
          found: false,
          message: "Jogo não encontrado no Sofascore (xG/pressão).",
        });
      }
      return NextResponse.json({ found: true, intel: hit.intel });
    }

    const intel = await getMatchIntel({ home, away, start });
    cache.set(key, { at: Date.now(), intel });

    if (!intel) {
      return NextResponse.json({
        found: false,
        message: "Jogo não encontrado no Sofascore (xG/pressão).",
      });
    }

    return NextResponse.json({ found: true, intel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

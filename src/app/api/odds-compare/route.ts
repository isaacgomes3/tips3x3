import { NextResponse } from "next/server";
import { buildOddsCompare } from "@/lib/odds-compare/build";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 40);
    const regions = searchParams.get("regions")?.trim() || "eu";
    const maxSports = Number(searchParams.get("sports") ?? 8);

    const data = await buildOddsCompare({
      limit: Number.isFinite(limit) ? limit : 40,
      regions,
      maxSports: Number.isFinite(maxSports) ? maxSports : 8,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

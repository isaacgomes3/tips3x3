import { NextResponse } from "next/server";
import { scanDayOpportunities } from "@/lib/analysis/scanner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyIdeal = searchParams.get("ideal") === "1";
    const limit = Number(searchParams.get("limit") ?? 30);

    const data = await scanDayOpportunities({
      onlyIdeal,
      limit: Number.isFinite(limit) ? limit : 30,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import { listIndications } from "@/lib/indications-store";
import { buildStatementDays } from "@/lib/indications-statement";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

/** Extrato de um usuário: operações casadas na Bolsa, agrupadas por dia. */
export async function GET(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  const product = (searchParams.get("product") || "").trim();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Informe o email do usuário." },
      { status: 400 },
    );
  }

  const items = listIndications({ limit: MAX_ITEMS }).filter(
    (i) =>
      (i.userEmail ?? "").trim().toLowerCase() === email &&
      (!product || i.appProduct === product),
  );
  const days = buildStatementDays(items);

  return NextResponse.json({
    ok: true,
    email,
    generatedAt: new Date().toISOString(),
    days,
    totals: {
      count: days.reduce((sum, d) => sum + d.totals.count, 0),
      green: days.reduce((sum, d) => sum + d.totals.green, 0),
      red: days.reduce((sum, d) => sum + d.totals.red, 0),
      pending: days.reduce((sum, d) => sum + d.totals.pending, 0),
      staked:
        Math.round(days.reduce((sum, d) => sum + d.totals.staked, 0) * 100) /
        100,
      profit:
        Math.round(days.reduce((sum, d) => sum + d.totals.profit, 0) * 100) /
        100,
    },
  });
}

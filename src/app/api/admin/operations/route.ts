import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import { listIndications } from "@/lib/indications-store";
import {
  isLayMatchedOnExchange,
  isUserExecutedOperation,
  tallyUserOperations,
  tallyUserOperationsByEmail,
} from "@/lib/indications-metrics";

export const dynamic = "force-dynamic";

/** Operações registradas, filtráveis por usuário/origem — gestão do master. */
export async function GET(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  const source = searchParams.get("source") || "";
  const limitRaw = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 500)
    : 200;

  const all = listIndications({ limit: 500, includeFailed: true });
  // Tentativas falhadas continuam na lista para auditoria; as contagens usam
  // só ordens do usuário com Lay casado na Bolsa.
  let items = all.filter((i) => Boolean(i.userEmail?.trim()));

  if (email) {
    items =
      email === "sistema"
        ? all.filter((i) => !i.userEmail)
        : items.filter((i) => i.userEmail === email);
  }
  if (source === "apk" || source === "painel" || source === "extensao") {
    items = items.filter((i) => i.source === source);
  }

  const owners = [...tallyUserOperationsByEmail(all).values()]
    .map((row) => ({
      email: row.email,
      count: row.matched + row.unmatched,
      matched: row.matched,
      unmatched: row.unmatched,
    }))
    .sort((a, b) => b.count - a.count);

  const sliced = items.slice(0, limit);
  const totals = tallyUserOperations(sliced);
  const failed = sliced.filter((i) => i.execStatus === "failed").length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    items: sliced,
    owners,
    totals: {
      total: totals.matched,
      green: totals.green,
      red: totals.red,
      pending: totals.inPlay,
      unmatched: totals.unmatched,
      failed,
      withValue: sliced.filter(
        (i) =>
          isLayMatchedOnExchange(i) &&
          Number(i.liability ?? i.stake ?? 0) > 0,
      ).length,
      staked: totals.staked,
      profit: totals.profit,
    },
  });
}

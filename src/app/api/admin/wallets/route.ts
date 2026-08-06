import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import { getAppConfig } from "@/lib/admin/app-config-store";
import { isAutoConfirmGateway, isLucReady } from "@/lib/wallet/luc-paguei";
import {
  addWalletAdjustment,
  creditDeposit,
  listDeposits,
  listWalletEntries,
  listWalletSummaries,
  rejectDeposit,
} from "@/lib/wallet/wallet-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const config = getAppConfig();
  const wallets = listWalletSummaries();
  const deposits = listDeposits({ limit: 100 });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    wallets,
    deposits,
    pending: deposits.filter(
      (d) => d.status === "pendente" || d.status === "gateway_pago",
    ),
    entries: listWalletEntries({ limit: 200 }),
    totals: {
      credit: Math.round(wallets.reduce((s, w) => s + w.balance, 0) * 100) / 100,
      fees: Math.round(wallets.reduce((s, w) => s + w.fees, 0) * 100) / 100,
      deposited:
        Math.round(wallets.reduce((s, w) => s + w.deposited, 0) * 100) / 100,
      blocked: wallets.filter((w) => w.blocked).length,
    },
    config: {
      feePct: config.walletFeePct,
      commissionPct: config.walletExchangeCommissionPct,
      minDeposit: config.walletMinDeposit,
      chargeLucroCerto: config.walletChargeLucroCerto,
      blockWhenEmpty: config.walletBlockWhenEmpty,
      pixReady: isLucReady(),
      autoConfirm: isAutoConfirmGateway(),
    },
  });
}

/** Ações do master: creditar/recusar depósito e lançar ajuste manual. */
export async function POST(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  let body: {
    action?: string;
    depositId?: string;
    email?: string;
    amount?: number;
    note?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const by = gate.session.email;

  if (body.action === "credit") {
    const res = creditDeposit({ depositId: String(body.depositId || ""), by });
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  }

  if (body.action === "reject") {
    const res = rejectDeposit({
      depositId: String(body.depositId || ""),
      by,
      note: body.note ?? null,
    });
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  }

  if (body.action === "adjust" || body.action === "credit-manual") {
    const res = addWalletAdjustment({
      email: String(body.email || ""),
      amount: Number(body.amount),
      note: body.note ?? null,
      createdBy: by,
      kind: body.action === "credit-manual" ? "deposito" : "ajuste",
    });
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}

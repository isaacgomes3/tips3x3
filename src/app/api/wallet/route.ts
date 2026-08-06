import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { getAppConfig } from "@/lib/admin/app-config-store";
import { isMasterEmail } from "@/lib/auth/users-store";
import { isAutoConfirmGateway, isLucReady } from "@/lib/wallet/luc-paguei";
import { getCreditTier } from "@/lib/wallet/credit-tier";
import { effectiveCreditTier, getTrialInfo } from "@/lib/wallet/trial";
import {
  getWalletSummary,
  listDeposits,
  listWalletEntries,
} from "@/lib/wallet/wallet-store";

export const dynamic = "force-dynamic";

/** Carteira do cliente logado: saldo, extrato e depósitos. */
export async function GET(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const email = auth.session.email;
  const config = getAppConfig();
  const summary = getWalletSummary(email);
  const master = isMasterEmail(email);
  const trial = getTrialInfo(email);
  // Sem crédito, a automação não pode operar — master e teste grátis não são bloqueados.
  const blocked = master || trial.active ? false : summary.blocked;

  return NextResponse.json({
    ok: true,
    wallet: {
      ...summary,
      blocked,
      tier: effectiveCreditTier(email, getCreditTier(summary.balance), master),
      isMaster: master,
    },
    trial,
    entries: listWalletEntries({ email, limit: 100 }),
    deposits: listDeposits({ email, limit: 20 }),
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

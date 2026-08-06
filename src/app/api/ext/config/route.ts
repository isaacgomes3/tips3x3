import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { LAY_OVER_LIMIT_PRESSURE } from "@/lib/analysis/lay-over-limit-pressure";
import { getAppConfig } from "@/lib/admin/app-config-store";
import { isMasterEmail } from "@/lib/auth/users-store";
import { isWalletBlocked } from "@/lib/wallet/wallet-fees";
import { getWalletSummary } from "@/lib/wallet/wallet-store";
import { getCreditTier, isMarketAllowedForTier } from "@/lib/wallet/credit-tier";
import { effectiveCreditTier } from "@/lib/wallet/trial";

export const dynamic = "force-dynamic";

/**
 * Configuração operacional para a extensão Bolsa Manual, no vocabulário dela.
 * Mesmos defaults do APK: o master define, a escolha local do usuário vence.
 * QOV não existe no APK — a extensão recebe o mercado sempre desligado.
 */
export async function GET(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const config = getAppConfig();
  // Sem crédito na carteira o executor não deve abrir operação nova.
  const blocked = isWalletBlocked(auth.session.email);
  const wallet = getWalletSummary(auth.session.email);
  const master = isMasterEmail(auth.session.email);
  const tier = effectiveCreditTier(
    auth.session.email,
    getCreditTier(wallet.balance),
    master,
  );

  /**
   * Liberado = ligado pelo admin E dentro da faixa de crédito do cliente
   * (ou master, que enxerga tudo que o admin habilitar, sem restrição de faixa).
   */
  const allow = (marketKey: Parameters<typeof isMarketAllowedForTier>[0], adminOn: boolean) => {
    if (blocked) return false;
    if (!adminOn) return false;
    if (master) return true;
    return isMarketAllowedForTier(marketKey, tier);
  };

  return NextResponse.json({
    ok: true,
    email: auth.session.email,
    updatedAt: config.updatedAt,
    blocked,
    creditTier: tier,
    isMaster: master,
    wallet: { balance: wallet.balance, feePct: config.walletFeePct },
    defaults: {
      profitPct: config.targetProfitPct,
      stakePct: config.lay3x3StakePct,
      stakePctEr: config.eventosRarosStakePct,
      stakeFixedEr: config.eventosRarosStakeFixed,
      stakePctOver: config.overStakePct,
      stakePctOver45: config.over45StakePct,
      stakePctQov: config.qovStakePct,
      enabledMarkets: {
        lay_3_3: allow("lay_3_3", config.lay3x3Enabled),
        lay_eventos_raros: allow("lay_eventos_raros", config.eventosRarosEnabled),
        lay_over_35: allow("lay_over_35", config.over35Enabled),
        lay_over_45: allow("lay_over_45", config.over45Enabled),
        lay_over_limit_pressure: allow(
          "lay_over_limit_pressure",
          config.layOverLimitPressureEnabled ?? true,
        ),
        lay_qov: allow("lay_qov", config.qovEnabled ?? true),
        lay_lucro_certo: allow("lay_lucro_certo", config.lucroCertoEnabled ?? true),
      },
    },
    layOverLimitPressure: {
      enabled: allow("lay_over_limit_pressure", config.layOverLimitPressureEnabled ?? true),
      // A estratégia tem lucro alvo e banca próprios (1% / 5%), não os do Lay 3x3.
      targetProfitPct: LAY_OVER_LIMIT_PRESSURE.defaultTargetProfitPct,
      stakePct: LAY_OVER_LIMIT_PRESSURE.defaultStakePct,
      lines: [...LAY_OVER_LIMIT_PRESSURE.lines],
      maxLayOdds: LAY_OVER_LIMIT_PRESSURE.oddsBand.max,
    },
  });
}

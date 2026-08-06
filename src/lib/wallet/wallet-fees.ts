/**
 * Taxa da tips3x3 sobre o lucro da operação.
 * Só cobra depois do Lay confirmado e correspondido na Bolsa.
 */

import { getAppConfig } from "@/lib/admin/app-config-store";
import { isMasterEmail } from "@/lib/auth/users-store";
import { isLayMatchedOnExchange } from "@/lib/indications-status";
import { isTrialActive } from "@/lib/wallet/trial";
import type { Indication } from "@/lib/indications-types";
import { brlRound } from "@/lib/wallet/wallet-types";
import {
  chargeOperationFee,
  getWalletSummary,
} from "@/lib/wallet/wallet-store";

/**
 * Lucro bruto: Lucro certo = stake casada (o placar alvo já é impossível,
 * então o lay fica com a stake do apostador contrário). Ainda sem descontar
 * a comissão da bolsa/exchange.
 */
export function operationProfitForFee(item: Indication): number {
  const realized = Number(item.realizedProfit ?? 0);
  if (realized > 0) return realized;
  const stake = Number(item.stake ?? 0);
  return stake > 0 ? stake : 0;
}

/**
 * Desconta a comissão da bolsa/exchange do lucro bruto → lucro líquido.
 * A taxa da tips3x3 (walletFeePct) incide só sobre esse líquido.
 */
export function netProfitAfterExchangeCommission(
  grossProfit: number,
  commissionPct: number,
): number {
  if (!(grossProfit > 0)) return 0;
  const pct = Number.isFinite(commissionPct) ? Math.max(0, commissionPct) : 0;
  return brlRound(grossProfit * (1 - pct / 100));
}

/** Filtros que hoje geram taxa — começamos só pelo Lucro certo. */
function chargesFee(item: Indication): boolean {
  const config = getAppConfig();
  if (item.kind === "lucro-certo") return config.walletChargeLucroCerto;
  return false;
}

export type FeeChargeResult =
  | { charged: true; fee: number; balance: number; already: boolean }
  | { charged: false; reason: string };

/**
 * Chamado quando o executor reporta a operação. Idempotente por operação:
 * repetir o POST (APK, extensão, painel) não cobra duas vezes.
 */
export function chargeMatchedOperationFee(
  item: Indication | null,
): FeeChargeResult {
  if (!item) return { charged: false, reason: "sem_operacao" };
  const email = item.userEmail?.trim().toLowerCase();
  if (!email) return { charged: false, reason: "operacao_sem_dono" };
  if (item.execStatus === "failed") {
    return { charged: false, reason: "tentativa_falhada" };
  }
  if (!chargesFee(item)) return { charged: false, reason: "filtro_sem_taxa" };
  if (!isLayMatchedOnExchange(item)) {
    return { charged: false, reason: "lay_ainda_nao_casou" };
  }

  const grossProfit = operationProfitForFee(item);
  if (!(grossProfit > 0)) return { charged: false, reason: "sem_lucro_apurado" };

  const config = getAppConfig();
  const commissionPct = config.walletExchangeCommissionPct;
  const netProfit = netProfitAfterExchangeCommission(grossProfit, commissionPct);
  if (!(netProfit > 0)) return { charged: false, reason: "sem_lucro_apurado" };

  const feePct = config.walletFeePct;
  const res = chargeOperationFee({
    email,
    operationId: item.id,
    profit: netProfit,
    feePct,
    note:
      `${item.eventName || item.eventId} · ${item.scoreLabel} · ` +
      `comissão bolsa ${commissionPct}% + taxa ${feePct}% sobre líquido`,
  });

  if (!res.ok) return { charged: false, reason: res.error };
  return {
    charged: true,
    fee: Math.abs(res.entry.amount),
    balance: res.balance,
    already: res.already,
  };
}

/**
 * Cliente sem crédito não pode operar a automação — regra obrigatória,
 * independente do toggle de admin (que hoje só afeta o aviso no painel).
 * Master nunca é bloqueado por saldo. Teste grátis 48h também libera,
 * mesmo com carteira zerada.
 */
export function isWalletBlocked(email: string | null | undefined): boolean {
  const key = email?.trim().toLowerCase();
  if (!key) return false;
  if (isMasterEmail(key)) return false;
  if (isTrialActive(key)) return false;
  return getWalletSummary(key).blocked;
}

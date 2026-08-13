import type { CreditTier } from "@/lib/wallet/credit-tier";
/** Faixa efetiva: somente master recebe acesso irrestrito. */
export function effectiveCreditTier(
  _email: string | null | undefined,
  balanceTier: CreditTier,
  isMaster: boolean,
): CreditTier {
  if (isMaster) return "250";
  return balanceTier;
}

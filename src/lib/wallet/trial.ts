/**
 * Teste grátis 48h: o próprio usuário ativa 1x (para sempre) no seu ambiente
 * e, durante a janela de 48h, todos os filtros ficam liberados e a automação
 * roda mesmo sem crédito. Depois expira e volta a restringir por faixa de
 * crédito — só libera de novo com depósito num dos planos.
 */

import { getUserTrialStartedAt } from "@/lib/auth/users-store";
import type { CreditTier } from "@/lib/wallet/credit-tier";

export const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;

export type TrialInfo = {
  /** Já foi ativado alguma vez (mesmo que já tenha expirado). */
  used: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  /** Dentro da janela das 48h agora. */
  active: boolean;
};

export function getTrialInfo(email: string | null | undefined): TrialInfo {
  const key = email?.trim().toLowerCase();
  const startedAt = key ? getUserTrialStartedAt(key) : null;
  if (!startedAt) {
    return { used: false, startedAt: null, expiresAt: null, active: false };
  }
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) {
    return { used: true, startedAt, expiresAt: null, active: false };
  }
  const expiresMs = startMs + TRIAL_DURATION_MS;
  return {
    used: true,
    startedAt,
    expiresAt: new Date(expiresMs).toISOString(),
    active: Date.now() < expiresMs,
  };
}

export function isTrialActive(email: string | null | undefined): boolean {
  return getTrialInfo(email).active;
}

/** Faixa efetiva já considerando master e teste grátis ativo (libera tudo). */
export function effectiveCreditTier(
  email: string | null | undefined,
  balanceTier: CreditTier,
  isMaster: boolean,
): CreditTier {
  if (isMaster) return "250";
  if (isTrialActive(email)) return "250";
  return balanceTier;
}

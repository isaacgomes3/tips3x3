export type BillingCycle = "mensal" | "trimestral" | "semestral" | "anual";

export type SubscriptionStatus =
  | "ativo"
  | "inadimplente"
  | "cancelado";

export type Subscription = {
  email: string;
  plan: string;
  /** Valor cobrado por ciclo (BRL). */
  amount: number;
  cycle: BillingCycle;
  /** Dia do vencimento (1–28, evita meses curtos). */
  dueDay: number;
  status: SubscriptionStatus;
  startedAt: string;
  notes?: string;
};

export type Payment = {
  id: string;
  email: string;
  amount: number;
  paidAt: string;
  method?: string;
  note?: string;
};

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** Valor normalizado por mês — base do MRR. */
export function monthlyValue(sub: Pick<Subscription, "amount" | "cycle">) {
  const months = CYCLE_MONTHS[sub.cycle] ?? 1;
  return sub.amount / months;
}

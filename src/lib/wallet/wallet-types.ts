/** Carteira de crédito do cliente: depósitos PIX e taxa sobre o lucro. */

export type WalletEntryKind = "deposito" | "taxa" | "ajuste" | "estorno";

export type WalletEntry = {
  id: string;
  email: string;
  kind: WalletEntryKind;
  /** Positivo credita, negativo debita (BRL). */
  amount: number;
  at: string;
  /** Indicação que gerou a taxa — garante cobrança única por operação. */
  operationId?: string | null;
  depositId?: string | null;
  /** Lucro da operação que originou a taxa. */
  profitBase?: number | null;
  note?: string | null;
  createdBy?: string | null;
};

/**
 * pendente → gateway_pago → creditado
 * Sem pagamento: pendente → expirado. Recusa manual: → recusado.
 */
export type DepositStatus =
  | "pendente"
  | "gateway_pago"
  | "creditado"
  | "recusado"
  | "expirado";

export type Deposit = {
  id: string;
  email: string;
  amount: number;
  status: DepositStatus;
  channel: "luc_paguei";
  /** Prefixo DEP- para o webhook rotear. */
  externalId: string;
  gatewayTransactionId?: string | null;
  pixCopyPaste?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  createdAt: string;
  expiresAt: string;
  gatewayPaidAt?: string | null;
  gatewayWebhookAt?: string | null;
  gatewayLastStatus?: string | null;
  creditedAt?: string | null;
  creditedBy?: string | null;
  note?: string | null;
};

export type WalletSummary = {
  email: string;
  /** Depósitos creditados − taxas − ajustes. */
  balance: number;
  deposited: number;
  fees: number;
  /** Lucro total das operações que geraram taxa. */
  profitBase: number;
  lastEntryAt: string | null;
  /** Crédito insuficiente para operar. */
  blocked: boolean;
};

export const brlRound = (value: number) => Math.round(value * 100) / 100;

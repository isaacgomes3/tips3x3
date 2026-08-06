/**
 * Assinaturas e pagamentos dos usuários do painel.
 * Disco é a fonte da verdade (PM2 / reinícios), igual aos demais stores.
 */

import fs from "fs";
import path from "path";
import type {
  BillingCycle,
  Payment,
  Subscription,
  SubscriptionStatus,
} from "@/lib/admin/billing-types";

export type {
  BillingCycle,
  Payment,
  Subscription,
  SubscriptionStatus,
} from "@/lib/admin/billing-types";

type FileShape = {
  subscriptions: Subscription[];
  payments: Payment[];
};

const MAX_PAYMENTS = 2000;

function resolveStorePath() {
  if (process.env.BILLING_PATH) return process.env.BILLING_PATH;
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "billing.json",
  );
}

function readFile(): FileShape {
  const STORE_PATH = resolveStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) return { subscriptions: [], payments: [] };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as FileShape;
    return {
      subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
      payments: Array.isArray(raw.payments) ? raw.payments : [],
    };
  } catch (err) {
    console.error("[billing-store] read failed", resolveStorePath(), err);
    return { subscriptions: [], payments: [] };
  }
}

function writeFileAtomic(data: FileShape) {
  const STORE_PATH = resolveStorePath();
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCycle(value: unknown): BillingCycle {
  return value === "trimestral" ||
    value === "semestral" ||
    value === "anual"
    ? value
    : "mensal";
}

function normalizeStatus(value: unknown): SubscriptionStatus {
  return value === "teste" || value === "inadimplente" || value === "cancelado"
    ? value
    : "ativo";
}

export function listSubscriptions(): Subscription[] {
  return readFile().subscriptions.sort((a, b) =>
    a.email.localeCompare(b.email),
  );
}

export function listPayments(opts?: { email?: string; limit?: number }): Payment[] {
  let items = readFile().payments;
  if (opts?.email) {
    const key = normalizeEmail(opts.email);
    items = items.filter((p) => p.email === key);
  }
  items = [...items].sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
  if (opts?.limit && opts.limit > 0) items = items.slice(0, opts.limit);
  return items;
}

export function upsertSubscription(input: {
  email: string;
  plan?: string;
  amount?: number;
  cycle?: string;
  dueDay?: number;
  status?: string;
  notes?: string;
}): { ok: true; subscription: Subscription } | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "E-mail obrigatório." };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Valor inválido." };
  }

  const dueDayRaw = Number(input.dueDay);
  const dueDay = Number.isFinite(dueDayRaw)
    ? Math.min(28, Math.max(1, Math.round(dueDayRaw)))
    : 5;

  const data = readFile();
  const existing = data.subscriptions.find((s) => s.email === email);

  const subscription: Subscription = {
    email,
    plan: String(input.plan || existing?.plan || "Mensal").trim(),
    amount: Math.round(amount * 100) / 100,
    cycle: normalizeCycle(input.cycle ?? existing?.cycle),
    dueDay,
    status: normalizeStatus(input.status ?? existing?.status),
    startedAt: existing?.startedAt || new Date().toISOString(),
    notes: input.notes?.trim() || existing?.notes,
  };

  const next = existing
    ? data.subscriptions.map((s) => (s.email === email ? subscription : s))
    : [...data.subscriptions, subscription];

  try {
    writeFileAtomic({ ...data, subscriptions: next });
  } catch (err) {
    console.error("[billing-store] upsert failed", err);
    return { ok: false, error: "Falha ao gravar assinatura." };
  }
  return { ok: true, subscription };
}

export function removeSubscription(email: string): { ok: boolean } {
  const key = normalizeEmail(email);
  const data = readFile();
  const next = data.subscriptions.filter((s) => s.email !== key);
  if (next.length === data.subscriptions.length) return { ok: false };
  writeFileAtomic({ ...data, subscriptions: next });
  return { ok: true };
}

export function addPayment(input: {
  email: string;
  amount: number;
  paidAt?: string;
  method?: string;
  note?: string;
}): { ok: true; payment: Payment } | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  const amount = Number(input.amount);
  if (!email) return { ok: false, error: "E-mail obrigatório." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Valor do pagamento inválido." };
  }

  const paidAtRaw = input.paidAt ? Date.parse(input.paidAt) : Date.now();
  const paidAt = new Date(
    Number.isFinite(paidAtRaw) ? paidAtRaw : Date.now(),
  ).toISOString();

  const payment: Payment = {
    id: crypto.randomUUID(),
    email,
    amount: Math.round(amount * 100) / 100,
    paidAt,
    method: input.method?.trim() || undefined,
    note: input.note?.trim() || undefined,
  };

  const data = readFile();
  const payments = [...data.payments, payment]
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))
    .slice(0, MAX_PAYMENTS);

  try {
    writeFileAtomic({ ...data, payments });
  } catch (err) {
    console.error("[billing-store] payment failed", err);
    return { ok: false, error: "Falha ao gravar pagamento." };
  }
  return { ok: true, payment };
}

export function removePayment(id: string): { ok: boolean } {
  const data = readFile();
  const next = data.payments.filter((p) => p.id !== id);
  if (next.length === data.payments.length) return { ok: false };
  writeFileAtomic({ ...data, payments: next });
  return { ok: true };
}

/** Próximo vencimento a partir do dia configurado. */
export function nextDueDate(dueDay: number, from = new Date()): string {
  const day = Math.min(28, Math.max(1, Math.round(dueDay) || 1));
  const due = new Date(from.getFullYear(), from.getMonth(), day);
  if (due.getTime() < new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) {
    due.setMonth(due.getMonth() + 1);
  }
  return due.toISOString();
}

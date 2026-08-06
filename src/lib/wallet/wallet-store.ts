/**
 * Carteira de crédito por cliente. Disco é a fonte da verdade (PM2/reinícios).
 * Saldo = soma do extrato: depósitos creditados menos taxas e ajustes.
 */

import fs from "fs";
import path from "path";
import {
  brlRound,
  type Deposit,
  type DepositStatus,
  type WalletEntry,
  type WalletEntryKind,
  type WalletSummary,
} from "@/lib/wallet/wallet-types";
import {
  isAutoConfirmGateway,
  isPaidGatewayStatus,
} from "@/lib/wallet/luc-paguei";

export type {
  Deposit,
  DepositStatus,
  WalletEntry,
  WalletEntryKind,
  WalletSummary,
} from "@/lib/wallet/wallet-types";

type FileShape = {
  entries: WalletEntry[];
  deposits: Deposit[];
};

const MAX_ENTRIES = 5000;
const MAX_DEPOSITS = 2000;
/** Cobrança PIX válida por 1h — depois o cliente gera outra. */
const DEPOSIT_TTL_MS = 60 * 60 * 1000;

function resolveStorePath() {
  if (process.env.WALLET_PATH) return process.env.WALLET_PATH;
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "wallets.json",
  );
}

function readFile(): FileShape {
  const STORE_PATH = resolveStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) return { entries: [], deposits: [] };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as FileShape;
    return {
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      deposits: Array.isArray(raw.deposits) ? raw.deposits : [],
    };
  } catch (err) {
    console.error("[wallet-store] read failed", resolveStorePath(), err);
    return { entries: [], deposits: [] };
  }
}

function writeFileAtomic(data: FileShape) {
  const STORE_PATH = resolveStorePath();
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  const trimmed: FileShape = {
    entries: data.entries.slice(-MAX_ENTRIES),
    deposits: data.deposits.slice(-MAX_DEPOSITS),
  };
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}

function normalizeEmail(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase();
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Pendente vencido deixa de aparecer como cobrança viva. */
function applyExpiry(deposits: Deposit[]): boolean {
  let changed = false;
  const now = Date.now();
  for (const dep of deposits) {
    if (dep.status !== "pendente") continue;
    const exp = Date.parse(dep.expiresAt || "");
    if (Number.isFinite(exp) && now > exp) {
      dep.status = "expirado";
      changed = true;
    }
  }
  return changed;
}

export function listWalletEntries(opts?: {
  email?: string;
  limit?: number;
  kind?: WalletEntryKind;
}): WalletEntry[] {
  let items = readFile().entries;
  const email = normalizeEmail(opts?.email);
  if (email) items = items.filter((e) => e.email === email);
  if (opts?.kind) items = items.filter((e) => e.kind === opts.kind);
  items = [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (opts?.limit && opts.limit > 0) items = items.slice(0, opts.limit);
  return items;
}

export function listDeposits(opts?: {
  email?: string;
  limit?: number;
  status?: DepositStatus;
}): Deposit[] {
  const data = readFile();
  if (applyExpiry(data.deposits)) {
    try {
      writeFileAtomic(data);
    } catch (err) {
      console.error("[wallet-store] expiry write failed", err);
    }
  }
  let items = data.deposits;
  const email = normalizeEmail(opts?.email);
  if (email) items = items.filter((d) => d.email === email);
  if (opts?.status) items = items.filter((d) => d.status === opts.status);
  items = [...items].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  if (opts?.limit && opts.limit > 0) items = items.slice(0, opts.limit);
  return items;
}

export function getWalletSummary(email: string): WalletSummary {
  const key = normalizeEmail(email);
  const entries = readFile().entries.filter((e) => e.email === key);

  let balance = 0;
  let deposited = 0;
  let fees = 0;
  let profitBase = 0;
  let lastEntryAt: string | null = null;

  for (const e of entries) {
    balance += Number(e.amount) || 0;
    if (e.kind === "deposito") deposited += Number(e.amount) || 0;
    if (e.kind === "taxa") {
      fees += Math.abs(Number(e.amount) || 0);
      profitBase += Number(e.profitBase) || 0;
    }
    if (!lastEntryAt || Date.parse(e.at) > Date.parse(lastEntryAt)) {
      lastEntryAt = e.at;
    }
  }

  balance = brlRound(balance);
  return {
    email: key,
    balance,
    deposited: brlRound(deposited),
    fees: brlRound(fees),
    profitBase: brlRound(profitBase),
    lastEntryAt,
    blocked: balance <= 0,
  };
}

export function listWalletSummaries(): WalletSummary[] {
  const emails = new Set<string>();
  const data = readFile();
  for (const e of data.entries) emails.add(e.email);
  for (const d of data.deposits) emails.add(d.email);
  return [...emails]
    .map((email) => getWalletSummary(email))
    .sort((a, b) => b.balance - a.balance);
}

function appendEntry(entry: WalletEntry): WalletEntry {
  const data = readFile();
  data.entries.push(entry);
  writeFileAtomic(data);
  return entry;
}

/** Crédito/débito manual do master (ajuste ou estorno). */
export function addWalletAdjustment(input: {
  email: string;
  amount: number;
  note?: string | null;
  createdBy?: string | null;
  kind?: "ajuste" | "estorno" | "deposito";
}): { ok: true; entry: WalletEntry } | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  const amount = Number(input.amount);
  if (!email) return { ok: false, error: "E-mail obrigatório." };
  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, error: "Valor inválido." };
  }
  const entry: WalletEntry = {
    id: newId("wal"),
    email,
    kind: input.kind || "ajuste",
    amount: brlRound(amount),
    at: new Date().toISOString(),
    note: input.note?.trim() || null,
    createdBy: input.createdBy || null,
  };
  try {
    appendEntry(entry);
  } catch (err) {
    console.error("[wallet-store] adjustment failed", err);
    return { ok: false, error: "Falha ao gravar lançamento." };
  }
  return { ok: true, entry };
}

/**
 * Taxa da tips3x3 sobre o lucro de uma operação casada.
 * Idempotente por operationId — webhook, APK e painel podem repetir a chamada.
 */
export function chargeOperationFee(input: {
  email: string;
  operationId: string;
  profit: number;
  feePct: number;
  note?: string | null;
}):
  | { ok: true; entry: WalletEntry; already: false; balance: number }
  | { ok: true; entry: WalletEntry; already: true; balance: number }
  | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  const operationId = String(input.operationId || "").trim();
  const profit = Number(input.profit);
  const feePct = Number(input.feePct);

  if (!email || !operationId) {
    return { ok: false, error: "E-mail e operação obrigatórios." };
  }
  if (!Number.isFinite(profit) || profit <= 0) {
    return { ok: false, error: "Operação sem lucro para cobrar." };
  }
  if (!Number.isFinite(feePct) || feePct <= 0) {
    return { ok: false, error: "Percentual de taxa inválido." };
  }

  const data = readFile();
  const existing = data.entries.find(
    (e) => e.kind === "taxa" && e.operationId === operationId,
  );
  if (existing) {
    return {
      ok: true,
      entry: existing,
      already: true,
      balance: getWalletSummary(email).balance,
    };
  }

  const fee = brlRound((profit * feePct) / 100);
  if (!(fee > 0)) return { ok: false, error: "Taxa calculada em zero." };

  const entry: WalletEntry = {
    id: newId("wal"),
    email,
    kind: "taxa",
    amount: -fee,
    at: new Date().toISOString(),
    operationId,
    profitBase: brlRound(profit),
    note: input.note?.trim() || `Taxa ${feePct}% sobre lucro`,
    createdBy: "sistema",
  };

  data.entries.push(entry);
  try {
    writeFileAtomic(data);
  } catch (err) {
    console.error("[wallet-store] fee failed", err);
    return { ok: false, error: "Falha ao gravar taxa." };
  }
  return {
    ok: true,
    entry,
    already: false,
    balance: getWalletSummary(email).balance,
  };
}

export function findDeposit(id: string): Deposit | null {
  return readFile().deposits.find((d) => d.id === id) ?? null;
}

export function createPendingDeposit(input: {
  email: string;
  amount: number;
  externalId: string;
  payerName?: string | null;
  payerDocument?: string | null;
}): Deposit {
  const deposit: Deposit = {
    id: newId("dep"),
    email: normalizeEmail(input.email),
    amount: brlRound(Number(input.amount)),
    status: "pendente",
    channel: "luc_paguei",
    externalId: input.externalId,
    gatewayTransactionId: null,
    pixCopyPaste: null,
    payerName: input.payerName?.trim() || null,
    payerDocument: String(input.payerDocument || "").replace(/\D/g, "") || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + DEPOSIT_TTL_MS).toISOString(),
    gatewayPaidAt: null,
    gatewayWebhookAt: null,
    gatewayLastStatus: null,
    creditedAt: null,
    creditedBy: null,
    note: null,
  };
  const data = readFile();
  data.deposits.push(deposit);
  writeFileAtomic(data);
  return deposit;
}

export function updateDeposit(
  id: string,
  patch: Partial<Deposit>,
): Deposit | null {
  const data = readFile();
  const idx = data.deposits.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const next = { ...data.deposits[idx]!, ...patch, id };
  data.deposits[idx] = next;
  writeFileAtomic(data);
  return next;
}

/**
 * Credita o depósito na carteira uma única vez.
 * Aceita pendente (crédito manual antecipado) ou gateway_pago.
 */
export function creditDeposit(input: {
  depositId: string;
  by?: string | null;
  source?: string;
}):
  | { ok: true; deposit: Deposit; already: boolean; balance: number }
  | { ok: false; error: string } {
  const data = readFile();
  const dep = data.deposits.find((d) => d.id === input.depositId);
  if (!dep) return { ok: false, error: "Depósito não encontrado." };

  if (dep.status === "creditado") {
    return {
      ok: true,
      deposit: dep,
      already: true,
      balance: getWalletSummary(dep.email).balance,
    };
  }
  if (dep.status !== "pendente" && dep.status !== "gateway_pago") {
    return { ok: false, error: `Depósito não creditável (${dep.status}).` };
  }
  // Guarda extra: mesmo external_id não credita duas vezes.
  const dup = data.entries.find(
    (e) => e.kind === "deposito" && e.depositId === dep.id,
  );
  if (dup) {
    dep.status = "creditado";
    writeFileAtomic(data);
    return {
      ok: true,
      deposit: dep,
      already: true,
      balance: getWalletSummary(dep.email).balance,
    };
  }

  const now = new Date().toISOString();
  dep.status = "creditado";
  dep.creditedAt = now;
  dep.creditedBy = input.by || input.source || "gateway";

  data.entries.push({
    id: newId("wal"),
    email: dep.email,
    kind: "deposito",
    amount: brlRound(dep.amount),
    at: now,
    depositId: dep.id,
    note: `Depósito PIX ${dep.externalId}`,
    createdBy: input.by || input.source || "gateway",
  });

  try {
    writeFileAtomic(data);
  } catch (err) {
    console.error("[wallet-store] credit failed", err);
    return { ok: false, error: "Falha ao creditar depósito." };
  }
  return {
    ok: true,
    deposit: dep,
    already: false,
    balance: getWalletSummary(dep.email).balance,
  };
}

export function rejectDeposit(input: {
  depositId: string;
  by?: string | null;
  note?: string | null;
}): { ok: true; deposit: Deposit } | { ok: false; error: string } {
  const data = readFile();
  const dep = data.deposits.find((d) => d.id === input.depositId);
  if (!dep) return { ok: false, error: "Depósito não encontrado." };
  if (dep.status === "creditado") {
    return { ok: false, error: "Depósito já creditado — use estorno." };
  }
  dep.status = "recusado";
  dep.note = input.note?.trim() || dep.note || null;
  dep.creditedBy = input.by || null;
  writeFileAtomic(data);
  return { ok: true, deposit: dep };
}

export type LucWebhookResult = {
  ok: true;
  matched: boolean;
  paid?: boolean;
  auto?: boolean;
  already?: boolean;
  reason?: string;
  deposit?: Deposit;
};

/**
 * Webhook do gateway. Sempre resolve ok (o caller responde 200) e é
 * idempotente: reenvio não credita de novo.
 */
export function applyLucWebhook(payload: unknown): LucWebhookResult {
  const row = (payload || {}) as Record<string, unknown>;
  const nested = row.data as Record<string, unknown> | undefined;
  const status =
    row.status ||
    row.payment_status ||
    row.state ||
    nested?.status ||
    (row.payment as Record<string, unknown> | undefined)?.status;
  const externalId = String(
    row.external_id ||
      row.externalId ||
      row.external_ref ||
      nested?.external_id ||
      (row.metadata as Record<string, unknown> | undefined)?.external_id ||
      "",
  ).trim();
  const txid = String(
    row.transaction_id ||
      row.transactionId ||
      row.txid ||
      row.id ||
      nested?.transaction_id ||
      "",
  ).trim();

  const data = readFile();
  let dep = externalId
    ? data.deposits.find((d) => d.externalId === externalId)
    : undefined;
  if (!dep && txid) {
    dep = data.deposits.find(
      (d) => d.gatewayTransactionId && d.gatewayTransactionId === txid,
    );
  }
  if (!dep) return { ok: true, matched: false, reason: "deposito_nao_encontrado" };

  if (dep.status === "creditado") {
    return { ok: true, matched: true, paid: true, already: true, deposit: dep };
  }

  const now = new Date().toISOString();
  dep.gatewayLastStatus = status != null ? String(status) : null;
  dep.gatewayWebhookAt = now;

  if (!isPaidGatewayStatus(status)) {
    writeFileAtomic(data);
    return { ok: true, matched: true, paid: false, deposit: dep };
  }

  if (txid && !dep.gatewayTransactionId) dep.gatewayTransactionId = txid;
  dep.gatewayPaidAt = dep.gatewayPaidAt || now;
  dep.status = "gateway_pago";
  writeFileAtomic(data);

  if (isAutoConfirmGateway()) {
    const credited = creditDeposit({
      depositId: dep.id,
      source: "luc_webhook_auto",
    });
    if (credited.ok) {
      return {
        ok: true,
        matched: true,
        paid: true,
        auto: true,
        already: credited.already,
        deposit: credited.deposit,
      };
    }
  }

  return { ok: true, matched: true, paid: true, auto: false, deposit: dep };
}

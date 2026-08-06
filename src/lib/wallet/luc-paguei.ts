/**
 * Gateway Luc Paguei — login + cobrança PIX dinâmica.
 * O EMV devolvido é a fonte do copia-e-cola; o QR é gerado localmente.
 */

const DEFAULT_BASE = "https://api.lucpaguei.online";
const TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedToken: string | null = null;
let cachedTokenAt = 0;

export type LucConfig = {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
};

export function lucConfig(): LucConfig {
  return {
    apiBaseUrl: String(
      process.env.LUC_PAGUEI_API_BASE || DEFAULT_BASE,
    ).replace(/\/$/, ""),
    clientId: process.env.LUC_PAGUEI_CLIENT_ID || "",
    clientSecret: process.env.LUC_PAGUEI_CLIENT_SECRET || "",
  };
}

export function isLucReady(): boolean {
  const c = lucConfig();
  return Boolean(c.apiBaseUrl && c.clientId && c.clientSecret);
}

/** Default manual: o webhook marca pago e o master credita. */
export function isAutoConfirmGateway(): boolean {
  const v = String(process.env.PIX_AUTO_GATEWAY_CONFIRM || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function publicBaseUrl(): string {
  return String(
    process.env.TIPS3X3_PUBLIC_URL ||
      process.env.PUBLIC_BASE_URL ||
      "https://tips3x3.com",
  ).replace(/\/$/, "");
}

export class LucError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(message: string, opts?: { status?: number; code?: string; data?: unknown }) {
    super(message);
    this.name = "LucError";
    this.status = opts?.status ?? 502;
    this.code = opts?.code;
    this.data = opts?.data;
  }
}

type JsonRecord = Record<string, unknown>;

async function lucFetch(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<JsonRecord> {
  const { apiBaseUrl } = lucConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data: JsonRecord = {};
  try {
    data = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      (data.error as string) ||
      (data.message as string) ||
      (data.msg as string) ||
      `Luc HTTP ${res.status}`;
    throw new LucError(String(msg), { status: res.status, data });
  }
  return data;
}

export async function lucLogin(opts?: { force?: boolean }): Promise<string> {
  if (!opts?.force && cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  const { clientId, clientSecret } = lucConfig();
  if (!clientId || !clientSecret) {
    throw new LucError("PIX automático não configurado (LUC_PAGUEI_*)", {
      status: 503,
      code: "LUC_NOT_CONFIGURED",
    });
  }
  const data = await lucFetch("/api/auth/login", {
    method: "POST",
    body: { client_id: clientId, client_secret: clientSecret },
  });
  const nested = data.data as JsonRecord | undefined;
  const token =
    (data.token as string) ||
    (data.access_token as string) ||
    (nested?.token as string);
  if (!token) throw new LucError("Luc login sem token");
  cachedToken = token;
  cachedTokenAt = Date.now();
  return token;
}

/** O gateway varia o campo do copia-e-cola entre versões. */
export function extractEmv(payload: unknown): string | null {
  const row = (payload || {}) as JsonRecord;
  const qr = row.qrCodeResponse as JsonRecord | undefined;
  const nested = row.data as JsonRecord | undefined;
  const nestedQr = nested?.qrCodeResponse as JsonRecord | undefined;
  const candidates = [
    qr?.emv,
    qr?.qrcode,
    qr?.pixCopiaECola,
    row.pixCopyPaste,
    row.pix_copy_paste,
    row.pixCode,
    row.pix_code,
    row.brCode,
    row.brcode,
    row.emv,
    row.qr_code,
    row.qrCode,
    row.copyPaste,
    row.copia_e_cola,
    nestedQr?.emv,
    nested?.pixCopyPaste,
    nested?.emv,
    nested?.pixCode,
    (row.payment as JsonRecord | undefined)?.emv,
    (row.charge as JsonRecord | undefined)?.emv,
  ];
  for (const v of candidates) {
    const s = String(v ?? "").trim();
    if (s.length > 40 && /^000201/.test(s)) return s;
  }
  for (const v of candidates) {
    const s = String(v ?? "").trim();
    if (s.length > 40) return s;
  }
  return null;
}

export function extractGatewayTxId(payload: unknown): string | null {
  const row = (payload || {}) as JsonRecord;
  const nested = row.data as JsonRecord | undefined;
  const id =
    row.transaction_id ||
    row.transactionId ||
    row.txid ||
    row.tx_id ||
    row.id ||
    nested?.transaction_id ||
    nested?.id ||
    (row.payment as JsonRecord | undefined)?.id;
  return id != null ? String(id) : null;
}

/** Status considerados pagos no webhook. */
export function isPaidGatewayStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toUpperCase();
  return [
    "COMPLETED",
    "PAID",
    "CONFIRMED",
    "APPROVED",
    "SUCCESS",
    "SUCCESSFUL",
    "DONE",
    "LIQUIDATED",
    "RECEIVED",
  ].includes(s);
}

export type LucDepositResult = {
  emv: string;
  gatewayTransactionId: string | null;
  raw: JsonRecord;
};

export async function lucCreateDeposit(opts: {
  amountReais: number;
  externalId: string;
  callbackUrl: string;
  payer: { name?: string; email?: string; document?: string };
}): Promise<LucDepositResult> {
  const document = String(opts.payer?.document || "").replace(/\D/g, "");
  if (document.length !== 11) {
    throw new LucError("CPF do pagador obrigatório (11 dígitos)", {
      status: 400,
      code: "CPF_REQUIRED",
    });
  }

  const body = {
    amount: Math.round(Number(opts.amountReais) * 100) / 100,
    external_id: opts.externalId,
    clientCallbackUrl: opts.callbackUrl,
    payer: {
      name: String(opts.payer?.name || "Cliente").slice(0, 120),
      email: String(opts.payer?.email || "cliente@tips3x3.com").slice(0, 120),
      document,
    },
  };

  const token = await lucLogin();
  let data: JsonRecord;
  try {
    data = await lucFetch("/api/payments/deposit", { method: "POST", body, token });
  } catch (e) {
    const status = e instanceof LucError ? e.status : 0;
    if (status === 401 || status === 403) {
      const retryToken = await lucLogin({ force: true });
      data = await lucFetch("/api/payments/deposit", {
        method: "POST",
        body,
        token: retryToken,
      });
    } else {
      throw e;
    }
  }

  const emv = extractEmv(data);
  if (!emv) {
    throw new LucError("Gateway não retornou o PIX copia-e-cola", {
      status: 502,
      code: "LUC_NO_EMV",
      data,
    });
  }
  return { emv, gatewayTransactionId: extractGatewayTxId(data), raw: data };
}

/** DEP-{user}-{stamp}-{rnd} — o webhook roteia pelo prefixo. */
export function makeDepositExternalId(email: string): string {
  const uid =
    String(email || "user")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-8) || "user";
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const rnd = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `DEP-${uid}-${stamp}-${rnd}`;
}

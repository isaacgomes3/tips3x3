import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth/require-session";
import { getAppConfig } from "@/lib/admin/app-config-store";
import {
  LucError,
  isAutoConfirmGateway,
  isLucReady,
  lucCreateDeposit,
  makeDepositExternalId,
  publicBaseUrl,
} from "@/lib/wallet/luc-paguei";
import { pixQrDataUrl } from "@/lib/wallet/pix-qr";
import {
  createPendingDeposit,
  findDeposit,
  listDeposits,
  updateDeposit,
} from "@/lib/wallet/wallet-store";

export const dynamic = "force-dynamic";

/** Cria a cobrança PIX do depósito de crédito. */
export async function POST(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { amount?: number; cpf?: string; document?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const config = getAppConfig();
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const min = config.walletMinDeposit;

  if (!Number.isFinite(amount) || amount < min) {
    return NextResponse.json(
      {
        error: `Depósito mínimo de ${min.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}.`,
        code: "MIN_DEPOSIT",
        minDeposit: min,
      },
      { status: 400 },
    );
  }

  const document = String(body.cpf || body.document || "").replace(/\D/g, "");
  if (document.length !== 11) {
    return NextResponse.json(
      { error: "Informe o CPF do pagador (11 dígitos).", code: "CPF_REQUIRED" },
      { status: 400 },
    );
  }

  if (!isLucReady()) {
    return NextResponse.json(
      {
        error: "PIX automático indisponível — gateway não configurado.",
        code: "LUC_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const email = auth.session.email;
  const externalId = makeDepositExternalId(email);
  const deposit = createPendingDeposit({
    email,
    amount,
    externalId,
    payerName: body.name ?? null,
    payerDocument: document,
  });

  try {
    const created = await lucCreateDeposit({
      amountReais: amount,
      externalId,
      callbackUrl: `${publicBaseUrl()}/api/webhooks/luc-paguei`,
      payer: { name: body.name || email, email, document },
    });

    const saved = updateDeposit(deposit.id, {
      pixCopyPaste: created.emv,
      gatewayTransactionId: created.gatewayTransactionId,
    });

    return NextResponse.json(
      {
        ok: true,
        deposit: saved ?? deposit,
        pixCopyPaste: created.emv,
        qrCodeBase64: await pixQrDataUrl(created.emv),
        autoConfirm: isAutoConfirmGateway(),
      },
      { status: 201 },
    );
  } catch (e) {
    const err = e instanceof LucError ? e : null;
    const message =
      e instanceof Error ? e.message : "Falha ao gerar a cobrança PIX";
    updateDeposit(deposit.id, {
      status: "recusado",
      note: `Falha ao gerar PIX: ${message}`,
    });
    return NextResponse.json(
      { ok: false, error: message, code: err?.code },
      { status: err?.status ?? 502 },
    );
  }
}

/** Poll do status da cobrança (a UI consulta a cada ~4s). */
export async function GET(request: Request) {
  const auth = await requireSessionFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: true, deposits: listDeposits({ email: auth.session.email, limit: 20 }) },
      { status: 200 },
    );
  }

  // listDeposits expira pendentes vencidos antes da leitura.
  listDeposits({ email: auth.session.email, limit: 50 });
  const deposit = findDeposit(id);
  if (!deposit || deposit.email !== auth.session.email) {
    return NextResponse.json({ error: "Depósito não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    deposit,
    qrCodeBase64: deposit.pixCopyPaste
      ? await pixQrDataUrl(deposit.pixCopyPaste)
      : null,
    autoConfirm: isAutoConfirmGateway(),
  });
}

import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import { addPayment, removePayment } from "@/lib/admin/billing-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const body = (await request.json()) as {
      email?: string;
      amount?: number;
      paidAt?: string;
      method?: string;
      note?: string;
    };
    const result = addPayment({
      email: body.email ?? "",
      amount: Number(body.amount),
      paidAt: body.paidAt,
      method: body.method,
      note: body.note,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, payment: result.payment }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Falha ao registrar pagamento." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }
  const result = removePayment(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Pagamento não encontrado." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}

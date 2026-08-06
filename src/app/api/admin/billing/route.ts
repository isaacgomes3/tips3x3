import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import {
  listPayments,
  listSubscriptions,
  removeSubscription,
  upsertSubscription,
} from "@/lib/admin/billing-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const email = new URL(request.url).searchParams.get("email") ?? undefined;
  return NextResponse.json({
    ok: true,
    subscriptions: listSubscriptions(),
    payments: listPayments({ email, limit: 200 }),
  });
}

export async function PUT(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const body = (await request.json()) as {
      email?: string;
      plan?: string;
      amount?: number;
      cycle?: string;
      dueDay?: number;
      status?: string;
      notes?: string;
    };
    const result = upsertSubscription({
      email: body.email ?? "",
      plan: body.plan,
      amount: body.amount,
      cycle: body.cycle,
      dueDay: body.dueDay,
      status: body.status,
      notes: body.notes,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, subscription: result.subscription });
  } catch {
    return NextResponse.json(
      { error: "Falha ao salvar assinatura." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const email = new URL(request.url).searchParams.get("email") ?? "";
  if (!email) {
    return NextResponse.json({ error: "E-mail obrigatório." }, { status: 400 });
  }
  const result = removeSubscription(email);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Assinatura não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}

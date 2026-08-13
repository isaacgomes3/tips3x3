import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import { listUsers } from "@/lib/auth/users-store";
import { getAppConfig } from "@/lib/admin/app-config-store";
import {
  listPayments,
  listSubscriptions,
  nextDueDate,
} from "@/lib/admin/billing-store";
import { monthlyValue } from "@/lib/admin/billing-types";
import { listIndications } from "@/lib/indications-store";
import { tallyUserOperationsByEmail } from "@/lib/indications-metrics";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const users = listUsers();
  const subscriptions = listSubscriptions();
  const payments = listPayments({ limit: 500 });
  const indications = listIndications({ limit: 500 });
  const config = getAppConfig();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const active = subscriptions.filter((s) => s.status === "ativo");
  const mrr = active.reduce((sum, s) => sum + monthlyValue(s), 0);
  const receivedMonth = payments
    .filter((p) => Date.parse(p.paidAt) >= monthStart)
    .reduce((sum, p) => sum + p.amount, 0);
  const receivedTotal = payments.reduce((sum, p) => sum + p.amount, 0);

  const upcoming = subscriptions
    .filter((s) => s.status === "ativo" || s.status === "inadimplente")
    .map((s) => ({
      email: s.email,
      plan: s.plan,
      amount: s.amount,
      status: s.status,
      dueAt: nextDueDate(s.dueDay, now),
    }))
    .filter((s) => Date.parse(s.dueAt) - now.getTime() <= 7 * DAY_MS)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const byUser = tallyUserOperationsByEmail(indications);

  const performance = [...byUser.values()]
    .map((row) => ({
      email: row.email,
      total: row.matched,
      green: row.green,
      red: row.red,
      pending: row.inPlay,
      unmatched: row.unmatched,
      staked: row.staked,
      profit: row.profit,
      hitRate:
        row.green + row.red > 0
          ? Math.round((row.green / (row.green + row.red)) * 1000) / 10
          : null,
    }))
    .sort((a, b) => b.total + b.unmatched - (a.total + a.unmatched));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    users,
    subscriptions,
    payments: payments.slice(0, 50),
    config,
    finance: {
      mrr: Math.round(mrr * 100) / 100,
      receivedMonth: Math.round(receivedMonth * 100) / 100,
      receivedTotal: Math.round(receivedTotal * 100) / 100,
      counts: {
        users: users.length,
        active: active.length,
        overdue: subscriptions.filter((s) => s.status === "inadimplente").length,
        cancelled: subscriptions.filter((s) => s.status === "cancelado").length,
        withoutPlan: users.filter(
          (u) => !subscriptions.some((s) => s.email === u.email),
        ).length,
      },
      upcoming,
    },
    performance,
  });
}

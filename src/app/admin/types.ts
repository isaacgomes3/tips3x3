import type { AppConfig } from "@/lib/admin/app-config-store";
import type { Payment, Subscription } from "@/lib/admin/billing-types";
import type { PublicUser } from "@/lib/auth/users-store";

export type { AppConfig, Payment, Subscription, PublicUser };

export type UpcomingDue = {
  email: string;
  plan: string;
  amount: number;
  status: Subscription["status"];
  dueAt: string;
};

export type UserPerformance = {
  email: string;
  /** Lay casado na Bolsa. */
  total: number;
  green: number;
  red: number;
  /** Casado, jogo em andamento. */
  pending: number;
  /** Lay no book, ainda não correspondido. */
  unmatched: number;
  staked: number;
  profit: number;
  hitRate: number | null;
};

export type AdminOverview = {
  generatedAt: string;
  users: PublicUser[];
  subscriptions: Subscription[];
  payments: Payment[];
  config: AppConfig;
  finance: {
    mrr: number;
    receivedMonth: number;
    receivedTotal: number;
    counts: {
      users: number;
      active: number;
      overdue: number;
      cancelled: number;
      withoutPlan: number;
    };
    upcoming: UpcomingDue[];
  };
  performance: UserPerformance[];
};

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

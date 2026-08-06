"use client";

import { useCallback, useEffect, useState } from "react";
import { brl } from "@/app/admin/types";
import type { Deposit, WalletEntry, WalletSummary } from "@/lib/wallet/wallet-types";

type WalletsPayload = {
  ok: boolean;
  wallets: WalletSummary[];
  deposits: Deposit[];
  pending: Deposit[];
  entries: WalletEntry[];
  totals: { credit: number; fees: number; deposited: number; blocked: number };
  config: {
    feePct: number;
    commissionPct: number;
    minDeposit: number;
    blockWhenEmpty: boolean;
    pixReady: boolean;
    autoConfirm: boolean;
  };
  error?: string;
};

const STATUS_LABEL: Record<Deposit["status"], string> = {
  pendente: "Aguardando pagamento",
  gateway_pago: "Pago no gateway",
  creditado: "Creditado",
  recusado: "Recusado",
  expirado: "Expirado",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminWallets() {
  const [data, setData] = useState<WalletsPayload | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/wallets", { cache: "no-store" });
        const json = (await res.json()) as WalletsPayload;
        if (cancelled) return;
        if (!res.ok) {
          setMsg({ text: json.error || "Falha ao carregar carteiras.", ok: false });
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) {
          setMsg({ text: "Falha de rede ao carregar carteiras.", ok: false });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const act = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ text: json.error || "Ação recusada.", ok: false });
        return;
      }
      setMsg({ text: okText, ok: true });
      refresh();
    } catch {
      setMsg({ text: "Falha de rede.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const totals = data?.totals;
  const config = data?.config;

  return (
    <div className="admin-grid">
      <section className="config-card">
        <h3>Crédito dos clientes</h3>
        <p className="config-lead">
          Comissão da bolsa de <strong>{config?.commissionPct ?? 2.5}%</strong>{" "}
          sobre o lucro bruto, depois taxa de{" "}
          <strong>{config?.feePct ?? 50}%</strong> sobre o lucro líquido das
          operações Lucro certo casadas. Gateway PIX{" "}
          {config?.pixReady ? "configurado" : "indisponível"} ·{" "}
          {config?.autoConfirm
            ? "crédito automático no pagamento"
            : "crédito manual após conferência"}
          .
        </p>

        <div className="admin-kpis">
          <div className="admin-kpi">
            <span>Crédito em carteira</span>
            <strong>{totals ? brl(totals.credit) : "—"}</strong>
          </div>
          <div className="admin-kpi is-ok">
            <span>Taxas recebidas</span>
            <strong>{totals ? brl(totals.fees) : "—"}</strong>
          </div>
          <div className="admin-kpi">
            <span>Depositado</span>
            <strong>{totals ? brl(totals.deposited) : "—"}</strong>
          </div>
          <div className={`admin-kpi ${totals?.blocked ? "is-down" : ""}`}>
            <span>Sem crédito</span>
            <strong>{totals ? String(totals.blocked) : "—"}</strong>
          </div>
        </div>

        {msg ? (
          <p className={`users-admin-msg ${msg.ok ? "is-up" : "is-down"}`}>
            {msg.text}
          </p>
        ) : null}
      </section>

      <section className="config-card">
        <h3>Depósitos a confirmar</h3>
        {!data?.pending?.length ? (
          <p className="config-hint">Nenhum depósito pendente.</p>
        ) : (
          <ul className="admin-list">
            {data.pending.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>
                    {d.email} · {brl(d.amount)}
                  </strong>
                  <span>
                    {dateTime(d.createdAt)} · {STATUS_LABEL[d.status]}
                    {d.gatewayTransactionId ? ` · tx ${d.gatewayTransactionId}` : ""}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        { action: "credit", depositId: d.id },
                        "Depósito creditado.",
                      )
                    }
                  >
                    Creditar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        { action: "reject", depositId: d.id },
                        "Depósito recusado.",
                      )
                    }
                  >
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="config-card">
        <h3>Saldos por cliente</h3>
        {!data?.wallets?.length ? (
          <p className="config-hint">Nenhuma carteira movimentada ainda.</p>
        ) : (
          <ul className="admin-list">
            {data.wallets.map((w) => (
              <li key={w.email}>
                <div>
                  <strong>{w.email}</strong>
                  <span>
                    {brl(w.deposited)} depositado · {brl(w.fees)} em taxas ·{" "}
                    {brl(w.profitBase)} de lucro gerado
                  </span>
                </div>
                <span className={`admin-badge ${w.blocked ? "is-down" : "is-up"}`}>
                  {brl(w.balance)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="config-card">
        <h3>Lançamento manual</h3>
        <p className="config-lead">
          Use crédito manual para depósito fora do gateway e ajuste (negativo)
          para estorno ou correção de taxa.
        </p>
        <div className="config-row">
          <label className="config-field">
            <span>E-mail do cliente</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
            />
          </label>
          <label className="config-field">
            <span>Valor (R$)</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10.00"
            />
          </label>
          <label className="config-field">
            <span>Observação</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="motivo"
            />
          </label>
        </div>
        <div className="admin-row-actions" style={{ marginTop: "0.6rem" }}>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              void act(
                {
                  action: "credit-manual",
                  email,
                  amount: Number(String(amount).replace(",", ".")),
                  note,
                },
                "Crédito lançado.",
              )
            }
          >
            Creditar
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() =>
              void act(
                {
                  action: "adjust",
                  email,
                  amount: -Math.abs(Number(String(amount).replace(",", "."))),
                  note,
                },
                "Ajuste lançado.",
              )
            }
          >
            Debitar
          </button>
        </div>
      </section>

      <section className="config-card">
        <h3>Últimos lançamentos</h3>
        {!data?.entries?.length ? (
          <p className="config-hint">Sem movimentação.</p>
        ) : (
          <ul className="admin-list">
            {data.entries.slice(0, 40).map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{e.email}</strong>
                  <span>
                    {dateTime(e.at)} · {e.kind}
                    {e.profitBase ? ` · lucro ${brl(e.profitBase)}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                </div>
                <span className={`admin-badge ${e.amount >= 0 ? "is-up" : "is-down"}`}>
                  {e.amount >= 0 ? "+" : "−"}
                  {brl(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

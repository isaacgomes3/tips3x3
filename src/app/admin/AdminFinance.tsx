"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  brl,
  shortDate,
  type AdminOverview,
  type Subscription,
} from "@/app/admin/types";

const CYCLES: Array<{ id: Subscription["cycle"]; label: string }> = [
  { id: "mensal", label: "Mensal" },
  { id: "trimestral", label: "Trimestral" },
  { id: "semestral", label: "Semestral" },
  { id: "anual", label: "Anual" },
];

const STATUSES: Array<{ id: Subscription["status"]; label: string }> = [
  { id: "ativo", label: "Ativo" },
  { id: "inadimplente", label: "Inadimplente" },
  { id: "cancelado", label: "Cancelado" },
];

type Draft = {
  plan: string;
  amount: string;
  cycle: Subscription["cycle"];
  dueDay: string;
  status: Subscription["status"];
};

const emptyDraft: Draft = {
  plan: "Mensal",
  amount: "",
  cycle: "mensal",
  dueDay: "5",
  status: "ativo",
};

export default function AdminFinance({
  data,
  onChanged,
}: {
  data: AdminOverview;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [payEmail, setPayEmail] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  const subsByEmail = useMemo(
    () => new Map(data.subscriptions.map((s) => [s.email, s])),
    [data.subscriptions],
  );

  function startEdit(email: string) {
    const sub = subsByEmail.get(email);
    setEditing(email);
    setMsg(null);
    setDraft(
      sub
        ? {
            plan: sub.plan,
            amount: String(sub.amount),
            cycle: sub.cycle,
            dueDay: String(sub.dueDay),
            status: sub.status,
          }
        : emptyDraft,
    );
  }

  async function saveSubscription(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editing,
          plan: draft.plan,
          amount: Number(draft.amount.replace(",", ".")),
          cycle: draft.cycle,
          dueDay: Number(draft.dueDay),
          status: draft.status,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ text: json.error || "Falha ao salvar.", ok: false });
        return;
      }
      setMsg({ text: `Assinatura de ${editing} salva.`, ok: true });
      setEditing(null);
      await onChanged();
    } catch {
      setMsg({ text: "Falha de rede ao salvar.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function registerPayment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/billing/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payEmail,
          amount: Number(payAmount.replace(",", ".")),
          note: payNote || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ text: json.error || "Falha ao registrar.", ok: false });
        return;
      }
      setMsg({ text: "Pagamento registrado.", ok: true });
      setPayAmount("");
      setPayNote("");
      await onChanged();
    } catch {
      setMsg({ text: "Falha de rede ao registrar pagamento.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(id: string) {
    if (!window.confirm("Remover este pagamento?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/billing/payments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-grid admin-finance">
      {msg ? (
        <p className={`users-admin-msg ${msg.ok ? "is-up" : "is-down"}`}>
          {msg.text}
        </p>
      ) : null}

      <section className="config-card">
        <h3>Assinaturas</h3>
        <p className="config-lead">
          Defina plano, valor e vencimento de cada usuário. O MRR na visão geral
          usa apenas assinaturas ativas.
        </p>

        {data.users.length === 0 ? (
          <p className="config-hint">Nenhum usuário cadastrado.</p>
        ) : (
          <ul className="admin-list">
            {data.users.map((u) => {
              const sub = subsByEmail.get(u.email);
              const isEditing = editing === u.email;
              return (
                <li key={u.email} className="is-stacked">
                  <div className="admin-list-head">
                    <div>
                      <strong>{u.name || u.email}</strong>
                      <span>
                        {sub
                          ? `${sub.plan} · ${brl(sub.amount)} / ${sub.cycle} · vence dia ${sub.dueDay}`
                          : "Sem plano definido"}
                      </span>
                    </div>
                    <div className="admin-list-actions">
                      {sub ? (
                        <span className={`admin-badge is-${sub.status}`}>
                          {sub.status}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => (isEditing ? setEditing(null) : startEdit(u.email))}
                      >
                        {isEditing ? "Cancelar" : sub ? "Editar" : "Definir plano"}
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <form className="admin-form" onSubmit={saveSubscription}>
                      <label className="config-field">
                        <span>Plano</span>
                        <input
                          type="text"
                          value={draft.plan}
                          onChange={(e) =>
                            setDraft({ ...draft, plan: e.target.value })
                          }
                          placeholder="Mensal"
                        />
                      </label>
                      <label className="config-field">
                        <span>Valor (R$)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.amount}
                          onChange={(e) =>
                            setDraft({ ...draft, amount: e.target.value })
                          }
                          placeholder="197,00"
                          required
                        />
                      </label>
                      <label className="config-field">
                        <span>Ciclo</span>
                        <select
                          value={draft.cycle}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              cycle: e.target.value as Subscription["cycle"],
                            })
                          }
                        >
                          {CYCLES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span>Dia do vencimento</span>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={draft.dueDay}
                          onChange={(e) =>
                            setDraft({ ...draft, dueDay: e.target.value })
                          }
                        />
                      </label>
                      <label className="config-field">
                        <span>Status</span>
                        <select
                          value={draft.status}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              status: e.target.value as Subscription["status"],
                            })
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="btn-primary" disabled={busy}>
                        Salvar
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="config-card">
        <h3>Registrar pagamento</h3>
        <form className="admin-form" onSubmit={registerPayment}>
          <label className="config-field">
            <span>Usuário</span>
            <select
              value={payEmail}
              onChange={(e) => setPayEmail(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {data.users.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="config-field">
            <span>Valor (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="197,00"
              required
            />
          </label>
          <label className="config-field">
            <span>Observação</span>
            <input
              type="text"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Pix, cartão…"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            Registrar
          </button>
        </form>
      </section>

      <section className="config-card">
        <h3>Últimos pagamentos</h3>
        {data.payments.length === 0 ? (
          <p className="config-hint">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="admin-list">
            {data.payments.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.email}</strong>
                  <span>
                    {shortDate(p.paidAt)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </div>
                <div className="admin-list-actions">
                  <span className="admin-badge is-up">{brl(p.amount)}</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void removePayment(p.id)}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PublicUser = {
  email: string;
  createdAt: string;
  active: boolean;
  name?: string;
  role?: "user" | "master";
};

type WalletSummary = {
  email: string;
  balance: number;
  deposited: number;
  blocked: boolean;
};

type CreditAction =
  | { type: "adjust"; email: string }
  | { type: "plan"; email: string };

const PLANS = [
  { label: "Crédito 10+", value: 10 },
  { label: "Crédito 50+", value: 50 },
  { label: "Crédito 250+", value: 250 },
];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function planLabel(
  balance: number,
  isMaster: boolean,
): { label: string; cls: string } {
  if (isMaster) return { label: "Master", cls: "ua-plan-master" };
  if (balance >= 250) return { label: "Crédito 250+", cls: "ua-plan-250" };
  if (balance >= 50) return { label: "Crédito 50+", cls: "ua-plan-50" };
  if (balance >= 10) return { label: "Crédito 10+", cls: "ua-plan-10" };
  return { label: "Sem crédito", cls: "ua-plan-none" };
}

export default function UsersAdmin() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [wallets, setWallets] = useState<Map<string, WalletSummary>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // new user form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // credit/plan modal
  const [action, setAction] = useState<CreditAction | null>(null);
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [planAmt, setPlanAmt] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, walletsRes] = await Promise.all([
        fetch("/api/auth/users"),
        fetch("/api/admin/wallets"),
      ]);
      const usersData = (await usersRes.json()) as {
        users?: PublicUser[];
        error?: string;
      };
      if (!usersRes.ok) {
        setError(usersData.error || "Não foi possível listar usuários.");
        setUsers([]);
        return;
      }
      setUsers(usersData.users ?? []);

      if (walletsRes.ok) {
        const walletsData = (await walletsRes.json()) as {
          wallets?: WalletSummary[];
        };
        const map = new Map<string, WalletSummary>();
        for (const w of walletsData.wallets ?? []) map.set(w.email, w);
        setWallets(map);
      }
    } catch {
      setError("Falha de rede ao listar usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = (await res.json()) as { error?: string; user?: PublicUser };
      if (!res.ok) {
        setError(data.error || "Falha ao criar usuário.");
        return;
      }
      setOkMsg(`Usuário ${data.user?.email} criado.`);
      setEmail("");
      setPassword("");
      setName("");
      await load();
    } catch {
      setError("Falha de rede ao criar usuário.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: PublicUser) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/users/${encodeURIComponent(u.email)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !u.active }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao atualizar.");
        return;
      }
      await load();
    } catch {
      setError("Falha de rede ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(u: PublicUser) {
    const nextRole = u.role === "master" ? "user" : "master";
    if (
      nextRole === "master" &&
      !window.confirm(
        `Tornar ${u.email} master? Master tem acesso a todos os filtros inseridos pelo admin, sem restrição de faixa de crédito.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/users/${encodeURIComponent(u.email)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao atualizar papel.");
        return;
      }
      await load();
    } catch {
      setError("Falha de rede ao atualizar papel.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivatePlan(u: PublicUser) {
    const wallet = wallets.get(u.email);
    const balance = wallet?.balance ?? 0;
    if (
      !window.confirm(
        `Desativar plano de ${u.email}?\n\nIsso irá:\n• Desativar o acesso\n• Zerar o saldo (${brl(balance)})`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      // deactivate user
      await fetch(`/api/auth/users/${encodeURIComponent(u.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      // zero out balance if any
      if (balance > 0) {
        await fetch("/api/admin/wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "adjust",
            email: u.email,
            amount: -balance,
            note: "Plano desativado pelo admin",
          }),
        });
      }
      setOkMsg(`Plano de ${u.email} desativado e saldo zerado.`);
      await load();
    } catch {
      setError("Falha de rede ao desativar plano.");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(u: PublicUser) {
    if (!window.confirm(`Remover ${u.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/users/${encodeURIComponent(u.email)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao remover.");
        return;
      }
      setOkMsg(`Usuário ${u.email} removido.`);
      await load();
    } catch {
      setError("Falha de rede ao remover.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!action) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const amount =
        action.type === "plan" ? planAmt : parseFloat(adjustAmt.replace(",", "."));
      if (!amount || isNaN(amount)) {
        setError("Valor inválido.");
        return;
      }
      const res = await fetch("/api/admin/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "credit-manual",
          email: action.email,
          amount,
          note:
            action.type === "plan"
              ? `Plano ativado manualmente: Crédito ${amount}+`
              : adjustNote || "Ajuste manual",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao creditar.");
        return;
      }
      setOkMsg(
        `${brl(amount)} creditado para ${action.email}.`,
      );
      setAction(null);
      setAdjustAmt("");
      setAdjustNote("");
      setPlanAmt(10);
      await load();
    } catch {
      setError("Falha de rede ao creditar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="config-card">
      <h3>Usuários</h3>
      <p className="config-lead">
        Crie acessos para o painel. O login do master continua pelas variáveis
        de ambiente e não aparece nesta lista.
      </p>

      <form onSubmit={onCreate} className="users-admin-form">
        <label className="config-field">
          <span>Nome (opcional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            autoComplete="off"
          />
        </label>
        <label className="config-field">
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="usuario@email.com"
            autoComplete="off"
          />
        </label>
        <label className="config-field">
          <span>Senha</span>
          <div className="config-field-row">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="mín. 8 caracteres"
              autoComplete="new-password"
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              Criar
            </button>
          </div>
        </label>
      </form>

      {error ? <p className="users-admin-msg is-down">{error}</p> : null}
      {okMsg ? <p className="users-admin-msg is-up">{okMsg}</p> : null}

      {/* ── Modal crédito/plano ── */}
      {action && (
        <div className="ua-modal-backdrop" onClick={() => setAction(null)}>
          <div className="ua-modal" onClick={(e) => e.stopPropagation()}>
            <h4>
              {action.type === "adjust" ? "Adicionar Saldo" : "Ativar Plano"}
              <span className="ua-modal-email">{action.email}</span>
            </h4>

            <form onSubmit={(e) => void submitAdjust(e)} className="ua-modal-form">
              {action.type === "adjust" ? (
                <>
                  <label className="config-field">
                    <span>Valor (R$)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={adjustAmt}
                      onChange={(e) => setAdjustAmt(e.target.value)}
                      placeholder="Ex: 50.00"
                      autoFocus
                    />
                  </label>
                  <label className="config-field">
                    <span>Observação (opcional)</span>
                    <input
                      type="text"
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      placeholder="Ex: bônus, cortesia…"
                    />
                  </label>
                </>
              ) : (
                <div className="ua-plan-grid">
                  {PLANS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`ua-plan-option${planAmt === p.value ? " is-selected" : ""}`}
                      onClick={() => setPlanAmt(p.value)}
                    >
                      <span className="ua-plan-option-name">{p.label}</span>
                      <span className="ua-plan-option-val">{brl(p.value)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="ua-modal-footer">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setAction(null)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy
                    ? "Salvando…"
                    : action.type === "adjust"
                      ? "Creditar"
                      : `Ativar ${brl(planAmt)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="config-hint">Carregando…</p>
      ) : users.length === 0 ? (
        <p className="config-hint">Nenhum usuário criado ainda.</p>
      ) : (
        <ul className="users-admin-list">
          {users.map((u) => {
            const wallet = wallets.get(u.email);
            const balance = wallet?.balance ?? 0;
            const isMaster = u.role === "master";
            const plan = planLabel(balance, isMaster);
            return (
              <li
                key={u.email}
                className={!u.active ? "is-inactive" : undefined}
              >
                <div>
                  <strong>{u.name || u.email}</strong>
                  {u.name ? <em>{u.email}</em> : null}
                  <div className="ua-meta">
                    <span>
                      {u.active ? "ativo" : "inativo"}
                      {" · "}
                      {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    <span className={`ua-plan-badge ${plan.cls}`}>
                      {plan.label}
                    </span>
                    {!isMaster && (
                      <span className="ua-balance">{brl(balance)}</span>
                    )}
                  </div>
                </div>
                <div className="users-admin-actions">
                  {!isMaster && (
                    <>
                      <button
                        type="button"
                        className="btn-ghost ua-btn-credit"
                        disabled={busy}
                        onClick={() =>
                          setAction({ type: "adjust", email: u.email })
                        }
                      >
                        + Saldo
                      </button>
                      <button
                        type="button"
                        className="btn-ghost ua-btn-plan"
                        disabled={busy}
                        onClick={() =>
                          setAction({ type: "plan", email: u.email })
                        }
                      >
                        Ativar plano
                      </button>
                      {balance > 0 && (
                        <button
                          type="button"
                          className="btn-ghost ua-btn-deactivate"
                          disabled={busy}
                          onClick={() => void deactivatePlan(u)}
                        >
                          Desativar plano
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void toggleActive(u)}
                  >
                    {u.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void toggleRole(u)}
                  >
                    {u.role === "master" ? "Remover master" : "Tornar master"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void removeUser(u)}
                  >
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

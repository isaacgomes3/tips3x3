"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PublicUser = {
  email: string;
  createdAt: string;
  active: boolean;
  name?: string;
};

export default function UsersAdmin() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/users");
      const data = (await res.json()) as {
        users?: PublicUser[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Não foi possível listar usuários.");
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
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

  return (
    <section className="config-card">
      <h3>Usuários</h3>
      <p className="config-lead">
        Crie acessos para o painel. Só o master vê esta seção. O login do master
        continua pelas variáveis de ambiente.
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

      {loading ? (
        <p className="config-hint">Carregando…</p>
      ) : users.length === 0 ? (
        <p className="config-hint">Nenhum usuário criado ainda.</p>
      ) : (
        <ul className="users-admin-list">
          {users.map((u) => (
            <li key={u.email} className={!u.active ? "is-inactive" : undefined}>
              <div>
                <strong>{u.name || u.email}</strong>
                {u.name ? <em>{u.email}</em> : null}
                <span>
                  {u.active ? "ativo" : "inativo"}
                  {" · "}
                  {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className="users-admin-actions">
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
                  onClick={() => void removeUser(u)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

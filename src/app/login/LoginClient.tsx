"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/app?view=dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string; redirect?: string };
      if (!res.ok) {
        setError(data.error || "Falha no login.");
        return;
      }
      router.replace(data.redirect || next);
      router.refresh();
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sell-login-page">
      <div className="sell-login-bg" aria-hidden />
      <div className="sell-login-card">
        <Link href="/" className="sell-login-brand">
          <img src="/logo-tips3x3.png" alt="tips3x3" width={160} height={40} />
        </Link>
        <h1>Bem-vindo de volta!</h1>
        <p className="sell-login-sub">
          Inicie sessão e desbloqueie o painel de lay 3-3.
        </p>

        <form onSubmit={onSubmit} className="sell-login-form" autoComplete="off">
          <label>
            E-mail
            <input
              type="email"
              name="email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="sell-login-error">{error}</p> : null}
          <button
            type="submit"
            className="lp-btn lp-btn-primary"
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? "Entrando…" : "INICIAR SESSÃO"}
          </button>
        </form>

        <p className="sell-login-foot">
          Ainda não tem acesso?{" "}
          <Link href="/#planos">Ver planos Premium</Link>
        </p>
      </div>
    </div>
  );
}

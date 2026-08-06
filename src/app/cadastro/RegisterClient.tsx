"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { isNativeApp } from "@/lib/native-alerts";

export default function RegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email, password, ...(ref ? { ref } : {}) }),
      });
      const data = (await res.json()) as { error?: string; redirect?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao criar conta.");
        return;
      }
      router.replace(data.redirect || "/app?view=wallet");
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
        <Link
          href={isNativeApp() ? "/login" : "/"}
          className="sell-login-brand"
          onClick={(e) => { if (isNativeApp()) e.preventDefault(); }}
        >
          <img src="/logo-tips3x3.png" alt="tips3x3" width={160} height={40} />
        </Link>

        <h1>Criar sua conta</h1>
        <p className="sell-login-sub">
          Cadastre-se gratuitamente e comece a operar agora.
        </p>

        <form onSubmit={onSubmit} className="sell-login-form" autoComplete="off">
          <label>
            Nome completo
            <input
              type="text"
              name="name"
              autoComplete="off"
              placeholder="Opcional"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            E-mail <span style={{ color: "var(--danger)" }}>*</span>
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
            Senha <span style={{ color: "var(--danger)" }}>*</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Confirmar senha <span style={{ color: "var(--danger)" }}>*</span>
            <input
              type="password"
              name="confirm"
              autoComplete="new-password"
              placeholder="Repita a senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? "Criando conta…" : "CRIAR CONTA"}
          </button>
        </form>

        <p className="sell-login-foot">
          Já tem uma conta?{" "}
          <Link href="/login">Iniciar sessão</Link>
        </p>
      </div>
    </div>
  );
}

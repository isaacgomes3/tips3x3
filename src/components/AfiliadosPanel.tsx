"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Users } from "lucide-react";

type Referral = {
  email: string;
  name?: string;
  createdAt: string;
  active: boolean;
};

type AfiliadosData = {
  ok: boolean;
  referralLink: string;
  referralCode: string;
  referrals: Referral[];
};

const dateStr = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default function AfiliadosPanel() {
  const [data, setData] = useState<AfiliadosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/afiliados")
      .then((r) => r.json())
      .then((d: AfiliadosData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copyLink() {
    if (!data?.referralLink) return;
    navigator.clipboard.writeText(data.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  if (loading) {
    return (
      <div className="afl-loading">
        <div className="spinner" />
        <span>Carregando dados de afiliados…</span>
      </div>
    );
  }

  const referrals = data?.referrals ?? [];

  return (
    <div className="afl-root">
      {/* Cabeçalho */}
      <div className="afl-header">
        <div className="afl-header-icon">
          <Link2 size={22} aria-hidden />
        </div>
        <div>
          <h2 className="afl-title">Programa de Afiliados</h2>
          <p className="afl-sub">
            Indique amigos e acompanhe quem se cadastrou pelo seu link.
          </p>
        </div>
      </div>

      {/* Card do link */}
      <div className="afl-link-card">
        <div className="afl-link-label">Seu link de indicação</div>
        <div className="afl-link-row">
          <span className="afl-link-text">{data?.referralLink ?? "—"}</span>
          <button
            type="button"
            className={`afl-copy-btn ${copied ? "is-copied" : ""}`}
            onClick={copyLink}
            aria-label="Copiar link"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            <span>{copied ? "Copiado!" : "Copiar"}</span>
          </button>
        </div>
      </div>

      {/* Estatísticas rápidas */}
      <div className="afl-stats">
        <div className="afl-stat">
          <Users size={18} aria-hidden />
          <span className="afl-stat-value">{referrals.length}</span>
          <span className="afl-stat-label">Indicados</span>
        </div>
        <div className="afl-stat">
          <Check size={18} aria-hidden />
          <span className="afl-stat-value">{referrals.filter((r) => r.active).length}</span>
          <span className="afl-stat-label">Ativos</span>
        </div>
      </div>

      {/* Tabela de indicados */}
      <div className="afl-table-wrap">
        <div className="afl-table-head">
          <span>Indicado</span>
          <span>Cadastro</span>
          <span>Status</span>
        </div>

        {referrals.length === 0 ? (
          <div className="afl-empty">
            <Users size={36} strokeWidth={1.2} aria-hidden />
            <p>Nenhum indicado ainda.</p>
            <p className="afl-empty-sub">
              Compartilhe seu link e seus indicados aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="afl-list">
            {referrals.map((r) => (
              <li key={r.email} className="afl-row">
                <div className="afl-row-info">
                  <span className="afl-avatar">
                    {(r.name ?? r.email).charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <strong>{r.name ?? r.email.split("@")[0]}</strong>
                    <span className="afl-row-email">{r.email}</span>
                  </div>
                </div>
                <span className="afl-row-date">{dateStr(r.createdAt)}</span>
                <span className={`afl-badge ${r.active ? "is-active" : "is-inactive"}`}>
                  {r.active ? "Ativo" : "Inativo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

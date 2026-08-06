"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminFinance from "@/app/admin/AdminFinance";
import AdminOperations from "@/app/admin/AdminOperations";
import AdminSettings from "@/app/admin/AdminSettings";
import AdminStatement from "@/app/admin/AdminStatement";
import AdminUpdates from "@/app/admin/AdminUpdates";
import AdminWallets from "@/app/admin/AdminWallets";
import UsersAdmin from "@/components/UsersAdmin";
import { brl, shortDate, type AdminOverview } from "@/app/admin/types";

type TabId =
  | "visao"
  | "usuarios"
  | "operacoes"
  | "financeiro"
  | "carteiras"
  | "atualizacoes"
  | "config";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "visao", label: "Visão geral" },
  { id: "usuarios", label: "Usuários" },
  { id: "operacoes", label: "Operações" },
  { id: "financeiro", label: "Financeiro" },
  { id: "carteiras", label: "Carteiras" },
  { id: "atualizacoes", label: "Atualizações" },
  { id: "config", label: "Configurações" },
];

export default function AdminClient() {
  const [tab, setTab] = useState<TabId>("visao");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/overview");
        const json = (await res.json()) as AdminOverview & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Não foi possível carregar os dados.");
          return;
        }
        setError(null);
        setData(json);
      } catch {
        if (!cancelled) setError("Falha de rede ao carregar a administração.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const load = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <h1>Administração</h1>
          <p>Usuários, financeiro, atualizações e defaults do Tips3x3.</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn-ghost" onClick={() => void load()}>
            Atualizar
          </button>
          <Link href="/app" className="btn-primary">
            Voltar ao painel
          </Link>
        </div>
      </header>

      <nav className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`admin-tab ${tab === t.id ? "is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error ? <p className="users-admin-msg is-down">{error}</p> : null}
      {loading && !data ? <p className="config-hint">Carregando…</p> : null}

      {tab === "visao" && data ? <Overview data={data} /> : null}
      {tab === "usuarios" ? <UsersAdmin /> : null}
      {tab === "operacoes" && data ? (
        <AdminOperations users={data.users} />
      ) : null}
      {tab === "financeiro" && data ? (
        <AdminFinance data={data} onChanged={load} />
      ) : null}
      {tab === "carteiras" ? <AdminWallets /> : null}
      {tab === "atualizacoes" ? <AdminUpdates /> : null}
      {tab === "config" && data ? (
        <AdminSettings config={data.config} onChanged={load} />
      ) : null}
    </div>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const { finance, performance } = data;
  const totalProfit = performance.reduce((sum, p) => sum + p.profit, 0);
  const [statementEmail, setStatementEmail] = useState<string | null>(null);

  return (
    <div className="admin-grid">
      <section className="config-card">
        <h3>Receita</h3>
        <div className="admin-kpis">
          <Kpi label="MRR" value={brl(finance.mrr)} />
          <Kpi label="Recebido no mês" value={brl(finance.receivedMonth)} />
          <Kpi label="Recebido total" value={brl(finance.receivedTotal)} />
        </div>
      </section>

      <section className="config-card">
        <h3>Base de usuários</h3>
        <div className="admin-kpis">
          <Kpi label="Cadastrados" value={String(finance.counts.users)} />
          <Kpi label="Ativos" value={String(finance.counts.active)} tone="ok" />
          <Kpi
            label="Inadimplentes"
            value={String(finance.counts.overdue)}
            tone={finance.counts.overdue > 0 ? "down" : undefined}
          />
          <Kpi label="Em teste" value={String(finance.counts.trial)} />
          <Kpi label="Sem plano" value={String(finance.counts.withoutPlan)} />
        </div>
      </section>

      <section className="config-card">
        <h3>Vencimentos em 7 dias</h3>
        {finance.upcoming.length === 0 ? (
          <p className="config-hint">Nenhum vencimento próximo.</p>
        ) : (
          <ul className="admin-list">
            {finance.upcoming.map((u) => (
              <li key={u.email}>
                <div>
                  <strong>{u.email}</strong>
                  <span>
                    {u.plan} · vence {shortDate(u.dueAt)}
                  </span>
                </div>
                <span
                  className={`admin-badge ${u.status === "inadimplente" ? "is-down" : ""}`}
                >
                  {brl(u.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="config-card">
        <h3>Operações por usuário</h3>
        <p className="config-lead">
          Só ordens enviadas pelo app/painel com Lay casado na Bolsa entram no
          resultado ({brl(totalProfit)}). Ofertas no book aparecem como{" "}
          <em>não correspondidas</em>.
        </p>
        {performance.length === 0 ? (
          <p className="config-hint">Nenhuma operação registrada ainda.</p>
        ) : (
          <ul className="admin-list">
            {performance.map((p) => (
              <li key={p.email}>
                <div>
                  <strong>{p.email === "sistema" ? "Sistema (sem dono)" : p.email}</strong>
                  <span>
                    {p.total} casadas · {p.green} green · {p.red} red
                    {p.pending > 0 ? ` · ${p.pending} em jogo` : ""}
                    {p.unmatched > 0 ? ` · ${p.unmatched} no book` : ""}
                    {p.hitRate != null ? ` · ${p.hitRate}% acerto` : ""}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <span
                    className={`admin-badge ${p.profit >= 0 ? "is-up" : "is-down"}`}
                  >
                    {brl(p.profit)}
                  </span>
                  <button
                    type="button"
                    className="admin-inline-btn"
                    onClick={() =>
                      setStatementEmail((cur) =>
                        cur === p.email ? null : p.email,
                      )
                    }
                  >
                    {statementEmail === p.email ? "Ocultar" : "Extrato"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {statementEmail ? (
        // key por email: trocar de cliente recomeça o extrato do zero.
        <AdminStatement
          key={statementEmail}
          email={statementEmail}
          onClose={() => setStatementEmail(null)}
        />
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "down";
}) {
  return (
    <div className={`admin-kpi ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

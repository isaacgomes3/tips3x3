"use client";

import { useEffect, useState } from "react";
import type { Indication } from "@/lib/indications-types";
import {
  isLayMatchedOnExchange,
  isLayUnmatchedOnExchange,
} from "@/lib/indications-status";
import { brl, type PublicUser } from "@/app/admin/types";

type OperationsResponse = {
  items: Indication[];
  owners: Array<{ email: string; count: number; matched?: number; unmatched?: number }>;
  totals: {
    total: number;
    green: number;
    red: number;
    pending: number;
    unmatched: number;
    failed: number;
    withValue: number;
    staked: number;
    profit: number;
  };
  error?: string;
};

const SOURCES = [
  { id: "", label: "Todas as origens" },
  { id: "apk", label: "App Android" },
  { id: "extensao", label: "Extensão navegador" },
  { id: "painel", label: "Painel web" },
];

const SOURCE_LABEL: Record<string, string> = {
  apk: "app",
  extensao: "extensão",
  painel: "painel",
};

const KIND_LABEL: Record<string, string> = {
  "lay-3x3": "Lay 3x3",
  "eventos-raros": "Eventos raros",
  "lucro-certo": "Lucro certo",
  surebet: "Surebet",
};

const EVENT_LABEL: Record<string, string> = {
  "lay-sent": "Lay enviado",
  "lay-matched": "Lay casado",
  "back-sent": "Back enviado",
  green: "Green",
  cancelled: "Cancelada",
  failed: "Falha",
};

export default function AdminOperations({ users }: { users: PublicUser[] }) {
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (email) params.set("email", email);
        if (source) params.set("source", source);
        const res = await fetch(`/api/admin/operations?${params.toString()}`);
        const json = (await res.json()) as OperationsResponse;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Não foi possível carregar as operações.");
          return;
        }
        setError(null);
        setData(json);
      } catch {
        if (!cancelled) setError("Falha de rede ao carregar operações.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, source]);

  return (
    <div className="admin-grid admin-operations">
      <section className="config-card">
        <h3>Operações executadas</h3>
        <p className="config-lead">
          Ordens enviadas pelo app, extensão ou painel. Green/red só após Lay
          casado na Bolsa; ofertas no book ficam como não correspondidas.
        </p>

        <div className="admin-form">
          <label className="config-field">
            <span>Usuário</span>
            <select
              value={email}
              onChange={(e) => {
                setLoading(true);
                setEmail(e.target.value);
              }}
            >
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.email}
                </option>
              ))}
              <option value="sistema">Sistema (sem dono)</option>
            </select>
          </label>
          <label className="config-field">
            <span>Origem</span>
            <select
              value={source}
              onChange={(e) => {
                setLoading(true);
                setSource(e.target.value);
              }}
            >
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="users-admin-msg is-down">{error}</p> : null}

        {data ? (
          <div className="admin-kpis">
            <Kpi label="Casadas" value={String(data.totals.total)} />
            <Kpi label="Green" value={String(data.totals.green)} tone="ok" />
            <Kpi label="Red" value={String(data.totals.red)} tone="down" />
            <Kpi label="Em jogo" value={String(data.totals.pending)} />
            <Kpi label="No book" value={String(data.totals.unmatched)} />
            <Kpi label="Falhas" value={String(data.totals.failed)} />
            <Kpi
              label="Movimentado"
              value={brl(data.totals.staked)}
              hint={`${data.totals.withValue} de ${data.totals.total} com valor`}
            />
            <Kpi
              label="Resultado"
              value={brl(data.totals.profit)}
              tone={data.totals.profit >= 0 ? "ok" : "down"}
            />
          </div>
        ) : null}
      </section>

      <section className="config-card">
        <h3>Histórico</h3>
        {loading && !data ? <p className="config-hint">Carregando…</p> : null}
        {data && data.items.length === 0 ? (
          <p className="config-hint">
            Nenhuma operação para este filtro.
          </p>
        ) : null}

        <ul className="admin-list">
          {data?.items.map((op) => (
            <li key={op.id}>
              <div>
                <strong>{op.eventName || op.eventId}</strong>
                <span>
                  {KIND_LABEL[op.kind] ?? op.kind} · placar {op.scoreLabel} ·
                  odd {op.layOdds}
                  {op.stake ? ` · stake ${brl(op.stake)}` : ""}
                  {op.liability ? ` · resp ${brl(op.liability)}` : ""}
                  {!op.stake && !op.liability ? " · sem valor reportado" : ""}
                </span>
                <span>
                  evento {op.eventId} ·{" "}
                  {new Date(op.indicatedAt).toLocaleString("pt-BR")} ·{" "}
                  {op.userEmail || "sem dono"} ·{" "}
                  {SOURCE_LABEL[op.source ?? ""] ?? "sistema"}
                </span>
                {op.events?.length ? (
                  <span>
                    {op.events
                      .map((e) => EVENT_LABEL[e.type] ?? e.type)
                      .join(" → ")}
                  </span>
                ) : null}
                {op.lastError ? <span>Erro: {op.lastError}</span> : null}
              </div>
              <span className={`admin-badge is-${statusTone(op)}`}>
                {statusLabel(op)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function statusLabel(op: Indication) {
  if (op.execStatus === "failed") return "Falhou";
  if (isLayUnmatchedOnExchange(op)) return "No book";
  if (!isLayMatchedOnExchange(op)) return "Sem match";
  if (op.result === "green") return "Green";
  if (op.result === "red") return "Red";
  return "Em jogo";
}

function statusTone(op: Indication) {
  if (op.execStatus === "failed") return "down";
  if (isLayUnmatchedOnExchange(op)) return "teste";
  if (!isLayMatchedOnExchange(op)) return "teste";
  if (op.result === "green") return "up";
  if (op.result === "red") return "down";
  return "teste";
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "down";
  hint?: string;
}) {
  return (
    <div className={`admin-kpi ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

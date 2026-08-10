"use client";

import { useEffect, useState } from "react";
import type { StatementDay } from "@/lib/indications-statement";
import { brl } from "@/app/admin/types";

type StatementResponse = {
  ok?: boolean;
  days?: StatementDay[];
  totals?: {
    count: number;
    green: number;
    red: number;
    pending: number;
    staked: number;
    profit: number;
  };
  error?: string;
};

const SOURCE_LABEL: Record<string, string> = {
  apk: "app",
  extensao: "extensão",
  painel: "painel",
  sistema: "sistema",
};

/** Extrato do cliente: uma linha por operação, sempre quebrado por dia. */
export default function AdminStatement({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<StatementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** null = dia mais recente; "all" = todos os dias. */
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/statement?email=${encodeURIComponent(email)}`,
        );
        const json = (await res.json()) as StatementResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error || "Não foi possível carregar o extrato.");
          setData(null);
          return;
        }
        setError(null);
        setData(json);
      } catch {
        if (!cancelled) setError("Falha de rede ao carregar o extrato.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const days = data?.days ?? [];
  const selectedDay = dayFilter ?? days[0]?.dayKey ?? "";
  const visibleDays =
    selectedDay === "all"
      ? days
      : days.filter((d) => d.dayKey === selectedDay);

  return (
    <section className="config-card">
      <div className="stmt-head">
        <div>
          <h3>Extrato · {email}</h3>
          <p className="config-lead">
            Só operações com Lay casado na Bolsa. Ordem que não correspondeu não
            é operação e fica fora do extrato.
          </p>
        </div>
        <button type="button" className="admin-inline-btn" onClick={onClose}>
          Fechar
        </button>
      </div>

      {error ? <p className="users-admin-msg is-down">{error}</p> : null}
      {loading && !data ? <p className="config-hint">Carregando…</p> : null}

      {data && days.length === 0 ? (
        <p className="config-hint">
          Nenhuma operação casada registrada para este cliente.
        </p>
      ) : null}

      {days.length > 0 ? (
        <>
          <div className="admin-form">
            <label className="config-field">
              <span>Dia</span>
              <select
                value={selectedDay}
                onChange={(e) => setDayFilter(e.target.value)}
              >
                {days.map((d) => (
                  <option key={d.dayKey} value={d.dayKey}>
                    {d.label} · {d.totals.count} op · {brl(d.totals.profit)}
                  </option>
                ))}
                <option value="all">Todos os dias</option>
              </select>
            </label>
          </div>

          {data?.totals ? (
            <p className="config-hint">
              Total do cliente: {data.totals.count} operações ·{" "}
              {data.totals.green} green · {data.totals.red} red
              {data.totals.pending > 0
                ? ` · ${data.totals.pending} em jogo`
                : ""}{" "}
              · resultado {brl(data.totals.profit)}
            </p>
          ) : null}

          {visibleDays.map((day) => (
            <div key={day.dayKey} className="stmt-day">
              <header>
                <strong>{day.label}</strong>
                <span>
                  {day.totals.count} operações · {day.totals.green} green ·{" "}
                  {day.totals.red} red
                  {day.totals.pending > 0
                    ? ` · ${day.totals.pending} em jogo`
                    : ""}{" "}
                  · movimentado {brl(day.totals.staked)}
                </span>
                <em
                  className={`admin-badge ${day.totals.profit >= 0 ? "is-up" : "is-down"}`}
                >
                  {brl(day.totals.profit)}
                </em>
              </header>

              <div className="stmt-scroll">
                <table className="stmt-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Evento</th>
                      <th>Mercado</th>
                      <th>Valor</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                      <th>Resultado</th>
                      <th>Lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.date}</strong>
                          <span>{row.time}</span>
                        </td>
                        <td>
                          <strong>{row.eventName}</strong>
                          <span>
                            id {row.eventId}
                            {row.source
                              ? ` · ${SOURCE_LABEL[row.source] ?? row.source}`
                              : ""}
                          </span>
                        </td>
                        <td>
                          <strong>{row.market}</strong>
                          <span>{row.strategyLabel}</span>
                        </td>
                        <td>
                          <strong>{brl(row.stake ?? row.liability ?? 0)}</strong>
                          {row.liability != null && row.stake != null ? (
                            <span>resp. {brl(row.liability)}</span>
                          ) : null}
                        </td>
                        <td>
                          <strong>x{row.entryOdds}</strong>
                          <span>lay</span>
                        </td>
                        <td>
                          {row.exitOdds != null ? (
                            <>
                              <strong>x{row.exitOdds}</strong>
                              <span>
                                back{row.exitStake != null ? ` · ${brl(row.exitStake)}` : ""}
                              </span>
                            </>
                          ) : (
                            <>
                              <strong>—</strong>
                              <span>sem back</span>
                            </>
                          )}
                        </td>
                        <td>
                          <span
                            className={`admin-badge is-${resultTone(row.result)}`}
                          >
                            {resultLabel(row)}
                          </span>
                        </td>
                        <td>
                          {row.profit == null ? (
                            <strong>—</strong>
                          ) : (
                            <strong
                              className={row.profit >= 0 ? "is-up" : "is-down"}
                            >
                              {brl(row.profit)}
                            </strong>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}

function resultLabel(row: {
  result: "green" | "red" | "pending";
  closed: boolean;
  strategy: string;
}) {
  if (!row.closed && row.strategy === "lay-3x3") return "Back pendente";
  if (row.result === "green") return row.closed ? "Green (back)" : "Green";
  if (row.result === "red") return "Red";
  return "Em jogo";
}

function resultTone(result: "green" | "red" | "pending") {
  if (result === "green") return "up";
  if (result === "red") return "down";
  return "teste";
}

"use client";

import { useEffect, useState } from "react";
import type {
  Indication,
  IndicationKind,
  IndicationResult,
} from "@/lib/indications-types";

type StatsBucket = {
  total: number;
  green: number;
  red: number;
  pending: number;
};

type IndicationsPayload = {
  generatedAt: string;
  items: Indication[];
  stats: {
    all: StatsBucket;
    eventosRaros: StatsBucket;
    lucroCerto: StatsBucket;
  };
  error?: string;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultLabel(result: IndicationResult) {
  if (result === "green") return "Green";
  if (result === "red") return "Red";
  return "Pendente";
}

function StatPills({ stats }: { stats: StatsBucket }) {
  return (
    <div className="ind-stats-pills">
      <span>
        Total <strong>{stats.total}</strong>
      </span>
      <span className="is-green">
        Green <strong>{stats.green}</strong>
      </span>
      <span className="is-red">
        Red <strong>{stats.red}</strong>
      </span>
      <span className="is-pending">
        Pendente <strong>{stats.pending}</strong>
      </span>
    </div>
  );
}

function IndicationRow({
  item,
  mode,
}: {
  item: Indication;
  mode: IndicationKind;
}) {
  return (
    <li className={`ind-stats-row is-${item.result}`}>
      <div className="ind-stats-row-main">
        <strong>{item.eventName || `${item.home} vs ${item.away}`}</strong>
        <div className="ind-stats-meta">
          {mode === "eventos-raros" ? (
            <>
              <span className="ind-stats-odd">
                Lay {item.scoreLabel} · x{item.layOdds.toFixed(2)}
              </span>
              <span className={`ind-stats-result is-${item.result}`}>
                {resultLabel(item.result)}
                {item.finalScore ? ` · final ${item.finalScore}` : ""}
              </span>
            </>
          ) : (
            <>
              <span className="ind-stats-odd">
                {item.scoreLabel} · x{item.layOdds.toFixed(2)}
              </span>
              <span className="ind-stats-date">{formatWhen(item.indicatedAt)}</span>
            </>
          )}
        </div>
      </div>
      {mode === "eventos-raros" ? (
        <time dateTime={item.indicatedAt}>{formatWhen(item.indicatedAt)}</time>
      ) : (
        <span className={`ind-stats-result is-${item.result}`}>
          {resultLabel(item.result)}
          {item.finalScore ? ` · ${item.finalScore}` : ""}
        </span>
      )}
    </li>
  );
}

export function IndicationsStats() {
  const [data, setData] = useState<IndicationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/indications?limit=200", {
          cache: "no-store",
        });
        const json = (await res.json()) as IndicationsPayload;
        if (cancelled) return;
        if (!res.ok || json.error) {
          setError(json.error || "Falha ao carregar indicações");
          return;
        }
        setData(json);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro de rede");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const eventosRaros =
    data?.items.filter((i) => i.kind === "eventos-raros") ?? [];
  const lucroCerto =
    data?.items.filter((i) => i.kind === "lucro-certo") ?? [];

  return (
    <div className="ind-stats">
      <p className="ind-stats-lead">
        Histórico automático das indicações disparadas pelo scanner (Eventos
        raros e Lucro certo). O resultado atualiza no FT, quando o alvo fica
        impossível no live, ou quando o jogo some do feed.
      </p>

      {loading && !data ? <p className="empty">Carregando…</p> : null}
      {error ? <div className="banner-error">{error}</div> : null}

      <section className="ind-stats-section">
        <header className="ind-stats-head">
          <h3>Eventos raros</h3>
          {data ? <StatPills stats={data.stats.eventosRaros} /> : null}
        </header>
        <p className="ind-stats-sub">Odd · evento · resultado final</p>
        <ul className="ind-stats-list">
          {eventosRaros.map((item) => (
            <IndicationRow key={item.id} item={item} mode="eventos-raros" />
          ))}
          {!loading && eventosRaros.length === 0 ? (
            <li className="empty">
              Nenhuma indicação de Eventos raros ainda. Elas aparecem quando o
              scanner liberar ENTRAR.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="ind-stats-section">
        <header className="ind-stats-head">
          <h3>Lucro certo</h3>
          {data ? <StatPills stats={data.stats.lucroCerto} /> : null}
        </header>
        <p className="ind-stats-sub">Evento · odd · data</p>
        <ul className="ind-stats-list">
          {lucroCerto.map((item) => (
            <IndicationRow key={item.id} item={item} mode="lucro-certo" />
          ))}
          {!loading && lucroCerto.length === 0 ? (
            <li className="empty">
              Nenhuma indicação de Lucro certo ainda (placar alvo já impossível
              no live).
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

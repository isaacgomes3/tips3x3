"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";
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
    lay3x3?: StatsBucket;
  };
  error?: string;
};

const MONTH_NAMES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function formatDayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function resultLabel(result: IndicationResult) {
  if (result === "green") return "Green";
  if (result === "red") return "Red";
  return "Pendente";
}

function tally(list: Indication[]): StatsBucket {
  let green = 0;
  let red = 0;
  let pending = 0;
  for (const i of list) {
    if (i.result === "green") green += 1;
    else if (i.result === "red") red += 1;
    else pending += 1;
  }
  return { total: list.length, green, red, pending };
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
  onSelectDate,
}: {
  item: Indication;
  mode: IndicationKind;
  onSelectDate: (key: string) => void;
}) {
  const key = dayKey(item.indicatedAt);
  return (
    <li className={`ind-stats-row is-${item.result}`}>
      <div className="ind-stats-row-main">
        <strong>{item.eventName || `${item.home} vs ${item.away}`}</strong>
        <div className="ind-stats-meta">
          {mode === "lucro-certo" ? (
            <>
              <span className="ind-stats-odd">
                {item.scoreLabel} · x{item.layOdds.toFixed(2)}
              </span>
              <button
                type="button"
                className="ind-stats-date-btn"
                onClick={() => key && onSelectDate(key)}
                title="Ver histórico do dia"
              >
                {formatWhen(item.indicatedAt)}
              </button>
            </>
          ) : (
            <>
              <span className="ind-stats-odd">
                Lay {item.scoreLabel} · x{item.layOdds.toFixed(2)}
              </span>
              <span className={`ind-stats-result is-${item.result}`}>
                {resultLabel(item.result)}
                {item.finalScore ? ` · final ${item.finalScore}` : ""}
              </span>
            </>
          )}
        </div>
      </div>
      {mode === "lucro-certo" ? (
        <span className={`ind-stats-result is-${item.result}`}>
          {resultLabel(item.result)}
          {item.finalScore ? ` · ${item.finalScore}` : ""}
        </span>
      ) : (
        <button
          type="button"
          className="ind-stats-date-btn"
          onClick={() => key && onSelectDate(key)}
          title="Ver histórico do dia"
        >
          {formatWhen(item.indicatedAt)}
        </button>
      )}
    </li>
  );
}

function CollapsibleSection({
  title,
  stats,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  stats?: StatsBucket;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`ind-stats-section ${open ? "is-open" : "is-collapsed"}`}>
      <button
        type="button"
        className="ind-stats-head-btn"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="ind-stats-head">
          <h3>{title}</h3>
          {stats ? <StatPills stats={stats} /> : null}
        </div>
        <ChevronDown
          className={`ind-stats-chevron ${open ? "is-open" : ""}`}
          aria-hidden
          size={18}
        />
      </button>
      {open ? (
        <>
          <p className="ind-stats-sub">{subtitle}</p>
          {children}
        </>
      ) : null}
    </section>
  );
}

export function IndicationsStats() {
  const [data, setData] = useState<IndicationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEventos, setOpenEventos] = useState(true);
  const [openLucro, setOpenLucro] = useState(true);
  const [openLay3x3, setOpenLay3x3] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/indications?limit=500", {
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

  useEffect(() => {
    if (!calendarOpen && !selectedDay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedDay(null);
        setCalendarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calendarOpen, selectedDay]);

  const eventosRaros =
    data?.items.filter((i) => i.kind === "eventos-raros") ?? [];
  const lucroCerto =
    data?.items.filter((i) => i.kind === "lucro-certo") ?? [];
  const lay3x3Items =
    data?.items.filter((i) => i.kind === "lay-3x3") ?? [];

  const byDay = useMemo(() => {
    const map = new Map<string, Indication[]>();
    for (const item of data?.items ?? []) {
      const key = dayKey(item.indicatedAt);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort(
        (a, b) =>
          new Date(b.indicatedAt).getTime() - new Date(a.indicatedAt).getTime(),
      );
    }
    return map;
  }, [data?.items]);

  const daysWithData = useMemo(() => {
    const set = new Set<number>();
    for (const key of byDay.keys()) {
      const [y, m, d] = key.split("-").map(Number);
      if (y === year && m === month + 1) set.add(d);
    }
    return set;
  }, [byDay, year, month]);

  const dayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const dayStats = tally(dayItems);

  const calendarCells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; key: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, key: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, key });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, key: null });
    return cells;
  }, [year, month]);

  const openDay = (key: string) => {
    setSelectedDay(key);
    setCalendarOpen(false);
    const [y, m] = key.split("-").map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m - 1);
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <div className="ind-stats">
      <p className="ind-stats-lead">
        Histórico automático das indicações disparadas pelo scanner (Eventos
        raros e Lucro certo). O resultado atualiza no FT, quando o alvo fica
        impossível no live, ou quando o jogo some do feed.
      </p>

      <div className="ind-stats-toolbar">
        <button
          type="button"
          className="ind-stats-cal-btn"
          onClick={() => {
            setSelectedDay(null);
            setCalendarOpen(true);
          }}
        >
          <CalendarDays size={16} aria-hidden />
          Histórico por data
        </button>
        {data ? <StatPills stats={data.stats.all} /> : null}
      </div>

      {loading && !data ? <p className="empty">Carregando…</p> : null}
      {error ? <div className="banner-error">{error}</div> : null}

      <CollapsibleSection
        title="Lay 3x3"
        stats={data?.stats.lay3x3 ?? tally(lay3x3Items)}
        subtitle="Odd · evento · resultado final"
        open={openLay3x3}
        onToggle={() => setOpenLay3x3((v) => !v)}
      >
        <ul className="ind-stats-list">
          {lay3x3Items.map((item) => (
            <IndicationRow
              key={item.id}
              item={item}
              mode="lay-3x3"
              onSelectDate={openDay}
            />
          ))}
          {!loading && lay3x3Items.length === 0 ? (
            <li className="empty">
              Nenhuma entrada Lay 3x3 gravada ainda (APK Auto Lay).
            </li>
          ) : null}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        title="Eventos raros"
        stats={data?.stats.eventosRaros}
        subtitle="Odd · evento · resultado final"
        open={openEventos}
        onToggle={() => setOpenEventos((v) => !v)}
      >
        <ul className="ind-stats-list">
          {eventosRaros.map((item) => (
            <IndicationRow
              key={item.id}
              item={item}
              mode="eventos-raros"
              onSelectDate={openDay}
            />
          ))}
          {!loading && eventosRaros.length === 0 ? (
            <li className="empty">
              Nenhuma indicação de Eventos raros ainda. Elas aparecem quando o
              scanner liberar ENTRAR.
            </li>
          ) : null}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        title="Lucro certo"
        stats={data?.stats.lucroCerto}
        subtitle="Evento · odd · data"
        open={openLucro}
        onToggle={() => setOpenLucro((v) => !v)}
      >
        <ul className="ind-stats-list">
          {lucroCerto.map((item) => (
            <IndicationRow
              key={item.id}
              item={item}
              mode="lucro-certo"
              onSelectDate={openDay}
            />
          ))}
          {!loading && lucroCerto.length === 0 ? (
            <li className="empty">
              Nenhuma indicação de Lucro certo ainda (placar alvo já impossível
              no live).
            </li>
          ) : null}
        </ul>
      </CollapsibleSection>

      {calendarOpen ? (
        <div
          className="ind-cal-backdrop"
          role="presentation"
          onClick={() => setCalendarOpen(false)}
        >
          <div
            className="ind-cal-modal"
            role="dialog"
            aria-label="Calendário de indicações"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ind-cal-head">
              <div>
                <h3>
                  <CalendarDays size={18} aria-hidden />
                  Calendário
                </h3>
                <p>Selecione um dia para ver o histórico</p>
              </div>
              <button
                type="button"
                className="ind-cal-close"
                aria-label="Fechar"
                onClick={() => setCalendarOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="ind-cal-nav">
              <strong>
                {MONTH_NAMES[month]} / {year}
              </strong>
              <div className="ind-cal-nav-actions">
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
                  «
                </button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
                  »
                </button>
              </div>
            </div>

            <div className="ind-cal-weekdays">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`}>{w}</span>
              ))}
            </div>
            <div className="ind-cal-grid">
              {calendarCells.map((cell, idx) => {
                if (cell.day == null || !cell.key) {
                  return <span key={`pad-${idx}`} className="ind-cal-day is-pad" />;
                }
                const has = daysWithData.has(cell.day);
                const count = byDay.get(cell.key)?.length ?? 0;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={`ind-cal-day ${has ? "has-data" : ""}`}
                    disabled={!has}
                    onClick={() => openDay(cell.key!)}
                    title={
                      has
                        ? `${count} indicação(ões)`
                        : "Sem indicações neste dia"
                    }
                  >
                    <span>{cell.day}</span>
                    {has ? <i>{count}</i> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {selectedDay ? (
        <div
          className="ind-cal-backdrop"
          role="presentation"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="ind-cal-modal ind-day-modal"
            role="dialog"
            aria-label={`Histórico de ${selectedDay}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ind-cal-head">
              <div>
                <h3>Histórico do dia</h3>
                <p>{formatDayLabel(selectedDay)}</p>
              </div>
              <button
                type="button"
                className="ind-cal-close"
                aria-label="Fechar"
                onClick={() => setSelectedDay(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="ind-day-toolbar">
              <StatPills stats={dayStats} />
              <button
                type="button"
                className="ind-stats-cal-btn"
                onClick={() => {
                  setSelectedDay(null);
                  setCalendarOpen(true);
                }}
              >
                Trocar data
              </button>
            </div>

            <ul className="ind-stats-list">
              {dayItems.map((item) => (
                <li key={item.id} className={`ind-stats-row is-${item.result}`}>
                  <div className="ind-stats-row-main">
                    <strong>
                      {item.eventName || `${item.home} vs ${item.away}`}
                    </strong>
                    <div className="ind-stats-meta">
                      <span className="ind-stats-kind">
                        {item.kind === "eventos-raros"
                          ? "Eventos raros"
                          : item.kind === "lay-3x3"
                            ? "Lay 3x3"
                            : "Lucro certo"}
                      </span>
                      <span className="ind-stats-odd">
                        {item.kind === "eventos-raros" ? "Lay " : ""}
                        {item.scoreLabel} · x{item.layOdds.toFixed(2)}
                      </span>
                      <span className={`ind-stats-result is-${item.result}`}>
                        {resultLabel(item.result)}
                        {item.finalScore ? ` · final ${item.finalScore}` : ""}
                      </span>
                    </div>
                  </div>
                  <time dateTime={item.indicatedAt}>
                    {formatWhen(item.indicatedAt)}
                  </time>
                </li>
              ))}
              {dayItems.length === 0 ? (
                <li className="empty">Nenhuma indicação neste dia.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

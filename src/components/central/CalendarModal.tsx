"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Pencil,
  X,
} from "lucide-react";
import type { Entry } from "@/lib/central/types";
import { COMMISSION_RATE } from "@/lib/central/bankroll";

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

type DayData = {
  percentage: number;
  entries: number;
  profit: number;
};

function calcEntryProfit(e: Entry): number {
  let profit: number;
  if (e.cashout_odd && e.cashout_odd > 1) {
    profit = e.stake * (1 / (e.odd - 1) - 1 / (e.cashout_odd - 1));
  } else {
    profit = e.result === "green" ? e.stake / (e.odd - 1) : -e.stake;
  }
  if (profit > 0) profit *= 1 - COMMISSION_RATE;
  return profit;
}

function computeMonthData(
  entries: Entry[],
  year: number,
  month: number,
  initialBankroll: number,
): Map<number, DayData> {
  const dayMap = new Map<number, DayData>();
  const resolved = entries.filter((e) => {
    if (e.result !== "green" && e.result !== "red") return false;
    const d = new Date(e.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const grouped = new Map<number, Entry[]>();
  for (const entry of resolved) {
    const day = new Date(entry.created_at).getDate();
    const existing = grouped.get(day) || [];
    existing.push(entry);
    grouped.set(day, existing);
  }

  const before = entries.filter((e) => {
    if (e.result !== "green" && e.result !== "red") return false;
    return new Date(e.created_at) < new Date(year, month, 1);
  });

  let bankroll = initialBankroll;
  for (const e of before) bankroll += calcEntryProfit(e);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEntries = grouped.get(day);
    if (!dayEntries?.length) continue;
    const dayStart = bankroll;
    let dayProfit = 0;
    for (const e of dayEntries) dayProfit += calcEntryProfit(e);
    bankroll += dayProfit;
    dayMap.set(day, {
      percentage: dayStart > 0 ? (dayProfit / dayStart) * 100 : 0,
      entries: dayEntries.length,
      profit: dayProfit,
    });
  }
  return dayMap;
}

type Props = {
  open: boolean;
  onClose: () => void;
  entries: Entry[];
  initialBankroll: number;
  onSelectDay?: (isoDate: string) => void;
};

export function CalendarModal({
  open,
  onClose,
  entries,
  initialBankroll,
  onSelectDay,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dayData = computeMonthData(entries, year, month, initialBankroll);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  const title = `${MONTH_NAMES[month]} / ${year}`;

  return (
    <div className="cal-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cal-modal-head">
          <div className="cal-modal-head-main">
            <CalendarDays className="cal-modal-head-ico" />
            <div>
              <h2 id="cal-modal-title">CALENDÁRIO</h2>
              <p>Selecione um dia para ver mais detalhes</p>
            </div>
          </div>
          <button
            type="button"
            className="cal-modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X />
          </button>
        </header>

        <div className="cal-modal-body">
          <div className="cal-modal-toolbar">
            <span className="cal-modal-month">{title}</span>
            <div className="cal-modal-controls">
              <button type="button" className="cal-ctrl" aria-label="Editar">
                <Pencil />
              </button>
              <button
                type="button"
                className="cal-ctrl"
                onClick={prevMonth}
                aria-label="Mês anterior"
              >
                <ChevronsLeft />
              </button>
              <button
                type="button"
                className="cal-ctrl"
                onClick={nextMonth}
                aria-label="Próximo mês"
              >
                <ChevronsRight />
              </button>
            </div>
          </div>

          <div className="cal-modal-grid">
            {WEEKDAYS.map((d, i) => (
              <div key={`${d}-${i}`} className="cal-modal-weekday">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day == null) {
                return <div key={`e-${i}`} className="cal-modal-cell is-empty" />;
              }
              const data = dayData.get(day);
              const isToday =
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

              return (
                <button
                  key={`d-${day}`}
                  type="button"
                  className={`cal-modal-cell ${data ? (data.percentage >= 0 ? "is-green" : "is-red") : ""} ${isToday ? "is-today" : ""}`}
                  onClick={() => onSelectDay?.(iso)}
                >
                  <span className="cal-day-num">{day}</span>
                  {data ? (
                    <span className="cal-day-pct">
                      {data.percentage >= 0 ? "" : "-"}
                      {Math.abs(data.percentage).toFixed(2)}%
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="cal-modal-foot">
            <span>{title}</span>
            <button type="button" className="cal-download" aria-label="Baixar">
              <Download />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

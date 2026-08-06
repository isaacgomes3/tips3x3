import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import type { Entry } from '@/lib/central/types';

interface CalendarPanelProps {
  entries: Entry[];
  initialBankroll: number;
}

const COMMISSION_RATE = 0.065;

const MONTH_NAMES = [
  'JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface DayData {
  percentage: number;
  entries: number;
  profit: number;
}

function calcEntryProfit(e: Entry): number {
  let profit: number;
  if (e.cashout_odd && e.cashout_odd > 1) {
    profit = e.stake * (1 / (e.odd - 1) - 1 / (e.cashout_odd - 1));
  } else {
    profit = e.result === 'green' ? e.stake / (e.odd - 1) : -e.stake;
  }
  if (profit > 0) {
    profit = profit * (1 - COMMISSION_RATE);
  }
  return profit;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function computeMonthData(entries: Entry[], year: number, month: number, initialBankroll: number): Map<number, DayData> {
  const dayMap = new Map<number, DayData>();

  const resolved = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
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

  const allResolvedBefore = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d < new Date(year, month, 1);
  });

  let bankrollAtMonthStart = initialBankroll;
  for (const e of allResolvedBefore) {
    bankrollAtMonthStart += calcEntryProfit(e);
  }

  let runningBankroll = bankrollAtMonthStart;

  const daysInMonth = getDaysInMonth(year, month);
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEntries = grouped.get(day);
    if (!dayEntries || dayEntries.length === 0) continue;

    const dayStart = runningBankroll;
    let dayProfit = 0;
    for (const e of dayEntries) {
      dayProfit += calcEntryProfit(e);
    }
    runningBankroll += dayProfit;

    const percentage = dayStart > 0 ? (dayProfit / dayStart) * 100 : 0;

    dayMap.set(day, {
      percentage,
      entries: dayEntries.length,
      profit: dayProfit,
    });
  }

  return dayMap;
}

function computeMonthTotalPercentage(entries: Entry[], year: number, month: number, initialBankroll: number): number {
  const resolved = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  if (resolved.length === 0) return 0;

  const allResolvedBefore = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d < new Date(year, month, 1);
  });

  let bankrollAtMonthStart = initialBankroll;
  for (const e of allResolvedBefore) {
    bankrollAtMonthStart += calcEntryProfit(e);
  }

  let totalProfit = 0;
  for (const e of resolved) {
    totalProfit += calcEntryProfit(e);
  }

  return bankrollAtMonthStart > 0 ? (totalProfit / bankrollAtMonthStart) * 100 : 0;
}

export default function CalendarPanel({ entries, initialBankroll }: CalendarPanelProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const dayData = computeMonthData(entries, currentYear, currentMonth, initialBankroll);
  const monthPercentage = computeMonthTotalPercentage(entries, currentYear, currentMonth, initialBankroll);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let i = 0; i < remaining; i++) {
      cells.push(null);
    }
  }

  const isToday = (day: number) => {
    return day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
  };

  return (
    <div className="card-glow p-6 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-gold-500/10 p-2.5 rounded-lg">
            <Calendar className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
              {MONTH_NAMES[currentMonth]} / {currentYear}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right mr-4">
            <span className={`text-2xl font-bold font-mono ${monthPercentage >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {monthPercentage >= 0 ? '+' : ''}{monthPercentage.toFixed(2)}
            </span>
            <span className="text-sm text-gray-400 ml-1 font-mono">%BC</span>
          </div>
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg border border-dark-600 hover:bg-dark-700 hover:border-dark-500 transition-all duration-200"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg border border-dark-600 hover:bg-dark-700 hover:border-dark-500 transition-all duration-200"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day, i) => (
          <div key={i} className="text-center py-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">{day}</span>
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) {
            return (
              <div key={`empty-${i}`} className="aspect-square rounded-lg bg-dark-700/30" />
            );
          }

          const data = dayData.get(day);
          const todayHighlight = isToday(day);

          if (data) {
            const isPositive = data.percentage >= 0;
            return (
              <div
                key={`day-${day}`}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center p-1 relative transition-all duration-200 hover:scale-105 cursor-default ${
                  isPositive
                    ? 'bg-[#1a6bff] shadow-md shadow-blue-600/30'
                    : 'bg-[#dc2626] shadow-md shadow-red-600/30'
                }`}
              >
                <span className="absolute top-1.5 left-2 text-[11px] font-bold text-white/80">
                  {day}
                </span>
                <span className="text-sm sm:text-lg font-extrabold font-mono text-white leading-tight">
                  {data.percentage >= 0 ? '' : '-'}{Math.abs(data.percentage).toFixed(2)} %
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-white/70">% Banca</span>
                <span className="text-[10px] sm:text-xs font-medium text-white/80 mt-0.5">
                  {data.entries} aposta{data.entries > 1 ? 's' : ''}
                </span>
              </div>
            );
          }

          return (
            <div
              key={`day-${day}`}
              className={`aspect-square rounded-lg flex items-start justify-start p-2 transition-colors duration-200 ${
                todayHighlight
                  ? 'bg-white border border-gold-500/40'
                  : 'bg-white/90 border border-gray-200'
              }`}
            >
              <span className={`text-xs font-mono ${todayHighlight ? 'text-gold-600 font-semibold' : 'text-gray-400'}`}>
                {day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

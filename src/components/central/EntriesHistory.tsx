import { useState } from 'react';
import { CheckCircle, XCircle, Trash2, Clock, Ban, Swords, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import type { Entry, EntryResult } from '@/lib/central/types';

interface EntriesHistoryProps {
  entries: Entry[];
  onResolve: (id: string, result: 'green' | 'red' | 'cancelled') => void;
  onCashout: (id: string, cashoutOdd: number) => void;
  onDelete: (id: string) => void;
}

const resultConfig: Record<EntryResult, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  green: { label: 'Green', color: 'text-accent-green', bg: 'bg-green-500/10', icon: CheckCircle },
  red: { label: 'Red', color: 'text-accent-red', bg: 'bg-red-500/10', icon: XCircle },
  pending: { label: 'Pendente', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock },
  cancelled: { label: 'Cancelado', color: 'text-gray-500', bg: 'bg-gray-500/10', icon: Ban },
};

export default function EntriesHistory({ entries, onResolve, onCashout, onDelete }: EntriesHistoryProps) {
  const [cashoutOpen, setCashoutOpen] = useState<string | null>(null);
  const [cashoutOddInput, setCashoutOddInput] = useState('');

  if (entries.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-600 text-sm">Nenhuma entrada registrada ainda</p>
      </div>
    );
  }

  const COMMISSION_RATE = 0.065;

  function getCashoutProfit(entry: Entry, coOdd: number): number {
    if (coOdd <= 1) return 0;
    let profit = entry.stake * (1 / (entry.odd - 1) - 1 / (coOdd - 1));
    if (profit > 0) {
      profit = profit * (1 - COMMISSION_RATE);
    }
    return profit;
  }

  function getCashoutPercent(entry: Entry, coOdd: number): number {
    if (coOdd <= 1) return 0;
    const profit = getCashoutProfit(entry, coOdd);
    return (profit / entry.stake) * 100;
  }

  function handleConfirmCashout(entryId: string) {
    const odd = parseFloat(cashoutOddInput);
    if (!odd || odd <= 1) return;
    onCashout(entryId, odd);
    setCashoutOpen(null);
    setCashoutOddInput('');
  }

  const sorted = [...entries].reverse();

  return (
    <div className="space-y-3">
      {sorted.map((entry, i) => {
        const cfg = resultConfig[entry.result];
        const isPending = entry.result === 'pending';
        const isCancelled = entry.result === 'cancelled';
        const isCashoutOpen = cashoutOpen === entry.id;
        const cashoutOdd = parseFloat(cashoutOddInput);
        const validCashout = cashoutOdd > 1;

        return (
          <div
            key={entry.id}
            className={`card p-4 fade-in hover:border-dark-500 transition-colors duration-200 ${
              isPending ? 'border-yellow-500/20' : ''
            } ${isCancelled ? 'opacity-60' : ''}`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Event info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Swords className="w-3.5 h-3.5 text-gold-500 shrink-0" />
                  <span className="font-medium text-gray-200 text-sm truncate">
                    {entry.home_team}
                  </span>
                  <span className="text-gray-600 text-xs">vs</span>
                  <span className="font-medium text-gray-200 text-sm truncate">
                    {entry.away_team}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    {new Date(entry.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="font-mono">Odd {entry.odd} ({(100 / (entry.odd - 1)).toFixed(2)}%)</span>
                  <span className="font-mono">Stake R$ {entry.stake.toFixed(2)}</span>
                  {entry.cashout_odd && (
                    <span className="font-mono text-sky-400">Cashout @ {entry.cashout_odd}</span>
                  )}
                </div>
              </div>

              {/* Status badge / action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {isPending ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      <cfg.icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    <button
                      onClick={() => onResolve(entry.id, 'green')}
                      className="p-1.5 rounded-lg bg-green-500/10 text-accent-green hover:bg-green-500/20 transition-colors"
                      title="Green"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onResolve(entry.id, 'red')}
                      className="p-1.5 rounded-lg bg-red-500/10 text-accent-red hover:bg-red-500/20 transition-colors"
                      title="Red"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (isCashoutOpen) {
                          setCashoutOpen(null);
                          setCashoutOddInput('');
                        } else {
                          setCashoutOpen(entry.id);
                          setCashoutOddInput('');
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isCashoutOpen
                          ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40'
                          : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
                      }`}
                      title="Cashout"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onResolve(entry.id, 'cancelled')}
                      className="p-1.5 rounded-lg bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 transition-colors"
                      title="Cancelar"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      <cfg.icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    {!isCancelled && (
                      <span className={`font-mono text-sm font-medium ${entry.profit >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {entry.profit >= 0 ? '+' : ''}R$ {entry.profit.toFixed(2)}
                      </span>
                    )}
                    {!isCancelled && (
                      <span className="font-mono text-xs text-gold-400">
                        R$ {entry.bankroll_after.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => onDelete(entry.id)}
                  className="p-1.5 text-gray-600 hover:text-accent-red transition-colors duration-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Cashout panel */}
            {isCashoutOpen && isPending && (
              <div className="mt-3 pt-3 border-t border-dark-600">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                      Odd do Cashout (Back)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={cashoutOddInput}
                      onChange={(e) => setCashoutOddInput(e.target.value)}
                      placeholder="Ex: 100"
                      className="input-field w-full sm:w-48 font-mono"
                      autoFocus
                    />
                  </div>

                  {validCashout && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {getCashoutProfit(entry, cashoutOdd) >= 0 ? (
                          <TrendingUp className="w-4 h-4 text-accent-green" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-accent-red" />
                        )}
                        <div>
                          <p className={`font-mono text-sm font-bold ${getCashoutProfit(entry, cashoutOdd) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {getCashoutProfit(entry, cashoutOdd) >= 0 ? '+' : ''}R$ {getCashoutProfit(entry, cashoutOdd).toFixed(2)}
                          </p>
                          <p className={`text-xs font-mono ${getCashoutPercent(entry, cashoutOdd) >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                            {getCashoutPercent(entry, cashoutOdd) >= 0 ? '+' : ''}{getCashoutPercent(entry, cashoutOdd).toFixed(2)}% da stake
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleConfirmCashout(entry.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                          bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30"
                      >
                        <DollarSign className="w-4 h-4" />
                        Confirmar Cashout
                      </button>
                    </div>
                  )}

                  {!validCashout && cashoutOddInput && (
                    <p className="text-xs text-red-400">Odd deve ser maior que 1</p>
                  )}
                </div>

                <p className="text-xs text-gray-600 mt-2">
                  Lay @ {entry.odd.toFixed(2)} | Informe a odd atual de back para calcular o resultado do cashout
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

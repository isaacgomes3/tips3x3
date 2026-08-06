import { useState, useRef, useEffect } from 'react';
import { DollarSign, TrendingUp, Wallet, BarChart3, Pencil, Check, X } from 'lucide-react';

interface TopCardsProps {
  initialBankroll: number;
  currentBankroll: number;
  onInitialBankrollChange: (value: number) => void;
}

export default function TopCards({ initialBankroll, currentBankroll, onInitialBankrollChange }: TopCardsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialBankroll.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  const profit = currentBankroll - initialBankroll;
  const growth = initialBankroll > 0 ? (profit / initialBankroll) * 100 : 0;
  const isPositive = profit >= 0;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(initialBankroll.toString());
    setEditing(true);
  }

  function confirmEdit() {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed > 0) {
      onInitialBankrollChange(parsed);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(initialBankroll.toString());
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  }

  const cards = [
    {
      key: 'initial',
      label: 'Banca Inicial',
      icon: Wallet,
      color: 'text-gray-300',
      iconBg: 'bg-dark-600',
    },
    {
      key: 'current',
      label: 'Banca Atual',
      value: `R$ ${currentBankroll.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-gold-400',
      iconBg: 'bg-gold-500/10',
    },
    {
      key: 'profit',
      label: 'Lucro Total',
      value: `${isPositive ? '+' : ''}R$ ${profit.toFixed(2)}`,
      icon: TrendingUp,
      color: isPositive ? 'text-accent-green' : 'text-accent-red',
      iconBg: isPositive ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      key: 'growth',
      label: 'Crescimento',
      value: `${isPositive ? '+' : ''}${growth.toFixed(1)}%`,
      icon: BarChart3,
      color: isPositive ? 'text-accent-green' : 'text-accent-red',
      iconBg: isPositive ? 'bg-green-500/10' : 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="card-glow p-5 bg-gradient-to-br fade-in hover:border-dark-500 transition-colors duration-300"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {card.label}
            </span>
            <div className={`${card.iconBg} p-2 rounded-lg`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
          </div>

          {card.key === 'initial' ? (
            <div className="flex items-center gap-2">
              {editing ? (
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-gray-300 font-mono text-lg font-bold">R$</span>
                  <input
                    ref={inputRef}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="bg-dark-900 border border-gold-500/40 rounded-md px-2 py-1 text-lg font-bold font-mono text-gray-300 w-full
                      focus:outline-none focus:border-gold-500/70 focus:ring-1 focus:ring-gold-500/20 transition-all"
                  />
                  <button
                    onClick={confirmEdit}
                    className="shrink-0 p-1.5 rounded-md bg-green-500/10 text-accent-green hover:bg-green-500/20 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="shrink-0 p-1.5 rounded-md bg-red-500/10 text-accent-red hover:bg-red-500/20 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group w-full">
                  <p className={`stat-value ${card.color}`}>R$ {initialBankroll.toFixed(2)}</p>
                  <button
                    onClick={startEditing}
                    className="shrink-0 p-1.5 rounded-md text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gold-400 hover:bg-dark-700 transition-all duration-200"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className={`stat-value ${card.color}`}>{card.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { Plus, X, Swords } from 'lucide-react';

interface EntryFormProps {
  currentBankroll: number;
  stakePercentage: number;
  onAddEntry: (homeTeam: string, awayTeam: string, odd: number, stake: number) => void;
}

export default function EntryForm({ currentBankroll, stakePercentage, onAddEntry }: EntryFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [odd, setOdd] = useState('');
  const [stake, setStake] = useState('');

  const suggestedStake = currentBankroll * (stakePercentage / 100);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!homeTeam.trim() || !awayTeam.trim() || !odd || !stake) return;
    onAddEntry(homeTeam.trim(), awayTeam.trim(), parseFloat(odd), parseFloat(stake));
    setHomeTeam('');
    setAwayTeam('');
    setOdd('');
    setStake('');
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="btn-primary flex items-center gap-2">
        <Plus className="w-4 h-4" />
        Adicionar Entrada
      </button>
    );
  }

  return (
    <div className="card-glow p-6 slide-up">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-medium text-gold-400 uppercase tracking-wider">
          Nova Entrada
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
            Evento
          </label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="Time Casa"
              className="input-field flex-1"
              required
            />
            <div className="shrink-0 bg-dark-700 border border-dark-600 p-2 rounded-lg">
              <Swords className="w-4 h-4 text-gold-500" />
            </div>
            <input
              type="text"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="Time Fora"
              className="input-field flex-1"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Odd
            </label>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={odd}
              onChange={(e) => setOdd(e.target.value)}
              placeholder="Ex: 2.44"
              className="input-field w-full font-mono"
              required
            />
            {odd && parseFloat(odd) > 1 && (
              <p className="text-xs text-gold-400 mt-1 font-mono">
                {(100 / (parseFloat(odd) - 1)).toFixed(2)}% de lucro
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Stake (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder={`Sugerido: R$ ${suggestedStake.toFixed(2)}`}
              className="input-field w-full font-mono"
              required
            />
            <p className="text-xs text-gray-600 mt-1">
              Stake ideal ({stakePercentage}%): R$ {suggestedStake.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-dark-700/50 border border-dark-600 rounded-lg p-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-xs text-gray-400">
            A entrada sera registrada como <span className="text-yellow-400 font-medium">pendente</span> ate ser resolvida
          </span>
        </div>

        <button
          type="submit"
          disabled={!homeTeam.trim() || !awayTeam.trim() || !odd || !stake}
          className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Registrar Entrada
        </button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Settings, Shield, TrendingUp, Copy, Check } from 'lucide-react';

interface StakeManagerProps {
  currentBankroll: number;
  stakePercentage: number;
  onStakePercentageChange: (value: number) => void;
}

export default function StakeManager({
  currentBankroll,
  stakePercentage,
  onStakePercentageChange,
}: StakeManagerProps) {
  const [copied, setCopied] = useState(false);
  const stakeValue = currentBankroll * (stakePercentage / 100);
  const riskPerEntry = stakeValue;
  const stopLoss = currentBankroll * 0.1;

  function handleCopyStake() {
    navigator.clipboard.writeText(riskPerEntry.toFixed(2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const presets = [1, 2, 5, 10, 25, 50];

  return (
    <div className="space-y-6 fade-in">
      <div className="card-glow p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gold-500/10 p-2 rounded-lg">
            <Settings className="w-5 h-5 text-gold-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
            Configuracao de Stake
          </h3>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Porcentagem da Banca
              </label>
              <span className="font-mono text-gold-400 text-lg font-bold">{stakePercentage}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={stakePercentage}
              onChange={(e) => onStakePercentageChange(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-dark-600
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold-400 [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-gold-500/30"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>1%</span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-3 block">
              Presets
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => onStakePercentageChange(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium font-mono transition-all duration-200 ${
                    stakePercentage === p
                      ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                      : 'bg-dark-700 text-gray-400 border border-dark-600 hover:border-dark-500'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-gold-500/10 p-2 rounded-lg">
              <TrendingUp className="w-4 h-4 text-gold-400" />
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Stake Ideal</span>
          </div>
          <p className="stat-value text-gold-400">R$ {stakeValue.toFixed(2)}</p>
          <p className="text-xs text-gray-600 mt-1">{stakePercentage}% de R$ {currentBankroll.toFixed(2)}</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-orange-500/10 p-2 rounded-lg">
              <Shield className="w-4 h-4 text-orange-400" />
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Stake por Entrada</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="stat-value text-orange-400">R$ {riskPerEntry.toFixed(2)}</p>
            <button
              onClick={handleCopyStake}
              className="p-1.5 rounded-md bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-all duration-200"
              title="Copiar stake"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-orange-400" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">1 stake de {stakePercentage}%</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-red-500/10 p-2 rounded-lg">
              <Shield className="w-4 h-4 text-accent-red" />
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Stop Loss</span>
          </div>
          <p className="stat-value text-accent-red">R$ {stopLoss.toFixed(2)}</p>
          <p className="text-xs text-gray-600 mt-1">10% da banca atual</p>
        </div>
      </div>

      <div className="card p-5">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-4">
          Simulacao de Cenarios
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-dark-700/50 rounded-lg p-4 border border-dark-600">
            <p className="text-xs text-gray-500 mb-2">3 Greens (melhor caso)</p>
            <p className="font-mono text-accent-green font-bold">
              + R$ {(stakeValue * 0.5 * 3).toFixed(2)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Banca: R$ {(currentBankroll + stakeValue * 0.5 * 3).toFixed(2)}
            </p>
          </div>
          <div className="bg-dark-700/50 rounded-lg p-4 border border-dark-600">
            <p className="text-xs text-gray-500 mb-2">2 Greens + 1 Red</p>
            <p className="font-mono text-accent-green font-bold">
              + R$ {(stakeValue * 0.5 * 2 - stakeValue).toFixed(2)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Banca: R$ {(currentBankroll + stakeValue * 0.5 * 2 - stakeValue).toFixed(2)}
            </p>
          </div>
          <div className="bg-dark-700/50 rounded-lg p-4 border border-dark-600">
            <p className="text-xs text-gray-500 mb-2">3 Reds (pior caso)</p>
            <p className="font-mono text-accent-red font-bold">
              - R$ {(stakeValue * 3).toFixed(2)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Banca: R$ {(currentBankroll - stakeValue * 3).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

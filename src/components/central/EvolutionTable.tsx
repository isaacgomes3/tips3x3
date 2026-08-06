import { TrendingUp, TrendingDown } from 'lucide-react';
import type { DayEvolution } from '@/lib/central/types';

interface EvolutionTableProps {
  evolution: DayEvolution[];
}

export default function EvolutionTable({ evolution }: EvolutionTableProps) {
  if (evolution.length === 0) {
    return (
      <div className="card p-8 text-center fade-in">
        <p className="text-gray-600 text-sm">Nenhum dado de evolucao disponivel</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden fade-in">
      <div className="p-4 border-b border-dark-600">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Evolucao Diaria
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-600">
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-4 py-3 font-medium">
                Dia
              </th>
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-4 py-3 font-medium">
                Data
              </th>
              <th className="text-right text-xs text-gray-500 uppercase tracking-wider px-4 py-3 font-medium">
                Inicio
              </th>
              <th className="text-right text-xs text-gray-500 uppercase tracking-wider px-4 py-3 font-medium">
                Final
              </th>
              <th className="text-right text-xs text-gray-500 uppercase tracking-wider px-4 py-3 font-medium">
                Lucro
              </th>
              <th className="text-right text-xs text-gray-500 uppercase tracking-wider px-4 py-3 font-medium">
                % Dia
              </th>
            </tr>
          </thead>
          <tbody>
            {evolution.map((day, i) => {
              const isPositive = day.profit >= 0;
              return (
                <tr
                  key={day.day}
                  className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors duration-150"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <td className="px-4 py-3 font-mono text-gold-400">#{day.day}</td>
                  <td className="px-4 py-3 text-gray-400">{day.date}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    R$ {day.start.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-100">
                    R$ {day.end.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={`inline-flex items-center gap-1 ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {isPositive ? '+' : ''}R$ {day.profit.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        isPositive
                          ? 'bg-green-500/10 text-accent-green'
                          : 'bg-red-500/10 text-accent-red'
                      }`}
                    >
                      {isPositive ? '+' : ''}{day.percentage.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

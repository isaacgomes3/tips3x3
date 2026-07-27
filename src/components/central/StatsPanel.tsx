import { Target, CheckCircle, XCircle, Percent, Gauge, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';
import type { Entry } from '@/lib/central/types';

interface StatsPanelProps {
  entries: Entry[];
  currentBankroll: number;
  stakePercentage: number;
}

const COMMISSION_RATE = 0.065;

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

export default function StatsPanel({ entries, currentBankroll, stakePercentage }: StatsPanelProps) {
  const resolved = entries.filter((e) => e.result === 'green' || e.result === 'red');
  const pending = entries.filter((e) => e.result === 'pending').length;
  const total = resolved.length;
  const greens = resolved.filter((e) => e.result === 'green').length;
  const reds = resolved.filter((e) => e.result === 'red').length;
  const hitRate = total > 0 ? (greens / total) * 100 : 0;
  const avgStake =
    total > 0 ? resolved.reduce((sum, e) => sum + e.stake, 0) / total : 0;
  const dailyRisk = currentBankroll * (stakePercentage / 100);

  const avgProfitPercent = total > 0
    ? resolved.reduce((sum, e) => {
        const profit = calcEntryProfit(e);
        return sum + (profit / e.stake) * 100;
      }, 0) / total
    : 0;

  const totalProfit = resolved.reduce((sum, e) => sum + calcEntryProfit(e), 0);
  const profitPerAvgStake = avgStake > 0 ? (totalProfit / avgStake) * 100 : 0;

  const stats = [
    {
      label: 'Resolvidas',
      value: total.toString(),
      icon: Target,
      color: 'text-gold-400',
      bg: 'bg-gold-500/10',
      extra: pending > 0 ? `${pending} pendente${pending > 1 ? 's' : ''}` : undefined,
    },
    {
      label: 'Greens',
      value: greens.toString(),
      icon: CheckCircle,
      color: 'text-accent-green',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Reds',
      value: reds.toString(),
      icon: XCircle,
      color: 'text-accent-red',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Taxa de Acerto',
      value: `${hitRate.toFixed(1)}%`,
      icon: Percent,
      color: hitRate >= 50 ? 'text-accent-green' : 'text-accent-red',
      bg: hitRate >= 50 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      label: 'Stake Media',
      value: `R$ ${avgStake.toFixed(2)}`,
      icon: Gauge,
      color: 'text-gold-400',
      bg: 'bg-gold-500/10',
    },
    {
      label: 'Stake por Entrada',
      value: `R$ ${dailyRisk.toFixed(2)}`,
      icon: AlertTriangle,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
    {
      label: 'Ganho Medio/Entrada',
      value: `${avgProfitPercent >= 0 ? '+' : ''}${avgProfitPercent.toFixed(2)}%`,
      icon: TrendingUp,
      color: avgProfitPercent >= 0 ? 'text-accent-green' : 'text-accent-red',
      bg: avgProfitPercent >= 0 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      label: 'Ganho/Stake Media',
      value: `${profitPerAvgStake >= 0 ? '+' : ''}${profitPerAvgStake.toFixed(2)}%`,
      icon: BarChart3,
      color: profitPerAvgStake >= 0 ? 'text-accent-green' : 'text-accent-red',
      bg: profitPerAvgStake >= 0 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="card p-4 flex items-center gap-4 fade-in hover:border-dark-500 transition-colors duration-300"
        >
          <div className={`${stat.bg} p-3 rounded-lg shrink-0`}>
            <stat.icon className={`w-5 h-5 ${stat.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 truncate">
              {stat.label}
            </p>
            <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            {'extra' in stat && stat.extra && (
              <p className="text-xs text-yellow-400 mt-0.5">{stat.extra}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

import { Chart as ChartJS, ArcElement, Tooltip, Legend, type ChartOptions } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import type { Entry } from '@/lib/central/types';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartProps {
  entries: Entry[];
}

export default function PieChart({ entries }: PieChartProps) {
  const resolved = entries.filter((e) => e.result === 'green' || e.result === 'red');
  const greens = resolved.filter((e) => e.result === 'green').length;
  const reds = resolved.filter((e) => e.result === 'red').length;
  const total = greens + reds;

  const data = {
    labels: ['Green', 'Red'],
    datasets: [
      {
        data: total > 0 ? [greens, reds] : [1, 1],
        backgroundColor: ['#2dd4a8', '#ef4444'],
        borderColor: ['#1fa882', '#dc2626'],
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#9ca3af",
          padding: 20,
          usePointStyle: true,
          pointStyleWidth: 10,
          font: { size: 13, family: "Inter" },
        },
      },
      tooltip: {
        backgroundColor: "#0f2a2a",
        borderColor: "#1a3f3f",
        borderWidth: 1,
        titleFont: { family: "Inter" },
        bodyFont: { family: "JetBrains Mono" },
        padding: 12,
        callbacks: {
          label: (ctx) => {
            const raw = typeof ctx.raw === "number" ? ctx.raw : Number(ctx.raw) || 0;
            const pct = total > 0 ? ((raw / total) * 100).toFixed(1) : "0";
            return ` ${ctx.label}: ${raw} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="card-glow p-6 fade-in">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-6">
        Distribuicao de Resultados
      </h3>
      <div className="h-64 flex items-center justify-center">
        {total === 0 ? (
          <p className="text-gray-600 text-sm">Nenhuma entrada registrada</p>
        ) : (
          <Doughnut data={data} options={options} />
        )}
      </div>
      {total > 0 && (
        <div className="flex justify-center gap-8 mt-4 pt-4 border-t border-dark-600">
          <div className="text-center">
            <span className="text-2xl font-bold font-mono text-accent-green">{greens}</span>
            <p className="text-xs text-gray-500 mt-1">Greens</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold font-mono text-accent-red">{reds}</span>
            <p className="text-xs text-gray-500 mt-1">Reds</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold font-mono text-gold-400">
              {((greens / total) * 100).toFixed(0)}%
            </span>
            <p className="text-xs text-gray-500 mt-1">Acerto</p>
          </div>
        </div>
      )}
    </div>
  );
}

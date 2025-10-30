import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Point {
  label: string;
  value: number;
}

interface EvasionChartProps {
  points: Point[];
  height?: number;
  details?: Record<string, { name: string; date?: string | null; area?: string | null }[]>;
}

const EvasionChart: React.FC<EvasionChartProps> = ({ points, height = 220, details = {} }) => {
  const labels = points.map(p => p.label);
  const data = {
    labels,
    datasets: [
      {
        label: 'Exonerações',
        data: points.map(p => p.value),
        backgroundColor: '#06b6d4',
        borderRadius: 6,
        // Removemos a espessura fixa para permitir ajuste responsivo.
        // Ajustamos barPercentage/categoryPercentage para reduzir o espaçamento entre barras.
        barPercentage: 0.95,
        categoryPercentage: 0.95,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y} exonerações`,
          afterBody: (ctx: any) => {
            try {
              const label = ctx[0].label as string;
              const rows = (details[label] ?? []).slice();
              if (rows.length === 0) return [];
              // ordena por data asc (mais antigo primeiro)
              const parseBrazilDate = (d: any): Date | null => {
                if (!d || typeof d !== 'string') return null;
                const parts = d.split('/');
                if (parts.length !== 3) return null;
                const day = Number(parts[0]);
                const month = Number(parts[1]) - 1;
                const year = Number(parts[2]);
                if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
                return new Date(year, month, day);
              };
              rows.sort((a: any, b: any) => {
                const da = parseBrazilDate(a.date);
                const db = parseBrazilDate(b.date);
                if (da && db) return da.getTime() - db.getTime();
                if (da && !db) return -1;
                if (!da && db) return 1;
                return a.name.localeCompare(b.name);
              });
              // map to lines like 'Name — DD/MM/YYYY'
              return rows.map((r: any) => `${r.name} — ${r.date ?? '—'}`);
            } catch (e) {
              return [];
            }
          }
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#cbd5e1', maxRotation: 0, minRotation: 0 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#94a3b8' },
        grid: { color: '#334155' },
      },
    },
  };

  return (
    <div style={{ width: '100%', height }} className="bg-slate-800/0 rounded">
      <Bar data={data} options={options} />
    </div>
  );
};

export default EvasionChart;
 

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
  // optional background (total) points to render as faint bars behind the primary points
  backgroundPoints?: Point[];
}

const EvasionChart: React.FC<EvasionChartProps> = ({ points, height = 220, details = {}, backgroundPoints }) => {
  // Construir datasets: alinhar labels ao background (total) quando disponível
  // Preferir labels do background (total) para garantir alinhamento vertical entre barras
  const labels = (backgroundPoints && backgroundPoints.length > 0)
    ? backgroundPoints.map(p => p.label)
    : points.map(p => p.label);

  const bgMap = new Map<string, number>((backgroundPoints ?? []).map(p => [p.label, p.value]));
  const filteredMap = new Map<string, number>(points.map(p => [p.label, p.value]));

  // Construir datasets empilhados: primeiro a série filtrada (opaca) na base, depois o restante (transparente) acima.
  const datasets: any[] = []; // Declare datasets only once

  // Série filtrada (pode ser igual ao total quando não há filtro)
  datasets.push({
    label: 'Exonerações (filtrado)',
    data: labels.map(l => filteredMap.get(l) ?? 0),
    backgroundColor: '#dc2626',
    borderRadius: 6,
    barPercentage: 0.95,
    categoryPercentage: 0.95,
    stack: 'stack1',
  });

  // Série restante: total - filtrado (transparente)
  if (backgroundPoints && backgroundPoints.length > 0) {
    datasets.push({
      label: 'Resto',
      data: labels.map(l => Math.max((bgMap.get(l) ?? 0) - (filteredMap.get(l) ?? 0), 0)),
      backgroundColor: 'rgba(220,38,38,0.3)',
      borderRadius: 6,
      barPercentage: 0.95,
      categoryPercentage: 0.95,
      stack: 'stack1',
    });
  }

  const data = { labels, datasets };

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
        ticks: { color: '#d1d5db', maxRotation: 0, minRotation: 0 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#9ca3af' },
        grid: { color: '#374151' },
        stacked: true,
      },
    },
  };

  return (
    <div style={{ width: '100%', height }} className="bg-gray-900/50 rounded border border-gray-800">
      <Bar data={data} options={options} />
    </div>
  );
};

export default EvasionChart;
 

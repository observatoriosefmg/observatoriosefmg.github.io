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
  tipo: string;
  value: number;
}

interface EvasionChartProps {
  points: Point[];
  height?: number;
  details?: Record<string, { name: string; date?: string | null; area?: string | null }[]>;
  // optional background (total) points to render as faint bars behind the primary points
  backgroundPoints?: Point[];
  // pontos específicos para aposentadorias e afastamentos
  inactivityPoints?: Point[];
  // detalhes específicos para aposentadorias e afastamentos
  inactivityDetails?: Record<string, { name: string; date?: string | null; area?: string | null }[]>;
  // pontos de background para aposentadorias (todas as áreas)
  backgroundInactivityPoints?: Point[];
}

const EvasionChart: React.FC<EvasionChartProps> = ({ points, height = 220, details = {}, backgroundPoints, inactivityPoints, inactivityDetails = {}, backgroundInactivityPoints }) => {
  // Detectar se é gráfico por unidade
  const isUnidadeChart = points.length > 0 && points[0].tipo === 'unidade';
  
  // Função para truncar labels em gráficos de unidade
  const truncateLabel = (label: string, maxLength: number = 15): string => {
    if (isUnidadeChart && label.length > maxLength) {
      return label.substring(0, maxLength) + '...';
    }
    return label;
  };
  
  // Construir datasets: alinhar labels ao background (total) quando disponível
  // Preferir labels do background (total) para garantir alinhamento vertical entre barras
  const baseLabels = (backgroundPoints && backgroundPoints.length > 0)
    ? backgroundPoints.map(p => p.label)
    : points.map(p => p.label);
  
  const labels = baseLabels.map(label => truncateLabel(label));

  const bgMap = new Map<string, number>((backgroundPoints ?? []).map(p => [p.label, p.value]));
  const filteredMap = new Map<string, number>(points.map(p => [p.label, p.value]));
  const inactivityMap = new Map<string, number>((inactivityPoints ?? []).map(p => [p.label, p.value]));
  const backgroundInactivityMap = new Map<string, number>((backgroundInactivityPoints ?? []).map(p => [p.label, p.value]));

  // Construir datasets empilhados
  const datasets: any[] = [];

  // Série de exonerações/desistências (vermelha)
  datasets.push({
    label: 'Exonerações',
    data: baseLabels.map(l => filteredMap.get(l) ?? 0),
    backgroundColor: '#dc2626',
    borderRadius: 6,
    barPercentage: 0.95,
    categoryPercentage: 0.95,
    stack: 'stack1',
  });

  // Série de aposentadorias e afastamentos filtradas (dourada)
  datasets.push({
    label: 'Aposentadorias e Afastamentos',
    data: baseLabels.map(l => inactivityMap.get(l) ?? 0),
    backgroundColor: '#d4af37',
    borderRadius: 6,
    barPercentage: 0.95,
    categoryPercentage: 0.95,
    stack: 'stack1',
  });

  // Série de aposentadorias de outras áreas (dourada transparente)
  if (backgroundInactivityPoints && backgroundInactivityPoints.length > 0) {
    datasets.push({
      label: 'Aposentadorias (outras áreas)',
      data: baseLabels.map(l => Math.max((backgroundInactivityMap.get(l) ?? 0) - (inactivityMap.get(l) ?? 0), 0)),
      backgroundColor: 'rgba(212,175,55,0.3)',
      borderRadius: 6,
      barPercentage: 0.95,
      categoryPercentage: 0.95,
      stack: 'stack1',
    });
  }

  // Série restante de exonerações: total - filtrado (transparente)
  if (backgroundPoints && backgroundPoints.length > 0) {
    const totalInactivity = backgroundInactivityPoints ? backgroundInactivityMap : new Map();
    datasets.push({
      label: 'Exonerações (outras áreas)',
      data: baseLabels.map(l => Math.max((bgMap.get(l) ?? 0) - (filteredMap.get(l) ?? 0) - (totalInactivity.get(l) ?? 0), 0)),
      backgroundColor: 'rgba(220,38,38,0.15)',
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
      legend: { 
        display: true,
        position: 'top',
        labels: {
          color: '#d1d5db',
          font: {
            size: 12
          },
          padding: 15,
          usePointStyle: true,
          filter: function(legendItem: any) {
            // Ocultar séries de background/transparentes da legenda
            return !['Exonerações (outras áreas)', 'Aposentadorias (outras áreas)'].includes(legendItem.text);
          }
        }
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          title: (context: any) => {
            // Se for gráfico de unidades, mostrar o nome completo da unidade no tooltip
            if (isUnidadeChart && context.length > 0) {
              const labelTruncado = context[0].label as string;
              // Encontrar o label original correspondente ao truncado
              const labelOriginal = baseLabels[context[0].dataIndex];
              return labelOriginal || labelTruncado;
            }
            return context.length > 0 ? context[0].label : '';
          },
          label: (context: any) => {
            const datasetLabel = context.dataset.label;
            const value = context.parsed.y;
            
            if (datasetLabel === 'Aposentadorias e Afastamentos') {
              return `${value} aposentadorias/afastamentos`;
            } else if (datasetLabel === 'Aposentadorias (outras áreas)') {
              return `${value} aposentadorias (outras áreas)`;
            } else if (datasetLabel === 'Exonerações') {
              return `${value} exonerações/desistências`;
            } else if (datasetLabel === 'Exonerações (outras áreas)') {
              return `${value} exonerações (outras áreas)`;
            } else {
              return `${value} outros`;
            }
          },
          afterBody: (ctx: any) => {
            try {
              // Usar o label original para buscar os detalhes
              const labelTruncado = ctx[0].label as string;
              const labelOriginal = isUnidadeChart ? baseLabels[ctx[0].dataIndex] : labelTruncado;
              const datasetLabel = ctx[0].dataset.label;
              
              // Escolher os dados corretos baseado no dataset
              let rows: any[] = [];
              if (datasetLabel === 'Aposentadorias e Afastamentos') {
                rows = (inactivityDetails[labelOriginal] ?? []).slice();
              } else if (datasetLabel === 'Exonerações') {
                rows = (details[labelOriginal] ?? []).slice();
              }
              
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
        ticks: { 
          color: '#d1d5db', 
          maxRotation: isUnidadeChart ? 90 : 0, 
          minRotation: isUnidadeChart ? 90 : 0 
        },
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


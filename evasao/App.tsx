import React, { useState, useEffect } from 'react';
import CounterCard from './components/CounterCard';
import EvasionTable from './components/EvasionTable';
import EvasionChart from './components/EvasionChart';
import { LAST_EVASION_DATE, COST_PER_AUDITOR, EVASION_DATA, AUDITORS_WHO_LEFT_AFTER_POSSE, EVASION_AUDITORS } from './constants';
import { EvasionData } from './types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faMoneyBill, faUsers } from '@fortawesome/free-solid-svg-icons';

const App: React.FC = () => {
  const [daysSinceLastEvasion, setDaysSinceLastEvasion] = useState(0);
  const [evasionData, setEvasionData] = useState<EvasionData[]>(EVASION_DATA);

  useEffect(() => {
    const today = new Date();
    const differenceInTime = today.getTime() - LAST_EVASION_DATE.getTime();
    const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
    setDaysSinceLastEvasion(differenceInDays);
  }, []);

  // Ao montar, tentamos carregar `dados.json` de alguns caminhos possíveis.
  useEffect(() => {
    let mounted = true;

    const paths = [
      '/evasao/data/dados.json',
      '/evasao/dist/data/dados.json',
      '/evasao/dist/assets/dados.json',
      '/evasao/dados.json',
      '/dados.json',
      'dist/data/dados.json',
      'assets/dados.json',
    ];

    async function tryLoad() {
      for (const p of paths) {
        try {
          const res = await fetch(p);
          if (!res.ok) continue;
          const text = await res.text();

          // O arquivo em `dist` pode conter literais NaN — substituímos por null antes do parse.
          const sanitized = text.replace(/\bNaN\b/g, 'null');
          const raw = JSON.parse(sanitized);

          if (!Array.isArray(raw)) {
            console.warn('dados.json não tem formato esperado (array) em', p);
            continue;
          }

          // Agrega registros: considerar apenas destinos (ÓRGÃO). Ignorar registros sem órgão.
          const map = new Map<string, number>();
          for (const rec of raw) {
            const situacao = rec['SITUACAO'] ?? rec['Situação'] ?? rec['Situacao'];
            // considerar apenas situações que caracterizam evasão
            const isEvasion = situacao && String(situacao).toUpperCase().includes('DESIST') || (situacao && String(situacao).toUpperCase().includes('EXONERADO'));
            if (!isEvasion) continue;

            const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
            if (org === null || org === undefined) continue; // pular sem destino
            const key = String(org).trim();
            if (key === '') continue;
            const prev = map.get(key) ?? 0;
            map.set(key, prev + 1);
          }

          const aggregated: EvasionData[] = Array.from(map.entries()).map(([destination, count]) => ({ destination, count }));
          aggregated.sort((a, b) => b.count - a.count);

          if (mounted) setEvasionData(aggregated);
          return;
        } catch (err) {
          // tentar próximo caminho
          // eslint-disable-next-line no-console
          console.debug('Falha ao carregar', p, err);
        }
      }

      // nenhum caminho funcionou — manter dados embutidos
      // eslint-disable-next-line no-console
      console.warn('Não foi possível carregar dados.json; usando dados internos.');
    }

    tryLoad();

    return () => { mounted = false; };
  }, []);

  // Recalcula valores derivados a partir dos dados (podem vir do arquivo `dados.json`).
  // `evasionData` é a agregação por destino (apenas com ÓRGÃO preenchido).
  const totalEvasionsInTable = evasionData.reduce((sum, item) => sum + item.count, 0);

  // Total real de auditores que evadiram (inclui também registros sem ÓRGÃO preenchido).
  const totalEvasions = AUDITORS_WHO_LEFT_AFTER_POSSE;

  // helper para parsear datas no formato DD/MM/YYYY
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

  // Calcula custo acumulado por auditor: R$30.000 mensais desde JAN/2024 até a data da exoneração (inclusivo).
  const monthsBetweenInclusive = (start: Date, end: Date) => {
    if (end.getTime() < start.getTime()) return 0;
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    // +1 para incluir o mês inicial conforme solicitado (jan/2024 até mês da exoneração inclusive)
    return years * 12 + months + 1;
  };

  const startWindow = new Date(2024, 0, 1); // Jan 1, 2024

  const totalCost = EVASION_AUDITORS.reduce((sum, rec) => {
    const rawDate = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) return sum; // sem data -> não acumula custos mensais
    const months = monthsBetweenInclusive(startWindow, d);
    return sum + (months * COST_PER_AUDITOR);
  }, 0);

  // Mapeia destinos para lista de auditores (inclui 'Destino desconhecido' para sem órgão)
  const destinationDetails: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};
  destinationDetails['Destino desconhecido'] = [];


  for (const rec of EVASION_AUDITORS) {
    const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
    const key = (org === null || org === undefined) ? 'Destino desconhecido' : String(org).trim() || 'Destino desconhecido';
    const name = rec['Nome do Candidato'] ?? rec['NOME DO CANDIDATO'] ?? rec['nome'] ?? '';
    const date = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
    const area = rec['ÁREA'] ?? rec['AREA'] ?? null;
    if (!destinationDetails[key]) destinationDetails[key] = [];
    destinationDetails[key].push({ name, date, area });
  }

  // Ordena nomes dentro de cada destino por data (mais recente primeiro)
  for (const k of Object.keys(destinationDetails)) {
    destinationDetails[k].sort((a, b) => {
      const da = parseBrazilDate(a.date);
      const db = parseBrazilDate(b.date);
      if (da && db) return db.getTime() - da.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  // Conta evasões por área (para mostrar no footer do card)
  const areaCounts: Record<string, number> = {};
  for (const rec of EVASION_AUDITORS) {
    const area = String(rec['ÁREA'] ?? rec['AREA'] ?? 'Outros');
    areaCounts[area] = (areaCounts[area] ?? 0) + 1;
  }
  const areaFooter = (
    <div className="flex flex-wrap gap-3 justify-center">
      {Object.entries(areaCounts).map(([area, cnt]) => (
        <div key={area} className="text-xs text-slate-400">
          {area}: <span className="font-medium text-white">{cnt}</span>
        </div>
      ))}
    </div>
  );

  // Agregar exonerações por mês usando chave ISO (YYYY-MM) para ordenação correta.
  // Mantemos um rótulo legível em pt-BR para exibição no gráfico e usamos esse rótulo como chave em `monthlyDetails`.
  const monthlyMapIso: Map<string, number> = new Map();
  const isoToLabel: Record<string, string> = {};
  const monthlyDetails: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};

  for (const rec of EVASION_AUDITORS) {
    const rawDate = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // e.g. 2024-07
  // formato de exibição desejado: 'MMM/YYYY' em maiúsculas, ex: 'ABR/2025'
  const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;

    monthlyMapIso.set(iso, (monthlyMapIso.get(iso) ?? 0) + 1);
    isoToLabel[iso] = displayLabel;

    // preencher detalhes por rótulo de exibição (tooltip espera label legível)
    if (!monthlyDetails[displayLabel]) monthlyDetails[displayLabel] = [];
    const name = rec['Nome do Candidato'] ?? rec['NOME DO CANDIDATO'] ?? rec['nome'] ?? '';
    const area = rec['ÁREA'] ?? rec['AREA'] ?? null;
    monthlyDetails[displayLabel].push({ name, date: rawDate, area });
  }

  // Ordena por chave ISO asc (ano/mês) e constrói os pontos do gráfico usando o rótulo legível.
  const monthlyPoints = Array.from(monthlyMapIso.entries())
    .sort((a, b) => a[0].localeCompare(b[0])) // iso strings ordenam corretamente
    .map(([iso, value]) => ({ label: isoToLabel[iso], value }));

  // Garantir que os detalhes por mês estejam ordenados por data de exoneração (mais antigo primeiro)
  for (const label of Object.keys(monthlyDetails)) {
    monthlyDetails[label].sort((a, b) => {
      const da = parseBrazilDate(a.date);
      const db = parseBrazilDate(b.date);
      if (da && db) return da.getTime() - db.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  // Última exoneração (formatada) — usamos LAST_EVASION_DATE exportado por constants.ts
  const lastExonDateFormatted = LAST_EVASION_DATE
    ? LAST_EVASION_DATE.toLocaleDateString('pt-BR')
    : '—';

  // Calcular recorde: maior intervalo (em dias) sem exoneração entre datas de exoneração
  const exonDates: Date[] = EVASION_AUDITORS
    .map(r => parseBrazilDate(r['DATA EXONERAÇÃO'] ?? r['Data Exoneração'] ?? null))
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  let recordDays = 0;
  if (exonDates.length === 0) {
    recordDays = 0;
  } else if (exonDates.length === 1) {
    const now = new Date();
    recordDays = Math.floor((now.getTime() - exonDates[0].getTime()) / (1000 * 3600 * 24));
  } else {
    for (let i = 0; i < exonDates.length - 1; i++) {
      const gap = Math.floor((exonDates[i + 1].getTime() - exonDates[i].getTime()) / (1000 * 3600 * 24));
      if (gap > recordDays) recordDays = gap;
    }
  }

  const CalendarIcon = () => <FontAwesomeIcon icon={faCalendarAlt} className="h-10 w-10 md:h-12 md:w-12 text-cyan-400" />;

  const MoneyIcon = () => <FontAwesomeIcon icon={faMoneyBill} className="h-10 w-10 md:h-12 md:w-12 text-cyan-400" />;

  const PeopleIcon = () => <FontAwesomeIcon icon={faUsers} className="h-10 w-10 md:h-12 md:w-12 text-cyan-400" />;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2">Observatório da Evasão</h1>
          <p className="text-lg text-cyan-400 font-medium">Auditores Fiscais da Receita Estadual de MG</p>
        </header>

        <main>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <CounterCard 
              value={daysSinceLastEvasion} 
              label={`Dias sem perder um Auditor Fiscal (Última exoneração: ${lastExonDateFormatted})`}
              icon={<CalendarIcon />} 
              footer={<div className="text-xs">Nosso recorde é {recordDays} dias</div>}
            />
            <CounterCard
              value={totalEvasions}
              label="Número de evasões"
              icon={<PeopleIcon />}
              footer={areaFooter}
            />
            <CounterCard 
              value={<span title={totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' as any }).format(totalCost)}</span>} 
              label={`Custo estimado para o Estado com ${totalEvasions} evasões pós-posse`}
              icon={<MoneyIcon />} 
            />
          </section>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Exonerações por mês</h3>
            <EvasionChart points={monthlyPoints} details={monthlyDetails} />
          </div>

          <section className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Destinos da Evasão</h2>
            <p className="text-slate-400 mb-6">
              Esta tabela detalha os órgãos (destinos) para os quais os auditores se transferiram após a posse.
              O número total de evasões é de <span className="font-bold text-cyan-400">{totalEvasions}</span>.
            </p>
            <EvasionTable data={evasionData} details={destinationDetails} />
          </section>
        </main>
        
        <div className="mt-8 text-sm text-slate-400 space-y-2">
          <p>
            Esta análise considera apenas os auditores aprovados no último concurso público (Edital 1/2022).
          </p>
          <p>
            O cálculo do custo estimado para o Estado considera R$ 30.000 por mês, por auditor, a partir de janeiro de 2024 até o mês da exoneração. Auditores sem data de exoneração não acumulam custo mensal neste cálculo.
          </p>
          <p>
            São contabilizadas tanto exonerações quanto desistências como eventos de evasão.
          </p>
        </div>

        <footer className="text-center mt-6 text-slate-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Observatório da Evasão. Dados extraídos do Diário Oficial de Minas Gerais.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;

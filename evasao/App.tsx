import React, { useState, useEffect } from 'react';
import CounterCard from './components/CounterCard';
import EvasionTable from './components/EvasionTable';
import EvasionChart from './components/EvasionChart';
import CollaborationForm from './components/CollaborationForm';
import { DEFAULT_LAST_EVASION_DATE, COST_PER_AUDITOR } from './constants';
import { EvasionData } from './types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faMoneyBill, faUsers, faSpinner } from '@fortawesome/free-solid-svg-icons';

const App: React.FC = () => {
  const [daysSinceLastEvasion, setDaysSinceLastEvasion] = useState(0);
  const [evasionData, setEvasionData] = useState<EvasionData[]>([]);
  const [evasionAuditors, setEvasionAuditors] = useState<any[]>([]);
  const [lastEvasionDate, setLastEvasionDate] = useState<Date | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>('TODAS');
  const [isLoading, setIsLoading] = useState(true);

  // daysSinceLastEvasion will be calculado após carregamento dos dados (quando lastEvasionDate estiver definido).
  useEffect(() => {
    const ref = lastEvasionDate ?? DEFAULT_LAST_EVASION_DATE;
    const today = new Date();
    const differenceInTime = today.getTime() - ref.getTime();
    const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
    setDaysSinceLastEvasion(differenceInDays);
  }, [lastEvasionDate]);

  // Ao montar, tentamos carregar `dados.csv` de alguns caminhos possíveis e parseá-lo.
  useEffect(() => {
    let mounted = true;

    const paths = [
      '/data/dados.csv',
      '/evasao/data/dados.csv',
      'data/dados.csv',
      './data/dados.csv',
      '/evasao/dist/data/dados.csv',
      '/evasao/dist/assets/dados.csv',
      '/evasao/dados.csv',
      '/dados.csv',
      'dist/data/dados.csv',
      'assets/dados.csv',
    ];

    const parseCsv = (text: string) => {
      // Parser robusto para CSV com separador ';' e suporte a campos entre aspas duplas.
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length === 0) return [];

      const parseLine = (line: string) => {
        const parts: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            // escape de aspas duplas "" dentro de campo
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++; // pular a segunda aspas
            } else {
              inQuotes = !inQuotes;
            }
            continue;
          }
          if (ch === ';' && !inQuotes) {
            parts.push(cur);
            cur = '';
            continue;
          }
          cur += ch;
        }
        parts.push(cur);
        return parts;
      };

      const headerLine = lines[0];
      const headers = parseLine(headerLine).map(h => h.trim());
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const parts = parseLine(line);
        // garantir que temos o mesmo número de colunas: preencher com '' quando faltar
        while (parts.length < headers.length) parts.push('');
        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j]] = parts[j] ? parts[j].trim() : '';
        }

        // Normalizações para manter compatibilidade com o que o app espera
        const normalized: Record<string, any> = { ...obj };
        // Nome
        if (obj['NOME']) normalized['Nome do Candidato'] = obj['NOME'];
        if (obj['NOME DO CANDIDATO']) normalized['Nome do Candidato'] = obj['NOME DO CANDIDATO'];
        // Situação
        if (obj['SITUAÇÃO']) normalized['SITUACAO'] = obj['SITUAÇÃO'];
        if (obj['SITUACAO']) normalized['SITUACAO'] = obj['SITUACAO'];
        // Órgão destino -> mapear para chave 'ÓRGÃO' usada no código
        if (obj['ÓRGÃO DESTINO']) normalized['ÓRGÃO'] = obj['ÓRGÃO DESTINO'];
        if (obj['ORGAO DESTINO']) normalized['ÓRGÃO'] = obj['ORGAO DESTINO'];
        if (obj['ÓRGÃO']) normalized['ÓRGÃO'] = obj['ÓRGÃO'];
        // Área
        if (obj['ÁREA']) normalized['ÁREA'] = obj['ÁREA'];
        if (obj['AREA']) normalized['ÁREA'] = obj['AREA'];
        // Data exoneração
        if (obj['DATA EXONERAÇÃO']) normalized['DATA EXONERAÇÃO'] = obj['DATA EXONERAÇÃO'];
        if (obj['DATA EXONERACAO']) normalized['DATA EXONERAÇÃO'] = obj['DATA EXONERACAO'];

        rows.push(normalized);
      }
      return rows;
    };

    async function tryLoad() {
      const makeNoCacheUrl = (url: string) => url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
      for (const p of paths) {
        try {
          const res = await fetch(makeNoCacheUrl(p), { cache: 'no-store', headers: { 'cache-control': 'no-cache' } as any });
          if (!res.ok) continue;
          let text = await res.text();
          // remover BOM se presente
          text = text.replace(/^\uFEFF/, '');
          // log do caminho e tamanho do conteúdo para depuração
          // eslint-disable-next-line no-console
          console.debug('carregado', p, 'tamanho', text.length);
          const raw = parseCsv(text);
          if ((!Array.isArray(raw) || raw.length === 0) && text.trim().length > 0) {
            // se parse devolveu vazio, registrar um trecho do texto para ajudar depurar
            // eslint-disable-next-line no-console
            console.warn('parseCsv retornou array vazio para', p, 'trecho:', text.slice(0, 400));
          }
          if (!Array.isArray(raw) || raw.length === 0) {
            console.warn('dados.csv não tem formato esperado (array) em', p);
            continue;
          }

          // Filtrar apenas situações que consideramos evasão
          const isEvasionSituation = (s: any) => {
            if (!s) return false;
            const normalized = String(s).toUpperCase().trim();
            return normalized === 'NOMEADO E EXONERADO' || normalized === 'DESISTENTE';
          };

          const evasionRows = raw.filter(r => isEvasionSituation(r['SITUACAO'] ?? r['SITUAÇÃO'] ?? r['Situacao'] ?? r['Situacao']));

          // Agrega registros: considerar apenas situações que caracterizam evasão.
          // Incluímos também um bucket "Destino desconhecido" para registros sem órgão.
          const map = new Map<string, number>();
          let unknownCount = 0;
          for (const rec of evasionRows) {
            const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
            if (org === null || org === undefined || String(org).trim() === '') {
              unknownCount += 1;
              continue;
            }
            const key = String(org).trim();
            const prev = map.get(key) ?? 0;
            map.set(key, prev + 1);
          }

          const aggregated: EvasionData[] = Array.from(map.entries()).map(([destination, count]) => ({ destination, count }));
          if (unknownCount > 0) aggregated.push({ destination: 'Destino desconhecido', count: unknownCount });
          aggregated.sort((a, b) => b.count - a.count);

          // Determinar última data de exoneração presente nos registros
          let lastDate: Date | null = null;
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
          for (const rec of evasionRows) {
            const dRaw = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? rec['DATA PUBLICAÇÃO EXONERAÇÃO'] ?? null;
            const parsed = parseBrazilDate(dRaw);
            if (parsed && (!lastDate || parsed.getTime() > lastDate.getTime())) lastDate = parsed;
          }

          if (mounted) {
            // Expor os dados lidos para depuração no console do navegador
            try {
              (window as any).__EVASION_RAW = evasionRows;
              (window as any).__ALL_RAW = raw;
            } catch (e) {
              // ignorar se não puder escrever em window
            }
            // Publica no console em formato de objeto JavaScript
            // (ver no DevTools do navegador após carregar a página)
            // eslint-disable-next-line no-console
            console.log('dados.csv parsed (evasionRows):', evasionRows);
            // eslint-disable-next-line no-console
            console.log('dados.csv parsed (all rows):', raw);

            setEvasionData(aggregated);
            setEvasionAuditors(evasionRows);
            setLastEvasionDate(lastDate ?? null);
            setIsLoading(false);
          }

          return;
        } catch (err) {
          // tentar próximo caminho
          // eslint-disable-next-line no-console
          console.debug('Falha ao carregar', p, err);
        }
      }

      // nenhum caminho funcionou — manter dados embutidos
      // eslint-disable-next-line no-console
      console.warn('Não foi possível carregar dados.csv; usando dados internos.');
      setIsLoading(false);
    }

    tryLoad();

    return () => { mounted = false; };
  }, []);

  // Recalcula valores derivados a partir dos dados (podem vir do arquivo `dados.json`).
  // `evasionData` é a agregação por destino (apenas com ÓRGÃO preenchido).
  const totalEvasionsInTable = evasionData.reduce((sum, item) => sum + item.count, 0);

  // Total real de auditores que evadiram (inclui também registros sem ÓRGÃO preenchido).
  const totalEvasions = evasionAuditors.length;

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

  // Calcula custo acumulado por auditor: R$30.000 mensais desde DATA NOMEAÇÃO + 30 dias até a data da exoneração (inclusivo).
  const monthsBetweenInclusive = (start: Date, end: Date) => {
    if (end.getTime() < start.getTime()) return 0;
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    // +1 para incluir o mês inicial conforme solicitado (nomeação+30 dias até mês da exoneração inclusive)
    return years * 12 + months + 1;
  };

  const totalCost = evasionAuditors.reduce((sum, rec) => {
    const rawExonDate = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
    const rawNomeacaoDate = rec['DATA NOMEAÇÃO'] ?? rec['DATA NOMEACAO'] ?? null;
    
    const exonDate = parseBrazilDate(rawExonDate);
    const nomeacaoDate = parseBrazilDate(rawNomeacaoDate);
    
    if (!exonDate || !nomeacaoDate) return sum; // sem data -> não acumula custos mensais
    
    // Data início do custo: nomeação + 30 dias
    const startDate = new Date(nomeacaoDate);
    startDate.setDate(startDate.getDate() + 30);
    
    const months = monthsBetweenInclusive(startDate, exonDate);
    return sum + (months * COST_PER_AUDITOR);
  }, 0);

  // Mapeia destinos para lista de auditores (inclui 'Destino desconhecido' para sem órgão)
  const destinationDetails: Record<string, { name: string; date?: string | null; pubDate?: string | null; noEffectDate?: string | null; situation?: string | null; area?: string | null }[]> = {};
  destinationDetails['Destino desconhecido'] = [];


  for (const rec of evasionAuditors) {
    const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
    const key = (org === null || org === undefined) ? 'Destino desconhecido' : String(org).trim() || 'Destino desconhecido';
    const name = rec['Nome do Candidato'] ?? rec['NOME DO CANDIDATO'] ?? rec['nome'] ?? '';
  const date = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
  const pubDate = rec['DATA PUBLICAÇÃO EXONERAÇÃO'] ?? rec['DATA PUBLICACAO EXONERAÇÃO'] ?? rec['DATA PUBLICACAO EXONERAÇÃO'] ?? null;
  const noEffectDate = rec['DATA NOMEAÇÃO SEM EFEITO'] ?? rec['DATA NOMEACAO SEM EFEITO'] ?? rec['DATA NOMEAÇÃO'] ?? rec['Data NOMEAÇÃO SEM EFEITO'] ?? null;
  const situation = rec['SITUACAO'] ?? rec['SITUAÇÃO'] ?? rec['Situacao'] ?? null;
  const area = rec['ÁREA'] ?? rec['AREA'] ?? null;
    if (!destinationDetails[key]) destinationDetails[key] = [];
    destinationDetails[key].push({ name, date, pubDate, noEffectDate, situation, area });
  }

  // Ordena nomes dentro de cada destino por data (mais recente primeiro)
  for (const k of Object.keys(destinationDetails)) {
    destinationDetails[k].sort((a, b) => {
      const getKeyDate = (it: any) => {
        const isDes = it.situation && String(it.situation).toUpperCase().includes('DESISTENTE');
        return parseBrazilDate(isDes ? it.noEffectDate ?? it.nomeacaoSemEfeito ?? it['DATA NOMEAÇÃO SEM EFEITO'] : it.date);
      };
      const da = getKeyDate(a);
      const db = getKeyDate(b);
      // itens sem data (null) devem ficar por cima
      if (!da && db) return -1;
      if (da && !db) return 1;
      if (da && db) return db.getTime() - da.getTime();
      return a.name.localeCompare(b.name);
    });
  }

  // Conta evasões por área (para mostrar no footer do card)
  const areaCounts: Record<string, number> = {};
  for (const rec of evasionAuditors) {
    const area = String(rec['ÁREA'] ?? rec['AREA'] ?? 'Outros');
    areaCounts[area] = (areaCounts[area] ?? 0) + 1;
  }

  // Conta evasões por tipo (exoneração vs desistência)
  const typeCounts: Record<string, number> = { 'Exonerações': 0, 'Desistências': 0 };
  for (const rec of evasionAuditors) {
    const situation = rec['SITUACAO'] ?? rec['SITUAÇÃO'] ?? rec['Situacao'] ?? '';
    const isDesistente = String(situation).toUpperCase().includes('DESISTENTE');
    if (isDesistente) {
      typeCounts['Desistências'] += 1;
    } else {
      typeCounts['Exonerações'] += 1;
    }
  }

  const areaFooter = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(areaCounts).map(([area, cnt]) => (
          <div key={area} className="text-xs text-gray-400">
            {area}: <span className="font-medium text-amber-400">{cnt}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 justify-center border-t border-gray-700 pt-2">
        {Object.entries(typeCounts).map(([type, cnt]) => (
          <div key={type} className="text-xs text-gray-400">
            {type}: <span className="font-medium text-amber-400">{cnt}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Agregar exonerações por mês (MM/AAAA) - série total
  const monthlyMapIso: Map<string, number> = new Map();
  const isoToLabel: Record<string, string> = {};
  const monthlyDetails: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};
  for (const rec of evasionAuditors) {
    const rawDate = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
    monthlyMapIso.set(iso, (monthlyMapIso.get(iso) ?? 0) + 1);
    isoToLabel[iso] = displayLabel;
    if (!monthlyDetails[displayLabel]) monthlyDetails[displayLabel] = [];
    const name = rec['Nome do Candidato'] ?? rec['NOME DO CANDIDATO'] ?? rec['nome'] ?? '';
    const area = rec['ÁREA'] ?? rec['AREA'] ?? null;
    monthlyDetails[displayLabel].push({ name, date: rawDate, area });
  }
  const monthlyPoints = Array.from(monthlyMapIso.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, value]) => ({ label: isoToLabel[iso], value }));

  // Última exoneração (formatada) — calculada a partir dos dados carregados (ou fallback).
  const lastExonDateFormatted = (lastEvasionDate ?? DEFAULT_LAST_EVASION_DATE)
    ? (lastEvasionDate ?? DEFAULT_LAST_EVASION_DATE).toLocaleDateString('pt-BR')
    : '—';

  // Lista de áreas (para filtro)
  const areas = ['TODAS', ...Array.from(new Set(evasionAuditors.map(r => String(r['ÁREA'] ?? r['AREA'] ?? 'Outros')))).sort()];

  // Filtrar auditores pela área selecionada
  const filteredAuditors = selectedArea === 'TODAS'
    ? evasionAuditors
    : evasionAuditors.filter(r => String(r['ÁREA'] ?? r['AREA'] ?? 'Outros') === selectedArea);

  // Agregação por destino para a área filtrada
  const filteredDestinationMap: Map<string, number> = new Map();
  const filteredDestinationDetails: Record<string, { name: string; date?: string | null; pubDate?: string | null; noEffectDate?: string | null; situation?: string | null; area?: string | null }[]> = { 'Destino desconhecido': [] };
  let filteredUnknownCount = 0;
  for (const rec of filteredAuditors) {
    const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
    const key = (org === null || org === undefined || String(org).trim() === '') ? 'Destino desconhecido' : String(org).trim();
    const name = rec['Nome do Candidato'] ?? rec['NOME DO CANDIDATO'] ?? rec['nome'] ?? '';
  const date = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
  const pubDate = rec['DATA PUBLICAÇÃO EXONERAÇÃO'] ?? rec['DATA PUBLICACAO EXONERAÇÃO'] ?? rec['DATA PUBLICACAO EXONERAÇÃO'] ?? null;
  const noEffectDate = rec['DATA NOMEAÇÃO SEM EFEITO'] ?? rec['DATA NOMEACAO SEM EFEITO'] ?? rec['DATA NOMEAÇÃO'] ?? rec['Data NOMEAÇÃO SEM EFEITO'] ?? null;
  const situation = rec['SITUACAO'] ?? rec['SITUAÇÃO'] ?? rec['Situacao'] ?? null;
  const area = rec['ÁREA'] ?? rec['AREA'] ?? null;
    filteredDestinationDetails[key] = filteredDestinationDetails[key] ?? [];
  filteredDestinationDetails[key].push({ name, date, pubDate, noEffectDate, situation, area });
    if (key === 'Destino desconhecido') {
      filteredUnknownCount += 1;
    } else {
      filteredDestinationMap.set(key, (filteredDestinationMap.get(key) ?? 0) + 1);
    }
  }
  // Ordena nomes dentro de cada destino filtrado pelo mesmo critério
  for (const k of Object.keys(filteredDestinationDetails)) {
    filteredDestinationDetails[k].sort((a, b) => {
      const getKeyDate = (it: any) => {
        const isDes = it.situation && String(it.situation).toUpperCase().includes('DESISTENTE');
        return parseBrazilDate(isDes ? it.noEffectDate ?? it.nomeacaoSemEfeito ?? it['DATA NOMEAÇÃO SEM EFEITO'] : it.date);
      };
      const da = getKeyDate(a);
      const db = getKeyDate(b);
      if (!da && db) return -1;
      if (da && !db) return 1;
      if (da && db) return db.getTime() - da.getTime();
      return a.name.localeCompare(b.name);
    });
  }
  const evasionDataFiltered: EvasionData[] = Array.from(filteredDestinationMap.entries()).map(([destination, count]) => ({ destination, count }));
  if (filteredUnknownCount > 0) evasionDataFiltered.push({ destination: 'Destino desconhecido', count: filteredUnknownCount });
  evasionDataFiltered.sort((a, b) => b.count - a.count);

  // Agregação mensal filtrada (mesma lógica de labels MMM/YYYY)
  const monthlyMapIsoFiltered: Map<string, number> = new Map();
  const isoToLabelFiltered: Record<string, string> = {};
  const monthlyDetailsFiltered: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};
  for (const rec of filteredAuditors) {
    const rawDate = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
    monthlyMapIsoFiltered.set(iso, (monthlyMapIsoFiltered.get(iso) ?? 0) + 1);
    isoToLabelFiltered[iso] = displayLabel;
    if (!monthlyDetailsFiltered[displayLabel]) monthlyDetailsFiltered[displayLabel] = [];
    const name = rec['Nome do Candidato'] ?? rec['NOME DO CANDIDATO'] ?? rec['nome'] ?? '';
    const area = rec['ÁREA'] ?? rec['AREA'] ?? null;
    monthlyDetailsFiltered[displayLabel].push({ name, date: rawDate, area });
  }
  const monthlyPointsFiltered = Array.from(monthlyMapIsoFiltered.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, value]) => ({ label: isoToLabelFiltered[iso], value }));

  // Ordenar detalhes mensais filtrados por data asc
  for (const label of Object.keys(monthlyDetailsFiltered)) {
    monthlyDetailsFiltered[label].sort((a, b) => {
      const da = parseBrazilDate(a.date);
      const db = parseBrazilDate(b.date);
      if (da && db) return da.getTime() - db.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  // Calcular recorde: maior intervalo (em dias) sem exoneração entre datas de exoneração
  const exonDates: Date[] = evasionAuditors
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

  const CalendarIcon = () => <FontAwesomeIcon icon={faCalendarAlt} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const MoneyIcon = () => <FontAwesomeIcon icon={faMoneyBill} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const PeopleIcon = () => <FontAwesomeIcon icon={faUsers} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <header className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-600 mb-2 drop-shadow-lg">Observatório da Evasão</h1>
            <p className="text-lg text-amber-400 font-medium">Auditores Fiscais da Receita Estadual de Minas Gerais</p>
            

          </header>

        <main>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <CounterCard 
              value={daysSinceLastEvasion} 
              label={`Dias sem perder um Auditor Fiscal (Última exoneração: ${lastExonDateFormatted})`}
              icon={<CalendarIcon />} 
              footer={<div className="text-xs text-amber-400">Nosso recorde é {recordDays} dias</div>}
              isLoading={isLoading}
            />
            <CounterCard
              value={totalEvasions}
              label="Número de evasões"
              icon={<PeopleIcon />}
              footer={areaFooter}
              isLoading={isLoading}
            />
            {/*<CounterCard 
              value={<span title={totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' as any }).format(totalCost)}</span>} 
              label={`Custo estimado para o Estado com ${totalEvasions} evasões`}
              icon={<MoneyIcon />} 
              isLoading={isLoading}
            />*/}
          </section>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-red-300 mb-2">Exonerações por mês</h3>

            <EvasionChart points={monthlyPointsFiltered.length > 0 ? monthlyPointsFiltered : monthlyPoints} details={monthlyDetailsFiltered && Object.keys(monthlyDetailsFiltered).length>0 ? monthlyDetailsFiltered : monthlyDetails} backgroundPoints={monthlyPoints} />
          </div>

          <div className="mb-4 flex flex-col items-center">
            <div className="text-sm text-gray-300 mb-2">Filtrar por especialidade:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {areas.map(a => (
                <button
                  key={a}
                  onClick={() => setSelectedArea(a)}
                  aria-pressed={selectedArea === a}
                  className={`px-3 py-1 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400 ${selectedArea === a ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <section className="bg-gray-900 rounded-xl p-6 shadow-2xl border border-gray-800">
            <h2 className="text-2xl font-bold text-red-300 mb-4">Destinos da Evasão</h2>
            <p className="text-gray-400 mb-6">
              Esta tabela detalha os órgãos (destinos) para os quais os auditores se transferiram após a posse ou se mantiveram no órgão desistindo de tomar posse.
              O número total de evasões é de <span className="font-bold text-orange-400">{totalEvasions}</span>.
            </p>
            <EvasionTable data={selectedArea === 'TODAS' ? evasionData : evasionDataFiltered} details={selectedArea === 'TODAS' ? destinationDetails : filteredDestinationDetails} />
          </section>
        </main>
        
        {/* Link para tabela detalhada */}
        <div className="mt-8 mb-6 text-center">
          <a 
            href="/evasao/dist/table.html"
            className="inline-flex items-center px-6 py-3 text-base font-medium text-white bg-red-600 border border-transparent rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
          >
            Ver Dados Detalhados →
          </a>
        </div>

        <div className="mt-8 text-sm text-gray-400 space-y-2">
          <p>
            Esta análise considera os auditores aprovados no último concurso público (Edital 1/2022) e exonerações pós Janeiro de 2024 de auditores veteranos.
          </p>
          {/*<p>
            O cálculo do custo estimado para o Estado considera R$ 30.000 por mês, por auditor, a partir da data de nomeação + 30 dias até o mês da exoneração. Auditores sem data de exoneração ou nomeação não acumulam custo mensal neste cálculo.
          </p>*/}
          <p>
            São contabilizadas tanto exonerações quanto desistências como eventos de evasão.
          </p>
        </div>

        <CollaborationForm />

        <footer className="text-center mt-6 text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Observatório da Evasão. Dados extraídos do Diário Oficial de Minas Gerais.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;

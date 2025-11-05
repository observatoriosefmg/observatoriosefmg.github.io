import React, { useState, useEffect } from 'react';
import CounterCard from './components/CounterCard';
import EvasionTable from './components/EvasionTable';
import EvasionChart from './components/EvasionChart';
import CollaborationForm from './components/CollaborationForm';
import { DATA_INICIO_OBSERVACAO, COST_PER_AUDITOR } from './constants';
import { DadosDestinoEvasao } from './types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faMoneyBill, faUsers, faSpinner, faPersonShelter } from '@fortawesome/free-solid-svg-icons';

const App: React.FC = () => {
  const [diasDesdeUltimaEvasao, setDiasDesdeUltimaEvasao] = useState(0);
  const [dadosDestinoEvasao, setDadosDestinoEvasao] = useState<DadosDestinoEvasao[]>([]);
  const [raw, setRaw] = useState<any[]>([]);
  const [auditoresEvadidos, setAuditoresEvadidos] = useState<any[]>([]);
  const [dataUltimaEvasao, setDataUltimaEvasao] = useState<Date | null>(null);
  const [areaSelecionada, setAreaSelecionada] = useState<string>('TODAS');
  const [estaCarregando, setEstaCarregando] = useState(true);

  // diasDesdeUltimaEvasao will be calculado após carregamento dos dados (quando dataUltimaEvasao estiver definido).
  useEffect(() => {
    const ref = dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO;
    const today = new Date();
    const diferencaEmMs = today.getTime() - ref.getTime();
    const diferencaEmDias = Math.floor(diferencaEmMs / (1000 * 3600 * 24));
    setDiasDesdeUltimaEvasao(diferencaEmDias);
  }, [dataUltimaEvasao]);

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
          obj[headers[j]] = parts[j] ? parts[j].trim() : null;
        }
        rows.push(obj);
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


          const registrosEvasao = raw.filter(r => ['EXONERADO', 'DESISTENTE'].includes(r['SITUACAO']));
          const registrosInatividade = raw.filter(r => ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']));

          // Agrega registros: considerar apenas situações que caracterizam evasão.
          // Incluímos também um bucket "Destino desconhecido" para registros sem órgão.
          const map = new Map<string, number>();
          let contagemDesconhecidos = 0;
          for (const rec of registrosEvasao) {
            const org = rec['ORGAO_DESTINO'];
            if (org === null || org === undefined || String(org).trim() === '') {
              contagemDesconhecidos += 1;
              continue;
            }
            const key = String(org).trim();
            const prev = map.get(key) ?? 0;
            map.set(key, prev + 1);
          }

          map.set('Aposentados', raw.filter(r => r['SITUACAO'] === 'APOSENTADO').length);
          map.set('Afastados para aposentadoria', raw.filter(r => r['SITUACAO'] === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA').length);

          const aggregated: DadosDestinoEvasao[] = Array.from(map.entries()).map(([destino, count]) => ({ destino, count }));
          if (contagemDesconhecidos > 0) aggregated.push({ destino: 'Destino desconhecido', count: contagemDesconhecidos });
          console.log('Aggregated destinations:', aggregated);
          aggregated.sort((a, b) => {
            const ordem = destino => {
              if (destino === 'Afastados para aposentadoria') return 3;
              if (destino === 'Aposentados') return 2;
              return 1; // demais
            };

            const diff = ordem(a.destino) - ordem(b.destino);
            return diff !== 0 ? diff : b.count - a.count;
          });

          // Determinar última data de exoneração presente nos registros
          let ultimaData: Date | null = null;
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
          for (const rec of registrosEvasao) {
            const dRaw = rec['DATA_PUBLICACAO_EXONERACAO'] ?? null;
            const parsed = parseBrazilDate(dRaw);
            if (parsed && (!ultimaData || parsed.getTime() > ultimaData.getTime())) ultimaData = parsed;
          }

          for (const rec of registrosInatividade) {
            const dRaw = rec['DATA_PUBLICACAO_INATIVIDADE'] ?? null;
            const parsed = parseBrazilDate(dRaw);
            if (parsed && (!ultimaData || parsed.getTime() > ultimaData.getTime())) ultimaData = parsed;
          }

          if (mounted) {
            // Expor os dados lidos para depuração no console do navegador
            try {
              (window as any).__TODOS_RAW = raw;
            } catch (e) {
              // ignorar se não puder escrever em window
            }
            // Publica no console em formato de objeto JavaScript
            // (ver no DevTools do navegador após carregar a página)
            // eslint-disable-next-line no-console
            console.log('dados.csv parsed (registrosEvasao):', registrosEvasao);
            // eslint-disable-next-line no-console
            console.log('dados.csv parsed (all rows):', raw);

            setDadosDestinoEvasao(aggregated);
            setRaw(raw);
            setAuditoresEvadidos(registrosEvasao);
            setDataUltimaEvasao(ultimaData ?? null);
            setEstaCarregando(false);
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
      setEstaCarregando(false);
    }

    tryLoad();

    return () => { mounted = false; };
  }, []);

  // Recalcula valores derivados a partir dos dados (podem vir do arquivo `dados.json`).
  // `dadosDestinoEvasao` é a agregação por destino (apenas com ÓRGÃO preenchido).
  const contagemEvasoesNaTabela = dadosDestinoEvasao.reduce((sum, item) => sum + item.count, 0);

  // Total real de auditores que evadiram (inclui também registros sem ÓRGÃO preenchido).
  const contagemEvasoes = auditoresEvadidos.length;

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

  const totalCost = auditoresEvadidos.reduce((sum, rec) => {
    const rawExonDate = rec['DATA_EXONERACAO'] ?? null;
    const rawNomeacaoDate = rec['DATA_NOMEACAO'] ?? null;

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
  const destinoDetails: Record<string, { name: string; data?: string | null; dataPublicacao?: string | null; dataNomeacaoSemEfeito?: string | null; situacao?: string | null; area?: string | null; observacao?: string | null }[]> = {};
  destinoDetails['Destino desconhecido'] = [];



  for (const rec of raw.filter(r => ['EXONERADO', 'DESISTENTE', 'APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']))) {
    const org = rec['ORGAO_DESTINO'];
    const situacao = rec['SITUACAO'] ?? null;
    const key = situacao === 'APOSENTADO' ? 'Aposentados' : situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA' ? 'Afastados para aposentadoria' : (['EXONERADO', 'DESISTENTE'].includes(situacao) && (org === null || org === undefined || String(org).trim() === '')) ? 'Destino desconhecido' : String(org).trim();
    const name = rec['NOME'] ?? '';
    const data = situacao === 'EXONERADO' ? rec['DATA_EXONERACAO'] : situacao === 'DESISTENTE' ? rec['DATA_NOMEACAO_SEM_EFEITO'] : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) ? rec['DATA_INATIVIDADE'] : null;
    const dataPublicacao = situacao === 'EXONERADO' ? rec['DATA_PUBLICACAO_EXONERACAO'] : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) ? rec['DATA_PUBLICACAO_INATIVIDADE'] : null;
    const area = rec['AREA'] ?? null;
    const observacao = rec['OBSERVACAO'] ?? null;
    if (!destinoDetails[key]) destinoDetails[key] = [];
    destinoDetails[key].push({ name, data, dataPublicacao, situacao, area, observacao });
  }

  // Ordena nomes dentro de cada destino por data (mais recente primeiro)
  for (const k of Object.keys(destinoDetails)) {
    destinoDetails[k].sort((a, b) => {
      const getKeyDate = (it: any) => {
        return parseBrazilDate(it.data);
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
  const contagemAreas: Record<string, number> = {};
  for (const rec of auditoresEvadidos) {
    const area = String(rec['AREA'] ?? 'Outros');
    contagemAreas[area] = (contagemAreas[area] ?? 0) + 1;
  }

  // Conta evasões por tipo (exoneração vs desistência)
  const contagemExonerado = auditoresEvadidos.filter(rec => rec['SITUACAO'] && String(rec['SITUACAO']).toUpperCase().includes('EXONERADO')).length;
  const contagemDesistencia = auditoresEvadidos.filter(rec => rec['SITUACAO'] && String(rec['SITUACAO']).toUpperCase().includes('DESISTENTE')).length;

  const typeCounts: Record<string, number> = { 'Exonerações': contagemExonerado, 'Desistências': contagemDesistencia };

  const contagemInativos = raw.filter(rec => ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(rec['SITUACAO'])).length;
  const contagemAposentado = raw.filter(rec => rec['SITUACAO'] === 'APOSENTADO').length;
  const contagemAfastamentoPreliminar = raw.filter(rec => rec['SITUACAO'] === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA').length;


  const areaFooter = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(contagemAreas).map(([area, cnt]) => (
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
  for (const rec of auditoresEvadidos) {
    const rawDate = rec['DATA_EXONERACAO'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
    monthlyMapIso.set(iso, (monthlyMapIso.get(iso) ?? 0) + 1);
    isoToLabel[iso] = displayLabel;
    if (!monthlyDetails[displayLabel]) monthlyDetails[displayLabel] = [];
    const name = rec['NOME'] ?? '';
    const area = rec['AREA'] ?? null;
    monthlyDetails[displayLabel].push({ name, date: rawDate, area });
  }
  const monthlyPoints = Array.from(monthlyMapIso.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, value]) => ({ label: isoToLabel[iso], value, tipo: 'exoneração' }));

  // Agregar aposentadorias e afastamentos por mês (MM/AAAA)
  const monthlyInactivityMapIso: Map<string, number> = new Map();
  const monthlyInactivityDetails: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};
  const auditoresInativos = raw.filter(r => ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']));
  for (const rec of auditoresInativos) {
    const rawDate = rec['DATA_INATIVIDADE'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
    monthlyInactivityMapIso.set(iso, (monthlyInactivityMapIso.get(iso) ?? 0) + 1);
    isoToLabel[iso] = displayLabel;
    if (!monthlyInactivityDetails[displayLabel]) monthlyInactivityDetails[displayLabel] = [];
    const name = rec['NOME'] ?? '';
    const area = rec['AREA'] ?? null;
    monthlyInactivityDetails[displayLabel].push({ name, date: rawDate, area });
  }
  const monthlyInactivityPoints = Array.from(monthlyInactivityMapIso.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, value]) => ({ label: isoToLabel[iso], value, tipo: 'inatividade' }));

  // Criar pontos unificados que incluem todos os meses (exonerações + inatividade)
  const allMonthlyIsos = new Set([...monthlyMapIso.keys(), ...monthlyInactivityMapIso.keys()]);
  const monthlyPointsUnified = Array.from(allMonthlyIsos)
    .sort((a, b) => a.localeCompare(b))
    .map(iso => ({ 
      label: isoToLabel[iso], 
      value: (monthlyMapIso.get(iso) ?? 0) + (monthlyInactivityMapIso.get(iso) ?? 0), 
      tipo: 'total' 
    }));

  // Última exoneração (formatada) — calculada a partir dos dados carregados (ou fallback).
  const lastExonDateFormatted = (dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO)
    ? (dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO).toLocaleDateString('pt-BR')
    : '—';

  // Lista de áreas (para filtro)
  const areas = ['TODAS', ...Array.from(new Set(auditoresEvadidos.map(r => String(r['AREA'] ?? 'Outros')))).sort()];

  // Filtrar auditores pela área selecionada
  const auditoresFiltrados = areaSelecionada === 'TODAS'
    ? raw.filter(r => ['EXONERADO', 'DESISTENTE', 'APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']))
    : raw.filter(r => ['EXONERADO', 'DESISTENTE', 'APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']) && r['AREA'] === areaSelecionada);

  // Agregação por destino para a área filtrada
  const filteredDestinationMap: Map<string, number> = new Map();
  const filteredDestinationDetails: Record<string, { name: string; data?: string | null; dataPublicacao?: string | null; dataNomeacaoSemEfeito?: string | null; situacao?: string | null; area?: string | null; observacao?: string | null }[]> = { 'Destino desconhecido': [] };
  let filteredUnknownCount = 0;
  for (const rec of auditoresFiltrados) {
    const org = rec['ORGAO_DESTINO'];
    const situacao = rec['SITUACAO'] ?? null;
    const key = situacao === 'APOSENTADO' ? 'Aposentados' : situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA' ? 'Afastados para aposentadoria' : ['EXONERADO', 'DESISTENTE'].includes(situacao) ? (org === null || org === undefined || String(org).trim() === '') ? 'Destino desconhecido' : String(org).trim() : null;
    const name = rec['NOME'] ?? '';
    const data = situacao === 'EXONERADO' ? rec['DATA_EXONERACAO'] : situacao === 'DESISTENTE' ? rec['DATA_NOMEACAO_SEM_EFEITO'] : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) ? rec['DATA_INATIVIDADE'] : null;
    const dataPublicacao = situacao === 'EXONERADO' ? rec['DATA_PUBLICACAO_EXONERACAO'] : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) ? rec['DATA_PUBLICACAO_INATIVIDADE'] : null;
    const area = rec['AREA'] ?? null;
    const observacao = rec['OBSERVACAO'] ?? null;
    filteredDestinationDetails[key] = filteredDestinationDetails[key] ?? [];
    filteredDestinationDetails[key].push({ name, data, dataPublicacao, situacao, area, observacao });
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
        const isDes = it.situacao && String(it.situacao).toUpperCase().includes('DESISTENTE');
        return parseBrazilDate(isDes ? it.dataNomeacaoSemEfeito ?? it.nomeacaoSemEfeito ?? it['DATA_NOMEACAO_SEM_EFEITO'] : it.date);
      };
      const da = getKeyDate(a);
      const db = getKeyDate(b);
      if (!da && db) return -1;
      if (da && !db) return 1;
      if (da && db) return db.getTime() - da.getTime();
      return a.name.localeCompare(b.name);
    });
  }
  const dadosDestinoEvasaoFiltrado: DadosDestinoEvasao[] = Array.from(filteredDestinationMap.entries()).map(([destino, count]) => ({ destino, count }));
  if (filteredUnknownCount > 0) dadosDestinoEvasaoFiltrado.push({ destino: 'Destino desconhecido', count: filteredUnknownCount });
  dadosDestinoEvasaoFiltrado.sort((a, b) => {
    const ordem = destino => {
      if (destino === 'Afastados para aposentadoria') return 3;
      if (destino === 'Aposentados') return 2;
      return 1; // demais
    };

    const diff = ordem(a.destino) - ordem(b.destino);
    return diff !== 0 ? diff : b.count - a.count;
  });

  // Agregação mensal filtrada para exonerações/desistências (mesma lógica de labels MMM/YYYY)
  const monthlyMapIsoFiltered: Map<string, number> = new Map();
  const isoToLabelFiltered: Record<string, string> = {};
  const monthlyDetailsFiltered: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};
  for (const rec of auditoresFiltrados.filter(r => ['EXONERADO', 'DESISTENTE'].includes(r['SITUACAO']))) {
    const rawDate = rec['DATA_EXONERACAO'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
    monthlyMapIsoFiltered.set(iso, (monthlyMapIsoFiltered.get(iso) ?? 0) + 1);
    isoToLabelFiltered[iso] = displayLabel;
    if (!monthlyDetailsFiltered[displayLabel]) monthlyDetailsFiltered[displayLabel] = [];
    const name = rec['NOME'] ?? '';
    const area = rec['AREA'] ?? null;
    monthlyDetailsFiltered[displayLabel].push({ name, date: rawDate, area });
  }
  const monthlyPointsFiltered = Array.from(monthlyMapIsoFiltered.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, value]) => ({ label: isoToLabelFiltered[iso], value, tipo: 'exoneração' }));

  // Agregação mensal filtrada para aposentadorias e afastamentos
  const monthlyInactivityMapIsoFiltered: Map<string, number> = new Map();
  const monthlyInactivityDetailsFiltered: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};
  for (const rec of auditoresFiltrados.filter(r => ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']))) {
    const rawDate = rec['DATA_INATIVIDADE'] ?? null;
    const d = parseBrazilDate(rawDate);
    if (!d) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
    monthlyInactivityMapIsoFiltered.set(iso, (monthlyInactivityMapIsoFiltered.get(iso) ?? 0) + 1);
    isoToLabelFiltered[iso] = displayLabel;
    if (!monthlyInactivityDetailsFiltered[displayLabel]) monthlyInactivityDetailsFiltered[displayLabel] = [];
    const name = rec['NOME'] ?? '';
    const area = rec['AREA'] ?? null;
    monthlyInactivityDetailsFiltered[displayLabel].push({ name, date: rawDate, area });
  }
  const monthlyInactivityPointsFiltered = Array.from(monthlyInactivityMapIsoFiltered.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, value]) => ({ label: isoToLabelFiltered[iso], value, tipo: 'inatividade' }));

  // Criar pontos unificados filtrados que incluem todos os meses (exonerações + inatividade)
  const allMonthlyIsosFiltered = new Set([...monthlyMapIsoFiltered.keys(), ...monthlyInactivityMapIsoFiltered.keys()]);
  const monthlyPointsFilteredUnified = Array.from(allMonthlyIsosFiltered)
    .sort((a, b) => a.localeCompare(b))
    .map(iso => ({ 
      label: isoToLabelFiltered[iso], 
      value: (monthlyMapIsoFiltered.get(iso) ?? 0) + (monthlyInactivityMapIsoFiltered.get(iso) ?? 0), 
      tipo: 'total' 
    }));

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
  const exonDates: Date[] = raw
    .map(r => parseBrazilDate(r['DATA_PUBLICACAO_EXONERACAO'] ?? r['DATA_PUBLICACAO_INATIVIDADE'] ?? null))
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());


  let diasRecorde = 0;
  if (exonDates.length === 0) {
    diasRecorde = 0;
  } else if (exonDates.length === 1) {
    const now = new Date();
    diasRecorde = Math.floor((now.getTime() - exonDates[0].getTime()) / (1000 * 3600 * 24));
  } else {
    for (let i = 0; i < exonDates.length - 1; i++) {
      const gap = Math.floor((exonDates[i + 1].getTime() - exonDates[i].getTime()) / (1000 * 3600 * 24));
      if (gap > diasRecorde) diasRecorde = gap;
    }
  }

  const CalendarIcon = () => <FontAwesomeIcon icon={faCalendarAlt} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const MoneyIcon = () => <FontAwesomeIcon icon={faMoneyBill} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const PeopleIcon = () => <FontAwesomeIcon icon={faUsers} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const InactiveIcon = () => <FontAwesomeIcon icon={faPersonShelter} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-red-600 mb-2 drop-shadow-lg">Observatório da Evasão</h1>
          <p className="text-lg text-amber-400 font-medium">Auditores Fiscais da Receita Estadual de Minas Gerais</p>


        </header>

        <main>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <CounterCard
              value={diasDesdeUltimaEvasao}
              label={`Dias sem perder um Auditor Fiscal`}
              icon={<CalendarIcon />}
              footer={<div><div>Por data de publicação.</div><div>Última publicação de exoneração/aposentadoria: {lastExonDateFormatted}</div> <div className="text-xs text-amber-400 mt-2">Nosso recorde é {diasRecorde} dias</div></div>}
              estaCarregando={estaCarregando}
            />
            <CounterCard
              value={contagemEvasoes}
              label="Número de evasões"
              icon={<PeopleIcon />}
              footer={areaFooter}
              estaCarregando={estaCarregando}
            />
            <CounterCard
              value={contagemInativos}
              label="Auditores transferidos para inatividade"
              icon={<InactiveIcon />}
              footer={
                <div className="space-y-2">
                  <div className="text-xs text-gray-400">Desde Janeiro de 2024</div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <div className="text-xs text-gray-400">Aposentados: <span className="font-medium text-amber-400">{contagemAposentado}</span></div>
                    <div className="text-xs text-gray-400">Afastamento preliminar: <span className="font-medium text-amber-400">{contagemAfastamentoPreliminar}</span></div>
                  </div>
                </div>
              }
              estaCarregando={estaCarregando}
            />
            {/*<CounterCard 
              value={<span title={totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' as any }).format(totalCost)}</span>} 
              label={`Custo estimado para o Estado com ${contagemEvasoes} evasões`}
              icon={<MoneyIcon />} 
              estaCarregando={estaCarregando}
            />*/}
          </section>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Evasões e Aposentadorias por mês</h3>

            <EvasionChart 
              points={monthlyPointsFiltered.length > 0 ? monthlyPointsFiltered : monthlyPoints} 
              details={monthlyDetailsFiltered && Object.keys(monthlyDetailsFiltered).length > 0 ? monthlyDetailsFiltered : monthlyDetails} 
              backgroundPoints={monthlyPointsUnified} 
              inactivityPoints={monthlyInactivityPointsFiltered}
              inactivityDetails={monthlyInactivityDetailsFiltered && Object.keys(monthlyInactivityDetailsFiltered).length > 0 ? monthlyInactivityDetailsFiltered : monthlyInactivityDetails}
              backgroundInactivityPoints={monthlyInactivityPoints}
            />
          </div>

          <div className="mb-4 flex flex-col items-center">
            <div className="text-sm text-gray-300 mb-2">Filtrar por especialidade:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {areas.map(a => (
                <button
                  key={a}
                  onClick={() => setAreaSelecionada(a)}
                  aria-pressed={areaSelecionada === a}
                  className={`px-3 py-1 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400 ${areaSelecionada === a ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
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
              A SEF/MG perdeu <span className="font-bold text-orange-400">{contagemEvasoes + contagemInativos}</span> Auditores desde Janeiro/2024.
            </p>
            <EvasionTable data={areaSelecionada === 'TODAS' ? dadosDestinoEvasao : dadosDestinoEvasaoFiltrado} details={areaSelecionada === 'TODAS' ? destinoDetails : filteredDestinationDetails} />
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
          <p>
            A quantidade de dias sem perder um Auditor Fiscal e o respectivo recorde consideram a data de publicação das exonerações.
          </p>
        </div>

        <CollaborationForm />

        <footer className="text-center mt-6 text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Observatório da Evasão. Dados extraídos do Diário Oficial de Minas Gerais e outras fontes públicas.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
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
  const [diasDesdeUltimaEvasao, setDiasDesdeUltimaEvasao] = useState<number | null>(null);

  const [raw, setRaw] = useState<any[]>([]);

  const [dataUltimaEvasao, setDataUltimaEvasao] = useState<Date | null>(null);
  const [areaSelecionada, setAreaSelecionada] = useState<string>('TODAS');
  const [estaCarregando, setEstaCarregando] = useState(true);

  // diasDesdeUltimaEvasao será calculado apenas após carregamento dos dados
  useEffect(() => {
    // Só calcular quando os dados estiverem carregados E tivermos uma data
    if (!estaCarregando && dataUltimaEvasao) {
      const today = new Date();
      const diferencaEmMs = today.getTime() - dataUltimaEvasao.getTime();
      const diferencaEmDias = Math.floor(diferencaEmMs / (1000 * 3600 * 24));
      setDiasDesdeUltimaEvasao(diferencaEmDias);
    } else if (!estaCarregando && !dataUltimaEvasao) {
      // Se não há data de evasão, usar a data de início da observação
      const today = new Date();
      const diferencaEmMs = today.getTime() - DATA_INICIO_OBSERVACAO.getTime();
      const diferencaEmDias = Math.floor(diferencaEmMs / (1000 * 3600 * 24));
      setDiasDesdeUltimaEvasao(diferencaEmDias);
    }
  }, [dataUltimaEvasao, estaCarregando]);

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

          // Dados foram carregados com sucesso

          // Determinar última data de publicação presente nos registros
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
          
          for (const rec of raw) {
            const situacao = rec['SITUACAO'];
            let dRaw: string | null = null;
            
            if (situacao === 'EXONERADO' || situacao === 'DESISTENTE') {
              dRaw = rec['DATA_PUBLICACAO_EXONERACAO'] ?? null;
            } else if (situacao === 'APOSENTADO' || situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA') {
              dRaw = rec['DATA_PUBLICACAO_INATIVIDADE'] ?? null;
            }
            
            const parsed = parseBrazilDate(dRaw);
            if (parsed && (!ultimaData || parsed.getTime() > ultimaData.getTime())) {
              ultimaData = parsed;
            }
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

            setRaw(raw);
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

  // === FUNÇÕES PURAS PARA REGRAS DE NEGÓCIO ===

  // Agrega dados por destino (regra de negócio centralizada)
  const agregarPorDestino = (registros: any[]): {
    dadosDestino: DadosDestinoEvasao[];
    detalhesDestino: Record<string, { name: string; data?: string | null; dataPublicacao?: string | null; dataNomeacaoSemEfeito?: string | null; situacao?: string | null; area?: string | null; observacao?: string | null }[]>;
  } => {
    const map = new Map<string, number>();
    const detalhes: Record<string, { name: string; data?: string | null; dataPublicacao?: string | null; dataNomeacaoSemEfeito?: string | null; situacao?: string | null; area?: string | null; observacao?: string | null }[]> = {
      'Destino desconhecido': []
    };
    let contagemDesconhecidos = 0;

    for (const rec of registros) {
      const org = rec['ORGAO_DESTINO'];
      const situacao = rec['SITUACAO'] ?? null;
      
      // Regra de negócio para determinar chave do destino
      const key = situacao === 'APOSENTADO' 
        ? 'Aposentados' 
        : situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA' 
        ? 'Afastados para aposentadoria' 
        : (['EXONERADO', 'DESISTENTE'].includes(situacao) && (org === null || org === undefined || String(org).trim() === '')) 
        ? 'Destino desconhecido' 
        : String(org).trim();

      // Contagem
      if (key === 'Destino desconhecido') {
        contagemDesconhecidos += 1;
      } else {
        const prev = map.get(key) ?? 0;
        map.set(key, prev + 1);
      }

      // Detalhes
      const name = rec['NOME'] ?? '';
      const data = situacao === 'EXONERADO' 
        ? rec['DATA_EXONERACAO'] 
        : situacao === 'DESISTENTE' 
        ? rec['DATA_NOMEACAO_SEM_EFEITO'] 
        : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) 
        ? rec['DATA_INATIVIDADE'] 
        : null;
      const dataPublicacao = situacao === 'EXONERADO' 
        ? rec['DATA_PUBLICACAO_EXONERACAO'] 
        : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) 
        ? rec['DATA_PUBLICACAO_INATIVIDADE'] 
        : null;
      const area = rec['AREA'] ?? null;
      const observacao = rec['OBSERVACAO'] ?? null;

      if (!detalhes[key]) detalhes[key] = [];
      detalhes[key].push({ name, data, dataPublicacao, situacao, area, observacao });
    }

    // Converter mapa para array
    const dadosDestino: DadosDestinoEvasao[] = Array.from(map.entries()).map(([destino, count]) => ({ destino, count }));
    if (contagemDesconhecidos > 0) {
      dadosDestino.push({ destino: 'Destino desconhecido', count: contagemDesconhecidos });
    }

    // Ordenação
    dadosDestino.sort((a, b) => {
      const ordem = destino => {
        if (destino === 'Afastados para aposentadoria') return 3;
        if (destino === 'Aposentados') return 2;
        return 1; // demais
      };
      const diff = ordem(a.destino) - ordem(b.destino);
      return diff !== 0 ? diff : b.count - a.count;
    });

    // Ordenar nomes dentro de cada destino
    for (const k of Object.keys(detalhes)) {
      detalhes[k].sort((a, b) => {
        const getKeyDate = (it: any) => parseBrazilDate(it.data);
        const da = getKeyDate(a);
        const db = getKeyDate(b);
        if (!da && db) return -1;
        if (da && !db) return 1;
        if (da && db) return db.getTime() - da.getTime();
        return a.name.localeCompare(b.name);
      });
    }

    return { dadosDestino, detalhesDestino: detalhes };
  };

  // Agrega dados por mês (regra de negócio centralizada)
  const agregarPorMes = (registros: any[], campoData: string): {
    pontosMensais: { label: string; value: number; tipo: string }[];
    detalhesMensais: Record<string, { name: string; date?: string | null; area?: string | null }[]>;
  } => {
    const monthlyMapIso: Map<string, number> = new Map();
    const isoToLabel: Record<string, string> = {};
    const detalhes: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};

    for (const rec of registros) {
      const rawDate = rec[campoData] ?? null;
      const d = parseBrazilDate(rawDate);
      if (!d) continue;
      
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      const displayLabel = `${monthShort.toUpperCase()}/${d.getFullYear()}`;
      
      monthlyMapIso.set(iso, (monthlyMapIso.get(iso) ?? 0) + 1);
      isoToLabel[iso] = displayLabel;
      
      if (!detalhes[displayLabel]) detalhes[displayLabel] = [];
      const name = rec['NOME'] ?? '';
      const area = rec['AREA'] ?? null;
      detalhes[displayLabel].push({ name, date: rawDate, area });
    }

    const pontosMensais = Array.from(monthlyMapIso.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([iso, value]) => ({ label: isoToLabel[iso], value, tipo: 'exoneração' }));

    // Ordenar detalhes por data
    for (const label of Object.keys(detalhes)) {
      detalhes[label].sort((a, b) => {
        const da = parseBrazilDate(a.date);
        const db = parseBrazilDate(b.date);
        if (da && db) return da.getTime() - db.getTime();
        if (da && !db) return -1;
        if (!da && db) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return { pontosMensais, detalhesMensais: detalhes };
  };

  // === APLICAÇÃO DAS REGRAS DE NEGÓCIO ===

  // Conjunto base de dados
  const todosRegistros = raw.filter(r => ['EXONERADO', 'DESISTENTE', 'APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']));
  const registrosEvasao = raw.filter(r => ['EXONERADO', 'DESISTENTE'].includes(r['SITUACAO']));
  const registrosInatividade = raw.filter(r => ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']));

  // Dados completos (sem filtro de área)
  const { dadosDestino: dadosDestinoEvasao, detalhesDestino: destinoDetails } = agregarPorDestino(todosRegistros);
  const { pontosMensais: monthlyPoints, detalhesMensais: monthlyDetails } = agregarPorMes(registrosEvasao, 'DATA_EXONERACAO');
  const { pontosMensais: monthlyInactivityPoints, detalhesMensais: monthlyInactivityDetails } = agregarPorMes(registrosInatividade, 'DATA_INATIVIDADE');

  // Totais e métricas básicas
  const contagemEvasoes = registrosEvasao.length;
  const contagemInativos = registrosInatividade.length;
  const contagemAposentado = raw.filter(rec => rec['SITUACAO'] === 'APOSENTADO').length;
  const contagemAfastamentoPreliminar = raw.filter(rec => rec['SITUACAO'] === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA').length;

  // Calcula custo acumulado por auditor: R$30.000 mensais desde DATA NOMEAÇÃO + 30 dias até a data da exoneração (inclusivo).
  const monthsBetweenInclusive = (start: Date, end: Date) => {
    if (end.getTime() < start.getTime()) return 0;
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    // +1 para incluir o mês inicial conforme solicitado (nomeação+30 dias até mês da exoneração inclusive)
    return years * 12 + months + 1;
  };

  const totalCost = registrosEvasao.reduce((sum, rec) => {
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

  // Conta evasões por área (para mostrar no footer do card)
  const contagemAreas: Record<string, number> = {};
  for (const rec of registrosEvasao) {
    const area = String(rec['AREA'] ?? 'Outros');
    contagemAreas[area] = (contagemAreas[area] ?? 0) + 1;
  }

  // Conta evasões por tipo (exoneração vs desistência)
  const contagemExonerado = registrosEvasao.filter(rec => rec['SITUACAO'] && String(rec['SITUACAO']).toUpperCase().includes('EXONERADO')).length;
  const contagemDesistencia = registrosEvasao.filter(rec => rec['SITUACAO'] && String(rec['SITUACAO']).toUpperCase().includes('DESISTENTE')).length;

  const typeCounts: Record<string, number> = { 'Exonerações': contagemExonerado, 'Desistências': contagemDesistencia };


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

  // Criar pontos unificados que incluem todos os meses (exonerações + inatividade)
  const createUnifiedPoints = (evasaoPoints: any[], inactivityPoints: any[]) => {
    const allIsos = new Set([
      ...evasaoPoints.map(p => {
        const [monthPart] = p.label.split('/');
        const [, yearPart] = p.label.split('/');
        const monthMap: Record<string, string> = {
          'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
          'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
        };
        return `${yearPart}-${monthMap[monthPart] ?? '01'}`;
      }),
      ...inactivityPoints.map(p => {
        const [monthPart] = p.label.split('/');
        const [, yearPart] = p.label.split('/');
        const monthMap: Record<string, string> = {
          'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
          'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
        };
        return `${yearPart}-${monthMap[monthPart] ?? '01'}`;
      })
    ]);

    const evasaoMap = new Map(evasaoPoints.map(p => [p.label, p.value]));
    const inactivityMap = new Map(inactivityPoints.map(p => [p.label, p.value]));

    return Array.from(allIsos).sort().map(iso => {
      const [year, month] = iso.split('-');
      const monthNames = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      const label = `${monthNames[parseInt(month)]}/${year}`;
      return {
        label,
        value: (evasaoMap.get(label) ?? 0) + (inactivityMap.get(label) ?? 0),
        tipo: 'total'
      };
    });
  };

  const monthlyPointsUnified = createUnifiedPoints(monthlyPoints, monthlyInactivityPoints);

  // Última exoneração (formatada) — calculada a partir dos dados carregados (ou fallback).
  const lastExonDateFormatted = (dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO)
    ? (dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO).toLocaleDateString('pt-BR')
    : '—';

  // Lista de áreas (para filtro)
  const areas = ['TODAS', ...Array.from(new Set(registrosEvasao.map(r => String(r['AREA'] ?? 'Outros')))).sort()];

  // === DADOS FILTRADOS POR ÁREA ===
  // Aplicar filtro de área ao conjunto de dados, depois aplicar as mesmas regras de negócio
  const filtrarPorArea = (registros: any[], area: string) => {
    return area === 'TODAS' ? registros : registros.filter(r => r['AREA'] === area);
  };

  const todosRegistrosFiltrados = filtrarPorArea(todosRegistros, areaSelecionada);
  const registrosEvasaoFiltrados = filtrarPorArea(registrosEvasao, areaSelecionada);
  const registrosInatividadeFiltrados = filtrarPorArea(registrosInatividade, areaSelecionada);

  // Aplicar as mesmas regras de negócio aos dados filtrados
  const { dadosDestino: dadosDestinoEvasaoFiltrado, detalhesDestino: filteredDestinationDetails } = agregarPorDestino(todosRegistrosFiltrados);
  const { pontosMensais: monthlyPointsFiltered, detalhesMensais: monthlyDetailsFiltered } = agregarPorMes(registrosEvasaoFiltrados, 'DATA_EXONERACAO');
  const { pontosMensais: monthlyInactivityPointsFiltered, detalhesMensais: monthlyInactivityDetailsFiltered } = agregarPorMes(registrosInatividadeFiltrados, 'DATA_INATIVIDADE');

  // Calcular recorde: maior intervalo (em dias) sem publicação entre datas de publicação
  const exonDates: Date[] = raw
    .map(r => {
      const situacao = r['SITUACAO'];
      if (situacao === 'EXONERADO' || situacao === 'DESISTENTE') {
        return parseBrazilDate(r['DATA_PUBLICACAO_EXONERACAO']);
      } else if (situacao === 'APOSENTADO' || situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA') {
        return parseBrazilDate(r['DATA_PUBLICACAO_INATIVIDADE']);
      }
      return null;
    })
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
              value={diasDesdeUltimaEvasao ?? 0}
              label={`Dia${(diasDesdeUltimaEvasao ?? 0) > 1 ? 's' : ''} sem perder um Auditor Fiscal`}
              icon={<CalendarIcon />}
              footer={<div><div>Por data de publicação.</div><div>Última publicação de exoneração, afastamento ou aposentadoria: {lastExonDateFormatted}</div> <div className="text-xs text-amber-400 mt-2">Nosso recorde é {diasRecorde} dias</div></div>}
              estaCarregando={estaCarregando || diasDesdeUltimaEvasao === null}
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
              points={areaSelecionada === 'TODAS' ? monthlyPoints : monthlyPointsFiltered} 
              details={areaSelecionada === 'TODAS' ? monthlyDetails : monthlyDetailsFiltered} 
              backgroundPoints={monthlyPointsUnified} 
              inactivityPoints={areaSelecionada === 'TODAS' ? monthlyInactivityPoints : monthlyInactivityPointsFiltered}
              inactivityDetails={areaSelecionada === 'TODAS' ? monthlyInactivityDetails : monthlyInactivityDetailsFiltered}
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
              Esta tabela detalha os órgãos (destinos) para os quais os Auditores se transferiram após a exoneração ou que se mantiveram, desistindo de tomar posse na SEF/MG.
              A SEF/MG perdeu <span className="font-bold text-orange-400">{contagemEvasoes + contagemInativos}</span> Auditores desde Janeiro/2024.
            </p>
            <EvasionTable 
              data={areaSelecionada === 'TODAS' ? dadosDestinoEvasao : dadosDestinoEvasaoFiltrado} 
              details={areaSelecionada === 'TODAS' ? destinoDetails : filteredDestinationDetails} 
            />
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
            Esta análise considera os Auditores aprovados no último concurso público (Edital 1/2022) e exonerações, afastamento e aposentadorias de Auditores veteranos a partir de Janeiro de 2024.
          </p>
          {/*<p>
            O cálculo do custo estimado para o Estado considera R$ 30.000 por mês, por auditor, a partir da data de nomeação + 30 dias até o mês da exoneração. Auditores sem data de exoneração ou nomeação não acumulam custo mensal neste cálculo.
          </p>*/}
          <p>
            São contabilizadas tanto exonerações quanto desistências como eventos de evasão.
          </p>
          <p>
            A quantidade de dias sem perder um Auditor Fiscal e o respectivo recorde consideram a data de publicação das exonerações, afastamentos e aposentadorias.
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
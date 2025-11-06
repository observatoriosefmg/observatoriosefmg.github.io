import React, { useState, useEffect } from 'react';
import CounterCard from './components/CounterCard';
import EvasionTable from './components/EvasionTable';
import EvasionChart from './components/EvasionChart';
import CollaborationForm from './components/CollaborationForm';
import { DATA_INICIO_OBSERVACAO } from './constants';
import { DadosDestinoEvasao } from './types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faUsers, faPersonShelter } from '@fortawesome/free-solid-svg-icons';

const App: React.FC = () => {
  const [diasDesdeUltimaEvasao, setDiasDesdeUltimaEvasao] = useState<number | null>(null);

  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);

  const [dataUltimaEvasao, setDataUltimaEvasao] = useState<Date | null>(null);
  const [areaSelecionada, setAreaSelecionada] = useState<string>('TODAS');
  const [estaCarregando, setEstaCarregando] = useState(true);

  // helper para parsear datas no formato DD/MM/YYYY
  const analisarDataBrasil = (d: any): Date | null => {
    if (!d || typeof d !== 'string') return null;
    const partes = d.split('/');
    if (partes.length !== 3) return null;
    const dia = Number(partes[0]);
    const mes = Number(partes[1]) - 1;
    const ano = Number(partes[2]);
    if (Number.isNaN(dia) || Number.isNaN(mes) || Number.isNaN(ano)) return null;
    return new Date(ano, mes, dia);
  };

  // Função para calcular diferença em dias
  const calcularDiferencaDias = (dataFim: Date, dataInicio: Date): number => {
    const diferencaEmMs = dataFim.getTime() - dataInicio.getTime();
    return Math.floor(diferencaEmMs / (1000 * 3600 * 24));
  };

  // diasDesdeUltimaEvasao será calculado apenas após carregamento dos dados
  useEffect(() => {
    if (!estaCarregando) {
      const hoje = new Date();
      const dataParaCalculo = dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO;
      const diferencaEmDias = calcularDiferencaDias(hoje, dataParaCalculo);
      setDiasDesdeUltimaEvasao(diferencaEmDias);
    }
  }, [dataUltimaEvasao, estaCarregando]);

  // Ao montar, tentamos carregar `dados.csv` de alguns caminhos possíveis e parseá-lo.
  useEffect(() => {
    let montado = true;

    const caminhos = [
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

    const analisarCsv = (texto: string) => {
      // Parser robusto para CSV com separador ';' e suporte a campos entre aspas duplas.
      const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
      if (linhas.length === 0) return [];

      const analisarLinha = (linha: string) => {
        const partes: string[] = [];
        let atual = '';
        let entreAspas = false;
        for (let i = 0; i < linha.length; i++) {
          const caractere = linha[i];
          if (caractere === '"') {
            // escape de aspas duplas "" dentro de campo
            if (entreAspas && linha[i + 1] === '"') {
              atual += '"';
              i++; // pular a segunda aspas
            } else {
              entreAspas = !entreAspas;
            }
            continue;
          }
          if (caractere === ';' && !entreAspas) {
            partes.push(atual);
            atual = '';
            continue;
          }
          atual += caractere;
        }
        partes.push(atual);
        return partes;
      };

      const linhaCabecalho = linhas[0];
      const cabecalhos = analisarLinha(linhaCabecalho).map(coluna => coluna.trim());
      const linhasProcessadas: any[] = [];

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i];
        const partes = analisarLinha(linha);
        // garantir que temos o mesmo número de colunas: preencher com '' quando faltar
        while (partes.length < cabecalhos.length) partes.push('');
        const objeto: Record<string, string> = {};
        for (let j = 0; j < cabecalhos.length; j++) {
          objeto[cabecalhos[j]] = partes[j] ? partes[j].trim() : null;
        }
        linhasProcessadas.push(objeto);
      }
      return linhasProcessadas;
    };

    async function tryLoad() {
      const criarUrlSemCache = (baseUrl: string) => baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
      for (const caminho of caminhos) {
        try {
          const resposta = await fetch(criarUrlSemCache(caminho), { cache: 'no-store', headers: { 'cache-control': 'no-cache' } as any });
          if (!resposta.ok) continue;
          let textoConteudo = await resposta.text();
          // remover BOM se presente
          textoConteudo = textoConteudo.replace(/^\uFEFF/, '');
          // log do caminho e tamanho do conteúdo para depuração
          // eslint-disable-next-line no-console
          console.debug('carregado', caminho, 'tamanho', textoConteudo.length);
          const dadosParsed = analisarCsv(textoConteudo);

          if ((!Array.isArray(dadosParsed) || dadosParsed.length === 0) && textoConteudo.trim().length > 0) {
            // se parse devolveu vazio, registrar um trecho do texto para ajudar depurar
            // eslint-disable-next-line no-console
            console.warn('parseCsv retornou array vazio para', caminho, 'trecho:', textoConteudo.slice(0, 400));
          }
          if (!Array.isArray(dadosParsed) || dadosParsed.length === 0) {
            console.warn('dados.csv não tem formato esperado (array) em', caminho);
            continue;
          }

          // Dados foram carregados com sucesso

          // Determinar última data de publicação presente nos registros
          let ultimaData: Date | null = null;
          
          for (const rec of dadosParsed) {
            const situacao = rec['SITUACAO'];
            let dRaw: string | null = null;
            
            if (situacao === 'EXONERADO' || situacao === 'DESISTENTE') {
              dRaw = rec['DATA_PUBLICACAO_EXONERACAO'] ?? null;
            } else if (situacao === 'APOSENTADO' || situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA') {
              dRaw = rec['DATA_PUBLICACAO_INATIVIDADE'] ?? null;
            }
            
            const dataAnalisada = analisarDataBrasil(dRaw);
            if (dataAnalisada && (!ultimaData || dataAnalisada.getTime() > ultimaData.getTime())) {
              ultimaData = dataAnalisada;
            }
          }

          if (montado) {
            // Expor os dados lidos para depuração no console do navegador
            try {
              (window as any).__TODOS_RAW = dadosParsed;
            } catch (e) {
              // ignorar se não puder escrever em window
            }


            setDadosBrutos(dadosParsed);
            setDataUltimaEvasao(ultimaData ?? null);
            setEstaCarregando(false);
          }

          return;
        } catch (erro) {
          // tentar próximo caminho
          // eslint-disable-next-line no-console
          console.debug('Falha ao carregar', caminho, erro);
        }
      }

      // nenhum caminho funcionou — manter dados embutidos
      // eslint-disable-next-line no-console
      console.warn('Não foi possível carregar dados.csv; usando dados internos.');
      setEstaCarregando(false);
    }

    tryLoad();

    return () => { montado = false; };
  }, []);

  // === FUNÇÕES PURAS PARA REGRAS DE NEGÓCIO ===

  // Agrega dados por destino (regra de negócio centralizada)
  const agregarPorDestino = (registros: any[]): {
    dadosDestino: DadosDestinoEvasao[];
    detalhesDestino: Record<string, { name: string; data?: string | null; dataPublicacao?: string | null; dataNomeacaoSemEfeito?: string | null; situacao?: string | null; area?: string | null; observacao?: string | null }[]>;
  } => {
    const mapa = new Map<string, number>();
    const detalhes: Record<string, { name: string; data?: string | null; dataPublicacao?: string | null; dataNomeacaoSemEfeito?: string | null; situacao?: string | null; area?: string | null; observacao?: string | null }[]> = {
      'Destino desconhecido': []
    };
    let contagemDesconhecidos = 0;

    for (const registro of registros) {
      const orgao = registro['ORGAO_DESTINO'];
      const situacao = registro['SITUACAO'] ?? null;
      
      // Regra de negócio para determinar chave do destino
      const chave = situacao === 'APOSENTADO' 
        ? 'Aposentados' 
        : situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA' 
        ? 'Afastados para aposentadoria' 
        : (['EXONERADO', 'DESISTENTE'].includes(situacao) && (orgao === null || orgao === undefined || String(orgao).trim() === '')) 
        ? 'Destino desconhecido' 
        : String(orgao).trim();

      // Contagem
      if (chave === 'Destino desconhecido') {
        contagemDesconhecidos += 1;
      } else {
        const anterior = mapa.get(chave) ?? 0;
        mapa.set(chave, anterior + 1);
      }

      // Detalhes
      const nome = registro['NOME'] ?? '';
      const data = situacao === 'EXONERADO' 
        ? registro['DATA_EXONERACAO'] 
        : situacao === 'DESISTENTE' 
        ? registro['DATA_NOMEACAO_SEM_EFEITO'] 
        : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) 
        ? registro['DATA_INATIVIDADE'] 
        : null;
      const dataPublicacao = situacao === 'EXONERADO' 
        ? registro['DATA_PUBLICACAO_EXONERACAO'] 
        : ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(situacao) 
        ? registro['DATA_PUBLICACAO_INATIVIDADE'] 
        : null;
      const area = registro['AREA'] ?? null;
      const observacao = registro['OBSERVACAO'] ?? null;

      if (!detalhes[chave]) detalhes[chave] = [];
      detalhes[chave].push({ name: nome, data, dataPublicacao, situacao, area, observacao });
    }

    // Converter mapa para array
    const dadosDestino: DadosDestinoEvasao[] = Array.from(mapa.entries()).map(([destino, quantidade]) => ({ destino, count: quantidade }));
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
    for (const chave of Object.keys(detalhes)) {
      detalhes[chave].sort((a, b) => {
        const obterDataChave = (it: any) => analisarDataBrasil(it.data);
        const da = obterDataChave(a);
        const db = obterDataChave(b);
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
    const mapaMensalIso: Map<string, number> = new Map();
    const isoParaRotulo: Record<string, string> = {};
    const detalhes: Record<string, { name: string; date?: string | null; area?: string | null }[]> = {};

    for (const registro of registros) {
      const dataBruta = registro[campoData] ?? null;
      const dataFormatada = analisarDataBrasil(dataBruta);
      if (!dataFormatada) continue;
      
      const codigoIso = `${dataFormatada.getFullYear()}-${String(dataFormatada.getMonth() + 1).padStart(2, '0')}`;
      const mesAbreviado = dataFormatada.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      const rotuloExibicao = `${mesAbreviado.toUpperCase()}/${dataFormatada.getFullYear()}`;
      
      mapaMensalIso.set(codigoIso, (mapaMensalIso.get(codigoIso) ?? 0) + 1);
      isoParaRotulo[codigoIso] = rotuloExibicao;
      
      if (!detalhes[rotuloExibicao]) detalhes[rotuloExibicao] = [];
      const nome = registro['NOME'] ?? '';
      const area = registro['AREA'] ?? null;
      detalhes[rotuloExibicao].push({ name: nome, date: dataBruta, area });
    }

    const pontosMensais = Array.from(mapaMensalIso.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([codigoIso, valor]) => ({ label: isoParaRotulo[codigoIso], value: valor, tipo: 'exoneração' }));

    // Ordenar detalhes por data
    for (const rotulo of Object.keys(detalhes)) {
      detalhes[rotulo].sort((a, b) => {
        const da = analisarDataBrasil(a.date);
        const db = analisarDataBrasil(b.date);
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
  const todosRegistros = dadosBrutos.filter(r => ['EXONERADO', 'DESISTENTE', 'APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']));
  const registrosEvasao = dadosBrutos.filter(r => ['EXONERADO', 'DESISTENTE'].includes(r['SITUACAO']));
  const registrosInatividade = dadosBrutos.filter(r => ['APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'].includes(r['SITUACAO']));

  // Dados completos (sem filtro de área)
  const { dadosDestino: dadosDestinoEvasao, detalhesDestino: detalhesDestino } = agregarPorDestino(todosRegistros);
  const { pontosMensais: pontosMensais, detalhesMensais: detalhesMensais } = agregarPorMes(registrosEvasao, 'DATA_EXONERACAO');
  const { pontosMensais: pontosMensaisInatividade, detalhesMensais: detalhesMensaisInatividade } = agregarPorMes(registrosInatividade, 'DATA_INATIVIDADE');

  // Totais e métricas básicas
  const contagemEvasoes = registrosEvasao.length;
  const contagemInativos = registrosInatividade.length;
  // Contagem otimizada de aposentados e afastamentos
  const { contagemAposentado, contagemAfastamentoPreliminar } = dadosBrutos.reduce((acumulador, registro) => {
    const situacao = registro['SITUACAO'];
    if (situacao === 'APOSENTADO') {
      acumulador.contagemAposentado++;
    } else if (situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA') {
      acumulador.contagemAfastamentoPreliminar++;
    }
    return acumulador;
  }, { contagemAposentado: 0, contagemAfastamentoPreliminar: 0 });



  // Conta evasões por área (para mostrar no footer do card)
  const contagemAreas: Record<string, number> = {};
    for (const registro of registrosEvasao) {
      const area = String(registro['AREA'] ?? 'Outros');
      contagemAreas[area] = (contagemAreas[area] ?? 0) + 1;
    }  // Conta evasões por tipo (exoneração vs desistência) - otimizado
  const contagemTipos = registrosEvasao.reduce((acumulador, registro) => {
    const situacao = registro['SITUACAO'];
    if (situacao === 'EXONERADO') {
      acumulador['Exonerações'] = (acumulador['Exonerações'] || 0) + 1;
    } else if (situacao === 'DESISTENTE') {
      acumulador['Desistências'] = (acumulador['Desistências'] || 0) + 1;
    }
    return acumulador;
  }, {} as Record<string, number>);


  const areaFooter = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(contagemAreas).map(([area, quantidade]) => (
          <div key={area} className="text-xs text-gray-400">
            {area}: <span className="font-medium text-amber-400">{quantidade}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 justify-center border-t border-gray-700 pt-2">
        {Object.entries(contagemTipos).map(([tipo, quantidade]) => (
          <div key={tipo} className="text-xs text-gray-400">
            {tipo}: <span className="font-medium text-amber-400">{quantidade}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Criar pontos unificados que incluem todos os meses (exonerações + inatividade)
  const criarPontosUnificados = (pontosEvasao: any[], pontosInatividade: any[]) => {
    const mapaMeses: Record<string, string> = {
      'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
      'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
    };

    const analisarPontoParaIso = (ponto: any) => {
      const [parteMes, parteAno] = ponto.label.split('/');
      return `${parteAno}-${mapaMeses[parteMes] ?? '01'}`;
    };

    const todosIsos = new Set([
      ...pontosEvasao.map(analisarPontoParaIso),
      ...pontosInatividade.map(analisarPontoParaIso)
    ]);

    const mapaEvasao = new Map(pontosEvasao.map(p => [p.label, p.value]));
    const mapaInatividade = new Map(pontosInatividade.map(p => [p.label, p.value]));

    return Array.from(todosIsos).sort().map(codigoIso => {
      const [ano, mes] = codigoIso.split('-');
      const nomesMeses = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      const rotulo = `${nomesMeses[parseInt(mes)]}/${ano}`;
      return {
        label: rotulo,
        value: (mapaEvasao.get(rotulo) ?? 0) + (mapaInatividade.get(rotulo) ?? 0),
        tipo: 'total'
      };
    });
  };

  const pontosMensaisUnificados = criarPontosUnificados(pontosMensais, pontosMensaisInatividade);

  // Última exoneração (formatada) — calculada a partir dos dados carregados (ou fallback).
  const dataUltimaExoneracaoFormatada = (dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO)
    ? (dataUltimaEvasao ?? DATA_INICIO_OBSERVACAO).toLocaleDateString('pt-BR')
    : '—';

  // Lista de áreas (para filtro)
  const areas = ['TODAS', ...Array.from(new Set(registrosEvasao.map(registro => String(registro['AREA'] ?? 'Outros')))).sort()];

  // === DADOS FILTRADOS POR ÁREA ===
  // Aplicar filtro de área ao conjunto de dados, depois aplicar as mesmas regras de negócio
  const filtrarPorArea = (registros: any[], area: string) => {
    return area === 'TODAS' ? registros : registros.filter(registro => registro['AREA'] === area);
  };

  const todosRegistrosFiltrados = filtrarPorArea(todosRegistros, areaSelecionada);
  const registrosEvasaoFiltrados = filtrarPorArea(registrosEvasao, areaSelecionada);
  const registrosInatividadeFiltrados = filtrarPorArea(registrosInatividade, areaSelecionada);

  // Aplicar as mesmas regras de negócio aos dados filtrados
  const { dadosDestino: dadosDestinoEvasaoFiltrado, detalhesDestino: detalhesDestinoFiltrados } = agregarPorDestino(todosRegistrosFiltrados);
  const { pontosMensais: pontosMensaisFiltrados, detalhesMensais: detalhesMensaisFiltrados } = agregarPorMes(registrosEvasaoFiltrados, 'DATA_EXONERACAO');
  const { pontosMensais: pontosMensaisInatividadeFiltrados, detalhesMensais: detalhesMensaisInatividadeFiltrados } = agregarPorMes(registrosInatividadeFiltrados, 'DATA_INATIVIDADE');

  // Calcular recorde: maior intervalo (em dias) sem publicação entre datas de publicação
  const datasExoneracao: Date[] = dadosBrutos
    .map(r => {
      const situacao = r['SITUACAO'];
      if (situacao === 'EXONERADO' || situacao === 'DESISTENTE') {
        return analisarDataBrasil(r['DATA_PUBLICACAO_EXONERACAO']);
      } else if (situacao === 'APOSENTADO' || situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA') {
        return analisarDataBrasil(r['DATA_PUBLICACAO_INATIVIDADE']);
      }
      return null;
    })
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());


  let diasRecorde = 0;
  if (datasExoneracao.length === 0) {
    diasRecorde = 0;
  } else if (datasExoneracao.length === 1) {
    const agora = new Date();
    diasRecorde = Math.floor((agora.getTime() - datasExoneracao[0].getTime()) / (1000 * 3600 * 24));
  } else {
    for (let i = 0; i < datasExoneracao.length - 1; i++) {
      const intervalo = Math.floor((datasExoneracao[i + 1].getTime() - datasExoneracao[i].getTime()) / (1000 * 3600 * 24));
      if (intervalo > diasRecorde) diasRecorde = intervalo;
    }
  }

  const IconeCalendario = () => <FontAwesomeIcon icon={faCalendarAlt} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const IconePessoas = () => <FontAwesomeIcon icon={faUsers} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  const IconeInativo = () => <FontAwesomeIcon icon={faPersonShelter} className="h-10 w-10 md:h-12 md:w-12 text-red-400" />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-red-600 mb-2 drop-shadow-lg">OBSERVATÓRIO DA EVASÃO</h1>
          <p className="text-lg text-amber-400 font-medium">Auditores Fiscais da Receita Estadual de Minas Gerais</p>


        </header>

        <main>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <CounterCard
              value={diasDesdeUltimaEvasao ?? 0}
              label={`Dia${(diasDesdeUltimaEvasao ?? 0) > 1 ? 's' : ''} sem perder um Auditor Fiscal`}
              icon={<IconeCalendario />}
              footer={<div><div>Por data de publicação.</div><div>Última publicação de exoneração, afastamento ou aposentadoria: {dataUltimaExoneracaoFormatada}</div> <div className="text-xs text-amber-400 mt-2">Nosso recorde é {diasRecorde} dias</div></div>}
              estaCarregando={estaCarregando || diasDesdeUltimaEvasao === null}
            />
            <CounterCard
              value={contagemEvasoes}
              label="Número de evasões"
              icon={<IconePessoas />}
              footer={areaFooter}
              estaCarregando={estaCarregando}
            />
            <CounterCard
              value={contagemInativos}
              label="Auditores transferidos para inatividade"
              icon={<IconeInativo />}
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

          </section>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Evasões e Aposentadorias por mês</h3>

            <EvasionChart 
              points={areaSelecionada === 'TODAS' ? pontosMensais : pontosMensaisFiltrados} 
              details={areaSelecionada === 'TODAS' ? detalhesMensais : detalhesMensaisFiltrados} 
              backgroundPoints={pontosMensaisUnificados} 
              inactivityPoints={areaSelecionada === 'TODAS' ? pontosMensaisInatividade : pontosMensaisInatividadeFiltrados}
              inactivityDetails={areaSelecionada === 'TODAS' ? detalhesMensaisInatividade : detalhesMensaisInatividadeFiltrados}
              backgroundInactivityPoints={pontosMensaisInatividade}
            />
          </div>

          <div className="mb-4 flex flex-col items-center">
            <div className="text-sm text-gray-300 mb-2">Filtrar por especialidade:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {areas.map(area => (
                <button
                  key={area}
                  onClick={() => setAreaSelecionada(area)}
                  aria-pressed={areaSelecionada === area}
                  className={`px-3 py-1 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400 ${areaSelecionada === area ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
                >
                  {area}
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
              details={areaSelecionada === 'TODAS' ? detalhesDestino : detalhesDestinoFiltrados} 
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
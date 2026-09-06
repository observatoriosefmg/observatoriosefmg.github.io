// Malha oficial do IBGE, mantida localmente para não depender da API em cada acesso.
const __mapaURL = new URL('br-estados.geojson', document.currentScript.src);
let __mapaChart = null;
let __mapaCarregamento = null;
let __mapaVersao = 0;
const __mapaUFs = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL',
  28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
  41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};

// Interpola valores entre âncoras de percentis; empates compartilham a mesma cor.
function criarEscalaMapa(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const ancoras = [];
  const pontos = [];
  [0, 0.1, 0.3, 0.7, 0.9, 1].forEach((percentil, indice) => {
    const posicao = (ordenados.length - 1) * percentil;
    const inferior = Math.floor(posicao);
    const valor = ordenados.length ? ordenados[inferior] + (ordenados[Math.ceil(posicao)] - ordenados[inferior]) * (posicao - inferior) : 0;
    pontos.push({percentil: percentil * 100, valor, cor: indice / 5});
    const anterior = ancoras[ancoras.length - 1];
    if (anterior && anterior.valor === valor) {
      anterior.fim = indice / 5;
      anterior.cor = (anterior.inicio + anterior.fim) / 2;
    } else ancoras.push({valor, inicio: indice / 5, fim: indice / 5, cor: indice / 5});
  });
  function interpolar(valor, entrada, saida) {
    if (valor <= ancoras[0][entrada]) return ancoras[0][saida];
    for (let i = 1; i < ancoras.length; i++) {
      const a = ancoras[i - 1], b = ancoras[i];
      if (valor <= b[entrada]) return a[saida] + (b[saida] - a[saida]) * (valor - a[entrada]) / (b[entrada] - a[entrada]);
    }
    return ancoras[ancoras.length - 1][saida];
  }
  return {pontos, normalizar: valor => interpolar(valor, 'valor', 'cor'), valor: cor => interpolar(cor, 'cor', 'valor')};
}

function estiloRotuloMapa(zoom) {
  const tamanho = 10 * Math.sqrt(zoom);
  return {fontSize: tamanho, lineHeight: tamanho * 1.2,
    rich: {metrica: {fontSize: tamanho * 0.8, lineHeight: tamanho, color: '#102a43', textBorderColor: '#fff', textBorderWidth: 2}}};
}

function ajustarEnquadramentoMapa() {
  if (!__mapaChart) return;
  const serie = __mapaChart.getModel().getSeriesByIndex(0);
  const geo = serie.coordinateSystem;
  const limites = geo.getBoundingRect().clone();
  limites.applyTransform(geo.transform);
  const area = geo.getViewRect();
  // Mantém as bordas da malha próximas às da área útil, com uma pequena folga.
  function deslocamento(inicio, tamanho, alvo, extensao) {
    const folga = extensao * 0.08;
    if (tamanho <= extensao) return alvo + extensao / 2 - inicio - tamanho / 2;
    if (inicio > alvo + folga) return alvo + folga - inicio;
    if (inicio + tamanho < alvo + extensao - folga) return alvo + extensao - folga - inicio - tamanho;
    return 0;
  }
  const dx = deslocamento(limites.x, limites.width, area.x, area.width);
  const dy = deslocamento(limites.y, limites.height, area.y, area.height);
  const ajuste = {label: estiloRotuloMapa(geo.getZoom())};
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    const centro = geo.dataToPoint(geo.getCenter());
    ajuste.center = geo.pointToData([centro[0] - dx, centro[1] - dy]);
  }
  __mapaChart.setOption({series: [ajuste]}, {silent: true});
}

async function renderizarMapa(itens, opcoes, tooltipBarras) {
  const versao = ++__mapaVersao;
  const status = document.getElementById('mapa-status');
  try {
    if (!__mapaCarregamento) {
      __mapaCarregamento = fetch(__mapaURL).then(resposta => {
        if (!resposta.ok) throw new Error('Falha ao carregar a malha');
        return resposta.json();
      }).then(malha => {
        if (malha.features?.length !== 27) throw new Error('Malha incompleta');
        malha.features.forEach(feature => {
          feature.properties.name = __mapaUFs[feature.properties.codarea];
          if (!feature.properties.name) throw new Error('UF desconhecida');
        });
        echarts.registerMap('brasil-ibge', malha);
      }).catch(erro => {
        __mapaCarregamento = null;
        throw erro;
      });
    }
    await __mapaCarregamento;
    if (versao !== __mapaVersao || __vista !== 'mapa') return;
    const dados = itens.filter(item => item.uf && Number.isFinite(item.valor)).map(item => ({
      name: item.uf, value: item.valor, _item: item
    }));
    const valores = dados.map(item => item.value);
    const escala = criarEscalaMapa(valores);
    dados.forEach(item => { item.value = [item.value, escala.normalizar(item.value)]; });
    const metrica = opcoes.metricaGrafico || 'mensal';
    status.textContent = ({mensal: 'Remuneração líquida mensal', hora: 'Remuneração líquida por hora', acumulado: 'Remuneração líquida acumulada'})[metrica];
    if (!dados.length) status.textContent += ' — sem dados disponíveis';
    const resumoMedia = document.createElement('span');
    resumoMedia.id = 'mapa-media-nacional';
    resumoMedia.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:12px;padding:16px 20px;border-radius:10px;background:#1f2a44;color:#fff;';
    const rotuloMedia = document.createElement('span');
    rotuloMedia.style.cssText = 'font-size:0.9rem;font-weight:600;';
    rotuloMedia.textContent = 'Média nacional';
    const destaqueMedia = document.createElement('strong');
    destaqueMedia.style.cssText = 'font-size:clamp(1.5rem, 4vw, 2rem);line-height:1.2;font-variant-numeric:tabular-nums;';
    const media = valores.length ? valores.reduce((soma, valor) => soma + valor, 0) / valores.length : null;
    destaqueMedia.textContent = media === null ? 'sem dados disponíveis' : formatarMoeda(media) + (metrica === 'hora' ? '/h' : '');
    resumoMedia.append(rotuloMedia, destaqueMedia);
    status.append(resumoMedia);
    if (!__mapaChart) {
      __mapaChart = echarts.init(document.getElementById('mapa-echart'));
      __mapaChart.on('georoam', ajustarEnquadramentoMapa);
    }
    // Preserva a área explorada quando os filtros ou o ano mudam.
    const enquadramento = __mapaChart.getOption()?.series?.[0] || {};
    const cores = ['#dc2626', '#f97316', '#facc15', '#a3e635', '#4d9f38', '#15803d'];
    let legenda = document.getElementById('mapa-legenda');
    if (!legenda) {
      legenda = document.createElement('div');
      legenda.id = 'mapa-legenda';
      legenda.style.cssText = 'container-type:inline-size;min-width:0;margin:0 0 20px;padding:8px 0;';
      document.getElementById('mapa-echart').after(legenda);
    }
    const estiloLegenda = document.createElement('style');
    estiloLegenda.textContent = `
      #mapa-legenda .mapa-faixa { position:relative;height:56px;margin:0 64px; }
      #mapa-legenda .mapa-valor-compacto { display:none; }
      @container (max-width:720px) {
        #mapa-legenda .mapa-faixa { height:76px;margin:0 36px; }
        #mapa-legenda .mapa-marca { font-size:10px !important; }
        #mapa-legenda .mapa-marca:nth-child(odd) > :first-child { height:31px !important; }
        #mapa-legenda .mapa-valor-completo { display:none; }
        #mapa-legenda .mapa-valor-compacto { display:block; }
      }
    `;
    const formatoCompacto = new Intl.NumberFormat('pt-BR', {
      notation: 'compact', maximumFractionDigits: 1
    });
    const faixa = document.createElement('div');
    faixa.className = 'mapa-faixa';
    const gradiente = document.createElement('div');
    gradiente.style.cssText = `height:14px;border-radius:4px;background:linear-gradient(to right, ${cores.join(',')});`;
    faixa.append(gradiente);
    escala.pontos.forEach(ponto => {
      const marca = document.createElement('span');
      marca.className = 'mapa-marca';
      marca.style.cssText = `position:absolute;left:${ponto.cor * 100}%;top:14px;transform:translateX(-50%);text-align:center;white-space:nowrap;font-size:11px;line-height:1.5;`;
      const traco = document.createElement('span');
      traco.style.cssText = 'display:block;width:1px;height:7px;background:currentColor;margin:0 auto 4px;';
      const valor = document.createElement('span');
      valor.className = 'mapa-valor-completo';
      valor.textContent = valores.length ? formatarMoeda(ponto.valor) + (metrica === 'hora' ? '/h' : '') : '—';
      const compacto = document.createElement('span');
      compacto.className = 'mapa-valor-compacto';
      compacto.textContent = valores.length ? 'R$' + formatoCompacto.format(ponto.valor) + (metrica === 'hora' ? '/h' : '') : '—';
      marca.title = valor.textContent;
      marca.setAttribute('aria-label', valor.textContent);
      marca.append(traco, valor, compacto);
      faixa.append(marca);
    });
    legenda.replaceChildren(estiloLegenda, faixa);
    __mapaChart.setOption({
      animationDurationUpdate: 250,
      visualMap: {
        type: 'continuous', min: 0, max: 1, dimension: 1,
        show: false,
        inRange: {color: cores},
        text: [formatarMoeda(escala.valor(1)), formatarMoeda(escala.valor(0))],
        formatter: valor => formatarMoeda(escala.valor(Number(valor))),
        textStyle: {color: '#344054', fontSize: 11}, itemWidth: 14, itemHeight: 150
      },
      series: [{
        type: 'map', map: 'brasil-ibge', roam: true,
        // Evita o achatamento horizontal padrão (0.75) e preserva a proporção no encaixe.
        aspectScale: 1,
        layoutCenter: ['50%', '50%'], layoutSize: '95%',
        scaleLimit: {min: 1, max: 8},
        zoom: enquadramento.zoom || 1, center: enquadramento.center || null,
        selectedMode: false,
        label: {show: true, color: '#102a43', ...estiloRotuloMapa(enquadramento.zoom || 1), textBorderColor: '#fff', textBorderWidth: 2,
          formatter: params => `${params.name}\n{metrica|${params.data?._item ? formatarMoeda(params.data._item.valor) + (metrica === 'hora' ? '/h' : '') : '—'}}`},
        itemStyle: {areaColor: '#e5e7eb', borderColor: '#fff', borderWidth: 1},
        emphasis: {label: {color: '#111827'}, itemStyle: {borderColor: '#111827', borderWidth: 2}},
        data: dados
      }],
      tooltip: {
        ...tooltipBarras,
        triggerOn: 'mousemove|click',
        position(point, params, dom, rect, size) {
          const caixa = document.getElementById('mapa-echart').getBoundingClientRect();
          const [largura, altura] = size.contentSize;
          let x = caixa.left + point[0] + 16;
          if (x + largura > window.innerWidth - 8) x = caixa.left + point[0] - largura - 16;
          const y = caixa.top + point[1] - altura / 2;
          return [Math.max(8, Math.min(x, window.innerWidth - largura - 8)) - caixa.left,
            Math.max(8, Math.min(y, window.innerHeight - altura - 8)) - caixa.top];
        },
        formatter(params) {
          if (tooltipBloqueadoNoModal()) return '';
          if (!params.data?._item) {
            __barrasTooltipAtual = null;
            return `<div style="padding:12px">${htmlEsc(params.name)}: sem dados disponíveis.</div>`;
          }
          // Mantém o holerite responsivo dos gráficos, inclusive para a métrica acumulada.
          const item = params.data._item;
          const resumo = ehTelaPequena();
          __barrasTooltipAtual = resumo ? {linha: item.linha, estado: item.estado, opcoes: {...opcoes}} : null;
          const conteudo = resumo ? montarResumoTooltip(item.linha, item.estado, opcoes) : renderHolerite(item.linha, item.estado, opcoes);
          const acumulado = metrica === 'acumulado' ? `<div style="padding:12px 14px">Líquido acumulado: <strong>${formatarMoeda(item.valorAcumulado)}</strong></div>` : '';
          return `<div style="width:min(${resumo ? 340 : 680}px, calc(100vw - 24px));${resumo ? 'padding:12px 14px;' : ''}white-space:normal;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:0.78rem;line-height:normal;">${acumulado}${conteudo}</div>`;
        }
      }
    }, true);
    __mapaChart.resize();
    ajustarEnquadramentoMapa();
    document.getElementById('mapa-restaurar').onclick = () => {
      __mapaChart.dispatchAction({type: 'hideTip'});
      __mapaChart.setOption({series: [{zoom: 1, center: null, label: estiloRotuloMapa(1)}]});
    };
    const seletor = document.getElementById('mapa-estado');
    const selecionado = seletor.value;
    seletor.innerHTML = '<option value="">Selecione um estado</option>' + [...dados].sort((a,b) => a.name.localeCompare(b.name)).map(dado => `<option value="${dado.name}">${htmlEsc(dado._item.estado.nome)} (${dado.name})</option>`).join('');
    seletor.value = selecionado;
    seletor.onchange = () => {
      __mapaChart.dispatchAction({type: 'hideTip'});
      const dataIndex = __mapaChart.getModel().getSeriesByIndex(0).getData().indexOfName(seletor.value);
      if (dataIndex >= 0) __mapaChart.dispatchAction({type: 'showTip', seriesIndex: 0, dataIndex});
    };
  } catch (erro) {
    if (versao !== __mapaVersao || __vista !== 'mapa') return;
    status.replaceChildren(document.createTextNode('Não foi possível carregar o mapa. '));
    const tentar = document.createElement('button');
    tentar.textContent = 'Tentar novamente';
    tentar.onclick = () => renderizar();
    status.append(tentar);
    console.error(erro);
  }
}

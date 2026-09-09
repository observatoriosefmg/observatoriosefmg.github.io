// Malha oficial do IBGE, mantida localmente para não depender da API em cada acesso.
const __mapaURL = new URL('br-estados.geojson', document.currentScript.src);
let __mapaLeaflet = null;
let __mapaCamada = null;
let __mapaBoundsInicial = null;
let __mapaCarregamento = null;
let __mapaVersao = 0;
let __mapaDetalhamentoAtual = null;
let __mapaDetalhamentoFixado = false;
let __mapaPopupAtual = null;
let __mapaAvisoZoom = null;
let __mapaAvisoZoomTimer = null;
const __mapaUFs = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL',
  28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
  41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};
const __mapaCores = ['#dc2626', '#f97316', '#facc15', '#a3e635', '#4d9f38', '#15803d'];

function criarEscalaMapa(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const ancoras = [];
  const pontos = [];
  [0, 0.1, 0.3, 0.7, 0.9, 1].forEach((percentil, indice) => {
    const posicao = (ordenados.length - 1) * percentil;
    const inferior = Math.floor(posicao);
    const valor = ordenados.length
      ? ordenados[inferior] + (ordenados[Math.ceil(posicao)] - ordenados[inferior]) * (posicao - inferior)
      : 0;
    pontos.push({percentil: percentil * 100, valor, cor: indice / 5});
    const anterior = ancoras[ancoras.length - 1];
    if (anterior && anterior.valor === valor) {
      anterior.fim = indice / 5;
      anterior.cor = (anterior.inicio + anterior.fim) / 2;
    } else {
      ancoras.push({valor, inicio: indice / 5, fim: indice / 5, cor: indice / 5});
    }
  });
  function interpolar(valor, entrada, saida) {
    if (valor <= ancoras[0][entrada]) return ancoras[0][saida];
    for (let i = 1; i < ancoras.length; i++) {
      const a = ancoras[i - 1], b = ancoras[i];
      if (valor <= b[entrada]) {
        return a[saida] + (b[saida] - a[saida]) * (valor - a[entrada]) / (b[entrada] - a[entrada]);
      }
    }
    return ancoras[ancoras.length - 1][saida];
  }
  return {
    pontos,
    normalizar: valor => interpolar(valor, 'valor', 'cor'),
    valor: cor => interpolar(cor, 'cor', 'valor')
  };
}

function misturarCores(corA, corB, proporcao) {
  const rgb = cor => {
    const valor = cor.replace('#', '');
    return [0, 2, 4].map(indice => parseInt(valor.slice(indice, indice + 2), 16));
  };
  const a = rgb(corA), b = rgb(corB);
  return '#' + a.map((valor, indice) => Math.round(valor + (b[indice] - valor) * proporcao).toString(16).padStart(2, '0')).join('');
}

function corMapa(valor, escala) {
  const posicao = Math.max(0, Math.min(1, escala.normalizar(valor))) * (__mapaCores.length - 1);
  const indice = Math.min(__mapaCores.length - 2, Math.floor(posicao));
  return misturarCores(__mapaCores[indice], __mapaCores[indice + 1], posicao - indice);
}

function montarConteudoTooltipMapa(item, opcoes, metrica) {
  const resumo = ehTelaPequena();
  const conteudo = resumo
    ? montarResumoTooltip(item.linha, item.estado, opcoes)
    : renderHolerite(item.linha, item.estado, opcoes);
  const acumulado = metrica === 'acumulado'
    ? `<div style="padding:12px 14px">Líquido acumulado: <strong>${formatarMoeda(item.valorAcumulado)}</strong></div>`
    : '';
  return `<div style="width:min(${resumo ? 340 : 680}px, calc(100vw - 24px));${resumo ? 'padding:12px 14px;' : ''}white-space:normal;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:0.78rem;line-height:normal;">${acumulado}${conteudo}</div>`;
}

function atualizarDetalhamentoMapa(item, nomeEstado = '') {
  const painel = document.getElementById('mapa-detalhamento');
  if (!painel) return;
  if (!item) {
    painel.innerHTML = nomeEstado
      ? `<div style="padding:12px">${htmlEsc(nomeEstado)}: sem dados disponíveis.</div>`
      : '<div class="mapa-detalhamento-vazio">Passe o mouse sobre um estado para consultar o holerite.</div>';
    return;
  }
  const {opcoes, metrica} = __mapaDetalhamentoAtual || {};
  painel.innerHTML = montarConteudoTooltipMapa(item, opcoes || {}, metrica);
}

function ocultarTooltipMapa() {
  if (__mapaLeaflet) __mapaLeaflet.closePopup();
  __mapaPopupAtual = null;
}

function redimensionarMapa() {
  if (__mapaLeaflet) __mapaLeaflet.invalidateSize({pan: false});
}

function mapaUsaDetalhamentoLateral() {
  return window.matchMedia('(min-width: 1500px)').matches;
}

function configurarZoomMapa() {
  const container = __mapaLeaflet?.getContainer();
  if (!container || __mapaAvisoZoom) return;
  __mapaAvisoZoom = document.createElement('div');
  __mapaAvisoZoom.className = 'mapa-aviso-zoom';
  __mapaAvisoZoom.setAttribute('role', 'status');
  __mapaAvisoZoom.textContent = 'Use Ctrl + rolagem para ampliar o mapa';
  container.append(__mapaAvisoZoom);

  container.addEventListener('wheel', evento => {
    if (!evento.ctrlKey) {
      __mapaAvisoZoom.classList.add('visivel');
      clearTimeout(__mapaAvisoZoomTimer);
      __mapaAvisoZoomTimer = setTimeout(() => __mapaAvisoZoom?.classList.remove('visivel'), 2200);
      return;
    }
    evento.preventDefault();
    evento.stopPropagation();
    __mapaAvisoZoom.classList.remove('visivel');
    const direcao = evento.deltaY < 0 ? 0.5 : -0.5;
    __mapaLeaflet.setZoomAround(__mapaLeaflet.mouseEventToContainerPoint(evento), __mapaLeaflet.getZoom() + direcao, {animate: false});
  }, {passive: false});
}

function ajustarPopupMapaNaTela(camada) {
  if (!__mapaLeaflet || !ehTelaPequena()) return;
  const popup = camada?.getPopup ? camada.getPopup() : camada;
  if (!popup) return;
  requestAnimationFrame(() => {
    if (!ehTelaPequena() || !__mapaLeaflet.hasLayer(popup)) return;
    const elemento = popup.getElement();
    const mapa = __mapaLeaflet.getContainer();
    if (!elemento || !mapa) return;
    const margem = 12;
    const area = mapa.getBoundingClientRect();
    const caixa = elemento.getBoundingClientRect();
    const deslocamento = [0, 0];
    if (caixa.left < area.left + margem) deslocamento[0] = area.left + margem - caixa.left;
    if (caixa.right > area.right - margem) deslocamento[0] = area.right - margem - caixa.right;
    if (caixa.top < area.top + margem) deslocamento[1] = area.top + margem - caixa.top;
    if (caixa.bottom > area.bottom - margem) deslocamento[1] = area.bottom - margem - caixa.bottom;
    if (deslocamento[0] || deslocamento[1]) __mapaLeaflet.panBy(deslocamento, {animate: false});
  });
}

function abrirPopupMapa(camada, latlng) {
  if (!__mapaLeaflet || (!camada?._itemMapa && !camada?._nomeEstadoMapa)) return;
  const resumo = ehTelaPequena();
  const conteudo = camada._itemMapa
    ? montarConteudoTooltipMapa(camada._itemMapa, camada._opcoesPopup, camada._metricaPopup)
    : `<div style="padding:12px">${htmlEsc(camada._nomeEstadoMapa)}: sem dados disponíveis.</div>`;
  const popup = L.popup({
    maxWidth: resumo ? 360 : 680,
    closeButton: true,
    autoPan: true,
    autoPanPadding: [12, 12]
  })
    .setLatLng(latlng || camada.getBounds().getCenter())
    .setContent(conteudo)
    .openOn(__mapaLeaflet);
  __mapaPopupAtual = camada._itemMapa
    ? {popup, linha: camada._itemMapa.linha, estado: camada._itemMapa.estado, opcoes: camada._opcoesPopup}
    : null;
  popup.on('remove', () => {
    if (__mapaPopupAtual?.popup === popup) __mapaPopupAtual = null;
  });
  ajustarPopupMapaNaTela(popup);
}

function renderizarLegendaMapa(valores, escala, metrica) {
  let legenda = document.getElementById('mapa-legenda');
  if (!legenda) {
    legenda = document.createElement('div');
    legenda.id = 'mapa-legenda';
    legenda.style.cssText = 'container-type:inline-size;min-width:0;margin:0 0 20px;padding:8px 0;';
    document.getElementById('mapa-echart').after(legenda);
  }
  const estilo = document.createElement('style');
  estilo.textContent = `
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
  const formatoCompacto = new Intl.NumberFormat('pt-BR', {notation: 'compact', maximumFractionDigits: 1});
  const faixa = document.createElement('div');
  faixa.className = 'mapa-faixa';
  const gradiente = document.createElement('div');
  gradiente.style.cssText = `height:14px;border-radius:4px;background:linear-gradient(to right, ${__mapaCores.join(',')});`;
  faixa.append(gradiente);
  escala.pontos.forEach(ponto => {
    const marca = document.createElement('span');
    marca.className = 'mapa-marca';
    marca.style.cssText = `position:absolute;left:${ponto.cor * 100}%;top:14px;transform:translateX(-50%);text-align:center;white-space:nowrap;font-size:11px;line-height:1.5;`;
    const traco = document.createElement('span');
    traco.style.cssText = 'display:block;width:1px;height:7px;background:currentColor;margin:0 auto 4px;';
    const texto = valores.length ? formatarMoeda(ponto.valor) + (metrica === 'hora' ? '/h' : '') : '—';
    const valor = document.createElement('span');
    valor.className = 'mapa-valor-completo';
    valor.textContent = texto;
    const compacto = document.createElement('span');
    compacto.className = 'mapa-valor-compacto';
    compacto.textContent = valores.length ? 'R$' + formatoCompacto.format(ponto.valor) + (metrica === 'hora' ? '/h' : '') : '—';
    marca.title = texto;
    marca.setAttribute('aria-label', texto);
    marca.append(traco, valor, compacto);
    faixa.append(marca);
  });
  legenda.replaceChildren(estilo, faixa);
}

async function renderizarMapa(itens, opcoes) {
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
        return malha;
      }).catch(erro => {
        __mapaCarregamento = null;
        throw erro;
      });
    }
    const malha = await __mapaCarregamento;
    if (versao !== __mapaVersao || __vista !== 'mapa') return;

    const dados = itens.filter(item => item.uf && Number.isFinite(item.valor));
    const valores = dados.map(item => item.valor);
    const escala = criarEscalaMapa(valores);
    const dadosPorUF = new Map(dados.map(item => [item.uf, item]));
    const metrica = opcoes.metricaGrafico || 'mensal';
    const rotuloMetrica = ({mensal: 'Remuneração líquida mensal', hora: 'Remuneração líquida por hora', acumulado: 'Remuneração líquida acumulada'})[metrica];
    __mapaDetalhamentoAtual = {opcoes, metrica};
    status.textContent = !dados.length ? `${rotuloMetrica} — sem dados disponíveis` : '';
    const resumoMedia = document.createElement('span');
    resumoMedia.id = 'mapa-media-nacional';
    resumoMedia.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%;margin:0 0 16px;padding:16px 20px;border-radius:10px;background:#1f2a44;color:#fff;';
    const rotuloMedia = document.createElement('span');
    rotuloMedia.style.cssText = 'font-size:0.9rem;font-weight:600;';
    rotuloMedia.textContent = `${rotuloMetrica} • Média Nacional`;
    const destaqueMedia = document.createElement('strong');
    destaqueMedia.style.cssText = 'font-size:clamp(1.35rem, 3.2vw, 1.8rem);line-height:1.2;font-variant-numeric:tabular-nums;';
    const media = valores.length ? valores.reduce((soma, valor) => soma + valor, 0) / valores.length : null;
    destaqueMedia.textContent = media === null ? 'sem dados disponíveis' : formatarMoeda(media) + (metrica === 'hora' ? '/h' : '');
    resumoMedia.append(rotuloMedia, destaqueMedia);
    status.append(resumoMedia);
    __mapaDetalhamentoFixado = false;
    atualizarDetalhamentoMapa(null);

    const enquadramento = __mapaLeaflet ? {center: __mapaLeaflet.getCenter(), zoom: __mapaLeaflet.getZoom()} : null;
    const seletor = document.getElementById('mapa-estado');
    const selecionado = seletor.value;
    seletor.innerHTML = '<option value="">Selecione um estado</option>' + [...dados]
      .sort((a, b) => a.uf.localeCompare(b.uf))
      .map(item => `<option value="${htmlEsc(item.uf)}">${htmlEsc(item.estado.nome)} (${htmlEsc(item.uf)})</option>`)
      .join('');
    seletor.value = selecionado;

    if (!__mapaLeaflet) {
      __mapaLeaflet = L.map('mapa-echart', {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        minZoom: 2,
        maxZoom: 10,
        zoomSnap: 0.1
      });
      __mapaLeaflet.attributionControl.setPrefix(false);
      configurarZoomMapa();
    }
    redimensionarMapa();
    if (__mapaCamada) __mapaCamada.remove();
    __mapaCamada = L.geoJSON(malha, {
      style: feature => {
        const item = dadosPorUF.get(feature.properties.name);
        return {
          fillColor: item ? corMapa(item.valor, escala) : '#e5e7eb',
          fillOpacity: 0.95,
          color: '#fff',
          weight: 1
        };
      },
      onEachFeature: (feature, camada) => {
        const nomeEstado = feature.properties.name;
        const item = dadosPorUF.get(nomeEstado);
        camada._uf = nomeEstado;
        camada._itemMapa = item || null;
        camada._nomeEstadoMapa = nomeEstado;
        camada._opcoesPopup = opcoes;
        camada._metricaPopup = metrica;
        const valorRotulo = item ? formatarMoeda(item.valor) + (metrica === 'hora' ? '/h' : '') : '—';
        camada.bindTooltip(`<strong>${htmlEsc(nomeEstado)}</strong><br><span>${valorRotulo}</span>`, {
          permanent: true,
          direction: 'center',
          className: 'mapa-rotulo',
          opacity: 1,
          interactive: false
        });
        camada._conteudoPopup = item
          ? montarConteudoTooltipMapa(item, opcoes, metrica)
          : `<div style="padding:12px">${htmlEsc(nomeEstado)}: sem dados disponíveis.</div>`;
        camada.on({
          mouseover: evento => {
            evento.target.setStyle({weight: 2, color: '#111827'});
            evento.target.bringToFront();
            if (!ehTelaPequena() && !__mapaDetalhamentoFixado) atualizarDetalhamentoMapa(item, nomeEstado);
          },
          mouseout: evento => {
            __mapaCamada.resetStyle(evento.target);
            if (!ehTelaPequena() && !__mapaDetalhamentoFixado) atualizarDetalhamentoMapa(null);
          },
          click: evento => {
            if (ehTelaPequena() || !mapaUsaDetalhamentoLateral()) {
              abrirPopupMapa(evento.target, evento.latlng);
              return;
            }
            ocultarTooltipMapa();
            if (item) {
              __mapaDetalhamentoFixado = true;
              seletor.value = nomeEstado;
              atualizarDetalhamentoMapa(item, nomeEstado);
            }
          }
        });
      }
    }).addTo(__mapaLeaflet);
    __mapaBoundsInicial = __mapaCamada.getBounds();
    if (enquadramento) {
      __mapaLeaflet.setView(enquadramento.center, enquadramento.zoom, {animate: false});
    } else if (__mapaBoundsInicial.isValid()) {
      __mapaLeaflet.fitBounds(__mapaBoundsInicial, {padding: [18, 18], maxZoom: 5, animate: false});
    }
    redimensionarMapa();
    renderizarLegendaMapa(valores, escala, metrica);

    document.getElementById('mapa-restaurar').onclick = () => {
      ocultarTooltipMapa();
      __mapaDetalhamentoFixado = false;
      atualizarDetalhamentoMapa(null);
      if (__mapaBoundsInicial?.isValid()) __mapaLeaflet.fitBounds(__mapaBoundsInicial, {padding: [18, 18], maxZoom: 5, animate: false});
    };
    seletor.onchange = () => {
      ocultarTooltipMapa();
      const item = dadosPorUF.get(seletor.value);
      if (item) {
        __mapaDetalhamentoFixado = true;
        atualizarDetalhamentoMapa(item, item.uf);
        const camada = __mapaCamada.getLayers().find(layer => layer._uf === item.uf);
        if (!mapaUsaDetalhamentoLateral()) {
          abrirPopupMapa(camada);
        }
      } else {
        __mapaDetalhamentoFixado = false;
        atualizarDetalhamentoMapa(null);
      }
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

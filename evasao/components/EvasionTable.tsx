import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestion } from '@fortawesome/free-solid-svg-icons';
import { DadosDestinoEvasao } from '../types';

interface AuditorDetail {
  name: string;
  data?: string | null;
  dataPublicacao?: string | null;
  situacao?: string | null;
  area?: string | null;
  unidade?: string | null;
  observacao?: string | null;
}

interface EvasionTableProps {
  data: DadosDestinoEvasao[];
  // detalhes por destino (apenas destinos exibidos na tabela)
  details?: Record<string, AuditorDetail[]>;
}

const EvasionTable: React.FC<EvasionTableProps> = ({ data, details = {} }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const [debugOpen, setDebugOpen] = useState(false);

  // Log principal para inspeção rápida no console do browser

  const toggle = (destino: string) => {
    setOpen(prev => ({ ...prev, [destino]: !prev[destino] }));
  };

  // Tooltip portal component: posiciona o balão no <body> para evitar clipping por overflow
  const TooltipPortal: React.FC<{ pos: { left: number; top: number } | null; text: string; visible: boolean }> = ({ pos, text, visible }) => {
    if (!visible || !pos) return null;

    // Calcular posicionamento inteligente
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = 200; // Largura estimada do tooltip
    const tooltipHeight = 40; // Altura estimada do tooltip

    let left = pos.left;
    let top = pos.top;
    let transform = 'translate(-50%, -100%)';

    // Ajustar horizontalmente se sair da tela
    if (left - tooltipWidth / 2 < 10) {
      // Muito à esquerda - alinhar à esquerda
      left = Math.max(10, pos.left - 20);
      transform = 'translate(0, -100%)';
    } else if (left + tooltipWidth / 2 > viewportWidth - 10) {
      // Muito à direita - alinhar à direita
      left = Math.min(viewportWidth - 10, pos.left + 20);
      transform = 'translate(-100%, -100%)';
    }

    // Ajustar verticalmente se sair da tela
    if (top - tooltipHeight < 10) {
      // Muito acima - posicionar abaixo
      top = pos.top + 25;
      transform = transform.replace('-100%', '0');
    }

    return createPortal(
      <div
        role="tooltip"
        style={{ left, top, transform }}
        className="fixed z-[9999] pointer-events-none bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-lg border border-gray-700 max-w-[200px] break-words"
      >
        <div className="relative">
          {text}
        </div>
      </div>,
      document.body
    );
  };

  // Pequeno componente para cada item (usa hooks por item sem quebrar regra de hooks)
  const AuditorRow: React.FC<{ aud: AuditorDetail; dest: string; rowIndex: number; itemIndex: number }> = ({ aud, dest, rowIndex, itemIndex }) => {
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const areaUnit = aud.area
      ? (aud.unidade && String(aud.unidade).trim() ? `${aud.area} - ${aud.unidade}` : aud.area)
      : '—';
    const tooltip =
      aud.situacao === 'EXONERADO' && aud.dataPublicacao && String(aud.dataPublicacao).trim() ?
        `Exoneração publicada no DOE em ${aud.dataPublicacao}` :
        aud.situacao === 'APOSENTADO' && aud.dataPublicacao && String(aud.dataPublicacao).trim() ?
          `Aposentadoria publicada no DOE em ${aud.dataPublicacao}` :
          aud.situacao === 'AFASTAMENTO PRELIMINAR À APOSENTADORIA' && aud.dataPublicacao && String(aud.dataPublicacao).trim() ?
            `Afastamento publicado no DOE em ${aud.dataPublicacao}` :
            aud.observacao ? String(aud.observacao).trim() : null;

    const show = () => {
      const el = btnRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setPos({ left: rect.left + rect.width / 2, top: rect.top });
      }
      setVisible(true);
    };
    const hide = () => setVisible(false);

    return (
      <li className="flex justify-between items-center px-4 py-2 bg-gray-800/40 rounded border border-gray-700/50">
        <div>
          <div className="font-medium text-gray-200">{aud.name}</div>
          <div className="text-xs text-gray-400">{areaUnit}</div>
        </div>

        <div className="flex items-center gap-3">
          {(() => {
            const isDesistente = aud.situacao && String(aud.situacao).toUpperCase().includes('DESISTENTE');
            const isAposentado = aud.situacao && String(aud.situacao).toUpperCase().includes('APOSENTADO');
            const isAfastado = aud.situacao && String(aud.situacao).toUpperCase().includes('AFASTAMENTO PRELIMINAR À APOSENTADORIA');

            if (isDesistente) {
              return <span className="text-sm text-gray-400">{aud.data ? `Nomeação sem efeito em ${aud.data}` : '—'}</span>;
            }
            if (isAfastado) {
              return <span className="text-sm text-gray-400">{aud.data ? `Afastado em ${aud.data}` : '—'}</span>;
            }
            if (isAposentado) {
              return <span className="text-sm text-gray-400">{aud.data ? `Aposentado em ${aud.data}` : '—'}</span>;
            }
            return <span className="text-sm text-gray-400">{aud.data ? `Exonerado em ${aud.data}` : '—'}</span>;
          })()}

          <div>
            {(() => {

              let showTooltip = false;
              let tooltipText = '';

              // Para desistentes: só mostra se não há data de nomeação sem efeito E há observação
              showTooltip = tooltip ? true : false;
              tooltipText = tooltip;


              return showTooltip ? (
                <>
                  <button
                    ref={btnRef}
                    type="button"
                    onMouseEnter={show}
                    onMouseLeave={hide}
                    onFocus={show}
                    onBlur={hide}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    aria-label={tooltipText}
                  >
                    <FontAwesomeIcon icon={faQuestion} className="w-2 h-2 bold-icon" aria-hidden="true" color="#1A2436" />
                  </button>

                  <TooltipPortal pos={pos} text={tooltipText} visible={visible} />
                </>
              ) : null;
            })()}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDebugOpen(d => !d)}
          className="text-xs text-gray-400 underline"
        >
          {debugOpen ? 'Esconder console' : 'Mostrar console'}
        </button>
      </div>

      {debugOpen && (
        <div className="mb-3">
          <pre className="max-h-60 overflow-auto text-xs bg-gray-900 text-gray-200 p-3 rounded border border-gray-700">{JSON.stringify({ data, details }, null, 2)}</pre>
        </div>
      )}
      <table className="w-full text-left table-auto">
        <thead className="bg-gray-800 text-gray-300 uppercase text-sm border-b border-gray-700">
          <tr>
            <th className="px-6 py-3 font-semibold">Órgão de Destino</th>
            <th className="px-6 py-3 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {data.map((item, index) => {
            const dest = item.destino;
            const rows = details[dest] ?? [];
            const isOpen = !!open[dest];

            return (
              <React.Fragment key={dest + index}>
                <tr className="hover:bg-gray-800/60 transition-colors duration-200">
                  <td className="px-6 py-4 max-w-[180px] md:max-w-none align-middle">
                    <button onClick={() => toggle(dest)} className="text-left w-full flex items-center gap-2 text-gray-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-red-400 transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="break-words whitespace-normal block">{dest}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-400">{item.count}</td>
                </tr>

                {isOpen && rows.length > 0 && (
                  <tr className="bg-gray-900/60">
                    <td colSpan={2} className="px-6 py-3">
                      <ul className="space-y-2">
                        {rows.map((aud, i) => (
                          <AuditorRow key={`${index}-${i}`} aud={aud} dest={dest} rowIndex={index} itemIndex={i} />
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EvasionTable;

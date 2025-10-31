import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestion } from '@fortawesome/free-solid-svg-icons';
import { EvasionData } from '../types';

interface AuditorDetail {
  name: string;
  date?: string | null;
  pubDate?: string | null;
  noEffectDate?: string | null;
  situation?: string | null;
  area?: string | null;
}

interface EvasionTableProps {
  data: EvasionData[];
  // detalhes por destino (apenas destinos exibidos na tabela)
  details?: Record<string, AuditorDetail[]>;
}

const EvasionTable: React.FC<EvasionTableProps> = ({ data, details = {} }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (destination: string) => {
    setOpen(prev => ({ ...prev, [destination]: !prev[destination] }));
  };

  // Tooltip portal component: posiciona o balão no <body> para evitar clipping por overflow
  const TooltipPortal: React.FC<{ pos: { left: number; top: number } | null; text: string; visible: boolean }> = ({ pos, text, visible }) => {
    if (!visible || !pos) return null;

    return createPortal(
      <div
        role="tooltip"
        style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -100%)' }}
        className="fixed z-[9999] pointer-events-none bg-slate-700 text-white text-xs rounded px-2 py-1 shadow-lg whitespace-nowrap"
      >
        <div className="relative">
          {text}
          <div className="absolute left-1/2 -translate-x-1/2 translate-y-1 w-2.5 h-2.5 bg-slate-700 rotate-45" style={{ bottom: '-0.35rem' }} />
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
    const tooltip = aud.pubDate && String(aud.pubDate).trim()
      ? `Exoneração publicada no DOE em ${aud.pubDate}`
      : 'Exoneração ainda não publicada no DOE';

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
      <li className="flex justify-between items-center px-4 py-2 bg-slate-900/30 rounded">
        <div>
          <div className="font-medium">{aud.name}</div>
          <div className="text-xs text-slate-400">{aud.area ?? '—'}</div>
        </div>

        <div className="flex items-center gap-3">
          {(() => {
            const isDesistente = aud.situation && String(aud.situation).toUpperCase().includes('DESISTENTE');
            if (isDesistente) {
              return <span className="text-sm text-slate-400">{aud.noEffectDate ? `Nomeação sem efeito em ${aud.noEffectDate}` : '—'}</span>;
            }
            return <span className="text-sm text-slate-400">{aud.date ? `Exonerado em ${aud.date}` : '—'}</span>;
          })()}

          <div>
            {!(String(aud.situation ?? '').toUpperCase().includes('DESISTENTE')) ? (
              <>
                <button
                  ref={btnRef}
                  type="button"
                  onMouseEnter={show}
                  onMouseLeave={hide}
                  onFocus={show}
                  onBlur={hide}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-400 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  aria-label={tooltip}
                >
                  <FontAwesomeIcon icon={faQuestion} className="w-2 h-2 bold-icon" aria-hidden="true" color="#1A2436"/>
                </button>

                <TooltipPortal pos={pos} text={tooltip} visible={visible} />
              </>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left table-auto">
        <thead className="bg-slate-700 text-slate-300 uppercase text-sm">
          <tr>
            <th className="px-6 py-3 font-semibold">Órgão de Destino</th>
            <th className="px-6 py-3 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {data.map((item, index) => {
            const dest = item.destination;
            const rows = details[dest] ?? [];
            const isOpen = !!open[dest];

            return (
              <React.Fragment key={dest + index}>
                <tr className="hover:bg-slate-700/50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button onClick={() => toggle(dest)} className="text-left w-full flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-400 transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span>{dest}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-cyan-400">{item.count}</td>
                </tr>

                {isOpen && rows.length > 0 && (
                  <tr className="bg-slate-800/40">
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

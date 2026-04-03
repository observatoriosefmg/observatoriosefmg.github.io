import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestion } from '@fortawesome/free-solid-svg-icons';

interface AuditorAguardandoDetail {
  name: string;
  area?: string | null;
  unidade?: string | null;
}

interface AprovadoData {
  concurso: string;
  count: number;
}

interface AprovadosOutrosConcursosTableProps {
  data: AprovadoData[];
  details?: Record<string, AuditorAguardandoDetail[]>;
}

const AprovadosOutrosConcursosTable: React.FC<AprovadosOutrosConcursosTableProps> = ({ data, details = {} }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (concurso: string) => {
    setOpen(prev => ({ ...prev, [concurso]: !prev[concurso] }));
  };

  // Tooltip portal component
  const TooltipPortal: React.FC<{ pos: { left: number; top: number } | null; text: string; visible: boolean }> = ({ pos, text, visible }) => {
    if (!visible || !pos) return null;

    const viewportWidth = window.innerWidth;
    const tooltipWidth = 200;
    const tooltipHeight = 40;

    let left = pos.left;
    let top = pos.top;
    let transform = 'translate(-50%, -100%)';

    if (left - tooltipWidth / 2 < 10) {
      left = Math.max(10, pos.left - 20);
      transform = 'translate(0, -100%)';
    } else if (left + tooltipWidth / 2 > viewportWidth - 10) {
      left = Math.min(viewportWidth - 10, pos.left + 20);
      transform = 'translate(-100%, -100%)';
    }

    if (top - tooltipHeight < 10) {
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

  const AuditorRow: React.FC<{ aud: AuditorAguardandoDetail; concurso: string; rowIndex: number; itemIndex: number }> = ({ aud, concurso, rowIndex, itemIndex }) => {
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const areaUnit = aud.area
      ? (aud.unidade && String(aud.unidade).trim() ? `${aud.area} - ${aud.unidade}` : aud.area)
      : '—';

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
        <span className="text-sm text-gray-400"></span>
      </li>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left table-auto">
        <thead className="bg-gray-800 text-gray-300 uppercase text-sm border-b border-gray-700">
          <tr>
            <th className="px-6 py-3 font-semibold">Concurso/Órgão</th>
            <th className="px-6 py-3 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {data.map((item, index) => {
            const concurso = item.concurso;
            const rows = details[concurso] ?? [];
            const isOpen = !!open[concurso];

            return (
              <React.Fragment key={concurso + index}>
                <tr className="hover:bg-gray-800/60 transition-colors duration-200">
                  <td className="px-6 py-4 max-w-[180px] md:max-w-none align-middle">
                    <button onClick={() => toggle(concurso)} className="text-left w-full flex items-center gap-2 text-gray-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-amber-400 transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="break-words whitespace-normal block">{concurso}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-amber-400">{item.count}</td>
                </tr>

                {isOpen && rows.length > 0 && (
                  <tr className="bg-gray-900/60">
                    <td colSpan={2} className="px-6 py-3">
                      <ul className="space-y-2">
                        {rows.map((aud, i) => (
                          <AuditorRow key={`${index}-${i}`} aud={aud} concurso={concurso} rowIndex={index} itemIndex={i} />
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

export default AprovadosOutrosConcursosTable;

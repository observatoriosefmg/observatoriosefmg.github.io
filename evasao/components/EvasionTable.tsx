import React, { useState } from 'react';
import { EvasionData } from '../types';

interface AuditorDetail {
  name: string;
  date?: string | null;
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
                          <li key={i} className="flex justify-between items-center px-4 py-2 bg-slate-900/30 rounded">
                            <div>
                              <div className="font-medium">{aud.name}</div>
                              <div className="text-xs text-slate-400">{aud.area ?? '—'}</div>
                            </div>
                            <div className="text-sm text-slate-400">{aud.date ?? '—'}</div>
                          </li>
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

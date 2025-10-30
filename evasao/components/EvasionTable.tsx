import React from 'react';
import { EvasionData } from '../types';

interface EvasionTableProps {
  data: EvasionData[];
}

const EvasionTable: React.FC<EvasionTableProps> = ({ data }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left table-auto">
        <thead className="bg-slate-700 text-slate-300 uppercase text-sm">
          <tr>
            <th className="px-6 py-3 font-semibold">Órgão de Destino / Motivo</th>
            <th className="px-6 py-3 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {data.map((item, index) => (
            <tr key={index} className="hover:bg-slate-700/50 transition-colors duration-200">
              <td className="px-6 py-4 whitespace-nowrap">{item.destination}</td>
              <td className="px-6 py-4 text-right font-bold text-cyan-400">{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EvasionTable;

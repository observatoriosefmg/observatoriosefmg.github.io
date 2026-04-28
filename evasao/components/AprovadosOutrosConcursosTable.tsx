import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestion } from '@fortawesome/free-solid-svg-icons';

interface AuditorAguardandoDetail {
  name: string;
  area?: string | null;
  unidade?: string | null;
  tipoAprovacao: 'Nomeado' | 'Aprovado nas vagas' | 'Cadastro de Reservas' | 'Fim de Fila';
  aprovacoes: {
    tipoAprovacao: 'Nomeado' | 'Aprovado nas vagas' | 'Cadastro de Reservas' | 'Fim de Fila';
    cargo: string;
    modalidade: string;
    posicao: number | null;
    numeroVagas: number | null;
    ultimaVagaNomeada: number | null;
    observacao?: string | null;
  }[];
}

interface AprovadoData {
  concurso: string;
  count: number;
  statusConcurso: string;
}

interface AprovadosOutrosConcursosTableProps {
  data: AprovadoData[];
  details?: Record<string, AuditorAguardandoDetail[]>;
}

const AprovadosOutrosConcursosTable: React.FC<AprovadosOutrosConcursosTableProps> = ({ data, details = {} }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const analisarDataBrasil = (valor: string): Date | null => {
    const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const dia = Number(match[1]);
    const mes = Number(match[2]) - 1;
    const ano = Number(match[3]);
    const data = new Date(ano, mes, dia);
    if (Number.isNaN(data.getTime())) return null;
    data.setHours(0, 0, 0, 0);
    return data;
  };

  const concursoEstaVencidoPeloStatus = (statusConcurso: string): boolean => {
    const match = statusConcurso.match(/Valido ate (\d{2}\/\d{2}\/\d{4})|Válido até (\d{2}\/\d{2}\/\d{4})/i);
    const dataTexto = match?.[1] ?? match?.[2] ?? null;
    if (!dataTexto) return false;
    const vencimento = analisarDataBrasil(dataTexto);
    if (!vencimento) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return vencimento.getTime() < hoje.getTime();
  };

  const toggle = (concurso: string) => {
    setOpen(prev => ({ ...prev, [concurso]: !prev[concurso] }));
  };

  const TooltipPortal: React.FC<{ pos: { left: number; top: number } | null; content: React.ReactNode; visible: boolean }> = ({ pos, content, visible }) => {
    if (!visible || !pos) return null;

    const viewportWidth = window.innerWidth;
    const tooltipWidth = 280;
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
        className="fixed z-[9999] pointer-events-none bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-lg border border-gray-700 max-w-[280px] break-words"
      >
        <div className="relative">{content}</div>
      </div>,
      document.body,
    );
  };

  const AuditorRow: React.FC<{ aud: AuditorAguardandoDetail }> = ({ aud }) => {
        const badgeClass = aud.tipoAprovacao === 'Nomeado'
          ? 'bg-sky-900/50 text-sky-300 border border-sky-700/40'
          : aud.tipoAprovacao === 'Aprovado nas vagas'
            ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40'
            : aud.tipoAprovacao === 'Cadastro de Reservas'
              ? 'bg-amber-900/50 text-amber-300 border border-amber-700/40'
              : 'bg-rose-900/50 text-rose-300 border border-rose-700/40';

    const btnRef = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const areaUnit = aud.area
      ? (aud.unidade && String(aud.unidade).trim() ? `${aud.area} - ${aud.unidade}` : aud.area)
      : '—';

    const formatPosicao = (valor: number | null) => (valor != null ? `${valor}º` : '—');

    const tooltipAriaLabel = aud.aprovacoes
      .map((item) => {
        const base = `${item.cargo || '—'} (${item.modalidade || '—'})`;
        const posicao = `${formatPosicao(item.posicao)} de ${item.numeroVagas ?? '—'} vagas`;
        const nomeado = item.ultimaVagaNomeada != null ? `(Nomeado até o ${formatPosicao(item.ultimaVagaNomeada)} lugar)` : '';
        const observacao = item.observacao ? `Observação: ${item.observacao}` : '';
        return [base, posicao, nomeado, observacao].filter(Boolean).join(' ');
      })
      .join(' | ');

    const tooltipDetalhes = (
      <div className="space-y-2">
        {aud.aprovacoes.map((item, i) => (
          <div key={`${aud.name}-${i}`} className={i > 0 ? 'pt-2 border-t border-gray-700/80' : ''}>
            <div>{`${item.cargo || '—'} (${item.modalidade || '—'})`}</div>
            <div>
              <span className="text-amber-400 font-semibold">{formatPosicao(item.posicao)}</span>
              {` de ${item.numeroVagas ?? '—'} vagas`}
            </div>
            {item.ultimaVagaNomeada != null && (
              <div>
                {'(Nomeado até o '}
                <span className="text-amber-400 font-semibold">{formatPosicao(item.ultimaVagaNomeada)}</span>
                {' lugar)'}
              </div>
            )}
            {item.observacao && (
              <div className="text-gray-300">{item.observacao}</div>
            )}
          </div>
        ))}
      </div>
    );

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
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded ${badgeClass}`}>
            {aud.tipoAprovacao}
          </span>
          <button
            ref={btnRef}
            type="button"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
            aria-label={tooltipAriaLabel}
          >
            <FontAwesomeIcon icon={faQuestion} className="w-2 h-2 bold-icon" aria-hidden="true" color="#1A2436" />
          </button>
          <TooltipPortal pos={pos} content={tooltipDetalhes} visible={visible} />
        </div>
      </li>
    );
  };

  const concursosExibidos = data
    .map((item) => {
      const rowsOriginais = details[item.concurso] ?? [];
      const concursoVencido = concursoEstaVencidoPeloStatus(item.statusConcurso);
      const rows = concursoVencido
        ? rowsOriginais.filter((aud) => aud.tipoAprovacao === 'Nomeado')
        : rowsOriginais;

      if (concursoVencido && rows.length === 0) return null;

      return {
        item,
        rows,
        count: concursoVencido ? rows.length : item.count,
      };
    })
    .filter((entry): entry is { item: AprovadoData; rows: AuditorAguardandoDetail[]; count: number } => entry !== null);

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
          {concursosExibidos.map(({ item, rows, count }, index) => {
            const concurso = item.concurso;
            const isOpen = !!open[concurso];

            return (
              <React.Fragment key={concurso + index}>
                <tr className="hover:bg-gray-800/60 transition-colors duration-200">
                  <td className="px-6 py-4 max-w-[180px] md:max-w-none align-middle">
                    <button onClick={() => toggle(concurso)} className="text-left w-full flex items-center gap-2 text-gray-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-amber-400 transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="break-words whitespace-normal block">
                        <span className="block">{concurso}</span>
                        <span className="block text-xs text-amber-300/90 mt-1">{item.statusConcurso}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-amber-400">{count}</td>
                </tr>

                {isOpen && rows.length > 0 && (
                  <tr className="bg-gray-900/60">
                    <td colSpan={2} className="px-6 py-3">
                      <ul className="space-y-2">
                        {rows.map((aud, i) => (
                          <AuditorRow key={`${index}-${i}`} aud={aud} />
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

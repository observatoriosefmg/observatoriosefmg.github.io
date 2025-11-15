import React, { useState, useEffect, useMemo } from 'react';

interface DetailedTableAppProps { }

const DetailedTableApp: React.FC<DetailedTableAppProps> = () => {
    const [areaSelecionada, setAreaSelecionada] = useState<string>('FISCALIZAÇÃO');
    const [allAuditors, setAllAuditors] = useState<any[]>([]);
    const [estaCarregando, setEstaCarregando] = useState(true);
    const [searchName, setSearchName] = useState<string>('');
    const [filterPCD, setFilterPCD] = useState<boolean>(false);
    const [selectedStatus, setSelectedStatus] = useState<string>('');    // Carregar dados CSV
    useEffect(() => {
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
            const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lines.length === 0) return [];

            const parseLine = (line: string) => {
                const parts: string[] = [];
                let cur = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            cur += '"';
                            i++;
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
                while (parts.length < headers.length) parts.push('');
                const obj: Record<string, string> = {};
                for (let j = 0; j < headers.length; j++) {
                    obj[headers[j]] = parts[j] ? parts[j].trim() : '';
                }
                rows.push(obj);
            }
            return rows;
        };

        async function loadData() {
            for (const p of paths) {
                try {
                    // Forçar recarregamento do CSV: cache busting + headers no-cache/no-store
                    const url = p + (p.includes('?') ? '&' : '?') + `_ts=${Date.now()}`;
                    const res = await fetch(url, {
                        cache: 'no-store',
                        headers: {
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0',
                        },
                    });
                    if (!res.ok) continue;
                    let text = await res.text();
                    text = text.replace(/^\uFEFF/, '');

                    const raw = parseCsv(text);
                    if (!Array.isArray(raw) || raw.length === 0) continue;

                    console.log('Dados carregados:', raw.length, 'registros');
                    setAllAuditors(raw);
                    setEstaCarregando(false);
                    return;
                } catch (err) {
                    console.debug('Falha ao carregar', p, err);
                }
            }

            console.warn('Não foi possível carregar dados.csv');
            setEstaCarregando(false);
        }

        loadData();
    }, []);

    // Lista de áreas únicas (sem opção TODAS)
    const areas = useMemo(() => {
        if (!allAuditors || allAuditors.length === 0) return ['FISCALIZAÇÃO'];
        const uniqueAreas = Array.from(new Set(allAuditors.map(item => item['ÁREA'] || item['AREA'] || 'Outros')));
        const sortedAreas = uniqueAreas.sort();

        // Garantir que FISCALIZAÇÃO seja a primeira opção se existir
        if (sortedAreas.includes('FISCALIZAÇÃO')) {
            return ['FISCALIZAÇÃO', ...sortedAreas.filter(area => area !== 'FISCALIZAÇÃO')];
        }
        return sortedAreas;
    }, [allAuditors]);

    // Ajustar área selecionada quando os dados são carregados
    useEffect(() => {
        if (areas.length > 0 && !areas.includes(areaSelecionada)) {
            setAreaSelecionada(areas[0]);
        }
    }, [areas, areaSelecionada]);

    // Reset filtro de status quando a área mudar
    useEffect(() => {
        setSelectedStatus('');
    }, [areaSelecionada]);

    // Filtrar dados pela área selecionada e busca por nome, ordenar por posição do concurso
    const filteredData = useMemo(() => {
        if (!allAuditors || allAuditors.length === 0) return [];

        let filtered = allAuditors.filter(item => (item['ÁREA'] || item['AREA'] || 'Outros') === areaSelecionada);

        // Filtrar por nome se houver busca
        if (searchName.trim()) {
            filtered = filtered.filter(item => {
                const nome = (item['NOME'] || item['Nome do Candidato'] || '').toLowerCase();
                return nome.includes(searchName.toLowerCase());
            });
        }

        // Filtrar apenas PCDs se ativo
        if (filterPCD) {
            filtered = filtered.filter(item => {
                return (item['PCD'] || '').toUpperCase() === 'SIM';
            });
        }

        // Filtrar por status se selecionado
        if (selectedStatus) {
            filtered = filtered.filter(item => {
                const status = (item['SITUACAO'] || '???').toUpperCase();
                return status === selectedStatus.toUpperCase();
            });
        }

        // Função auxiliar para converter data brasileira para objeto Date
        const parseBrazilDate = (dateStr: string): Date | null => {
            if (!dateStr || typeof dateStr !== 'string') return null;
            const parts = dateStr.split('/');
            if (parts.length !== 3) return null;
            const day = Number(parts[0]);
            const month = Number(parts[1]) - 1; // mês começa em 0
            const year = Number(parts[2]);
            if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
            return new Date(year, month, day);
        };

        return filtered.sort((a, b) => {
            // Ordenação especial para VETERANO
            if (areaSelecionada === 'VETERANO') {
                // Primeiro por Data Publicação Exoneração (DESC, null last)
                const dateExonStrA = a['DATA_PUBLICACAO_EXONERACAO'] || a['DATA PUBLICACAO EXONERAÇÃO'] || '';
                const dateExonStrB = b['DATA_PUBLICACAO_EXONERACAO'] || b['DATA PUBLICACAO EXONERAÇÃO'] || '';
                
                const dateExonA = parseBrazilDate(dateExonStrA);
                const dateExonB = parseBrazilDate(dateExonStrB);
                
                // Se ambas têm data de exoneração, ordena DESC (mais recente primeiro)
                if (dateExonA && dateExonB) {
                    const comparison = dateExonB.getTime() - dateExonA.getTime();
                    if (comparison !== 0) return comparison;
                }
                // Se apenas A tem data, A vem primeiro
                else if (dateExonA && !dateExonB) {
                    return -1;
                }
                // Se apenas B tem data, B vem primeiro
                else if (!dateExonA && dateExonB) {
                    return 1;
                }
                
                // Depois por Data Publicação Inatividade (DESC)
                const dateInatStrA = a['DATA_PUBLICACAO_INATIVIDADE'] || a['DATA PUBLICACAO INATIVIDADE'] || '';
                const dateInatStrB = b['DATA_PUBLICACAO_INATIVIDADE'] || b['DATA PUBLICACAO INATIVIDADE'] || '';
                
                const dateInatA = parseBrazilDate(dateInatStrA);
                const dateInatB = parseBrazilDate(dateInatStrB);
                
                if (dateInatA && dateInatB) {
                    return dateInatB.getTime() - dateInatA.getTime();
                } else if (dateInatA && !dateInatB) {
                    return -1;
                } else if (!dateInatA && dateInatB) {
                    return 1;
                }
                
                // Se não há datas para comparar, manter ordem alfabética por nome
                const nomeA = (a['NOME'] || '').toString();
                const nomeB = (b['NOME'] || '').toString();
                return nomeA.localeCompare(nomeB);
            }
            
            // Ordenação padrão por posição do concurso
            const posA = parseInt(a['POSICAO_CONCURSO'] || a['POSICAO CONCURSO'] || '0');
            const posB = parseInt(b['POSICAO_CONCURSO'] || b['POSICAO CONCURSO'] || '0');
            return posA - posB;
        });
    }, [allAuditors, areaSelecionada, searchName, filterPCD, selectedStatus]);    // Função para determinar a cor da linha baseada no status e alternância
    const getRowColor = (situacao: string, index: number) => {
        const isEven = index % 2 === 0;
        const status = situacao?.toUpperCase() || '???';

        // Cores base por status
        const statusColors = {
            'EM EXERCÍCIO': isEven ? 'bg-green-200' : 'bg-green-200/75',
            'NOMEADO': isEven ? 'bg-blue-200' : 'bg-blue-200/75',
            'EXONERADO': isEven ? 'bg-red-200' : 'bg-red-200/85',
            'DESISTENTE': isEven ? 'bg-orange-200' : 'bg-orange-200/85',
            'INAPTO ADMISSIONAL': isEven ? 'bg-fuchsia-200' : 'bg-fuchsia-200/85',
            'APOSENTADO': isEven ? 'bg-purple-400' : 'bg-purple-400/85',
            'AFASTAMENTO PRELIMINAR À APOSENTADORIA': isEven ? 'bg-teal-200' : 'bg-teal-200/85',
            '???': isEven ? 'bg-white' : 'bg-gray-100',
        };

        return statusColors[status] || statusColors['???'];
    };

    // Função para determinar apenas a cor do texto do status
    const getStatusTextColor = (situacao: string) => {
        const colors = {
            'EM EXERCÍCIO': 'text-green-700',
            'NOMEADO': 'text-blue-700',
            'EXONERADO': 'text-red-700',
            'DESISTENTE': 'text-yellow-700',
            'INAPTO ADMISSIONAL': 'text-purple-700',
            'APOSENTADO': 'text-purple-800',
            'AFASTAMENTO PRELIMINAR À APOSENTADORIA': 'text-purple-700',
            '-': 'text-gray-600',
        };

        const status = situacao?.toUpperCase() || '???';
        return colors[status] || colors['???'];
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 p-2">
            <div className="w-full max-w-none">
                {/* Link para voltar */}
                <div className="mb-2">
                    <a
                        href="/evasao/dist/index.html"
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors duration-200 shadow-sm"
                    >
                        ← Voltar ao Dashboard
                    </a>
                </div>

                <header className="text-center mb-3">
                    <span className="text-sm text-red-600 font-medium">
                        Auditores Fiscais da Receita Estadual de Minas Gerais
                    </span>
                </header>

                {/* Seletor de Área */}
                <div className="mb-3 flex flex-col items-center">
                    <div className="text-sm text-gray-700 mb-1 font-medium">Filtrar por área:</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {areas.map(area => (
                            <button
                                key={area}
                                onClick={() => setAreaSelecionada(area)}
                                className={`px-3 py-1 rounded text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 ${areaSelecionada === area
                                    ? 'bg-red-600 text-white shadow-md'
                                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 shadow-sm'
                                    }`}
                            >
                                {area}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Buscador por nome */}
                <div className="mb-3 flex flex-col items-center">
                    <div className="text-sm text-gray-700 mb-1 font-medium">Buscar por nome:</div>
                    <input
                        type="text"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        placeholder="Digite o nome do candidato..."
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 w-80 max-w-full"
                    />
                </div>

                {/* Estatísticas do filtro */}
                {!estaCarregando && filteredData.length > 0 && (
                    <div className="mb-4 text-center text-sm text-gray-700">
                        <div className="flex flex-wrap gap-2 justify-center items-center">
                            {/* Botão para mostrar todos */}
                            <button
                                onClick={() => setSelectedStatus('')}
                                className={`px-2 py-1 rounded text-xs transition-colors ${selectedStatus === ''
                                        ? 'bg-blue-500 text-white font-semibold'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                            >
                                Todos
                            </button>
                            {/* Status individuais */}
                            {Object.entries(
                                filteredData.reduce((acc, item) => {
                                    const status = item['SITUACAO'] || '???';
                                    acc[status] = (acc[status] || 0) + 1;
                                    return acc;
                                }, {} as Record<string, number>)
                            ).map(([status, count]) => (
                                <button
                                    key={status}
                                    onClick={() => setSelectedStatus(selectedStatus === status ? '' : status)}
                                    className={`px-2 py-1 rounded text-xs transition-colors ${selectedStatus === status
                                            ? 'bg-red-500 text-white font-semibold'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    {status}: <span className="font-semibold">{count}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabela */}
                <div className="bg-white shadow-lg border border-black">
                    <div className="overflow-x-auto max-h-[80vh] overflow-y-auto">
                        <table className="w-full text-[10px] border-collapse border border-black">
                            <thead className="bg-white text-gray-700 uppercase text-[10px] sticky top-0 z-50 shadow-sm">
                                <tr>
                                    {areaSelecionada === 'VETERANO' ? (
                                        // Cabeçalho para área VETERANO
                                        <>
                                            <th className="px-1 py-1 text-left font-semibold border border-black bg-white">NOME</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">SITUAÇÃO</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">ÓRGÃO</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">DATA EXONERAÇÃO</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">DATA DE PUBLICAÇÃO DA EXONERAÇÃO</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">DATA INATIVIDADE</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">DATA DE PUBLICAÇÃO DA INATIVIDADE</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">OBSERVAÇÃO</th>
                                        </>
                                    ) : (
                                        // Cabeçalho padrão para outras áreas
                                        <>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Pos.</th>
                                            <th className="px-1 py-1 text-left font-semibold border border-black bg-white">Nome</th>
                                            <th className="px-0.5 py-1 text-center font-semibold border border-black bg-white">
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <span>PCD</span>
                                                    <button
                                                        onClick={() => setFilterPCD(!filterPCD)}
                                                        className={`text-[9px] px-0.5 py-0.5 rounded transition-colors ${filterPCD
                                                                ? 'text-blue-600'
                                                                : 'text-gray-400 hover:text-gray-600'
                                                            }`}
                                                        title={filterPCD ? 'Mostrar todos' : 'Filtrar apenas PCDs'}
                                                    >
                                                        <i className="fas fa-filter"></i>
                                                    </button>
                                                </div>
                                            </th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Situação</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Órgão</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Data de Nomeação</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Data de Exoneração</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Data de Publicação da Exoneração</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Data de Nomeação Sem Efeito</th>
                                            <th className="px-1 py-1 text-center font-semibold border border-black bg-white">Observação</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black">
                                {estaCarregando ? (
                                    <tr>
                                        <td colSpan={areaSelecionada === 'VETERANO' ? 6 : 10} className="px-4 py-6 text-center text-orange-600 border border-black">
                                            <div className="flex items-center justify-center space-x-2">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                                                <span>Carregando dados...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={areaSelecionada === 'VETERANO' ? 6 : 10} className="px-4 py-6 text-center text-gray-500 border border-black">
                                            {allAuditors && allAuditors.length > 0
                                                ? `Nenhum candidato encontrado para a área ${areaSelecionada}`
                                                : 'Nenhum dado disponível. Verifique se o arquivo dados.csv foi carregado.'
                                            }
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((item, index) => (
                                        <tr
                                            key={`${item['INSCRICAO'] || index}`}
                                            className={`${getRowColor(item['SITUACAO'], index)} hover:brightness-95 hover:shadow-md transition-all duration-150`}
                                        >
                                            {areaSelecionada === 'VETERANO' ? (
                                                // Layout para área VETERANO
                                                <>
                                                    <td className="px-1 py-0.5 font-medium text-gray-900 text-[10px] border border-black text-left">
                                                        {item['NOME'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['SITUACAO'] || '???'}
                                                    </td>
                                                    <td className="px-1 py-0.5 text-gray-700 text-[10px] border border-black text-center">
                                                        {item['ORGAO_DESTINO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_EXONERACAO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_PUBLICACAO_EXONERACAO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_INATIVIDADE'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_PUBLICACAO_INATIVIDADE'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 text-gray-600 text-[10px] border border-black text-center whitespace-normal">
                                                        {item['OBSERVACAO'] || '-'}
                                                    </td>
                                                </>
                                            ) : (
                                                // Layout padrão para outras áreas
                                                <>
                                                    <td className="px-1 py-0.5 whitespace-nowrap font-medium text-gray-800 text-[10px] border border-black text-center">
                                                        {item['POSICAO_CONCURSO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 font-medium text-gray-900 text-[10px] border border-black text-left">
                                                        {item['NOME'] || '-'}
                                                    </td>
                                                    <td className="px-0.5 py-0.5 whitespace-nowrap text-center text-[10px] border border-black text-gray-700">
                                                        {(item['PCD'] || '').toUpperCase() === 'SIM' ? 'SIM' : 'NÃO'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['SITUACAO'] || '???'}
                                                    </td>
                                                    <td className="px-1 py-0.5 text-gray-700 text-[10px] border border-black text-center">
                                                        {item['ORGAO_DESTINO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_NOMEACAO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_EXONERACAO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_PUBLICACAO_EXONERACAO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 whitespace-nowrap text-gray-700 text-[10px] border border-black text-center">
                                                        {item['DATA_NOMEACAO_SEM_EFEITO'] || '-'}
                                                    </td>
                                                    <td className="px-1 py-0.5 text-gray-600 text-[10px] border border-black text-center whitespace-normal">
                                                        {item['OBSERVACAO'] || '-'}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <footer className="text-center mt-8 text-gray-500 text-sm">
                    <p>&copy; {new Date().getFullYear()} Observatório das Evasões. Dados extraídos do Diário Oficial de Minas Gerais e outras fontes públicas.</p>
                </footer>
            </div>
        </div>
    );
};

export default DetailedTableApp;
import { EvasionData } from './types';

// Custo estimado por auditor que deixa o cargo após a posse (inclui treinamento, salários iniciais, etc.).
// Valor mensal por auditor (usado no cálculo acumulado a partir de jan/2024).
export const COST_PER_AUDITOR = 30000;

// Carrega o arquivo JSON local com os registros brutos.
// O arquivo está em `./data/dados.json` (movido para /evasao/data/ conforme solicitado).
// Formato esperado: array de objetos com campos como 'SITUACAO', 'ÓRGÃO' e 'DATA EXONERAÇÃO'.
import rawData from './data/dados.json';

// Normaliza e agrega os dados para o formato usado pela UI: { destination, count }
const raw = Array.isArray(rawData) ? rawData as any[] : [];

// Considerar como evasão os auditores cuja SITUACAO é 'NOMEADO E EXONERADO' ou 'DESISTENTE'.
const isEvasionSituation = (s: any) => {
  if (!s) return false;
  const normalized = String(s).toUpperCase().trim();
  return normalized === 'NOMEADO E EXONERADO' || normalized === 'DESISTENTE';
};

// Lista de todos os auditores cuja situação é considerada evasão.
export const EVASION_AUDITORS = raw.filter(rec => {
  const situacao = rec['SITUACAO'] ?? rec['Situação'] ?? rec['situacao'];
  return isEvasionSituation(situacao);
});

// Agregação para a tabela: considerar apenas registros com ÓRGÃO informado (destinos).
const map = new Map<string, number>();
for (const rec of EVASION_AUDITORS) {
  const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
  if (org === null || org === undefined) continue; // pular sem destino
  const key = String(org).trim();
  if (key === '') continue; // pular strings vazias
  const prev = map.get(key) ?? 0;
  map.set(key, prev + 1);
}

// Conta quantos registros não têm órgão preenchido — serão mostrados como "Destino desconhecido"
const unknownCount = EVASION_AUDITORS.reduce((sum, rec) => {
  const org = rec['ÓRGÃO'] ?? rec['ORGAO'] ?? rec['Orgao'];
  return sum + (org === null || org === undefined || String(org).trim() === '' ? 1 : 0);
}, 0);

export const EVASION_DATA: EvasionData[] = (() => {
  const arr = Array.from(map.entries()).map(([destination, count]) => ({ destination, count }));
  if (unknownCount > 0) {
    arr.push({ destination: 'Destino desconhecido', count: unknownCount });
  }
  return arr.sort((a, b) => b.count - a.count);
})();

// Número total de evasões considerando todos os auditores com situação de evasão.
export const AUDITORS_WHO_LEFT_AFTER_POSSE = EVASION_AUDITORS.length;

// Determina a última data de exoneração presente nos registros (para usar como referência).
function parseBrazilDate(d: any): Date | null {
  if (!d || typeof d !== 'string') return null;
  // formato esperado: DD/MM/YYYY
  const parts = d.split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const year = Number(parts[2]);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day, 10, 0, 0));
}

let lastDate: Date | null = null;
for (const rec of EVASION_AUDITORS) {
  const d = rec['DATA EXONERAÇÃO'] ?? rec['Data Exoneração'] ?? rec['data exoneração'] ?? rec['data exoneração'];
  const parsed = parseBrazilDate(d);
  if (parsed && (!lastDate || parsed.getTime() > lastDate.getTime())) {
    lastDate = parsed;
  }
}

// Se não houver data encontrada, manter a data anterior como fallback.
export const LAST_EVASION_DATE = lastDate ?? new Date('2024-07-15T10:00:00Z');

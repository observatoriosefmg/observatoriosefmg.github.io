import { EvasionData } from './types';

// Data da última evasão registrada. O contador de dias será calculado a partir daqui.
export const LAST_EVASION_DATE = new Date('2024-07-15T10:00:00Z');

// Custo estimado por auditor que deixa o cargo após a posse (inclui treinamento, salários iniciais, etc.).
export const COST_PER_AUDITOR = 50000;

// Dados simulados sobre para onde os auditores foram ou por que não tomaram posse.
export const EVASION_DATA: EvasionData[] = [
  { destination: 'Receita Federal do Brasil', count: 15 },
  { destination: 'Tribunal de Contas da União (TCU)', count: 8 },
  { destination: 'Consultor Legislativo - Senado Federal', count: 5 },
  { destination: 'Secretaria da Fazenda de outro Estado', count: 12 },
  { destination: 'Iniciativa Privada (Área Fiscal/Tributária)', count: 4 },
  { destination: 'Retorno ao Cargo Antigo (Outros)', count: 7 },
  { destination: 'Desistência de Posse (Aprovados em outros concursos)', count: 25 },
];

// O número de auditores que saíram após tomar posse é a soma de todos, exceto os que desistiram da posse.
export const AUDITORS_WHO_LEFT_AFTER_POSSE = EVASION_DATA
  .filter(item => !item.destination.toLowerCase().includes('desistência'))
  .reduce((sum, item) => sum + item.count, 0);

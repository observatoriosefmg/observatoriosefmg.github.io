import { DadosDestinoEvasao } from './types';

// Custo estimado por auditor que deixa o cargo após a posse (usado no cálculo acumulado a partir de jan/2024).
export const COST_PER_AUDITOR = 30000;

// Este arquivo não carrega mais dados estáticos em tempo de build para evitar
// problemas quando o arquivo `dados.json` não é um JSON válido durante o empacotamento.
// A leitura dos dados passa a ser feita em runtime pelo `App.tsx` a partir de `dados.csv`.

// Valor fallback para a última exoneração quando não houver dados — usado apenas como fallback.
export const DATA_INICIO_OBSERVACAO = new Date('2024-01-01T10:00:00Z');

// Tipagem auxiliar exportada para quem quiser reusar a forma de DadosDestinoEvasao.
export type { DadosDestinoEvasao };

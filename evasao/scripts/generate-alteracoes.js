import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const relativeDataPathLocal = 'data/dados.csv';
const dataFile = path.resolve(cwd, relativeDataPathLocal);
const outputMetaFile = path.resolve(cwd, 'public/alteracoes.json');
const outputRecordFile = path.resolve(cwd, 'public/alteracoes-registros.json');
const maxCommits = 20;

const runGit = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} falhou`);
  }
  return result.stdout;
};

const gitRoot = runGit(['rev-parse', '--show-toplevel']).trim();
const relativeDataPathRepo = path.relative(gitRoot, dataFile).split(path.sep).join('/');

const safeRunGit = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
};

const parseCsv = (text) => {
  const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').filter(Boolean);
  if (lines.length === 0) return [];

  const normalizeHeader = (header) => header.replace(/^\uFEFF/, '').trim().toUpperCase();
  const canonicalHeader = (header) => {
    const normalized = normalizeHeader(header);
    if (normalized === 'HGV-0') return 'MASP';
    return normalized;
  };

  const parseLine = (line) => {
    const values = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (char === ';' && !quoted) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    values.push(current);
    return values;
  };

  const headers = parseLine(lines[0]).map((value) => canonicalHeader(value));
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    while (values.length < headers.length) values.push('');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index].trim() : null;
    });
    return row;
  });

  return rows;
};

const normalizeValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeKey = (value) => normalizeValue(value).toUpperCase();

const keyForRecord = (record) => {
  const key = normalizeValue(record['MASP'] ?? record['HGV-0'] ?? record['INSCRICAO'] ?? record['NOME']);
  return key ? normalizeKey(key) : null;
};

const isRelevantSituationChange = (beforeSituation, afterSituation) => {
  const from = normalizeValue(beforeSituation).toUpperCase();
  const to = normalizeValue(afterSituation).toUpperCase();

  const fromExercise = ['EM EXERCÍCIO', 'EM EXERCICIO'];
  const toSecondGroup = ['EXONERADO', 'APOSENTADO', 'AFASTAMENTO PRELIMINAR À APOSENTADORIA'];
  const fromReserve = ['NOMEADO', 'CADASTRO DE RESERVA', 'CADASTRO DE RESERVAS'];
  const toDesistente = 'DESISTENTE';

  return (
    (fromExercise.includes(from) && toSecondGroup.includes(to)) ||
    (fromReserve.includes(from) && to === toDesistente)
  );
};

const compareRecords = (previous, current) => {
  const previousByMasp = new Map();
  const currentByMasp = new Map();
  const changes = [];

  previous.forEach((row) => {
    const masp = keyForRecord(row);
    if (!masp) return;
    previousByMasp.set(masp, row);
  });

  current.forEach((row) => {
    const masp = keyForRecord(row);
    if (!masp) return;
    currentByMasp.set(masp, row);
  });

  for (const [masp, after] of currentByMasp.entries()) {
    const before = previousByMasp.get(masp);
    if (!before) continue;

    const beforeSituacao = normalizeValue(before['SITUACAO']);
    const afterSituacao = normalizeValue(after['SITUACAO']);
    if (!isRelevantSituationChange(beforeSituacao, afterSituacao)) continue;

    changes.push({
      masp,
      inscricao: normalizeValue(after['INSCRICAO'] ?? before['INSCRICAO']),
      nome: normalizeValue(after['NOME'] || before['NOME']),
      fromSituacao: beforeSituacao,
      toSituacao: afterSituacao,
      orgaoDestino: normalizeValue(after['ORGAO_DESTINO'] || before['ORGAO_DESTINO']),
      before: {
        MASP: normalizeValue(before['MASP']),
        INSCRICAO: normalizeValue(before['INSCRICAO']),
        NOME: normalizeValue(before['NOME']),
        SITUACAO: beforeSituacao,
        ORGAO_DESTINO: normalizeValue(before['ORGAO_DESTINO']),
      },
      after: {
        MASP: normalizeValue(after['MASP']),
        INSCRICAO: normalizeValue(after['INSCRICAO']),
        NOME: normalizeValue(after['NOME']),
        SITUACAO: afterSituacao,
        ORGAO_DESTINO: normalizeValue(after['ORGAO_DESTINO']),
      },
    });
  }

  return changes;
};

const gitLogOutput = runGit([
  'log',
  '--reverse',
  '--pretty=format:%H%x1f%ad%x1f%an%x1f%s',
  '--date=iso-strict',
  '--',
  relativeDataPathLocal,
]);

const commits = gitLogOutput
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((linha) => {
    const [hash, date, author, message] = linha.split('\x1f');
    return {
      hash,
      date,
      author,
      message,
    };
  });

const history = [];
let previousRecords = [];

for (const commit of commits) {
  const commitCsv = safeRunGit(['show', `${commit.hash}:${relativeDataPathRepo}`]);
  if (!commitCsv) {
    continue;
  }

  const currentRecords = parseCsv(commitCsv);
  const changes = previousRecords.length > 0 ? compareRecords(previousRecords, currentRecords) : [];

  if (changes.length > 0) {
    history.push({
      commit,
      changeCount: changes.length,
      changes,
    });
  }

  previousRecords = currentRecords;
}

const changedFile = {
  sourceFile: relativeDataPathLocal,
  generatedAt: new Date().toISOString(),
  commitCount: commits.length,
  totalChangeCount: history.reduce((sum, item) => sum + item.changeCount, 0),
  history,
};

const resultado = {
  sourceFile: relativeDataPathLocal,
  generatedAt: new Date().toISOString(),
  commitCount: commits.length,
  commits,
};

fs.mkdirSync(path.dirname(outputMetaFile), { recursive: true });
fs.writeFileSync(outputMetaFile, JSON.stringify(resultado, null, 2) + '\n', 'utf8');
fs.writeFileSync(outputRecordFile, JSON.stringify(changedFile, null, 2) + '\n', 'utf8');

console.log(`Arquivo gerado: ${outputMetaFile} (${commits.length} commits)`);
console.log(`Arquivo gerado: ${outputRecordFile} (${changedFile.totalChangeCount} registros alterados)`);

// Armazenamento em um JSON só (data/state.json), escrita atômica.
// Simples de propósito: um usuário, poucas centenas de itens.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const dataDir = () => path.resolve(process.env.ASSISTENTE_DATA || 'data');

const EMPTY = () => ({ routines: {}, drafts: [], needs: [], uploads: [], log: [] });

export function load() {
  const file = path.join(dataDir(), 'state.json');
  if (!fs.existsSync(file)) return EMPTY();
  return { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function save(state) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `state.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, path.join(dir, 'state.json'));
}

// Lê, aplica a mudança e grava. Tudo síncrono, então não há corrida dentro de um processo.
export function mutate(fn) {
  const state = load();
  const result = fn(state);
  save(state);
  return result;
}

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
export const now = () => new Date().toISOString();

export function addLog(state, msg, extra = {}) {
  state.log.unshift({ at: now(), msg, ...extra });
  state.log.length = Math.min(state.log.length, 500);
}

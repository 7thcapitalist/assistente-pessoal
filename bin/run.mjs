#!/usr/bin/env node
// node bin/run.mjs <id> [--dry]   --dry imprime os rascunhos sem gravar nada.
import { openDb } from '../src/db.mjs';
import { loadRoutines, runRoutine } from '../src/runner.mjs';

const [id, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');
const { routines, errors } = await loadRoutines();
if (!id || !routines.has(id)) {
  console.error(`uso: node bin/run.mjs <id> [--dry]\nrotinas: ${[...routines.keys()].join(', ') || '(nenhuma)'}`);
  for (const e of errors) console.error(`inválida ${e.id}: ${e.error}`);
  process.exit(2);
}
const res = await runRoutine(openDb(), routines.get(id), { dry });
console.log(JSON.stringify(res, null, 2));
process.exit(res.ok ? 0 : 1);

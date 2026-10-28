#!/usr/bin/env node
// Um ciclo do agendador: roda rotinas vencidas e publica o que o João aprovou. Chamado pelo systemd timer.
import { openDb } from '../src/db.mjs';
import { tick } from '../src/runner.mjs';

const res = await tick(openDb());
for (const r of res.ran) console.log(`rotina ${r.id}: ${r.ok ? 'ok' : 'erro ' + r.error} (${r.drafts.length} rascunhos)`);
for (const p of res.published) console.log(`publicação ${p.id}: ${p.ok ? p.url ?? 'ok' : 'falhou ' + p.error}`);
for (const e of res.errors) console.error(`rotina inválida ${e.id}: ${e.error}`);

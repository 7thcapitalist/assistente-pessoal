import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/db.mjs';
import { matches, nextRun, lastDue, parseCron } from '../src/cron.mjs';
import { tick, loadRoutines, runRoutine } from '../src/runner.mjs';
import { createApp } from '../src/server.mjs';
import { createServer } from 'node:http';

const routineSrc = (extra = '') => `export default { id: 'r1', name: 'R1', channel: 'linkedin', defaultSchedule: '0 8 * * *',
  async run(ctx) { ctx.createDraft({ title: 'T', body: 'B' }); },
  async publish(d) { ${extra} return { url: 'https://x.test/' + d.id }; } };`;
function dirWith(src) {
  const d = mkdtempSync(join(tmpdir(), 'rt-')); mkdirSync(join(d, 'r1')); writeFileSync(join(d, 'r1', 'index.mjs'), src); return d;
}

test('cron: lista, faixa, passo e fuso São Paulo', () => {
  // 11:00Z = 08:00 em São Paulo (UTC-3), segunda 2026-10-26
  assert.ok(matches('0 8 * * 1,3,5', new Date('2026-10-26T11:00:00Z')));
  assert.ok(!matches('0 8 * * 1,3,5', new Date('2026-10-27T11:00:00Z')));
  assert.ok(matches('*/15 9-10 * * *', new Date('2026-10-26T12:45:00Z')));
  assert.equal(nextRun('0 8 * * 1,3,5', new Date('2026-10-26T12:00:00Z')).toISOString(), '2026-10-28T11:00:00.000Z');
  assert.throws(() => parseCron('* * *'));
  assert.throws(() => parseCron('61 * * * *'));
  assert.equal(lastDue('0 8 * * *', new Date('2026-10-26T00:00:00Z'), new Date('2026-10-26T15:00:00Z')).toISOString(), '2026-10-26T11:00:00.000Z');
});

test('tick: rotina desligada não roda; ligada roda uma vez por marca', async () => {
  const db = store.openDb(':memory:'), dir = dirWith(routineSrc());
  const at = new Date('2026-10-26T11:00:30Z');
  assert.equal((await tick(db, { at, dir })).ran.length, 0);
  store.updateRoutine(db, 'r1', { enabled: true });
  assert.equal((await tick(db, { at, dir })).ran.length, 1);
  assert.equal(store.listDrafts(db, { status: 'pending' }).length, 1);
  assert.equal((await tick(db, { at: new Date('2026-10-26T11:05:00Z'), dir })).ran.length, 0);
});

test('nada é publicado sem aprovar; aprovado publica e vai pro histórico', async () => {
  const db = store.openDb(':memory:'), dir = dirWith(routineSrc());
  store.upsertRoutine(db, 'r1', { schedule: '0 8 * * *' }); store.updateRoutine(db, 'r1', { enabled: true });
  await tick(db, { at: new Date('2026-10-26T11:00:30Z'), dir });
  const [d] = store.listDrafts(db, { status: 'pending' });
  const r1 = await tick(db, { at: new Date('2026-10-26T11:10:00Z'), dir });
  assert.equal(r1.published.length, 0);
  store.decide(db, d.id, 'approve');
  const r2 = await tick(db, { at: new Date('2026-10-26T11:15:00Z'), dir });
  assert.equal(r2.published.length, 1);
  assert.equal(store.getDraft(db, d.id).status, 'published');
});

test('scheduledFor futuro segura a publicação; falha de publish vira failed', async () => {
  const db = store.openDb(':memory:'), dir = dirWith(routineSrc("throw new Error('NEEDS_CONNECT: link');"));
  const { routines } = await loadRoutines(dir);
  const d = store.createDraft(db, 'r1', 'linkedin', { title: 'a', body: 'b', scheduledFor: '2026-11-01T00:00:00Z' });
  store.decide(db, d.id, 'approve');
  const { publishApproved } = await import('../src/runner.mjs');
  assert.equal((await publishApproved(db, routines, new Date('2026-10-30T00:00:00Z'))).length, 0);
  const out = await publishApproved(db, routines, new Date('2026-11-02T00:00:00Z'));
  assert.equal(out[0].ok, false);
  assert.match(store.getDraft(db, d.id).error, /NEEDS_CONNECT/);
});

test('dry-run não grava; rotina inválida é reportada', async () => {
  const db = store.openDb(':memory:'), dir = dirWith(routineSrc());
  const { routines } = await loadRoutines(dir);
  const res = await runRoutine(db, routines.get('r1'), { dry: true });
  assert.equal(res.drafts.length, 1);
  assert.equal(store.listDrafts(db).length, 0);
  const bad = dirWith("export default { id: 'outro', name: 'x', channel: 'linkedin', run() {} }");
  assert.match((await loadRoutines(bad)).errors[0].error, /nome da pasta/);
});

test('rascunho exige title e body; editar só pendente', () => {
  const db = store.openDb(':memory:');
  assert.throws(() => store.createDraft(db, 'r', 'linkedin', { title: '', body: 'x' }));
  const d = store.createDraft(db, 'r', 'linkedin', { title: 'a', body: 'b' });
  assert.equal(store.editDraft(db, d.id, { body: 'novo' }).body, 'novo');
  store.decide(db, d.id, 'reject');
  assert.throws(() => store.editDraft(db, d.id, { body: 'x' }));
  assert.throws(() => store.decide(db, d.id, 'approve'));
});

test('API: exige cabeçalho CSRF, aprova pelo painel', async () => {
  const db = store.openDb(':memory:'), dir = dirWith(routineSrc());
  const srv = createServer(createApp(db, { routinesDir: dir })); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const d = store.createDraft(db, 'r1', 'linkedin', { title: 'a', body: 'b' });
  const noHdr = await fetch(`${base}/api/drafts/${d.id}/approve`, { method: 'POST' });
  assert.equal(noHdr.status, 403);
  const ok = await fetch(`${base}/api/drafts/${d.id}/approve`, { method: 'POST', headers: { 'x-assistente': '1' } });
  assert.equal(ok.status, 200);
  assert.equal(store.getDraft(db, d.id).status, 'published');
  const st = await (await fetch(`${base}/api/state`)).json();
  assert.equal(st.history.length, 1); assert.equal(st.routines[0].id, 'r1');
  assert.equal((await fetch(`${base}/media?p=/etc/passwd`)).status, 404);
  assert.equal((await fetch(`${base}/`)).status, 200);
  srv.close();
});

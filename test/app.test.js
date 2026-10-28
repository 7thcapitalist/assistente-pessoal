import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ASSISTENTE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'assist-'));
const { createServer } = await import('../src/server.js');
const { isDue, tick } = await import('../src/scheduler.js');

let server; let base;
before(async () => { server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); fs.rmSync(process.env.ASSISTENTE_DATA, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const overview = async () => (await fetch(`${base}/api/overview`)).json();

test('rascunho: criar, editar, aprovar, recusar', async () => {
  assert.equal((await post('/api/drafts', { channel: 'tiktok', title: 'x', body: 'y' })).status, 400);
  const d = await (await post('/api/drafts', { channel: 'linkedin', title: 'T', body: 'corpo' })).json();
  assert.equal(d.status, 'pending');
  const ed = await (await post(`/api/drafts/${d.id}/edit`, { body: 'novo' })).json();
  assert.equal(ed.body, 'novo');
  assert.equal((await (await post(`/api/drafts/${d.id}/approve`, {})).json()).status, 'approved');
  assert.equal((await (await post(`/api/drafts/${d.id}/edit`, { body: 'mudou' })).json()).status, 'pending', 'editar exige reaprovar');
  assert.equal((await (await post(`/api/drafts/${d.id}/reject`, { reason: 'nao' })).json()).status, 'rejected');
  assert.equal((await post('/api/drafts/inexistente/approve', {})).status, 404);
});

test('precisa do João: criar e resolver', async () => {
  const n = await (await post('/api/needs', { type: 'gravar', title: 'Gravar', instruction: 'diga oi' })).json();
  assert.ok((await overview()).needs.some((x) => x.id === n.id));
  await post(`/api/needs/${n.id}/done`, {});
  assert.ok(!(await overview()).needs.some((x) => x.id === n.id));
});

test('upload de vídeo pelo celular', async () => {
  const r = await fetch(`${base}/api/uploads?name=${encodeURIComponent('../../evil.mp4')}`, { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: Buffer.from('fake') });
  assert.equal(r.status, 201);
  const u = await r.json();
  assert.equal(u.name, 'evil.mp4');
  assert.ok(fs.existsSync(path.join(process.env.ASSISTENTE_DATA, u.path)));
  assert.equal((await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/html' }, body: '<x>' })).status, 415);
});

test('CSRF: origem estranha é bloqueada', async () => {
  assert.equal((await post('/api/drafts', { channel: 'linkedin', title: 'a', body: 'b' }, { origin: 'http://evil.example' })).status, 403);
});

test('agendador: horário e dias', () => {
  const cfg = { enabled: true, time: '08:00', days: [1] };
  const seg9h = new Date('2026-11-02T12:00:00Z'); // segunda 09:00 BRT
  assert.equal(isDue(cfg, null, seg9h), true);
  assert.equal(isDue(cfg, { at: seg9h.toISOString() }, new Date('2026-11-02T20:00:00Z')), false, 'já rodou hoje');
  assert.equal(isDue(cfg, null, new Date('2026-11-02T10:00:00Z')), false, 'antes das 08:00');
  assert.equal(isDue(cfg, null, new Date('2026-11-03T12:00:00Z')), false, 'dia errado');
  assert.equal(isDue({ ...cfg, enabled: false }, null, seg9h), false);
});

test('publicador: aprovado sem conexão vira "precisa do João" e não publica; pendente nunca sai', async () => {
  const ok = await (await post('/api/drafts', { channel: 'instagram', title: 'A', body: 'b' })).json();
  const pend = await (await post('/api/drafts', { channel: 'instagram', title: 'P', body: 'b' })).json();
  await post(`/api/drafts/${ok.id}/approve`, {});
  await tick({ only: 'publisher', force: true });
  const o = await overview();
  assert.equal(o.drafts.find((d) => d.id === ok.id).status, 'approved');
  assert.equal(o.drafts.find((d) => d.id === pend.id).status, 'pending');
  assert.ok(o.needs.some((n) => n.title === 'Conectar instagram'));
});

test('rotina: ligar/desligar e horário', async () => {
  const r = await (await post('/api/routines/linkedin-posts', { enabled: false, time: '07:30', days: [2, 4] })).json();
  assert.deepEqual([r.enabled, r.time, r.days], [false, '07:30', [2, 4]]);
  assert.equal((await post('/api/routines/linkedin-posts', { time: '25:00' })).status, 400);
});

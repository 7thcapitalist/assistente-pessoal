import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../src/db.mjs';
import { passoAusente, setModoAusente, motivoNaoElegivel, VETO_MS } from '../src/ausente.mjs';

function fakePc() {
  const issues = new Map(), said = [];
  return { issues, said,
    async getIssue(id) { return issues.get(id); },
    async say(link, body) { said.push({ id: link.issueId, body }); } };
}
const T0 = new Date('2026-11-12T12:00:00Z');
const linkar = (db, pc, d) => { pc.issues.set(`i-${d.id}`, { status: 'in_review' }); store.stateStore(db, '_paperclip').set(`d:${d.id}`, { issueId: `i-${d.id}`, seenCom: [] }); };
const linkedin = (db, o = {}) => store.createDraft(db, 'linkedin-posts', 'linkedin', { title: 'Lição', body: 'Texto', meta: { tema: 'interno' }, ...o });
const carrossel = (db, o = {}) => store.createDraft(db, 'instagram-ia', 'instagram', { title: 'Carrossel', body: 'Legenda', meta: { formato: 'carrossel', tema: 'como_eu_faco' }, ...o });

test('elegibilidade: texto LinkedIn e carrossel entram; reel, tema novo, gravação e canal fora não', () => {
  const db = store.openDb(':memory:');
  assert.equal(motivoNaoElegivel(linkedin(db)), null);
  assert.equal(motivoNaoElegivel(carrossel(db)), null);
  assert.match(motivoNaoElegivel(linkedin(db, { meta: { tema: 'novo' } })), /não aprovado/);
  assert.match(motivoNaoElegivel(store.createDraft(db, 'instagram-ia', 'instagram', { title: 'R', body: 'x', meta: { formato: 'reel', tema: 'bastidores', tipo: 'B' }, processing: true })), /status|reel/);
  const reelPend = store.createDraft(db, 'instagram-ia', 'instagram', { title: 'R', body: 'x', meta: { formato: 'reel', tema: 'bastidores', tipo: 'B' }, media: [{ kind: 'video_final', path: '/x.mp4' }] });
  assert.match(motivoNaoElegivel(reelPend), /reel/);
  const rec = store.createDraft(db, 'instagram-ia', 'instagram', { title: 'R', body: 'x', meta: { formato: 'carrossel', tema: 'bastidores' }, needs: [{ type: 'record_audio', script: 's' }], media: [{ kind: 'slide', path: '/s.jpg' }] });
  assert.match(motivoNaoElegivel(rec), /gravação/);
  const email = store.createDraft(db, 'x', 'email', { title: 'E', body: 'x', meta: { tema: 'interno' } });
  assert.match(motivoNaoElegivel(email), /canal/);
  assert.match(motivoNaoElegivel(carrossel(db, { meta: { formato: 'bastidores', tema: 'ia_no_mundo', noticia: true } })), /fonte/);
});

test('modo DESLIGADO: nada é avisado nem aprovado', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), d = linkedin(db);
  linkar(db, pc, d);
  assert.deepEqual(await passoAusente(db, pc, T0), []);
  assert.deepEqual(await passoAusente(db, pc, new Date(+T0 + 3 * VETO_MS)), []);
  assert.equal(store.getDraft(db, d.id).status, 'pending');
  assert.equal(pc.said.length, 0);
});

test('modo ATIVO: avisa, espera 24 h, aprova sozinho e avisa na tarefa', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), d = linkedin(db);
  setModoAusente(db, true); linkar(db, pc, d);
  assert.equal((await passoAusente(db, pc, T0))[0].draft, d.id);
  assert.match(pc.said[0].body, /Modo ausente.*Cancel/s);
  assert.deepEqual(await passoAusente(db, pc, new Date(+T0 + VETO_MS - 60e3)), []); // ainda dentro do prazo
  assert.equal(store.getDraft(db, d.id).status, 'pending');
  const r = await passoAusente(db, pc, new Date(+T0 + VETO_MS));
  assert.equal(r[0].aprovado, true);
  assert.equal(store.getDraft(db, d.id).status, 'approved');
  assert.match(pc.said[1].body, /aprovado automaticamente/);
});

test('veto (Cancel na tarefa) impede a aprovação mesmo antes da ponte ler', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), d = linkedin(db);
  setModoAusente(db, true); linkar(db, pc, d);
  await passoAusente(db, pc, T0);
  pc.issues.get(`i-${d.id}`).status = 'cancelled';
  assert.deepEqual(await passoAusente(db, pc, new Date(+T0 + 2 * VETO_MS)), []);
  assert.equal(store.getDraft(db, d.id).status, 'pending');
});

test('texto editado depois do aviso recomeça as 24 h', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), d = linkedin(db);
  setModoAusente(db, true); linkar(db, pc, d);
  await passoAusente(db, pc, T0);
  store.editDraft(db, d.id, { body: 'Texto novo' });
  const t1 = new Date(+T0 + 20 * 3600e3);
  assert.ok((await passoAusente(db, pc, t1))[0].avisado);
  assert.deepEqual(await passoAusente(db, pc, new Date(+T0 + VETO_MS + 60e3)), []);
  assert.equal(store.getDraft(db, d.id).status, 'pending');
});

test('reel e tema novo nunca são aprovados, mesmo com o modo ativo', async () => {
  const db = store.openDb(':memory:'), pc = fakePc();
  setModoAusente(db, true);
  const a = linkedin(db, { meta: { tema: 'novo' } });
  const b = store.createDraft(db, 'instagram-ia', 'instagram', { title: 'R', body: 'x', meta: { formato: 'reel', tema: 'bastidores', tipo: 'A' }, media: [{ kind: 'video_final', path: '/x.mp4' }] });
  linkar(db, pc, a); linkar(db, pc, b);
  await passoAusente(db, pc, T0);
  await passoAusente(db, pc, new Date(+T0 + 5 * VETO_MS));
  assert.equal(pc.said.length, 0);
  assert.equal(store.getDraft(db, a.id).status, 'pending');
  assert.equal(store.getDraft(db, b.id).status, 'pending');
});

test('desligar o modo devolve à fila o que ele aprovou, sem tocar no que o João aprovou', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), auto = linkedin(db), manual = linkedin(db, { title: 'Outro' });
  setModoAusente(db, true); linkar(db, pc, auto);
  await passoAusente(db, pc, T0);
  await passoAusente(db, pc, new Date(+T0 + VETO_MS));
  store.decide(db, manual.id, 'approve');
  setModoAusente(db, false);
  await passoAusente(db, pc, new Date(+T0 + VETO_MS));
  assert.equal(store.getDraft(db, auto.id).status, 'pending');
  assert.equal(store.getDraft(db, manual.id).status, 'approved');
});

test('sem a ponte do Paperclip (sem como avisar) nada é automático', async () => {
  const db = store.openDb(':memory:'); linkedin(db); setModoAusente(db, true);
  assert.deepEqual(await passoAusente(db, null, new Date(+T0 + 5 * VETO_MS)), []);
});

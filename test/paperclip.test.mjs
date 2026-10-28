import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/db.mjs';
import { syncDrafts, syncConnections, salvarEnv } from '../src/paperclip.mjs';

// Paperclip falso em memória: o teste faz o papel do João mexendo em issues/comments/attachments.
function fakePc() {
  const issues = new Map(), coms = new Map(), atts = new Map(), uploads = [];
  let n = 0, c = 0;
  const pc = {
    issues, coms, atts, uploads,
    async createIssue(b) { const id = `i${++n}`; issues.set(id, { id, identifier: `ASS-${n}`, ...b }); coms.set(id, []); atts.set(id, []); return issues.get(id); },
    async getIssue(id) { return issues.get(id); },
    async patchIssue(id, b) { Object.assign(issues.get(id), b); return issues.get(id); },
    async comment(id, body) { const x = { id: `c${++c}`, body }; coms.get(id).push(x); return x; },
    async say(link, body) { const x = await pc.comment(link.issueId, body); link.seenCom.push(x.id); return x; },
    async comments(id) { return coms.get(id); },
    async attachments(id) { return atts.get(id); },
    async download(a, to) { writeFileSync(to.replace(/[^/]+$/, '') + '/../x', ''); return to; },
    async upload(id, path, mime) { uploads.push({ id, path, mime }); return {}; },
  };
  pc.download = async (a, to) => { const { mkdirSync } = await import('node:fs'); mkdirSync(join(to, '..'), { recursive: true }); writeFileSync(to, 'video'); return to; };
  return pc;
}
const post = (db) => store.createDraft(db, 'linkedin-posts', 'linkedin', { title: 'Lição', body: 'Texto do post', scheduledFor: '2026-11-02T11:00:00Z' });
const reel = (db) => store.createDraft(db, 'instagram-ia', 'instagram', { title: 'Reel A', body: 'Legenda', needs: [{ type: 'record_video', script: 'Fale 30s.' }] });

test('rascunho vira tarefa do João; Done aprova, Cancel recusa', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), media = mkdtempSync(join(tmpdir(), 'm-'));
  const a = post(db), b = post(db);
  const r1 = await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(r1.filter((x) => x.created).length, 2);
  const [ia, ib] = [...pc.issues.values()];
  assert.equal(ia.status, 'in_review'); assert.equal(ia.assigneeUserId, undefined); // o assignee padrão vem do makePaperclip
  assert.match(ia.description, /Done/);
  ia.status = 'done'; ib.status = 'cancelled';
  await syncDrafts(db, pc, { mediaDir: media });
  const st = Object.fromEntries([a, b].map((d) => [d.id, store.getDraft(db, d.id).status]));
  assert.deepEqual(Object.values(st).sort(), ['approved', 'rejected']);
  // segundo ciclo sem mudança não repete nada
  const antes = [...pc.coms.values()].flat().length;
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal([...pc.coms.values()].flat().length, antes);
});

test('comentário "Texto:" troca o texto; comentário do próprio robô é ignorado', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), media = mkdtempSync(join(tmpdir(), 'm-'));
  const d = post(db);
  await syncDrafts(db, pc, { mediaDir: media });
  const [i] = pc.issues.values();
  await pc.comment(i.id, 'Texto: versão nova do post');
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(store.getDraft(db, d.id).body, 'versão nova do post');
  assert.match(i.description, /versão nova do post/);
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(store.getDraft(db, d.id).body, 'versão nova do post');
});

test('Reel A: anexo de vídeo na tarefa vai para edição e o vídeo pronto volta anexado', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), media = mkdtempSync(join(tmpdir(), 'm-'));
  const d = reel(db);
  await syncDrafts(db, pc, { mediaDir: media });
  const [i] = pc.issues.values();
  assert.equal(i.status, 'todo'); assert.match(i.description, /Fale 30s/); assert.match(i.title, /gravar/);
  pc.atts.get(i.id).push({ id: 'a1', contentType: 'image/png', originalFilename: 'x.png' }, { id: 'a2', contentType: 'video/quicktime', originalFilename: 'bruto.mov' });
  await syncDrafts(db, pc, { mediaDir: media });
  let x = store.getDraft(db, d.id);
  assert.equal(x.status, 'processing'); assert.equal(x.media[0].kind, 'video_raw'); assert.ok(existsSync(x.media[0].path));
  assert.equal(i.status, 'in_progress');
  const final = join(media, 'final.mp4'); writeFileSync(final, 'mp4');
  store.finishProcessing(db, d.id, { media: [{ kind: 'video_final', path: final }] });
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(i.status, 'in_review'); assert.equal(pc.uploads.length, 1);
  i.status = 'done';
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(store.getDraft(db, d.id).status, 'approved');
});

test('Done antes do arquivo reabre a tarefa; falha de publicação bloqueia e Done tenta de novo', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), media = mkdtempSync(join(tmpdir(), 'm-'));
  reel(db); const p = post(db);
  await syncDrafts(db, pc, { mediaDir: media });
  const all = [...pc.issues.values()]; const ir = all.find((x) => x.projectId && /gravar/.test(x.title)), ip = all.find((x) => /aprovar/.test(x.title));
  ir.status = 'done';
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(ir.status, 'todo');
  ip.status = 'done';
  await syncDrafts(db, pc, { mediaDir: media });
  store.claimForPublish(db, p.id); store.markFailed(db, p.id, 'NEEDS_CONNECT: conecte');
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(ip.status, 'blocked');
  assert.match(pc.coms.get(ip.id).at(-1).body, /Conectar/);
  ip.status = 'done';
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(store.getDraft(db, p.id).status, 'approved');
});

test('conexões: cria tarefa com link, guarda o @, "link novo" gera outro e fecha quando conecta', async () => {
  const db = store.openDb(':memory:'), pc = fakePc();
  let ativa = null, links = 0;
  const composio = { call: async () => ({ data: { results: { instagram: { redirect_url: `https://connect/${++links}` } } } }) };
  const conexoes = { instagram: { titulo: 'Conectar IG', ativa: async () => ativa, texto: (l) => `abra ${l}` } };
  await syncConnections(db, pc, composio, { conexoes });
  const [i] = pc.issues.values();
  assert.match(i.description, /connect\/1/);
  // nada muda enquanto não conecta; "link novo" gera outro; o comentário do robô não dispara de novo
  await pc.comment(i.id, 'link novo');
  await syncConnections(db, pc, composio, { conexoes });
  await syncConnections(db, pc, composio, { conexoes });
  assert.equal(pc.issues.size, 1); assert.equal(links, 2);
  assert.match(pc.coms.get(i.id).at(-1).body, /connect\/2/);
  ativa = { user_info: { username: 'joao.empresasia' } };
  await syncConnections(db, pc, composio, { conexoes });
  assert.equal(i.status, 'done');
  assert.match(pc.coms.get(i.id).at(-1).body, /joao\.empresasia/);
});

test('salvarEnv troca só a chave pedida e mantém o resto', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'env-')), 'env');
  writeFileSync(f, 'A=1\nINSTAGRAM_IA_USERNAME=velho\n');
  salvarEnv('INSTAGRAM_IA_USERNAME', 'novo', f);
  assert.equal(readFileSync(f, 'utf8'), 'A=1\nINSTAGRAM_IA_USERNAME=novo\n');
});

test('carrossel: slides prontos voltam anexados na tarefa', async () => {
  const db = store.openDb(':memory:'), pc = fakePc(), media = mkdtempSync(join(tmpdir(), 'm-'));
  const d = store.createDraft(db, 'instagram-ia', 'instagram', { title: 'Carrossel · x', body: 'legenda', meta: { formato: 'carrossel' }, processing: true });
  await syncDrafts(db, pc, { mediaDir: media });
  const [i] = pc.issues.values();
  const a = join(media, 'slide-01.jpg'), b = join(media, 'slide-02.jpg'); writeFileSync(a, 'x'); writeFileSync(b, 'y');
  store.finishProcessing(db, d.id, { media: [{ kind: 'slide', path: a, mime: 'image/jpeg' }, { kind: 'slide', path: b, mime: 'image/jpeg' }] });
  await syncDrafts(db, pc, { mediaDir: media });
  assert.equal(i.status, 'in_review'); assert.equal(pc.uploads.length, 2);
  assert.match(pc.coms.get(i.id).at(-1).body, /2 slides anexados/);
});

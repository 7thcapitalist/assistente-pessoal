import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import * as store from '../src/db.mjs';
import { createApp, parseRange, fromTailnet } from '../src/server.mjs';
import { sanitizeName, storedName } from '../src/upload.mjs';

const H = { 'x-assistente': '1' };
async function setup(opts = {}) {
  const media = mkdtempSync(join(tmpdir(), 'media-')), db = store.openDb(':memory:');
  const srv = createServer(createApp(db, { routinesDir: mkdtempSync(join(tmpdir(), 'rt-')), mediaDir: media, ...opts }));
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { db, media, srv, base: `http://127.0.0.1:${srv.address().port}` };
}
const reel = (db, extra = {}) => store.createDraft(db, 'instagram-ia', 'instagram', {
  title: 'Reel: agenda com IA', body: 'Legenda do reel',
  needs: [{ type: 'record_video', script: 'Fale em 30s como a IA organiza sua agenda.', notes: 'Luz natural', durationSec: 30 }], ...extra });
const form = (data, { name = 'clip.mp4', type = 'video/mp4', field = 'file' } = {}) => { const f = new FormData(); f.append(field, new Blob([data], { type }), name); return f; };
const up = (base, id, body, q = '?need=0') => fetch(`${base}/api/drafts/${id}/upload${q}`, { method: 'POST', headers: H, body });

test('estados: needs sem mídia nasce needs_joao; sem needs nasce pending', () => {
  const db = store.openDb(':memory:');
  const d = reel(db);
  assert.equal(d.status, 'needs_joao');
  assert.deepEqual(d.needs, [{ type: 'record_video', script: 'Fale em 30s como a IA organiza sua agenda.', status: 'waiting', notes: 'Luz natural', durationSec: 30 }]);
  assert.equal(store.createDraft(db, 'r', 'linkedin', { title: 'a', body: 'b' }).status, 'pending');
  assert.equal(store.createDraft(db, 'r', 'instagram', { title: 'a', body: 'b', needs: { type: 'record_audio', script: 'x' } }).needs.length, 1);
  assert.throws(() => store.createDraft(db, 'r', 'instagram', { title: 'a', body: 'b', needs: [{ type: 'dance', script: 'x' }] }), /needs\[0\]\.type/);
  assert.throws(() => store.createDraft(db, 'r', 'instagram', { title: 'a', body: 'b', needs: [{ type: 'record_video' }] }), /script/);
  assert.throws(() => store.createDraft(db, 'r', 'instagram', { title: 'a', body: 'b', media: [{ kind: 'gif', path: '/x' }] }), /kind/);
});

test('transições: needs_joao não aprova nem publica; upload → processing; rotina termina → pending; só então aprova', async () => {
  const db = store.openDb(':memory:'), d = reel(db);
  assert.throws(() => store.decide(db, d.id, 'approve'), /needs_joao/);
  const a = store.attachUpload(db, d.id, { needIndex: 0, media: { kind: 'video_raw', path: '/m/a.mp4', mime: 'video/mp4', bytes: 10 } });
  assert.equal(a.status, 'processing'); assert.equal(a.needs[0].status, 'received'); assert.equal(a.media.length, 1);
  assert.throws(() => store.decide(db, d.id, 'approve'), /processing/);
  assert.throws(() => store.editDraft(db, d.id, { title: 'x' }), /processing/);
  const f = store.finishProcessing(db, d.id, { media: [{ kind: 'video_final', path: '/m/f.mp4', mime: 'video/mp4', bytes: 9 }] });
  assert.equal(f.status, 'pending'); assert.equal(f.media.length, 2);
  assert.throws(() => store.finishProcessing(db, d.id), /não está em edição/);
  assert.equal(store.decide(db, d.id, 'approve').status, 'approved');
  assert.throws(() => store.attachUpload(db, d.id, { media: { kind: 'cover', path: '/x' } }), /não recebe/);
  // recusar vale em qualquer fase antes de publicar
  assert.equal(store.decide(db, reel(db).id, 'reject').status, 'rejected');
});

test('upload ok: grava em data/media/<id>/, vira processing, aparece em /api/state e é servido', async () => {
  const { db, media, srv, base } = await setup(), d = reel(db);
  let st = await (await fetch(`${base}/api/state`)).json();
  assert.equal(st.needsJoao.length, 1); assert.equal(st.pending.length, 0);
  const payload = Buffer.alloc(300_000, 7);
  const res = await up(base, d.id, form(payload, { name: 'meu video (1).mp4' }));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.status, 'processing'); assert.equal(j.needs[0].status, 'received');
  const [m] = j.media;
  assert.equal(m.kind, 'video_raw'); assert.equal(m.mime, 'video/mp4'); assert.equal(m.bytes, payload.length);
  assert.ok(m.path.startsWith(resolve(media, d.id) + '/'), m.path);
  assert.match(m.path, /meu_video_1_?\.mp4$|meu_video_1\.mp4$/);
  assert.ok(readFileSync(m.path).equals(payload), 'conteúdo íntegro');
  st = await (await fetch(`${base}/api/state`)).json();
  assert.equal(st.needsJoao.length, 0); assert.equal(st.processing.length, 1);
  const got = await fetch(`${base}/media?p=${encodeURIComponent(m.path)}`);
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'video/mp4'); assert.equal(got.headers.get('accept-ranges'), 'bytes');
  srv.close();
});

test('upload: áudio vira kind audio; binário com \\r\\n e delimitador parcial no meio chega íntegro', async () => {
  const { db, srv, base } = await setup();
  const d = store.createDraft(db, 'r', 'instagram', { title: 'a', body: 'b', needs: [{ type: 'record_audio', script: 'leia isto' }] });
  const tricky = Buffer.concat([Buffer.from('\r\n--abc\r\n\r\n--'), Buffer.alloc(100_000, 1), Buffer.from('\r\n-\r\n')]);
  const j = await (await up(base, d.id, form(tricky, { name: 'voz.m4a', type: 'audio/mp4' }))).json();
  assert.equal(j.media[0].kind, 'audio'); assert.ok(readFileSync(j.media[0].path).equals(tricky));
  srv.close();
});

test('upload: mime inválido, sem CSRF, rascunho inexistente/estado errado, pedido inexistente', async () => {
  const { db, media, srv, base } = await setup(), d = reel(db);
  for (const [type, name] of [['application/x-msdownload', 'a.mp4'], ['text/html', 'a.html'], ['image/svg+xml', 'a.svg'], ['', 'a.mp4']]) {
    const r = await up(base, d.id, form('xx', { type, name }));
    assert.equal(r.status, 415, type);
  }
  assert.equal((await fetch(`${base}/api/drafts/${d.id}/upload`, { method: 'POST', body: form('xx') })).status, 403);
  assert.equal((await fetch(`${base}/api/drafts/${d.id}/upload`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}' })).status, 415);
  assert.equal((await up(base, d.id, form('xx', { field: 'outro' }))).status, 400);
  assert.equal((await up(base, 'nao-existe', form('xx'))).status, 404);
  assert.equal((await up(base, d.id, form('xx'), '?need=7')).status, 400);
  assert.equal((await up(base, d.id, form(''))).status, 400);
  assert.equal(store.getDraft(db, d.id).status, 'needs_joao'); assert.equal(store.getDraft(db, d.id).media.length, 0);
  assert.ok(!existsSync(join(media, d.id)) || readdirSync(join(media, d.id)).length === 0, 'nada ficou no disco');
  const pend = store.createDraft(db, 'r', 'linkedin', { title: 'a', body: 'b' });
  assert.equal((await up(base, pend.id, form('xx'))).status, 409);
  srv.close();
});

test('upload: arquivo acima do limite é recusado (413) e não deixa resto no disco', async () => {
  const { db, media, srv, base } = await setup({ maxUpload: 100_000 }), d = reel(db);
  const r = await up(base, d.id, form(Buffer.alloc(400_000, 1)));
  assert.equal(r.status, 413);
  // sem Content-Length confiável (stream): corta ao passar do limite
  const boundary = 'xBOUNDARYx', head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="g.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
  async function* gen() { yield Buffer.from(head); for (let i = 0; i < 10; i++) yield Buffer.alloc(50_000, 2); yield Buffer.from(`\r\n--${boundary}--\r\n`); }
  const r2 = await fetch(`${base}/api/drafts/${d.id}/upload`, { method: 'POST', headers: { ...H, 'content-type': `multipart/form-data; boundary=${boundary}` }, body: gen(), duplex: 'half' }).catch((e) => ({ status: 'reset', e }));
  assert.ok(r2.status === 413 || r2.status === 'reset', String(r2.status));
  assert.equal(store.getDraft(db, d.id).status, 'needs_joao');
  assert.ok(!existsSync(join(media, d.id)) || readdirSync(join(media, d.id)).length === 0, 'arquivo parcial removido');
  assert.equal((await up(base, d.id, form(Buffer.alloc(90_000, 1)))).status, 200); // dentro do limite passa
  srv.close();
});

test('path traversal: nome do cliente nunca vira caminho; /media só serve dentro de data/media', async () => {
  assert.equal(sanitizeName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeName('..\\..\\boot.ini'), 'boot.ini');
  assert.equal(sanitizeName('.bashrc'), 'bashrc');
  assert.equal(sanitizeName('a/b\0c.mp4'), 'b_c.mp4');
  assert.match(storedName('../../x.mp4', 'video/mp4'), /^[0-9a-f]{8}-x\.mp4$/);
  const { db, media, srv, base } = await setup(), d = reel(db);
  const j = await (await up(base, d.id, form('dados', { name: '../../../../tmp/pwn.mp4' }))).json();
  const dir = resolve(media, d.id);
  assert.ok(j.media[0].path.startsWith(dir + '/'));
  assert.deepEqual(readdirSync(dir).length, 1);
  assert.ok(!existsSync('/tmp/pwn.mp4'));
  // id com traversal não casa a rota
  assert.ok([400, 404].includes((await up(base, '..%2F..%2Fx', form('xx'))).status));
  // leitura fora da pasta de mídia
  writeFileSync(join(media, '..', 'segredo.txt'), 's'); mkdirSync(join(media, 'sub-irmao'), { recursive: true });
  for (const p of ['/etc/passwd', join(media, '..', 'segredo.txt'), media + '/../segredo.txt', media + '-irmao/x', '../x', '']) {
    assert.equal((await fetch(`${base}/media?p=${encodeURIComponent(p)}`)).status, 404, p);
  }
  srv.close();
});

test('mídia: range requests (206/416/HEAD) como o iOS pede', async () => {
  const { db, srv, base } = await setup(), d = reel(db);
  const data = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
  const { media: [m] } = await (await up(base, d.id, form(data))).json();
  const url = `${base}/media?p=${encodeURIComponent(m.path)}`;
  let r = await fetch(url, { headers: { range: 'bytes=0-1' } });
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 0-1/1000'); assert.equal((await r.arrayBuffer()).byteLength, 2);
  r = await fetch(url, { headers: { range: 'bytes=990-' } });
  assert.equal(r.status, 206); assert.ok(Buffer.from(await r.arrayBuffer()).equals(data.subarray(990)));
  r = await fetch(url, { headers: { range: 'bytes=-10' } });
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(data.subarray(990)));
  assert.equal((await fetch(url, { headers: { range: 'bytes=5000-' } })).status, 416);
  assert.equal((await fetch(url, { headers: { range: 'lixo' } })).status, 416);
  r = await fetch(url, { method: 'HEAD' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-length'), '1000');
  assert.deepEqual(parseRange('bytes=0-99999', 10), { start: 0, end: 9 });
  assert.equal(parseRange(undefined, 10), null);
  srv.close();
});

test('rede: só loopback e tailnet recebem mídia/upload', () => {
  for (const ok of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '100.64.0.1', '100.101.102.103', '100.127.255.1', 'fd7a:115c:a1e0::1']) assert.ok(fromTailnet(ok), ok);
  for (const no of ['192.168.0.5', '10.0.0.1', '100.63.1.1', '100.128.0.1', '8.8.8.8', '2001:db8::1', '', undefined]) assert.ok(!fromTailnet(no), String(no));
});

test('rotina termina a edição pelo ctx e o card vai para a fila de aprovação', async () => {
  const { makeCtx } = await import('../src/runner.mjs');
  const db = store.openDb(':memory:'), d = reel(db);
  store.attachUpload(db, d.id, { needIndex: 0, media: { kind: 'video_raw', path: '/m/a.mp4', mime: 'video/mp4', bytes: 1 } });
  const ctx = makeCtx(db, { id: 'instagram-ia', channel: 'instagram' });
  assert.equal(ctx.drafts.list({ status: 'processing' }).length, 1);
  ctx.drafts.finishProcessing(d.id, { media: [{ kind: 'video_final', path: '/m/f.mp4', mime: 'video/mp4', bytes: 1 }] });
  assert.equal(store.getDraft(db, d.id).status, 'pending');
});

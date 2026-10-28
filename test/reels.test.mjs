import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { dropFillers, keepRanges, totalLen, remap, captionGroups, sceneSpans, fixedSpans, blockSpans } from '../src/reels/plan.mjs';
import { assDoc, cardEvents, captionEvents, esc } from '../src/reels/ass.mjs';
import { pickMusic, renderB } from '../src/reels/render.mjs';
import { probe, FFMPEG } from '../src/reels/tools.mjs';
import { exposeFiles } from '../src/publicurl.mjs';
import * as store from '../src/db.mjs';
import { createApp } from '../src/server.mjs';
import { processDrafts } from '../src/runner.mjs';
import ig, { montarRascunho, lerCalendario } from '../routines/instagram-ia/index.mjs';

const w = (s, e, t = 'x') => ({ w: t, s, e });
const hasFfmpeg = existsSync(FFMPEG());

test('plan: hesitações saem e silêncio longo é cortado; pausa curta fica', () => {
  const words = dropFillers([w(0, 0.4, 'Oi'), w(0.5, 0.7, 'é...'), w(0.8, 1.2, 'gente'), w(3.2, 3.6, 'vamos')]);
  assert.deepEqual(words.map((x) => x.w), ['Oi', 'gente', 'vamos']);
  const r = keepRanges(words, 6);
  assert.equal(r.length, 2); // pausa de 2 s cortada, a de 0,4 s ficou
  assert.ok(r[0].e < 3 && r[1].s > 2.9);
  assert.ok(totalLen(r) < 6 - 1.5);
  assert.ok(Math.abs(remap(r[1].s, r) - (r[0].e - r[0].s)) < 1e-9); // início do 2º trecho cola no fim do 1º
});

test('plan: legenda em grupos curtos; cenas C seguem a voz; A distribui textos na tela', () => {
  const words = 'Prompt bonito resolve uma tarefa. Operação resolve o mês inteiro'.split(' ').map((t, i) => w(i * 0.4, i * 0.4 + 0.35, t));
  const g = captionGroups(words);
  assert.ok(g.every((x) => x.length <= 4) && g.length >= 3);
  const sp = sceneSpans([{ segundos: 5 }, { segundos: 5 }], words, 5);
  assert.equal(sp[0].s, 0); assert.equal(sp[1].e, 5); assert.equal(sp[0].e, sp[1].s);
  assert.ok(Math.abs(sp[0].e - words[5].s) < 1e-9, 'virada da cena cai na palavra do meio');
  assert.deepEqual(fixedSpans([{ segundos: 3 }, { segundos: 6 }]), [{ s: 0, e: 3 }, { s: 3, e: 9 }]);
  const b = blockSpans({ duracaoSeg: 30, gancho: { segundos: 2, naTela: 'G' }, blocos: [{ de: 2, ate: 30, naTela: 'B1' }] }, 15);
  assert.deepEqual(b.map((x) => x.text), ['G', 'B1']); assert.ok(b[1].s >= b[0].e && b[1].e <= 15);
});

test('ass: texto do usuário não injeta tags; número solto vira cartão grande', () => {
  assert.equal(esc('a{\\b1}b\nc'), 'ab1b\\Nc');
  const doc = assDoc(cardEvents([{ s: 0, e: 2 }, { s: 2, e: 4 }], [{ card: '1' }, { card: 'Texto' }]), captionEvents([[w(0, 1, 'oi')]]));
  assert.match(doc, /,Num,/); assert.match(doc, /,Card,/); assert.match(doc, /,Cap,.*\\kf/);
});

test('música: escolhe faixa da pasta, estável por rascunho; pasta vazia = sem música', () => {
  const d = mkdtempSync(join(tmpdir(), 'mus-'));
  assert.equal(pickMusic(d, 'a'), null);
  writeFileSync(join(d, 'a.mp3'), 'x'); writeFileSync(join(d, 'b.wav'), 'x'); writeFileSync(join(d, 'LEIA-ME.md'), 'x');
  assert.equal(pickMusic(d, 'z'), pickMusic(d, 'z')); assert.ok(/\.(mp3|wav)$/.test(pickMusic(d, 'q')));
});

test('link público: serve só os arquivos dados, no token secreto, com Range', async () => {
  const d = mkdtempSync(join(tmpdir(), 'pub-')); const f = join(d, 'reel.mp4'); writeFileSync(f, Buffer.from('0123456789'));
  writeFileSync(join(d, 'segredo.txt'), 'nao');
  const p = await exposeFiles([f], { tunnel: false });
  try {
    const [u] = p.urls; assert.match(u, /\/[0-9a-f]{32}\/reel\.mp4$/);
    assert.equal(await (await fetch(u)).text(), '0123456789');
    const r = await fetch(u, { headers: { range: 'bytes=2-4' } }); assert.equal(r.status, 206); assert.equal(await r.text(), '234');
    assert.equal((await fetch(u.replace(/[0-9a-f]{32}/, 'x'.repeat(32)))).status, 404);
    assert.equal((await fetch(new URL('/segredo.txt', u))).status, 404);
  } finally { p.close(); }
  await assert.rejects(exposeFiles([join(d, 'segredo.txt')], { tunnel: false }), /tipo não permitido/);
});

test('e2e Reel B: nasce em edição, o editor renderiza 9:16 e o card vai para a fila de aprovação', { skip: !hasFfmpeg }, async () => {
  const db = store.openDb(':memory:'), media = mkdtempSync(join(tmpdir(), 'med-'));
  const cal = lerCalendario().find((r) => r.tipo === 'B_imagens');
  const draft = montarRascunho({ ...cal, cenas: cal.cenas.map((c) => ({ ...c, segundos: 1 })) });
  const d = store.createDraft(db, 'instagram-ia', 'instagram', draft);
  assert.equal(d.status, 'processing');
  const res = await processDrafts(db, new Map([['instagram-ia', ig]]), { mediaDir: media });
  assert.deepEqual(res.map((x) => x.ok), [true], JSON.stringify(res));
  const done = store.getDraft(db, d.id);
  assert.equal(done.status, 'pending');
  const fin = done.media.find((m) => m.kind === 'video_final'), cover = done.media.find((m) => m.kind === 'cover');
  const p = await probe(fin.path);
  assert.equal(p.width, 1080); assert.equal(p.height, 1920); assert.ok(p.hasAudio); assert.ok(existsSync(cover.path));
}, { timeout: 120000 });

test('edição falha de forma visível: áudio sem fala volta com erro e conta tentativa; retry zera', { skip: !hasFfmpeg || !existsSync(join(process.env.HOME || '', '.local/opt/whisper-venv')) }, async () => {
  const db = store.openDb(':memory:'), media = mkdtempSync(join(tmpdir(), 'med-')), tone = join(media, 'tom.m4a');
  const { ffmpeg } = await import('../src/reels/tools.mjs');
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=300:d=2', tone]);
  const cal = lerCalendario().find((r) => r.tipo === 'C_voz');
  const d = store.createDraft(db, 'instagram-ia', 'instagram', montarRascunho(cal));
  store.attachUpload(db, d.id, { needIndex: 0, media: { kind: 'audio', path: tone, mime: 'audio/mp4', bytes: 1 } });
  const res = await processDrafts(db, new Map([['instagram-ia', ig]]), { mediaDir: media });
  assert.equal(res[0].ok, false); assert.match(res[0].error, /não ouvi fala/);
  const f = store.getDraft(db, d.id);
  assert.equal(f.status, 'processing'); assert.equal(f.meta.edicao.tentativas, 1); assert.match(f.error, /não ouvi fala/);
  assert.equal(store.retryProcessing(db, d.id).meta.edicao.tentativas, 0);
}, { timeout: 120000 });

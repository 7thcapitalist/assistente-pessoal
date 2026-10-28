import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import r from '../routines/instagram-ia/index.mjs'
import { trechosFalados, legendas, ffmpegBin, duracao } from '../routines/instagram-ia/reels.mjs'

const data = mkdtempSync(join(tmpdir(), 'ig-reels-'))
const bin = ffmpegBin()
const ctxCom = (processing = []) => {
  const criados = [], updates = []
  return { criados, updates, now: new Date('2026-10-28T12:00:00Z'), env: (k) => ({ ASSISTENTE_DATA: data })[k], log() {},
    state: { get: () => 0, set() {} },
    createDraft: async (d) => criados.push(d),
    drafts: { list: async (q) => (q.status === 'processing' ? processing : []), update: async (id, patch) => updates.push({ id, patch }) } }
}

test('run cria 3 tipos de reel: 2 em needs_joao com o que gravar, 1 pronto sem o João', async () => {
  const c = ctxCom(); await r.run(c)
  const reels = c.criados.filter((d) => d.meta.tipoReel)
  assert.deepEqual(reels.map((d) => d.meta.tipoReel).sort(), ['imagens', 'roteiro_joao', 'voz_joao'])
  const vid = reels.find((d) => d.meta.tipoReel === 'roteiro_joao'), voz = reels.find((d) => d.meta.tipoReel === 'voz_joao'), img = reels.find((d) => d.meta.tipoReel === 'imagens')
  assert.equal(vid.status, 'needs_joao'); assert.equal(vid.needs.type, 'record_video'); assert.ok(vid.needs.script.length > 20)
  assert.equal(voz.status, 'needs_joao'); assert.equal(voz.needs.type, 'record_audio'); assert.match(voz.needs.script, /clique/)
  assert.equal(img.status, undefined); assert.deepEqual(img.media.map((m) => m.kind), ['video_final', 'cover']); assert.ok(existsSync(img.media[0].path))
})

test('trechosFalados remove silêncio e legendas somam a duração', () => {
  const t = trechosFalados('silence_start: 4.0\nsilence_end: 6.0', 10)
  assert.equal(t.length, 2); assert.ok(t[0][1] < 4.2 && t[1][0] > 5.8)
  const l = legendas(['a b', 'c d e f'], 6); assert.equal(l.at(-1).fim, 6)
})

test('processa upload do João: editarBruto e voz devolvem pending com video_final + cover', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ig-in-'))
  spawnSync(bin, ['-y', '-f', 'lavfi', '-i', 'testsrc=s=1280x720:r=30:d=10', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,4,6),0,0.3*sin(2*PI*300*t))':d=10", '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(dir, 'raw.mp4')])
  spawnSync(bin, ['-y', '-f', 'lavfi', '-i', 'sine=f=250:d=6', '-c:a', 'aac', join(dir, 'voz.m4a')])
  const falas = ['Meu agente errou', 'e eu corrigi']
  const c = ctxCom([
    { id: 'a', title: '[reel] Erro do agente', meta: { tipoReel: 'roteiro_joao', falas }, media: [{ kind: 'video_raw', path: join(dir, 'raw.mp4') }], needs: { type: 'record_video', status: 'waiting' } },
    { id: 'b', title: '[reel] Nada vai ao ar', meta: { tipoReel: 'voz_joao', falas, slides: ['Um', 'Dois'] }, media: [{ kind: 'audio', path: join(dir, 'voz.m4a') }], needs: { type: 'record_audio', status: 'waiting' } },
  ])
  await r.processar(c)
  assert.equal(c.updates.length, 2)
  for (const { patch } of c.updates) {
    assert.equal(patch.status, 'pending'); assert.equal(patch.needs.status, 'received')
    assert.deepEqual(patch.media.map((m) => m.kind).slice(-2), ['video_final', 'cover']); assert.ok(patch.media.at(-2).bytes > 1000)
  }
  assert.ok(Math.abs(c.updates[0].patch.meta.duracao - 8.2) < 0.6, 'cortou ~2 s de silêncio de 10 s')
  assert.ok(Math.abs(await duracao(bin, c.updates[0].patch.media.at(-2).path) - c.updates[0].patch.meta.duracao) < 0.5)
})

test('arquivo corrompido volta para needs_joao com o erro, sem publicar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ig-bad-')); spawnSync('sh', ['-c', `echo lixo > ${dir}/x.mp4`])
  const c = ctxCom([{ id: 'z', title: '[reel] X', meta: { tipoReel: 'roteiro_joao', falas: ['a'] }, media: [{ kind: 'video_raw', path: join(dir, 'x.mp4') }] }])
  await r.processar(c)
  assert.equal(c.updates[0].patch.status, 'needs_joao'); assert.ok(c.updates[0].patch.meta.erroEdicao)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cal = JSON.parse(readFileSync(new URL('../data/instagram/calendario.json', import.meta.url), 'utf8'))
const VEDADOS = [/frontstep/i, /egg\s*champions/i, /roblox/i, /snkrshop/i, /yourstyle/i, /software house/i, /R\$\s*\d/]
const texto = (r) => JSON.stringify(r)
const palavras = (s) => s.trim().split(/\s+/).length

test('2 semanas: 8 rascunhos, 3 Reels + 1 carrossel por semana', () => {
  assert.equal(cal.rascunhos.length, 8)
  for (const sem of [cal.rascunhos.slice(0, 4), cal.rascunhos.slice(4)]) {
    assert.equal(sem.filter((r) => r.formato === 'reel').length, 3)
    assert.equal(sem.filter((r) => r.formato === 'carrossel').length, 1)
    assert.equal(sem.filter((r) => r.tipo === 'A_gravar').length, 1)
  }
})

test('sem termos vedados, sem hashtags', () => {
  for (const r of cal.rascunhos) {
    for (const v of VEDADOS) assert.ok(!v.test(texto(r)), `${r.id} contém ${v}`)
    assert.ok(!/#\w/.test(r.legenda), `${r.id} tem hashtag`)
  }
})

test('Reel A: gancho de 2 s e 20-45 s', () => {
  for (const r of cal.rascunhos.filter((r) => r.tipo === 'A_gravar')) {
    assert.equal(r.roteiro.gancho.segundos, 2)
    assert.ok(r.roteiro.duracaoSeg >= 20 && r.roteiro.duracaoSeg <= 45)
    assert.equal(r.roteiro.blocos.at(-1).ate, r.roteiro.duracaoSeg)
    assert.ok(r.roteiro.blocos.every((b) => b.fala && b.naTela))
  }
})

test('Reel B: soma das cenas entre 20 e 45 s', () => {
  for (const r of cal.rascunhos.filter((r) => r.tipo === 'B_imagens')) {
    const t = r.cenas.reduce((a, c) => a + c.segundos, 0)
    assert.ok(t >= 20 && t <= 45, `${r.id}: ${t}s`)
  }
})

test('Reel C: narração cabe em 25-45 s (~2,5 palavras/s) e cenas batem', () => {
  for (const r of cal.rascunhos.filter((r) => r.tipo === 'C_voz')) {
    const s = palavras(r.narracao) / 2.5
    assert.ok(s >= 25 && s <= 45, `${r.id}: ~${Math.round(s)}s`)
    const t = r.cenas.reduce((a, c) => a + c.segundos, 0)
    assert.ok(Math.abs(t - s) <= 8, `${r.id}: cenas ${t}s x voz ~${Math.round(s)}s`)
  }
})

test('notícia só vai com fonte: rascunho de notícia nasce sem fonte e com [campo]', () => {
  for (const r of cal.rascunhos.filter((r) => r.noticia)) {
    assert.equal(r.fonte, null)
    assert.match(texto(r), /\[[^\]]+\]/)
  }
})

test('datas nos horários combinados (Brasília)', () => {
  const ok = { 2: '12:00', 4: '19:00', 6: '10:00', 0: '20:00' }
  for (const r of cal.rascunhos) {
    const d = new Date(r.data)
    const local = new Date(d.getTime() - 3 * 3600_000)
    const hh = `${String(local.getUTCHours()).padStart(2, '0')}:00`
    assert.equal(hh, ok[local.getUTCDay()], `${r.id}`)
  }
})

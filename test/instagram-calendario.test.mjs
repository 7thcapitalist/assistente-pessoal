import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cal = JSON.parse(readFileSync(new URL('../data/instagram/calendario.json', import.meta.url), 'utf8'))
const VEDADOS = [/frontstep/i, /egg\s*champions/i, /roblox/i, /snkrshop/i, /yourstyle/i, /software house/i, /R\$\s*\d/]
const texto = (r) => JSON.stringify(r)
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
const palavras = (s) => s.trim().split(/\s+/).length

test('4 semanas (3/11 a 29/11): 16 rascunhos, 3 Reels (1 A, 1 B, 1 C) + 1 carrossel por semana', () => {
  assert.equal(cal.rascunhos.length, 16)
  assert.equal(new Set(cal.rascunhos.map((r) => r.id)).size, 16, 'ids repetidos')
  for (let i = 0; i < 16; i += 4) {
    const sem = cal.rascunhos.slice(i, i + 4)
    assert.equal(sem.filter((r) => r.formato === 'reel').length, 3)
    assert.equal(sem.filter((r) => r.formato === 'carrossel').length, 1)
    for (const t of ['A_gravar', 'B_imagens', 'C_voz']) assert.equal(sem.filter((r) => r.tipo === t).length, 1, `semana ${i / 4 + 1}: ${t}`)
  }
  const datas = cal.rascunhos.map((r) => r.data)
  assert.deepEqual(datas, [...datas].sort())
  assert.ok(datas.at(-1) >= '2026-11-29', 'calendário tem de ir até 29/11')
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

test('notícia só vai com fonte https, citada na legenda, e sem [campo] aberto', () => {
  const noticias = cal.rascunhos.filter((r) => r.noticia)
  assert.ok(noticias.length >= 1)
  for (const r of noticias) {
    assert.match(r.fonte, /^https:\/\/\S+$/)
    assert.ok(r.legenda.includes(r.fonte), `${r.id}: legenda sem a fonte`)
    assert.doesNotMatch(strings(r).join('\n'), /\[[^\]]+\]/)
  }
})

test('nenhum [campo] aberto em nenhum rascunho', () => {
  for (const r of cal.rascunhos) assert.doesNotMatch(strings(r).join('\n'), /\[[^\]]+\]/, r.id)
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

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cal = JSON.parse(readFileSync(new URL('./fixtures/calendario-exemplo.json', import.meta.url), 'utf8'))
const VEDADOS = [/frontstep/i, /egg\s*champions/i, /roblox/i, /snkrshop/i, /yourstyle/i, /software house/i, /R\$\s*\d/]
const texto = (r) => JSON.stringify(r)
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
const palavras = (s) => s.trim().split(/\s+/).length

test('15 rascunhos, ids únicos, datas em ordem e nenhuma antes de 25/11', () => {
  assert.equal(cal.rascunhos.length, 15)
  assert.equal(new Set(cal.rascunhos.map((r) => r.id)).size, 15, 'ids repetidos')
  const datas = cal.rascunhos.map((r) => r.data)
  assert.deepEqual(datas, [...datas].sort())
  assert.equal(new Set(datas).size, datas.length, 'datas colidem')
  assert.ok(datas[0] >= '2026-11-25', 'rascunho com data vencida')
  assert.ok(cal.rascunhos.some((r) => r.formato === 'carrossel') && cal.rascunhos.some((r) => r.formato === 'reel'))
  for (const t of ['A_gravar', 'B_imagens', 'C_voz']) assert.ok(cal.rascunhos.some((r) => r.tipo === t), t)
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
    for (const r of noticias) {
    assert.match(r.fonte, /^https:\/\/\S+$/)
    assert.ok(r.legenda.includes(r.fonte), `${r.id}: legenda sem a fonte`)
    assert.doesNotMatch(strings(r).join('\n'), /\[[^\]]+\]/)
  }
})

test('nenhum [campo] aberto em nenhum rascunho', () => {
  for (const r of cal.rascunhos) assert.doesNotMatch(strings(r).join('\n'), /\[[^\]]+\]/, r.id)
})

test('datas nos horários bons de Brasília (10h, 12h, 19h ou 20h)', () => {
  for (const r of cal.rascunhos) {
    const hh = new Date(new Date(r.data).getTime() - 3 * 3600_000).getUTCHours()
    assert.ok([10, 12, 19, 20].includes(hh), `${r.id}: ${hh}h`)
  }
})

test('calendário real não tem os itens dos rascunhos cancelados (ASS-6 a ASS-37)', () => {
  const real = JSON.parse(readFileSync(new URL('../data/instagram/calendario.json', import.meta.url), 'utf8'))
  assert.deepEqual(real.rascunhos, [])
})

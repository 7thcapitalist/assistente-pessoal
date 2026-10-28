import test from 'node:test'
import assert from 'node:assert/strict'
import r, { agenda, montarRascunho } from '../routines/instagram-ia/index.mjs'
import { POSTS } from '../routines/instagram-ia/posts.mjs'

const mkCtx = (env = {}, calls = []) => {
  const drafts = [], st = {}
  return { drafts, calls, now: new Date('2026-10-28T12:00:00Z'), fastWait: true,
    createDraft: async (d) => drafts.push(d), log() {},
    state: { get: (k) => st[k], set: (k, v) => { st[k] = v } },
    drafts_: null, env: (k) => ({ ASSISTENTE_DATA: '/tmp/ig-test-data', ...env })[k],
    composio: { call: async (name, a) => {
      const tool = name === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? a.tools[0].tool_slug : name
      const args = name === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? a.tools[0].arguments : a
      calls.push([tool, { ...args, account: name === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? a.tools[0].account : undefined }])
      if (tool === 'COMPOSIO_MANAGE_CONNECTIONS') return { data: { results: { instagram: { accounts: [{ id: 'c1', status: 'active', user_info: { id: '99', username: 'joao.empresasia' } }] } } } }
      if (tool === 'INSTAGRAM_GET_POST_STATUS') return { data: { status_code: 'FINISHED' } }
      return { data: { id: 'X1' } } } },
    listFn: [] }
}
const withList = (ctx, pend = []) => { ctx.drafts = Object.assign(ctx.drafts, {}); const arr = ctx.drafts; ctx.drafts = { list: async (q = {}) => pend.filter((d) => d.status === q.status), push: (d) => arr.push(d), arr }; ctx.createDraft = async (d) => arr.push(d); return arr }

test('gera 8 rascunhos em horários de Brasília, sem hashtags', async () => {
  const ctx = mkCtx(); const arr = withList(ctx)
  await r.run(ctx)
  assert.equal(arr.length, 8)
  for (const d of arr) {
    assert.ok(!/#\w/.test(d.body)); assert.deepEqual(d.meta.hashtags, [])
    const h = new Date(d.scheduledFor).getUTCHours() - 3
    assert.ok([12, 19, 10, 20].includes(h), `hora ${h}`)
  }
  const datas = arr.map((d) => d.scheduledFor); assert.deepEqual(datas, [...datas].sort())
})
test('não gera de novo com pendentes', async () => {
  const ctx = mkCtx(); const arr = withList(ctx, [{ status: 'pending' }]); await r.run(ctx); assert.equal(arr.length, 0)
})
test('agenda ordenada e futura', () => {
  const a = agenda(new Date('2026-10-28T12:00:00Z')); assert.equal(a.length, 8); assert.ok(a[0] > new Date('2026-10-28T12:00:00Z'))
})
test('publish exige conta configurada', async () => {
  await assert.rejects(r.publish({ meta: {} }, mkCtx()), /NEEDS_CONNECT/)
})
test('publish recusa contas da holding', async () => {
  await assert.rejects(r.publish({ meta: {} }, mkCtx({ INSTAGRAM_IA_USERNAME: '@studio.frontstep' })), /proibida/)
})
test('publish recusa se conta conectada não é a esperada', async () => {
  await assert.rejects(r.publish({ meta: {} }, mkCtx({ INSTAGRAM_IA_USERNAME: 'outra' })), /NEEDS_CONNECT/)
})
test('publish sem mídia pública falha claro', async () => {
  await assert.rejects(r.publish({ body: 'x', meta: { formato: 'carrossel' } }, mkCtx({ INSTAGRAM_IA_USERNAME: 'joao.empresasia' })), /imageUrls/)
})
test('publish carrossel e reel usam a conta travada', async () => {
  const calls = []; const ctx = mkCtx({ INSTAGRAM_IA_USERNAME: 'joao.empresasia' }, calls)
  const a = await r.publish({ body: 'x', meta: { formato: 'carrossel', imageUrls: ['https://a/1.jpg', 'https://a/2.jpg'] } }, ctx)
  assert.equal(a.externalId, 'X1')
  await r.publish({ body: 'x', meta: { formato: 'reel', videoUrl: 'https://a/v.mp4' } }, ctx)
  assert.ok(calls.some(([t]) => t === 'INSTAGRAM_CREATE_CAROUSEL_CONTAINER'))
  assert.ok(calls.filter(([t]) => t.startsWith('INSTAGRAM_')).every(([, a]) => a.account === 'c1'))
})

test('rascunho real ignora prefixo de formato, chega à mídia e ainda recusa placeholder', async () => {
  const ctx = mkCtx({ INSTAGRAM_IA_USERNAME: 'joao.empresasia' })
  const rascunho = montarRascunho(POSTS[0], new Date('2026-10-30T22:00:00Z'))
  assert.match(rascunho.title, /^\[carrossel\]/)
  await assert.rejects(r.publish(rascunho, ctx), /imageUrls/)

  rascunho.meta.imageUrls = ['https://a/1.jpg']
  const publicado = await r.publish(rascunho, ctx)
  assert.equal(publicado.externalId, 'X1')

  const comPlaceholder = montarRascunho(POSTS[2], new Date('2026-10-31T13:00:00Z'))
  await assert.rejects(r.publish(comPlaceholder, ctx), /sem preencher/)
})

test('nenhum rascunho gerado revela produto, empresa ou preço', async () => {
  const { conteudoProibido } = await import('../routines/instagram-ia/index.mjs')
  for (const p of POSTS) {
    const t = [p.title, p.body, ...(p.slides || []), ...(p.roteiro || []), p.arte].join('\n')
    assert.equal(conteudoProibido(t), null, p.title)
  }
})
test('publish recusa conteúdo vedado, [campo] aberto e notícia sem fonte', async () => {
  const ctx = mkCtx({ INSTAGRAM_IA_USERNAME: 'joao.empresasia' })
  const base = { formato: 'carrossel', imageUrls: ['https://a/1.jpg'] }
  await assert.rejects(r.publish({ title: 't', body: 'Minha fábrica de sites vende', meta: base }, ctx), /vedado/)
  await assert.rejects(r.publish({ title: 't', body: 'Saiu [fato]', meta: base }, ctx), /sem preencher/)
  await assert.rejects(r.publish({ title: 't', body: 'Saiu X', meta: { ...base, noticia: true } }, ctx), /fonte/)
  const ok = await r.publish({ title: 't', body: 'Saiu X', meta: { ...base, noticia: true, fonte: 'https://exemplo.com/x' } }, ctx)
  assert.equal(ok.externalId, 'X1')
})

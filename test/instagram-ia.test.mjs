import test from 'node:test'
import assert from 'node:assert/strict'
import r, { montarRascunho, lerCalendario } from '../routines/instagram-ia/index.mjs'

const mkCtx = (env = {}, calls = []) => {
  const drafts = [], st = {}
  return { drafts, calls, now: new Date('2026-10-28T12:00:00Z'), fastWait: true,
    createDraft: async (d) => drafts.push(d), log() {},
    state: { get: (k) => st[k], set: (k, v) => { st[k] = v } },
    drafts_: null, env: (k) => env[k],
    composio: { call: async (name, a) => {
      const tool = name === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? a.tools[0].tool_slug : name
      const args = name === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? a.tools[0].arguments : a
      calls.push([tool, { ...args, account: name === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? a.tools[0].account : undefined }])
      if (tool === 'COMPOSIO_MANAGE_CONNECTIONS') return { data: { results: { instagram: { accounts: [{ id: 'c1', status: 'active', user_info: { id: '99', username: 'joao.empresasia' } }] } } } }
      if (tool === 'INSTAGRAM_GET_POST_STATUS') return { data: { status_code: 'FINISHED' } }
      return { data: { id: 'X1' } } } },
    listFn: [] }
}
const withList = (ctx, pend = []) => { ctx.drafts = Object.assign(ctx.drafts, {}); const arr = ctx.drafts; ctx.drafts = { list: async () => pend, push: (d) => arr.push(d), arr }; ctx.createDraft = async (d) => arr.push(d); return arr }

test('gera um rascunho por item do calendário, com horário de Brasília e sem hashtags', async () => {
  const ctx = mkCtx(); const arr = withList(ctx)
  await r.run(ctx)
  assert.equal(arr.length, 8)
  for (const d of arr) {
    assert.ok(!/#\w/.test(d.body)); assert.deepEqual(d.meta.hashtags, [])
    const h = new Date(d.scheduledFor).getUTCHours() - 3
    assert.ok([12, 19, 10, 20].includes(h), `hora ${h}`)
  }
  await r.run(ctx); assert.equal(arr.length, 8, 'não duplica na segunda execução')
})
test('A pede vídeo bruto com roteiro; C pede áudio com a narração; B nasce em edição', () => {
  const por = (t) => lerCalendario().find((p) => p.tipo === t)
  const a = montarRascunho(por('A_gravar')), c = montarRascunho(por('C_voz')), b = montarRascunho(por('B_imagens'))
  assert.equal(a.needs[0].type, 'record_video'); assert.match(a.needs[0].script, /GANCHO/)
  assert.equal(c.needs[0].type, 'record_audio'); assert.equal(c.needs[0].script, por('C_voz').narracao)
  assert.equal(b.processing, true); assert.equal(b.needs, undefined)
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

test('nenhum rascunho gerado revela produto, empresa ou preço', async () => {
  const { conteudoProibido } = await import('../routines/instagram-ia/index.mjs')
  for (const p of lerCalendario()) assert.equal(conteudoProibido(JSON.stringify(montarRascunho(p))), null, p.titulo)
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

test('publish de Reel editado expõe mp4+capa em https, manda cover_url e fecha o link', async () => {
  const calls = []; const ctx = mkCtx({ INSTAGRAM_IA_USERNAME: 'joao.empresasia' }, calls)
  let fechou = false
  ctx.exposeFiles = async (files) => ({ urls: files.map((f) => 'https://t.example/tok/' + f.split('/').pop()), close: () => { fechou = true } })
  const d = { title: 't', body: 'Legenda', meta: { formato: 'reel' }, media: [{ kind: 'video_raw', path: '/x/raw.mp4' }, { kind: 'video_final', path: '/x/reel-final.mp4' }, { kind: 'cover', path: '/x/reel-capa.jpg' }] }
  const out = await r.publish(d, ctx)
  const post = calls.find(([t]) => t === 'INSTAGRAM_POST_IG_USER_MEDIA')[1]
  assert.equal(post.video_url, 'https://t.example/tok/reel-final.mp4'); assert.equal(post.cover_url, 'https://t.example/tok/reel-capa.jpg'); assert.equal(post.media_type, 'REELS')
  assert.ok(fechou); assert.equal(out.externalId, 'X1')
})
test('publish de Reel sem vídeo editado falha antes de abrir link público', async () => {
  const ctx = mkCtx({ INSTAGRAM_IA_USERNAME: 'joao.empresasia' }); ctx.exposeFiles = async () => { throw new Error('não devia abrir') }
  await assert.rejects(r.publish({ title: 't', body: 'x', meta: { formato: 'reel' }, media: [] }, ctx), /sem vídeo editado/)
})

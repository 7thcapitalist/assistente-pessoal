import { join } from 'node:path'
import { POSTS, SLOTS } from './posts.mjs'
import { montarCartoes, editarBruto } from './reels.mjs'

const USERNAME_KEY = 'INSTAGRAM_IA_USERNAME'
const PROIBIDAS = ['studio.frontstep', 'yourstyle.snkrshop']
// Nomes e detalhes que nunca podem ir ao ar (regra de conteúdo do João).
export const VEDADOS = [/frontstep/i, /egg\s*champions/i, /roblox/i, /snkrshop/i, /yourstyle/i, /software house/i, /f[áa]brica de (sites|roblox)/i, /R\$\s*\d/]
export function conteudoProibido(texto) {
  return VEDADOS.find((r) => r.test(texto)) || null
}
const TZ_OFFSET_H = 3 // Brasília = UTC-3 (sem horário de verão)

// Próximas 8 datas dos slots, em UTC, a partir de `from`.
export function agenda(from, n = POSTS.length) {
  const datas = []
  for (let d = 0; datas.length < n && d < 60; d++) {
    const dia = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + d))
    for (const s of SLOTS.filter((s) => s.dow === dia.getUTCDay())) {
      const t = new Date(dia.getTime() + (s.hora + TZ_OFFSET_H) * 3600_000)
      if (t > from && datas.length < n) datas.push(t)
    }
  }
  return datas
}

function legendaFinal(p) {
  return p.body
}

const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const midiaDir = (ctx, p) => join(ctx.env('ASSISTENTE_DATA') || join(process.cwd(), 'data'), 'media', 'instagram-ia', slug(p.title))

// Fila "precisa do João": o que gravar e o texto a ler.
export function precisaDoJoao(p) {
  if (p.tipoReel === 'roteiro_joao') return { type: 'record_video', status: 'waiting', script: p.roteiro.join('\n'), notes: 'Vertical, 20-45 s, em um take. Fale: ' + p.falas.join(' / ') }
  if (p.tipoReel === 'voz_joao') return { type: 'record_audio', status: 'waiting', script: p.falas.join('\n'), notes: 'Só a narração, lendo o texto acima, 20-45 s.' }
  return null
}

export function montarRascunho(p, quando) {
  const detalhe = { ...(p.slides && { slides: p.slides }), ...(p.roteiro && { roteiro: p.roteiro }), ...(p.falas && { falas: p.falas }), ...(p.tipoReel && { tipoReel: p.tipoReel }) }
  const needs = precisaDoJoao(p)
  return {
    ...(needs && { status: 'needs_joao', needs }),
    title: `[${p.formato}] ${p.title}`,
    body: legendaFinal(p),
    media: [],
    meta: { tema: p.pilar, noticia: !!p.noticia, fonte: null, formato: p.formato, arte: p.arte, ...detalhe, hashtags: [], imageUrls: [], videoUrl: null },
    scheduledFor: quando.toISOString(),
  }
}

async function contaTravada(ctx) {
  const esperado = String(ctx.env(USERNAME_KEY) || '').replace(/^@/, '')
  if (!esperado) throw new Error(`NEEDS_CONNECT: defina ${USERNAME_KEY} (o @ da conta nova) em ~/.config/assistente/env e conecte a conta no Composio (toolkit instagram)`)
  if (PROIBIDAS.includes(esperado)) throw new Error(`Conta proibida: @${esperado}`)
  const r = await ctx.composio.call('COMPOSIO_MANAGE_CONNECTIONS', { toolkits: [{ name: 'instagram', action: 'list' }] })
  const contas = r?.data?.results?.instagram?.accounts || []
  const c = contas.find((a) => a.user_info?.username === esperado && a.status === 'active')
  if (!c) throw new Error(`NEEDS_CONNECT: conta @${esperado} não está ativa no Composio (toolkit instagram)`)
  return c
}

const idDe = (r) => r?.data?.id || r?.data?.creation_id || r?.id
const exec = async (ctx, c, tool, args) => {
  const r = await ctx.composio.call('COMPOSIO_MULTI_EXECUTE_TOOL', { tools: [{ tool_slug: tool, arguments: args, account: c.alias || c.id }] })
  const res = r?.data?.results?.[0] ?? r?.data ?? r
  return res?.response ?? res
}
const https = (u) => typeof u === 'string' && /^https:\/\//.test(u)

export default {
  id: 'instagram-ia',
  name: 'Instagram IA: 4 posts/semana',
  channel: 'instagram',
  description: 'Gera 8 rascunhos (2 semanas) do Instagram de IA; publica só após aprovar, só na conta travada.',
  defaultSchedule: '0 9 * * 1',

  // Edita os Reels cujo arquivo o João já subiu (status processing) e devolve para aprovação.
  async processar(ctx) {
    for (const d of await ctx.drafts.list({ status: 'processing', routine: 'instagram-ia' })) {
      const m = d.meta || {}
      const arq = (kind) => (d.media || []).find((x) => x.kind === kind)?.path
      const dir = midiaDir(ctx, { title: d.title.replace(/^\[[^\]]*\]\s*/, '') })
      try {
        const r = m.tipoReel === 'voz_joao'
          ? await montarCartoes({ textos: m.slides, falas: m.falas, titulo: d.title, dir, narracao: arq('audio') })
          : await editarBruto({ raw: arq('video_raw'), titulo: d.title, dir, falas: m.falas, env: ctx.env })
        const outros = (d.media || []).filter((x) => !['video_final', 'cover'].includes(x.kind))
        await ctx.drafts.update(d.id, { status: 'pending', media: [...outros, ...r.media], meta: { ...m, duracao: r.duracao, legenda: r.fonteLegenda || 'roteiro', erroEdicao: null }, needs: { ...d.needs, status: 'received' } })
        ctx.log(`reel editado: ${d.title} (${r.duracao.toFixed(0)}s)`)
      } catch (e) {
        await ctx.drafts.update(d.id, { status: 'needs_joao', meta: { ...m, erroEdicao: String(e.message).slice(0, 300) } })
        ctx.log(`falha ao editar ${d.title}: ${e.message}`)
      }
    }
  },

  async run(ctx) {
    await this.processar(ctx)
    const abertos = [...await ctx.drafts.list({ status: 'pending', routine: 'instagram-ia' }), ...await ctx.drafts.list({ status: 'needs_joao', routine: 'instagram-ia' })]
    const pendentes = abertos
    if (pendentes.length > 0) { ctx.log(`já há ${pendentes.length} rascunhos pendentes; nada a gerar`); return }
    const proximo = Number(ctx.state.get('proximo') || 0)
    const lote = POSTS.slice(proximo, proximo + 8)
    if (lote.length === 0) { ctx.log('calendário inicial esgotado; peça novos temas'); return }
    const datas = agenda(ctx.now, lote.length)
    for (const [i, p] of lote.entries()) {
      const d = montarRascunho(p, datas[i])
      if (p.tipoReel === 'imagens') { // sem o João: monta sozinho
        try {
          const r = await montarCartoes({ textos: p.slides, titulo: p.title, dir: midiaDir(ctx, p) })
          d.media = r.media; d.meta.duracao = r.duracao
        } catch (e) { ctx.log(`render falhou (${p.title}): ${e.message}`); d.meta.erroEdicao = String(e.message).slice(0, 300) }
      }
      await ctx.createDraft(d)
    }
    ctx.state.set('proximo', proximo + lote.length)
    ctx.log(`${lote.length} rascunhos criados`)
  },

  async publish(draft, ctx) {
    const m0 = draft.meta || {}
    const texto = [draft.title, draft.body, ...(m0.slides || []), ...(m0.roteiro || []), ...(m0.falas || [])].join('\n')
    const v = conteudoProibido(texto)
    if (v) throw new Error(`Conteúdo vedado (${v}): revele nada do negócio; edite o rascunho`)
    if (/\[[^\]]+\]/.test(texto)) throw new Error('Rascunho ainda tem [campo] sem preencher; edite antes de publicar')
    if (m0.noticia && !https(m0.fonte)) throw new Error('Post de notícia exige meta.fonte com URL https verificada (edite o rascunho)')
    const c = await contaTravada(ctx)
    const m = draft.meta || {}
    const ig = c.user_info.id
    let container
    if (m.formato === 'reel') {
      if (!https(m.videoUrl)) throw new Error('Falta meta.videoUrl: URL https pública do .mp4 do reel (edite o rascunho)')
      container = idDe(await exec(ctx, c, 'INSTAGRAM_POST_IG_USER_MEDIA', { ig_user_id: ig, video_url: m.videoUrl, media_type: 'REELS', caption: draft.body }))
    } else {
      const urls = m.imageUrls || []
      if (!urls.length || !urls.every(https)) throw new Error('Falta meta.imageUrls: URLs https públicas de JPEG (edite o rascunho)')
      container = urls.length === 1
        ? idDe(await exec(ctx, c, 'INSTAGRAM_POST_IG_USER_MEDIA', { ig_user_id: ig, image_url: urls[0], caption: draft.body }))
        : idDe(await exec(ctx, c, 'INSTAGRAM_CREATE_CAROUSEL_CONTAINER', { ig_user_id: ig, child_image_urls: urls, caption: draft.body }))
    }
    if (!container) throw new Error('Composio não devolveu o contêiner do post')
    for (const ms of [0, 5_000, 10_000, 20_000, 40_000]) {
      if (ms) await new Promise((ok) => setTimeout(ok, ctx.fastWait ? 0 : ms))
      const s = await exec(ctx, c, 'INSTAGRAM_GET_POST_STATUS', { creation_id: container })
      const st = String(s?.data?.status_code || s?.status_code || '').toUpperCase()
      if (st === 'FINISHED') {
        const pub = idDe(await exec(ctx, c, 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', { ig_user_id: ig, creation_id: container }))
        if (!pub) throw new Error('Falhou publicar o contêiner')
        return { url: `https://www.instagram.com/${c.user_info.username}/`, externalId: pub }
      }
      if (st === 'ERROR' || st === 'EXPIRED') throw new Error(`Contêiner terminou com status ${st}`)
    }
    throw new Error('Contêiner não chegou a FINISHED a tempo')
  },
}

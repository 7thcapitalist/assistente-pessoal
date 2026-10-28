import { POSTS, SLOTS } from './posts.mjs'

const USERNAME_KEY = 'INSTAGRAM_IA_USERNAME'
const PROIBIDAS = ['studio.frontstep', 'yourstyle.snkrshop']
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

export function montarRascunho(p, quando) {
  const detalhe = p.slides ? { slides: p.slides } : p.roteiro ? { roteiro: p.roteiro } : {}
  return {
    title: `[${p.formato}] ${p.title}`,
    body: legendaFinal(p),
    media: [],
    meta: { tema: p.pilar, formato: p.formato, arte: p.arte, ...detalhe, hashtags: [], imageUrls: [], videoUrl: null },
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

  async run(ctx) {
    const pendentes = await ctx.drafts.list({ status: 'pending', routine: 'instagram-ia' })
    if (pendentes.length > 0) { ctx.log(`já há ${pendentes.length} rascunhos pendentes; nada a gerar`); return }
    const proximo = Number(ctx.state.get('proximo') || 0)
    const lote = POSTS.slice(proximo, proximo + 8)
    if (lote.length === 0) { ctx.log('calendário inicial esgotado; peça novos temas'); return }
    const datas = agenda(ctx.now, lote.length)
    for (const [i, p] of lote.entries()) await ctx.createDraft(montarRascunho(p, datas[i]))
    ctx.state.set('proximo', proximo + lote.length)
    ctx.log(`${lote.length} rascunhos criados`)
  },

  async publish(draft, ctx) {
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

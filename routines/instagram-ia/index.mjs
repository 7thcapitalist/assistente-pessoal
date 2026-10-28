import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderA, renderB, renderC, pickMusic } from '../../src/reels/render.mjs'
import { renderSlides } from '../../src/reels/slides.mjs'

const CALENDARIO = new URL('../../data/instagram/calendario.json', import.meta.url)
const USERNAME_KEY = 'INSTAGRAM_IA_USERNAME'
const PROIBIDAS = ['studio.frontstep', 'yourstyle.snkrshop']
// Nomes e detalhes que nunca podem ir ao ar (regra de conteúdo do João).
export const VEDADOS = [/frontstep/i, /egg\s*champions/i, /roblox/i, /snkrshop/i, /yourstyle/i, /software house/i, /f[áa]brica de (sites|roblox)/i, /R\$\s*\d/]
export function conteudoProibido(texto) {
  return VEDADOS.find((r) => r.test(texto)) || null
}

export const lerCalendario = () => JSON.parse(readFileSync(CALENDARIO, 'utf8')).rascunhos
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
const TIPO = { A_gravar: 'A', B_imagens: 'B', C_voz: 'C' }

// Roteiro do tipo A em texto para ler no celular (teleprompter).
export function roteiroTexto(r) {
  const linhas = [`GANCHO (${r.gancho.segundos}s): ${r.gancho.fala}`, `   na tela: ${r.gancho.naTela}`]
  for (const b of r.blocos) linhas.push('', `${b.de}-${b.ate}s: ${b.fala}`, `   na tela: ${b.naTela}`)
  return linhas.join('\n')
}

// Item do calendário → rascunho. A grava vídeo, C grava áudio, B nasce em edição (o assistente faz sozinho).
export function montarRascunho(p) {
  const tipo = TIPO[p.tipo] || null
  const meta = { calId: p.id, tema: p.pilar, formato: p.formato, tipo, noticia: !!p.noticia, fonte: p.fonte ?? null, arte: p.arte, hashtags: [], imageUrls: [], videoUrl: null }
  const d = { title: tipo ? `Reel ${tipo} · ${p.titulo}` : `Carrossel · ${p.titulo}`, body: p.legenda, media: [], meta, scheduledFor: new Date(p.data).toISOString() }
  if (p.formato === 'carrossel') { meta.slides = p.slides; d.processing = true }
  else if (tipo === 'A') { meta.roteiro = p.roteiro; d.needs = [{ type: 'record_video', script: roteiroTexto(p.roteiro), durationSec: p.roteiro.duracaoSeg, notes: 'Vertical, de pé, luz na frente, microfone perto.' }] }
  else if (tipo === 'B') { meta.cenas = p.cenas; d.processing = true }
  else if (tipo === 'C') { meta.cenas = p.cenas; meta.narracao = p.narracao; d.needs = [{ type: 'record_audio', script: p.narracao, durationSec: p.cenas.reduce((a, c) => a + c.segundos, 0) }] }
  return d
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

async function finalizar(ctx, c, ig, container) {
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
}

export default {
  id: 'instagram-ia',
  name: 'Instagram IA: 4 posts/semana',
  channel: 'instagram',
  description: 'Cria rascunhos do calendário do Instagram de IA (Reels A/B/C e carrosséis), edita os vídeos no mini PC; publica só após aprovar, só na conta travada.',
  defaultSchedule: '0 9 * * 1',

  async run(ctx) {
    const feitos = new Set(ctx.state.get('criados') || [])
    const novos = lerCalendario().filter((p) => p.status === 'rascunho' && !feitos.has(p.id))
    if (!novos.length) { ctx.log('calendário sem itens novos; peça novos temas'); return }
    for (const p of novos) { await ctx.createDraft(montarRascunho(p)); feitos.add(p.id) }
    ctx.state.set('criados', [...feitos])
    ctx.log(`${novos.length} rascunhos criados`)
  },

  // Edição no mini PC (ffmpeg + transcrição local). Roda depois do upload do João (A, C) ou direto (B).
  async process(draft, ctx) {
    const m = draft.meta, dir = join(ctx.mediaDir, draft.id, 'edit')
    const titulo = draft.title.replace(/^(Reel [ABC]|Carrossel) · /, '')
    if (m.formato === 'carrossel') {
      const files = await renderSlides({ slides: m.slides, outDir: dir })
      ctx.log(`slides ${draft.id}: ${files.length} JPEG 1080x1350`)
      return { media: files.map((path) => ({ kind: 'slide', path, mime: 'image/jpeg' })) }
    }
    const music = pickMusic(ctx.musicDir, draft.id)
    const ultimo = (kind) => [...draft.media].reverse().find((x) => x.kind === kind)?.path
    let r
    if (m.tipo === 'A') {
      if (!ultimo('video_raw')) throw new Error('falta o vídeo bruto')
      r = await renderA({ raw: ultimo('video_raw'), roteiro: m.roteiro, titulo, outDir: dir, music })
    } else if (m.tipo === 'B') r = await renderB({ cenas: m.cenas, titulo, outDir: dir, music })
    else if (m.tipo === 'C') {
      if (!ultimo('audio')) throw new Error('falta o áudio')
      r = await renderC({ audio: ultimo('audio'), narracao: m.narracao, cenas: m.cenas, titulo, outDir: dir, music })
    } else throw new Error(`tipo sem edição automática: ${m.tipo}`)
    ctx.log(`editado ${draft.id}: ${r.duration.toFixed(1)}s`)
    return { media: [{ kind: 'video_final', path: r.video, mime: 'video/mp4' }, { kind: 'cover', path: r.cover, mime: 'image/jpeg' }] }
  },

  async publish(draft, ctx) {
    const m0 = draft.meta || {}
    const texto = [draft.title, draft.body, strings([m0.slides, m0.roteiro, m0.cenas, m0.narracao]).join('\n')].join('\n')
    const v = conteudoProibido(texto)
    if (v) throw new Error(`Conteúdo vedado (${v}): revele nada do negócio; edite o rascunho`)
    if (/\[[^\]]+\]/.test(texto)) throw new Error('Rascunho ainda tem [campo] sem preencher; edite antes de publicar')
    if (m0.noticia && !https(m0.fonte)) throw new Error('Post de notícia exige meta.fonte com URL https verificada (edite o rascunho)')
    const c = await contaTravada(ctx)
    const m = draft.meta || {}
    const ig = c.user_info.id
    let container
    let pub = null
    if (m.formato === 'reel') {
      let videoUrl = m.videoUrl, coverUrl
      const final = [...(draft.media || [])].reverse().find((x) => x.kind === 'video_final')?.path
      const capa = [...(draft.media || [])].reverse().find((x) => x.kind === 'cover')?.path
      if (!https(videoUrl)) {
        if (!final) throw new Error('Reel sem vídeo editado nem meta.videoUrl (edite o rascunho)')
        // Meta precisa baixar o mp4 por URL https pública: link temporário e secreto só durante a publicação.
        pub = await ctx.exposeFiles([final, ...(capa ? [capa] : [])])
        ;[videoUrl, coverUrl] = pub.urls
      }
      try {
        const args = { ig_user_id: ig, video_url: videoUrl, media_type: 'REELS', caption: draft.body }
        if (coverUrl) args.cover_url = coverUrl
        container = idDe(await exec(ctx, c, 'INSTAGRAM_POST_IG_USER_MEDIA', args))
        return await finalizar(ctx, c, ig, container)
      } finally { pub?.close() }
    } else {
      let urls = m.imageUrls || []
      try {
        if (!urls.length || !urls.every(https)) {
          const slides = (draft.media || []).filter((x) => x.kind === 'slide').map((x) => x.path)
          if (!slides.length) throw new Error('Falta meta.imageUrls ou slides gerados: URLs https públicas de JPEG (edite o rascunho)')
          pub = await ctx.exposeFiles(slides)
          urls = pub.urls
        }
        container = urls.length === 1
          ? idDe(await exec(ctx, c, 'INSTAGRAM_POST_IG_USER_MEDIA', { ig_user_id: ig, image_url: urls[0], caption: draft.body }))
          : idDe(await exec(ctx, c, 'INSTAGRAM_CREATE_CAROUSEL_CONTAINER', { ig_user_id: ig, child_image_urls: urls, caption: draft.body }))
        return await finalizar(ctx, c, ig, container)
      } finally { pub?.close() }
    }
    return finalizar(ctx, c, ig, container)
  },
}

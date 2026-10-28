// Edição de Reels com ffmpeg local (sem serviço pago). Três tipos:
//  roteiro_joao: João grava vídeo bruto; aqui corta silêncio, legenda queimada, música, 9:16, capa.
//  imagens:      cartões de texto animados + música, sem o João.
//  voz_joao:     cartões de texto + narração gravada pelo João; legenda sincronizada pela duração do áudio.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
const CANDIDATOS = ['/home/joao-vitor/dev/holding-hq/node_modules/ffmpeg-static/ffmpeg']

export function ffmpegBin(env = process.env) {
  if (env.FFMPEG_BIN) return env.FFMPEG_BIN
  return CANDIDATOS.find(existsSync) || 'ffmpeg'
}

function ff(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, ['-hide_banner', '-y', ...args])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', fail)
    p.on('close', (c) => (c === 0 ? ok(err) : fail(new Error(`ffmpeg saiu ${c}: ${err.slice(-400)}`))))
  })
}

export async function duracao(bin, arquivo) {
  const err = await ff(bin, ['-i', arquivo, '-f', 'null', '-']).catch((e) => e.message)
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(err)
  if (!m) throw new Error(`não consegui ler a duração de ${arquivo}`)
  return +m[1] * 3600 + +m[2] * 60 + +m[3]
}

export function quebra(texto, n = 20) {
  const linhas = []
  let l = ''
  for (const w of String(texto).split(/\s+/)) {
    if ((l + ' ' + w).trim().length > n && l) { linhas.push(l); l = w } else l = (l + ' ' + w).trim()
  }
  if (l) linhas.push(l)
  return linhas.join('\n')
}

// Reparte a duração entre as falas, proporcional ao nº de palavras.
export function legendas(falas, total) {
  const pesos = falas.map((f) => Math.max(1, f.split(/\s+/).length))
  const soma = pesos.reduce((a, b) => a + b, 0)
  let t = 0
  return falas.map((texto, i) => {
    const ini = t
    t += (pesos[i] / soma) * total
    return { ini, fim: t, texto }
  })
}

// Trechos a manter, dado o stderr do silencedetect.
export function trechosFalados(stderr, total, folga = 0.12) {
  const ini = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1])
  const fim = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1])
  const out = []
  let cursor = 0
  for (let i = 0; i < ini.length; i++) {
    const s = Math.max(cursor, ini[i] + folga)
    if (s - cursor > 0.2) out.push([cursor, s])
    cursor = fim[i] !== undefined ? Math.max(0, fim[i] - folga) : total
  }
  if (total - cursor > 0.2) out.push([cursor, total])
  return out.length ? out : [[0, total]]
}

// Transcrição local opcional (whisper.cpp): WHISPER_BIN + WHISPER_MODEL no env. Sem isso, usa o roteiro.
export async function transcrever(bin, arquivo, dir, env) {
  const wb = env('WHISPER_BIN'), wm = env('WHISPER_MODEL')
  if (!wb || !wm) return null
  const wav = join(dir, 'fala.wav')
  await ff(bin, ['-i', arquivo, '-ar', '16000', '-ac', '1', wav])
  await new Promise((ok, fail) => {
    const p = spawn(wb, ['-m', wm, '-f', wav, '-l', 'pt', '-osrt', '-of', join(dir, 'fala')])
    p.on('error', fail); p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`whisper saiu ${c}`))))
  })
  const srt = readFileSync(join(dir, 'fala.srt'), 'utf8')
  const t = (s) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 }
  return srt.trim().split(/\n\s*\n/).map((b) => {
    const l = b.split('\n'); const m = /(\S+) --> (\S+)/.exec(l[1] || '')
    return m ? { ini: t(m[1]), fim: t(m[2]), texto: l.slice(2).join(' ').trim() } : null
  }).filter(Boolean)
}

function drawCaptions(caps, dir, { y = 'h*0.72', size = 58, prefixo = 'cap' } = {}) {
  return caps.map((c, i) => {
    const f = join(dir, `${prefixo}${i}.txt`)
    writeFileSync(f, quebra(c.texto, 24))
    return `drawtext=fontfile=${FONTE}:textfile=${f}:fontcolor=white:fontsize=${size}:line_spacing=10:borderw=4:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t,${c.ini.toFixed(2)},${c.fim.toFixed(2)})'`
  })
}

// Música livre de direitos por construção: acordes sintetizados pelo próprio ffmpeg.
const MUSICA = "aevalsrc='0.07*sin(2*PI*220*t)+0.05*sin(2*PI*277.18*t)+0.05*sin(2*PI*329.63*t)*(0.6+0.4*sin(2*PI*0.25*t))'"
const FMT = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']

async function capa(bin, video, dir, titulo, t = 1) {
  const txt = join(dir, 'capa.txt'); writeFileSync(txt, quebra(titulo, 16))
  const out = join(dir, 'capa.jpg')
  await ff(bin, ['-ss', String(t), '-i', video, '-frames:v', '1', '-vf',
    `drawbox=x=0:y=ih*0.3:w=iw:h=ih*0.3:color=black@0.6:t=fill,drawtext=fontfile=${FONTE}:textfile=${txt}:fontcolor=white:fontsize=84:line_spacing=14:x=(w-text_w)/2:y=h*0.33`, out])
  return out
}

function cartoes(textos, total, dir) {
  const cap = legendas(textos, total)
  return cap.flatMap((c, i) => drawCaptions([c], dir, { y: '(h-text_h)/2', size: 76, prefixo: `slide${i}_` }))
}

const saida = (dir, video, mime = 'video/mp4') => ({ kind: 'video_final', path: video, mime, bytes: existsSync(video) ? readFileSync(video).length : 0 })

// tipo imagens e voz_joao: fundo + cartões; áudio = música ou a narração do João.
export async function montarCartoes({ textos, titulo, dir, narracao = null, bin = ffmpegBin(), falas = null, segundos = 30 }) {
  mkdirSync(dir, { recursive: true })
  const total = narracao ? await duracao(bin, narracao) + 0.5 : segundos
  const vf = ['format=yuv420p', ...cartoes(textos, total, dir)]
  if (falas) vf.push(...drawCaptions(legendas(falas, total), dir, { y: 'h*0.78', size: 50 }))
  const video = join(dir, 'final.mp4')
  const entradas = ['-f', 'lavfi', '-i', `color=c=0x10131c:s=1080x1920:r=30:d=${total.toFixed(2)}`]
  if (narracao) entradas.push('-i', narracao, '-f', 'lavfi', '-i', MUSICA + `:d=${total.toFixed(2)}`)
  else entradas.push('-f', 'lavfi', '-i', MUSICA + `:d=${total.toFixed(2)}`)
  const audio = narracao ? '[1:a]apad[nv];[2:a]volume=0.35[mu];[nv][mu]amix=inputs=2:duration=shortest:normalize=0[a]' : '[1:a]afade=t=in:d=1,afade=t=out:st=' + (total - 1).toFixed(2) + ':d=1[a]'
  await ff(bin, [...entradas, '-filter_complex', `[0:v]${vf.join(',')}[v];${audio}`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), ...FMT, video])
  const cover = await capa(bin, video, dir, titulo, 0.5)
  return { duracao: total, media: [saida(dir, video), { kind: 'cover', path: cover, mime: 'image/jpeg', bytes: readFileSync(cover).length }] }
}

// tipo roteiro_joao: vídeo bruto -> corta silêncio, 9:16, legenda queimada, música baixa, capa.
export async function editarBruto({ raw, titulo, dir, falas, env = () => '', bin = ffmpegBin() }) {
  mkdirSync(dir, { recursive: true })
  const total = await duracao(bin, raw)
  const sil = await ff(bin, ['-i', raw, '-af', 'silencedetect=noise=-32dB:d=0.45', '-f', 'null', '-']).catch((e) => e.message)
  const trechos = trechosFalados(sil, total)
  const sel = trechos.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')
  const novo = trechos.reduce((s, [a, b]) => s + (b - a), 0)
  let caps = await transcrever(bin, raw, dir, env).catch(() => null)
  let fonteLegenda = 'transcricao'
  if (!caps || !caps.length) { caps = legendas(falas, novo); fonteLegenda = 'roteiro' }
  else { // tempos da transcrição são do bruto; remapeia para o vídeo já sem silêncio
    const mapa = (t) => { let acc = 0; for (const [a, b] of trechos) { if (t < a) return acc; if (t <= b) return acc + t - a; acc += b - a } return acc }
    caps = caps.map((c) => ({ ...c, ini: mapa(c.ini), fim: mapa(c.fim) }))
  }
  const video = join(dir, 'final.mp4')
  const vf = [`select='${sel}'`, 'setpts=N/FRAME_RATE/TB', 'scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920', ...drawCaptions(caps, dir)]
  await ff(bin, ['-i', raw, '-f', 'lavfi', '-i', MUSICA + `:d=${novo.toFixed(2)}`, '-filter_complex',
    `[0:v]${vf.join(',')}[v];[0:a]aselect='${sel}',asetpts=N/SR/TB[f];[1:a]volume=0.25[m];[f][m]amix=inputs=2:duration=first:normalize=0[a]`,
    '-map', '[v]', '-map', '[a]', ...FMT, video])
  const cover = await capa(bin, video, dir, titulo)
  return { duracao: novo, fonteLegenda, media: [saida(dir, video), { kind: 'cover', path: cover, mime: 'image/jpeg', bytes: readFileSync(cover).length }] }
}

import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { ffmpeg, probe, transcribe } from './tools.mjs';
import { dropFillers, keepRanges, totalLen, remapWords, captionGroups, sceneSpans, fixedSpans, blockSpans } from './plan.mjs';
import { assDoc, captionEvents, topEvents, cardEvents, staticCaptionEvents, coverDoc } from './ass.mjs';

const W = 1080, H = 1920, FPS = 30;
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart'];
const BG = (d) => `gradients=s=${W}x${H}:r=${FPS}:d=${d.toFixed(2)}:c0=0x0a0f1f:c1=0x1b2f6b:c2=0x0a0f1f:x0=0:y0=0:x1=${W}:y1=${H}:speed=0.015`;
const MUSIC_EXT = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.opus', '.aac']);

// Música livre escolhida entre as faixas de data/musica/ (o João confere a licença antes de colocar). Determinística por rascunho.
export function pickMusic(dir, seed = '') {
  if (!dir || !existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => MUSIC_EXT.has(extname(f).toLowerCase())).sort();
  if (!files.length) return null;
  return join(dir, files[createHash('sha1').update(String(seed)).digest()[0] % files.length]);
}

// Trilha final: voz (opcional) normalizada + música baixa com fade; saída [aout].
function audioGraph({ voice, musicIdx, total, musicVol }) {
  const fade = `afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5`;
  const mu = musicIdx == null ? null : `[${musicIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${musicVol},${fade}[mu]`;
  const parts = [];
  if (voice && mu) parts.push(mu, `[${voice}]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[vo]`, `[vo][mu]amix=inputs=2:duration=first:normalize=0,atrim=0:${total.toFixed(2)}[aout]`);
  else if (voice) parts.push(`[${voice}]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(2)}[aout]`);
  else if (mu) parts.push(mu, `[mu]atrim=0:${total.toFixed(2)}[aout]`);
  else parts.push(`anullsrc=r=48000:cl=stereo,atrim=0:${total.toFixed(2)}[aout]`);
  return parts;
}

async function makeCover(work, title, out, { frameFrom, at = 0.5 }) {
  writeFileSync(join(work, 'cover.ass'), coverDoc(title));
  const base = frameFrom
    ? ['-ss', at.toFixed(2), '-i', frameFrom, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=brightness=-0.28:saturation=1.1,subtitles=cover.ass`]
    : ['-f', 'lavfi', '-i', BG(1), '-vf', 'subtitles=cover.ass'];
  await ffmpeg([...base, '-frames:v', '1', '-q:v', '2', out], { cwd: work });
}

async function verify(file) {
  const p = await probe(file);
  if (!p.hasVideo || !p.hasAudio || p.width !== W || p.height !== H) throw new Error(`saída fora do padrão 9:16: ${p.width}x${p.height}`);
  return p;
}

// Corta trechos (vídeo+áudio ou só áudio) e concatena. Segmentos alternados ganham zoom leve (ritmo).
function cutGraph(ranges, { video }) {
  const g = [], labels = [];
  ranges.forEach((r, i) => {
    const d = r.e - r.s, f = Math.min(0.015, d / 4);
    if (video) {
      const zoom = i % 2 ? `,crop=iw/1.1:ih/1.1,scale=${W}:${H}` : '';
      g.push(`[0:v]trim=start=${r.s.toFixed(3)}:end=${r.e.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${zoom},fps=${FPS},setsar=1[v${i}]`);
      labels.push(`[v${i}]`);
    }
    g.push(`[0:a]atrim=start=${r.s.toFixed(3)}:end=${r.e.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=${f},afade=t=out:st=${(d - f).toFixed(3)}:d=${f}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  g.push(`${labels.join('')}concat=n=${ranges.length}:v=${video ? 1 : 0}:a=1${video ? '[cv]' : ''}[ca]`);
  return g;
}

/** Tipo A: vídeo bruto do João → corte de silêncio/hesitação, legenda, ritmo, música, capa. */
export async function renderA({ raw, roteiro, titulo, outDir, workDir = outDir, music }) {
  mkdirSync(outDir, { recursive: true }); mkdirSync(workDir, { recursive: true });
  const info = await probe(raw);
  if (!info.hasVideo || !info.hasAudio) throw new Error('o arquivo enviado precisa ter vídeo e som');
  const prompt = [roteiro?.gancho?.fala, ...(roteiro?.blocos ?? []).map((b) => b.fala)].filter(Boolean).join(' ');
  const tr = await transcribe(raw, prompt);
  const words = dropFillers(tr.words);
  if (!words.length) throw new Error('não ouvi fala no vídeo; grave de novo com o microfone perto');
  const ranges = keepRanges(words, info.duration), total = totalLen(ranges), rw = remapWords(words, ranges);
  writeFileSync(join(workDir, 'reel.ass'), assDoc(captionEvents(captionGroups(rw)), topEvents(blockSpans(roteiro, total))));
  const g = cutGraph(ranges, { video: true });
  g.push('[cv]subtitles=reel.ass[vout]', ...audioGraph({ voice: 'ca', musicIdx: music ? 1 : null, total, musicVol: 0.12 }));
  const video = join(outDir, 'reel-final.mp4'), cover = join(outDir, 'reel-capa.jpg');
  await ffmpeg(['-i', raw, ...(music ? ['-stream_loop', '-1', '-i', music] : []), '-filter_complex', g.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(2), ...ENC, video], { cwd: workDir });
  await makeCover(workDir, titulo, cover, { frameFrom: raw, at: ranges[0].s + 0.6 }); // capa do bruto: sem legenda queimada
  const p = await verify(video);
  return { video, cover, duration: p.duration, cortes: ranges.length, palavras: words.length, music: !!music };
}

/** Tipo B: só cartões e legenda, sem o João. */
export async function renderB({ cenas, titulo, outDir, workDir = outDir, music }) {
  mkdirSync(outDir, { recursive: true }); mkdirSync(workDir, { recursive: true });
  if (!cenas?.length) throw new Error('reel B sem cenas');
  const spans = fixedSpans(cenas), total = spans.at(-1).e;
  writeFileSync(join(workDir, 'reel.ass'), assDoc(cardEvents(spans, cenas), staticCaptionEvents(spans, cenas)));
  const g = [`${BG(total)},subtitles=reel.ass[vout]`, ...audioGraph({ voice: null, musicIdx: music ? 0 : null, total, musicVol: 0.55 })];
  const video = join(outDir, 'reel-final.mp4'), cover = join(outDir, 'reel-capa.jpg');
  await ffmpeg([...(music ? ['-stream_loop', '-1', '-i', music] : []), '-filter_complex', g.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(2), ...ENC, video], { cwd: workDir });
  await makeCover(workDir, titulo, cover, {});
  const p = await verify(video);
  return { video, cover, duration: p.duration, music: !!music };
}

/** Tipo C: áudio do João + cenas sincronizadas à voz. */
export async function renderC({ audio, narracao, cenas, titulo, outDir, workDir = outDir, music }) {
  mkdirSync(outDir, { recursive: true }); mkdirSync(workDir, { recursive: true });
  if (!cenas?.length) throw new Error('reel C sem cenas');
  const info = await probe(audio);
  if (!info.hasAudio) throw new Error('o arquivo enviado não tem som');
  const tr = await transcribe(audio, narracao);
  const words = dropFillers(tr.words);
  if (!words.length) throw new Error('não ouvi fala no áudio; grave de novo com o microfone perto');
  const ranges = keepRanges(words, info.duration), voiceLen = totalLen(ranges), total = voiceLen + 0.6, rw = remapWords(words, ranges);
  const spans = sceneSpans(cenas, rw, total);
  writeFileSync(join(workDir, 'reel.ass'), assDoc(cardEvents(spans, cenas), captionEvents(captionGroups(rw))));
  const g = cutGraph(ranges, { video: false });
  g.push(`${BG(total)},subtitles=reel.ass[vout]`, ...audioGraph({ voice: 'ca', musicIdx: music ? 1 : null, total, musicVol: 0.1 }));
  const video = join(outDir, 'reel-final.mp4'), cover = join(outDir, 'reel-capa.jpg');
  await ffmpeg(['-i', audio, ...(music ? ['-stream_loop', '-1', '-i', music] : []), '-filter_complex', g.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(2), ...ENC, video], { cwd: workDir });
  await makeCover(workDir, titulo, cover, {});
  const p = await verify(video);
  return { video, cover, duration: p.duration, cortes: ranges.length, palavras: words.length, music: !!music };
}

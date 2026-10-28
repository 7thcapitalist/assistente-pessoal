// Lógica pura da edição (sem ffmpeg): cortes por palavra, remapeamento de tempo, grupos de legenda e tempo das cenas.
const FILLERS = new Set(['é', 'hm', 'hmm', 'ãh', 'ah', 'ahn', 'eh', 'uh', 'um', 'ããh', 'éé', 'hã']);
const norm = (w) => w.toLowerCase().replace(/[.,!?…;:]+$/g, '').replace(/^[.,!?…;:]+/g, '');

// Tira hesitações (é, hm, ãh) quando soltas; palavras com sentido ficam.
export function dropFillers(words) {
  return words.filter((w) => !FILLERS.has(norm(w.w)));
}

/**
 * Trechos a manter: cada palavra ganha folga (pre/post); lacunas maiores que minGap são cortadas.
 * Devolve [{s,e}] em segundos do arquivo original, dentro de [0,duration].
 */
export function keepRanges(words, duration, { pre = 0.08, post = 0.18, minGap = 0.4, tail = 0.35 } = {}) {
  if (!words.length) return [];
  const out = [];
  for (const w of words) {
    const s = Math.max(0, w.s - pre), e = Math.min(duration, w.e + post);
    const last = out[out.length - 1];
    if (last && s - last.e < minGap) last.e = Math.max(last.e, e);
    else out.push({ s, e });
  }
  out[out.length - 1].e = Math.min(duration, words[words.length - 1].e + tail);
  return out;
}

export const totalLen = (ranges) => ranges.reduce((a, r) => a + (r.e - r.s), 0);

// Tempo do arquivo original → tempo do vídeo cortado.
export function remap(t, ranges) {
  let off = 0;
  for (const r of ranges) {
    if (t < r.s) return off;
    if (t <= r.e) return off + (t - r.s);
    off += r.e - r.s;
  }
  return off;
}

export const remapWords = (words, ranges) => words.map((w) => ({ ...w, s: remap(w.s, ranges), e: remap(w.e, ranges) }));

// Grupos de legenda: até maxWords palavras, quebra em pontuação final ou pausa longa.
export function captionGroups(words, { maxWords = 4, maxChars = 24, gap = 0.6 } = {}) {
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length) groups.push(cur); cur = []; };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.s - prev.e > gap || cur.length >= maxWords || cur.map((x) => x.w).join(' ').length + w.w.length > maxChars)) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.w)) flush();
  }
  flush();
  return groups;
}

/**
 * Cenas do tipo C: as cenas dividem a fala na proporção de `segundos`; a virada de cada cena cai
 * no início da palavra correspondente da transcrição. Devolve [{s,e}] cobrindo [0,total].
 */
export function sceneSpans(scenes, words, total) {
  const w = scenes.map((c) => Math.max(0.1, Number(c.segundos) || 1)), sum = w.reduce((a, b) => a + b, 0);
  const spans = [];
  let acc = 0, start = 0;
  for (let i = 0; i < scenes.length; i++) {
    acc += w[i];
    let end = total;
    if (i < scenes.length - 1) {
      const idx = Math.min(words.length - 1, Math.max(0, Math.round((acc / sum) * words.length)));
      end = words.length ? Math.max(start + 0.5, words[idx].s) : (acc / sum) * total;
    }
    spans.push({ s: start, e: Math.min(end, total) });
    start = spans[i].e;
  }
  return spans;
}

// Cenas do tipo B: duração fixa pelo roteiro.
export function fixedSpans(scenes) {
  let t = 0;
  return scenes.map((c) => { const s = t; t += Math.max(1, Number(c.segundos) || 3); return { s, e: t }; });
}

// Textos na tela do tipo A: um por bloco do roteiro, distribuídos pela proporção do bloco no vídeo final.
export function blockSpans(roteiro, total) {
  const blocos = roteiro?.blocos ?? [];
  const dur = roteiro?.duracaoSeg || blocos.at(-1)?.ate || total;
  const hook = roteiro?.gancho ? [{ text: roteiro.gancho.naTela, s: 0, e: Math.min(roteiro.gancho.segundos || 2, total) }] : [];
  const first = hook[0]?.e ?? 0;
  const out = [...hook];
  for (const b of blocos) {
    const s = Math.max(first, (b.de / dur) * total), e = Math.min(total, (b.ate / dur) * total);
    if (e > s && b.naTela) out.push({ text: b.naTela, s, e });
  }
  return out;
}

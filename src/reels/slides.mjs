import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpeg } from './tools.mjs';
import { esc } from './ass.mjs';

// Slides do carrossel: JPEG 1080x1350 (4:5), mesmo fundo e fonte das capas dos Reels.
const W = 1080, H = 1350;
const BG = `gradients=s=${W}x${H}:r=1:d=1:c0=0x0a0f1f:c1=0x1b2f6b:c2=0x0a0f1f:x0=0:y0=0:x1=${W}:y1=${H}`;

export function slideDoc(texto, i, total) {
  const capa = i === 0;
  const dialogo = (st, t) => `Dialogue: 1,0:00:00.00,0:00:05.00,${st},,0,0,0,,${t}\n`;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Slide,DejaVu Sans,${capa ? 104 : 88},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,8,3,5,90,90,0,1
Style: Num,DejaVu Sans,46,&H0000C8FF,&H0000C8FF,&H00000000,&H80000000,1,0,0,0,100,100,3,0,1,0,0,9,70,70,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogo('Slide', esc(texto))}${total > 1 ? dialogo('Num', `${i + 1}/${total}`) : ''}`;
}

/** slides (textos) → JPEGs numerados em outDir. Devolve os caminhos em ordem. */
export async function renderSlides({ slides, outDir }) {
  if (!Array.isArray(slides) || !slides.length || !slides.every((s) => typeof s === 'string' && s.trim())) throw new Error('meta.slides precisa ser uma lista de textos');
  if (slides.length > 10) throw new Error('carrossel do Instagram aceita no máximo 10 slides');
  mkdirSync(outDir, { recursive: true });
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    writeFileSync(join(outDir, 'slide.ass'), slideDoc(slides[i], i, slides.length));
    const file = join(outDir, `slide-${String(i + 1).padStart(2, '0')}.jpg`);
    await ffmpeg(['-f', 'lavfi', '-i', BG, '-vf', 'subtitles=slide.ass', '-frames:v', '1', '-q:v', '2', file], { cwd: outDir });
    out.push(file);
  }
  return out;
}

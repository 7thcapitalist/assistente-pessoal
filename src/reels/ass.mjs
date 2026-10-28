// Gera legendas/cartões em ASS (libass, via filtro `subtitles` do ffmpeg). Tela de 1080x1920.
const cs = (sec) => Math.max(0, Math.round(sec * 100));
const ts = (sec) => {
  const t = cs(sec), h = Math.floor(t / 360000), m = Math.floor((t % 360000) / 6000), s = Math.floor((t % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`;
};
// Texto do usuário não pode virar override tag: tira { } \ .
export const esc = (t) => String(t).replace(/[{}\\]/g, '').replace(/\r?\n/g, '\\N');

const FONT = 'DejaVu Sans';
// cores ASS: &HAABBGGRR
const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${FONT},74,&H0000E0FF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,7,2,2,70,70,430,1
Style: Top,${FONT},62,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,2,8,80,80,250,1
Style: Card,${FONT},104,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,0,6,5,90,90,0,1
Style: Num,${FONT},440,&H0000C8FF,&H0000C8FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,0,8,5,60,60,260,1
Style: Cover,${FONT},118,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,10,3,5,80,80,0,1
Style: Tag,${FONT},52,&H0000C8FF,&H0000C8FF,&H00000000,&H80000000,1,0,0,0,100,100,3,0,1,0,0,8,80,80,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const ev = (layer, s, e, style, text) => `Dialogue: ${layer},${ts(s)},${ts(e)},${style},,0,0,0,,${text}\n`;

// Legenda palavra a palavra (karaoke: a palavra falada acende em amarelo).
export function captionEvents(groups) {
  return groups.map((g) => {
    const s = g[0].s, e = g[g.length - 1].e + 0.15;
    const text = g.map((w, i) => `{\\kf${cs((g[i + 1]?.s ?? e) - w.s)}}${esc(w.w)}`).join(' ');
    return ev(1, s, e, 'Cap', text);
  }).join('');
}

// Texto no topo, com entrada suave.
export function topEvents(items) {
  return items.map((t) => ev(2, t.s, t.e, 'Top', `{\\fad(180,150)\\blur1}${esc(t.text)}`)).join('');
}

// Cartão grande de uma cena: número solto vira "Num"; texto vira "Card". Zoom lento durante a cena.
export function cardEvents(spans, scenes) {
  return spans.map((sp, i) => {
    const c = scenes[i], d = Math.max(0.2, sp.e - sp.s), card = String(c.card ?? '').trim();
    if (!card) return '';
    const zoom = `\\fscx100\\fscy100\\t(0,${cs(d) * 10},\\fscx108\\fscy108)`;
    const anim = `{\\fad(220,160)${zoom}}`;
    return ev(1, sp.s, sp.e, /^\d{1,2}$/.test(card) ? 'Num' : 'Card', anim + esc(card));
  }).join('');
}

export const assDoc = (...parts) => HEADER + parts.join('');

export function coverDoc(title) {
  return assDoc(ev(1, 0, 5, 'Cover', esc(title)));
}

// Legenda fixa (tipo B): texto da cena em branco, sem karaoke.
export function staticCaptionEvents(spans, scenes) {
  return spans.map((sp, i) => {
    const t = String(scenes[i].naTela ?? '').trim();
    return !t || t === String(scenes[i].card ?? '').trim() ? '' : ev(1, sp.s, sp.e, 'Cap', `{\\fad(200,150)\\1c&HFFFFFF&}${esc(t)}`);
  }).join('');
}

// Modo ausente (policy §4, HOL-267): com o modo ATIVO, rascunho de tema aprovado e formato sem rosto/voz do João
// é aprovado sozinho 24 h depois do aviso na tarefa, se ele não vetar (Cancel). Modo DESLIGADO: nada muda.
// Reel nunca entra (gravação dele, voz ou imagens): só carrossel/card no Instagram e post de texto no LinkedIn.
import * as store from './db.mjs';

export const VETO_MS = 24 * 3600e3;
// Temas já aprovados pelo João (pilares da estratégia). Tema novo espera o João.
export const TEMAS_APROVADOS = {
  linkedin: ['interno', 'mundo'],
  instagram: ['bastidores', 'como_eu_faco', 'erro_e_correcao', 'ia_no_mundo'],
};
const FORMATOS_SEM_ROSTO = { linkedin: [undefined, 'texto'], instagram: ['carrossel', 'bastidores'] };

const cfg = (db) => store.stateStore(db, '_config');
export const modoAusente = (db) => cfg(db).get('modo_ausente') === true;
export const setModoAusente = (db, on) => cfg(db).set('modo_ausente', !!on);

// Motivo de não ser elegível, ou null se pode entrar na regra das 24 h.
export function motivoNaoElegivel(d) {
  if (d.status !== 'pending') return `status ${d.status}`;
  const m = d.meta ?? {};
  if (!TEMAS_APROVADOS[d.channel]) return `canal ${d.channel} fora da regra`;
  if (d.needs.length) return 'precisa de gravação do João';
  if (m.tipo || m.formato === 'reel' || d.media.some((x) => ['video_raw', 'audio', 'video_final'].includes(x.kind))) return 'reel/vídeo/voz nunca é automático';
  if (!FORMATOS_SEM_ROSTO[d.channel].includes(m.formato)) return `formato ${m.formato} fora da regra`;
  if (!TEMAS_APROVADOS[d.channel].includes(m.tema)) return `tema "${m.tema}" ainda não aprovado`;
  if (d.channel === 'instagram' && m.noticia && !/^https:/.test(m.fonte || '')) return 'notícia sem fonte https';
  return null;
}

const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const fingerprint = (d) => `${d.title}\n${d.body}`;

// Um passo do tick. `pc` é a ponte Paperclip (precisa para avisar e para checar o veto); sem ela nada é automático.
export async function passoAusente(db, pc, at = new Date()) {
  const out = [];
  const on = modoAusente(db);
  const st = store.stateStore(db, '_paperclip');
  // Modo desligado: o que o modo aprovou e ainda não saiu volta para a fila do João.
  if (!on) {
    for (const d of store.listDrafts(db, { status: 'approved' })) {
      if (d.meta?.auto?.aprovadoEm) { store.unapprove(db, d.id); out.push({ draft: d.id, devolvido: true }); }
    }
    return out;
  }
  if (!pc) return out;
  for (const d of store.listDrafts(db, { status: 'pending' })) {
    if (motivoNaoElegivel(d)) continue;
    const link = st.get(`d:${d.id}`);
    if (!link) continue; // sem tarefa não há como avisar o João
    const a = d.meta.auto;
    if (!a || a.fp !== fingerprint(d)) {
      // Aviso (ou novo aviso se o texto mudou): o relógio das 24 h começa só depois que o comentário foi postado.
      const quandoSai = new Date(at.getTime() + VETO_MS).toISOString();
      await pc.say(link, `**Modo ausente:** se você não vetar, publico sozinho depois de ${quando(quandoSai)} (24 h).\n**Para vetar:** **Cancel** nesta tarefa. **Para publicar já:** **Done**. Para mudar o texto: comente \`Texto:\` (o prazo recomeça).`);
      store.editDraft(db, d.id, { meta: { ...d.meta, auto: { avisoEm: at.toISOString(), fp: fingerprint(d) } } });
      st.set(`d:${d.id}`, link);
      out.push({ draft: d.id, avisado: quandoSai });
      continue;
    }
    if (at - new Date(a.avisoEm) < VETO_MS) continue;
    // Última conferência do veto direto na tarefa (a ponte pode ainda não ter lido o Cancel).
    const issue = await pc.getIssue(link.issueId);
    if (issue.status === 'cancelled') continue;
    const ap = store.decide(db, d.id, 'approve');
    store.setMeta(db, d.id, { ...ap.meta, auto: { ...a, aprovadoEm: at.toISOString() } });
    await pc.say(link, 'Sem veto em 24 h (Modo ausente): aprovado automaticamente. Publico no horário e deixo o link aqui.');
    out.push({ draft: d.id, aprovado: true });
  }
  return out;
}

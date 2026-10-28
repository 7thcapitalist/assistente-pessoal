// Rascunhos (por canal) e itens "precisa do João". Validação + transições de status.
import { mutate, load, newId, now, addLog } from './store.js';

export const CHANNELS = ['linkedin', 'instagram'];
export const NEED_TYPES = ['gravar', 'conectar', 'decidir'];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const str = (v, name, { max = 20000, required = false } = {}) => {
  if (v == null || v === '') {
    if (required) throw new HttpError(400, `campo obrigatório: ${name}`);
    return undefined;
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, `campo inválido: ${name}`);
  return v;
};

export function createDraft(input) {
  if (!CHANNELS.includes(input.channel)) throw new HttpError(400, `channel deve ser um de: ${CHANNELS.join(', ')}`);
  const scheduled = str(input.scheduled_for, 'scheduled_for', { max: 40 });
  if (scheduled && Number.isNaN(Date.parse(scheduled))) throw new HttpError(400, 'scheduled_for inválido (use ISO 8601)');
  const draft = {
    id: newId('d'),
    channel: input.channel,
    routine: str(input.routine, 'routine', { max: 80 }),
    kind: str(input.kind, 'kind', { max: 40 }) || 'post',
    title: str(input.title, 'title', { max: 200, required: true }),
    body: str(input.body, 'body', { required: true }),
    scheduled_for: scheduled,
    sources: Array.isArray(input.sources) ? input.sources.filter((s) => typeof s === 'string').slice(0, 20) : [],
    media: Array.isArray(input.media) ? input.media.filter((m) => m && typeof m.path === 'string').slice(0, 20) : [],
    notes: str(input.notes, 'notes'),
    status: 'pending',
    created_at: now(),
  };
  mutate((s) => { s.drafts.unshift(draft); addLog(s, `rascunho criado: ${draft.title}`, { draft: draft.id }); });
  return draft;
}

const findDraft = (s, id) => {
  const d = s.drafts.find((x) => x.id === id);
  if (!d) throw new HttpError(404, 'rascunho não encontrado');
  return d;
};

// pending -> approved | rejected ; approved -> pending (desfazer) ; edição só enquanto não publicado
export function updateDraft(id, action, payload = {}) {
  return mutate((s) => {
    const d = findDraft(s, id);
    if (d.status === 'published') throw new HttpError(409, 'já publicado');
    if (action === 'approve') {
      d.status = 'approved'; d.approved_at = now();
    } else if (action === 'reject') {
      d.status = 'rejected'; d.rejected_at = now(); d.reject_reason = str(payload.reason, 'reason', { max: 1000 });
    } else if (action === 'reopen') {
      d.status = 'pending';
    } else if (action === 'edit') {
      if (payload.body !== undefined) d.body = str(payload.body, 'body', { required: true });
      if (payload.title !== undefined) d.title = str(payload.title, 'title', { max: 200, required: true });
      if (payload.scheduled_for !== undefined) {
        if (payload.scheduled_for && Number.isNaN(Date.parse(payload.scheduled_for))) throw new HttpError(400, 'scheduled_for inválido');
        d.scheduled_for = payload.scheduled_for || undefined;
      }
      d.edited_at = now();
      if (d.status === 'approved') d.status = 'pending'; // editou, precisa aprovar de novo
    } else throw new HttpError(400, 'ação desconhecida');
    addLog(s, `rascunho ${action}: ${d.title}`, { draft: id });
    return d;
  });
}

export function createNeed(input) {
  if (!NEED_TYPES.includes(input.type)) throw new HttpError(400, `type deve ser um de: ${NEED_TYPES.join(', ')}`);
  const need = {
    id: newId('n'),
    routine: str(input.routine, 'routine', { max: 80 }),
    type: input.type,
    title: str(input.title, 'title', { max: 200, required: true }),
    instruction: str(input.instruction, 'instruction', { required: true }),
    link: str(input.link, 'link', { max: 2000 }),
    due: str(input.due, 'due', { max: 40 }),
    status: 'open',
    created_at: now(),
  };
  mutate((s) => { s.needs.unshift(need); addLog(s, `precisa do João: ${need.title}`, { need: need.id }); });
  return need;
}

export function resolveNeed(id, payload = {}) {
  return mutate((s) => {
    const n = s.needs.find((x) => x.id === id);
    if (!n) throw new HttpError(404, 'item não encontrado');
    n.status = 'done'; n.done_at = now(); n.answer = str(payload.answer, 'answer', { max: 5000 });
    addLog(s, `resolvido: ${n.title}`, { need: id });
    return n;
  });
}

export const history = () => load().drafts.filter((d) => d.status === 'published')
  .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));

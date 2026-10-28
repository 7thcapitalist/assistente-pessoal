const TABS = [['drafts', 'Rascunhos'], ['needs', 'Precisa de você'], ['routines', 'Rotinas'], ['upload', 'Upload'], ['history', 'Publicado']];
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
let data; let tab = location.hash.slice(1) || 'drafts'; const editing = new Set();

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};
const api = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json();
  if (!r.ok) { alert(j.error || 'erro'); throw new Error(j.error); }
  return j;
};
const fmt = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
const act = (fn) => async () => { await fn(); await refresh(); };

function draftCard(d) {
  const tags = el('div', { class: 'row' }, el('span', { class: `tag ${d.channel}` }, d.channel), el('span', { class: 'tag' }, d.kind),
    d.status === 'approved' ? el('span', { class: 'tag ok' }, 'aprovado') : null,
    d.status === 'rejected' ? el('span', { class: 'tag' }, 'recusado') : null,
    el('span', { class: 'mute' }, `agendado: ${fmt(d.scheduled_for)}`));
  if (editing.has(d.id)) {
    const ta = el('textarea', {}, d.body); ta.value = d.body;
    return el('div', { class: 'card' }, tags, el('h3', {}, d.title), ta,
      el('div', { class: 'row' },
        el('button', { class: 'b ok', onclick: act(async () => { await api(`/api/drafts/${d.id}/edit`, { body: ta.value }); editing.delete(d.id); }) }, 'Salvar'),
        el('button', { class: 'b', onclick: () => { editing.delete(d.id); render(); } }, 'Cancelar')));
  }
  const media = (d.media || []).map((m) => el('div', { class: 'mute' }, `${m.type}: ${m.path}`));
  const src = (d.sources || []).map((u) => el('div', {}, el('a', { href: u, target: '_blank', rel: 'noopener' }, u)));
  const buttons = d.status === 'approved'
    ? [el('button', { class: 'b', onclick: act(() => api(`/api/drafts/${d.id}/reopen`)) }, 'Desfazer aprovação')]
    : [el('button', { class: 'b ok', onclick: act(() => api(`/api/drafts/${d.id}/approve`)) }, 'Aprovar'),
       el('button', { class: 'b', onclick: () => { editing.add(d.id); render(); } }, 'Editar'),
       d.status === 'rejected' ? el('button', { class: 'b', onclick: act(() => api(`/api/drafts/${d.id}/reopen`)) }, 'Reabrir')
         : el('button', { class: 'b bad', onclick: act(async () => { const reason = prompt('Por quê? (opcional)') ?? null; if (reason !== null) await api(`/api/drafts/${d.id}/reject`, { reason }); }) }, 'Recusar')];
  return el('div', { class: 'card' }, tags, el('h3', {}, d.title), el('div', { class: 'body' }, d.body), media, src,
    d.notes ? el('div', { class: 'mute' }, `Nota: ${d.notes}`) : null, el('div', { class: 'row' }, buttons));
}

function viewDrafts() {
  const list = data.drafts.filter((d) => d.status !== 'rejected');
  const rej = data.drafts.filter((d) => d.status === 'rejected');
  return [list.length ? list.map(draftCard) : el('div', { class: 'empty' }, 'Nenhum rascunho esperando.'),
    rej.length ? el('details', {}, el('summary', { class: 'mute' }, `Recusados (${rej.length})`), rej.map(draftCard)) : null];
}

function viewNeeds() {
  if (!data.needs.length) return el('div', { class: 'empty' }, 'Nada pendente com você.');
  return data.needs.map((n) => {
    const answer = el('input', { type: 'text', placeholder: 'Resposta (opcional)' });
    return el('div', { class: 'card' },
      el('div', { class: 'row' }, el('span', { class: 'tag' }, n.type), n.routine ? el('span', { class: 'mute' }, n.routine) : null, n.due ? el('span', { class: 'mute' }, `até ${fmt(n.due)}`) : null),
      el('h3', {}, n.title), el('div', { class: 'body' }, n.instruction),
      n.link ? el('p', {}, el('a', { href: n.link, target: '_blank', rel: 'noopener' }, 'Abrir link')) : null,
      n.type === 'decidir' ? answer : null,
      el('div', { class: 'row', style: 'margin-top:8px' },
        n.type === 'gravar' ? el('a', { class: 'b', href: `#upload` , onclick: () => { tab = 'upload'; render(); } }, 'Enviar gravação') : null,
        el('button', { class: 'b ok', onclick: act(() => api(`/api/needs/${n.id}/done`, { answer: answer.value || undefined })) }, 'Feito')));
  });
}

function viewRoutines() {
  return data.routines.map((r) => {
    const c = r.config;
    const save = (patch) => act(() => api(`/api/routines/${r.id}`, patch))();
    const scheduleUi = c.every_minutes ? el('span', { class: 'mute' }, `a cada ${c.every_minutes} min`) : el('div', { class: 'row' },
      el('input', { type: 'time', value: c.time, onchange: (e) => save({ time: e.target.value }) }),
      el('div', { class: 'days' }, DOW.map((d, i) => el('label', {}, el('input', { type: 'checkbox', checked: c.days.includes(i),
        onchange: (e) => save({ days: DOW.map((_, j) => j).filter((j) => (j === i ? e.target.checked : c.days.includes(j))) }) }), el('span', {}, d)))));
    return el('div', { class: 'card' },
      el('div', { class: 'row between' }, el('h3', {}, r.name), el('input', { type: 'checkbox', class: 'sw', checked: c.enabled, onchange: (e) => save({ enabled: e.target.checked }) })),
      el('div', { class: 'mute' }, r.description), el('div', { style: 'margin:8px 0' }, scheduleUi),
      el('div', { class: 'row between' }, el('span', { class: 'mute' }, r.last_run ? `última: ${fmt(r.last_run.at)} — ${r.last_run.result}` : 'nunca rodou'),
        el('button', { class: 'b', onclick: act(() => api(`/api/routines/${r.id}/run`)) }, 'Rodar agora')));
  });
}

function viewUpload() {
  const input = el('input', { type: 'file', accept: 'video/*,audio/*,image/*', multiple: true });
  const status = el('div', { class: 'mute' });
  const send = async () => {
    for (const f of input.files) {
      status.textContent = `Enviando ${f.name}…`;
      const r = await fetch(`/api/uploads?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': f.type }, body: f });
      if (!r.ok) { status.textContent = `Erro: ${(await r.json()).error}`; return; }
    }
    status.textContent = 'Enviado.'; await refresh();
  };
  return [el('div', { class: 'card' }, el('h3', {}, 'Enviar vídeo ou áudio'), el('p', { class: 'mute' }, 'Pelo celular: escolha da galeria ou grave na hora.'),
    input, el('p', {}, el('button', { class: 'b ok', onclick: send }, 'Enviar')), status),
  data.uploads.length ? data.uploads.map((u) => el('div', { class: 'card' }, el('div', { class: 'row between' }, el('b', {}, u.name), el('span', { class: 'mute' }, `${(u.size / 1e6).toFixed(1)} MB · ${fmt(u.at)}`)),
    u.type.startsWith('video') ? el('video', { controls: true, preload: 'none', src: `/files/${u.path.split('/').pop()}` }) : u.type.startsWith('audio') ? el('audio', { controls: true, preload: 'none', src: `/files/${u.path.split('/').pop()}` }) : null)) : null];
}

function viewHistory() {
  if (!data.history.length) return el('div', { class: 'empty' }, 'Nada publicado ainda.');
  return data.history.map((d) => el('div', { class: 'card' }, el('div', { class: 'row' }, el('span', { class: `tag ${d.channel}` }, d.channel), el('span', { class: 'mute' }, fmt(d.published_at))),
    el('h3', {}, d.title), el('div', { class: 'body' }, d.body), d.published_url ? el('a', { href: d.published_url, target: '_blank', rel: 'noopener' }, 'Ver publicação') : null));
}

const VIEWS = { drafts: viewDrafts, needs: viewNeeds, routines: viewRoutines, upload: viewUpload, history: viewHistory };

function render() {
  const counts = { drafts: data.drafts.filter((d) => d.status === 'pending').length, needs: data.needs.length };
  document.getElementById('tabs').replaceChildren(...TABS.map(([id, label]) => el('button', { class: id === tab ? 'on' : '', onclick: () => { tab = id; location.hash = id; render(); } },
    label, counts[id] ? el('span', { class: 'n' }, counts[id]) : null)));
  document.getElementById('view').replaceChildren(...[VIEWS[tab]()].flat(2).filter(Boolean));
}
async function refresh() { data = await (await fetch('/api/overview')).json(); render(); }
await refresh();
setInterval(() => { if (!editing.size && !document.activeElement?.matches('input,textarea')) refresh(); }, 30000);
window.addEventListener('hashchange', () => { tab = location.hash.slice(1) || 'drafts'; if (data) render(); });

import { readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import * as store from './db.mjs';
import { lastDue, parseCron } from './cron.mjs';
import { env } from './env.mjs';
import { makeComposio } from './composio.mjs';
import { exposeFiles } from './publicurl.mjs';
import { resolve } from 'node:path';
import { syncPaperclip, makePaperclip } from './paperclip.mjs';
import { passoAusente } from './ausente.mjs';

export const ROUTINES_DIR = process.env.ASSISTENTE_ROUTINES || new URL('../routines/', import.meta.url).pathname;
const CHANNELS = ['linkedin', 'instagram', 'email', 'tasks'];

export function validateRoutine(r, folder) {
  const bad = (m) => { throw new Error(`rotina "${folder}": ${m}`); };
  if (!r || typeof r !== 'object') bad('export default precisa ser um objeto');
  if (r.id !== folder) bad(`id "${r.id}" deve ser igual ao nome da pasta`);
  if (!r.name) bad('falta name');
  if (!CHANNELS.includes(r.channel)) bad(`channel deve ser um de ${CHANNELS.join(', ')}`);
  if (typeof r.run !== 'function') bad('falta run(ctx)');
  if (r.publish !== undefined && typeof r.publish !== 'function') bad('publish deve ser função');
  if (r.defaultSchedule) parseCron(r.defaultSchedule);
  return r;
}

// Carrega as rotinas de routines/<id>/index.mjs. Pastas que começam com "_" são ignoradas.
export async function loadRoutines(dir = ROUTINES_DIR) {
  const out = new Map(), errors = [];
  if (!existsSync(dir)) return { routines: out, errors };
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (!f.isDirectory() || f.name.startsWith('_') || f.name.startsWith('.')) continue;
    try {
      const mod = await import(pathToFileURL(join(dir, f.name, 'index.mjs')).href);
      out.set(f.name, validateRoutine(mod.default, f.name));
    } catch (e) { errors.push({ id: f.name, error: e.message }); }
  }
  return { routines: out, errors };
}

export const MEDIA_DIR = () => resolve(process.env.ASSISTENTE_MEDIA || new URL('../data/media/', import.meta.url).pathname);
export const MUSIC_DIR = () => resolve(process.env.ASSISTENTE_MUSICA || new URL('../data/musica/', import.meta.url).pathname);

export function makeCtx(db, routine, { dry = false, logs = [], mediaDir = MEDIA_DIR(), exposeFilesFn = exposeFiles } = {}) {
  const drafts = [];
  const composio = makeComposio();
  const st = store.stateStore(db, routine.id);
  return {
    drafts: {
      list: (q = {}) => store.listDrafts(db, { ...q, routine: routine.id }),
      finishProcessing: (id, o) => (dry ? undefined : store.finishProcessing(db, id, o)),
    },
    createDraft: (d) => {
      if (dry) { drafts.push(d); return d; }
      const row = store.createDraft(db, routine.id, routine.channel, d);
      drafts.push(row);
      return row;
    },
    state: dry ? { get: st.get, set: () => {} } : st,
    log: (...a) => logs.push(a.map(String).join(' ')),
    now: new Date(),
    env,
    composio,
    mediaDir, musicDir: MUSIC_DIR(), exposeFiles: exposeFilesFn,
    dry,
    _drafts: drafts,
  };
}

export async function runRoutine(db, routine, { dry = false } = {}) {
  const startedAt = new Date().toISOString(), logs = [];
  const ctx = makeCtx(db, routine, { dry, logs });
  try {
    await routine.run(ctx);
    if (!dry) store.recordRun(db, routine.id, startedAt, { ok: true, drafts: ctx._drafts.length, log: logs.join('\n') });
    return { ok: true, drafts: ctx._drafts, logs };
  } catch (e) {
    if (!dry) store.recordRun(db, routine.id, startedAt, { ok: false, drafts: ctx._drafts.length, log: logs.join('\n'), error: e.message });
    return { ok: false, drafts: ctx._drafts, logs, error: e.message };
  }
}

// Publica rascunhos aprovados (respeitando scheduledFor). Só roda o que o João aprovou no painel.
export async function publishApproved(db, routines, at = new Date(), opts = {}) {
  const results = [];
  for (const d of store.listDrafts(db, { status: 'approved' }).reverse()) {
    if (d.scheduled_for) {
      const when = new Date(d.scheduled_for);
      if (Number.isNaN(when.getTime())) { if (store.claimForPublish(db, d.id)) { store.markFailed(db, d.id, 'scheduledFor inválido'); results.push({ id: d.id, ok: false }); } continue; }
      if (when > at) continue;
    }
    if (!store.claimForPublish(db, d.id)) continue; // outro ciclo/clique já reservou
    const r = routines.get(d.routine);
    if (!r?.publish) { store.markFailed(db, d.id, r ? 'a rotina não implementa publish()' : 'rotina não encontrada'); results.push({ id: d.id, ok: false }); continue; }
    try {
      const ctx = makeCtx(db, r, opts);
      const out = (await r.publish(d, ctx)) ?? {};
      store.markPublished(db, d.id, out);
      results.push({ id: d.id, ok: true, url: out.url });
    } catch (e) {
      store.markFailed(db, d.id, e.message);
      results.push({ id: d.id, ok: false, error: e.message });
    }
  }
  return results;
}

// Edição automática: rascunhos em 'processing' cuja rotina sabe editar (r.process). Um por vez; falha vira erro visível no painel.
const editing = new Set();
export async function processDrafts(db, routines, opts = {}) {
  const results = [];
  for (const d of store.listDrafts(db, { status: 'processing' }).reverse()) {
    const r = routines.get(d.routine);
    if (!r?.process || editing.has(d.id) || (d.meta.edicao?.tentativas ?? 0) >= store.MAX_EDIT_TRIES) continue;
    if (d.needs.some((n) => n.status === 'waiting')) continue;
    editing.add(d.id);
    try {
      const out = await r.process(d, makeCtx(db, r, opts));
      store.finishProcessing(db, d.id, out);
      results.push({ id: d.id, ok: true });
    } catch (e) {
      store.failProcessing(db, d.id, e.message);
      results.push({ id: d.id, ok: false, error: e.message });
    } finally { editing.delete(d.id); }
  }
  return results;
}

// Um ciclo do agendador (chamado pelo systemd timer): sincroniza rotinas, roda as vencidas, publica as aprovadas.
export async function tick(db, { at = new Date(), dir, paperclip = false, pc } = {}) {
  const { routines, errors } = await loadRoutines(dir);
  // O João usa só o Paperclip: primeiro traz de lá aprovações, textos novos e anexos; no fim leva o resultado do ciclo.
  const ponte = [];
  if (paperclip) ponte.push(await syncPaperclip(db, { mediaDir: MEDIA_DIR() }));
  const ran = [];
  for (const r of routines.values()) {
    const row = store.upsertRoutine(db, r.id, { schedule: r.defaultSchedule });
    if (!row.enabled || !row.schedule) continue;
    const since = new Date(row.last_run_at ?? 0);
    const due = lastDue(row.schedule, since, at);
    if (!due) continue;
    // Primeira execução de uma rotina recém-ligada: só dispara se a marca for dos últimos 10 min (evita rajada retroativa).
    if (!row.last_run_at && at - due > 10 * 60e3) continue;
    ran.push({ id: r.id, ...(await runRoutine(db, r)) });
  }
  const processed = await processDrafts(db, routines);
  // Modo ausente: avisa e aprova após 24 h sem veto (só com a ponte ligada; desligado = devolve o que aprovou).
  let ausente = [];
  try { ausente = await passoAusente(db, paperclip ? (pc ?? makePaperclip()) : null, at); } catch (e) { errors.push({ id: 'modo-ausente', error: e.message }); }
  const published = await publishApproved(db, routines, at);
  if (paperclip) ponte.push(await syncPaperclip(db, { mediaDir: MEDIA_DIR(), composio: makeComposio() }));
  return { ran, processed, published, errors, ponte, ausente };
}

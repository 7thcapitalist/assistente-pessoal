import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const STATUS = ['needs_joao', 'processing', 'pending', 'approved', 'publishing', 'rejected', 'published', 'failed'];
export const NEED_TYPES = ['record_video', 'record_audio'];
export const MEDIA_KINDS = ['video_raw', 'audio', 'video_final', 'cover', 'slide'];

export function openDb(path = process.env.ASSISTENTE_DB || new URL('../data/assistente.db', import.meta.url).pathname) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, schedule TEXT,
      last_run_at TEXT, last_status TEXT, last_error TEXT);
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY, routine TEXT NOT NULL, channel TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      media TEXT NOT NULL DEFAULT '[]', meta TEXT NOT NULL DEFAULT '{}', scheduled_for TEXT,
      status TEXT NOT NULL DEFAULT 'pending', error TEXT, url TEXT, external_id TEXT,
      created_at TEXT NOT NULL, decided_at TEXT, published_at TEXT);
    CREATE INDEX IF NOT EXISTS drafts_status ON drafts(status, channel);
    CREATE TABLE IF NOT EXISTS state (routine TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (routine, k));
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, routine TEXT NOT NULL, started_at TEXT NOT NULL,
      ok INTEGER NOT NULL, drafts INTEGER NOT NULL DEFAULT 0, log TEXT, error TEXT);
  `);
  // migração: coluna needs (SOF-593)
  if (!db.prepare('PRAGMA table_info(drafts)').all().some((c) => c.name === 'needs')) db.exec("ALTER TABLE drafts ADD COLUMN needs TEXT NOT NULL DEFAULT '[]'");
  return db;
}

const now = () => new Date().toISOString();
const rowDraft = (r) => r && { ...r, media: JSON.parse(r.media), meta: JSON.parse(r.meta), needs: JSON.parse(r.needs ?? '[]') };

// needs: [{type, script, notes?, durationSec?, status}]; aceita um objeto só. Status nasce 'waiting'.
export function normalizeNeeds(needs) {
  const list = needs == null ? [] : [].concat(needs);
  return list.map((n, i) => {
    if (!n || !NEED_TYPES.includes(n.type)) throw new Error(`needs[${i}].type deve ser ${NEED_TYPES.join(' ou ')}`);
    if (typeof n.script !== 'string' || !n.script.trim()) throw new Error(`needs[${i}] precisa de script`);
    if (n.notes !== undefined && typeof n.notes !== 'string') throw new Error(`needs[${i}].notes deve ser texto`);
    if (n.durationSec !== undefined && !(Number.isFinite(n.durationSec) && n.durationSec > 0)) throw new Error(`needs[${i}].durationSec inválido`);
    const out = { type: n.type, script: n.script, status: n.status === 'received' ? 'received' : 'waiting' };
    if (n.notes) out.notes = n.notes;
    if (n.durationSec) out.durationSec = n.durationSec;
    return out;
  });
}

function checkMedia(media) {
  for (const m of media ?? []) {
    if (!m || typeof m.path !== 'string') throw new Error('media precisa de path');
    if (m.kind !== undefined && !MEDIA_KINDS.includes(m.kind)) throw new Error(`media.kind inválido: ${m.kind}`);
  }
}

function checkScheduledFor(v) {
  if (v && (typeof v !== 'string' || Number.isNaN(Date.parse(v)))) throw new Error('scheduledFor inválido');
}

export function createDraft(db, routine, channel, d) {
  if (!d || typeof d.title !== 'string' || !d.title.trim()) throw new Error('rascunho precisa de title');
  if (typeof d.body !== 'string' || !d.body.trim()) throw new Error('rascunho precisa de body');
  checkScheduledFor(d.scheduledFor);
  checkMedia(d.media);
  const needs = normalizeNeeds(d.needs);
  // Com pedido ao João ainda sem resposta e sem mídia, o rascunho espera por ele antes de ir para a fila de aprovação.
  // d.processing: o rascunho nasce para a rotina editar sozinha (ex.: Reel só de imagens), sem depender do João.
  const status = d.processing ? 'processing' : needs.some((n) => n.status === 'waiting') && !(d.media ?? []).length ? 'needs_joao' : 'pending';
  const id = randomUUID();
  db.prepare(`INSERT INTO drafts (id, routine, channel, title, body, media, meta, needs, scheduled_for, status, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, routine, channel, d.title.trim(), d.body,
    JSON.stringify(d.media ?? []), JSON.stringify(d.meta ?? {}), JSON.stringify(needs), d.scheduledFor ?? null, status, now());
  return getDraft(db, id);
}

export const getDraft = (db, id) => rowDraft(db.prepare('SELECT * FROM drafts WHERE id = ?').get(id));

export function listDrafts(db, { status, channel, routine, limit = 200 } = {}) {
  const w = [], a = [];
  if (status) { const s = [].concat(status); w.push(`status IN (${s.map(() => '?').join(',')})`); a.push(...s); }
  if (channel) { w.push('channel = ?'); a.push(channel); }
  if (routine) { w.push('routine = ?'); a.push(routine); }
  const order = status && [].concat(status).every((s) => s === 'published') ? 'published_at' : 'created_at';
  return db.prepare(`SELECT * FROM drafts ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${order} DESC LIMIT ?`)
    .all(...a, limit).map(rowDraft);
}

export function editDraft(db, id, { title, body, meta, scheduledFor }) {
  const d = getDraft(db, id);
  if (!d) throw new Error('rascunho não existe');
  if (!['pending', 'failed', 'needs_joao'].includes(d.status)) throw new Error(`não dá pra editar rascunho ${d.status}`);
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) throw new Error('rascunho precisa de title');
  if (body !== undefined && (typeof body !== 'string' || !body.trim())) throw new Error('rascunho precisa de body');
  checkScheduledFor(scheduledFor);
  db.prepare('UPDATE drafts SET title=?, body=?, meta=?, scheduled_for=? WHERE id=?').run(
    title === undefined ? d.title : title.trim(), body ?? d.body, JSON.stringify(meta ?? d.meta), scheduledFor === undefined ? d.scheduled_for : scheduledFor || null, id);
  return getDraft(db, id);
}

const TRANSITIONS = { approve: ['pending', 'failed', 'approved'], reject: ['needs_joao', 'processing', 'pending', 'failed', 'approved'] };
export function decide(db, id, action) {
  const d = getDraft(db, id);
  if (!d) throw new Error('rascunho não existe');
  if (!TRANSITIONS[action]?.includes(d.status)) throw new Error(`não dá pra ${action} rascunho ${d.status}`);
  db.prepare('UPDATE drafts SET status=?, error=NULL, decided_at=? WHERE id=?').run(action === 'approve' ? 'approved' : 'rejected', now(), id);
  return getDraft(db, id);
}

// Reserva o rascunho para publicar: só uma chamada (timer, clique ou outro processo) ganha a transição approved → publishing.
export function claimForPublish(db, id) {
  return db.prepare("UPDATE drafts SET status='publishing', error=NULL WHERE id=? AND status='approved'").run(id).changes === 1;
}

export function markPublished(db, id, { url, externalId }) {
  db.prepare("UPDATE drafts SET status='published', url=?, external_id=?, error=NULL, published_at=? WHERE id=?").run(url ?? null, externalId ?? null, now(), id);
}
export function markFailed(db, id, error) {
  db.prepare("UPDATE drafts SET status='failed', error=? WHERE id=?").run(String(error).slice(0, 2000), id);
}

export function getRoutineRow(db, id) { return db.prepare('SELECT * FROM routines WHERE id = ?').get(id); }
export function upsertRoutine(db, id, defaults) {
  db.prepare('INSERT OR IGNORE INTO routines (id, enabled, schedule) VALUES (?, 0, ?)').run(id, defaults.schedule ?? null);
  return getRoutineRow(db, id);
}
export function updateRoutine(db, id, { enabled, schedule }) {
  const r = getRoutineRow(db, id);
  if (!r) throw new Error('rotina não existe');
  db.prepare('UPDATE routines SET enabled=?, schedule=? WHERE id=?').run(enabled === undefined ? r.enabled : enabled ? 1 : 0, schedule ?? r.schedule, id);
  return getRoutineRow(db, id);
}
export function recordRun(db, routine, startedAt, { ok, drafts = 0, log = '', error = null }) {
  db.prepare('INSERT INTO runs (routine, started_at, ok, drafts, log, error) VALUES (?,?,?,?,?,?)').run(routine, startedAt, ok ? 1 : 0, drafts, log.slice(0, 8000), error && String(error).slice(0, 2000));
  db.prepare('UPDATE routines SET last_run_at=?, last_status=?, last_error=? WHERE id=?').run(startedAt, ok ? 'ok' : 'erro', error && String(error).slice(0, 500), routine);
}
export const listRuns = (db, limit = 30) => db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').all(limit);

export function stateStore(db, routine) {
  return {
    get: (k) => { const r = db.prepare('SELECT v FROM state WHERE routine=? AND k=?').get(routine, k); return r ? JSON.parse(r.v) : undefined; },
    set: (k, v) => { db.prepare('INSERT INTO state (routine,k,v) VALUES (?,?,?) ON CONFLICT(routine,k) DO UPDATE SET v=excluded.v').run(routine, k, JSON.stringify(v)); },
  };
}

// Upload recebido: registra a mídia, marca o pedido como recebido e devolve o rascunho para a rotina editar (processing).
export function attachUpload(db, id, { needIndex, media }) {
  const d = getDraft(db, id);
  if (!d) throw new Error('rascunho não existe');
  if (!['needs_joao', 'processing'].includes(d.status)) throw new Error(`rascunho ${d.status} não recebe arquivo`);
  checkMedia([media]);
  const needs = d.needs;
  if (needIndex !== undefined) {
    if (!Number.isInteger(needIndex) || !needs[needIndex]) throw new Error('pedido não existe');
    needs[needIndex].status = 'received';
  }
  const r = db.prepare("UPDATE drafts SET media=?, needs=?, status='processing', error=NULL WHERE id=? AND status IN ('needs_joao','processing')")
    .run(JSON.stringify([...d.media, media]), JSON.stringify(needs), id);
  if (r.changes !== 1) throw new Error('rascunho mudou de estado; tente de novo');
  return getDraft(db, id);
}

// A rotina terminou de editar: troca/acrescenta mídia (ex.: video_final) e manda para a fila de aprovação.
export function finishProcessing(db, id, { media = [], body } = {}) {
  const d = getDraft(db, id);
  if (!d) throw new Error('rascunho não existe');
  if (d.status !== 'processing') throw new Error(`rascunho ${d.status} não está em edição`);
  checkMedia(media);
  db.prepare("UPDATE drafts SET media=?, body=?, status='pending' WHERE id=? AND status='processing'")
    .run(JSON.stringify([...d.media, ...media]), body ?? d.body, id);
  return getDraft(db, id);
}

// Edição falhou: continua em 'processing' com o erro e a contagem de tentativas (o agendador tenta de novo até o limite).
export const MAX_EDIT_TRIES = 3;
export function failProcessing(db, id, error) {
  const d = getDraft(db, id);
  if (!d || d.status !== 'processing') return;
  const meta = { ...d.meta, edicao: { tentativas: (d.meta.edicao?.tentativas ?? 0) + 1 } };
  db.prepare("UPDATE drafts SET meta=?, error=? WHERE id=? AND status='processing'").run(JSON.stringify(meta), String(error).slice(0, 2000), id);
}
// Refaz a edição do zero (botão "Tentar de novo" ou novo upload).
export function retryProcessing(db, id) {
  const d = getDraft(db, id);
  if (!d || d.status !== 'processing') throw new Error('rascunho não está em edição');
  db.prepare("UPDATE drafts SET meta=?, error=NULL WHERE id=?").run(JSON.stringify({ ...d.meta, edicao: { tentativas: 0 } }), id);
  return getDraft(db, id);
}

// Troca só o meta (uso interno: marcas do Modo ausente), em qualquer estado.
export function setMeta(db, id, meta) {
  db.prepare('UPDATE drafts SET meta=? WHERE id=?').run(JSON.stringify(meta), id);
  return getDraft(db, id);
}
// Devolve para a fila de aprovação um rascunho aprovado e ainda não publicado.
export function unapprove(db, id) {
  const d = getDraft(db, id);
  db.prepare("UPDATE drafts SET status='pending', decided_at=NULL, meta=? WHERE id=? AND status='approved'").run(JSON.stringify({ ...d.meta, auto: undefined }), id);
  return getDraft(db, id);
}

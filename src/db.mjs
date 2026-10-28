import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const STATUS = ['pending', 'approved', 'rejected', 'published', 'failed'];

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
  return db;
}

const now = () => new Date().toISOString();
const rowDraft = (r) => r && { ...r, media: JSON.parse(r.media), meta: JSON.parse(r.meta) };

export function createDraft(db, routine, channel, d) {
  if (!d || typeof d.title !== 'string' || !d.title.trim()) throw new Error('rascunho precisa de title');
  if (typeof d.body !== 'string' || !d.body.trim()) throw new Error('rascunho precisa de body');
  if (d.scheduledFor && Number.isNaN(Date.parse(d.scheduledFor))) throw new Error('scheduledFor inválido');
  const id = randomUUID();
  db.prepare(`INSERT INTO drafts (id, routine, channel, title, body, media, meta, scheduled_for, created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(id, routine, channel, d.title.trim(), d.body,
    JSON.stringify(d.media ?? []), JSON.stringify(d.meta ?? {}), d.scheduledFor ?? null, now());
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
  if (!['pending', 'failed'].includes(d.status)) throw new Error(`não dá pra editar rascunho ${d.status}`);
  db.prepare('UPDATE drafts SET title=?, body=?, meta=?, scheduled_for=? WHERE id=?').run(
    title ?? d.title, body ?? d.body, JSON.stringify(meta ?? d.meta), scheduledFor === undefined ? d.scheduled_for : scheduledFor || null, id);
  return getDraft(db, id);
}

const TRANSITIONS = { approve: ['pending', 'failed', 'approved'], reject: ['pending', 'failed', 'approved'] };
export function decide(db, id, action) {
  const d = getDraft(db, id);
  if (!d) throw new Error('rascunho não existe');
  if (!TRANSITIONS[action]?.includes(d.status)) throw new Error(`não dá pra ${action} rascunho ${d.status}`);
  db.prepare('UPDATE drafts SET status=?, error=NULL, decided_at=? WHERE id=?').run(action === 'approve' ? 'approved' : 'rejected', now(), id);
  return getDraft(db, id);
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

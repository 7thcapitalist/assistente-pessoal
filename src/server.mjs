import { createServer } from 'node:http';
import { readFileSync, createReadStream, existsSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import * as store from './db.mjs';
import { loadRoutines, runRoutine, publishApproved } from './runner.mjs';
import { nextRun, parseCron } from './cron.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const MEDIA = resolve(process.env.ASSISTENTE_MEDIA || new URL('../data/media/', import.meta.url).pathname);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4' };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function createApp(db, { routinesDir } = {}) {
  async function snapshot() {
    const { routines, errors } = await loadRoutines(routinesDir);
    const list = [...routines.values()].map((r) => {
      const row = store.upsertRoutine(db, r.id, { schedule: r.defaultSchedule });
      return {
        id: r.id, name: r.name, channel: r.channel, description: r.description ?? '', enabled: !!row.enabled,
        schedule: row.schedule, defaultSchedule: r.defaultSchedule ?? null, canPublish: !!r.publish,
        lastRunAt: row.last_run_at, lastStatus: row.last_status, lastError: row.last_error,
        nextRun: row.enabled && row.schedule ? nextRun(row.schedule)?.toISOString() ?? null : null,
      };
    });
    return {
      routines: list, loadErrors: errors,
      pending: store.listDrafts(db, { status: ['pending', 'approved', 'failed'] }),
      history: store.listDrafts(db, { status: ['published', 'rejected'], limit: 100 }),
      runs: store.listRuns(db, 15),
    };
  }

  async function api(req, url, body) {
    const m = (re) => url.pathname.match(re);
    if (req.method === 'GET' && url.pathname === '/api/state') return snapshot();
    let x;
    if ((x = m(/^\/api\/routines\/([\w-]+)$/)) && req.method === 'POST') {
      if (body.schedule !== undefined) { try { parseCron(body.schedule); } catch (e) { throw new HttpError(400, e.message); } }
      try { return store.updateRoutine(db, x[1], { enabled: body.enabled, schedule: body.schedule }); }
      catch (e) { throw new HttpError(404, e.message); }
    }
    if ((x = m(/^\/api\/routines\/([\w-]+)\/run$/)) && req.method === 'POST') {
      const { routines } = await loadRoutines(routinesDir);
      const r = routines.get(x[1]);
      if (!r) throw new HttpError(404, 'rotina não existe');
      return runRoutine(db, r);
    }
    if ((x = m(/^\/api\/drafts\/([\w-]+)\/(approve|reject)$/)) && req.method === 'POST') {
      try { store.decide(db, x[1], x[2]); } catch (e) { throw new HttpError(409, e.message); }
      if (x[2] === 'approve') { const { routines } = await loadRoutines(routinesDir); await publishApproved(db, routines); }
      return store.getDraft(db, x[1]);
    }
    if ((x = m(/^\/api\/drafts\/([\w-]+)$/)) && req.method === 'PUT') {
      try { return store.editDraft(db, x[1], body); } catch (e) { throw new HttpError(409, e.message); }
    }
    throw new HttpError(404, 'não encontrado');
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const send = (code, data, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
    };
    try {
      if (url.pathname.startsWith('/api/')) {
        let body = {};
        if (req.method !== 'GET') {
          if (req.headers['x-assistente'] !== '1') throw new HttpError(403, 'cabeçalho x-assistente ausente'); // trava CSRF
          const chunks = []; let n = 0;
          for await (const c of req) { n += c.length; if (n > 1e6) throw new HttpError(413, 'corpo grande demais'); chunks.push(c); }
          try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { throw new HttpError(400, 'JSON inválido'); }
        }
        return send(200, await api(req, url, body));
      }
      if (url.pathname === '/media') {
        const p = resolve(url.searchParams.get('p') || '');
        if (!p.startsWith(MEDIA + sep) || !existsSync(p)) throw new HttpError(404, 'não encontrado');
        res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
        return createReadStream(p).pipe(res);
      }
      if (url.pathname === '/' || url.pathname === '/index.html') return send(200, readFileSync(PUBLIC + 'index.html'), MIME['.html']);
      throw new HttpError(404, 'não encontrado');
    } catch (e) {
      send(e.code || 500, { error: e.message });
    }
  };
}

export function startServer(db, { port = 4180, host = '127.0.0.1', routinesDir } = {}) {
  const server = createServer(createApp(db, { routinesDir }));
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

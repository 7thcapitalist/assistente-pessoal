import { createServer } from 'node:http';
import { readFileSync, createReadStream, statSync, rmSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import * as store from './db.mjs';
import { loadRoutines, runRoutine, publishApproved } from './runner.mjs';
import { nextRun, parseCron } from './cron.mjs';
import { receiveFile, MAX_UPLOAD, UploadError } from './upload.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const MEDIA = resolve(process.env.ASSISTENTE_MEDIA || new URL('../data/media/', import.meta.url).pathname);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/opus' };

// Mídia e upload só para loopback (o painel escuta na tailnet; tailscale serve chega como loopback) ou IP da tailnet (100.64.0.0/10, fd7a:115c:a1e0::/48).
export function fromTailnet(addr = '') {
  const a = addr.replace(/^::ffff:/, '');
  if (a === '127.0.0.1' || a === '::1') return true;
  const m = a.match(/^100\.(\d+)\./);
  if (m) return Number(m[1]) >= 64 && Number(m[1]) <= 127;
  return a.toLowerCase().startsWith('fd7a:115c:a1e0:');
}

// Range de bytes (iOS exige 206). Devolve {start,end} ou null (sem Range); lança 416 se inválido.
export function parseRange(h, size) {
  if (!h) return null;
  const m = h.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) throw new HttpError(416, 'range inválido');
  let start, end;
  if (m[1] === '') { const n = Number(m[2]); if (!n) throw new HttpError(416, 'range inválido'); start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) throw new HttpError(416, 'range fora do arquivo');
  return { start, end };
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function createApp(db, { routinesDir, mediaDir = MEDIA, maxUpload = MAX_UPLOAD, anyNetwork = process.env.ASSISTENTE_ANY_NETWORK === '1' } = {}) {
  mediaDir = resolve(mediaDir);
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
      needsJoao: store.listDrafts(db, { status: 'needs_joao' }).reverse(),
      processing: store.listDrafts(db, { status: 'processing' }),
      pending: store.listDrafts(db, { status: ['pending', 'approved', 'failed'] }),
      history: store.listDrafts(db, { status: ['published', 'rejected'], limit: 100 }),
      runs: store.listRuns(db, 15),
    };
  }

  async function upload(req, url, id) {
    const d = store.getDraft(db, id);
    if (!d) { req.resume(); throw new HttpError(404, 'rascunho não existe'); }
    if (!['needs_joao', 'processing'].includes(d.status)) { req.resume(); throw new HttpError(409, `rascunho ${d.status} não recebe arquivo`); }
    let needIndex;
    if (url.searchParams.has('need')) {
      needIndex = Number(url.searchParams.get('need'));
      if (!Number.isInteger(needIndex) || !d.needs[needIndex]) { req.resume(); throw new HttpError(400, 'pedido não existe'); }
    }
    let f;
    try { f = await receiveFile(req, resolve(mediaDir, d.id), { maxBytes: maxUpload }); }
    catch (e) { req.resume(); throw e instanceof UploadError ? new HttpError(e.code, e.message) : e; }
    const need = d.needs[needIndex];
    const kind = f.mime.startsWith('image/') ? 'cover' : f.mime.startsWith('audio/') ? 'audio' : need?.type === 'record_audio' ? 'audio' : 'video_raw';
    try { return store.attachUpload(db, id, { needIndex, media: { kind, path: f.path, mime: f.mime, bytes: f.bytes } }); }
    catch (e) { rmSync(f.path, { force: true }); throw new HttpError(409, e.message); }
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
        let up;
        if (req.method === 'POST' && (up = url.pathname.match(/^\/api\/drafts\/([\w-]+)\/upload$/))) {
          if (req.headers['x-assistente'] !== '1') throw new HttpError(403, 'cabeçalho x-assistente ausente'); // trava CSRF
          if (!anyNetwork && !fromTailnet(req.socket.remoteAddress)) throw new HttpError(403, 'fora da tailnet');
          return send(200, await upload(req, url, up[1]));
        }
        if (req.method !== 'GET') {
          if (req.headers['x-assistente'] !== '1') throw new HttpError(403, 'cabeçalho x-assistente ausente'); // trava CSRF
          const chunks = []; let n = 0;
          for await (const c of req) { n += c.length; if (n > 1e6) throw new HttpError(413, 'corpo grande demais'); chunks.push(c); }
          try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { throw new HttpError(400, 'JSON inválido'); }
        }
        return send(200, await api(req, url, body));
      }
      if (url.pathname === '/media' && (req.method === 'GET' || req.method === 'HEAD')) {
        if (!anyNetwork && !fromTailnet(req.socket.remoteAddress)) throw new HttpError(403, 'fora da tailnet');
        const p = resolve(url.searchParams.get('p') || '');
        let st;
        try { st = p.startsWith(mediaDir + sep) ? statSync(p) : null; } catch { st = null; }
        if (!st?.isFile()) throw new HttpError(404, 'não encontrado');
        const type = MIME[extname(p).toLowerCase()] || 'application/octet-stream';
        const r = parseRange(req.headers.range, st.size);
        const head = { 'content-type': type, 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff', 'content-length': r ? r.end - r.start + 1 : st.size };
        if (r) head['content-range'] = `bytes ${r.start}-${r.end}/${st.size}`;
        res.writeHead(r ? 206 : 200, head);
        if (req.method === 'HEAD') return res.end();
        const rs = createReadStream(p, r ? { start: r.start, end: r.end } : {});
        rs.on('error', () => res.destroy());
        return rs.pipe(res);
      }
      if (url.pathname === '/' || url.pathname === '/index.html') return send(200, readFileSync(PUBLIC + 'index.html'), MIME['.html']);
      throw new HttpError(404, 'não encontrado');
    } catch (e) {
      if (e.code === 416 && url.pathname === '/media') { res.writeHead(416, { 'content-range': 'bytes */*' }); return res.end(); }
      send(Number.isInteger(e.code) ? e.code : 500, { error: e.message });
    }
  };
}

export function startServer(db, { port = 4180, host = '127.0.0.1', routinesDir, ...opts } = {}) {
  const server = createServer(createApp(db, { routinesDir, ...opts }));
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

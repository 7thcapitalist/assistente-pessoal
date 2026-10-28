// Servidor HTTP sem dependências. API JSON em /api, estáticos em public/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, mutate, dataDir, newId, now, addLog } from './store.js';
import { createDraft, updateDraft, createNeed, resolveNeed, history, HttpError } from './drafts.js';
import { routines } from './routines/index.js';
import { routineConfig, setRoutineConfig, tick } from './scheduler.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_UPLOAD = 2 * 1024 ** 3;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const UPLOAD_OK = /^(video|audio|image)\//;

const readJson = (req) => new Promise((resolve, reject) => {
  let n = 0; const chunks = [];
  req.on('data', (c) => { n += c.length; if (n > 1e6) { reject(new HttpError(413, 'corpo grande demais')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new HttpError(400, 'JSON inválido')); }
  });
});

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

function overview() {
  const s = load();
  return {
    routines: routines.map((r) => ({
      id: r.id, name: r.name, description: r.description,
      config: routineConfig(s, r), last_run: s.routines[r.id]?.last_run || null,
    })),
    drafts: s.drafts.filter((d) => d.status !== 'published'),
    needs: s.needs.filter((n) => n.status === 'open'),
    history: history(),
    uploads: s.uploads,
    log: s.log.slice(0, 30),
  };
}

function handleUpload(req, res, url) {
  const type = (req.headers['content-type'] || '').split(';')[0];
  if (!UPLOAD_OK.test(type)) throw new HttpError(415, 'só vídeo, áudio ou imagem');
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD) throw new HttpError(413, 'arquivo grande demais');
  const original = path.basename(url.searchParams.get('name') || 'arquivo').replace(/[^\w.\- ]/g, '_').slice(0, 100);
  const id = newId('u');
  const rel = path.join('uploads', `${id}-${original}`);
  const abs = path.join(dataDir(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const out = fs.createWriteStream(abs);
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); } });
  req.pipe(out);
  out.on('finish', () => {
    const item = { id, name: original, type, size, path: rel, need: url.searchParams.get('need') || undefined, at: now() };
    mutate((s) => { s.uploads.unshift(item); addLog(s, `upload: ${original}`, { upload: id }); });
    send(res, 201, item);
  });
  out.on('error', () => send(res, 500, { error: 'falha ao gravar' }));
}

async function api(req, res, url) {
  const p = url.pathname; const m = req.method;
  let g;
  if (m === 'GET' && p === '/api/overview') return send(res, 200, overview());
  if (m === 'POST' && p === '/api/drafts') return send(res, 201, createDraft(await readJson(req)));
  if ((g = p.match(/^\/api\/drafts\/([\w]+)\/(approve|reject|reopen|edit)$/)) && m === 'POST') return send(res, 200, updateDraft(g[1], g[2], await readJson(req)));
  if (m === 'POST' && p === '/api/needs') return send(res, 201, createNeed(await readJson(req)));
  if ((g = p.match(/^\/api\/needs\/(\w+)\/done$/)) && m === 'POST') return send(res, 200, resolveNeed(g[1], await readJson(req)));
  if ((g = p.match(/^\/api\/routines\/([\w-]+)$/)) && m === 'POST') return send(res, 200, setRoutineConfig(g[1], await readJson(req)));
  if ((g = p.match(/^\/api\/routines\/([\w-]+)\/run$/)) && m === 'POST') return send(res, 200, await tick({ only: g[1], force: true }));
  if (m === 'POST' && p === '/api/uploads') return handleUpload(req, res, url);
  if ((g = p.match(/^\/files\/(u_\w+-[^/]+)$/)) && m === 'GET') {
    const f = path.join(dataDir(), 'uploads', path.basename(g[1]));
    if (!fs.existsSync(f)) throw new HttpError(404, 'arquivo não encontrado');
    res.writeHead(200, { 'content-type': load().uploads.find((u) => path.basename(u.path) === g[1])?.type || 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  throw new HttpError(404, 'rota não encontrada');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method !== 'GET') {
        // defesa contra CSRF: se o navegador mandou Origin, tem que ser o próprio painel
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'origem não permitida');
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return await api(req, res, url);
      const file = url.pathname === '/' ? 'index.html' : path.basename(url.pathname);
      const abs = path.join(PUBLIC, file);
      if (!fs.existsSync(abs)) throw new HttpError(404, 'não encontrado');
      return send(res, 200, fs.readFileSync(abs), MIME[path.extname(abs)] || 'application/octet-stream');
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'erro interno' : e.message });
    }
  });
}

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

async function waitReachable(url, timeoutMs) {
  const limit = Date.now() + timeoutMs;
  for (;;) {
    try { if ((await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })).ok) return; } catch { /* ainda não propagou */ }
    if (Date.now() > limit) throw new Error('link público não respondeu a tempo');
    await new Promise((ok) => setTimeout(ok, 1500));
  }
}

/**
 * URL https pública e temporária para arquivos que a Meta precisa baixar (Reel .mp4 e capa .jpg).
 * Sobe um servidor local que só serve os arquivos dados, em /<token aleatório>/<nome>, e abre um túnel
 * grátis do cloudflared (trycloudflare, sem conta). close() derruba tudo. Nada fica exposto fora da publicação.
 * Em teste, passe { tunnel: false } para receber a URL http local.
 */
export async function exposeFiles(files, { tunnel = true, cloudflared = process.env.CLOUDFLARED || [join(homedir(), '.local', 'bin', 'cloudflared')].find(existsSync) || 'cloudflared', timeoutMs = 60_000 } = {}) {
  const token = randomBytes(16).toString('hex'), map = new Map();
  for (const f of files) {
    if (!TYPES[extname(f).toLowerCase()]) throw new Error(`tipo não permitido para URL pública: ${basename(f)}`);
    map.set(`/${token}/${basename(f)}`, f);
  }
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent((req.url || '').split('?')[0]); }
    catch { res.writeHead(404); return res.end(); }
    const f = map.get(path);
    if (!f || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end(); }
    const size = statSync(f).size, m = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
    let start = 0, end = size - 1, code = 200;
    if (m && (m[1] || m[2])) {
      if (m[1] === '') { start = Math.max(0, size - Number(m[2])); } else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
      if (start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      code = 206;
    }
    const h = { 'content-type': TYPES[extname(f).toLowerCase()], 'content-length': end - start + 1, 'accept-ranges': 'bytes' };
    if (code === 206) h['content-range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(code, h);
    if (req.method === 'HEAD') return res.end();
    createReadStream(f, { start, end }).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  let child = null;
  const close = () => { child?.kill('SIGTERM'); server.close(); server.closeAllConnections?.(); };
  try {
    let base = `http://127.0.0.1:${port}`;
    if (tunnel) {
      child = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', base], { stdio: ['ignore', 'ignore', 'pipe'] });
      base = await new Promise((ok, fail) => {
        const t = setTimeout(() => fail(new Error('túnel público não subiu a tempo')), timeoutMs);
        let buf = '';
        child.stderr.on('data', (d) => { buf += d; const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) { clearTimeout(t); ok(m[0]); } });
        child.on('error', (e) => { clearTimeout(t); fail(new Error(`cloudflared: ${e.message}`)); });
        child.on('exit', (c) => { clearTimeout(t); fail(new Error(`cloudflared saiu (${c})`)); });
      });
    }
    const urls = files.map((f) => base + `/${token}/${basename(f)}`);
    if (tunnel) await waitReachable(urls[0], timeoutMs); // o DNS do túnel leva alguns segundos para propagar
    return { urls, close };
  } catch (e) { close(); throw e; }
}

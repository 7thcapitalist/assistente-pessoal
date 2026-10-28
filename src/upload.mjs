import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join, extname, basename } from 'node:path';
import { randomBytes } from 'node:crypto';

export const MAX_UPLOAD = 500 * 1024 * 1024;
const EXT = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-matroska': '.mkv', 'video/3gpp': '.3gp',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };

export class UploadError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// image/svg+xml fica de fora: SVG executa script quando aberto direto no navegador.
export function mimeOk(m) { return /^(video|audio|image)\/[\w.+-]+$/.test(m) && m !== 'image/svg+xml'; }
export const extFor = (mime) => EXT[mime] || '.bin';

export function sanitizeName(raw) {
  const base = basename(String(raw || '').replace(/\\/g, '/')).normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '').slice(0, 60);
  return base || 'arquivo';
}

// Dono do arquivo é o servidor: nome final = <aleatório>-<nome sanitizado><extensão pelo mime>. O nome do cliente nunca vira caminho.
export function storedName(clientName, mime) {
  const stem = sanitizeName(clientName).replace(/\.[\w]*$/, '') || 'arquivo';
  return `${randomBytes(4).toString('hex')}-${stem}${extFor(mime)}`;
}

function parseHeaders(raw) {
  const h = {};
  for (const line of raw.split('\r\n')) { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  return h;
}

/**
 * Recebe um multipart/form-data com UM arquivo (campo "file") e grava em streaming em dir/<nome>.
 * Memória constante: só retém a cauda do tamanho do delimitador. Devolve { path, mime, bytes, name }.
 */
export async function receiveFile(req, dir, { maxBytes = MAX_UPLOAD } = {}) {
  const ct = req.headers['content-type'] || '';
  const bm = ct.match(/^multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!bm) throw new UploadError(415, 'esperado multipart/form-data');
  const cl = Number(req.headers['content-length']);
  if (cl > maxBytes + 64 * 1024) throw new UploadError(413, `arquivo maior que ${Math.round(maxBytes / 1048576)} MB`);
  const delim = Buffer.from('\r\n--' + (bm[1] || bm[2]));

  let buf = Buffer.alloc(0), stage = 'head', out = null, outPath = null, bytes = 0, info = null, done = false;
  const fail = (e) => { out?.destroy(); if (outPath) rmSync(outPath, { force: true }); return e; };

  try {
    for await (const chunk of req) {
      if (done) continue; // descarta o epílogo
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      if (stage === 'head') {
        // o primeiro delimitador não tem \r\n antes
        const first = Buffer.concat([Buffer.from('\r\n'), buf]);
        const end = first.indexOf('\r\n\r\n');
        if (end < 0) { if (buf.length > 16384) throw new UploadError(400, 'cabeçalho do multipart grande demais'); continue; }
        const lines = first.subarray(0, end).toString('utf8');
        if (!lines.startsWith('\r\n--' + (bm[1] || bm[2]))) throw new UploadError(400, 'multipart inválido');
        const h = parseHeaders(lines.slice(lines.indexOf('\r\n', 2) + 2));
        const cd = h['content-disposition'] || '';
        const fn = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
        if (!/name="file"/.test(cd) || !fn) throw new UploadError(400, 'campo "file" ausente');
        const mime = (h['content-type'] || '').toLowerCase().split(';')[0].trim();
        if (!mimeOk(mime)) throw new UploadError(415, `tipo não aceito: ${mime || 'sem content-type'}`);
        let raw = fn[1];
        if (/filename\*=/i.test(cd)) { try { raw = decodeURIComponent(raw); } catch { /* mantém o valor cru */ } }
        const name = storedName(raw, mime);
        mkdirSync(dir, { recursive: true });
        outPath = join(dir, name);
        out = createWriteStream(outPath, { flags: 'wx' });
        info = { path: outPath, mime, name };
        buf = first.subarray(end + 4); stage = 'body';
        // reinsere o "\r\n" falso para a busca do delimitador final não depender dele
        buf = Buffer.from(buf);
      }
      if (stage === 'body') {
        const at = buf.indexOf(delim);
        let upto;
        if (at >= 0) { upto = at; done = true; } else upto = Math.max(0, buf.length - delim.length + 1);
        if (upto > 0) {
          bytes += upto;
          if (bytes > maxBytes) throw new UploadError(413, `arquivo maior que ${Math.round(maxBytes / 1048576)} MB`);
          if (!out.write(buf.subarray(0, upto))) await once(out, 'drain');
        }
        buf = done ? Buffer.alloc(0) : buf.subarray(upto);
      }
    }
    if (!done) throw new UploadError(400, 'envio incompleto');
    out.end(); await once(out, 'close');
    if (!bytes) { rmSync(outPath, { force: true }); throw new UploadError(400, 'arquivo vazio'); }
    return { ...info, bytes };
  } catch (e) {
    throw fail(e);
  }
}

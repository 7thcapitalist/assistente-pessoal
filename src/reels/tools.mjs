import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Ferramentas locais, todas gratuitas: ffmpeg (estático em ~/.local/opt/ffmpeg) e faster-whisper (venv em ~/.local/opt/whisper-venv).
const OPT = join(homedir(), '.local', 'opt');
const pick = (...c) => c.find((p) => p && existsSync(p));
export const FFMPEG = () => process.env.FFMPEG || pick(join(OPT, 'ffmpeg', 'ffmpeg'), join(homedir(), '.local', 'bin', 'ffmpeg'), '/usr/bin/ffmpeg') || 'ffmpeg';
export const FFPROBE = () => process.env.FFPROBE || pick(join(OPT, 'ffmpeg', 'ffprobe'), join(homedir(), '.local', 'bin', 'ffprobe'), '/usr/bin/ffprobe') || 'ffprobe';
export const PYTHON = () => process.env.WHISPER_PYTHON || pick(join(OPT, 'whisper-venv', 'bin', 'python')) || 'python3';
export const TRANSCRIBE = new URL('../../scripts/transcribe.py', import.meta.url).pathname;

export function run(cmd, args, { cwd, timeoutMs = 20 * 60e3 } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    p.on('error', (e) => { clearTimeout(t); fail(new Error(`${cmd}: ${e.message}`)); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? ok(out) : fail(new Error(`${cmd} saiu com ${code}: ${err.slice(-800)}`)); });
  });
}

export const ffmpeg = (args, o) => { if (process.env.DEBUG_FF) console.error(args.join(" ")); return run(FFMPEG(), ["-hide_banner", "-loglevel", "error", "-y", ...args], o); };

export async function probe(file) {
  const j = JSON.parse(await run(FFPROBE(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio');
  return { duration: Number(j.format.duration), hasVideo: !!v, hasAudio: !!a, width: v?.width, height: v?.height };
}

export async function transcribe(file, prompt = '') {
  const out = await run(PYTHON(), [TRANSCRIBE, file, prompt], { timeoutMs: 30 * 60e3 });
  return JSON.parse(out);
}

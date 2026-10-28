import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Segredos: process.env, depois ~/.config/assistente/env, depois ~/.config/holding-hq/env (só leitura). Nunca logar valores.
const FILES = [join(homedir(), '.config', 'assistente', 'env'), join(homedir(), '.config', 'holding-hq', 'env')];

export function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of FILES) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    // formato antigo: chave colada sozinha numa linha
    if (name === 'COMPOSIO_API_KEY') { const k = text.match(/^(ck_[A-Za-z0-9_-]+)\s*$/m); if (k) return k[1]; }
  }
  return undefined;
}

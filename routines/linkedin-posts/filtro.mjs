// Filtro de conteúdo (regra do João): nada que revele produto, empresa, cliente, preço, nicho,
// ferramenta do processo ou número que permita copiar o negócio. Barra o rascunho antes da fila
// e de novo no publish() (cobre edição no painel).
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const TERMOS_PROIBIDOS = [
  'frontstep', 'studiofrontstep', 'egg champions', 'roblox', 'luau', 'mei', 'cnpj',
  'whatsapp', 'wpp', 'paperclip', 'holding-hq', 'composio', 'n8n', 'claude', 'codex', 'openai',
  'gpt', 'systemd', 'vigia', 'wakeup', 'mini pc', 'tailscale', 'tailnet',
  'cliente', 'clientes', 'lead', 'leads', 'preco', 'precos', 'nicho', 'nichos', 'r$', 'reais',
  'fabrica de sites', 'fabrica de jogos', 'template', 'templates',
];

// Número colado a uma contagem do negócio (ex.: "7 agentes", "882 testes") ou valor em dinheiro.
const NUMERO_COPIAVEL = /\b\d[\d.,]*\s*(?:%|agentes?|testes?|scripts?|nucleos?|leads?|clientes?|sites?|jogos?|mensagens?|reais|usd|dolares?|mil|k)\b|r\$\s*\d|\$\s*\d/;

export function checarConteudo(texto) {
  const t = norm(texto);
  const achados = TERMOS_PROIBIDOS.filter((termo) => new RegExp(`(?<![a-z0-9])${termo.replace(/[$.*+?^()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(t));
  const num = t.match(NUMERO_COPIAVEL);
  if (num) achados.push(`número: "${num[0]}"`);
  return { ok: achados.length === 0, achados };
}

export function exigirLimpo(texto, onde) {
  const r = checarConteudo(texto);
  if (!r.ok) throw new Error(`BLOQUEADO pelo filtro de conteúdo (${onde}): ${r.achados.join(', ')}`);
}

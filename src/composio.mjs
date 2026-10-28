import { env } from './env.mjs';

// Cliente MCP mínimo do Composio (HTTP streamable), igual ao holding-hq/scripts/instagram.mjs.
// call(nomeDaFerramentaMCP, args) → JSON da resposta. Conecta só na primeira chamada.
export function makeComposio({ url = process.env.COMPOSIO_MCP_URL || 'https://connect.composio.dev/mcp' } = {}) {
  let sid = null, seq = 0, ready = null;
  async function rpc(method, params, notify = false) {
    const key = env('COMPOSIO_API_KEY');
    if (!key) throw new Error('NEEDS_CONNECT: falta COMPOSIO_API_KEY em ~/.config/assistente/env (o João coloca)');
    const headers = { 'x-consumer-api-key': key, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (sid) headers['mcp-session-id'] = sid;
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++seq, method, params };
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    sid = r.headers.get('mcp-session-id') || sid;
    const text = await r.text();
    if (notify) return null;
    if (!r.ok) throw new Error(`MCP ${method} -> ${r.status}: ${text.slice(0, 300)}`);
    const last = [...text.matchAll(/^data: (.*)$/gm)].pop();
    const msg = JSON.parse(last ? last[1] : text);
    if (msg.error) throw new Error(`MCP ${method}: ${JSON.stringify(msg.error).slice(0, 300)}`);
    return msg.result;
  }
  return {
    async call(name, args = {}) {
      ready ??= (async () => {
        await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'assistente-pessoal', version: '1' } });
        await rpc('notifications/initialized', {}, true);
      })();
      await ready;
      const res = await rpc('tools/call', { name, arguments: args });
      const text = (res?.content || []).map((c) => c.text || '').join('\n');
      try { return JSON.parse(text); } catch { return { raw: text }; }
    },
  };
}

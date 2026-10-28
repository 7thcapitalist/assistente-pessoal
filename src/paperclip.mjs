// Ponte com o Paperclip: o João usa só o Paperclip (org Assistente Pessoal). Cada rascunho vira uma tarefa para ele:
//   - Aprovar: marcar a tarefa como Done. Recusar: Cancel. Mudar o texto: comentário começando com "Texto:".
//   - Reel que precisa dele: anexar o vídeo (ou o áudio) na própria tarefa.
// As conexões de LinkedIn e Instagram também viram tarefas, com o link do Composio e o passo exato.
// Roda dentro do tick (a cada 5 min). Sem IA, só chamadas locais ao Paperclip e ao Composio.
import { writeFileSync, mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import * as store from './db.mjs';
import { env } from './env.mjs';

const API = process.env.PAPERCLIP_API || 'http://127.0.0.1:3100/api';
export const COMPANY = process.env.ASSISTENTE_PAPERCLIP_COMPANY || '63ac15c5-84d9-4e21-8996-0deec7b0b651';
const JOAO = process.env.HQ_JOAO_USER_ID || 'local-board';
const PROJECT = { linkedin: '3f319655-95ae-49cb-bfd1-19c8ac7c7bbf', instagram: '69b0f8ac-545d-462e-ab25-516eaab15f01' };
const CANAL = { linkedin: 'LinkedIn', instagram: 'Instagram' };
const ENV_FILE = join(homedir(), '.config', 'assistente', 'env');
const MAX_ANEXO = 450 * 1024 * 1024;

export function makePaperclip(base = API) {
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`Paperclip ${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  };
  return {
    createIssue: (b) => call('POST', `/companies/${COMPANY}/issues`, { assigneeUserId: JOAO, priority: 'high', ...b }),
    getIssue: (id) => call('GET', `/issues/${id}`),
    patchIssue: (id, b) => call('PATCH', `/issues/${id}`, b),
    comment: (id, body) => call('POST', `/issues/${id}/comments`, { body }),
    // Comenta e marca o comentário como visto, para a ponte nunca ler o próprio texto como pedido do João.
    async say(link, body) { const c = await call('POST', `/issues/${link.issueId}/comments`, { body }); if (c?.id) link.seenCom.push(c.id); return c; },
    comments: (id) => call('GET', `/issues/${id}/comments`),
    attachments: (id) => call('GET', `/issues/${id}/attachments`),
    async download(att, to) {
      const r = await fetch(`${base}/attachments/${att.id}/content`, { signal: AbortSignal.timeout(600_000) });
      if (!r.ok) throw new Error(`download do anexo ${att.id} -> ${r.status}`);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, Buffer.from(await r.arrayBuffer()));
      return to;
    },
    async upload(issueId, path, mime) {
      const fd = new FormData();
      fd.append('file', new Blob([readFileSync(path)], { type: mime }), basename(path));
      const r = await fetch(`${base}/companies/${COMPANY}/issues/${issueId}/attachments`, { method: 'POST', body: fd, signal: AbortSignal.timeout(600_000) });
      if (!r.ok) throw new Error(`upload ${basename(path)} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
      return r.json();
    },
  };
}

const quando = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'assim que aprovar';
const roteiroDe = (d) => d.needs.find((n) => n.status === 'waiting');
const COMO_APROVAR = '**Para publicar:** marque esta tarefa como **Done**.\n**Para não publicar:** **Cancel**.\n**Para mudar o texto:** comente começando com `Texto:` e o texto novo inteiro.';

// Texto da tarefa conforme a fase do rascunho.
export function descrever(d) {
  const canal = CANAL[d.channel] || d.channel;
  const topo = [`**O que é:** ${canal}, rascunho "${d.title}", publica em ${quando(d.scheduled_for)}.`];
  const need = roteiroDe(d);
  if (d.status === 'needs_joao' && need) {
    const oque = need.type === 'record_video' ? 'gravar o vídeo (celular em pé, 9:16)' : 'gravar só o áudio (gravador do celular)';
    topo.push(`**Por que precisa de você:** este Reel usa ${need.type === 'record_video' ? 'você na câmera' : 'a sua voz'}.`,
      `**Primeiro passo:** ${oque} lendo o roteiro abaixo e **anexar o arquivo nesta tarefa** (clipe ou arrastar). O assistente edita sozinho e volta aqui com o vídeo pronto para você aprovar.`,
      '', '### Roteiro', '```', need.script, '```', need.notes ? `\n_${need.notes}_` : '');
  } else {
    topo.push('**Por que precisa de você:** nada vai ao ar sem a sua aprovação.', `**Primeiro passo:** leia o texto abaixo.`, '', COMO_APROVAR);
  }
  topo.push('', '### Texto do post', '', d.body);
  if (d.meta?.fonte && /^https?:/.test(d.meta.fonte)) topo.push('', `Fonte: ${d.meta.fonte}`);
  topo.push('', `<sub>rascunho ${d.id}</sub>`);
  return topo.join('\n');
}

const STATUS_TAREFA = { needs_joao: 'todo', processing: 'in_progress', pending: 'in_review', approved: 'done', publishing: 'done', published: 'done', failed: 'blocked', rejected: 'cancelled' };

function precisaConectar(erro) {
  if (!/NEEDS_CONNECT|COMPOSIO_API_KEY/.test(erro || '')) return null;
  return 'A conta ainda não está conectada. Faça a tarefa **Conectar** deste canal no Paperclip; depois marque esta como **Done** de novo que eu publico.';
}

// Sincroniza rascunhos ↔ tarefas. Devolve o que fez (para log e teste).
export async function syncDrafts(db, pc, { mediaDir } = {}) {
  const st = store.stateStore(db, '_paperclip');
  const out = [];
  for (const d0 of store.listDrafts(db, { limit: 500 })) {
    let d = d0;
    const key = `d:${d.id}`;
    let link = st.get(key);
    if (!link) {
      if (!['needs_joao', 'processing', 'pending', 'failed'].includes(d.status)) continue;
      const titulo = `${CANAL[d.channel] || d.channel}: ${d.status === 'needs_joao' ? 'gravar' : 'aprovar'} "${d.title}"`;
      const i = await pc.createIssue({ title: titulo, description: descrever(d), status: STATUS_TAREFA[d.status], projectId: PROJECT[d.channel] });
      link = { issueId: i.id, ident: i.identifier, last: d.status, issueStatus: STATUS_TAREFA[d.status], seenAtt: [], seenCom: [] };
      st.set(key, link);
      out.push({ draft: d.id, created: i.identifier });
      continue;
    }
    const issue = await pc.getIssue(link.issueId);

    // 1) Ações do João na tarefa.
    if (issue.status !== link.issueStatus) {
      if (issue.status === 'done' && ['pending', 'failed'].includes(d.status)) {
        d = store.decide(db, d.id, 'approve');
        await pc.say(link, `Aprovado. Publico em ${quando(d.scheduled_for)} e deixo o link aqui.`);
        out.push({ draft: d.id, approved: true });
      } else if (issue.status === 'cancelled' && !['published', 'rejected', 'publishing'].includes(d.status)) {
        d = store.decide(db, d.id, 'reject');
        out.push({ draft: d.id, rejected: true });
      } else if (issue.status === 'done' && ['needs_joao', 'processing'].includes(d.status)) {
        await pc.say(link, d.status === 'needs_joao' ? 'Ainda falta o arquivo: anexe o vídeo/áudio nesta tarefa.' : 'Ainda estou editando; aprove quando o vídeo pronto aparecer aqui.');
        link.last = null; // força reabrir no passo 3
      }
    }
    for (const c of await pc.comments(link.issueId)) {
      if (link.seenCom.includes(c.id)) continue;
      link.seenCom.push(c.id);
      const m = /^\s*texto:\s*([\s\S]+)/i.exec(c.body || '');
      if (m && ['pending', 'failed', 'needs_joao'].includes(d.status)) {
        d = store.editDraft(db, d.id, { body: m[1].trim() });
        await pc.patchIssue(link.issueId, { description: descrever(d) });
        await pc.say(link, 'Texto trocado. A descrição já mostra a versão nova.');
        out.push({ draft: d.id, edited: true });
      }
    }
    if (d.status === 'needs_joao') {
      const need = roteiroDe(d);
      for (const a of await pc.attachments(link.issueId)) {
        if (link.seenAtt.includes(a.id)) continue;
        link.seenAtt.push(a.id);
        const tipo = String(a.contentType || '');
        const kind = tipo.startsWith('video/') ? 'video_raw' : tipo.startsWith('audio/') ? 'audio' : null;
        if (!kind || !need) continue;
        const to = join(mediaDir, d.id, 'upload', `${a.id}-${basename(a.originalFilename || 'arquivo')}`);
        await pc.download(a, to);
        d = store.attachUpload(db, d.id, { needIndex: d.needs.indexOf(need), media: { kind, path: to, mime: tipo } });
        await pc.say(link, 'Recebi o arquivo. Estou editando; o vídeo pronto aparece aqui para você aprovar.');
        out.push({ draft: d.id, upload: a.id });
        break;
      }
    }

    // 2) Mudanças do motor → tarefa.
    if (d.status !== link.last) {
      const novo = STATUS_TAREFA[d.status];
      if (d.status === 'pending' && link.last === 'processing') {
        const final = [...d.media].reverse().find((x) => x.kind === 'video_final');
        let nota = 'Vídeo editado.';
        if (final && existsSync(final.path)) {
          try { await pc.upload(link.issueId, final.path, 'video/mp4'); nota = 'Vídeo editado anexado aqui.'; }
          catch (e) { nota = `Vídeo editado em ${final.path} (não consegui anexar: ${e.message}).`; }
        }
        await pc.patchIssue(link.issueId, { description: descrever(d) });
        await pc.say(link, `${nota}\n\n${COMO_APROVAR}`);
      } else if (d.status === 'published') {
        await pc.say(link, `Publicado: ${d.url || '(sem link)'}`);
      } else if (d.status === 'failed') {
        await pc.say(link, `Não consegui publicar: ${d.error}\n\n${precisaConectar(d.error) || 'Para tentar de novo: marque **Done** outra vez.'}`);
      } else if (d.status === 'processing' && d.error) {
        await pc.say(link, `A edição falhou: ${d.error}. Tento de novo sozinho.`);
      }
      if (novo && novo !== issue.status) await pc.patchIssue(link.issueId, { status: novo });
      link.last = d.status;
      link.issueStatus = novo || issue.status;
    } else {
      link.issueStatus = issue.status;
    }
    st.set(key, link);
  }
  return out;
}

// --- Conexões (LinkedIn pessoal, Instagram de IA) ---------------------------------------------------------------

export function salvarEnv(nome, valor, file = ENV_FILE) {
  mkdirSync(dirname(file), { recursive: true });
  const atual = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const linhas = atual.split('\n').filter((l) => l && !l.startsWith(`${nome}=`));
  writeFileSync(file, [...linhas, `${nome}=${valor}`].join('\n') + '\n', { mode: 0o600 });
  process.env[nome] = valor;
}

const contas = async (composio, t) => {
  const r = await composio.call('COMPOSIO_MANAGE_CONNECTIONS', { toolkits: [{ name: t, action: 'list' }] });
  return (r?.data?.results?.[t]?.accounts || []).filter((a) => String(a.status).toLowerCase() === 'active');
};
const linkNovo = async (composio, t) => {
  const r = await composio.call('COMPOSIO_MANAGE_CONNECTIONS', { toolkits: [{ name: t, action: 'add' }] });
  return r?.data?.results?.[t]?.redirect_url || null;
};

export const CONEXOES = {
  linkedin: {
    titulo: 'Conectar seu LinkedIn pessoal (2 min)',
    ativa: async (c) => (await contas(c, 'linkedin'))[0] || null,
    texto: (link) => [
      '**O que é:** ligar o seu LinkedIn pessoal ao assistente, para ele publicar os posts que você aprovar.',
      '**Por que precisa de você:** é login na sua conta; só você pode autorizar.',
      `**Primeiro passo:** abra este link no celular ou no PC: ${link || '(sem link: comente `link novo`)'}`,
      '', '1. Entre no LinkedIn e clique em **Permitir**.', '2. Pronto. Em até 5 min eu confiro, comento aqui e fecho esta tarefa sozinho.',
      '', 'Link expirou ou deu erro? Comente `link novo` aqui que em até 5 min aparece outro.'].join('\n'),
  },
  instagram: {
    titulo: 'Criar e conectar o Instagram de IA (10 min)',
    ativa: async (c) => {
      const u = String(env('INSTAGRAM_IA_USERNAME') || '').replace(/^@/, '');
      return u ? (await contas(c, 'instagram')).find((a) => a.user_info?.username === u) || null : null;
    },
    texto: (link) => [
      '**O que é:** a conta nova do Instagram de IA, onde o assistente publica os Reels que você aprovar.',
      '**Por que precisa de você:** criar conta e fazer login são passos seus.',
      '**Primeiro passo:** no app do Instagram, toque no seu nome no topo → **Adicionar conta** → **Criar nova conta**. Sugestões de @: `joao.empresasia` ou `joao.opera.ia`.',
      '', '2. Na conta nova: **Configurações → Tipo de conta e ferramentas → Mudar para conta profissional → Criador**. Sem isso o Instagram não deixa publicar por API.',
      '3. **Comente aqui o @ da conta nova** (ex.: `@joao.empresasia`). Só a conta com esse @ pode receber posts, e o @studio.frontstep fica bloqueado.',
      `4. Abra este link e entre **com a conta nova**: ${link || '(sem link: comente `link novo`)'}`,
      '5. Pronto. Em até 5 min eu confiro, comento aqui e fecho esta tarefa sozinho.',
      '', 'Link expirou ou entrou na conta errada? Comente `link novo`.'].join('\n'),
  },
};

export async function syncConnections(db, pc, composio, { conexoes = CONEXOES } = {}) {
  const st = store.stateStore(db, '_paperclip');
  const out = [];
  for (const [canal, cfg] of Object.entries(conexoes)) {
    const key = `conexao:${canal}`;
    const link = st.get(key);
    const conta = await cfg.ativa(composio);
    if (conta) {
      if (link && !link.fechada) {
        await pc.say(link, `Conectado (@${conta.user_info?.username || conta.alias || conta.id}). Os posts aprovados já podem ir ao ar.`);
        await pc.patchIssue(link.issueId, { status: 'done' });
        st.set(key, { ...link, fechada: true });
        out.push({ canal, conectado: true });
      }
      continue;
    }
    if (!link || link.fechada) {
      const i = await pc.createIssue({ title: cfg.titulo, description: cfg.texto(await linkNovo(composio, canal)), status: 'todo', projectId: PROJECT[canal], priority: 'critical' });
      st.set(key, { issueId: i.id, ident: i.identifier, seenCom: [] });
      out.push({ canal, criada: i.identifier });
      continue;
    }
    for (const c of await pc.comments(link.issueId)) {
      if (link.seenCom.includes(c.id)) continue;
      link.seenCom.push(c.id);
      const body = String(c.body || '').trim();
      const arroba = canal === 'instagram' && /^@?([a-z0-9._]{1,30})$/i.exec(body);
      if (arroba) {
        const u = arroba[1].toLowerCase();
        if (['studio.frontstep', 'yourstyle.snkrshop'].includes(u)) { await pc.say(link, `@${u} é conta da empresa; mande o @ da conta nova.`); continue; }
        salvarEnv('INSTAGRAM_IA_USERNAME', u);
        await pc.say(link, `Anotado: @${u}. Agora abra o link do passo 4 entrando com essa conta.`);
      } else if (/link novo/i.test(body)) {
        const l = await linkNovo(composio, canal);
        await pc.say(link, l ? `Link novo: ${l}` : 'O Composio não devolveu link agora; tento de novo no próximo ciclo (comente `link novo` de novo em 5 min).');
      }
    }
    st.set(key, link);
  }
  return out;
}

// Chamado pelo tick. Falha da ponte não derruba o agendador: vira log.
export async function syncPaperclip(db, { composio, mediaDir, pc = makePaperclip() } = {}) {
  const res = { drafts: [], conexoes: [], errors: [] };
  try { res.drafts = await syncDrafts(db, pc, { mediaDir }); } catch (e) { res.errors.push(`rascunhos: ${e.message}`); }
  if (composio) { try { res.conexoes = await syncConnections(db, pc, composio); } catch (e) { res.errors.push(`conexões: ${e.message}`); } }
  if (res.errors.length) try { appendFileSync(join(homedir(), '.local', 'state', 'assistente-ponte.log'), `${new Date().toISOString()} ${res.errors.join(' | ')}\n`); } catch {}
  return res;
}

// Rotina LinkedIn: 1 rascunho por execução (seg/qua/sex 08:00). run() nunca publica;
// publish() só roda depois do Aprovar no painel e posta na conta pessoal via Composio.
import { PAUTAS } from './pautas.mjs';

const MAX_PENDENTES = 3;
const MAX_CHARS = 3000; // limite do LinkedIn para o texto do post

const ativa = (a) => String(a?.status ?? '').toLowerCase() === 'active';
// COMPOSIO_MULTI_EXECUTE_TOOL devolve data.results[0].response (mesmo formato do instagram.mjs).
const resposta = (r) => {
  const x = r?.data?.results?.[0] ?? r?.data ?? r;
  return x?.response ?? x;
};

export function montarTexto(pauta) {
  const tags = (pauta.hashtags ?? []).slice(0, 3).join(' ');
  return tags ? `${pauta.body}\n\n${tags}` : pauta.body;
}

export default {
  id: 'linkedin-posts',
  name: 'LinkedIn: 3 posts/semana',
  channel: 'linkedin',
  description: 'Gera um rascunho por dia (seg/qua/sex) com fatos reais da holding; publica na conta pessoal só após Aprovar.',
  defaultSchedule: '0 8 * * 1,3,5',

  async run(ctx) {
    const pendentes = ctx.drafts.list({ status: 'pending', routine: 'linkedin-posts' });
    if (pendentes.length >= MAX_PENDENTES) {
      ctx.log(`${pendentes.length} rascunhos aguardando aprovação; não gero mais um`);
      return;
    }
    const n = ctx.state.get('n') ?? 0;
    const pauta = PAUTAS[n % PAUTAS.length];
    const reciclado = n >= PAUTAS.length;
    if (reciclado) ctx.log('banco de pautas esgotado: reciclando; adicione pautas novas em pautas.mjs');
    const body = montarTexto(pauta);
    if (body.length > MAX_CHARS) throw new Error(`pauta "${pauta.title}" passa de ${MAX_CHARS} caracteres`);
    ctx.state.set('n', n + 1);
    ctx.createDraft({
      title: pauta.title,
      body,
      meta: { tema: pauta.tema, hashtags: pauta.hashtags ?? [], fonte: pauta.fonte, reciclado },
    });
    ctx.log(`rascunho "${pauta.title}" (${pauta.tema})`);
  },

  async publish(draft, ctx) {
    if (draft.media?.length) throw new Error('imagem em post do LinkedIn ainda não é suportada; remova a mídia ou poste à mão');
    const lista = await ctx.composio.call('COMPOSIO_MANAGE_CONNECTIONS', { toolkits: [{ name: 'linkedin', action: 'list' }] });
    const conta = (lista?.data?.results?.linkedin?.accounts ?? []).find(ativa);
    if (!conta) {
      const novo = await ctx.composio.call('COMPOSIO_MANAGE_CONNECTIONS', { toolkits: [{ name: 'linkedin', action: 'add' }] });
      const link = novo?.data?.results?.linkedin?.redirect_url;
      throw new Error(`NEEDS_CONNECT: ${link ?? 'conecte o LinkedIn no Composio (toolkit linkedin)'}`);
    }
    const executar = async (tool_slug, args) =>
      resposta(await ctx.composio.call('COMPOSIO_MULTI_EXECUTE_TOOL', { tools: [{ tool_slug, arguments: args, account: conta.alias || conta.id }] }));

    const eu = await executar('LINKEDIN_GET_MY_INFO', {});
    const id = eu?.data?.id ?? eu?.data?.response_dict?.id ?? eu?.id;
    if (!id) throw new Error(`não consegui o id do perfil no LinkedIn: ${JSON.stringify(eu).slice(0, 200)}`);

    const post = await executar('LINKEDIN_CREATE_LINKED_IN_POST', {
      author: `urn:li:person:${id}`,
      commentary: draft.body,
      visibility: 'PUBLIC',
    });
    const urn = post?.data?.x_restli_id ?? post?.data?.id ?? post?.x_restli_id;
    if (!urn || post?.successful === false) throw new Error(`LinkedIn não confirmou o post: ${JSON.stringify(post).slice(0, 300)}`);
    ctx.log(`publicado ${urn}`);
    return { url: `https://www.linkedin.com/feed/update/${urn}/`, externalId: String(urn) };
  },
};

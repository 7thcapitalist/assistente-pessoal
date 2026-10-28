// Dados de EXEMPLO para screenshot/desenvolvimento. Use ASSISTENTE_DATA=/tmp/demo npm run seed
import { createDraft, createNeed, updateDraft } from '../src/drafts.js';
import { mutate, now } from '../src/store.js';
import { tick } from '../src/scheduler.js';

const d1 = createDraft({ channel: 'linkedin', routine: 'linkedin-posts', title: 'Operar agentes de IA: o que ninguém conta', scheduled_for: '2026-11-02T09:00:00-03:00',
  body: 'Exemplo de rascunho.\n\nDelegar para agentes de IA não elimina o trabalho: troca execução por revisão. A lição da semana é que o gargalo passa a ser a clareza do pedido.\n\nO que você já delegou e se arrependeu?', notes: 'Exemplo — lição abstrata de operar agentes' });
createDraft({ channel: 'linkedin', routine: 'linkedin-posts', title: 'Notícia da semana em IA + minha opinião', scheduled_for: '2026-11-04T09:00:00-03:00',
  body: 'Exemplo de rascunho com fonte.\n\nUm novo modelo saiu e a discussão virou "qual é melhor". Minha opinião: a diferença prática está no custo por tarefa concluída, não no benchmark.', sources: ['https://www.anthropic.com/news'] });
createDraft({ channel: 'instagram', routine: 'instagram-reels', kind: 'reel', title: 'Reel 1 — "3 tarefas que a IA faz por mim"', scheduled_for: '2026-11-03T19:00:00-03:00',
  body: 'Legenda de exemplo, sem hashtags.', media: [{ type: 'video', path: 'data/uploads/reel1.mp4' }], notes: 'Roteiro de 30s, depende da gravação do João' });
const d4 = createDraft({ channel: 'linkedin', title: 'Post já aprovado (esperando horário)', body: 'Exemplo aprovado.', scheduled_for: '2026-11-06T09:00:00-03:00' });
updateDraft(d4.id, 'approve');
createNeed({ routine: 'instagram-reels', type: 'gravar', title: 'Gravar o Reel 1 (30s)', instruction: 'Fale olhando para a câmera:\n1) "Três tarefas que a IA faz por mim todo dia"\n2) Cite uma por uma, com um exemplo seu\n3) Termine com a pergunta: "e você?"\nPode ser vertical, celular na mão.' });
createNeed({ routine: 'publisher', type: 'conectar', title: 'Conectar o Instagram novo', instruction: 'Abra o link e faça login na conta nova do Instagram para o Composio.', link: 'https://example.com/link-de-conexao-composio' });
createNeed({ routine: 'linkedin-posts', type: 'decidir', title: 'Tom dos posts: mais técnico ou mais pessoal?', instruction: 'Prefere posts mais técnicos (lições de operar agentes) ou mais pessoais (bastidores)?' });
mutate((s) => { // um item já publicado para o histórico
  s.drafts.unshift({ id: 'd_demo_pub', channel: 'linkedin', kind: 'post', title: 'Primeiro post publicado', body: 'Exemplo de post publicado.', status: 'published', created_at: now(), published_at: '2026-10-26T12:00:00Z', published_url: 'https://www.linkedin.com/feed/' });
  s.uploads.unshift({ id: 'u_demo', name: 'reel-rascunho.mp4', type: 'video/mp4', size: 18_400_000, path: 'uploads/u_demo-reel-rascunho.mp4', at: now() });
});
await tick({ force: true });
console.log('dados de exemplo criados');

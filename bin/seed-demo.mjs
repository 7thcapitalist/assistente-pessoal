#!/usr/bin/env node
// Dados de exemplo para ver o painel: ASSISTENTE_DB=/tmp/demo.db node bin/seed-demo.mjs
import * as store from '../src/db.mjs';
const db = store.openDb();
store.upsertRoutine(db, 'exemplo', { schedule: '0 8 * * 1,3,5' });
store.updateRoutine(db, 'exemplo', { enabled: true });
const mk = (r, c, d) => store.createDraft(db, r, c, d);
mk('linkedin-posts', 'linkedin', { title: 'Por que automatizar o que você faz toda segunda', body: 'Toda segunda eu perdia 40 minutos montando o mesmo relatório.\n\nHoje ele sai sozinho. O que mudou não foi a ferramenta, foi a pergunta: "isso precisa de mim?"\n\n#automação #produtividade', scheduledFor: '2026-10-29T11:00:00Z' });
mk('linkedin-posts', 'linkedin', { title: '3 erros ao usar IA no trabalho', body: '1. Pedir tudo de uma vez.\n2. Não revisar a saída.\n3. Não guardar o prompt que funcionou.' });
mk('instagram-ia', 'instagram', { title: 'Carrossel: IA que cuida da sua agenda', body: 'Seu dia, organizado em 30 segundos. Salve para testar depois.\n\n#ia #produtividade #tecnologia' });
const pub = mk('linkedin-posts', 'linkedin', { title: 'O que aprendi automatizando minha semana', body: 'Começar pequeno vence começar perfeito.' });
store.decide(db, pub.id, 'approve'); store.markPublished(db, pub.id, { url: 'https://www.linkedin.com/feed/update/urn:li:share:0000', externalId: '0000' });
const rej = mk('instagram-ia', 'instagram', { title: 'Reel genérico sobre IA', body: 'Texto fraco.' });
store.decide(db, rej.id, 'reject');
const fail = mk('instagram-ia', 'instagram', { title: 'Post sobre ferramentas de IA', body: 'Cinco ferramentas que uso toda semana.' });
store.decide(db, fail.id, 'approve'); store.markFailed(db, fail.id, 'NEEDS_CONNECT: conectar o Instagram no Composio (link no card)');
console.log('ok');

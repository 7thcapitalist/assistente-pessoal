import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../src/db.mjs';
import { loadRoutines, runRoutine } from '../src/runner.mjs';
import routine, { montarTexto } from '../routines/linkedin-posts/index.mjs';
import { PAUTAS } from '../routines/linkedin-posts/pautas.mjs';

const EMOJI = /\p{Extended_Pictographic}/gu;

test('pautas: tom do João, fonte citada, sem exagero de hashtag/emoji', () => {
  assert.ok(PAUTAS.length >= 6);
  for (const p of PAUTAS) {
    const t = montarTexto(p);
    assert.ok(p.fonte, `${p.title}: falta fonte`);
    assert.ok(t.length < 1500, `${p.title}: longo demais`);
    assert.ok((t.match(/#\w+/g) ?? []).length <= 3, `${p.title}: hashtags demais`);
    assert.ok((t.match(EMOJI) ?? []).length <= 1, `${p.title}: emoji demais`);
  }
  assert.equal(new Set(PAUTAS.map((p) => p.title)).size, PAUTAS.length);
});

test('rotina é carregada pelo esqueleto e run --dry não grava', async () => {
  const { routines, errors } = await loadRoutines();
  assert.ok(routines.has('linkedin-posts'), JSON.stringify(errors));
  const db = store.openDb(':memory:');
  const res = await runRoutine(db, routines.get('linkedin-posts'), { dry: true });
  assert.ok(res.ok);
  assert.equal(res.drafts.length, 1);
  assert.equal(store.listDrafts(db, {}).length, 0);
});

test('3 execuções geram 3 rascunhos diferentes; a 4ª espera aprovação', async () => {
  const db = store.openDb(':memory:');
  store.upsertRoutine(db, routine.id, { schedule: routine.defaultSchedule });
  for (let i = 0; i < 3; i++) assert.ok((await runRoutine(db, routine)).ok);
  const pend = store.listDrafts(db, { status: 'pending', routine: routine.id });
  assert.equal(pend.length, 3);
  assert.equal(new Set(pend.map((d) => d.title)).size, 3);
  await runRoutine(db, routine);
  assert.equal(store.listDrafts(db, { status: 'pending', routine: routine.id }).length, 3);
});

const fakeCtx = (respostas) => {
  const chamadas = [];
  return {
    chamadas,
    log() {},
    composio: {
      async call(nome, args) {
        chamadas.push([nome, args]);
        return respostas(nome, args);
      },
    },
  };
};
const draft = { id: 'd1', body: 'Texto aprovado', media: [] };

test('publish sem conta conectada → NEEDS_CONNECT com link, nada é postado', async () => {
  const ctx = fakeCtx((nome, a) => a.toolkits[0].action === 'list'
    ? { data: { results: { linkedin: { accounts: [] } } } }
    : { data: { results: { linkedin: { redirect_url: 'https://connect.composio.dev/link/lk_x' } } } });
  await assert.rejects(routine.publish(draft, ctx), /NEEDS_CONNECT: https:\/\/connect\.composio\.dev\/link\/lk_x/);
  assert.ok(!ctx.chamadas.some(([n]) => n === 'COMPOSIO_MULTI_EXECUTE_TOOL'));
});

test('publish simulado com conta ativa posta o texto aprovado e devolve url', async () => {
  const ctx = fakeCtx((nome, a) => {
    if (nome === 'COMPOSIO_MANAGE_CONNECTIONS') return { data: { results: { linkedin: { accounts: [{ id: 'ca_1', status: 'ACTIVE' }] } } } };
    const t = a.tools[0];
    if (t.tool_slug === 'LINKEDIN_GET_MY_INFO') return { data: { results: [{ response: { data: { id: 'abc123' } } }] } };
    return { data: { results: [{ response: { successful: true, data: { x_restli_id: 'urn:li:share:999' } } }] } };
  });
  const out = await routine.publish(draft, ctx);
  assert.equal(out.externalId, 'urn:li:share:999');
  assert.equal(out.url, 'https://www.linkedin.com/feed/update/urn:li:share:999/');
  const post = ctx.chamadas.at(-1)[1].tools[0];
  assert.equal(post.tool_slug, 'LINKEDIN_CREATE_LINKED_IN_POST');
  assert.equal(post.arguments.author, 'urn:li:person:abc123');
  assert.equal(post.arguments.commentary, 'Texto aprovado');
  assert.equal(post.account, 'ca_1');
});

test('publish recusa mídia e resposta sem confirmação', async () => {
  await assert.rejects(routine.publish({ ...draft, media: [{ kind: 'image' }] }, fakeCtx(() => ({}))), /imagem/);
  const ctx = fakeCtx((nome, a) => nome === 'COMPOSIO_MANAGE_CONNECTIONS'
    ? { data: { results: { linkedin: { accounts: [{ id: 'c', status: 'active' }] } } } }
    : a.tools[0].tool_slug === 'LINKEDIN_GET_MY_INFO' ? { data: { results: [{ response: { data: { id: 'i' } } }] } }
    : { data: { results: [{ response: { successful: false, error: 'x' } }] } });
  await assert.rejects(routine.publish(draft, ctx), /não confirmou/);
});

# Assistente pessoal do João

Painel + agendador de **rotinas** que preparam rascunhos (posts, depois email e tarefas). **Nada é publicado, enviado ou respondido sem o João clicar em Aprovar no painel.**

Stack: Node 24 (sem dependências, `node:sqlite` embutido), SQLite, HTML/JS puro. Roda no mini PC como serviço systemd de usuário; o painel escuta só no IP da tailnet.

## Arquitetura

```
systemd timer (5 min) → bin/tick.mjs ──► roda rotinas ligadas e vencidas ──► rascunhos (pending)
                                    └──► publica rascunhos aprovados (respeita scheduledFor)
painel (bin/serve.mjs, :4180) ◄──► SQLite data/assistente.db
   Rotinas: ligar/desligar, agenda, rodar agora · Fila: Aprovar / Editar / Recusar · Histórico
```

| Arquivo | Papel |
|---|---|
| `src/db.mjs` | Schema SQLite + operações (rotinas, rascunhos, estado, execuções) |
| `src/cron.mjs` | Cron de 5 campos, fuso `America/Sao_Paulo` (`ASSISTENTE_TZ`) |
| `src/runner.mjs` | Carrega `routines/*`, monta o `ctx`, `tick()`, publicação dos aprovados |
| `src/server.mjs`, `public/index.html` | API JSON + painel (POST exige cabeçalho `x-assistente: 1`) |
| `src/composio.mjs`, `src/env.mjs` | Cliente MCP do Composio e leitura de segredos (nunca logados) |
| `routines/<id>/index.mjs` | Uma pasta por rotina |
| `systemd/`, `bin/install.sh` | Serviço do painel + timer do agendador |

Estados de um rascunho: `pending → approved → published`, ou `rejected`, ou `failed` (com o erro; dá pra aprovar de novo).

## Rodar

```sh
npm test                                   # testes
ASSISTENTE_DB=/tmp/demo.db node bin/seed-demo.mjs && ASSISTENTE_DB=/tmp/demo.db node bin/serve.mjs   # painel com dados de exemplo
node bin/run.mjs exemplo --dry             # roda uma rotina sem gravar nada
node bin/tick.mjs                          # um ciclo do agendador
bin/install.sh                             # instala o painel + timer (clone em ~/apps/assistente-pessoal)
```

Segredos ficam em `~/.config/assistente/env` (`COMPOSIO_API_KEY=...`); se faltar, lê `~/.config/holding-hq/env`. Variáveis: `PORT` (4180), `HOST`, `ASSISTENTE_DB`, `ASSISTENTE_TZ`.

## Como adicionar uma rotina

1. Crie `routines/<id>/index.mjs` (o `id` é igual ao nome da pasta; pastas com `_` no início são ignoradas). Copie `routines/exemplo/`.
2. Exporte:

```js
export default {
  id: 'linkedin-posts',
  name: 'LinkedIn: 3 posts/semana',
  channel: 'linkedin',                // linkedin | instagram | email | tasks
  description: '...',
  defaultSchedule: '0 8 * * 1,3,5',   // cron de 5 campos
  async run(ctx) { ctx.createDraft({ title, body, media, meta, scheduledFor }); },   // gera rascunhos, NUNCA publica
  async publish(draft, ctx) { return { url, externalId }; },                         // só após Aprovar
};
```

3. `ctx`: `createDraft(d)`, `drafts.list({status})`, `state.get(k)/set(k,v)` (JSON persistente por rotina), `log(msg)`, `now`, `env(NOME)`, `composio.call(ferramentaMCP, args)`, `dry`.
4. Rascunho: `{ title, body, media: [{kind, path, alt}], meta: {}, scheduledFor? }`. Imagens em `data/media/` aparecem no painel.
5. Conta não conectada (LinkedIn/Instagram/Gmail): `throw new Error('NEEDS_CONNECT: <link>')` em `publish`; o painel mostra o erro e o João conecta e aprova de novo.
6. Teste com `node bin/run.mjs <id> --dry`, escreva `test/<id>.test.mjs` (`npm test`). A rotina nasce **desligada**; o João liga no painel.

Email e tarefas entram como rotinas novas (`channel: 'email'` / `'tasks'`), sem mudar o esqueleto.

## Segurança

- Painel só no IP da tailnet; sem login próprio (a tailnet é a barreira). Escritas exigem `x-assistente: 1`; `/media` só serve `data/media/`.
- Publicar só acontece para rascunho `approved` por clique no painel.

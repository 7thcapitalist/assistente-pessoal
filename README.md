# assistente-pessoal

Assistente pessoal do João. Um painel web simples onde ele vê e aprova tudo que o assistente faz por ele.
**Regra de ouro: nada é publicado, enviado ou respondido sem um clique de aprovação no painel.**

Sem dependências (só Node ≥ 22). Estado em `data/state.json`, uploads em `data/uploads/` (ambos fora do git).

## Rodar

```sh
npm test                       # testes
PORT=3737 node bin/server.js   # painel (HOST padrão 127.0.0.1)
node bin/tick.js [rotina]      # roda o agendador uma vez (com id: força aquela rotina)
ASSISTENTE_DATA=/tmp/demo npm run seed   # dados de exemplo
scripts/install-systemd.sh     # instala painel + timer como serviços de usuário
```

No mini PC: `bin/start.sh` liga o painel **só no IP da tailnet** (`tailscale ip -4`), nunca em `0.0.0.0`.
O timer `assistente-tick.timer` chama `bin/tick.js` a cada 5 min.

## Arquitetura

```
 agentes (Conteúdo e Redes…)         João (celular, tailnet)
        │ POST /api/drafts, /api/needs        │ painel: aprova / edita / recusa / sobe vídeo
        ▼                                     ▼
   ┌────────────────── src/server.js (HTTP, JSON) ───────────────────┐
   │  src/drafts.js  validação e transições de status                 │
   │  src/store.js   data/state.json (escrita atômica)                │
   └──────────────────────────────────────────────────────────────────┘
        ▲
        │ systemd timer (5 min) → bin/tick.js → src/scheduler.js
        │      └─ roda cada rotina vencida (src/routines/*.js)
        │            └─ publisher → src/channels/*.js (Composio) — só lê status "approved"
```

- **Rotinas** (`src/routines/`): ligar/desligar, horário (BRT) e dias da semana editáveis no painel.
- **Rascunhos**: `pending → approved | rejected → published`. Editar um rascunho aprovado volta para `pending`.
- **Precisa de você** (`needs`): `gravar`, `conectar` ou `decidir`, com a instrução exata.
- **Upload**: `POST /api/uploads?name=x.mp4[&need=<id>]` com o arquivo cru no corpo (`Content-Type` video/*, audio/* ou image/*).
- **Publicador** (rotina `publisher`): única porta de saída. Publica só `approved` com `scheduled_for` vencido. Canal sem conexão → abre um item "conectar" para o João.

## API

| | |
|---|---|
| `GET /api/overview` | tudo que o painel mostra |
| `POST /api/drafts` | cria rascunho (formato abaixo) |
| `POST /api/drafts/:id/{approve,reject,reopen,edit}` | ações (`reject` aceita `reason`; `edit` aceita `title`, `body`, `scheduled_for`) |
| `POST /api/needs` / `POST /api/needs/:id/done` | cria / resolve item "precisa do João" |
| `POST /api/routines/:id` | `{enabled, time:"HH:MM", days:[0-6]}` (0 = domingo) |
| `POST /api/routines/:id/run` | roda agora |
| `POST /api/uploads` | upload cru |

Rascunho:
```json
{ "channel": "linkedin | instagram", "routine": "linkedin-posts", "kind": "post | reel | carrossel | story",
  "title": "rótulo curto", "body": "texto final (sem hashtags no IG)", "scheduled_for": "2026-11-02T09:00:00-03:00",
  "sources": ["https://fonte"], "media": [{"type": "video", "path": "data/uploads/x.mp4"}], "notes": "contexto pro João" }
```
Precisa do João: `{ "routine", "type": "gravar|conectar|decidir", "title", "instruction", "link?", "due?" }`.

Os endpoints de escrita rejeitam requisições de navegador com `Origin` diferente do painel. A proteção real é de rede: o painel só escuta na tailnet.

## Plugar rotina nova (email, tarefas…)

1. Crie `src/routines/<id>.js`:
   ```js
   export default {
     id: 'email-triagem', name: 'Email — triagem', description: '…',
     defaults: { enabled: false, time: '07:00', days: [1,2,3,4,5] },   // ou { every_minutes: 15 }
     async run(ctx) {
       // ctx.listDrafts(pred) · ctx.ensureNeed({...}) · ctx.markPublished(id,url) · ctx.log(msg)
       return 'resumo curto que aparece no painel';
     },
   };
   ```
2. Registre em `src/routines/index.js`. Ela aparece sozinha na aba Rotinas.
3. Se a rotina propõe uma ação em nome do João (responder email, criar evento): gere um **rascunho** (`createDraft`, novo `channel` em `CHANNELS` + adaptador em `src/channels/`) em vez de executar. A execução só acontece depois do `approved`.
4. Teste em `test/` (veja `test/app.test.js`).

## Plugar canal (Composio)

Em `src/channels/<canal>.js`, `publish(draft)` deve chamar o toolkit do Composio e devolver `{ url }`. Enquanto lançar `NotConnected`, o painel pede ao João a conexão. O login da conta é sempre dele.

## Fora desta entrega

Edição automática de vídeo/áudio (ffmpeg) e as integrações reais do Composio entram em tarefas seguintes; o upload já guarda os arquivos para isso.

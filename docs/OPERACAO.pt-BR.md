# Assistente pessoal do João

## Onde o João usa: só no Paperclip (desde 28/10/2026)
O João não abre painel próprio. Tudo chega como tarefa na org **Assistente Pessoal** do Paperclip
(`src/paperclip.mjs`, roda dentro do `tick` a cada 5 min):

| No Paperclip | O que acontece aqui |
|---|---|
| Tarefa "LinkedIn/Instagram: aprovar …" → **Done** | rascunho aprovado; publica no horário e comenta o link |
| **Cancel** | rascunho recusado |
| Comentário começando com `Texto:` | troca o texto do post |
| Tarefa "Instagram: gravar …" → **anexar** vídeo ou áudio | baixa, edita (ffmpeg + legenda) e anexa o vídeo pronto para aprovar |
| Tarefas "Conectar …" | link do Composio; comente `link novo` se expirar; no Instagram, comente o `@` da conta nova |

O servidor web (`bin/serve.mjs`) continua no código para testes, mas o serviço `assistente-painel` fica desligado.
`ASSISTENTE_PAPERCLIP=0` desliga a ponte (ex.: testes manuais do tick).

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

Estados de um rascunho: `pending → approved → published`, ou `rejected`, ou `failed` (com o erro; dá pra aprovar de novo). Rascunhos que dependem do João começam em `needs_joao` e passam por `processing` (ver "Mídia e pedidos ao João").

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

## Mídia e pedidos ao João (`needs`)

Reels dependem de o João gravar vídeo ou narração. A rotina cria o rascunho com `needs`; o painel mostra a fila **Precisa do João** no topo (texto a gravar/ler, duração alvo, dica e botões de envio).

```js
ctx.createDraft({ title, body, needs: [{ type: 'record_video' /* ou 'record_audio' */, script: 'texto a falar', durationSec: 30, notes: 'luz natural' }] });
```

- `needs[]`: `{type: 'record_video'|'record_audio', script, notes?, durationSec?, status: 'waiting'|'received'}` (aceita também um objeto só). `media[]`: `{kind: 'video_raw'|'audio'|'video_final'|'cover', path, mime, bytes}`.
- Estados: com `needs` em `waiting` e sem mídia o rascunho nasce `needs_joao` (não entra na fila de aprovação, não dá pra aprovar). O upload do João vira o `need` em `received` e o rascunho em `processing`. A rotina edita (corte, legenda...) e chama `ctx.drafts.finishProcessing(id, { media: [{ kind: 'video_final', path, mime, bytes }] })` → `pending`; aí o card mostra o vídeo (`<video controls>`, capa como pôster) com **Aprovar / Editar / Recusar**. Recusar vale em qualquer fase. Nada publica sem aprovar. A rotina lista o que editar com `ctx.drafts.list({ status: 'processing' })`.
- `POST /api/drafts/:id/upload?need=<índice>`: `multipart/form-data` com um campo `file`; mesma trava CSRF (`x-assistente: 1`). Grava em streaming em `data/media/<draftId>/<aleatório>-<nome sanitizado>.<ext pelo mime>` (o nome do cliente nunca vira caminho). Só `video/*`, `audio/*`, `image/*` (SVG não); limite 500 MB (`413`), `415` tipo inválido, `409` rascunho em estado que não recebe arquivo. Falha no meio apaga o arquivo parcial. `kind`: áudio → `audio`, imagem → `cover`, vídeo → `video_raw`.
- `GET /media?p=<caminho>` serve só dentro de `data/media/` (`ASSISTENTE_MEDIA`), com `Range` (206/416, `Accept-Ranges`, HEAD), que o iOS exige. Upload e mídia só respondem para loopback e IPs da tailnet (`100.64.0.0/10`, `fd7a:115c:a1e0::/48`); `ASSISTENTE_ANY_NETWORK=1` desliga essa checagem.
- Celular: "Gravar vídeo"/"Gravar áudio" usam `<input type=file accept=video/*|audio/* capture>` e abrem a câmera/gravador do aparelho; "Escolher arquivo" sobe da galeria. Para áudio há também "Gravar aqui no navegador" (MediaRecorder), que só aparece em contexto seguro (HTTPS ou localhost). Em `http://100.x` o navegador bloqueia o microfone: use `tailscale serve --bg 4180` (HTTPS) ou o botão do app do celular / escolher arquivo.
- Variáveis: `ASSISTENTE_MEDIA`, `ASSISTENTE_ANY_NETWORK`. Banco antigo migra sozinho (coluna `needs`).

Teste manual pelo celular (tailnet):
1. No mini PC: `ASSISTENTE_DB=/tmp/demo.db node bin/seed-demo.mjs && ASSISTENTE_DB=/tmp/demo.db HOST=<IP 100.x> node bin/serve.mjs`.
2. No celular (Tailscale ligado) abra `http://<IP 100.x>:4180`: a fila "Precisa do João" aparece no topo com dois itens de exemplo.
3. "Gravar vídeo" abre a câmera; grave 5 s e confirme. A barra de envio completa, o item some da fila e aparece "Editando: ...". Confira o arquivo em `data/media/<id>/`.
4. Simule a rotina: `ASSISTENTE_DB=/tmp/demo.db node -e "import('./src/db.mjs').then(s=>{const db=s.openDb();const d=s.listDrafts(db,{status:'processing'})[0];const m=d.media[0];s.finishProcessing(db,d.id,{media:[{kind:'video_final',path:m.path,mime:m.mime,bytes:m.bytes}]})})"`. O card vai para a fila de aprovação; toque ▶ no player (o iOS faz requisições Range) e aprove ou recuse.

Screenshots: `docs/precisa-do-joao.png` (desktop) e `docs/precisa-do-joao-celular.png`. Nos exemplos o vídeo é um arquivo de teste sem conteúdo reproduzível. O teste em celular real (câmera, iOS) é manual e ainda não foi feito.

## Segurança

- Painel só no IP da tailnet; sem login próprio (a tailnet é a barreira). Escritas exigem `x-assistente: 1`; `/media` só serve `data/media/`; upload e mídia só para tailnet/loopback.
- Publicar só acontece para rascunho `approved` por clique no painel.

## Reels do Instagram IA: upload, edição e publicação (ASS-4)

Fluxo (detalhes em `docs/instagram/estrategia.md`): a rotina `instagram-ia` cria um rascunho por item de `data/instagram/calendario.json`.

| Tipo | Painel | Edição no mini PC |
|---|---|---|
| A (gravar) | "Precisa do João": roteiro grande + **Subir vídeo bruto** / Gravar vídeo agora | transcreve, corta silêncio e hesitação, legenda queimada karaokê, texto na tela do roteiro, zoom alternado a cada corte, música baixa, capa do bruto |
| B (imagens) | nasce "editando"; vai direto para a fila | cartões 1080x1920 animados + legenda + música + capa, sem o João |
| C (voz) | narração + **Subir áudio** / gravar no navegador | transcreve, corta pausas, vira as cenas no tempo da voz, legenda, música, capa |

Saída: mp4 H.264/AAC 1080x1920 30 fps + capa jpg em `data/media/<id>/edit/`, rascunho vai para a fila de aprovação (erro de edição aparece no painel com "Tentar de novo"; 3 tentativas automáticas).

- Ferramentas locais, sem serviço pago: `ffmpeg` estático em `~/.local/opt/ffmpeg` (e symlink em `~/.local/bin`), `faster-whisper` (modelo `small`, CPU int8) no venv `~/.local/opt/whisper-venv` com modelos em `~/.local/opt/whisper-models`, via `scripts/transcribe.py`. Variáveis: `FFMPEG`, `FFPROBE`, `WHISPER_PYTHON`, `WHISPER_MODEL`. Reinstalar: baixar o ffmpeg static amd64; `python3 -m venv ~/.local/opt/whisper-venv && ~/.local/opt/whisper-venv/bin/pip install faster-whisper numpy`.
- Música: `data/musica/` (ver `LEIA-ME.md`). Vem uma trilha sintetizada própria; o João troca por faixas livres depois de conferir a licença.
- Publicação (só depois do Aprovar): trava de conta (`INSTAGRAM_IA_USERNAME` em `~/.config/assistente/env`, recusa @studio.frontstep e @yourstyle.snkrshop e qualquer conta diferente), recusa termo vedado, `[campo]` aberto e notícia sem fonte https. A Meta precisa baixar o mp4 por URL https: `src/publicurl.mjs` sobe um servidor local que serve só o mp4 e a capa em `/<token aleatório>/arquivo` e abre um túnel grátis `cloudflared` (trycloudflare, sem conta), derrubado assim que a publicação termina.
- Exemplos gerados (voz **sintética** de teste, vídeo bruto de teste: o João real ainda não gravou): `docs/instagram/exemplos/reel-{A,B,C}.mp4` e capas. Telas: `docs/instagram/painel-*.png`.
- Não testado: publicação real na Meta (falta a conta nova, o @ e a conexão no Composio, passos do João); o túnel foi testado de verdade (mp4 e capa respondem 200 em https).

# assistente-pessoal

A small personal assistant that drafts social posts with AI agents and publishes nothing until I approve it.

I run a business with AI agents and want to write about what I learn, but I do not want an agent posting under my name unsupervised. This project is the guardrail: routines prepare drafts on a schedule, I approve or reject each one, and only approved drafts are published.

## Status

Working for LinkedIn and Instagram drafting; real Instagram publishing is untested.

- Covered by tests (`test/`, 7 files): the scheduler, the draft state machine, the LinkedIn routine, the Instagram routine, the reel editing pipeline, media upload and the Paperclip bridge.
- Tested for real: the HTTPS tunnel that lets Meta download generated reels.
- Not tested: publishing to Instagram through Meta (the dedicated account and its Composio connection do not exist yet) and recording on a real phone. The example reels in `docs/instagram/exemplos/` use a synthetic voice and a placeholder raw video.

## How it works

```
systemd timer (every 5 min) -> bin/tick.mjs
     |-> runs enabled routines that are due  -> drafts (pending)
     '-> publishes approved drafts whose time has come

Approval happens as a task in Paperclip (a self-hosted agent task board):
  task marked Done = approve, Cancel = reject, comment "Texto: ..." = edit the post
```

- A **routine** is one folder in `routines/` exporting `run(ctx)`, which creates drafts and never publishes, and `publish(draft, ctx)`, which only runs after approval.
- Drafts move `pending -> approved -> published`, or `rejected` / `failed`. Drafts that need me to record something start as `needs_joao`.
- **LinkedIn routine** (`routines/linkedin-posts`): three posts a week. A content filter blocks text that would reveal internal product, client, price or number details. Posts go out through Composio.
- **Instagram routine** (`routines/instagram-ia`): builds Reels from a two-week calendar. If I record, it transcribes with faster-whisper, cuts silence, burns in karaoke-style captions and adds music with ffmpeg. If I send only a voice note, or nothing, it builds the video from generated image cards. A publish guard checks the account name, banned terms, open placeholders and unsourced news before anything goes out.
- A small web panel (`bin/serve.mjs`, `public/index.html`) is still in the code for local testing. Writes need a custom header, uploads accept only video, audio and images, and it only answers on loopback and the Tailscale network.

## Stack

Node 24 with no npm dependencies (built-in `node:sqlite` and `node:test`), plain HTML/JS for the panel, systemd for scheduling, ffmpeg and faster-whisper for video, Composio (MCP) for LinkedIn and Instagram access, Paperclip for the approval inbox.

## Run it

```sh
npm test                                        # test suite
ASSISTENTE_DB=/tmp/demo.db node bin/seed-demo.mjs
ASSISTENTE_DB=/tmp/demo.db node bin/serve.mjs   # panel with sample data on :4180
node bin/run.mjs exemplo --dry                  # run one routine without saving
node bin/tick.mjs                               # one scheduler cycle
bin/install.sh                                  # install the systemd timer
```

Secrets are read from `~/.config/assistente/env` (`COMPOSIO_API_KEY=...`), never from the repo, and are not logged (`src/env.mjs`).

Full operating notes, in Portuguese: [docs/OPERACAO.pt-BR.md](docs/OPERACAO.pt-BR.md). Content strategy: [docs/instagram/estrategia.md](docs/instagram/estrategia.md).

## What's next

1. Create the dedicated Instagram account, connect it in Composio and run the first real publish.
2. Record real reels on a phone and test the iOS upload and playback path.
3. Add email and task routines with the same routine contract (`channel: 'email'` or `'tasks'`).

## License

MIT, see [LICENSE](LICENSE).

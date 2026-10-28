# Instagram de IA: estratégia (ASS-3)

Conta nova do João, só para este projeto. **Nunca** publicar em @studio.frontstep nem @yourstyle.snkrshop.
Este documento substitui `docs/instagram-ia-estrategia.md` do PR #1 (SOF-588): mesma linha, agora com os 3 tipos de Reel e o calendário de Reels.

## Posicionamento
"O João opera negócios com agentes de IA e conta o que aprendeu."
Não é guru de prompt. É diário de bordo de quem tem um negócio em que agentes fazem o trabalho (prospecção e funil rodando quase sozinhos), no abstrato.
Promessa: "veja como uma pessoa sozinha opera com agentes e copie o que servir."

## Regra de conteúdo (acima de tudo)
- **Nunca** revelar a fábrica de sites, a fábrica de Roblox, produto, empresa, cliente, preço, nicho, ferramenta do processo ou número que permita copiar o negócio.
- Pode: "tenho um negócio operado por agentes que roda prospecção e funil sozinho" e as lições (orquestração, revisão, custo, erro e correção).
- Sem novidade dele na semana: notícia/tendência de IA com opinião dele e **fonte https verificada**. Nunca inventar fato.
- Sem print de sistema real nem tela com nome de cliente/empresa. Exemplos só com dados fictícios.

## Público
Brasileiros de 22 a 40 anos: empreendedores solo, freelancers, devs e gente de marketing que já usa ChatGPT e não sabe virar isso em operação que roda sozinha. Tom: português direto, primeira pessoa, sem jargão, sem promessa de ficar rico.

## 3 pilares
1. **Bastidores da operação (abstrato):** o que muda quando agentes tocam o trabalho. Orquestração, revisão, custo.
2. **Como eu faço:** uma regra ou fluxo por post, em passos que dá para repetir.
3. **Erro e correção + IA no mundo:** falhas abstratas e como foram corrigidas; e, sem novidade dele, notícia de IA com opinião e fonte.

## Formatos
| Formato | Quem faz | Notas |
|---|---|---|
| Reel A, **gravar** (20-45 s) | João grava, assistente edita | roteiro com gancho de 2 s, falas e texto na tela |
| Reel B, **só imagens** (20-35 s) | assistente sozinho | cards de texto/imagem + legenda queimada + música livre |
| Reel C, **voz do João** (25-45 s) | João grava só o áudio | painel mostra o texto; assistente sincroniza cenas e legenda |
| Carrossel (5-8 slides) | assistente sozinho | 1080x1350, 1 ideia por slide |

Os 3 Reels têm o mesmo formato final: 9:16, 1080x1920, mp4 H.264/AAC, legenda queimada em português, capa própria, música livre de direitos (arquivo local, sem serviço pago).

## Frequência e horários (Brasília)
4 posts por semana: **terça 12h**, **quinta 19h**, **sábado 10h**, **domingo 20h**. Dos 4, 3 são Reels e 1 é carrossel; no máximo 1 Reel tipo A por semana, para o João gravar pouco. Sem hashtags. Legenda: gancho na 1ª linha, 3-6 linhas, 1 chamada para ação. Reavaliar horários após 3 semanas com o alcance real da conta.

## Nome de usuário sugerido (disponibilidade não verificada; só o João confirma ao criar)
1. `joao.empresasia`
2. `joao.opera.ia`
3. `joaoeosagentes`
4. `empresas.de.agentes`

## Fluxo de cada tipo de Reel no painel

**A. Roteiro para o João gravar**
1. Rascunho nasce com roteiro: gancho (2 s), falas por bloco, texto na tela, duração-alvo.
2. Painel mostra o roteiro grande (modo teleprompter no celular) e o botão "Subir vídeo bruto".
3. João grava de pé, luz na frente, vertical, e sobe o arquivo.
4. Assistente (mini PC): transcreve local, corta silêncios e hesitações, queima legenda em português, ajusta ritmo, põe música baixa, gera capa, exporta 9:16.
5. Rascunho volta para a fila com o vídeo editado e a legenda do post. João vê, aprova ou recusa.

**B. Só imagens e legenda (sem o João)**
1. Rascunho nasce com lista de cenas (texto do card, duração) e a legenda do post.
2. Assistente renderiza cards 1080x1920 com o texto, anima (zoom leve), queima legenda, põe música livre, gera capa.
3. Vai direto para a fila. João só aprova.

**C. Com a voz dele**
1. Rascunho nasce com a narração (texto corrido, 70-110 palavras) e as cenas que ilustram cada trecho.
2. Painel mostra o texto e o botão "Gravar áudio" / "Subir áudio".
3. João lê o texto e sobe só o áudio (m4a/mp3/wav).
4. Assistente transcreve local para achar o tempo de cada trecho, ajusta a duração das cenas à voz, queima legenda, põe música baixa, gera capa.
5. Fila: João vê e aprova.

## Contrato de dados (para o Engenheiro)
`data/instagram/calendario.json`: lista de rascunhos. Campos:
- `id`, `data` (ISO com `-03:00`), `pilar`, `formato` (`reel`|`carrossel`), `tipo` (`A_gravar`|`B_imagens`|`C_voz`|null), `titulo`, `legenda`, `status` (`rascunho`).
- A: `roteiro: { duracaoSeg, gancho: { segundos: 2, fala, naTela }, blocos: [{ de, ate, fala, naTela }] }`.
- B: `cenas: [{ segundos, card, naTela }]`.
- C: `narracao` (texto corrido) e `cenas`.
- Carrossel: `slides: []`.
- Notícia: `noticia: true`, `fonte: null` até o João/Conteúdo preencher com URL https; a publicação deve recusar sem fonte e com `[campo]` aberto.
- `arte`: orientação visual da capa.

Ferramentas no mini PC (sem serviço pago): `ffmpeg` (corte, legenda queimada, mix de música, 9:16, capa) e transcrição local (`whisper.cpp` ou `faster-whisper`). Na checagem de hoje `ffmpeg` e `whisper` não estavam no PATH do mini PC: instalar faz parte do trabalho do Engenheiro. Música: pasta `data/musica/` com faixas livres (ex.: YouTube Audio Library ou Pixabay Music, licença conferida pelo João antes de entrar).

## Publicação
Ao aprovar, publica pelo Composio (toolkit `instagram`), só na conta nova, com trava de usuário (recusa se a conta conectada não for a esperada). Reels pedem URL https pública do mp4: o Engenheiro define como expor o arquivo (ex.: link temporário na tailnet não serve, a Meta precisa alcançar a URL).

## Passos do João (só ele pode)
1. Criar a conta Instagram nova com um dos nomes acima e trocar para Profissional (Criador).
2. Vincular a uma Página do Facebook (exigência da Meta para publicar por API).
3. Conectar essa conta no Composio (toolkit `instagram`) pelo link de conexão que o painel/tarefa gerar.
4. Avisar o @ final na tarefa, para travar a publicação nele.
5. Escolher/confirmar a música livre e gravar 1 Reel A por semana e o áudio dos Reels C (1 por semana).

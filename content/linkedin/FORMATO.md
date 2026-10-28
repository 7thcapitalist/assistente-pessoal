# Rascunho de LinkedIn: formato (contrato com o painel)

Um arquivo JSON por rascunho. O painel lê, mostra e muda só `status`/`text`.

```json
{
  "id": "li-2026-11-02-seg",
  "channel": "linkedin",
  "kind": "licao | noticia",
  "scheduled_for": "2026-11-02T08:30:00-03:00",
  "text": "texto final do post (português, 1ª pessoa, curto)",
  "source": { "title": "...", "url": "https://..." },
  "status": "draft | approved | rejected | published | failed",
  "created_at": "ISO",
  "approved_at": null,
  "published": { "at": null, "post_url": null, "simulated": false }
}
```

- `source` é obrigatório quando `kind = noticia` (URL verificada, aberta e lida antes). Em `licao` é `null`.
- Aprovar = `status: approved`. O publicador pega `approved` com `scheduled_for` vencido e posta pelo Composio (toolkit `linkedin`, conta pessoal do João). Sem conexão ativa: não publica, mantém `approved` e abre item "precisa do João" com o link de conexão.
- Nada vai pro ar sem `approved` vindo do clique do João.

## Regras de texto
- Português, 1ª pessoa, 450 a 900 caracteres, frases curtas, uma ideia por post. Sem hashtag, sem emoji em excesso, sem "Fala, rede!" nem final com pergunta forçada.
- Segunda e sexta: lição abstrata de operar um negócio tocado por agentes de IA. Quarta: notícia/tendência de IA com opinião do João e fonte. Se o João deu novidade na semana (comentário na tarefa ou item do painel), ela entra no lugar.
- CONFIDENCIAL (barra o rascunho se falhar): nada de nome de empresa, fábrica, produto, cliente, preço, nicho, ferramenta do processo, número ou métrica do negócio. Só o abstrato: "tenho um negócio operado por agentes de IA".
- Nunca inventar fato, número ou citação. Notícia só com fonte aberta e verificada.

## Checklist antes de gravar o rascunho
1. Cabe em uma ideia? 2. Alguém conseguiria copiar o negócio com isso? (se sim, corta) 3. Todo fato tem fonte? 4. Soa como o João falando?

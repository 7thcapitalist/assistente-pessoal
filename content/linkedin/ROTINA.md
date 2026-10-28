# Rotina LinkedIn (seg/qua/sex, de manhã)

Dispara na véspera à noite ou no dia às 7h (Brasília) para o post das 8h30. Passos:
1. Ler novidades do João da semana (comentário nas tarefas / itens do painel). Se houver, usar (abstrato, ver FORMATO.md).
2. Seg e sex: escolher uma lição ainda não usada (ver histórico em `content/linkedin/*.json`, não repetir tema). Qua: buscar notícia de IA da semana, abrir a fonte, conferir fato e data.
3. Escrever seguindo `FORMATO.md`, passar o checklist de confidencialidade, gravar o JSON com `status: draft` na fila do painel.
4. Parar. Aprovação é do João, no painel.

Publicação (Engenheiro do Assistente): `approved` + horário vencido → Composio `linkedin` (conta pessoal). Modo simulado (`published.simulated: true`) enquanto não houver conexão. Falha → `failed` + item "precisa do João".

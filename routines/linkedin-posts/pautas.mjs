// Banco de pautas. Regra do João: só o abstrato. Nada de produto, empresa, cliente, preço, nicho,
// ferramenta do processo nem número copiável (o filtro.mjs barra isso e o teste cobre).
// `interno`: lição abstrata tirada de holding-hq (reports/, STATE.md), sem o detalhe.
// `mundo`: assunto do mundo da IA; exige `link` verificável e a opinião do João. Nunca invente fato.
export const PAUTAS = [
  {
    tema: 'interno',
    title: 'O gargalo não era a IA',
    fonte: 'lição abstrata de studios/software/STATE.md (diagnóstico da fábrica)',
    body: `O gargalo do meu negócio operado por agentes de IA não era a IA. Era a infraestrutura.

Coloquei agentes demais trabalhando ao mesmo tempo na mesma máquina. Tudo ficou lento e coisas começaram a cair.

O que resolveu: limitar o paralelismo e dar prioridade ao que importa.

Antes de adicionar mais um agente, meça a carga.`,
    hashtags: ['#IA', '#Agentes'],
  },
  {
    tema: 'interno',
    title: 'Agente rodando não é agente trabalhando',
    fonte: 'lição abstrata de reports/2026-10-27.md',
    body: `Descobri que alguns dos meus agentes "rodavam" sem fazer trabalho nenhum. O painel dizia que estava tudo certo, mas nada andava.

Lição: "rodando" não é "trabalhando". Hoje toda tarefa só fecha com evidência: teste, link ou entrega verificável.`,
    hashtags: ['#IA', '#Agentes'],
  },
  {
    tema: 'interno',
    title: 'Falha silenciosa é a pior falha',
    fonte: 'lição abstrata de studios/software/STATE.md (diagnóstico, itens 2 e 3)',
    body: `O pior erro que tive operando agentes não foi o que gritou. Foi o que ficou quieto.

Um fluxo falhava e caía em silêncio para um caminho alternativo. Tudo parecia funcionar, mas o resultado saía errado.

Prefiro um erro barulhento a um fallback silencioso. Quem opera agentes precisa de falhas que apareçam.`,
    hashtags: ['#IA'],
  },
  {
    tema: 'interno',
    title: 'Teste verde não é produto bom',
    fonte: 'lição abstrata de studios/roblox/STATE.md (revisão visual reprovada)',
    body: `Os testes automáticos passavam, mas a revisão visual reprovou o resultado: tinha cara de coisa feita por IA.

Teste verde diz que funciona. Não diz que alguém quer usar.

Por isso mantenho uma revisão de qualidade como portão separado, com olho humano.`,
    hashtags: ['#IA', '#Qualidade'],
  },
  {
    tema: 'interno',
    title: 'O que aprendi gerindo agentes',
    fonte: 'lição abstrata de studios/software/STATE.md + reports/2026-10-27.md',
    body: `Três lições de operar um negócio com agentes de IA:

- Meça a carga antes de aumentar o time.
- "Rodando" não é "trabalhando": exija evidência.
- Falha silenciosa é pior que falha barulhenta.

Nenhuma é sobre IA. Todas são de gestão.`,
    hashtags: ['#IA', '#Gestão'],
  },
  {
    tema: 'mundo',
    title: 'Comece simples com agentes',
    link: 'https://www.anthropic.com/engineering/building-effective-agents',
    fonte: 'Anthropic, "Building effective AI agents" (link no post)',
    body: `A Anthropic publicou um guia sobre como construir agentes de IA. A ideia central: comece pelo padrão mais simples e só adicione complexidade quando ela provar valor.

Concordo, e aprendi na prática operando agentes. Cada camada nova é mais um lugar para o erro se esconder.

Leia: https://www.anthropic.com/engineering/building-effective-agents`,
    hashtags: ['#IA', '#Agentes'],
  },
  {
    tema: 'mundo',
    title: 'Padrão aberto para conectar IA a ferramentas',
    link: 'https://www.anthropic.com/news/model-context-protocol',
    fonte: 'Anthropic, anúncio do Model Context Protocol (link no post)',
    body: `O Model Context Protocol é um padrão aberto para conectar assistentes de IA a dados e ferramentas, anunciado pela Anthropic.

Minha opinião: padrão aberto importa mais que o modelo da vez. Quem opera agentes sofre com integração sob medida, e um protocolo comum reduz esse custo.

Detalhes: https://www.anthropic.com/news/model-context-protocol`,
    hashtags: ['#IA', '#MCP'],
  },
];

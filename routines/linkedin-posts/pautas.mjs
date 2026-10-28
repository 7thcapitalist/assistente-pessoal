// Banco de pautas: cada texto só usa fatos tirados de holding-hq (campo `fonte`). Nunca invente número aqui.
// Para novas pautas, leia reports/ e studios/*/STATE.md e cite o arquivo em `fonte`.
export const PAUTAS = [
  {
    tema: 'holding',
    title: 'O gargalo não era a IA, era a máquina',
    fonte: 'studios/software/STATE.md (diagnóstico da fábrica, 2026-10-26)',
    body: `O gargalo da minha holding de agentes não era a IA. Era a máquina.

Rodei 7 agentes ao mesmo tempo num mini PC de 4 núcleos, todos fazendo teste e build. A API parou, o vigia estourou o tempo e o servidor caiu.

O que mudou: agentes com prioridade baixa, teto de memória e no máximo 4 em paralelo.

Antes de contratar mais um agente, meça a carga.`,
    hashtags: ['#IA', '#Agentes'],
  },
  {
    tema: 'frontstep',
    title: 'Frontstep: do lead ao site no ar',
    fonte: 'studios/website/STATE.md (empresa e pipeline)',
    body: `Montei a Frontstep, uma fábrica de sites para pequenos negócios.

O fluxo do lead ao site publicado já rodou de ponta a ponta desde 21/09, e o primeiro contato real com um cliente foi em 30/09. A empresa (MEI) está ativa desde 15/10.

Falta muita coisa, mas agora o processo é um pipeline, não um monte de abas abertas.

studiofrontstep.com`,
    hashtags: ['#Frontstep'],
  },
  {
    tema: 'roblox',
    title: 'Teste verde não é jogo bom',
    fonte: 'studios/roblox/STATE.md (TESTE v120 e revisão visual)',
    body: `Meu jogo de Roblox é feito por agentes. 882 testes de Luau passam.

Mesmo assim, a revisão visual foi reprovada: a interface tinha cara de IA.

Teste verde diz que o código funciona. Não diz que alguém quer jogar. Por isso a revisão visual segue como um portão separado, com olho humano.`,
    hashtags: ['#Roblox', '#IA'],
  },
  {
    tema: 'aprendizado',
    title: 'Agente rodando não é agente trabalhando',
    fonte: 'reports/2026-10-27.md (ciclo 11:00)',
    body: `Esta semana descobri que alguns dos meus agentes "rodavam" em 1 segundo, com 0 tokens. Eram só um script, sem IA. Nada andava e o painel dizia que estava tudo certo.

Lição: "rodando" não é "trabalhando". Hoje toda tarefa só fecha com evidência: teste, PR ou link.`,
    hashtags: ['#IA', '#Agentes'],
  },
  {
    tema: 'holding',
    title: 'Agente não acordava ao receber tarefa',
    fonte: 'studios/software/STATE.md (diagnóstico da fábrica, itens 2 e 3)',
    body: `Dois bugs bobos que travaram minha fábrica de agentes:

1. Passar a tarefa para um agente não o acordava. Precisei chamar o wakeup apontando para a tarefa.
2. Uma aprovação ficou gravada com o autor errado: o script falhava com o identificador e caía em silêncio para outro usuário.

O segundo é o pior. Erro com fallback silencioso é pior que erro que grita.`,
    hashtags: ['#IA'],
  },
  {
    tema: 'frontstep',
    title: 'Volume só sobe com qualidade',
    fonte: 'studios/website/STATE.md (WhatsApp oficial)',
    body: `Na Frontstep conectei um número oficial de WhatsApp e enviei templates de mensagem por nicho para aprovação.

A regra que escrevi antes de disparar: começo com poucos leads e só aumento o volume olhando a avaliação de qualidade do número.

É mais lento, mas número queimado custa mais caro.`,
    hashtags: ['#WhatsApp'],
  },
  {
    tema: 'roblox',
    title: 'Tudo que der pela API, o agente faz',
    fonte: 'studios/roblox/STATE.md (regra do João e TESTE v120)',
    body: `Uma regra que adotei no jogo de Roblox feito por agentes: tudo que puder ser feito pela API, o agente faz pela API. O Studio aberto só entra quando não há outro jeito.

O build de teste atual tem 170 scripts e é publicado sem eu clicar em nada.

Menos clique manual, menos coisa que só eu sei fazer.`,
    hashtags: ['#Roblox'],
  },
  {
    tema: 'aprendizado',
    title: 'O que aprendi gerindo agentes',
    fonte: 'studios/software/STATE.md + reports/2026-10-27.md',
    body: `O que aprendi esta semana gerindo uma holding de agentes de IA:

- Meça a carga da máquina antes de aumentar o time.
- "Rodando" não é "trabalhando": exija evidência.
- Falha silenciosa é pior que falha barulhenta.

Nenhuma dessas lições é sobre IA. Todas são de gestão.`,
    hashtags: ['#IA', '#Gestão'],
  },
];

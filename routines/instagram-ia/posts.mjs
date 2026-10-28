// Calendário de 4 semanas (16 posts) em data/instagram/calendario.json. Sem hashtags.
// Regra de conteúdo do João: nada que revele produto, empresa, cliente, preço, nicho,
// ferramenta do nosso processo ou número que permita copiar o negócio. Só lição abstrata.
// Posts 'noticia' são sobre o mundo da IA: o fato e a fonte (URL) são preenchidos e
// verificados antes de aprovar; publish recusa enquanto houver [campo] ou faltar fonte.
export const SLOTS = [
  { dow: 2, hora: 12, formato: 'carrossel' },
  { dow: 4, hora: 19, formato: 'reel' },
  { dow: 6, hora: 10, formato: 'bastidores' },
  { dow: 0, hora: 20, formato: 'carrossel' },
]

export const POSTS = [
  { pilar: 'bastidores', formato: 'carrossel', title: 'Eu opero empresas com agentes de IA',
    body: 'Eu não uso IA só para escrever texto. Eu montei empresas em que agentes fazem o trabalho.\n\nHoje tenho um negócio que roda prospecção e funil de vendas quase sozinho. Eu aprovo, eles executam.\n\nNesta conta eu conto o que aprendi: o que funciona, o que quebra e como corrijo.\n\nSegue para acompanhar. Salva este post para lembrar do começo.',
    slides: ['Eu opero empresas com agentes de IA', 'Não é prompt bonito: é operação rodando', 'Um negócio com prospecção e vendas rodando por agentes', 'Eu aprovo. Os agentes executam', 'Aqui você vê o que funciona, o que quebra e a correção', 'Segue para acompanhar'],
    arte: 'Fundo escuro, texto grande branco, 1 ideia por slide, sem print de painel nem nome de ferramenta.' },
  { pilar: 'tutorial', formato: 'reel', title: 'Como um agente revisa o código do outro',
    body: 'Um agente escreve o código. Outro, que não viu nada do processo, revisa.\n\nFunciona porque o revisor não tem o viés de quem escreveu.\n\nVeja como isso aparece na tela. Comenta se quer o passo a passo para montar o seu.',
    roteiro: ['0-3s: gancho em texto: "Meu agente não revisa o próprio código"', '3-15s: tela do painel com a tarefa em revisão', '15-30s: comentário do revisor pedindo ajuste e o ajuste feito', '30-40s: fecha com a regra: quem escreve não aprova', 'CTA: comentar "quero o passo a passo"'],
    arte: 'Gravação de tela do painel com zoom no comentário do revisor. Capa: "Agente revisa agente".' },
  { pilar: 'noticia', formato: 'bastidores', title: 'IA da semana: [lançamento]', noticia: true,
    body: 'Saiu esta semana: [fato verificado, uma frase].\n\nMinha leitura: [opinião do João em 2 linhas].\n\nFonte: [URL da fonte].\n\nSalva para comparar com o que vem aí.',
    arte: 'Card simples com o título do fato e a fonte. Preencher [fato], [opinião] e [fonte] com algo real e conferido antes de aprovar; nunca inventar.' },
  { pilar: 'tutorial', formato: 'carrossel', title: '3 regras para agentes não saírem do controle',
    body: 'Regras que eu uso para deixar agentes trabalharem sem eu vigiar:\n\n1. Orçamento antes de qualquer tarefa pesada\n2. Nada é publicado sem meu clique\n3. Quem escreve não aprova\n\nQual dessas você ainda não usa? Comenta.',
    slides: ['3 regras para agentes não saírem do controle', 'Regra 1: checar orçamento antes de começar', 'Regra 2: nada vai ao ar sem aprovação humana', 'Regra 3: quem escreve não é quem aprova', 'Qual você ainda não usa?'],
    arte: 'Mesmo template do primeiro carrossel; número grande em cada slide de regra.' },
  { pilar: 'resultado', formato: 'reel', title: 'O erro que um agente cometeu e como corrigi',
    body: 'Agente erra. O que importa é como o erro aparece e como é corrigido.\n\nNeste vídeo conto o tipo de erro que acontece e a correção, sem mostrar sistema nem cliente.\n\nSegue para ver os próximos, sem edição bonita.',
    roteiro: ['0-3s: gancho: "Meu agente errou e eu mostro o erro"', '3-18s: o erro explicado em texto na tela, sem print de sistema', '18-35s: como foi detectado e corrigido', '35-40s: regra nova que saiu disso', 'CTA: seguir'],
    arte: 'Texto animado, sem gravação de sistema real. Escolher um erro real e abstrair antes de gravar.' },
  { pilar: 'noticia', formato: 'bastidores', title: 'Ferramenta nova de IA: [nome]', noticia: true,
    body: '[Ferramenta ou tendência] chegou. O que muda: [fato verificado].\n\nMinha opinião: [opinião do João].\n\nFonte: [URL da fonte].\n\nComenta se quer que eu teste.',
    arte: 'Card com nome e fonte. Preencher e conferir antes de aprovar; sem fato inventado.' },
  { pilar: 'tutorial', formato: 'carrossel', title: 'Como começar sua primeira empresa com agentes',
    body: 'Se eu começasse hoje, faria assim:\n\n1. Escolha um processo chato e repetitivo\n2. Escreva o passo a passo como para um estagiário\n3. Dê a um agente e revise o resultado\n4. Só depois automatize\n\nSalva para quando for começar.',
    slides: ['Como começar sua primeira empresa com agentes', 'Passo 1: um processo chato e repetitivo', 'Passo 2: escreva como para um estagiário', 'Passo 3: o agente faz, você revisa', 'Passo 4: só então automatize', 'Salva e segue'],
    arte: 'Template dos carrosséis, ícone simples por passo.' },
  { pilar: 'bastidores', formato: 'reel', title: 'Meu painel de aprovação em 30 segundos',
    body: 'Todo post, e-mail e mudança passa por um clique meu. Os agentes preparam, eu decido.\n\nMostro o painel por dentro.\n\nQuer ver como montar o seu? Comenta.',
    roteiro: ['0-3s: gancho: "Nada vai ao ar sem meu clique"', '3-20s: fila de rascunhos pendentes (tela de exemplo, sem dados reais)', '20-30s: clique em aprovar e item sai da fila', '30-35s: por que isso importa', 'CTA: comentar'],
    arte: 'Gravação de tela do painel do assistente, rascunhos de exemplo.' },
]

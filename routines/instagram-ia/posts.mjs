// Calendário de 2 semanas (8 posts). Sem hashtags.
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
    tipoReel: 'imagens',
    slides: ['Meu agente não revisa o próprio código', 'Um agente escreve', 'Outro, que não viu o processo, revisa', 'Sem o viés de quem escreveu', 'Regra: quem escreve não aprova'],
    arte: 'Reel só de texto animado + música, montado pelo assistente. Capa: "Agente revisa agente".' },
  { pilar: 'noticia', formato: 'bastidores', title: 'IA da semana: [lançamento]', noticia: true,
    body: 'Saiu esta semana: [fato verificado, uma frase].\n\nMinha leitura: [opinião do João em 2 linhas].\n\nFonte: [URL da fonte].\n\nSalva para comparar com o que vem aí.',
    arte: 'Card simples com o título do fato e a fonte. Preencher [fato], [opinião] e [fonte] com algo real e conferido antes de aprovar; nunca inventar.' },
  { pilar: 'tutorial', formato: 'carrossel', title: '3 regras para agentes não saírem do controle',
    body: 'Regras que eu uso para deixar agentes trabalharem sem eu vigiar:\n\n1. Orçamento antes de qualquer tarefa pesada\n2. Nada é publicado sem meu clique\n3. Quem escreve não aprova\n\nQual dessas você ainda não usa? Comenta.',
    slides: ['3 regras para agentes não saírem do controle', 'Regra 1: checar orçamento antes de começar', 'Regra 2: nada vai ao ar sem aprovação humana', 'Regra 3: quem escreve não é quem aprova', 'Qual você ainda não usa?'],
    arte: 'Mesmo template do primeiro carrossel; número grande em cada slide de regra.' },
  { pilar: 'resultado', formato: 'reel', title: 'O erro que um agente cometeu e como corrigi',
    body: 'Agente erra. O que importa é como o erro aparece e como é corrigido.\n\nNeste vídeo conto o tipo de erro que acontece e a correção, sem mostrar sistema nem cliente.\n\nSegue para ver os próximos, sem edição bonita.',
    tipoReel: 'roteiro_joao',
    roteiro: ['0-3s: olhando para a câmera: "Meu agente errou e eu vou te mostrar o erro"', '3-18s: explica o tipo de erro, sem mostrar sistema nem cliente', '18-35s: como foi detectado e corrigido', '35-40s: a regra nova que saiu disso', 'CTA: seguir'],
    falas: ['Meu agente errou e eu vou te mostrar o erro', 'O tipo de erro é simples de cometer', 'Eu detectei assim e corrigi assim', 'Daí saiu uma regra nova', 'Segue para ver os próximos'],
    arte: 'João grava no celular, vertical, em um take. O assistente corta silêncios, legenda e põe música. Escolher um erro real e abstrair antes de gravar.' },
  { pilar: 'noticia', formato: 'bastidores', title: 'Ferramenta nova de IA: [nome]', noticia: true,
    body: '[Ferramenta ou tendência] chegou. O que muda: [fato verificado].\n\nMinha opinião: [opinião do João].\n\nFonte: [URL da fonte].\n\nComenta se quer que eu teste.',
    arte: 'Card com nome e fonte. Preencher e conferir antes de aprovar; sem fato inventado.' },
  { pilar: 'tutorial', formato: 'carrossel', title: 'Como começar sua primeira empresa com agentes',
    body: 'Se eu começasse hoje, faria assim:\n\n1. Escolha um processo chato e repetitivo\n2. Escreva o passo a passo como para um estagiário\n3. Dê a um agente e revise o resultado\n4. Só depois automatize\n\nSalva para quando for começar.',
    slides: ['Como começar sua primeira empresa com agentes', 'Passo 1: um processo chato e repetitivo', 'Passo 2: escreva como para um estagiário', 'Passo 3: o agente faz, você revisa', 'Passo 4: só então automatize', 'Salva e segue'],
    arte: 'Template dos carrosséis, ícone simples por passo.' },
  { pilar: 'bastidores', formato: 'reel', title: 'Nada vai ao ar sem o meu clique',
    body: 'Todo post, e-mail e mudança passa por um clique meu. Os agentes preparam, eu decido.\n\nÉ a regra que me deixa dormir tranquilo.\n\nQuer ver como montar a sua? Comenta.',
    tipoReel: 'voz_joao',
    slides: ['Nada vai ao ar sem o meu clique', 'Agentes preparam', 'Eu aprovo', 'Só então publica', 'Por isso eu durmo tranquilo'],
    falas: ['Nada vai ao ar sem o meu clique.', 'Os agentes preparam tudo.', 'Eu só aprovo ou recuso.', 'Só depois disso publica.', 'É a regra que me deixa dormir tranquilo.'],
    arte: 'Cartões de texto montados pelo assistente; o João grava só a narração.' },
]

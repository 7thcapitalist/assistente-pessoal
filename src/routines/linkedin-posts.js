// Rotina "LinkedIn 3x por semana". Quem escreve é o agente Conteúdo e Redes (POST /api/drafts);
// aqui o painel só vigia se a fila da semana está abastecida.
export default {
  id: 'linkedin-posts',
  name: 'LinkedIn — 3 posts por semana',
  description: 'Confere se há rascunhos para os próximos dias; se faltar, avisa no painel.',
  defaults: { enabled: true, time: '08:00', days: [1, 3, 5] },
  async run(ctx) {
    const open = ctx.listDrafts((d) => d.channel === 'linkedin' && ['pending', 'approved'].includes(d.status));
    if (open.length === 0) {
      ctx.ensureNeed({
        routine: 'linkedin-posts', type: 'decidir', title: 'Fila do LinkedIn vazia',
        instruction: 'Não há rascunho de LinkedIn esperando. Conteúdo e Redes precisa gerar os próximos posts (ou me diga um assunto).',
      });
    }
    return `${open.length} rascunho(s) na fila`;
  },
};

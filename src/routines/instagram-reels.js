// Rotina Instagram de IA. Roteiros vêm do agente Conteúdo e Redes; vídeo/áudio vêm do João via upload.
export default {
  id: 'instagram-reels',
  name: 'Instagram IA — Reels',
  description: 'Confere roteiros e material gravado para os próximos Reels.',
  defaults: { enabled: false, time: '18:00', days: [2, 4, 6] },
  async run(ctx) {
    const open = ctx.listDrafts((d) => d.channel === 'instagram' && ['pending', 'approved'].includes(d.status));
    return `${open.length} rascunho(s) na fila`;
  },
};

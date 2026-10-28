// Rotina de exemplo (modelo para copiar). Gera 1 rascunho de teste; não publica nada de verdade.
export default {
  id: 'exemplo',
  name: 'Exemplo: rascunho de teste',
  channel: 'linkedin',
  description: 'Modelo de rotina. Copie esta pasta para criar uma nova.',
  defaultSchedule: '0 8 * * 1,3,5', // seg, qua, sex às 08:00 (America/Sao_Paulo)

  async run(ctx) {
    const n = (ctx.state.get('n') ?? 0) + 1;
    ctx.state.set('n', n);
    ctx.createDraft({
      title: `Post de exemplo #${n}`,
      body: `Texto de exemplo gerado em ${ctx.now.toISOString()}.`,
      meta: { tema: 'exemplo' },
    });
    ctx.log(`gerado rascunho #${n}`);
  },

  // Só é chamado depois de o João clicar em Aprovar.
  async publish(draft, ctx) {
    ctx.log(`(simulado) publicando ${draft.id}`);
    return { url: `https://example.invalid/post/${draft.id}`, externalId: draft.id };
  },
};

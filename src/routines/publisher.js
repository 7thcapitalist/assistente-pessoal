// Publica rascunhos APROVADOS cujo horário venceu. É a única porta de saída do sistema.
import { channels, NotConnected } from '../channels/index.js';

export default {
  id: 'publisher',
  name: 'Publicador',
  description: 'Publica os rascunhos aprovados no horário marcado. Nada sai sem aprovação.',
  defaults: { enabled: true, every_minutes: 5 },
  async run(ctx) {
    const due = ctx.listDrafts((d) => d.status === 'approved'
      && (!d.scheduled_for || Date.parse(d.scheduled_for) <= Date.now()));
    let published = 0;
    for (const d of due) {
      try {
        const { url } = await channels[d.channel].publish(d);
        ctx.markPublished(d.id, url);
        published++;
      } catch (e) {
        if (e instanceof NotConnected) {
          ctx.ensureNeed({
            routine: 'publisher', type: 'conectar', title: `Conectar ${e.channel}`,
            instruction: `Conecte sua conta ${e.channel} (link de conexão do Composio). Sem isso os posts aprovados ficam esperando.`,
          });
        } else ctx.log(`erro publicando ${d.id}: ${e.message}`);
      }
    }
    return `${published} publicado(s), ${due.length - published} esperando`;
  },
};

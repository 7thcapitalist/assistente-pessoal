// Adaptadores de canal. Cada um exporta publish(draft) -> { url }.
// Enquanto a conta não estiver conectada (Composio), lança NotConnected e o
// publicador abre um item "conectar" pro João. Nada é publicado sem status approved.
import * as linkedin from './linkedin.js';
import * as instagram from './instagram.js';

export class NotConnected extends Error {
  constructor(channel, toolkit) {
    super(`${channel} não conectado`);
    this.channel = channel; this.toolkit = toolkit;
  }
}

export const channels = { linkedin, instagram };

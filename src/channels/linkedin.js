import { NotConnected } from './index.js';

export const toolkit = 'linkedin';

// TODO(integração Composio): publicar de verdade. Ver README ("Plugar canal").
export async function publish(_draft) {
  throw new NotConnected('linkedin', toolkit);
}

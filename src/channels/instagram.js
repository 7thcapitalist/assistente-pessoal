import { NotConnected } from './index.js';

export const toolkit = 'instagram';

// TODO(integração Composio): publicar de verdade. Ver README ("Plugar canal").
export async function publish(_draft) {
  throw new NotConnected('instagram', toolkit);
}

// Registro de rotinas. Para plugar uma nova: crie src/routines/<id>.js e liste aqui.
import publisher from './publisher.js';
import linkedinPosts from './linkedin-posts.js';
import instagramReels from './instagram-reels.js';

export const routines = [publisher, linkedinPosts, instagramReels];
export const byId = (id) => routines.find((r) => r.id === id);

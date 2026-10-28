// tick(): roda as rotinas vencidas. Chamado pelo systemd timer (bin/tick.js) a cada 5 min.
import { routines, byId } from './routines/index.js';
import { load, mutate, addLog, now, newId } from './store.js';
import { brt } from './time.js';
import { HttpError } from './drafts.js';

export function routineConfig(state, r) {
  return { ...r.defaults, ...(state.routines[r.id]?.config || {}) };
}

export function isDue(cfg, last, at = new Date()) {
  if (!cfg.enabled) return false;
  const b = brt(at);
  if (cfg.every_minutes) return !last || at - new Date(last.at) >= cfg.every_minutes * 60000 - 30000;
  if (!cfg.days?.includes(b.dow)) return false;
  if (b.time < cfg.time) return false;
  return !last || brt(new Date(last.at)).date !== b.date;
}

export function setRoutineConfig(id, patch) {
  const r = byId(id);
  if (!r) throw new HttpError(404, 'rotina não encontrada');
  return mutate((s) => {
    const cur = s.routines[id] || {};
    const cfg = { ...(cur.config || {}) };
    if (typeof patch.enabled === 'boolean') cfg.enabled = patch.enabled;
    if (patch.time !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.time)) throw new HttpError(400, 'time deve ser HH:MM');
      cfg.time = patch.time;
    }
    if (patch.days !== undefined) {
      if (!Array.isArray(patch.days) || patch.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new HttpError(400, 'days deve ser lista de 0-6');
      cfg.days = [...new Set(patch.days)].sort();
    }
    s.routines[id] = { ...cur, config: cfg };
    addLog(s, `rotina ${id} configurada`, { routine: id });
    return { ...r.defaults, ...cfg };
  });
}

// Contexto que as rotinas recebem: só o necessário, sem acesso direto ao arquivo.
function makeCtx() {
  return {
    listDrafts: (pred) => load().drafts.filter(pred),
    markPublished: (id, url) => mutate((s) => {
      const d = s.drafts.find((x) => x.id === id);
      Object.assign(d, { status: 'published', published_at: now(), published_url: url });
      addLog(s, `publicado: ${d.title}`, { draft: id });
    }),
    ensureNeed: (n) => mutate((s) => {
      if (s.needs.some((x) => x.status === 'open' && x.title === n.title)) return;
      s.needs.unshift({ id: newId('n'), status: 'open', created_at: now(), ...n });
    }),
    log: (msg) => mutate((s) => addLog(s, msg)),
  };
}

export async function tick({ only, force = false, at = new Date() } = {}) {
  const ran = [];
  for (const r of routines) {
    if (only && r.id !== only) continue;
    const state = load();
    const cfg = routineConfig(state, r);
    if (!force && !isDue(cfg, state.routines[r.id]?.last_run, at)) continue;
    let result; let ok = true;
    try { result = await r.run(makeCtx()); } catch (e) { ok = false; result = e.message; }
    mutate((s) => {
      s.routines[r.id] = { ...(s.routines[r.id] || {}), last_run: { at: at.toISOString(), ok, result } };
      if (r.id !== 'publisher' || !ok) addLog(s, `rotina ${r.id}: ${result}`, { routine: r.id });
    });
    ran.push({ id: r.id, ok, result });
  }
  return ran;
}

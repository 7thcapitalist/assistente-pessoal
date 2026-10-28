// Cron de 5 campos (min hora dia-mês mês dia-semana). Aceita *, listas, faixas e passos (*/5, 1-5/2).
const TZ = process.env.ASSISTENTE_TZ || 'America/Sao_Paulo';
const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function field(expr, [lo, hi]) {
  const out = new Set();
  for (const part of expr.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr === undefined ? 1 : Number(stepStr);
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron inválido: ${expr}`);
    let a, b;
    if (range === '*') [a, b] = [lo, hi];
    else if (range.includes('-')) [a, b] = range.split('-').map(Number);
    else { a = Number(range); b = stepStr === undefined ? a : hi; }
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < lo || b > hi || a > b) throw new Error(`cron inválido: ${expr}`);
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron precisa de 5 campos: "${expr}"`);
  const sets = parts.map((p, i) => field(p, RANGES[i]));
  return { sets, domStar: parts[2] === '*', dowStar: parts[4] === '*' };
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function parts(date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return [Number(p.minute), Number(p.hour), Number(p.day), Number(p.month), WD[p.weekday]];
}

export function matches(expr, date) {
  const { sets, domStar, dowStar } = parseCron(expr);
  const [mi, h, d, mo, w] = parts(date);
  if (!sets[0].has(mi) || !sets[1].has(h) || !sets[3].has(mo)) return false;
  const dom = sets[2].has(d), dow = sets[4].has(w);
  return domStar || dowStar ? dom && dow : dom || dow; // semântica do cron clássico
}

// Última marca de agenda em (after, upTo], ou null. Varre minuto a minuto (máx. 8 dias).
export function lastDue(expr, after, upTo) {
  parseCron(expr);
  const start = Math.max(after.getTime(), upTo.getTime() - 8 * 86400e3);
  let t = Math.floor(upTo.getTime() / 60000) * 60000;
  for (; t > start; t -= 60000) if (matches(expr, new Date(t))) return new Date(t);
  return null;
}

// Próxima execução depois de `from` (até 366 dias).
export function nextRun(expr, from = new Date()) {
  parseCron(expr);
  let t = Math.floor(from.getTime() / 60000) * 60000 + 60000;
  for (let i = 0; i < 366 * 1440; i++, t += 60000) if (matches(expr, new Date(t))) return new Date(t);
  return null;
}

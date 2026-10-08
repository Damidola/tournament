// Domain rules are independent of the interface and storage.
export const RESULTS = {
  '1-0': [1, 0], '½-½': [0.5, 0.5], '0-1': [0, 1],
  '+-': [1, 0], '-+': [0, 1], '--': [0, 0]
};
export const TIEBREAKS = {
  bhc1: { name: 'Бухгольц без найгіршого', short: 'БХ−1' },
  bh: { name: 'Бухгольц', short: 'БХ' },
  sb: { name: 'Зоннеборн — Бергер', short: 'ЗБ' },
  wins: { name: 'Перемоги за дошкою', short: 'Перемоги' }
};
export const uid = () => globalThis.crypto.randomUUID();
export const fmt = n => new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(n);
export const clone = x => structuredClone(x);
export const roundCount = n => n % 2 ? n : n - 1;
export const resultPoints = (match, id) => {
  if (match.black === null) return match.byePoints;
  return RESULTS[match.result]?.[match.white === id ? 0 : 1] ?? null;
};
export function createTournament({ name, mode = 'simple', system = 'swiss', rounds = 5, control = '10 + 5', tiebreaks }) {
  return { id: uid(), name: name.trim(), mode, system, plannedRounds: Number(rounds), control,
    tiebreaks: tiebreaks || (system === 'swiss' ? ['bhc1', 'bh', 'sb', 'wins'] : ['sb', 'wins']),
    players: [], rounds: [], status: 'draft', created: new Date().toISOString(), updated: new Date().toISOString() };
}

export function statistics(t, through = t.rounds.length) {
  const rows = t.players.map(p => ({ ...p, points: 0, wins: 0, draws: 0, losses: 0, played: 0,
    bh: 0, bhc1: 0, sb: 0, entries: [], colors: [], byes: 0, opponents: [] }));
  const map = new Map(rows.map(p => [p.id, p]));
  const rounds = t.rounds.slice(0, through);
  for (const round of rounds) for (const m of round.matches) {
    const a = map.get(m.white), b = map.get(m.black);
    if (!b) {
      a.byes++; a.points += m.byePoints;
      if (t.system === 'swiss') a.entries.push({ round: round.number, opponent: null, score: m.byePoints, kind: 'bye' });
      continue;
    }
    a.opponents.push(b.id); b.opponents.push(a.id);
    if (!RESULTS[m.result]) continue;
    const played = ['1-0', '½-½', '0-1'].includes(m.result);
    for (const [p, other, index, color] of [[a, b, 0, 'w'], [b, a, 1, 'b']]) {
      const score = RESULTS[m.result][index]; p.points += score;
      if (played) { p.played++; p.colors.push(color); if (score === 1) p.wins++; else if (score === .5) p.draws++; else p.losses++; }
      p.entries.push({ round: round.number, opponent: other.id, score, kind: played ? 'played' : 'forfeit', vur: !played && score === 0 });
    }
  }
  for (const p of rows) {
    for (const e of p.entries) {
      const opponent = map.get(e.opponent);
      // FIDE tie-break regulations effective 1 March 2026, articles 16.4–16.5.
      // Requested byes and withdrawals are not supported in this version.
      e.contribution = e.kind === 'played' || t.system === 'roundrobin' ? opponent.points :
        e.kind === 'bye' ? Math.min(p.points, t.plannedRounds * .5) : Math.min(p.points, opponent.points);
      e.sbContribution = e.contribution * e.score;
    }
    p.bh = p.entries.reduce((s, e) => s + e.contribution, 0);
    const vur = p.entries.filter(e => e.vur);
    const cut = (vur.length ? vur : p.entries).reduce((min, e) => Math.min(min, e.contribution), Infinity);
    p.bhc1 = p.bh - (Number.isFinite(cut) ? cut : 0);
    p.sb = p.entries.reduce((s, e) => s + e.sbContribution, 0);
  }
  rows.sort((a, b) => b.points - a.points || t.tiebreaks.reduce((d, key) => d || b[key] - a[key], 0) || a.seed - b.seed);
  rows.forEach((p, i) => {
    const prior = rows[i - 1];
    p.rank = prior && prior.points === p.points && t.tiebreaks.every(k => prior[k] === p[k]) ? prior.rank : i + 1;
  });
  return rows;
}

export function roundRobin(t, number) {
  const list = t.players.map(p => p.id);
  if (list.length % 2) list.unshift(null);
  for (let r = 1; r < number; r++) list.splice(1, 0, list.pop());
  const matches = [];
  for (let i = 0; i < list.length / 2; i++) {
    let a = list[i], b = list[list.length - 1 - i];
    if (a === null || b === null) matches.push({ id: uid(), white: a || b, black: null, result: null, byePoints: 0 });
    else {
      if ((i === 0 && number % 2 === 0) || (i > 0 && i % 2 === 1)) [a, b] = [b, a];
      matches.push({ id: uid(), white: a, black: b, result: null });
    }
  }
  return matches;
}

function orientation(a, b, round) {
  function cost(p, color) {
    const balance = p.colors.reduce((s, c) => s + (c === 'w' ? 1 : -1), 0) + (color === 'w' ? 1 : -1);
    return Math.abs(balance) * 4 + (p.colors.at(-1) === color ? 3 : 0) +
      (p.colors.at(-1) === color && p.colors.at(-2) === color ? 30 : 0);
  }
  const ab = cost(a, 'w') + cost(b, 'b'), ba = cost(b, 'w') + cost(a, 'b');
  return ab < ba || (ab === ba && (a.seed + round) % 2 === 0) ? { white: a.id, black: b.id, cost: ab } : { white: b.id, black: a.id, cost: ba };
}

export function swiss(t) {
  const rows = statistics(t), number = t.rounds.length + 1;
  const ordered = [...rows].sort((a, b) => b.points - a.points || a.seed - b.seed);
  const candidates = ordered.length % 2 ? [...ordered].reverse().filter(p => p.byes === 0 && !p.entries.some(e => e.kind === 'forfeit' && e.score === 1)) : [null];
  if (!candidates.length) throw new Error('Не залишилося гравців, яким можна дати вільний тур. Завершіть турнір або оберіть інший формат.');
  for (const bye of candidates) {
    const pool = ordered.filter(p => p !== bye);
    let nodes = 0;
    function solve(remaining) {
      if (!remaining.length) return [];
      if (++nodes > 120000) return null;
      const a = [...remaining].sort((x, y) => remaining.filter(z => z.id !== x.id && !x.opponents.includes(z.id)).length -
        remaining.filter(z => z.id !== y.id && !y.opponents.includes(z.id)).length || pool.indexOf(x) - pool.indexOf(y))[0];
      const options = remaining.filter(b => b !== a && !a.opponents.includes(b.id)).map(b => ({ b, o: orientation(a, b, number) }));
      options.sort((x, y) => Math.abs(a.points - x.b.points) - Math.abs(a.points - y.b.points) || x.o.cost - y.o.cost || x.b.seed - y.b.seed);
      for (const { b, o } of options) {
        const tail = solve(remaining.filter(p => p !== a && p !== b));
        if (tail) return [{ id: uid(), white: o.white, black: o.black, result: null }, ...tail];
      }
      return null;
    }
    const matches = solve(pool);
    if (matches) {
      if (bye) matches.push({ id: uid(), white: bye.id, black: null, result: null, byePoints: 1 });
      return matches;
    }
  }
  throw new Error('За заборони повторних зустрічей пари не складаються. Завершіть турнір: повтори автоматично не додаються.');
}

export function addRound(t) {
  if (t.players.length < 2) throw new Error('Додайте щонайменше двох учасників.');
  if (t.rounds.some(r => !r.closed)) throw new Error('Спочатку завершіть поточний тур.');
  if (t.rounds.length >= t.plannedRounds) throw new Error('Усі заплановані тури вже створено.');
  const matches = t.system === 'roundrobin' ? roundRobin(t, t.rounds.length + 1) : swiss(t);
  t.rounds.push({ number: t.rounds.length + 1, closed: false, matches }); t.status = 'active';
}
export function closeRound(t) {
  const r = t.rounds.at(-1);
  if (!r || r.closed) throw new Error('Немає відкритого туру.');
  if (r.matches.some(m => m.black !== null && !RESULTS[m.result])) throw new Error('Спочатку внесіть результати всіх партій.');
  r.closed = true;
  if (t.rounds.length === t.plannedRounds) t.status = 'finished';
}
export function rollback(t, number) {
  if (!Number.isInteger(number) || number < 1 || number > t.rounds.length) throw new Error('Такого туру немає.');
  t.rounds = t.rounds.slice(0, number); t.rounds.at(-1).closed = false; t.status = 'active';
}
export function setResult(t, round, id, result) {
  const r = t.rounds[round - 1];
  if (!r || r.closed || round !== t.rounds.length) throw new Error('Щоб виправити цей тур, спочатку поверніться до нього.');
  const m = r.matches.find(m => m.id === id);
  if (!m || m.black === null || (result !== null && !Object.hasOwn(RESULTS, result))) throw new Error('Некоректний результат.');
  m.result = result;
}

export function validateTournament(value) {
  const t = clone(value);
  const fail = () => { throw new Error('Файл містить некоректні дані турніру. Імпорт скасовано.'); };
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
  if (!t || typeof t !== 'object' || !validId(t.id) ||
      typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100 || !['simple', 'advanced'].includes(t.mode) ||
      !['swiss', 'roundrobin'].includes(t.system) || !['draft', 'active', 'finished'].includes(t.status) ||
      typeof t.control !== 'string' || t.control.length > 50 || typeof t.created !== 'string' || !Number.isFinite(Date.parse(t.created)) ||
      typeof t.updated !== 'string' || !Number.isFinite(Date.parse(t.updated)) || !Number.isInteger(t.plannedRounds) || t.plannedRounds < 1 || t.plannedRounds > 63 ||
      !Array.isArray(t.players) || t.players.length > 64 || !Array.isArray(t.rounds) || t.rounds.length > t.plannedRounds ||
      !Array.isArray(t.tiebreaks) || t.tiebreaks.length < 1 || t.tiebreaks.some(k => typeof k !== 'string' || !Object.hasOwn(TIEBREAKS, k)) || new Set(t.tiebreaks).size !== t.tiebreaks.length ||
      (t.system === 'roundrobin' && t.tiebreaks.some(k => k === 'bh' || k === 'bhc1'))) fail();
  const ids = new Set(), seeds = new Set();
  for (const p of t.players) {
    if (!p || !validId(p.id) || ids.has(p.id) || typeof p.name !== 'string' ||
        !p.name.trim() || p.name.length > 80 || !Number.isInteger(p.seed) || p.seed < 1 || seeds.has(p.seed) ||
        !Number.isInteger(p.rating) || p.rating < 0 || p.rating > 3500) fail();
    ids.add(p.id); seeds.add(p.seed);
  }
  const pairIds = new Set(), encounters = new Set(), byeRecipients = new Set();
  for (const [i, r] of t.rounds.entries()) {
    if (!r || r.number !== i + 1 || typeof r.closed !== 'boolean' || !Array.isArray(r.matches) ||
        (i < t.rounds.length - 1 && !r.closed)) fail();
    const seen = new Set();
    for (const m of r.matches) {
      if (!m || !validId(m.id) || pairIds.has(m.id) || !ids.has(m.white) || seen.has(m.white) ||
          (m.black !== null && (!ids.has(m.black) || m.black === m.white || seen.has(m.black))) ||
          (m.result !== null && (typeof m.result !== 'string' || !Object.hasOwn(RESULTS, m.result))) || (r.closed && m.black !== null && !Object.hasOwn(RESULTS, m.result))) fail();
      pairIds.add(m.id); seen.add(m.white);
      if (m.black !== null) {
        seen.add(m.black);
        const key = [m.white, m.black].sort().join(':');
        if (encounters.has(key)) fail(); encounters.add(key);
      } else {
        if (m.byePoints !== (t.system === 'swiss' ? 1 : 0) || m.result !== null || byeRecipients.has(m.white)) fail();
        byeRecipients.add(m.white);
      }
    }
    if (seen.size !== ids.size || r.matches.length !== Math.ceil(ids.size / 2)) fail();
  }
  if (t.rounds.length && t.players.length < 2) fail();
  if ((t.status === 'draft') !== (t.rounds.length === 0) ||
      (t.status === 'finished') !== (t.rounds.length === t.plannedRounds && t.rounds.at(-1)?.closed === true)) fail();
  return t;
}

// Tournament rules live here so the UI, imports and tests use the same source
// of truth. The Android application stores each format separately; on the web
// we keep one serialisable model and route format-specific rules through this
// module.

export const RESULTS = {
  '1-0': [1, 0], '½-½': [0.5, 0.5], '0-1': [0, 1],
  '+-': [1, 0], '-+': [0, 1], '--': [0, 0]
};

export const TIEBREAKS = {
  de: { name: 'Пряма зустріч', short: 'ПЗ' },
  bhc1: { name: 'Бухгольц без найгіршого', short: 'БХ−1' },
  bh: { name: 'Бухгольц', short: 'БХ' },
  sb: { name: 'Зоннеборн — Бергер', short: 'ЗБ' },
  wins: { name: 'Перемоги за дошкою', short: 'Перемоги' },
  mp: { name: 'Командні очки', short: 'КО' },
  gp: { name: 'Очки за дошками', short: 'ОД' }
};

export const SYSTEMS = {
  swiss: { label: 'Гнучка швейцарка', min: 4, kind: 'swiss' },
  swissDutch: { label: 'Швейцарка Dutch', min: 4, kind: 'swiss' },
  swissFide: { label: 'Швейцарка FIDE strict', min: 4, kind: 'swiss' },
  roundrobin: { label: 'Коловий турнір', min: 2, kind: 'roundrobin' },
  arena: { label: 'Арена', min: 3, kind: 'arena' },
  knockout: { label: 'На вибування', min: 2, kind: 'knockout' },
  teamSwiss: { label: 'Командна швейцарка', min: 2, kind: 'team' }
};

export const uid = () => globalThis.crypto.randomUUID();
export const fmt = n => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(Number(n) || 0);
export const clone = x => structuredClone(x);
export const isSwissSystem = system => ['swiss', 'swissDutch', 'swissFide'].includes(system);
export const isTeamSystem = system => system === 'teamSwiss';
export const isKnockoutSystem = system => system === 'knockout';
export const isArenaSystem = system => system === 'arena';
export const systemKind = system => SYSTEMS[system]?.kind || (isSwissSystem(system) ? 'swiss' : 'swiss');
export const roundCount = (n, format = 'single') => {
  const oneCycle = Number(n) % 2 ? Number(n) : Number(n) - 1;
  return format === 'double' ? oneCycle * 2 : oneCycle;
};
export const resultPoints = (match, id) => match.black === null ? match.byePoints : RESULTS[match.result]?.[match.white === id ? 0 : 1] ?? null;

const defaultTiebreaks = system => {
  if (system === 'roundrobin') return ['sb', 'wins'];
  if (system === 'teamSwiss') return ['mp', 'gp', 'bh'];
  if (system === 'knockout') return [];
  return ['bhc1', 'bh', 'sb', 'wins'];
};

export function createTournament({
  name, mode = 'simple', system = 'swiss', rounds = 5, control = '10 + 5', tiebreaks,
  roundRobinFormat = 'single', pairingMode, pairingEngine, initialColor = 'random',
  byeScorePolicy = 'WIN', requestedByeScorePolicy = 'DRAW', boardCount = 2,
  knockoutSeeding = 'balanced', transitionMinutes = 0, arenaRounds, ratingCategory = 'standard',
  automaticEloUpdates = true
} = {}) {
  const safeSystem = SYSTEMS[system] ? system : 'swiss';
  const planned = safeSystem === 'roundrobin' ? Math.max(1, roundCount(2, roundRobinFormat)) : Number(rounds);
  return {
    id: uid(), name: String(name || '').trim(), mode, system: safeSystem,
    plannedRounds: safeSystem === 'roundrobin' ? planned : Number.isFinite(planned) ? planned : 5,
    control: String(control || '10 + 5'), tiebreaks: tiebreaks || defaultTiebreaks(safeSystem),
    players: [], teams: [], rounds: [], status: 'draft',
    roundRobinFormat, pairingMode: pairingMode || (safeSystem === 'swissFide' ? 'fide-strict' : safeSystem === 'swissDutch' ? 'dutch' : 'flexible'),
    pairingEngine: pairingEngine || (isSwissSystem(safeSystem) ? 'swiss' : safeSystem),
    initialColor, byeScorePolicy, requestedByeScorePolicy, boardCount: Math.max(1, Number(boardCount) || 2),
    knockoutSeeding, transitionMinutes: Math.max(0, Number(transitionMinutes) || 0),
    arenaRounds: Math.max(1, Number(arenaRounds || rounds || 5)), ratingCategory, automaticEloUpdates: Boolean(automaticEloUpdates),
    audit: [], changeLog: [], created: new Date().toISOString(), updated: new Date().toISOString()
  };
}

function isPlayedResult(result) { return ['1-0', '½-½', '0-1'].includes(result); }
function byeScore(t) { return (t.byeScorePolicy || 'WIN') === 'DRAW' ? 0.5 : 1; }

function emptyPlayerRows(t) {
  return t.players.map(p => ({ ...p, points: 0, wins: 0, draws: 0, losses: 0, played: 0,
    bh: 0, bhc1: 0, sb: 0, de: 0, entries: [], colors: [], byes: 0, opponents: [], eloChange: 0 }));
}

export function playerStatistics(t, through = t.rounds.length) {
  const rows = emptyPlayerRows(t), map = new Map(rows.map(p => [p.id, p]));
  for (const round of t.rounds.slice(0, through)) for (const m of round.matches || []) {
    if (m.boards) {
      for (const board of m.boards) {
        const a = map.get(board.white), b = map.get(board.black);
        if (!a || !b || !RESULTS[board.result]) continue;
        for (const [p, other, side] of [[a, b, 0], [b, a, 1]]) {
          const score = RESULTS[board.result][side]; p.points += score; p.played++;
          if (score === 1) p.wins++; else if (score === .5) p.draws++; else p.losses++;
          p.entries.push({ round: round.number, opponent: other.id, score, kind: isPlayedResult(board.result) ? 'played' : 'forfeit' });
        }
      }
      continue;
    }
    const a = map.get(m.white), b = m.black === null ? null : map.get(m.black);
    if (!a) continue;
    if (!b) {
      a.byes++; if (isSwissSystem(t.system) || isArenaSystem(t.system)) {
        a.points += Number(m.byePoints ?? byeScore(t));
        a.entries.push({ round: round.number, opponent: null, score: Number(m.byePoints ?? byeScore(t)), kind: 'bye' });
      }
      continue;
    }
    a.opponents.push(b.id); b.opponents.push(a.id);
    if (!RESULTS[m.result]) continue;
    for (const [p, other, index, color] of [[a, b, 0, 'w'], [b, a, 1, 'b']]) {
      const score = RESULTS[m.result][index]; p.points += score;
      if (isPlayedResult(m.result)) { p.played++; p.colors.push(color); if (score === 1) p.wins++; else if (score === .5) p.draws++; else p.losses++; }
      p.entries.push({ round: round.number, opponent: other.id, score, kind: isPlayedResult(m.result) ? 'played' : 'forfeit', vur: !isPlayedResult(m.result) && score === 0 });
    }
  }
  for (const p of rows) {
    for (const e of p.entries) {
      const opponent = map.get(e.opponent);
      e.contribution = e.kind === 'played' || t.system === 'roundrobin' ? (opponent?.points || 0) :
        e.kind === 'bye' ? Math.min(p.points, Number(t.plannedRounds || 0) * .5) : Math.min(p.points, opponent?.points || 0);
      e.sbContribution = e.contribution * e.score;
    }
    p.bh = p.entries.reduce((s, e) => s + e.contribution, 0);
    const voluntary = p.entries.filter(e => e.vur);
    const cut = (voluntary.length ? voluntary : p.entries).reduce((min, e) => Math.min(min, e.contribution), Infinity);
    p.bhc1 = p.bh - (Number.isFinite(cut) ? cut : 0);
    p.sb = p.entries.reduce((s, e) => s + e.sbContribution, 0);
  }
  return rows;
}

export function teamStatistics(t, through = t.rounds.length) {
  const rows = (t.teams || []).map(team => ({ ...team, points: 0, matchPoints: 0, gamePoints: 0, bh: 0, bhc1: 0, sb: 0, wins: 0, draws: 0, losses: 0, played: 0, entries: [], opponents: [] }));
  const map = new Map(rows.map(p => [p.id, p]));
  for (const round of t.rounds.slice(0, through)) for (const m of round.matches || []) {
    const a = map.get(m.white), b = m.black === null ? null : map.get(m.black); if (!a) continue;
    if (!b) { a.matchPoints += Number(m.byePoints || 0); a.points = a.matchPoints; continue; }
    a.opponents.push(b.id); b.opponents.push(a.id);
    const boardScores = (m.boards || []).reduce((acc, board) => { const s = RESULTS[board.result]; if (s) { acc[0] += s[0]; acc[1] += s[1]; } return acc; }, [0, 0]);
    const gpA = Number(m.whiteGamePoints ?? boardScores[0]), gpB = Number(m.blackGamePoints ?? boardScores[1]);
    const mpA = Number(m.whiteMatchPoints ?? (gpA > gpB ? 2 : gpA === gpB ? 1 : 0)), mpB = Number(m.blackMatchPoints ?? (gpB > gpA ? 2 : gpB === gpA ? 1 : 0));
    a.matchPoints += mpA; b.matchPoints += mpB; a.gamePoints += gpA; b.gamePoints += gpB;
    a.points = a.matchPoints; b.points = b.matchPoints; a.played++; b.played++;
    if (mpA === 2) a.wins++; else if (mpA === 1) a.draws++; else a.losses++;
    if (mpB === 2) b.wins++; else if (mpB === 1) b.draws++; else b.losses++;
    a.entries.push({ round: round.number, opponent: b.id, score: mpA }); b.entries.push({ round: round.number, opponent: a.id, score: mpB });
  }
  for (const p of rows) { p.mp = p.matchPoints; p.gp = p.gamePoints; p.bh = p.entries.reduce((s, e) => s + (map.get(e.opponent)?.matchPoints || 0), 0); p.bhc1 = p.bh; p.sb = p.entries.reduce((s, e) => s + (map.get(e.opponent)?.matchPoints || 0) * e.score, 0); }
  rows.sort((a, b) => b.points - a.points || b.gamePoints - a.gamePoints || b.bh - a.bh || a.seed - b.seed);
  rows.forEach((p, i) => { const prev = rows[i - 1]; p.rank = prev && prev.points === p.points && prev.gamePoints === p.gamePoints && prev.bh === p.bh ? prev.rank : i + 1; });
  return rows;
}

export function statistics(t, through = t.rounds.length) {
  if (isTeamSystem(t.system)) return teamStatistics(t, through);
  const rows = playerStatistics(t, through), direct = new Map();
  for (const p of rows) for (const e of p.entries) if (e.opponent) direct.set(`${p.id}:${e.opponent}`, e.score);
  for (const p of rows) p.de = rows.filter(q => q.id !== p.id && q.points === p.points).reduce((sum, q) => sum + (direct.get(`${p.id}:${q.id}`) || 0), 0);
  rows.sort((a, b) => b.points - a.points || (t.tiebreaks || []).reduce((d, key) => d || ((b[key] || 0) - (a[key] || 0)), 0) ||
    ((t.tiebreaks || []).includes('de') ? ((direct.get(`${b.id}:${a.id}`) || 0) - (direct.get(`${a.id}:${b.id}`) || 0)) : 0) || a.seed - b.seed);
  rows.forEach((p, i) => { const prior = rows[i - 1]; p.rank = prior && prior.points === p.points && (t.tiebreaks || []).every(k => (prior[k] || 0) === (p[k] || 0)) ? prior.rank : i + 1; });
  return rows;
}

export function roundRobin(t, number) {
  const total = roundCount(t.players.length, t.roundRobinFormat || 'single'); if (number < 1 || number > total) throw new Error('Такого туру немає.');
  const cycleLength = Math.max(1, roundCount(t.players.length)), cycle = Math.ceil(number / cycleLength), baseNumber = ((number - 1) % cycleLength) + 1;
  const list = t.players.map(p => p.id); if (list.length % 2) list.unshift(null);
  for (let r = 1; r < baseNumber; r++) list.splice(1, 0, list.pop());
  const matches = [];
  for (let i = 0; i < list.length / 2; i++) {
    let a = list[i], b = list[list.length - 1 - i];
    if (a === null || b === null) matches.push({ id: uid(), white: a || b, black: null, result: null, byePoints: 0, rest: true });
    else { if ((i === 0 && baseNumber % 2 === 0) || (i > 0 && i % 2 === 1)) [a, b] = [b, a]; if (cycle === 2) [a, b] = [b, a]; matches.push({ id: uid(), white: a, black: b, result: null }); }
  }
  return matches;
}

function orientation(a, b, round) {
  const cost = (p, color) => { const balance = p.colors.reduce((s, c) => s + (c === 'w' ? 1 : -1), 0) + (color === 'w' ? 1 : -1); return Math.abs(balance) * 4 + (p.colors.at(-1) === color ? 3 : 0) + (p.colors.at(-1) === color && p.colors.at(-2) === color ? 30 : 0); };
  const ab = cost(a, 'w') + cost(b, 'b'), ba = cost(b, 'w') + cost(a, 'b');
  return ab < ba || (ab === ba && (a.seed + round) % 2 === 0) ? { white: a.id, black: b.id, cost: ab } : { white: b.id, black: a.id, cost: ba };
}

function pairSwiss(t, rows, allowRepeats = false) {
  const number = t.rounds.length + 1, ordered = [...rows].sort((a, b) => b.points - a.points || a.seed - b.seed);
  const candidates = ordered.length % 2 ? [...ordered].reverse().filter(p => p.byes === 0 && !p.entries.some(e => e.kind === 'forfeit' && e.score === 1)) : [null];
  if (!candidates.length) throw new Error('Не залишилося гравців для вільного туру.');
  for (const bye of candidates) {
    const pool = ordered.filter(p => p !== bye); let nodes = 0;
    function solve(remaining) {
      if (!remaining.length) return []; if (++nodes > 120000) return null;
      const a = [...remaining].sort((x, y) => { const px = remaining.filter(z => z.id !== x.id && (allowRepeats || !x.opponents.includes(z.id))).length; const py = remaining.filter(z => z.id !== y.id && (allowRepeats || !y.opponents.includes(z.id))).length; return px - py || pool.indexOf(x) - pool.indexOf(y); })[0];
      const options = remaining.filter(b => b !== a && (allowRepeats || !a.opponents.includes(b.id))).map(b => ({ b, o: orientation(a, b, number) }));
      options.sort((x, y) => Math.abs(a.points - x.b.points) - Math.abs(a.points - y.b.points) || x.o.cost - y.o.cost || x.b.seed - y.b.seed);
      for (const { b, o } of options) { const tail = solve(remaining.filter(p => p !== a && p !== b)); if (tail) return [{ id: uid(), white: o.white, black: o.black, result: null }, ...tail]; }
      return null;
    }
    const matches = solve(pool); if (matches) { if (bye) matches.push({ id: uid(), white: bye.id, black: null, result: null, byePoints: byeScore(t), requested: false }); return matches; }
  }
  throw new Error('За заборони повторних зустрічей пари не складаються. Відкрийте ручне втручання і перевірте жеребкування.');
}

export function swiss(t) {
  const rows=playerStatistics(t);
  try { return pairSwiss(t, rows, false); }
  catch(error) { if(t.system==='swiss' && t.pairingMode==='flexible') return pairSwiss(t, rows, true); throw error; }
}

function arenaPairings(t) {
  const rows = playerStatistics(t), number = t.rounds.length + 1, ordered = [...rows].sort((a, b) => b.points - a.points || a.seed - b.seed), used = new Set(), matches = [];
  for (const a of ordered) {
    if (used.has(a.id)) continue;
    const candidates = ordered.filter(b => b.id !== a.id && !used.has(b.id)).sort((x, y) => (a.opponents.includes(x.id) ? 1 : 0) - (a.opponents.includes(y.id) ? 1 : 0) || Math.abs(a.points - x.points) - Math.abs(a.points - y.points) || x.seed - y.seed);
    const b = candidates[0];
    if (!b) { used.add(a.id); matches.push({ id: uid(), white: a.id, black: null, result: null, byePoints: byeScore(t), arenaBye: true }); }
    else { used.add(a.id); used.add(b.id); const o = orientation(a, b, number); matches.push({ id: uid(), white: o.white, black: o.black, result: null, arena: true }); }
  }
  return matches;
}

function teamPairings(t) {
  const rows = teamStatistics(t), ordered = [...rows].sort((a, b) => b.points - a.points || b.gamePoints - a.gamePoints || a.seed - b.seed), used = new Set(), matches = [], round = t.rounds.length + 1;
  for (const a of ordered) {
    if (used.has(a.id)) continue;
    const b = ordered.find(x => x.id !== a.id && !used.has(x.id) && !a.opponents.includes(x.id));
    if (!b) { used.add(a.id); matches.push({ id: uid(), white: a.id, black: null, result: null, byePoints: 0, teamMatch: true }); continue; }
    used.add(a.id); used.add(b.id); const white = (a.seed + round) % 2 ? a : b, black = white === a ? b : a;
    const aw = (t.teams || []).find(x => x.id === white.id), ab = (t.teams || []).find(x => x.id === black.id);
    const boards = Array.from({ length: Math.max(1, t.boardCount || 2) }, (_, i) => ({ white: aw?.players?.[i] || null, black: ab?.players?.[i] || null, result: null }));
    matches.push({ id: uid(), white: white.id, black: black.id, result: null, teamMatch: true, boards, whiteGamePoints: 0, blackGamePoints: 0, whiteMatchPoints: 0, blackMatchPoints: 0 });
  }
  return matches;
}

function knockoutPhase(size) { if (size === 2) return 'Фінал'; if (size === 4) return 'Півфінал'; if (size === 8) return 'Чвертьфінал'; return `1/${size}`; }
function knockoutPairings(t) {
  const round = t.rounds.length + 1;
  if (round === 1) {
    const size = 2 ** Math.ceil(Math.log2(Math.max(2, t.players.length))), seeded = [...t.players].sort((a, b) => t.knockoutSeeding === 'random' ? Math.random() - .5 : b.rating - a.rating || a.seed - b.seed), slots = [...seeded, ...Array(size - seeded.length).fill(null)];
    return Array.from({ length: size / 2 }, (_, i) => { const white = slots[i], black = slots[size - 1 - i]; if (!white || !black) { const p = white || black; return { id: uid(), white: p?.id || null, black: null, result: null, winner: p?.id || null, bye: true, phase: knockoutPhase(size) }; } return { id: uid(), white: white.id, black: black.id, result: null, winner: null, tieBreakMode: 'MANUAL', phase: knockoutPhase(size) }; });
  }
  const previous = t.rounds.at(-1), winners = previous.matches.map(m => m.winner).filter(Boolean), size = winners.length * 2, phase = knockoutPhase(size);
  return Array.from({ length: Math.ceil(winners.length / 2) }, (_, i) => { const white = winners[i * 2], black = winners[i * 2 + 1]; return black ? { id: uid(), white, black, result: null, winner: null, tieBreakMode: 'MANUAL', phase } : { id: uid(), white, black: null, result: null, winner: white, bye: true, phase }; });
}

export function addRound(t) {
  if (isKnockoutSystem(t.system)) { if (t.rounds.some(r => !r.closed)) throw new Error('Спочатку завершіть поточний етап.'); const matches = knockoutPairings(t); t.rounds.push({ number: t.rounds.length + 1, closed: false, matches, phase: matches[0]?.phase || 'Фінал' }); t.status = 'active'; return; }
  if (t.players.length < 2 && !isTeamSystem(t.system)) throw new Error('Додайте щонайменше двох учасників.');
  if (isTeamSystem(t.system) && (t.teams || []).length < 2) throw new Error('Додайте щонайменше дві команди.');
  if (t.rounds.some(r => !r.closed)) throw new Error('Спочатку завершіть поточний тур.');
  const limit = isArenaSystem(t.system) ? Number(t.arenaRounds || t.plannedRounds) : t.plannedRounds; if (t.rounds.length >= limit) throw new Error('Усі заплановані тури вже створено.');
  const matches = t.system === 'roundrobin' ? roundRobin(t, t.rounds.length + 1) : isTeamSystem(t.system) ? teamPairings(t) : isArenaSystem(t.system) ? arenaPairings(t) : swiss(t);
  t.rounds.push({ number: t.rounds.length + 1, closed: false, matches, phase: isArenaSystem(t.system) ? 'Arena' : undefined }); t.status = 'active'; t.audit ||= []; t.audit.push({ round: t.rounds.length, at: new Date().toISOString(), pairings: clone(matches), diagnostics: 'Автоматична жеребкування' });
}

export function setBoardResult(t, round, matchId, boardIndex, result) {
  const r = t.rounds[round - 1]; if (!r || r.closed || round !== t.rounds.length) throw new Error('Щоб виправити цей тур, спочатку поверніться до нього.');
  const m = r.matches.find(x => x.id === matchId); if (!m?.boards?.[boardIndex] || (result !== null && !Object.hasOwn(RESULTS, result))) throw new Error('Некоректний результат.'); m.boards[boardIndex].result = result;
  const sums = m.boards.reduce((a, b) => { const s = RESULTS[b.result]; if (s) { a[0] += s[0]; a[1] += s[1]; } return a; }, [0, 0]); m.whiteGamePoints = sums[0]; m.blackGamePoints = sums[1]; m.result = m.boards.every(b => RESULTS[b.result]) ? (sums[0] > sums[1] ? '1-0' : sums[1] > sums[0] ? '0-1' : '½-½') : null;
  if (m.result) { m.whiteMatchPoints = sums[0] > sums[1] ? 2 : sums[0] === sums[1] ? 1 : 0; m.blackMatchPoints = sums[1] > sums[0] ? 2 : sums[0] === sums[1] ? 1 : 0; }
}

export function setKnockoutWinner(t, round, matchId, winnerId, reason = 'manual') {
  const r = t.rounds[round - 1]; if (!r || r.closed || round !== t.rounds.length) throw new Error('Цей етап уже закрито.'); const m = r.matches.find(x => x.id === matchId); if (!m || ![m.white, m.black].includes(winnerId)) throw new Error('Переможець має бути учасником цієї пари.'); m.winner = winnerId; m.tieBreakMode = reason;
}

function updateElo(t, round) {
  if (t.mode === 'simple' || t.automaticEloUpdates === false) return;
  const players = new Map((t.players || []).map(p => [p.id, p]));
  const game = (whiteId, blackId, result) => {
    const white = players.get(whiteId), black = players.get(blackId); if (!white || !black || !isPlayedResult(result)) return;
    const rw = Number(white.rating || 0), rb = Number(black.rating || 0), expected = 1 / (1 + 10 ** ((rb - rw) / 400)), score = result === '1-0' ? 1 : result === '0-1' ? 0 : .5;
    const k = Number(white.fideKFactor || t.fideKFactor || 20), kb = Number(black.fideKFactor || t.fideKFactor || 20);
    white.rating = Math.max(0, Math.min(3500, Math.round(rw + k * (score - expected))));
    black.rating = Math.max(0, Math.min(3500, Math.round(rb + kb * ((1 - score) - (1 - expected)))));
    white.eloHistory ||= []; black.eloHistory ||= []; white.eloHistory.push({ round: round.number, before: rw, after: white.rating }); black.eloHistory.push({ round: round.number, before: rb, after: black.rating });
  };
  for (const m of round.matches || []) { if (m.boards) for (const b of m.boards) game(b.white, b.black, b.result); else if (m.black !== null) game(m.white, m.black, m.result); }
}

export function closeRound(t) {
  const r = t.rounds.at(-1); if (!r || r.closed) throw new Error('Немає відкритого туру.');
  if (isKnockoutSystem(t.system)) { for (const m of r.matches) { if (m.bye) continue; if (!m.winner) { if (m.result === '½-½') throw new Error('Для нічиєї оберіть переможця тай-брейку.'); if (!isPlayedResult(m.result)) throw new Error('Вкажіть результат і переможця.'); m.winner = m.result === '1-0' ? m.white : m.result === '0-1' ? m.black : null; } if (!m.winner) throw new Error('Вкажіть переможця кожної партії.'); } }
  else if (isTeamSystem(t.system)) { for (const m of r.matches) if (m.black !== null && (!m.boards?.length || m.boards.some(b => !RESULTS[b.result]))) throw new Error('Внесіть результати всіх дошок.'); }
  else if (r.matches.some(m => m.black !== null && !RESULTS[m.result])) throw new Error('Спочатку внесіть результати всіх партій.');
  r.closed = true; updateElo(t, r); const limit = isArenaSystem(t.system) ? Number(t.arenaRounds || t.plannedRounds) : t.plannedRounds; if (t.rounds.length >= limit || isKnockoutSystem(t.system) && r.matches.length === 1) t.status = 'finished';
}

export function rollback(t, number) { if (!Number.isInteger(number) || number < 1 || number > t.rounds.length) throw new Error('Такого туру немає.'); t.rounds = t.rounds.slice(0, number); t.rounds.at(-1).closed = false; t.status = 'active'; if (t.audit) t.audit = t.audit.filter(a => a.round <= number); }

export function setResult(t, round, id, result) {
  const r = t.rounds[round - 1]; if (!r || r.closed || round !== t.rounds.length) throw new Error('Щоб виправити цей тур, спочатку поверніться до нього.'); const m = r.matches.find(x => x.id === id); if (!m || m.black === null || (result !== null && !Object.hasOwn(RESULTS, result))) throw new Error('Некоректний результат.'); m.result = result; if (isKnockoutSystem(t.system) && result && result !== '½-½') m.winner = result === '1-0' ? m.white : m.black;
}

function normaliseForValidation(t) {
  t.teams ||= []; t.audit ||= []; t.changeLog ||= []; t.roundRobinFormat ||= 'single'; t.pairingMode ||= isSwissSystem(t.system) ? 'flexible' : t.system; t.pairingEngine ||= t.system; t.initialColor ||= 'random'; t.byeScorePolicy ||= 'WIN'; t.requestedByeScorePolicy ||= 'DRAW'; t.boardCount = Math.max(1, Number(t.boardCount || 2)); t.knockoutSeeding ||= 'balanced'; t.automaticEloUpdates = t.automaticEloUpdates !== false; return t;
}

export function validateTournament(value) {
  const t = normaliseForValidation(clone(value)); const fail = () => { throw new Error('Файл містить некоректні дані турніру. Імпорт скасовано.'); }; const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
  if (!t || typeof t !== 'object' || !validId(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100 || !['simple', 'advanced', 'professional'].includes(t.mode) || !Object.hasOwn(SYSTEMS, t.system) || !['draft', 'active', 'finished'].includes(t.status) || typeof t.control !== 'string' || t.control.length > 80 || typeof t.created !== 'string' || !Number.isFinite(Date.parse(t.created)) || typeof t.updated !== 'string' || !Number.isFinite(Date.parse(t.updated)) || !Number.isInteger(t.plannedRounds) || t.plannedRounds < 1 || t.plannedRounds > 255 || !Array.isArray(t.players) || t.players.length > 128 || !Array.isArray(t.rounds) || t.rounds.length > t.plannedRounds + 64 || !Array.isArray(t.tiebreaks) || t.tiebreaks.some(k => typeof k !== 'string' || !Object.hasOwn(TIEBREAKS, k)) || new Set(t.tiebreaks).size !== t.tiebreaks.length || (t.system === 'roundrobin' && t.tiebreaks.some(k => ['bh', 'bhc1'].includes(k)))) fail();
  const ids = new Set(), seeds = new Set(); for (const p of t.players) { if (!p || !validId(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || !Number.isInteger(p.seed) || p.seed < 1 || seeds.has(p.seed) || !Number.isInteger(Number(p.rating ?? 0)) || Number(p.rating ?? 0) < 0 || Number(p.rating ?? 0) > 3500) fail(); ids.add(p.id); seeds.add(p.seed); }
  const teamIds = new Set(); for (const team of t.teams) { if (!team || !validId(team.id) || teamIds.has(team.id) || typeof team.name !== 'string' || !team.name.trim() || !Number.isInteger(team.seed) || team.seed < 1 || !Array.isArray(team.players)) fail(); teamIds.add(team.id); for (const id of team.players) if (!ids.has(id)) fail(); } if (isTeamSystem(t.system) && t.teams.length > 64) fail();
  const pairIds = new Set(), encounters = new Set(), byeRecipients = new Set();
  for (const [i, r] of t.rounds.entries()) {
    if (!r || r.number !== i + 1 || typeof r.closed !== 'boolean' || !Array.isArray(r.matches) || (i < t.rounds.length - 1 && !r.closed)) fail(); const seen = new Set();
    for (const m of r.matches) {
      if (!m || !validId(m.id) || pairIds.has(m.id)) fail(); pairIds.add(m.id); const participants = isTeamSystem(t.system) ? teamIds : ids; if (!participants.has(m.white) || seen.has(m.white)) fail(); seen.add(m.white);
      if (m.black !== null && m.black !== undefined && (!participants.has(m.black) || m.black === m.white || seen.has(m.black))) fail(); if (m.black !== null && m.black !== undefined) seen.add(m.black); if (m.result !== null && m.result !== undefined && (typeof m.result !== 'string' || !Object.hasOwn(RESULTS, m.result))) fail();
      if (isTeamSystem(t.system) && m.black !== null && (!Array.isArray(m.boards) || m.boards.length !== t.boardCount)) fail(); if (isTeamSystem(t.system) && m.boards) for (const b of m.boards) if ((b.white !== null && !ids.has(b.white)) || (b.black !== null && !ids.has(b.black)) || (b.result !== null && !Object.hasOwn(RESULTS, b.result))) fail();
      if (m.black === null || m.black === undefined) { if (!isKnockoutSystem(t.system) && m.byePoints !== (isSwissSystem(t.system) || isArenaSystem(t.system) ? Number(m.byePoints) : 0)) fail(); if ((isSwissSystem(t.system) || t.system === 'roundrobin') && byeRecipients.has(m.white)) fail(); if (t.system !== 'knockout') byeRecipients.add(m.white); if (isKnockoutSystem(t.system) && m.winner && m.winner !== m.white) fail(); }
      else { const key = [m.white, m.black].sort().join(':'); const repeatsAllowed = isArenaSystem(t.system) || (t.system === 'roundrobin' && t.roundRobinFormat === 'double') || (t.system === 'swiss' && t.pairingMode === 'flexible'); if (!repeatsAllowed && encounters.has(key)) fail(); encounters.add(key); if (isKnockoutSystem(t.system) && m.winner && ![m.white, m.black].includes(m.winner)) fail(); }
    }
    if (!isKnockoutSystem(t.system) && seen.size !== (isTeamSystem(t.system) ? teamIds.size : ids.size)) fail();
  }
  if (t.rounds.length && ((isTeamSystem(t.system) && t.teams.length < 2) || (!isTeamSystem(t.system) && t.players.length < 2))) fail(); if ((t.status === 'draft') !== (t.rounds.length === 0)) fail(); if (t.status === 'finished' && t.rounds.length && !t.rounds.at(-1).closed) fail(); return t;
}

import { calculate as recoveredCalculate } from './apk-core.js';

// Tournament rules live here so the UI, imports and tests use the same source
// of truth. The Android application stores each format separately; on the web
// we keep one serialisable model and route format-specific rules through this
// module.

export const RESULTS = {
  '1-0': [1, 0], '½-½': [0.5, 0.5], '0-1': [0, 1],
  '+-': [1, 0], '-+': [0, 1], '--': [0, 0], 'F½-F½': [0.5, 0.5]
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
  if (system === 'roundrobin') return ['sb'];
  if (system === 'teamSwiss') return ['mp', 'gp', 'bh'];
  if (system === 'knockout') return [];
  if (system === 'arena') return ['bh', 'bhc1', 'wins'];
  return ['bh', 'bhc1', 'sb', 'wins', 'de'];
};

export function createTournament({
  name, mode = 'simple', system = 'swiss', rounds = 5, control = '10 + 5', tiebreaks,
  roundRobinFormat = 'single', pairingMode, pairingEngine, initialColor = 'random',
  byeScorePolicy = 'WIN', requestedByeScorePolicy = 'DRAW', boardCount = 2,
  knockoutSeeding = 'balanced', transitionMinutes = 0, arenaRounds, ratingCategory = 'standard',
  automaticEloUpdates = true, knockoutThirdPlace = false
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
    knockoutSeeding, knockoutThirdPlace:knockoutThirdPlace===true||knockoutThirdPlace==='true', transitionMinutes: Math.max(0, Number(transitionMinutes) || 0),
    arenaRounds: Math.max(1, Number(arenaRounds || rounds || 5)), ratingCategory, automaticEloUpdates: Boolean(automaticEloUpdates),
    audit: [], changeLog: [], created: new Date().toISOString(), updated: new Date().toISOString()
  };
}

function isPlayedResult(result) { return ['1-0', '½-½', '0-1'].includes(result); }
function byeScore(t) { return (t.byeScorePolicy || 'WIN') === 'DRAW' ? 0.5 : 1; }

function emptyPlayerRows(t) {
  return t.players.map(p => ({ ...p, points: Number(p.startingPoints || 0), wins: 0, draws: 0, losses: 0, played: 0,
    bh: 0, bhc1: 0, sb: 0, de: 0, entries: [], colors: [], floats: Array(t.rounds.length).fill(null), byes: 0, opponents: [], eloChange: 0 }));
}

export function playerStatistics(t, through = t.rounds.length) {
  const rows = emptyPlayerRows(t), map = new Map(rows.map(p => [p.id, p]));
  for (const round of t.rounds.slice(0, through)) for (const m of round.matches || []) {
    if (m.boards) {
      for (const board of m.boards) {
        const a = map.get(board.white), b = map.get(board.black);
        if (!a || !b || !RESULTS[board.result]) continue;
        for (const [p, other, side] of [[a, b, 0], [b, a, 1]]) {
          const score = RESULTS[board.result][side]; p.points += score;
          if(isPlayedResult(board.result)){p.played++;if (score === 1) p.wins++; else if (score === .5) p.draws++; else p.losses++;}
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
        const score=Number(m.byePoints ?? byeScore(t));
        a.entries.push({ round: round.number, opponent: null, score, kind: 'bye', requested: Boolean(m.requested), vur: Boolean(m.requested) && score < 1 });
        if(score>0) a.floats[round.number-1]='DOWN';
      }
      continue;
    }
    if (!RESULTS[m.result]) continue;
    const beforeA=a.points, beforeB=b.points;
    if(isPlayedResult(m.result)) {
      a.opponents.push(b.id); b.opponents.push(a.id);
      a.floats[round.number-1]=beforeA<beforeB?'UP':beforeA>beforeB?'DOWN':null;
      b.floats[round.number-1]=beforeB<beforeA?'UP':beforeB>beforeA?'DOWN':null;
    }
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
  if (isSwissSystem(t.system) && rows.length && t.plannedRounds > 0) {
    const calculated=originalCore({operation:'tieBreaks',totalRounds:Math.max(t.plannedRounds,through),players:rows.map(p=>({id:p.id,points:p.points,entries:p.entries.map(e=>({round:e.round,score:e.score,opponent:e.opponent,type:e.kind==='played'?'PLAYED':e.kind==='bye'?(e.requested&&e.score<1?'REQUESTED_BYE':'PAIRING_ALLOCATED_OR_FULL_POINT_BYE'):e.score===.5?'FORFEIT_DRAW_TOURNAMENT_RULE':e.score===1?'FORFEIT_WIN':'FORFEIT_LOSS'}))}))});
    for(const p of rows){const x=calculated[p.id];p.bh=x.bh;p.bhc1=x.bhc1;p.sb=x.sb;p.adjusted=x.adjusted;for(const e of p.entries){const c=x.entries.find(v=>v.round===e.round);e.contribution=c.contribution;e.sbContribution=c.contribution*e.score;e.vur=c.voluntary;}}
  }
  return rows;
}

export function originalCore(request) {
  const result=JSON.parse(recoveredCalculate(JSON.stringify(request)));
  if(result.error) throw new Error(`Двигун APK: ${result.error}`);
  return result;
}

export function teamStatistics(t, through = t.rounds.length) {
  const rows = (t.teams || []).map(team => ({ ...team, points: 0, matchPoints: 0, gamePoints: 0, bh: 0, bhc1: 0, sb: 0, wins: 0, draws: 0, losses: 0, played: 0, byes:0,colors:[],entries: [], opponents: [] }));
  const map = new Map(rows.map(p => [p.id, p]));
  for (const round of t.rounds.slice(0, through)) for (const m of round.matches || []) {
    const a = map.get(m.white), b = m.black === null ? null : map.get(m.black); if (!a) continue;
    if (!b) { a.matchPoints += Number(m.byePoints || 0);a.gamePoints+=Number(m.byeGamePoints||0);a.byes++; a.points = a.matchPoints; continue; }
    const boardScores = (m.boards || []).reduce((acc, board) => { const s = RESULTS[board.result],reverse=board.whiteTeam===m.black; if (s) { acc[0] += s[reverse?1:0]; acc[1] += s[reverse?0:1]; } return acc; }, [0, 0]);
    const gpA = boardScores[0], gpB = boardScores[1];
    const complete=m.boards?.every(b=>RESULTS[b.result]);const mpA = complete?(gpA > gpB ? 2 : gpA === gpB ? 1 : 0):0, mpB = complete?(gpB > gpA ? 2 : gpB === gpA ? 1 : 0):0;
    a.matchPoints += mpA; b.matchPoints += mpB; a.gamePoints += gpA; b.gamePoints += gpB;
    a.points = a.matchPoints; b.points = b.matchPoints;if(!complete)continue;a.played++;b.played++;a.colors.push('w');b.colors.push('b');a.opponents.push(b.id);b.opponents.push(a.id);
    if (mpA === 2) a.wins++; else if (mpA === 1) a.draws++; else a.losses++;
    if (mpB === 2) b.wins++; else if (mpB === 1) b.draws++; else b.losses++;
    a.entries.push({ round: round.number, opponent: b.id, score: mpA }); b.entries.push({ round: round.number, opponent: a.id, score: mpB });
  }
  for (const p of rows) { p.mp = p.matchPoints; p.gp = p.gamePoints; p.bh = p.entries.reduce((s, e) => s + (map.get(e.opponent)?.matchPoints || 0), 0); p.bhc1 = p.bh; p.sb = p.entries.reduce((s, e) => s + (map.get(e.opponent)?.matchPoints || 0) * e.score, 0); }
  rows.sort((a, b) => b.points - a.points || b.gamePoints - a.gamePoints || (t.tiebreaks||['bh']).reduce((d,k)=>d||((b[k]||0)-(a[k]||0)),0) || (a.name<b.name?-1:1));
  rows.forEach((p, i) => {p.rank=i+1;});
  return rows;
}

export function statistics(t, through = t.rounds.length) {
  if (isTeamSystem(t.system)) return teamStatistics(t, through);
  if (isKnockoutSystem(t.system)) return knockoutStatistics(t,through);
  const rows = playerStatistics(t, through), direct = new Map();
  for (const p of rows) for (const e of p.entries) if (e.opponent) direct.set(`${p.id}:${e.opponent}`, (direct.get(`${p.id}:${e.opponent}`)||0)+e.score);
  for (const p of rows) p.de = rows.filter(q => q.id !== p.id && q.points === p.points).reduce((sum, q) => sum + (direct.get(`${p.id}:${q.id}`) || 0), 0);
  rows.sort((a, b) => b.points - a.points || (t.tiebreaks || []).reduce((d, key) => d || ((b[key] || 0) - (a[key] || 0)), 0) ||
    ((t.tiebreaks || []).includes('de') ? ((direct.get(`${b.id}:${a.id}`) || 0) - (direct.get(`${a.id}:${b.id}`) || 0)) : 0) || (a.name<b.name?-1:a.name>b.name?1:0));
  rows.forEach((p, i) => { p.rank=i+1; });
  return rows;
}

export function knockoutStatistics(t,through=t.rounds.length) {
  const rows=playerStatistics(t,through),byId=new Map(rows.map(p=>[p.id,p]));for(const p of rows){p.eliminated=0;p.advanced=0;p.knockoutPlace=0;p.knockoutStatus='У грі';}
  for(const r of t.rounds.slice(0,through))for(const m of r.matches){if(!m.winner)continue;const winner=byId.get(m.winner),loser=byId.get(m.winner===m.white?m.black:m.white);if(winner)winner.advanced=r.number;if(loser){loser.eliminated=r.number;loser.knockoutStatus='Вибув';}if(r.closed&&r.number===t.plannedRounds&&!m.bye){if(winner){winner.knockoutPlace=m.thirdPlace?3:1;winner.knockoutStatus=m.thirdPlace?'Третє місце':'Переможець';}if(loser){loser.knockoutPlace=m.thirdPlace?4:2;loser.knockoutStatus=m.thirdPlace?'Четверте місце':'Друге місце';}}}
  rows.sort((a,b)=>(a.knockoutPlace||100)-(b.knockoutPlace||100)||(b.eliminated||t.plannedRounds+1)-(a.eliminated||t.plannedRounds+1)||b.advanced-a.advanced||a.seed-b.seed);rows.forEach((p,i)=>p.rank=i+1);return rows;
}

export function roundRobin(t,number) {
  if(number<1||number>roundCount(t.players.length,t.roundRobinFormat))throw new Error('Такого туру немає.');
  const ids=new Map(t.players.map(p=>[p.name,p.id]));
  const request={operation:'roundRobin',round:number,double:t.roundRobinFormat==='double',players:[...t.players].sort((a,b)=>a.seed-b.seed).map(p=>({id:p.name,rating:p.initialRating??p.rating??0}))};
  const result=originalCore(request),matches=result.matches.map(m=>({id:uid(),white:ids.get(m.white),black:m.black===null?null:ids.get(m.black),result:null,...(m.black===null?{byePoints:0,rest:true}:{})}));
  Object.defineProperty(matches,'reference',{value:{request,diagnostics:result.diagnostics},enumerable:false});return matches;
}

export function swiss(t) {
  const number=t.rounds.length+1, all=statistics(t), byName=new Map(t.players.map(p=>[p.name,p.id]));
  const requested=new Set(t.requestedByes || []);
  const rows=all.filter(p=>(p.joinedRound||1)<=number&&(!p.removedRound||p.removedRound>number)&&!requested.has(p.id));
  const initialColor=t.resolvedInitialColor||(t.initialColor==='random'?(Math.random()<.5?'white':'black'):t.initialColor);
  const request={operation:t.system==='swiss'&&t.pairingMode==='flexible'?'flexiblePair':'pair',round:number,totalRounds:t.plannedRounds,mode:t.system==='swiss'?'DEFAULT':'FIDE_DUTCH_STRICT',initialColor,players:rows.map(p=>({id:p.name,seed:p.seed,points:p.points,rating:p.initialRating??p.rating??0,bh:p.bh,bhc1:p.bhc1,sb:p.sb,wins:p.wins,joinedRound:p.joinedRound||1,removedRound:p.removedRound??null,active:true,hadBye:p.byes>0||p.entries.some(e=>e.kind==='forfeit'&&e.score===1),opponents:p.opponents.map(id=>t.players.find(q=>q.id===id).name),colors:p.colors,floats:p.floats.slice(0,number-1),played:p.played}))};
  const result=originalCore(request);
  const matches=result.matches.map(m=>({id:uid(),white:byName.get(m.white),black:byName.get(m.black),result:null}));
  if(result.bye)matches.push({id:uid(),white:byName.get(result.bye),black:null,result:null,byePoints:byeScore(t),requested:false});
  for(const id of requested)matches.push({id:uid(),white:id,black:null,result:null,byePoints:t.requestedByeScorePolicy==='WIN'?1:.5,requested:true});
  const paired=new Set(matches.flatMap(m=>m.black===null?[m.white]:[m.white,m.black]));
  if(paired.size!==rows.length+requested.size||matches.some(m=>!m.white||m.black===undefined))throw new Error('Жеребкування не завершено. Потрібне ручне втручання.');
  Object.defineProperty(matches,'reference',{value:{request,diagnostics:result.diagnostics,initialColor},enumerable:false});
  return matches;
}

function arenaPairings(t) {
  const number=t.rounds.length+1,rows=playerStatistics(t),previous=t.rounds.at(-1),active=rows.filter(p=>(p.joinedRound||1)<=number&&(!p.removedRound||p.removedRound>number));
  const history=t.rounds.flatMap(r=>r.matches.filter(m=>m.black!==null&&isPlayedResult(m.result)).map(m=>({white:m.white,black:m.black,previous:r===previous})));
  const previousOrder=previous?.arenaOrder||previous?.matches.flatMap(m=>[m.white,m.black]).filter(Boolean)||[];
  const request={operation:'arenaPair',round:number,previousOrder,newPlayers:active.filter(p=>!previousOrder.includes(p.id)).map(p=>p.id),removedPlayers:rows.filter(p=>p.removedRound&&p.removedRound<=number).map(p=>p.id),requestedByes:t.requestedByes||[],history,byes:Object.fromEntries(rows.map(p=>[p.id,p.byes])),previousBye:previous?.matches.find(m=>m.black===null&&!m.requested)?.white||null,colors:Object.fromEntries(rows.map(p=>[p.id,p.colors]))};
  const result=originalCore(request),matches=result.matches.map(m=>({id:uid(),...m,result:null,byePoints:m.black===null?byeScore(t):undefined,arena:true}));
  for(const id of request.requestedByes)if(active.some(p=>p.id===id)&&!matches.some(m=>m.white===id||m.black===id))matches.push({id:uid(),white:id,black:null,result:null,byePoints:t.requestedByeScorePolicy==='WIN'?1:.5,requested:true});
  const covered=new Set(matches.flatMap(m=>[m.white,m.black]).filter(Boolean));if(covered.size!==active.length)throw new Error('Не вдалося створити повний тур арени.');
  Object.defineProperty(matches,'reference',{value:{request,diagnostics:result.diagnostics,arenaOrder:result.order},enumerable:false});return matches;
}
function teamPairings(t) {
  const rows=teamStatistics(t),number=t.rounds.length+1,names=new Map(t.teams.map(p=>[p.id,p.name])),ids=new Map(t.teams.map(p=>[p.name,p.id])),players=new Map(t.players.map(p=>[p.id,p]));
  const initialColor=t.resolvedInitialColor||(t.initialColor==='random'?(Math.random()<.5?'white':'black'):t.initialColor);
  const request={operation:'teamPair',round:number,boardCount:t.boardCount,initialColor,forcedBye:names.get(t.requestedByes?.[0])||null,teams:rows.map(team=>({id:team.name,seed:team.seed,mp:team.matchPoints,gp:team.gamePoints,opponents:team.opponents.map(id=>names.get(id)),colors:team.colors,hadBye:team.byes>0,played:team.played,previousFloater:team.previousFloater||false,players:team.players.map(id=>({id,rating:players.get(id)?.rating||0,k:players.get(id)?.fideKFactor||20}))}))};
  const result=originalCore(request),matches=result.matches.map(m=>({id:uid(),white:ids.get(m.white),black:ids.get(m.black),result:null,teamMatch:true,boards:m.boards.map(b=>({...b,whiteTeam:ids.get(b.whiteTeam),blackTeam:ids.get(b.blackTeam),result:null})),whiteGamePoints:0,blackGamePoints:0,whiteMatchPoints:0,blackMatchPoints:0}));
  if(result.bye){const requested=result.bye===request.forcedBye;matches.push({id:uid(),white:ids.get(result.bye),black:null,result:null,byePoints:requested?0:2,byeGamePoints:requested?0:t.boardCount,requested,teamMatch:true});}
  Object.defineProperty(matches,'reference',{value:{request,diagnostics:result.diagnostics,initialColor},enumerable:false});return matches;
}
function knockoutPhase(size) { if (size === 2) return 'Фінал'; if (size === 4) return 'Півфінал'; if (size === 8) return 'Чвертьфінал'; return `1/${size}`; }
function knockoutPairings(t) {
  const number=t.rounds.length+1;let slots;
  if(number===1){
    const ordered=[...t.players].sort((a,b)=>b.rating-a.rating||(a.name<b.name?-1:1)),byId=new Map(ordered.map(p=>[p.id,p]));
    slots=originalCore({operation:'knockoutSlots',seeding:t.knockoutSeeding,players:ordered.map(p=>({id:p.id,rating:p.rating}))}).slots.map(id=>byId.get(id)||null);
  }else slots=t.rounds.at(-1).matches.filter(m=>!m.thirdPlace).map(m=>t.players.find(p=>p.id===m.winner)).filter(Boolean);
  const phase=knockoutPhase(slots.length),matches=[];
  for(let i=0;i<slots.length;i+=2){let white=slots[i]?.id,black=slots[i+1]?.id||null;if(!white){white=black;black=null;}matches.push({id:uid(),white,black,result:null,winner:black?null:white,bye:!black,phase,tieBreakMode:'MANUAL'});}
  if(t.knockoutThirdPlace&&number>1&&slots.length===2){const losers=t.rounds.at(-1).matches.filter(m=>!m.thirdPlace&&m.black!==null).map(m=>m.winner===m.white?m.black:m.white);if(losers.length===2)matches.push({id:uid(),white:losers[0],black:losers[1],result:null,winner:null,phase:'Матч за третє місце',thirdPlace:true,tieBreakMode:'MANUAL'});}
  return matches;
}
export function addRound(t) {
  if (isKnockoutSystem(t.system)) { if (t.rounds.some(r => !r.closed)) throw new Error('Спочатку завершіть поточний етап.'); const matches = knockoutPairings(t); t.rounds.push({ number: t.rounds.length + 1, closed: false, matches, phase: matches[0]?.phase || 'Фінал' }); t.status = 'active'; return; }
  if (t.players.length < 2 && !isTeamSystem(t.system)) throw new Error('Додайте щонайменше двох учасників.');
  if (isTeamSystem(t.system) && (t.teams || []).length < 2) throw new Error('Додайте щонайменше дві команди.');
  if (t.rounds.some(r => !r.closed)) throw new Error('Спочатку завершіть поточний тур.');
  const limit = isArenaSystem(t.system) ? Infinity : t.plannedRounds; if (t.rounds.length >= limit) throw new Error('Усі заплановані тури вже створено.');
  for(const p of t.players){p.initialRating??=p.rating||0;p.joinedRound??=1;}
  const matches = t.system === 'roundrobin' ? roundRobin(t, t.rounds.length + 1) : isTeamSystem(t.system) ? teamPairings(t) : isArenaSystem(t.system) ? arenaPairings(t) : swiss(t);
  const reference=matches.reference;
  t.rounds.push({ number: t.rounds.length + 1, closed: false, matches, phase: isArenaSystem(t.system) ? 'Arena' : undefined }); t.status = 'active';
  if(reference)t.resolvedInitialColor=reference.initialColor;
  if(reference?.arenaOrder)t.rounds.at(-1).arenaOrder=reference.arenaOrder;
  t.requestedByes=[];
  t.audit ||= []; t.audit.push({ round: t.rounds.length, at: new Date().toISOString(), pairings: clone(matches), request:reference?.request, diagnostics:reference?.diagnostics || ['Автоматичне жеребкування'] });
}

export function setBoardResult(t, round, matchId, boardIndex, result) {
  const r = t.rounds[round - 1]; if (!r || r.closed || round !== t.rounds.length) throw new Error('Щоб виправити цей тур, спочатку поверніться до нього.');
  const m = r.matches.find(x => x.id === matchId); if (!m?.boards?.[boardIndex] || (result !== null && !Object.hasOwn(RESULTS, result))) throw new Error('Некоректний результат.'); m.boards[boardIndex].result = result;
  const sums = m.boards.reduce((a, b) => { const s = RESULTS[b.result],reverse=b.whiteTeam===m.black; if (s) { a[0] += s[reverse?1:0]; a[1] += s[reverse?0:1]; } return a; }, [0, 0]); m.whiteGamePoints = sums[0]; m.blackGamePoints = sums[1]; m.result = m.boards.every(b => RESULTS[b.result]) ? (sums[0] > sums[1] ? '1-0' : sums[1] > sums[0] ? '0-1' : '½-½') : null;
  if (m.result) { m.whiteMatchPoints = sums[0] > sums[1] ? 2 : sums[0] === sums[1] ? 1 : 0; m.blackMatchPoints = sums[1] > sums[0] ? 2 : sums[0] === sums[1] ? 1 : 0; }
  else { m.whiteMatchPoints=0; m.blackMatchPoints=0; }
}

export function setKnockoutWinner(t, round, matchId, winnerId, reason = 'manual') {
  const r = t.rounds[round - 1]; if (!r || r.closed || round !== t.rounds.length) throw new Error('Цей етап уже закрито.'); const m = r.matches.find(x => x.id === matchId); if (!m || ![m.white, m.black].includes(winnerId)) throw new Error('Переможець має бути учасником цієї пари.'); m.winner = winnerId; m.tieBreakMode = reason;
}

export function setTeamLineup(t,number,matchId,selections) {
  const round=t.rounds[number-1],match=round?.matches.find(m=>m.id===matchId);if(!round||round.closed||number!==t.rounds.length||!match?.boards)throw new Error('Склад можна змінити лише у відкритому турі.');
  for(const id of [match.white,match.black]){const team=t.teams.find(p=>p.id===id),chosen=selections[id];if(!Array.isArray(chosen)||chosen.length!==t.boardCount||new Set(chosen).size!==chosen.length||chosen.some(p=>!team.players.includes(p)))throw new Error('Оберіть різних гравців зі складу команди.');}
  for(const [i,board]of match.boards.entries()){const white=selections[board.whiteTeam||match.white][i],black=selections[board.blackTeam||match.black][i];if(board.white!==white||board.black!==black)board.result=null;board.white=white;board.black=black;}
  for(const id of [match.white,match.black]){const team=t.teams.find(p=>p.id===id);team.players=[...selections[id],...team.players.filter(p=>!selections[id].includes(p))];}
  setBoardResult(t,number,matchId,0,match.boards[0].result);
}

function updateElo(t, round) {
  if(t.mode==='simple'||t.automaticEloUpdates===false)return;
  const request={operation:'ratings',players:t.players.map(p=>({id:p.id,rating:p.initialRating??p.eloHistory?.[0]?.before??p.rating??0,k:p.fideKFactor||20,joinedRound:p.joinedRound||1,removedRound:p.removedRound||null})),games:[]};
  for(const r of t.rounds.filter(r=>r.closed))for(const m of r.matches){for(const game of m.boards||[m])if(game.black&&isPlayedResult(game.result))request.games.push({round:r.number,white:game.white,black:game.black,score:RESULTS[game.result][0]});}
  const result=originalCore(request);
  for(const p of t.players){p.initialRating??=request.players.find(x=>x.id===p.id).rating;p.rating=result.final[p.id]??p.initialRating;p.eloHistory=result.history.filter(h=>h.id===p.id).map(h=>({round:h.round,before:h.before,after:h.after,change:h.change}));}
}
export function closeRound(t) {
  const r = t.rounds.at(-1); if (!r || r.closed) throw new Error('Немає відкритого туру.');
  if (isKnockoutSystem(t.system)) { for (const m of r.matches) { if (m.bye) continue; if (!m.winner) { if (m.result === '½-½') throw new Error('Для нічиєї оберіть переможця тай-брейку.'); if (!isPlayedResult(m.result)) throw new Error('Вкажіть результат і переможця.'); m.winner = m.result === '1-0' ? m.white : m.result === '0-1' ? m.black : null; } if (!m.winner) throw new Error('Вкажіть переможця кожної партії.'); } }
  else if (isTeamSystem(t.system)) { for (const m of r.matches) if (m.black !== null && (!m.boards?.length || m.boards.some(b => !RESULTS[b.result]))) throw new Error('Внесіть результати всіх дошок.'); }
  else if (r.matches.some(m => m.black !== null && !RESULTS[m.result])) throw new Error('Спочатку внесіть результати всіх партій.');
  r.ratingsBefore=t.players.map(p=>({id:p.id,rating:p.rating||0,eloHistory:clone(p.eloHistory||[])}));
  r.closed = true; updateElo(t, r); const limit = isArenaSystem(t.system) ? Infinity : t.plannedRounds; if (t.rounds.length >= limit || isKnockoutSystem(t.system) && r.matches.length === 1) t.status = 'finished';
}

export function rollback(t, number) {
  if (!Number.isInteger(number) || number < 1 || number > t.rounds.length) throw new Error('Такого туру немає.');
  for(const p of t.players){const snapshot=t.rounds[number-1].ratingsBefore?.find(x=>x.id===p.id),history=(p.eloHistory||[]).filter(h=>h.round>=number);if(snapshot){p.rating=snapshot.rating;p.eloHistory=clone(snapshot.eloHistory);}else if(history.length){p.rating=history[0].before;p.eloHistory=p.eloHistory.filter(h=>h.round<number);}if(p.joinedRound>number)p.joinedRound=number+1;if(p.removedRound>number)delete p.removedRound;}
  t.rounds = t.rounds.slice(0, number); t.rounds.at(-1).closed = false; t.status = 'active'; t.requestedByes=[];
  if (t.audit) t.audit = t.audit.filter(a => a.round <= number);
}

export function requestBye(t,id) {
  if(!isSwissSystem(t.system)&&!isArenaSystem(t.system)&&!isTeamSystem(t.system))throw new Error('Цей формат не підтримує запити на пропуск.');
  const p=(isTeamSystem(t.system)?t.teams:t.players).find(p=>p.id===id);
  const row=statistics(t).find(p=>p.id===id);
  if(!p||p.removedRound||row?.byes||row?.entries.some(e=>e.kind==='forfeit'&&e.score===1))throw new Error('Учасник уже мав пропуск або вибув.');
  t.requestedByes||=[];
  if(t.requestedByes.includes(id))t.requestedByes=t.requestedByes.filter(x=>x!==id);else t.requestedByes.push(id);
}

export function withdrawPlayer(t,id) {
  if(!isSwissSystem(t.system)&&!isArenaSystem(t.system))throw new Error('У цьому форматі склад зафіксовано після старту.');
  const p=t.players.find(p=>p.id===id);if(!p)throw new Error('Учасника не знайдено.');
  if(p.removedRound)delete p.removedRound;else p.removedRound=t.rounds.length+1;
  t.requestedByes=(t.requestedByes||[]).filter(x=>x!==id);
}

export function setResult(t, round, id, result) {
  const r = t.rounds[round - 1]; if (!r || r.closed || round !== t.rounds.length) throw new Error('Щоб виправити цей тур, спочатку поверніться до нього.'); const m = r.matches.find(x => x.id === id); if (!m || m.black === null || (result !== null && !Object.hasOwn(RESULTS, result))) throw new Error('Некоректний результат.'); m.result=result;if(isKnockoutSystem(t.system)){m.winner=['1-0','+-'].includes(result)?m.white:['0-1','-+'].includes(result)?m.black:null;m.tieBreakMode='MANUAL';}
}

export function finishTournament(t) {
  const last=t.rounds.at(-1);if(!last)throw new Error('Турнір ще не розпочато.');
  if(!last.closed){const games=last.matches.filter(m=>m.black!==null);if(games.every(m=>!m.result&&(!m.boards||m.boards.every(b=>!b.result)))&&t.rounds.length>1){t.rounds.pop();t.audit=t.audit.filter(a=>a.round<=t.rounds.length);}else closeRound(t);}
  t.plannedRounds=t.rounds.length;t.status='finished';
}

export function replacePairings(t,number,pairs) {
  const round=t.rounds[number-1];if(!round||round.closed||number!==t.rounds.length||isTeamSystem(t.system)||isKnockoutSystem(t.system))throw new Error('Можна редагувати лише пари відкритого останнього туру.');
  const before=round.matches,next=pairs.map(p=>{const same=before.find(m=>m.white===p.white&&m.black===p.black);return same?clone(same):{id:uid(),white:p.white,black:p.black,result:null,...(p.black===null?{byePoints:t.system==='roundrobin'?0:byeScore(t)}:{})};});
  const candidate=clone(t);candidate.rounds[number-1].matches=next;validateTournament(candidate);round.matches=next;
  t.audit||=[];t.audit.push({round:number,at:new Date().toISOString(),manual:true,pairings:clone(next),diagnostics:['Пари змінено організатором']});
}

function normaliseForValidation(t) {
  t.teams ||= []; t.audit ||= []; t.changeLog ||= []; t.roundRobinFormat ||= 'single'; t.pairingMode ||= isSwissSystem(t.system) ? 'flexible' : t.system; t.pairingEngine ||= t.system; t.initialColor ||= 'random'; t.byeScorePolicy ||= 'WIN'; t.requestedByeScorePolicy ||= 'DRAW'; t.boardCount = Math.max(1, Number(t.boardCount || 2)); t.knockoutSeeding ||= 'balanced'; t.automaticEloUpdates = t.automaticEloUpdates !== false; return t;
}

export function validateTournament(value) {
  if(!value||typeof value!=='object')throw new Error('Файл містить некоректні дані турніру. Імпорт скасовано.');
  const t = normaliseForValidation(clone(value)); const fail = () => { throw new Error('Файл містить некоректні дані турніру. Імпорт скасовано.'); }; const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
  if (!t || typeof t !== 'object' || !validId(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100 || !['simple', 'advanced', 'professional'].includes(t.mode) || !Object.hasOwn(SYSTEMS, t.system) || !['draft', 'active', 'finished'].includes(t.status) || typeof t.control !== 'string' || t.control.length > 80 || typeof t.created !== 'string' || !Number.isFinite(Date.parse(t.created)) || typeof t.updated !== 'string' || !Number.isFinite(Date.parse(t.updated)) || !Number.isInteger(t.plannedRounds) || t.plannedRounds < 1 || t.plannedRounds > 255 || !Array.isArray(t.players) || t.players.length > 128 || !Array.isArray(t.rounds) || t.rounds.length > (isArenaSystem(t.system)?10000:t.plannedRounds + 64) || !Array.isArray(t.tiebreaks) || t.tiebreaks.some(k => typeof k !== 'string' || !Object.hasOwn(TIEBREAKS, k)) || new Set(t.tiebreaks).size !== t.tiebreaks.length || (t.system === 'roundrobin' && t.tiebreaks.some(k => ['bh', 'bhc1'].includes(k)))) fail();
  const ids = new Set(), seeds = new Set(); for (const p of t.players) { if (!p || !validId(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || !Number.isInteger(p.seed) || p.seed < 1 || seeds.has(p.seed) || !Number.isInteger(Number(p.rating ?? 0)) || Number(p.rating ?? 0) < 0 || Number(p.rating ?? 0) > 3500) fail(); ids.add(p.id); seeds.add(p.seed); }
  const teamIds = new Set(); for (const team of t.teams) { if (!team || !validId(team.id) || teamIds.has(team.id) || typeof team.name !== 'string' || !team.name.trim() || !Number.isInteger(team.seed) || team.seed < 1 || !Array.isArray(team.players)) fail(); teamIds.add(team.id); for (const id of team.players) if (!ids.has(id)) fail(); } if (isTeamSystem(t.system) && t.teams.length > 64) fail();
  const pairIds = new Set(), encounters = new Set(), byeRecipients = new Set();
  for (const [i, r] of t.rounds.entries()) {
    if (!r || r.number !== i + 1 || typeof r.closed !== 'boolean' || !Array.isArray(r.matches) || (i < t.rounds.length - 1 && !r.closed)) fail(); const seen = new Set();
    for (const m of r.matches) {
      if (!m || !validId(m.id) || pairIds.has(m.id)) fail(); pairIds.add(m.id); const participants = isTeamSystem(t.system) ? teamIds : ids; if (!participants.has(m.white) || seen.has(m.white)) fail(); seen.add(m.white);
      if(r.closed&&m.black!==null&&(!RESULTS[m.result]||isKnockoutSystem(t.system)&&!m.winner))fail();
      if(m.black===null&&!isKnockoutSystem(t.system)&&!(isTeamSystem(t.system)?[0,1,2]:isSwissSystem(t.system)||isArenaSystem(t.system)?[0,.5,1]:[0]).includes(m.byePoints))fail();
      if (m.black !== null && m.black !== undefined && (!participants.has(m.black) || m.black === m.white || seen.has(m.black))) fail(); if (m.black !== null && m.black !== undefined) seen.add(m.black); if (m.result !== null && m.result !== undefined && (typeof m.result !== 'string' || !Object.hasOwn(RESULTS, m.result))) fail();
      if (isTeamSystem(t.system) && m.black !== null && (!Array.isArray(m.boards) || m.boards.length !== t.boardCount)) fail(); if (isTeamSystem(t.system) && m.boards) for (const b of m.boards) if ((b.white !== null && !ids.has(b.white)) || (b.black !== null && !ids.has(b.black)) || (b.result !== null && !Object.hasOwn(RESULTS, b.result))) fail();
      if (m.black === null || m.black === undefined) { if (!isKnockoutSystem(t.system) && m.byePoints !== (isSwissSystem(t.system) || isArenaSystem(t.system) ? Number(m.byePoints) : isTeamSystem(t.system)?Number(m.byePoints):0)) fail(); if ((isSwissSystem(t.system)&&t.system!=='swiss' || t.system === 'roundrobin'&&t.roundRobinFormat!=='double') && byeRecipients.has(m.white)) fail(); if (t.system !== 'knockout') byeRecipients.add(m.white); if (isKnockoutSystem(t.system) && m.winner && m.winner !== m.white) fail(); }
      else { const key = [m.white, m.black].sort().join(':'); const repeatsAllowed = isArenaSystem(t.system) || isTeamSystem(t.system) || (t.system === 'roundrobin' && t.roundRobinFormat === 'double') || (t.system === 'swiss' && t.pairingMode === 'flexible'); if (!repeatsAllowed && encounters.has(key)) fail(); if(isPlayedResult(m.result)||!m.result||t.system==='roundrobin')encounters.add(key); if (isKnockoutSystem(t.system) && m.winner && ![m.white, m.black].includes(m.winner)) fail(); }
    }
    if (!isKnockoutSystem(t.system)) {const active=isTeamSystem(t.system)?t.teams:t.players.filter(p=>(p.joinedRound||1)<=r.number&&(!p.removedRound||p.removedRound>r.number));if(seen.size!==active.length||active.some(p=>!seen.has(p.id)))fail();}
  }
  for(const p of t.players){if(p.startingPoints!=null&&(!Number.isFinite(p.startingPoints)||p.startingPoints<0||p.startingPoints>255||p.startingPoints*2%1))fail();if(p.joinedRound!=null&&(!Number.isInteger(p.joinedRound)||p.joinedRound<1))fail();if(p.removedRound!=null&&(!Number.isInteger(p.removedRound)||p.removedRound<(p.joinedRound||1)))fail();}
  if(t.requestedByes!=null&&(!Array.isArray(t.requestedByes)||new Set(t.requestedByes).size!==t.requestedByes.length||t.requestedByes.some(id=>!(isTeamSystem(t.system)?teamIds:ids).has(id))))fail();
  if (t.rounds.length && ((isTeamSystem(t.system) && t.teams.length < 2) || (!isTeamSystem(t.system) && t.players.length < 2))) fail(); if ((t.status === 'draft') !== (t.rounds.length === 0)) fail(); if (t.status === 'finished' && t.rounds.length && !t.rounds.at(-1).closed) fail(); return t;
}

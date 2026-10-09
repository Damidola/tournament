import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, statistics, roundCount, roundRobin, addRound, closeRound, rollback, setResult, setBoardResult, setKnockoutWinner, validateTournament } from '../engine.js';
import { requestBye,withdrawPlayer,finishTournament,replacePairings } from '../engine.js';

function tournament(n=4,system='swiss',rounds=3) {
  const t=createTournament({name:'Контрольный турнир',system,rounds});
  t.players=Array.from({length:n},(_,i)=>({id:String(i+1),name:'Игрок '+(i+1),seed:i+1,rating:0}));if(system==='roundrobin')t.plannedRounds=roundCount(n);return t;
}

test('rollback restores native cumulative Elo and re-closing does not award it twice',()=>{
  const t=tournament(4,'roundrobin');t.mode='advanced';t.players.forEach(p=>p.rating=1500);addRound(t);for(const m of t.rounds[0].matches)setResult(t,1,m.id,'1-0');closeRound(t);const after=t.players.map(p=>p.rating);addRound(t);for(const m of t.rounds[1].matches)setResult(t,2,m.id,'0-1');closeRound(t);rollback(t,1);assert.deepEqual(t.players.map(p=>p.rating),[1500,1500,1500,1500]);assert(t.players.every(p=>p.eloHistory.length===0));closeRound(t);assert.deepEqual(t.players.map(p=>p.rating),after);assert(t.players.every(p=>p.eloHistory.length===1));
});
test('Arena admits future players, withdrawal and requested byes without rewriting old rounds',()=>{
  const t=tournament(5,'arena');addRound(t);for(const m of t.rounds[0].matches)if(m.black)setResult(t,1,m.id,'½-½');closeRound(t);const before=structuredClone(t.rounds[0]);const resting=before.matches.find(m=>m.black===null).white,eligible=t.players.find(p=>p.id!==resting).id;requestBye(t,eligible);withdrawPlayer(t,t.players.find(p=>p.id!==resting&&p.id!==eligible).id);t.players.push({id:'new',name:'Новий',seed:6,rating:0,startingPoints:1.5,joinedRound:2});addRound(t);assert.deepEqual(t.rounds[0],before);assert(t.rounds[1].matches.some(m=>m.white===eligible&&m.requested&&m.byePoints===.5));assert.equal(statistics(t).find(p=>p.id==='new').points,1.5);validateTournament(t);
});
test('partial team games give game points, but no match points until every board is entered',()=>{
  const t=tournament(4,'teamSwiss');t.boardCount=2;t.teams=[{id:'a',name:'A',seed:1,players:['1','2']},{id:'b',name:'B',seed:2,players:['3','4']}];addRound(t);const m=t.rounds[0].matches[0];assert.equal(m.boards[0].whiteTeam,m.white);assert.equal(m.boards[1].whiteTeam,m.black);setBoardResult(t,1,m.id,0,'1-0');assert(statistics(t).every(p=>p.points===0));setBoardResult(t,1,m.id,1,'0-1');assert.equal(statistics(t).find(p=>p.id===m.white).gamePoints,2);assert.equal(statistics(t).find(p=>p.id===m.white).points,2);setBoardResult(t,1,m.id,1,null);assert(statistics(t).every(p=>p.points===0));
});
test('manual pairs reject duplicated players before any result can be lost',()=>{
  const t=tournament(4,'roundrobin');addRound(t);const before=structuredClone(t.rounds[0]);assert.throws(()=>replacePairings(t,1,[{white:'1',black:'2'},{white:'1',black:'3'}]));assert.deepEqual(t.rounds[0],before);
});
test('knockout seed bracket and third-place match preserve final places',()=>{
  const t=tournament(8,'knockout',3);t.knockoutThirdPlace=true;t.players.forEach((p,i)=>p.rating=2000-i*100);addRound(t);assert.deepEqual(t.rounds[0].matches.map(m=>[m.white,m.black]),[['1','8'],['4','5'],['2','7'],['3','6']]);for(let r=1;r<=3;r++){for(const m of t.rounds.at(-1).matches)if(m.black)setResult(t,r,m.id,'1-0');closeRound(t);if(r<3)addRound(t);}assert.equal(t.rounds[2].matches.length,2);const final=t.rounds[2].matches.find(m=>!m.thirdPlace),third=t.rounds[2].matches.find(m=>m.thirdPlace),rows=statistics(t);assert.equal(rows[0].id,final.winner);assert.equal(rows[2].id,third.winner);validateTournament(t);
});
test('ending an Arena drops only the empty automatically opened round',()=>{
  const t=tournament(4,'arena');addRound(t);for(const m of t.rounds[0].matches)setResult(t,1,m.id,'1-0');closeRound(t);addRound(t);finishTournament(t);assert.equal(t.rounds.length,1);assert.equal(t.status,'finished');validateTournament(t);
});
const m=(a,b,result)=>({id:crypto.randomUUID(),white:String(a),black:b===null?null:String(b),result:b===null?null:result,...(b===null?{byePoints:result}:{})});
function fixture(system='swiss') {
  const t=tournament(4,system);t.rounds=[
    {number:1,closed:true,matches:[m(1,2,'1-0'),m(3,4,'1-0')]},
    {number:2,closed:true,matches:[m(1,3,'½-½'),m(2,4,'1-0')]},
    {number:3,closed:true,matches:[m(1,4,'1-0'),m(2,3,'½-½')]}
  ];t.status='finished';return t;
}
test('results belong only to the two participants, not every player',()=>{
  const t=tournament();t.rounds=[{number:1,closed:false,matches:[m(1,2,'1-0'),m(3,4,null)]}];t.status='active';
  assert.deepEqual(Object.fromEntries(statistics(t).map(p=>[p.id,p.points])),{'1':1,'2':0,'3':0,'4':0});
});
test('hand-calculated points, Buchholz, cut-1 and Sonneborn-Berger',()=>{
  const t=fixture();validateTournament(t);const r=Object.fromEntries(statistics(t).map(p=>[p.id,p]));
  assert.deepEqual([r['1'].points,r['2'].points,r['3'].points,r['4'].points],[2.5,1.5,2,0]);
  assert.deepEqual([r['1'].bh,r['2'].bh,r['3'].bh,r['4'].bh],[3.5,4.5,4,6]);
  assert.deepEqual([r['1'].bhc1,r['2'].bhc1,r['3'].bhc1,r['4'].bhc1],[3.5,4.5,4,4.5]);
  assert.deepEqual([r['1'].sb,r['2'].sb,r['3'].sb,r['4'].sb],[2.5,1,2,0]);
});
test('rating never silently resolves equal places',()=>{
  const t=tournament(4,'roundrobin',3);addRound(t);for(const m of t.rounds[0].matches)m.result='½-½';t.players[0].rating=3000;
  assert.deepEqual(statistics(t).map(p=>p.rank),[1,2,3,4]);
  const order=statistics(t).map(p=>p.id);t.players.reverse().forEach((p,i)=>p.rating=i*700);assert.deepEqual(statistics(t).map(p=>p.id),order);
});
test('original round robin has every pair exactly once and one rest for odd rosters',()=>{
  for(let n=2;n<=32;n++){
    const t=tournament(n,'roundrobin',roundCount(n)),seen=new Set(),byes={},colors={};
    for(let r=1;r<=roundCount(n);r++)for(const m of roundRobin(t,r)){
      if(m.black===null){byes[m.white]=(byes[m.white]||0)+1;assert.equal(m.byePoints,0);continue}
      const key=[m.white,m.black].sort().join(':');assert(!seen.has(key));seen.add(key);
      colors[m.white]=(colors[m.white]||0)+1;colors[m.black]=(colors[m.black]||0)-1;
    }
    assert.equal(seen.size,n*(n-1)/2);
    assert.equal(Object.keys(byes).length,n%2?n:0);assert(Object.values(byes).every(x=>x===1));
  }
});
test('Swiss odd bye adds one point and capped dummy contribution, no played win',()=>{
  const t=tournament(3,'swiss',3);t.rounds=[
    {number:1,closed:true,matches:[m(1,2,'1-0'),m(3,null,1)]},
    {number:2,closed:true,matches:[m(1,3,'1-0'),m(2,null,1)]},
    {number:3,closed:true,matches:[m(2,3,'1-0'),m(1,null,1)]}
  ];t.status='finished';validateTournament(t);const r=Object.fromEntries(statistics(t).map(p=>[p.id,p]));
  assert.deepEqual([r['1'].points,r['2'].points,r['3'].points],[3,2,1]);
  assert.deepEqual([r['1'].bh,r['2'].bh,r['3'].bh],[4.5,5.5,6]);
  assert.equal(r['1'].wins,2);assert.equal(r['1'].played,2);assert.equal(r['1'].sb,4.5);
});
test('round-robin rest adds no point or coefficient',()=>{
  const t=tournament(3,'roundrobin',3);addRound(t);const resting=t.rounds[0].matches.find(m=>m.black===null);
  assert.equal(statistics(t).find(p=>p.id===resting.white).points,0);assert.equal(statistics(t).find(p=>p.id===resting.white).entries.length,0);
});
test('Swiss forfeit uses capped dummy, cut-1 removes voluntary unplayed contribution',()=>{
  const t=fixture();t.rounds[0].matches[0].result='-+';const r=Object.fromEntries(statistics(t).map(p=>[p.id,p]));
  assert.equal(r['1'].points,1.5);assert.equal(r['1'].entries[0].contribution,1.5);
  assert.equal(r['1'].bh,3.5);assert.equal(r['1'].bhc1,2);assert.equal(r['1'].played,2);
});
test('round robin forfeits use real scheduled opponent under article 15',()=>{
  const t=fixture('roundrobin');t.rounds[0].matches[0].result='-+';
  const p=statistics(t).find(p=>p.id==='1');assert.equal(p.entries[0].contribution,2.5);
});
test('round guard prevents changing closed past results and unfinished next round',()=>{
  const t=tournament();addRound(t);assert.throws(()=>closeRound(t));assert.throws(()=>addRound(t));
  for(const m of t.rounds[0].matches)m.result='1-0';closeRound(t);
  assert.throws(()=>setResult(t,1,t.rounds[0].matches[0].id,'0-1'));
});
test('rollback retains selected round results, discards dependent future rounds and recomputes',()=>{
  const t=fixture(),before=structuredClone(t),id=t.rounds[0].matches[0].id;
  rollback(t,1);assert.equal(t.rounds.length,1);assert.equal(t.rounds[0].closed,false);assert.equal(t.status,'active');
  assert.equal(t.rounds[0].matches[0].result,'1-0');setResult(t,1,id,'0-1');closeRound(t);addRound(t);validateTournament(t);
  assert.equal(before.rounds.length,3);assert.equal(before.rounds[0].matches[0].result,'1-0');
});
test('Swiss generates unique pairings and no repeated bye over varied tournaments',()=>{
  for(let n=3;n<=24;n++)for(let run=0;run<3;run++){
    const t=tournament(n,'swissDutch',Math.min(5,roundCount(n)));t.initialColor='white';let completed=0;
    for(let r=0;r<t.plannedRounds;r++){
      const saved=structuredClone(t.rounds);try{addRound(t)}catch(e){assert(e instanceof Error);assert.deepEqual(t.rounds,saved);break}
      t.rounds.at(-1).matches.forEach((m,i)=>{if(m.black!==null)m.result=['1-0','½-½','0-1'][(r+i+run)%3]});closeRound(t);completed++;validateTournament(t);
    }
    assert(completed>=Math.min(3,t.plannedRounds));
  }
});
test('import rejects invalid opponents, inherited result keys, duplicate pairs and open past rounds',()=>{
  for(const mutate of [t=>t.rounds[0].matches[0].black='missing',t=>t.rounds[0].matches[0].result='constructor',t=>t.tiebreaks=['toString'],t=>t.rounds[0].closed=false,t=>t.rounds[1].matches=t.rounds[0].matches]){
    const t=fixture();mutate(t);assert.throws(()=>validateTournament(t));
  }
});

test('Dutch Swiss keeps an auditable strict pairing snapshot',()=>{
  const t=tournament(6,'swissDutch',3); addRound(t); assert.equal(t.audit.length,1); for(const m of t.rounds[0].matches)if(m.black)m.result='1-0'; closeRound(t); addRound(t); validateTournament(t); assert.equal(t.audit.length,2);
});

test('Arena can keep running after the unique round-robin cycle',()=>{
  const t=tournament(3,'arena',5); for(let i=0;i<5;i++){addRound(t);for(const m of t.rounds.at(-1).matches)if(m.black)m.result='½-½';closeRound(t)} validateTournament(t); assert.equal(t.rounds.length,5);
});

test('Team Swiss records board results as match points and game points',()=>{
  const t=createTournament({name:'Командний контроль',system:'teamSwiss',rounds:2,boardCount:2}); t.players=[1,2,3,4].map((id)=>({id:String(id),name:'P'+id,seed:id,rating:0})); t.teams=[{id:'a',name:'А',seed:1,players:['1','2']},{id:'b',name:'Б',seed:2,players:['3','4']}]; addRound(t); const match=t.rounds[0].matches[0]; setBoardResult(t,1,match.id,0,'1-0'); setBoardResult(t,1,match.id,1,'½-½'); closeRound(t); assert.deepEqual(statistics(t).map(x=>[x.mp,x.gp]),[[2,1.5],[0,0.5]]); validateTournament(t);
});

test('Knockout requires a winner for a drawn match and supports rollback',()=>{
  const t=tournament(3,'knockout',2); addRound(t); const live=t.rounds[0].matches.find(m=>!m.bye); live.result='½-½'; assert.throws(()=>closeRound(t),/тай-брейк/); setKnockoutWinner(t,1,live.id,live.white); for(const m of t.rounds[0].matches)if(m.bye)m.winner=m.white; closeRound(t); addRound(t); for(const m of t.rounds[1].matches)if(m.black){m.result='1-0';m.winner=m.white} closeRound(t); assert.equal(t.status,'finished'); rollback(t,1); validateTournament(t); assert.equal(t.rounds.length,1);
});

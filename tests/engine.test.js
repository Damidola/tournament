import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, statistics, roundCount, roundRobin, addRound, closeRound, rollback, setResult, validateTournament } from '../engine.js';

function tournament(n=4,system='swiss',rounds=3) {
  const t=createTournament({name:'Контрольный турнир',system,rounds});
  t.players=Array.from({length:n},(_,i)=>({id:String(i+1),name:'Игрок '+(i+1),seed:i+1,rating:0}));return t;
}
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
  assert.deepEqual(statistics(t).map(p=>p.rank),[1,1,1,1]);
});
test('round robin has every pair exactly once, balanced colors and one rest for odd rosters',()=>{
  for(let n=2;n<=32;n++){
    const t=tournament(n,'roundrobin',roundCount(n)),seen=new Set(),byes={},colors={};
    for(let r=1;r<=roundCount(n);r++)for(const m of roundRobin(t,r)){
      if(m.black===null){byes[m.white]=(byes[m.white]||0)+1;assert.equal(m.byePoints,0);continue}
      const key=[m.white,m.black].sort().join(':');assert(!seen.has(key));seen.add(key);
      colors[m.white]=(colors[m.white]||0)+1;colors[m.black]=(colors[m.black]||0)-1;
    }
    assert.equal(seen.size,n*(n-1)/2);assert(Object.values(colors).every(c=>Math.abs(c)<=1));
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
    const t=tournament(n,'swiss',Math.min(5,roundCount(n)));let completed=0;
    for(let r=0;r<t.plannedRounds;r++){
      try{addRound(t)}catch(e){assert.match(e.message,/повторних зустрічей/);break}
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

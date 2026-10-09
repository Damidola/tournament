import test from 'node:test';
import assert from 'node:assert/strict';
import { createTournament,addRound,closeRound,statistics,setResult,requestBye } from '../engine.js';
import { exportTrf,previewTrf,importTrf } from '../trf.js';

test('native TRF16 restores seed, colors, special results and points across completed rounds',()=>{
  const t=createTournament({name:'Кубок школи',system:'swissDutch',mode:'advanced',rounds:3,initialColor:'white'});
  t.players=Array.from({length:5},(_,i)=>({id:'p'+i,name:'Учасник '+i,seed:i+1,rating:1500-i*40,federation:'UKR'}));
  addRound(t);for(const [i,m] of t.rounds[0].matches.entries())if(m.black)setResult(t,1,m.id,i?'½-½':'+-');closeRound(t);
  const eligible=statistics(t).find(p=>!p.byes&&!p.entries.some(e=>e.kind==='forfeit'&&e.score===1));requestBye(t,eligible.id);
  addRound(t);for(const m of t.rounds[1].matches)if(m.black)setResult(t,2,m.id,'F½-F½');closeRound(t);
  const text=exportTrf(t),plan=previewTrf(text),restored=importTrf(plan);
  assert.equal(plan.blockingIssues.length,0);assert.equal(restored.rounds.length,2);assert.equal(restored.status,'active');
  assert.deepEqual(statistics(restored).map(p=>[p.name,p.points,p.bh,p.sb]),statistics(t).map(p=>[p.name,p.points,p.bh,p.sb]));
  const names=x=>new Map(x.players.map(p=>[p.id,p.name]));const cards=x=>x.rounds.map(r=>r.matches.map(m=>[names(x).get(m.white),m.black===null?null:names(x).get(m.black),m.result,m.byePoints]).sort());
  assert.deepEqual(cards(restored),cards(t));
  const draft=importTrf(plan,{draft:true});assert.equal(draft.rounds.length,0);assert.equal(draft.players.length,5);assert.equal(draft.status,'draft');
});

test('native TRF16 rejects unsupported result tokens before importing data',()=>{
  const t=createTournament({name:'Перевірка',system:'swissDutch',rounds:1});t.players=Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i,seed:i+1,rating:0}));addRound(t);for(const m of t.rounds[0].matches)m.result='1-0';closeRound(t);
  const text=exportTrf(t),lines=text.split('\n'),i=lines.findIndex(l=>l.startsWith('001'));lines[i]=lines[i].slice(0,98)+'?'+lines[i].slice(99);
  assert.throws(()=>previewTrf(lines.join('\n')));
});

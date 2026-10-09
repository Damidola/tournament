import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTournament,addRound,closeRound,setResult} from '../engine.js';

test('standings tiebreak priority does not alter pairing inputs or Dutch pairings',()=>{
 for(const system of ['swissDutch','swiss','arena']){
  const t=createTournament({name:'Клубний турнір',system,rounds:5,initialColor:'white'});
  t.players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'Гравець '+i,seed:i+1,rating:0}));
  for(let n=0;n<2;n++){addRound(t);t.rounds.at(-1).matches.forEach((m,i)=>{if(m.black)setResult(t,t.rounds.length,m.id,['1-0','½-½','0-1'][i%3])});closeRound(t);}
  const baseline=structuredClone(t);addRound(baseline);
  for(const keys of [['wins','sb','bh'],['de','bhc1'],[]]){
   const changed=structuredClone(t);changed.tiebreaks=keys;addRound(changed);
   assert.deepEqual(changed.audit.at(-1).request,baseline.audit.at(-1).request,system+' '+keys);
   if(system==='swissDutch')assert.deepEqual(changed.rounds.at(-1).matches.map(({white,black})=>[white,black]),baseline.rounds.at(-1).matches.map(({white,black})=>[white,black]));
  }
 }
});

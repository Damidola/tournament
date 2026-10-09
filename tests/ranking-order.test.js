import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTournament,statistics} from '../engine.js';

test('changing tiebreak priority after finishing changes tied places and preserves scores',()=>{
 const t=createTournament({name:'Пріоритет',system:'swissDutch',rounds:3,tiebreaks:['bh','wins']});
 t.players=['A','B','C','D','E','F'].map((id,i)=>({id,name:id,seed:i+1,rating:0}));
 const pairs=[[['A','C','1-0'],['B','D','½-½'],['E','F','1-0']],[['A','D','0-1'],['B','E','½-½'],['C','F','1-0']],[['A','F','½-½'],['B','C','½-½'],['D','E','1-0']]];
 t.rounds=pairs.map((matches,i)=>({number:i+1,closed:true,matches:matches.map(([white,black,result],j)=>({id:`m${i}${j}`,white,black,result}))}));t.status='finished';
 const before=structuredClone(t.rounds),first=statistics(t),a=first.find(p=>p.id==='A'),b=first.find(p=>p.id==='B');
 assert.equal(a.points,1.5);assert.equal(b.points,1.5);assert.equal(a.bh,4.5);assert.equal(b.bh,5.5);assert(b.rank<a.rank);
 t.tiebreaks=['wins','bh'];const changed=statistics(t);assert(changed.find(p=>p.id==='A').rank<changed.find(p=>p.id==='B').rank);assert.deepEqual(t.rounds,before);
 assert.deepEqual(Object.fromEntries(changed.map(p=>[p.id,[p.points,p.bh,p.sb]])),Object.fromEntries(first.map(p=>[p.id,[p.points,p.bh,p.sb]])));
});

test('team board points follow selected priority instead of a hidden rule',()=>{
 const t=createTournament({name:'Команди',system:'teamSwiss',boardCount:4,tiebreaks:['bh']});
 t.teams=['A','B','C'].map((id,i)=>({id,name:id,seed:i+1,players:[]}));
 t.rounds=[['A','B',3],['B','C',4],['C','A',3]].map(([white,black,wins],i)=>({number:i+1,closed:true,matches:[{white,black,boards:Array.from({length:4},(_,j)=>({whiteTeam:white,result:j<wins?'1-0':'0-1'}))}]}));
 assert.deepEqual(statistics(t).map(p=>p.id),['A','B','C']);
 t.tiebreaks=['gp','bh'];assert.deepEqual(statistics(t).map(p=>p.id),['B','A','C']);
});

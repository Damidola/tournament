import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTournament,clone} from '../engine.js';
import {publicSnapshot,newCapability,backupCode,parseBackupCode} from '../live-share.js';
import {confirmFinalRatings,reconcileFinalRatings} from '../ratings-sync.js';
test('public snapshot exposes tournament data without profile fields or write keys',()=>{
 const t=createTournament({name:'Дитячий турнір'});t.players=[{id:'a',name:'Анна',seed:1,rating:1300,phone:'private',address:'private',birthDate:'2010-01-01'}];t.publicShare={...newCapability(),enabled:true};
 const snapshot=publicSnapshot(t),text=JSON.stringify(snapshot);assert(!text.includes('1300'));for(const field of ['phone','address','birthDate','secret'])assert(!text.includes(field));assert.deepEqual(snapshot.players,[{id:'a',name:'Анна'}]);assert.deepEqual(parseBackupCode(backupCode(t.publicShare)),{id:t.publicShare.id,secret:t.publicShare.secret});
});
test('final Elo confirmation updates one rating category once and rollback restores the profile',()=>{
 const t=createTournament({name:'Рапід',mode:'advanced',ratingCategory:'rapid'});t.status='finished';t.players=[{id:'a',name:'Анна',seed:1,localPlayerId:'profile',initialRating:1200,rating:1212}];const db={localPlayers:[{id:'profile',name:'Анна',rating:1300,rapidElo:1200,blitzElo:1100}],savedTeams:[],playerLists:[]};
 const original=clone(t);confirmFinalRatings(t,db);assert.deepEqual([db.localPlayers[0].rating,db.localPlayers[0].rapidElo,db.localPlayers[0].blitzElo],[1300,1212,1100]);assert.throws(()=>confirmFinalRatings(t,db));const committed=clone(t);Object.assign(t,original,{status:'active'});reconcileFinalRatings(committed,t,db);assert.equal(db.localPlayers[0].rapidElo,1200);assert(!t.finalRatingsCommit);
});

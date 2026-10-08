import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTournament } from '../engine.js';
import { emptyDatabase, loadDatabase, persistDatabase, validateDatabase, recoverDatabase } from '../storage.js';
class MemoryStorage { constructor(){this.values=new Map()} getItem(k){return this.values.get(k)||null} setItem(k,v){this.values.set(k,v)} }
function sample(){const d=emptyDatabase();d.tournaments=[createTournament({name:'Копия турнира'})];return d}
test('saved snapshot survives reload',()=>{const s=new MemoryStorage(),d=persistDatabase(sample(),0,s);assert.deepEqual(loadDatabase(s),d)});
test('corrupted latest slot falls back to intact previous version',()=>{const s=new MemoryStorage();persistDatabase(sample(),0,s);const d=loadDatabase(s);d.tournaments[0].name='Новая версия';persistDatabase(d,1,s);s.setItem('tournament-v2-a','broken');assert.equal(loadDatabase(s).revision,1);assert.equal(loadDatabase(s).tournaments[0].name,'Копия турнира')});
test('write failure leaves prior version intact and does not report success',()=>{const s=new MemoryStorage();persistDatabase(sample(),0,s);s.setItem=()=>{throw new Error('QuotaExceededError')};assert.throws(()=>persistDatabase(sample(),1,s),/НЕ збережено/);assert.equal(loadDatabase(s).revision,1)});
test('stale tab cannot overwrite newer results',()=>{const s=new MemoryStorage();persistDatabase(sample(),0,s);assert.throws(()=>persistDatabase(sample(),0,s),/іншій вкладці/);assert.equal(loadDatabase(s).revision,1)});
test('backup validates history before import',()=>{const d=sample();d.history[d.tournaments[0].id]=[{id:'history',label:'Test',at:'today',snapshot:structuredClone(d.tournaments[0])}];assert.deepEqual(validateDatabase(d),d);d.history[d.tournaments[0].id][0].snapshot.tiebreaks=['fake'];assert.throws(()=>validateDatabase(d))});
test('both damaged records are retained until explicit recovery',()=>{const s=new MemoryStorage();s.setItem('tournament-v2-a','damaged-a');s.setItem('tournament-v2-b','damaged-b');assert.throws(()=>loadDatabase(s));const db=recoverDatabase(sample(),s);assert.equal(loadDatabase(s).revision,db.revision);assert.equal(s.getItem('tournament-v2-a'),'damaged-a')});

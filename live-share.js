import {statistics,TIEBREAKS,isTeamSystem} from './engine.js';
export const LIVE_ORIGIN='https://tournament-live.nutmegmoth1.chatgpt.site';
export const newCapability=()=>({id:hex(24),secret:hex(32)});
function hex(bytes){return [...crypto.getRandomValues(new Uint8Array(bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const publicLink=t=>t.publicShare?LIVE_ORIGIN+'/t/'+t.publicShare.id:'';
export function publicSnapshot(t){
 const entities=isTeamSystem(t.system)?t.teams:t.players;
 return{name:t.name,status:t.status,plannedRounds:t.plannedRounds,updated:t.updated,order:'Очки'+(t.tiebreaks.length?' → '+t.tiebreaks.map(k=>TIEBREAKS[k].short).join(' → '):''),players:entities.map(p=>({id:p.id,name:p.name})),rounds:t.rounds.map(r=>({number:r.number,closed:r.closed,matches:r.matches.map(m=>({white:m.white,black:m.black,result:isTeamSystem(t.system)&&m.black!==null?`${m.whiteGamePoints||0} - ${m.blackGamePoints||0}`:m.result||null,byePoints:m.byePoints||0}))})),standings:statistics(t).map(p=>({id:p.id,rank:p.rank,points:p.points,coefficients:t.tiebreaks.map(k=>({label:TIEBREAKS[k].short,value:p[k]||0}))}))};
}
async function request(kind,connection,method,body){
 const response=await fetch(`${LIVE_ORIGIN}/api/${kind}/${connection.id}`,{method,headers:{Authorization:'Bearer '+connection.secret,...(body?{'Content-Type':'application/json'}:{})},body,cache:'no-store',signal:AbortSignal.timeout(20000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Не вдалося з’єднатися зі сховищем.');return result;
}
const states=new Map();
export function publicationStatus(t){return states.get(t.id)?.error?'Очікує з’єднання':states.get(t.id)?.last?'Опубліковано · автоматичне оновлення':'Очікує публікації';}
export function publishTournament(t){
 if(!t.publicShare?.enabled)return Promise.resolve();
 const body=JSON.stringify(publicSnapshot(t));let state=states.get(t.id);if(!state){state={tail:Promise.resolve(),last:'',queued:'',pending:null,error:null};states.set(t.id,state)}
 if(state.stopping)return Promise.resolve();
 if(state.pending&&state.queued===body)return state.pending;
 if(state.last===body)return Promise.resolve();
 state.queued=body;const task=state.tail.catch(()=>{}).then(async()=>{if(state.last===body)return;await request('public',t.publicShare,'PUT',body);state.last=body;state.error=null;});
 state.tail=task;state.pending=task;task.then(()=>{if(state.pending===task)state.pending=null},error=>{state.error=error;if(state.pending===task)state.pending=null});return task;
}
export async function stopPublication(t){const state=states.get(t.id);if(state){state.stopping=true;await state.tail.catch(()=>{})}try{await request('public',t.publicShare,'DELETE');states.delete(t.id)}catch(error){if(state)state.stopping=false;throw error}}
export function uploadCloud(db){if(!db.cloudBackup)throw new Error('Хмарну копію не підключено.');return request('backup',db.cloudBackup,'PUT',JSON.stringify(db));}
export function downloadCloud(connection){return request('backup',connection,'GET');}
export function backupCode(connection){return connection.id+'.'+connection.secret;}
export function parseBackupCode(text){const match=String(text).trim().match(/^([a-f0-9]{48})\.([a-f0-9]{64})$/);if(!match)throw new Error('Перевірте код резервної копії.');return{id:match[1],secret:match[2]};}

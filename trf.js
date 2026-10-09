import { originalCore, statistics, createTournament, uid, validateTournament, isSwissSystem } from './engine.js';

const tokens = { '1-0':['1','0'], '½-½':['=','='], '0-1':['0','1'], '+-':['+','-'], '-+':['-','+'], '--':['-','-'], 'F½-F½':['D','D'] };

export function exportTrf(t) {
  if(!isSwissSystem(t.system))throw new Error('TRF16 доступний для індивідуальної швейцарки. Для цього формату використовуйте JSON.');
  const rounds=t.rounds.filter(r=>r.closed),rows=new Map(statistics(t,rounds.length).map(p=>[p.id,p])),seeds=new Map(t.players.map(p=>[p.id,p.seed]));
  const request={operation:'exportTrf',headers:[{code:'012',value:t.name},{code:'042',value:t.created.slice(0,10)},{code:'062',value:String(t.players.length)},{code:'142',value:String(t.plannedRounds)}],players:t.players.map(p=>{
    const cards=rounds.map(r=>{const m=r.matches.find(m=>m.white===p.id||m.black===p.id);if(!m)return {round:r.number,opponent:null,color:null,token:'Z'};
      if(m.black===null)return {round:r.number,opponent:null,color:null,token:m.byePoints===.5?'H':m.byePoints===1?(m.requested?'F':'U'):'Z'};
      const side=m.white===p.id?0:1;return {round:r.number,opponent:seeds.get(side===0?m.black:m.white),color:side===0?'w':'b',token:tokens[m.result][side]};
    });
    return {seed:p.seed,name:p.name,rating:p.initialRating??p.rating??0,sex:p.gender==='female'?'f':p.gender==='male'?'m':null,title:p.title||null,federation:p.federation||null,fideId:p.fideId||null,birthDate:p.birthDate||null,points:cards.reduce((sum,c)=>sum+(['1','+','F','U'].includes(c.token)?1:['=','D','H'].includes(c.token)?.5:0),0),rank:rows.get(p.id)?.rank||null,rounds:cards};
  })};
  if(t.players.some(p=>p.startingPoints>0))throw new Error('TRF16 не зберігає довільні початкові очки. Завантажте JSON для повного перенесення.');
  return originalCore(request).text+'\n';
}

export const previewTrf = text => originalCore({operation:'importTrf',text:String(text||'')});

export function importTrf(plan,{draft=false}={}) {
  if(!Array.isArray(plan.players)||!plan.players.length)throw new Error('У TRF16 немає учасників.');
  if(!draft&&plan.blockingIssues.length)throw new Error('TRF16 містить несумісні результати. Імпортуйте лише список учасників.');
  const t=createTournament({name:plan.name,system:'swissDutch',mode:'advanced',rounds:Math.max(1,plan.totalRounds||5,plan.rounds.length),initialColor:plan.initialColor,automaticEloUpdates:false});
  t.preserveSeeds=true;t.players=plan.players.map(p=>({...p,id:uid(),rating:p.rating||0,initialRating:p.rating||0,fideKFactor:20,startingPoints:draft?0:p.startingPoints||0,joinedRound:draft?1:p.joinedRound||1,removedRound:draft?undefined:p.removedRound||undefined}));
  if(!draft&&plan.rounds.length){const ids=new Map(t.players.map(p=>[p.seed,p.id]));
    t.rounds=plan.rounds.map(r=>({number:r.number,closed:true,matches:r.matches.map(m=>({id:uid(),white:ids.get(m.white),black:m.black===null?null:ids.get(m.black),result:m.black===null?null:({WHITE_FORFEIT_WIN:'+-',BLACK_FORFEIT_WIN:'-+',DOUBLE_FORFEIT_LOSS:'--',FORFEIT_DRAW:'F½-F½'}[m.status]||(m.whiteScore===1?'1-0':m.whiteScore===.5?'½-½':'0-1')),byePoints:m.black===null?m.whiteScore:undefined,requested:m.black===null&&m.byeKind!=='PAIRING_ALLOCATED_BYE'}))}));
    t.status=t.rounds.length>=t.plannedRounds?'finished':'active';t.audit=t.rounds.map(r=>({round:r.number,at:new Date().toISOString(),pairings:structuredClone(r.matches),diagnostics:['Імпортовано з TRF16']}));
  }
  return validateTournament(t);
}

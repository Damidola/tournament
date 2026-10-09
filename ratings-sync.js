import {clone,uid} from './engine.js';
export function confirmFinalRatings(t,db){
 if(t.status!=='finished'||t.mode==='simple'||t.automaticEloUpdates===false)throw new Error('Підтвердження рейтингу доступне після завершення рейтингового турніру.');
 if(t.finalRatingsCommit)throw new Error('Остаточні рейтинги вже збережено.');
 const field=t.ratingCategory==='rapid'?'rapidElo':t.ratingCategory==='blitz'?'blitzElo':'rating',updates=[];
 for(const player of t.players){
  let profile=db.localPlayers.find(p=>p.id===player.localPlayerId)||db.localPlayers.find(p=>p.name.trim().toLocaleLowerCase()===player.name.trim().toLocaleLowerCase());const created=!profile;
  if(!profile){profile={id:uid(),name:player.name,rating:0,rapidElo:0,blitzElo:0,standardK:player.fideKFactor||20,rapidK:player.fideKFactor||20,blitzK:player.fideKFactor||20};db.localPlayers.push(profile);}
  const before=Number(profile[field]||0),after=Number(player.rating||0);profile[field]=after;player.localPlayerId=profile.id;
  updates.push({profileId:profile.id,field,before,after,created,...(created?{profile:clone(profile)}:{})});
 }
 t.finalRatingsCommit={id:uid(),at:new Date().toISOString(),updates};
}
export function reconcileFinalRatings(before,t,db){
 if(t.status!=='finished')delete t.finalRatingsCommit;
 const previous=before.finalRatingsCommit,next=t.finalRatingsCommit;if(previous?.id===next?.id)return;
 for(const update of previous?.updates||[]){const profile=db.localPlayers.find(p=>p.id===update.profileId);if(!profile||profile[update.field]!==update.after)continue;if(update.created&&!db.savedTeams.some(g=>g.players.includes(profile.id))&&!db.playerLists.some(g=>g.players.includes(profile.id)))db.localPlayers=db.localPlayers.filter(p=>p.id!==profile.id);else profile[update.field]=update.before;}
 for(const update of next?.updates||[]){let profile=db.localPlayers.find(p=>p.id===update.profileId);if(!profile&&update.created){profile=clone(update.profile);db.localPlayers.push(profile)}if(profile&&(Number(profile[update.field]||0)===update.before||profile[update.field]===update.after))profile[update.field]=update.after;}
}

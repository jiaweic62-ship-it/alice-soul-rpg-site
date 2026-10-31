/* One deterministic scheduler for foreground combat. The game only feeds it foreground running time (no offline
   progression); the bulk option exists for simulations and tests. Chest opening is explicit. */
const CollectionBattle=(()=>{
 const R=CollectionSystem,C=RPGCatalog,N=GameNumber.from,min=GameNumber.min;
 // Random dungeon events are optional for harnesses that do not load them.
 const NO_EVENTS=Object.freeze({foe:(b,e)=>e,quiet:()=>true,tick(){},earn(){},afterKill:()=>false,onVictory(){},extraWon(){},extraEscaped(){},clear(){}}),EV=()=>typeof DungeonEvents==='undefined'?NO_EVENTS:DungeonEvents;
 // Card exploration runs (exploration.js) are optional for harnesses that do not load them.
 const XR=()=>typeof ExplorationRun==='undefined'?null:ExplorationRun;
 // Lost fights against a stuck point (a guardian, a boss or a character), and guardians withdrawing at their turn limit, keep the enemy HP left, in basis points of the
 // whole fight (a two-form fight counts both forms), under the first form's id: last attempt and best. Shown as feedback
 // on the defeat line and the guardian card; never a prediction.
 const firstForm=id=>Object.values(C.enemies).find(x=>x.phaseNext===id)?.id||id;
 function recordDefeat(s,b,id,e){if(!(e.story||e.boss||b.run&&b.queue?.[0]?.guardian))return null;const key=firstForm(id),first=C.enemies[key],later=key===id?0n:N(e.hp),total=key===id?N(e.hp)+(first.phaseNext?N(C.enemies[first.phaseNext].hp):0n):N(first.hp)+later;
  const left=total>0n?Number((N(b.hp)+(key===id&&first.phaseNext?N(C.enemies[first.phaseNext].hp):0n))*10000n/total):0,rec=(s.fightRecords??={})[key],prev=rec?.last??null;
  s.fightRecords[key]={last:left,best:rec?Math.min(rec.best,left):left};return {enemy:key,leftBps:left,previousBps:prev};}
 function start(s,id){if(XR()?.run(s))return false;if(C.dungeons[id]?.spawn)return explore(s,id);const e=C.enemies[id];if(!e||s.battle?.story||s.hp<=0n|| (e.story?!R.canEncounter(s,id):!R.enemyOpen(s,id)))return false;const st=R.stats(s);(s.seenEnemies??={})[id]=true;const village=e.dungeon==='village';if(!village)s.dungeon=e.dungeon;s.view='combat';s.battle={target:id,...(village?{village:true}:{}),hp:N(e.hp),turn:0,shield:st.hp*st.shieldBps/10000n,cooldown:0,paused:false,stalled:0,story:!!e.story,...(e.story?{checkpoint:{hp:s.hp,active:s.active,dungeon:s.dungeon}}:{})};return true;}
 // Exploring fights the dungeon population in order; the player does not pick the enemy.
 // The enemy as it fights now: walk fights use base stats, the destination population applies its environment.
 // An inserted event fight is fought with its own overrides; active events change every exploration fight.
 function foe(b,id){if(b?.run&&XR())return XR().foe(b,id);if(b?.explore&&b.extra?.length&&id===b.extra[0].enemy&&!b.transit?.length)return EV().foe(b,C.enemies[id]);return EV().foe(b,b?.explore&&!b.transit?.length?DungeonSpawner.foe(b.population,id):C.enemies[id]);}
 function explore(s,id){if(XR()?.run(s)||s.battle?.story||s.hp<=0n||!R.dungeonOpen(s,id))return false;EV().clear(s);const pop=R.population(s,id),walk=R.transit(s,id);if(!walk.length&&!pop)return false;if(pop)DungeonSpawner.revalidate(s,pop);if(!walk.length)R.arrive(s,id);const target=walk.length?walk[0]:DungeonSpawner.front(s,pop),e=walk.length?C.enemies[target]:DungeonSpawner.foe(pop,target),st=R.stats(s);s.seenEnemies[target]=true;s.dungeon=id;s.view='combat';s.battle={explore:true,dungeon:id,population:pop,...(walk.length?{transit:walk}:{}),target,hp:N(e.hp),turn:0,shield:st.hp*st.shieldBps/10000n,cooldown:0,paused:false,stalled:0,story:false};return true;}
 // Full-HP one-action kills of enemies whose drops cannot change stats are settled in bulk. Spawner RNG is consumed
 // in the same order as single steps, so the result equals the step-by-step scheduler.
 function sweep(s,b,st,budget,rewards,unlocks,report){const shield=st.hp*st.shieldBps/10000n,known=new Map();
  const easy=id=>{if(known.has(id))return known.get(id);const e=DungeonSpawner.foe(b.population,id);let ok=!e.story&&(!e.boss&&!e.elite||(!e.boss||!!s.bosses[id])&&C.dungeons[e.dungeon].direct.filter(k=>C.items[k].source===id).every(k=>R.quantity(s,k)>=N(C.items[k].cap)));
   if(ok)ok=BattleSystem.cumulative({playerHp:st.hp,playerAttack:st.attack,maxHp:st.hp,enemyHp:N(e.hp),enemyMax:N(e.hp),enemyAttack:N(e.attack),enemyHits:e.hits||1,mechanic:e.mechanic,enemyBehavior:e.behavior,...st,turn:0,shield}).outcome==='victory';known.set(id,ok);return ok;};
  const kills={};let used=0;
  // Each kill is one action: the event clock and its triggers advance exactly as in single steps.
  while(used<budget&&easy(b.target)){const id=b.target;kills[id]=(kills[id]||0n)+1n;DungeonSpawner.kill(s,b.population||b.dungeon);b.target=DungeonSpawner.front(s,b.population||b.dungeon);s.seenEnemies[b.target]=true;const wait=Math.min(budget-used,st.intervalMs);used+=wait;b.cooldown=st.intervalMs-wait;
   EV().tick(s,b,1);EV().earn(s,b,id);if(EV().afterKill(s,b,report)){b.target=b.extra[0].enemy;s.seenEnemies[b.target]=true;}if(b.cooldown>0||!EV().quiet(s,b))break;}
  if(!Object.keys(kills).length)return 0;for(const [id,n]of Object.entries(kills)){rewards(id,n);unlocks(id);}b.hp=N(foe(b,b.target).hp);b.turn=0;delete b.phaseStart;delete b.enemyLeechTotal;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;return used||1;}
 function rewind(s){const b=s.battle;if(!b?.story)return false;s.hp=min(R.hpCap(s),b.checkpoint.hp);s.active=b.checkpoint.active;s.dungeon=b.checkpoint.dungeon;s.battle=null;s.view=b.village?'village':'dungeon';if(b.run&&XR()?.run(s))s.view='run';return true;}
 function recover(s,ms){const st=R.stats(s),cap=R.hpCap(s),credit=st.hp*BigInt(Math.floor(ms))+N(s.recoveryCarry),heal=credit/5000n;s.recoveryCarry=credit%5000n;s.hp=s.hp>=cap?s.hp:min(cap,s.hp+heal);if(s.hp>=cap)s.recoveryCarry=0n;}
 function advance(s,milliseconds,{offline=false,fast=true}={}){
  let budget=Math.min(86400000,Math.max(0,Math.floor(milliseconds))),spent=0;const report={kills:{},chests:{},items:{},events:[],last:null,milliseconds:budget,skipped:0,eventChests:0n};const cycles=new Map();
  const rewards=(id,count)=>{const r=R.drops(s,id,count);if(r.resolved)report.events.push({kind:'resolved',id:r.resolved,enemy:id});report.kills[id]=(report.kills[id]||0n)+N(count);for(const field of ['chests','items'])for(const [k,v]of Object.entries(r[field]))report[field][k]=(report[field][k]||0n)+v;};
  const unlocks=id=>{const b=s.battle;if(b?.explore)for(const k of R.unlockAfter(s,b.dungeon,id,b.population))report.events.push({kind:'unlock',dungeon:b.dungeon,unlock:k});};
  if(offline&&(s.offlineBlocked||s.battle?.story))return report;
  let guard=0;while(budget>0){if(s.view==='village'){recover(s,budget);break;}const b=s.battle;if(s.view!=='combat'||!b||b.paused)break;
   if(b.cooldown>0){const wait=Math.min(budget,b.cooldown);b.cooldown-=wait;budget-=wait;spent+=wait;if(!budget)break;}
   const e=foe(b,b.target);if(!e){s.battle=null;s.view='village';break;}
   const st=R.stats(s),id=b.target;
   if(b.explore&&fast&&!b.transit?.length&&b.turn===0&&b.cooldown===0&&s.hp>=st.hp&&EV().quiet(s,b)){const used=sweep(s,b,st,budget,rewards,unlocks,report);if(used){const t=Math.min(used,budget);budget-=t;spent+=t;continue;}}
   // A cycle may be multiplied only when every stat-bearing boss drop is capped.
   const stable=!b.explore&&!b.run&&!e.story&&C.dungeons[e.dungeon].direct.filter(k=>C.items[k].source===id).every(k=>R.quantity(s,k)>=N(C.items[k].cap));
   if(stable){const key=[id,s.hp,b.hp,b.shield,b.turn,b.stalled,s.revision].join('|'),before=cycles.get(key);if(before){const length=spent-before.spent,per=N(s.kills[id])-before.kills,n=length>0?Math.floor(budget/length):0;if(n>0&&per>0n){rewards(id,per*BigInt(n));budget-=length*n;spent+=length*n;report.skipped+=n;if(!budget)break;}}else cycles.set(key,{spent,kills:N(s.kills[id])});}
   if(++guard>900000)throw new Error('Combat scheduler budget exceeded');
   const previousHp=b.hp;
   const r=BattleSystem.cumulative({playerHp:s.hp,playerAttack:st.attack,maxHp:st.hp,enemyHp:b.hp,enemyMax:N(e.hp),enemyAttack:N(e.attack),enemyHits:e.hits||1,mechanic:e.mechanic,enemyBehavior:e.behavior,enemyLeechTotal:b.enemyLeechTotal,...st,turn:b.turn,shield:b.shield});
   if(!st.combatRulesRevision&&st.abilities.includes('counter')&&r.damageTaken>0n&&r.outcome==='ongoing'){const reflected=min(r.enemyHp,st.attack*30n/100n);r.enemyHp-=reflected;r.damageDealt+=reflected;if(r.enemyHp===0n)r.outcome='victory';}
   s.hp=r.playerHp;b.hp=r.enemyHp;b.shield=r.shield;if(e.behavior?.leechBps)b.enemyLeechTotal=r.enemyLeechTotal||0n;b.turn=r.turn;b.cooldown=st.intervalMs;b.stalled=b.hp>=previousHp?b.stalled+1:0;report.last={...r,target:id};if(b.explore)EV().tick(s,b,1);
   // An inserted fleeing enemy escapes when it survives its allowed actions; the exploration simply continues.
   const fleeing=b.run?b.queue?.[0]?.escapeAfter||0:b.explore&&!b.transit?.length&&b.extra?.[0]?.enemy===id?b.extra[0].escapeAfter:0;
   // A layer guardian with a turn limit withdraws the same way; its HP left is kept like a lost attempt (2026-10-25).
   if(b.run&&r.outcome==='ongoing'&&fleeing&&b.turn>=fleeing){const rec=b.queue?.[0]?.guardian?recordDefeat(s,b,id,e):null;if(XR().escaped(s,b,report,rec))continue;break;}
   // A story fight with a turn limit (the chapter boss) ends there without a loser: the opponent steps back, the player
   // keeps the HP left, and the attempt is recorded like a lost one (2026-10-25 chapter 1 plan). Each form counts its own.
   if(e.story&&e.turnLimit&&r.outcome==='ongoing'&&(b.turn-(b.phaseStart||0))>=e.turnLimit){const rec=recordDefeat(s,b,id,e);s.battle=null;s.view=b.run?'run':b.village?'village':'dungeon';report.events.push({kind:'withdrew',id,...(rec?{record:rec}:{})});break;}
   if(r.outcome==='ongoing'&&fleeing&&b.turn>=fleeing){EV().extraEscaped(s,b,report);b.target=b.extra?.[0]?.enemy||DungeonSpawner.front(s,b.population||b.dungeon);s.seenEnemies[b.target]=true;b.hp=N(foe(b,b.target).hp);b.turn=0;delete b.phaseStart;delete b.enemyLeechTotal;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;continue;}
   if(r.outcome==='victory'){
    if(e.story){
     // A two-form fight continues against the next form at the current HP; the phase scene plays in between.
     if(e.phaseNext){const next=C.enemies[e.phaseNext];b.target=e.phaseNext;b.hp=N(next.hp);if(!st.combatRulesRevision){b.turn=0;b.shield=st.hp*st.shieldBps/10000n;}b.phaseStart=b.turn;delete b.enemyLeechTotal;b.stalled=0;(s.seenEnemies??={})[e.phaseNext]=true;report.events.push({kind:'phase',id:e.characterId||id});continue;}
     const cid=e.characterId||id,growth=R.devour(s,cid);s.battle=null;s.view=b.village?'village':'dungeon';if(b.run)XR()?.storyWon(s);report.events.push({kind:'devour',id:cid,growth});break;}
    rewards(id,1);R.healTo(s,R.stats(s).hp*st.killHealBps/10000n);
    if(b.run){if(XR()?.won(s,b,id,report))continue;break;}
    if(b.explore){EV().onVictory(s,b,id,report);if(!b.transit?.length&&b.extra?.length&&b.extra[0].enemy===id)EV().extraWon(s,b,report);else if(b.transit?.length){b.transit.shift();if(!b.transit.length){delete b.transit;const a=R.arrive(s,b.dungeon);if(a?.found)report.events.push({kind:'found',dungeon:b.dungeon,node:a.found});if(a?.stop){s.battle=null;s.view='dungeon';report.events.push({kind:'arrive',dungeon:b.dungeon,node:a.stop});break;}}}else{unlocks(id);DungeonSpawner.kill(s,b.population||b.dungeon);EV().earn(s,b,id);EV().afterKill(s,b,report);}b.target=b.transit?.[0]||b.extra?.[0]?.enemy||DungeonSpawner.front(s,b.population||b.dungeon);s.seenEnemies[b.target]=true;b.hp=N(foe(b,b.target).hp);b.turn=0;delete b.phaseStart;delete b.enemyLeechTotal;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;continue;}
    if(e.boss&&!s.repeatBoss){s.battle=null;s.view='dungeon';report.events.push({kind:'boss',id});break;}
    b.hp=N(e.hp);b.turn=0;delete b.phaseStart;delete b.enemyLeechTotal;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;
   }else if(r.outcome==='defeat'||b.stalled>=60||b.turn>=600){
    if(b.run){const ended=XR()?.end(s,'defeat');if(ended)report.events.push(ended);}s.view='village';s.battle=null;EV().clear(s);const rec=r.outcome==='defeat'?recordDefeat(s,b,id,e):null;report.events.push({kind:r.outcome==='defeat'?'defeat':'stalled',id,...(rec?{record:rec}:{})});
   }
  }
  return report;
 }
 return {start,explore,foe,rewind,recover,advance};
})();

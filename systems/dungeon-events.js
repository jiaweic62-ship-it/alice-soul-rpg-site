/* Random dungeon events (content/dungeon-events.json). Events happen only in foreground exploration of a dungeon
   population, on a clock of combat actions, and are rolled from their own saved RNG so they never shift the spawner's
   draws and never reroll on reload. Rewards are chests of the area: a share of what the population paid since the
   previous event. Inserted fights go ahead of the population without consuming it. A choice card does not pause combat
   and waits until the player picks an option; nothing is chosen for them. Events never touch story, form or unlock progress. */
const DungeonEvents=(()=>{
 const C=RPGCatalog,R=CollectionSystem,N=GameNumber.from,T=()=>C.dungeonEvents;
 function fresh(seed=1){return {rng:((seed>>>0)^0x9e3779b9)>>>0,areas:{},once:{},pending:null,last:null};}
 function state(s){return s.events??=fresh(s.rng);}
 function next(ev){ev.rng=(Math.imul(ev.rng>>>0,1664525)+1013904223)>>>0;return ev.rng;}
 function between(ev,[a,b]){return a+Math.floor(next(ev)/4294967296*(b-a+1));}
 function area(ev,d){return ev.areas[d]??={clock:0,next:null,earned:'0',first:true};}
 const live=b=>!!b?.explore&&!b.transit?.length;
 // The combined modifiers of the events active in this exploration (they live on the battle and end with it).
 function modifiers(b){const out={enemyHpBps:10000,enemyAttackBps:10000,chestBonusBps:0};for(const a of b?.effects||[]){if(a.enemyHpBps)out.enemyHpBps=out.enemyHpBps*a.enemyHpBps/10000;if(a.enemyAttackBps)out.enemyAttackBps=out.enemyAttackBps*a.enemyAttackBps/10000;out.chestBonusBps+=a.chestBonusBps||0;}return out;}
 // An enemy as it fights now: an inserted fight's overrides, then the active events of the dungeon.
 function foe(b,e){if(!e||!b?.explore)return e;const f=b.extra?.[0],m=modifiers(b);let hp=10000,at=10000;
  if(f&&f.enemy===e.id){hp=f.hpBps||10000;at=f.attackBps||10000;}hp=Math.round(hp*m.enemyHpBps/10000);at=Math.round(at*m.enemyAttackBps/10000);
  if(hp===10000&&at===10000&&!(f&&f.label))return e;return {...e,name:f?.label||e.name,hp:String(N(e.hp)*BigInt(hp)/10000n),attack:String(N(e.attack)*BigInt(at)/10000n)};}
 // Bulk settlement only runs while nothing event-related is in play.
 // Nothing changes the fight: no inserted fights and no active effects. A waiting choice card changes nothing until the player picks.
 function quiet(s,b){return !b?.extra?.length&&!b?.effects?.length;}
 function tick(s,b,actions){if(!live(b))return;area(state(s),b.dungeon).clock+=actions;}
 // A population kill: remember the chests it paid, as the base of the next event's reward.
 function earn(s,b,enemyId){if(!live(b)||b.extra?.length)return;const a=area(state(s),b.dungeon);a.earned=String(N(a.earned)+N(C.enemies[enemyId]?.chests||0));}
 function available(s,b,def){const ev=state(s),q=def.requires||{};if(def.once&&ev.once[def.id])return false;
  if(q.populations&&!q.populations.includes(b.population||b.dungeon))return false;
  for(const [k,v]of Object.entries(q.env||{}))if(!R.envFound(s,b.dungeon,k)||R.envLevel(s,b.dungeon,k)!==v)return false;
  if(q.winnable){const cfg=DungeonSpawner.config(b.population||b.dungeon),limit=(cfg?.targetActions||3)*(cfg?.upperStretch||3);if(DungeonSpawner.winTurns(s,q.winnable,limit)>limit)return false;}
  return true;}
 function pick(s,b,first){const ev=state(s),t=T(),ids=(t.byDungeon[b.dungeon]||[]).filter(id=>available(s,b,t.events[id]));
  let pool=first?ids.filter(id=>t.events[id].representative):[];if(!pool.length)pool=ids.filter(id=>id!==ev.last);if(!pool.length)pool=ids;if(!pool.length)return null;
  const total=pool.reduce((n,id)=>n+t.rarityWeights[t.events[id].rarity],0);let ticket=Math.floor(next(ev)/4294967296*total);for(const id of pool){ticket-=t.rarityWeights[t.events[id].rarity];if(ticket<0)return id;}return pool[pool.length-1];}
 function reward(base,bps){if(!bps)return 0n;const v=(N(base)*BigInt(bps)+9999n)/10000n;return v>0n?v:1n;}
 // Apply an effect now. Fights are queued on the battle and pay their reward when the last one is defeated.
 function apply(s,b,def,e,base,report,option){const ev=state(s),out={kind:'dungeonEvent',id:def.id,dungeon:def.dungeon,...(option?{option}:{})};if(!e)e={};
  const st=R.stats(s);if(e.healBps){R.healTo(s,st.hp*BigInt(e.healBps)/10000n);out.healed=true;}
  if(e.damageBps){const loss=st.hp*BigInt(e.damageBps)/10000n,hp=N(s.hp)-loss;s.hp=hp>0n?hp:1n;out.damaged=true;}
  if(e.items)for(const [k,q]of Object.entries(e.items)){const got=R.add(s,k,N(q));if(got>0n)(out.items??={})[k]=String(got);}
  if(def.once)ev.once[def.id]=true;
  if(e.fights?.length&&b?.explore){b.extra=e.fights.map((f,i)=>({...f,event:def.id,base:String(base),...(i===e.fights.length-1&&option?{option}:{})}));out.fights=e.fights.length;}
  else if(e.rewardBps){const n=R.addChest(s,def.dungeon,reward(base,e.rewardBps));out.chests=String(n);if(report)report.eventChests=(report.eventChests||0n)+n;}
  if(e.duration&&b?.explore){b.effects=(b.effects||[]).filter(a=>a.id!==def.id);b.effects.push({id:def.id,left:e.duration.battles,label:e.duration.label,enemyHpBps:e.duration.enemyHpBps||0,enemyAttackBps:e.duration.enemyAttackBps||0,chestBonusBps:e.duration.chestBonusBps||0});out.duration=e.duration.battles;}
  if(report)report.events.push(out);return out;}
 // After a population kill: fire an event once the area's clock reaches its next mark. Returns true if the battle's
 // next target changed (an inserted fight).
 function afterKill(s,b,report){if(!live(b)||b.extra?.length||!T())return false;const ev=state(s);if(ev.pending)return false;const a=area(ev,b.dungeon),t=T().timing;
  if(a.next===null)a.next=a.first?between(ev,t.firstAfterActions):between(ev,t.gapActions);if(a.clock<a.next)return false;
  const id=pick(s,b,a.first);if(!id){a.next+=20;return false;}const def=T().events[id],base=a.earned;a.clock=0;a.next=null;a.first=false;a.earned='0';ev.last=id;
  if(def.options){ev.pending={id,dungeon:def.dungeon,base};if(report)report.events.push({kind:'dungeonEvent',id,dungeon:def.dungeon,choice:true});return false;}
  apply(s,b,def,def.effect,base,report);return !!b.extra?.length;}
 // The player's choice, or the auto policy when the card times out. Returns true if fights were queued.
 function choose(s,optionId,report){const ev=state(s),p=ev.pending;if(!p)return false;const def=T().events[p.id],o=def.options.find(x=>x.id===optionId);if(!o)return false;ev.pending=null;
  const b=s.battle?.explore&&s.battle.dungeon===p.dungeon?s.battle:null;const out=apply(s,b,def,o.effect,p.base,report,o.id);
  if(b&&b.extra?.length&&!b.transit?.length){b.target=b.extra[0].enemy;b.hp=N(CollectionBattle.foe(b,b.target).hp);b.turn=0;delete b.enemyLeechTotal;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;s.seenEnemies[b.target]=true;}
  return !!b?.extra?.length;}
 // A kill while exploring: active events pay their chest bonus, then count down.
 function onVictory(s,b,enemyId,report){if(!b?.explore||!b.effects?.length)return;const m=modifiers(b);
  if(m.chestBonusBps){const total=Number(N(C.enemies[enemyId]?.chests||0))*m.chestBonusBps+(b.carry||0),whole=Math.floor(total/10000);b.carry=total%10000;if(whole>0){const n=R.addChest(s,b.dungeon,BigInt(whole));if(report)report.eventChests=(report.eventChests||0n)+n;}}
  for(const a of b.effects)a.left--;const ended=b.effects.filter(a=>a.left<=0);b.effects=b.effects.filter(a=>a.left>0);if(!b.effects.length)delete b.effects;
  for(const a of ended)if(report)report.events.push({kind:'dungeonEventEnd',id:a.id,dungeon:b.dungeon});}
 // An inserted fight was won: pay its reward. Returns the finished entry.
 function extraWon(s,b,report){const f=b.extra.shift();if(f?.rewardBps){const n=R.addChest(s,b.dungeon,reward(f.base,f.rewardBps));if(report){report.eventChests=(report.eventChests||0n)+n;report.events.push({kind:'dungeonEventWon',id:f.event,dungeon:b.dungeon,chests:String(n)});}}return f;}
 function extraEscaped(s,b,report){const f=b.extra.shift();if(report)report.events.push({kind:'dungeonEventEscaped',id:f.event,dungeon:b.dungeon});return f;}
 // Leaving or starting an exploration ends what was in play; pending choices are dropped, nothing is paid twice.
 function clear(s){if(s.events)s.events.pending=null;}
 function normalize(raw,seed){const ev=fresh(seed),t=T();if(!raw||typeof raw!=='object')return ev;
  if(Number.isInteger(raw.rng))ev.rng=raw.rng>>>0;
  for(const [d,a]of Object.entries(raw.areas||{}))if(t?.byDungeon[d]&&a&&typeof a==='object')ev.areas[d]={clock:Number.isSafeInteger(a.clock)&&a.clock>=0?a.clock:0,next:Number.isSafeInteger(a.next)?a.next:null,earned:GameNumber.valid(a.earned)?String(N(a.earned)):'0',first:a.first!==false};
  for(const [k,v]of Object.entries(raw.once||{}))if(v===true&&t?.events[k]?.once)ev.once[k]=true;
  if(t?.events[raw.last])ev.last=raw.last;
  const p=raw.pending;if(p&&t?.events[p.id]?.options&&t.events[p.id].dungeon===p.dungeon&&GameNumber.valid(p.base))ev.pending={id:p.id,dungeon:p.dungeon,base:String(N(p.base))};
  // Active effects and inserted fights live on the battle: a restored battle restarts clean. A pending choice stays.
  return ev;}
 function describe(id){return T()?.events[id]||null;}
 return Object.freeze({fresh,state,foe,quiet,tick,earn,afterKill,choose,onVictory,extraWon,extraEscaped,clear,normalize,modifiers,describe});
})();

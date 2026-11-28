/* Dynamic dungeon population. A dungeon holds a fixed total score: every kill frees its score and the freed score is
   refilled with monsters matched to the player's damage per action. Elites (including former area bosses) replace a
   normal spawn at the same tier with a fixed chance. Uses the save RNG only, so bulk and step-by-step results match. */
const DungeonSpawner=(()=>{
 const C=RPGCatalog,N=GameNumber.from;
 // A population id is a dungeon id, or dungeon@population for dungeons whose route and switches pick the monsters.
 function config(id){const [d,p]=String(id).split('@');return p?C.dungeons[d]?.mechanics?.populations?.[p]||null:C.dungeons[d]?.spawn||null;}
 // An enemy as it fights in a population: route environments may change its HP, attack or mechanic.
 function foe(pop,id){const e=C.enemies[id],m=pop&&(config(pop)?.modifiers?.[id]||config(pop)?.modifiers?.[e?.variantOf]);if(!e||!m)return e;return {...e,hp:String(N(e.hp)*BigInt(m.hpBps??10000)/10000n),attack:String(N(e.attack)*BigInt(m.attackBps??10000)/10000n),mechanic:m.mechanic===undefined?e.mechanic:m.mechanic,modifier:m.note||''};}
 function log10(v){v=N(v);if(v<=0n)return -Infinity;const t=v.toString(),head=Number(t.slice(0,15));return t.length-1+Math.log10(head/10**(Math.min(15,t.length)-1));}
 function chance(s){return CollectionSystem.rng(s)/4294967296;}
 // Damage the player deals over its first `actions` actions against an undefended target, using the battle engine:
 // the first action is at full HP (first-action and full-HP bonuses apply), later actions are after being hit.
 // A tier spawns only if its HP fits within this damage, so every spawn dies in about targetActions actions.
 const powers=new WeakMap();
 function power(s,actions){const st=CollectionSystem.stats(s);let cache=powers.get(st);if(!cache)powers.set(st,cache=new Map());if(cache.has(actions))return cache.get(actions);
  const huge=10n**200n;let enemy=huge,total=0n;
  for(let t=0;t<actions;t++){const r=BattleSystem.cumulative({...st,playerHp:t?st.hp-1n:st.hp,playerAttack:st.attack,maxHp:st.hp,enemyHp:enemy,enemyMax:huge,enemyAttack:0n,enemyHits:1,mechanic:null,turn:t,shield:0n,regenBps:0n,leechBps:0n});total+=r.damageDealt;enemy=r.enemyHp;}
  cache.set(actions,total);return total;}
 // Tier requirements are fixed per table; the power level only changes with the stats revision.
 const requirements=new WeakMap(),levels=new WeakMap();
 function required(cfg,pop){let r=requirements.get(cfg);if(!r)requirements.set(cfg,r=cfg.tiers.map(t=>log10(foe(pop,t.enemy).hp)));return r;}
 function level(s,cfg){const st=CollectionSystem.stats(s);let cache=levels.get(st);if(!cache)levels.set(st,cache=new Map());if(!cache.has(cfg.targetActions))cache.set(cfg.targetActions,log10(power(s,cfg.targetActions)));return cache.get(cfg.targetActions);}
 // Actions needed to win a fresh fight from full HP with the real enemy stats and mechanics (battle engine), or
 // Infinity if the player would lose or not finish within the limit.
 const wins=new WeakMap();
 function winTurns(s,id,limit,pop=null){const st=CollectionSystem.stats(s);let cache=wins.get(st);if(!cache)wins.set(st,cache=new Map());const key=id+'|'+limit+'|'+pop;if(cache.has(key))return cache.get(key);
  const e=foe(pop,id),max=N(e.hp);let hp=st.hp,eh=max,enemyLeechTotal=0n,shield=st.hp*st.shieldBps/10000n,result=Infinity;
  for(let t=0;t<limit;t++){const r=BattleSystem.cumulative({playerHp:hp,playerAttack:st.attack,maxHp:st.hp,enemyHp:eh,enemyMax:max,enemyAttack:N(e.attack),enemyHits:e.hits||1,mechanic:e.mechanic,enemyBehavior:e.behavior,enemyLeechTotal,...st,turn:t,shield});
   if(r.outcome==='victory'){result=t+1;break;}if(r.outcome==='defeat')break;hp=r.playerHp;eh=r.enemyHp;shield=r.shield;enemyLeechTotal=r.enemyLeechTotal||0n;}
  cache.set(key,result);return result;}
 // Let i be the highest tier the player wins from full HP within targetActions actions. The next tier joins once it
 // can be won within upperStretch x targetActions actions, with a share that grows linearly in log10 between the two
 // HPs measured against the damage of targetActions actions. A spawn is therefore always winnable from full HP, so a
 // defeat never blocks the queue for a player who rests. At or above the top requirement only the top tier spawns.
 function pickTier(s,cfg,lp,pop){const req=required(cfg,pop),last=req.length-1,actions=cfg.targetActions,stretch=cfg.upperStretch||3;
  let i=-1;for(let k=0;k<=last;k++)if(winTurns(s,cfg.tiers[k].enemy,actions,pop)<=actions)i=k;
  if(i===last)return last;if(i<0)return 0;
  if(winTurns(s,cfg.tiers[i+1].enemy,actions*stretch,pop)>actions*stretch)return i;
  const share=Math.min(1,Math.max(0,(lp-req[i])/(req[i+1]-req[i])));return chance(s)<share?i+1:i;}
 function eliteFor(cfg,tier){const n=cfg.elites.length,t=cfg.tiers.length;if(!n)return null;return cfg.elites[t>1?Math.round(tier*(n-1)/(t-1)):n-1];}
 function member(s,t,cfg,pop){const ids=t.members||[t.enemy],limit=cfg.targetActions*(cfg.upperStretch||3),viable=ids.filter(id=>winTurns(s,id,limit,pop)<=limit);if(!viable.length)return t.enemy;return viable.length===1?viable[0]:viable[Math.floor(chance(s)*viable.length)];}
 function choose(s,cfg,pop){const tier=pickTier(s,cfg,level(s,cfg),pop),score=cfg.tiers[tier].score;const elite=chance(s)*10000<cfg.eliteChanceBps?eliteFor(cfg,tier):null;return {enemy:elite||member(s,cfg.tiers[tier],cfg,pop),score};}
 function fresh(cfg,s=null,pop=null){const first=cfg.tiers[0],queue=[];let pool=cfg.capacity;while(pool>=first.score){queue.push({enemy:s&&queue.length?member(s,first,cfg,pop):first.enemy,score:first.score});pool-=first.score;}return {queue,pool,next:null};}
 function state(s,id){const cfg=config(id);if(!cfg)return null;s.spawns??={};return s.spawns[id]??=fresh(cfg,s,id);}
 function refill(s,id){const cfg=config(id),d=state(s,id);for(let guard=0;guard<10000;guard++){d.next??=choose(s,cfg,id);if(d.pool<d.next.score)return;d.queue.push(d.next);d.pool-=d.next.score;d.next=null;}throw Error('Spawn refill did not settle '+id);}
 function front(s,id){const d=state(s,id);if(!d)return null;if(!d.queue.length)refill(s,id);return d.queue[0]?.enemy||null;}
 // The front monster was defeated: free its score and refill at the player's current power.
 function kill(s,id){const d=state(s,id),gone=d.queue.shift();if(gone)d.pool+=gone.score;refill(s,id);return gone?.enemy||null;}
 // On entering: if the front can no longer be won from full HP (the player spent stats on skills since it spawned),
 // the population is refilled at the current power. A front that is still winnable stays in front after a defeat.
 function revalidate(s,id){const cfg=config(id),d=s.spawns?.[id];if(!cfg||!d?.queue.length)return false;const limit=cfg.targetActions*(cfg.upperStretch||3);
  if(winTurns(s,d.queue[0].enemy,limit,id)<=limit)return false;s.spawns[id]={queue:[],pool:cfg.capacity,next:null};refill(s,id);return true;}
 // Keep only valid saved populations; anything inconsistent restarts from the authored first tier.
 function normalize(raw){const out={};for(const [id,d]of Object.entries(raw||{})){const cfg=config(id);if(!cfg||!d||!Array.isArray(d.queue))continue;
  const allowed=new Map([...cfg.tiers.flatMap(t=>(t.members||[t.enemy]).map(id=>[id,true])),...cfg.elites.map(k=>[k,true])]),scores=new Set(cfg.tiers.map(t=>t.score)),entry=e=>e&&allowed.has(e.enemy)&&scores.has(e.score);
  const queue=d.queue.filter(entry).map(e=>({enemy:e.enemy,score:e.score})),pool=Number.isSafeInteger(d.pool)?d.pool:-1,next=entry(d.next)?{enemy:d.next.enemy,score:d.next.score}:null;
  if(queue.length===d.queue.length&&pool>=0&&queue.reduce((n,e)=>n+e.score,0)+pool===cfg.capacity)out[id]={queue,pool,next};}
  return out;}
 function composition(s,id){const d=state(s,id),out={};for(const e of d?.queue||[])out[e.enemy]=(out[e.enemy]||0)+1;return out;}
 // Read-only view for screens: never creates or changes the saved population.
 function preview(s,id){const cfg=config(id);if(!cfg)return {};const d=s.spawns?.[id]||fresh(cfg),out={};for(const e of d.queue)out[e.enemy]=(out[e.enemy]||0)+1;return out;}
 return Object.freeze({config,foe,revalidate,power,winTurns,state,front,kill,refill,normalize,composition,preview,log10});
})();

/* Shared labyrinth rules: the runtime engine and the planning bot both call these pure
 * functions, so measured results and play use one formula set. Parameters come from
 * MemoryLabyrinthParams (generated from docs/memory-labyrinth/planning/parameters.json).
 * Attack, HP and damage are log10 floats (approximate scientific notation); item counts,
 * points and receipts are exact integers with saved millionth remainders. */
const MemoryLabyrinthModel=(()=>{
 const lg=Math.log10,NEG=-Infinity,SCALE=1000000;
 // Display unit: every attack/HP (identities, monsters, guardians, item growth) is UNIT times the calibrated value;
 // stats() works in calibrated units and shifts its results, so exponent rewards and turn counts are unchanged.
 // Without an identity (the planning bot) a run starts at calibrated 1/1; the runtime Alice is ALICE_BASE,
 // like her world self (ATK 10 / HP 100, user 2026-10-24).
 const UNIT=10,U=lg(UNIT),ALICE_BASE=Object.freeze({attack:10,hp:100});
 function add(a,b){if(a===NEG)return b;if(b===NEG)return a;const h=Math.max(a,b);return h+lg(1+10**(-Math.abs(a-b)));}
 function sub(a,b){if(b===NEG)return a;if(b>=a-1e-12)return NEG;return a+Math.log1p(-(10**(b-a)))/Math.LN10;}
 const multOps=new Set(['attack_mult','hp_mult','first','momentum','full_open','damage_taken','first_taken','low_taken','low_attack','boss_damage','rest_speed','interval','drop_all_mult','z6_amplify','ramp_compound']);
 const powerOps=new Set(['attack_power','hp_power','base_power','local_zone_power','perm_power','final_both_power']);
 function trialById(p,id){return p.trials.find(t=>t.id===id)||null;}
 // Effects bag from a skill/trial snapshot. Product ops multiply, everything else adds within its own pool.
 function activeEffects(p,m,r){const list=[];if(!r.rules.disableTree)for(const s of p.skills)if(m.nodes.includes(s.id))list.push(s.effect);if(!r.rules.disableTrialRewards)for(const t of p.trials)if(m.trials.includes(t.id))list.push(t.reward.effect);const b={};for(const e of list){if(r.rules.disablePowers&&powerOps.has(e.op))continue;const product=multOps.has(e.op)||powerOps.has(e.op);b[e.op]=product?(b[e.op]??1)*e.value:(b[e.op]??0)+e.value;}return b;}
 // T30 adds one rule per floor; every other trial has fixed rules.
 function rulesFor(t,f){const r={...(t?.rules||{})};if(r.cumulativeFloorRules){r.basePower=.8;if(f>=1)r.zonePower=.8;if(f>=2)r.noRest=true;if(f>=3)r.enemyFirst=true;if(f>=4)r.damagePower=.9;}return r;}
 function freshMeta(){return {clears:0,points:0,spent:0,nodes:[],trials:[],rewards:[0,0,0,0,0]};}
 function enter(p,m,t=null){const r={floor:0,add:0,q:[0,0,0,0,0],remainders:[0,0,0,0,0,0],kills:0,floorKills:0,streak:0,lastTarget:null,lastOne:false,elapsed:0,rested:0,shield:NEG,rules:rulesFor(t,0),trial:t,rotation:{},targetLock:null,records:[],receipt:[],oneSave:false,bossOneHits:0,diff:0,seed:0,shortcut:false};r.bag=activeEffects(p,m,r);const max=stats(p,m,r).hp;r.hp=r.rules.startHpFraction?max+lg(r.rules.startHpFraction):max;return r;}
 // 混沌の記憶迷宮: entry strength is only the identity's base (Alice: attack 1, HP 1). Everything else is
 // in-run growth on top of it, computed in the old order (README 统一计算顺序): devoured additive items
 // and their upgrades -> five in-run zones -> five permanent zones -> zones 6-10 -> plain/boss/conditional
 // multipliers -> final powers. With no item devoured the growth is zero, so tree, trial rewards and
 // permanent memories never raise entry HP/ATK; they only amplify what the run devours.
 function stats(p,m,r,{boss=false,turn=0,full=false,low=false}={}){const b=r.bag,f=r.floor,local=r.q,addBonus=1+(b.add_effect||0)+(b.floor_add_effect||0)*(f+1),other=Math.floor(local.reduce((a,v)=>a+v,0)*(b.item_base_ratio||0));let bh=other+r.add*(addBonus+(b.add_hp||0))*(r.rules.addEffectMultiplier||1),ba=other+r.add*(addBonus+(b.add_attack||0))*(r.rules.addEffectMultiplier||1);ba+=bh*(b.hp_base_to_attack||0);let a=lg(ba)*(b.base_power||1)*(r.rules.basePower||1),h=lg(bh)*(b.base_power||1)*(r.rules.basePower||1),permanentLog=0,localLog=0,localHpLog=0;
  for(let i=0;i<5;i++){if(r.rules.disabledZone===i)continue;let z=1+(b['zone_'+i]||0);if(i===0)z+=Math.min(1,Math.floor(lg(Math.max(1,r.add)))*(b.zone_add_decades||0));if(i===1)z+=Math.min(1,r.streak*(b.zone_streak||0));if(i===2)z+=local.filter(x=>x>0).length*(b.zone_variety||0);if(i===4&&r.rested>0)z+=b.zone_rested||0;localHpLog+=lg(1+local[i]*p.zoneRates[i]*z*(r.rules.localZoneEffectMultiplier||1))*(b.local_zone_power||1)*(r.rules.zonePower||1);if(i===3&&boss)z+=b.zone_boss||0;localLog+=lg(1+local[i]*p.zoneRates[i]*z*(r.rules.localZoneEffectMultiplier||1))*(b.local_zone_power||1)*(r.rules.zonePower||1);
   if(!r.rules.noPermanentItems){const bonus=1+(b.perm_effect||0)+(i<2?(b.perm_early||0):(b.perm_late||0))+(b['zone_'+i]||0);permanentLog+=lg(1+m.rewards[i]*p.zoneRates[i]*(p.calibration.permanentRateScale??1)*bonus)*(b.perm_power||1)*(r.rules.zonePower||1);}}
  a+=localLog+permanentLog;h+=localHpLog+permanentLog;
  if(!r.rules.disableExtraZones){const z6=1+((b.z6||0)+f*(b.z6_floor||0))*(b.z6_amplify||1),z7h=1+(b.z7_common||0),z7a=z7h+(b.z7||0)+Math.min(4,r.streak*(b.z7_streak||0)),z8=1+(boss?(b.z8_boss||0)+f*(b.z8_floor||0):0),z9=1+(b.z9||0)+m.trials.length*(b.z9_per_trial||0),z10=1+(b.z10||0);a+=lg(z6*z7a*z8*z9*z10);h+=lg(z6*z7h*z9*z10);}
  a+=lg(b.attack_mult||1);h+=lg((b.hp_mult||1)*(r.rules.hpMultiplier||1));h*=(b.hp_power||1)*(b.final_both_power||1);
  // Combat rules (boss damage, first strike, full-HP opening, low-HP fury, ramp) and the exponent rewards act
  // on each blow, so they also shape the identity's own strike; the ATK/HP stats themselves stay the base.
  const cond=lg(boss?(b.boss_damage||1):1)+lg(turn===0?(b.first||1)*(r.lastOne?(b.momentum||1):1)*(r.rules.firstDamage||1):1)+lg(full&&turn<3?(b.full_open||1):1)+lg(low?(b.low_attack||1):1)+lg(1+Math.min(10,turn*(b.ramp||0)))+turn*lg(b.ramp_compound||1),pw=(b.attack_power||1)*(b.final_both_power||1)*(r.rules.damagePower||1);
  const ia=lg(r.idAttack||UNIT)-U,ih=lg(r.idHp||UNIT)-U,growth=a*(b.attack_power||1)*(b.final_both_power||1),hit=(a+cond)*pw,idHit=(ia+cond)*pw;
  // Everything above is in calibrated units; the displayed attack/HP/blows are UNIT times that.
  return {attack:add(ia,growth)+U,hp:add(ih,h)+U,hit:add(idHit,hit)+U,identityHit:idHit+U,growthAttack:growth+U,growthHp:h+U,growthHit:hit+U,identityAttack:ia+U,identityHp:ih+U,baseAttack:ba,baseHp:bh,localLog,permanentLog};}
 // Figures by id (generated params only; the planning parameters keep the seven plain profiles).
 const figureCache=new WeakMap();function figureOf(p,id){if(!p.chaos)return null;let map=figureCache.get(p);if(!map){map=new Map(p.chaos.figures.map(f=>[f.id,f]));figureCache.set(p,map);}return map.get(id)||null;}
 // 記憶の揺らぎ difficulty level (outside trials): enemy HP/ATK x enemyStep^Lv, items x(1+dropBonus Lv), shards x(1+shardBonus Lv).
 function difficulty(p,r){return p.chaos&&!r.trial?Math.max(0,r.diff||0):0;}
 function difficultyInfo(p,level){const d=p.chaos?.difficulty;if(!d)return {level:0,enemyLog:0,drop:1,shard:1};return {level,enemyLog:level*lg(d.enemyStep),drop:1+d.dropBonus*level,shard:1+d.shardBonus*level};}
 // Per-encounter texture: +-variance from a hash of the saved run seed, floor, slot and kill count.
 function roll(p,r,i){const v=p.chaos?.variance||0;if(!v||r.trial)return 1;let h=2166136261;for(const n of [r.seed||0,r.floor,i,r.kills])for(const c of String(n)+'|'){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return 1+v*(2*(h/4294967296)-1);}
 // Index 0-6: the floor's seven calibrated targets; 7: the floor guardian; 8-19 (generated params only):
 // the seven profiles again at x3 and x10. Memory figures carry their skills; trials fight plain numbers.
 function mob(p,r,i){const f=p.floors[r.floor],fig=figureOf(p,f.cast?.[i]),lv=difficultyInfo(p,difficulty(p,r)).enemyLog,skills=fig&&!r.trial?fig.skills:[];
  if(i===7){const g=lg(r.trial?1:p.chaos?.guardianScale?.[r.floor]||1)+lv+U;return {id:'boss',name:fig?.title||'記憶の守護者',figure:fig?.id,hp:lg(Number(f.boss.hp)*p.calibration.bossHpScale*(r.rules.bossHpMultiplier||1))+g,attack:lg(Number(f.boss.hp)*p.calibration.bossHpScale*p.calibration.bossAttackFraction*(r.rules.bossAttackMultiplier||1))+g,boss:true,skills};}
  if(!fig){const e=f.enemies[i];return {id:e.id,name:e.name,hp:lg(Number(e.hp))+U,attack:lg(Number(e.attack))+U,drops:e.drops,boss:false,skills:[]};}
  const k=lg(roll(p,r,i))+lv+U;return {id:fig.id,name:fig.title,figure:fig.id,tier:fig.tier,hp:lg(fig.hp)+k,attack:lg(fig.attack)+k,drops:fig.drops,boss:false,skills,roll:roll(p,r,i)};}
 // Whole fight resolved deterministically. Returns the outcome; trace adds per-turn values for display.
 // Memory-figure skills, the same for monsters and identities (r.idSkills): 先手 acts first with a x2
 // opening blow (two 先手 cancel the order), 連撃 x2 damage, 溜め x3 every third action, 堅牢 takes -40%,
 // 再生 heals 3% max HP per turn, 逆上 x2 at half HP or less, 吸精 heals 20% of the damage dealt.
 const SK={double:lg(2),charge:lg(3),first:lg(2),final:lg(2),armor:lg(.6),regen:lg(.03),lifesteal:lg(.2),half:lg(.5)};
 function simulate(p,m,r,e,trace=false){let hp=r.hp,shield=r.shield,enemy=e.hp,turn=0,retaliations=0,usedSave=false;const maximum=stats(p,m,r).hp,full=hp>=maximum-1e-10,b=r.bag,frames=trace?[]:null,seconds=t=>t*p.timing.attackSeconds*(b.interval||1)*(r.rules.intervalMultiplier||1);
  const ps=new Set(r.trial?[]:r.idSkills||[]),es=new Set(e.skills||[]),eMax=e.hp;
  function counter(){let damage=e.attack+lg(b.damage_taken||1)+(retaliations===0?lg(b.first_taken??1):0);if(hp<=maximum+lg(.3))damage+=lg(b.low_taken||1);if(e.boss)damage+=retaliations*lg(r.rules.bossAttackGrowth||1);
   if(es.has('double'))damage+=SK.double;if(es.has('charge')&&retaliations%3===2)damage+=SK.charge;if(es.has('first')&&retaliations===0)damage+=SK.first;if(es.has('final')&&enemy<=eMax+SK.half)damage+=SK.final;if(ps.has('armor'))damage+=SK.armor;
   retaliations++;const dealt=damage;if(shield!==NEG){const old=shield;shield=sub(shield,damage);damage=sub(damage,old);}hp=sub(hp,damage);if(es.has('lifesteal'))enemy=Math.min(eMax,add(enemy,dealt+SK.lifesteal));if(hp===NEG&&!r.oneSave&&b.death_save){hp=U;usedSave=true;return false;}if(hp!==NEG&&ps.has('regen'))hp=Math.min(maximum,add(hp,maximum+SK.regen));return hp!==NEG;}
  if((r.rules.enemyFirst||es.has('first')&&!ps.has('first'))&&!counter())return {win:false,turns:0,seconds:seconds(1),hp,usedSave,frames};
  for(;turn<1000;turn++){const st=stats(p,m,r,{boss:e.boss,turn,full,low:hp<=maximum+lg(.3)});let hit=st.hit;if(ps.has('double'))hit+=SK.double;if(ps.has('charge')&&turn%3===2)hit+=SK.charge;if(ps.has('first')&&turn===0)hit+=SK.first;if(ps.has('final')&&hp<=maximum+SK.half)hit+=SK.final;if(es.has('armor'))hit+=SK.armor;
   const before=enemy;enemy=sub(enemy,hit);if(ps.has('lifesteal'))hp=Math.min(maximum,add(hp,Math.min(hit,before)+SK.lifesteal));if(enemy!==NEG&&es.has('regen'))enemy=Math.min(eMax,add(enemy,eMax+SK.regen));if(e.boss&&turn+1<(r.rules.bossMinHits||1)&&enemy===NEG)enemy=0;if(frames)frames.push({enemy,hp});if(enemy===NEG)return {win:true,hp,shield,turns:turn+1,retaliations,full,usedSave,seconds:seconds(turn+1),frames};if(!counter()){if(frames)frames[frames.length-1].hp=hp;return {win:false,turns:turn+1,seconds:seconds(turn+1),hp,usedSave,frames};}if(frames)frames[frames.length-1].hp=hp;}
  return {win:false,turns:1000,seconds:seconds(1000),hp,frames};}
 function fight(p,m,r,e){const x=simulate(p,m,r,e);return x.win?x:null;}
 function drop(p,r,e,result){const b=r.bag;let common=1+Math.min(5,Math.floor(r.streak/10)*(b.drop_streak||0))+Math.min(2,Math.floor(r.streak/10)*(b.drop_long_streak||0))+(result.retaliations?(b.drop_counter||0):0)+(result.full&&result.turns===1?(b.drop_perfect||0):0)+r.floor*(b.drop_floor||0);common*=difficultyInfo(p,difficulty(p,r)).drop;const gains=[];for(let i=0;i<6;i++){let n=e.drops[i]*common*(b.drop_all_mult||1)*(1+(i===0?(b.drop_add||0):(b.drop_zone||0)+(i===1+(r.selectedZone||0)?(b.drop_selected||0):0)))*(i===0?(r.rules.addDropMultiplier||1):(r.rules.zoneDropMultiplier||1));const units=Math.round(n*SCALE)+(r.remainders[i]||0);if(!Number.isSafeInteger(units))throw Error('Labyrinth quantity range exceeded');gains[i]=Math.floor(units/SCALE);r.remainders[i]=units%SCALE;}
  r.add+=gains[0];for(let i=0;i<5;i++)r.q[i]+=gains[i+1];if(r.kills%100===0)r.add+=(b.hundred_add_kills||0)*p.floors[r.floor].dropScale;
  if(b.rotation_bonus){r.rotation[e.id]=e.drops;if(Object.keys(r.rotation).length===7){for(const base of Object.values(r.rotation)){r.add+=base[0];for(let i=0;i<5;i++)r.q[i]+=base[i+1];}r.rotation={};}}return gains;}
 function canRest(r){return !r.rules.noRest&&!r.rules.noHealing;}
 function restSeconds(p,r){return p.timing.restFullSeconds/(r.bag.rest_speed||1);}
 function rest(p,m,r){if(!canRest(r))return false;const st=stats(p,m,r);r.elapsed+=restSeconds(p,r);r.hp=st.hp;r.shield=r.bag.rest_shield?st.hp+lg(r.bag.rest_shield):r.shield;r.rested=10;r.lastOne=false;return true;}
 function eligible(r,e){if(r.shortcut&&!e.boss)return false;if(!e.boss&&r.rules.oneTargetPerFloor&&r.targetLock&&e.id!==r.targetLock)return false;if(r.rules.noConsecutiveTarget&&e.id===r.lastTarget)return false;if(!e.boss&&r.rules.maxOrdinaryKills&&r.kills>=r.rules.maxOrdinaryKills)return false;return true;}
 function bossOpen(r){return r.floorKills>=(r.rules.killsRequiredPerFloor||0);}
 // Win settlement: ordinary drops, or the floor's permanent receipt (once per run), then healing.
 function victory(p,m,r,e,result){const before=stats(p,m,r).hp;r.elapsed+=result.seconds;r.hp=result.hp;r.shield=result.shield;let gains=null;
  if(!e.boss){r.kills++;r.floorKills++;gains=drop(p,r,e,result);r.streak=e.id===r.lastTarget?r.streak+1:1;r.lastTarget=e.id;if(r.rules.oneTargetPerFloor)r.targetLock=e.id;}else{if(result.turns===1)r.bossOneHits++;if(!r.receipt.includes(r.floor)){const reward=p.floors[r.floor].permanentReward;m.rewards[reward.zone]+=reward.quantity*p.calibration.permanentRewardScale;r.receipt.push(r.floor);}}
  const after=stats(p,m,r).hp;if(!r.rules.noHealing){r.hp=add(r.hp,sub(after,before));let heal=(r.bag.heal_win||0)+(e.boss?(r.bag.heal_boss||0):0);if(heal){const healed=add(r.hp,after+lg(heal)),overflow=sub(healed,after);r.hp=Math.min(after,healed);if(r.bag.overheal_shield&&overflow!==NEG)r.shield=Math.min(after,add(r.shield,overflow));}}
  r.rested=Math.max(0,r.rested-1);r.lastOne=result.turns===1;return gains;}
 // Moving down after a guardian: new floor rules, floor gifts, HP grows only by the max-HP increase.
 function nextFloor(p,m,r){const f=r.floor;r.floor++;if(r.floor>=5)return false;r.floorKills=0;r.streak=0;r.lastTarget=null;r.lastOne=false;r.targetLock=null;r.rotation={};r.rules=rulesFor(r.trial,r.floor);const before=stats(p,m,{...r,floor:f}).hp;r.add+=(r.bag.floor_add_kills||0)*p.floors[r.floor].dropScale;const after=stats(p,m,r).hp;if(!r.rules.noHealing)r.hp=add(r.hp,sub(after,before));r.hp=Math.min(r.hp,after);return true;}
 // A completed run: +1 point (trials too); the trial's reward is recorded once.
 function clear(p,m,r){m.clears++;m.points+=r.trial?(p.policy.trialClearPoints??1):(p.policy.normalClearPoints??1);let first=false;if(r.trial&&!m.trials.includes(r.trial.id)){m.trials.push(r.trial.id);first=true;}return first;}
 function tierOpen(p,m,s){return m.spent>=p.tiers[s.tier-1].spentRequired;}
 function canBuy(p,m,id){const s=p.skills.find(x=>x.id===id);return !!s&&!m.nodes.includes(id)&&m.points>=s.cost&&tierOpen(p,m,s);}
 function buyNode(p,m,id){if(!canBuy(p,m,id))return false;const s=p.skills.find(x=>x.id===id);m.nodes.push(id);m.points-=s.cost;m.spent+=s.cost;return true;}
 // Trial gate (staged unlock): clear milestone, spent points, the previous trial in difficulty order, and for the last trial the zero-farm achievement.
 function trialOpen(p,m,t,achievement){return !m.trials.includes(t.id)&&m.clears>=t.unlock.clears&&m.spent>=t.unlock.spentRequired&&m.trials.length>=t.unlock.trialClearsRequired&&(!t.unlock.after||m.trials.includes(t.unlock.after))&&(!t.unlock.entryOneShotRequired||achievement);}
 function entryOneShot(p,m){const copy={...m,rewards:[...m.rewards],nodes:[...m.nodes],trials:[...m.trials]},r=enter(p,copy);for(let f=0;f<5;f++){const enemy=mob(p,r,7),result=fight(p,copy,r,enemy);if(!result||result.turns!==1)return false;victory(p,copy,r,enemy,result);if(f<4)nextFloor(p,copy,r);}return true;}
 // World bridge (scope=both only): five permanent zones with their both-scope bonuses, plus
 // plain both-scope multipliers. Conditional, healing and power effects stay labyrinth-only for now.
 // 混沌の記憶迷宮 bridge (generated params): one multiplier on world attack and HP alike, from progress only:
 // first clear, opened 記憶の揺らぎ levels (share of the top level), trials and full completion; about x10^52
 // (one `*`) at full completion. Nodes, trial rewards and permanent memories stay inside.
 function bridgeLog(p,m){const b=p.chaos.bridge,top=p.chaos.difficulty.maxLevel;return (m.clears>0?b.firstClearLog:0)+b.levelsLog*Math.min(1,(m.maxDifficulty||0)/top)+b.trialsLog*m.trials.length/p.trials.length+(m.complete?b.completeLog:0);}
 function worldMultipliers(p,m){if(p.chaos?.bridge){const v=bridgeLog(p,m);return {attackLog:v,hpLog:v};}const bag={};for(const s of p.skills)if(s.scope==='both'&&m.nodes.includes(s.id))merge(bag,s.effect);for(const t of p.trials)if(t.reward.scope==='both'&&m.trials.includes(t.id))merge(bag,t.reward.effect);
  let a=0;for(let i=0;i<5;i++){const bonus=1+(bag.perm_effect||0)+(i<2?(bag.perm_early||0):(bag.perm_late||0));a+=lg(1+m.rewards[i]*p.zoneRates[i]*(p.calibration.permanentRateScale??1)*bonus)*(bag.perm_power||1);}
  let h=a;const z6=1+(bag.z6||0)*(bag.z6_amplify||1),z7=1+(bag.z7_common||0),z9=1+(bag.z9||0)+m.trials.length*(bag.z9_per_trial||0),z10=1+(bag.z10||0);a+=lg(z6*z7*z9*z10*(bag.attack_mult||1));h+=lg(z6*z7*z9*z10*(bag.hp_mult||1));return {attackLog:a,hpLog:h};}
 function merge(b,e){const product=multOps.has(e.op)||powerOps.has(e.op);b[e.op]=product?(b[e.op]??1)*e.value:(b[e.op]??0)+e.value;}
 return Object.freeze({lg,NEG,SCALE,UNIT,ALICE_BASE,add,sub,multOps,powerOps,trialById,activeEffects,rulesFor,freshMeta,enter,stats,mob,simulate,fight,drop,canRest,restSeconds,rest,eligible,bossOpen,victory,nextFloor,clear,tierOpen,canBuy,buyNode,trialOpen,entryOneShot,worldMultipliers,figureOf,difficulty,difficultyInfo,roll,bridgeLog});
})();
if(typeof module!=='undefined')module.exports=MemoryLabyrinthModel;

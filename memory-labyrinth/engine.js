/* Pure isolated state machine for 混沌の記憶迷宮 (formerly アリスの記憶の迷宮). No DOM, wall clock, world catalog,
 * world combat or storage. Rules come from MemoryLabyrinthModel with MemoryLabyrinthParams.
 * Invariants: only foreground milliseconds advance a run; each fight is resolved by the
 * shared deterministic model when its duration elapses (a reload replays the same result);
 * floor receipts, clears, points and trial rewards settle once inside one transition;
 * nodes and trial rewards are snapshotted on entry, so new ones apply from the next run. */
const MemoryLabyrinth=(()=>{
 const M=MemoryLabyrinthModel,P=MemoryLabyrinthParams,NEG=M.NEG,VERSION=3,MAX_STEP_MS=60000;
 const nodeIds=new Set(P.skills.map(s=>s.id)),trialIds=new Set(P.trials.map(t=>t.id));
 const legacyTrials={no_rest:'T01',suppressed:'T02'};
 const legacyCosts={seed:1,harvest:1};
 const int=(v,lo=0,hi=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)?Math.max(lo,Math.min(hi,v)):lo;
 const num=(v,lo=0)=>typeof v==='number'&&Number.isFinite(v)?Math.max(lo,v):lo;
 const logv=v=>typeof v==='number'&&Number.isFinite(v)?v:NEG;
 // 混沌の記憶迷宮: anonymous memory figures (people met before this loop). Identities are labyrinth-only:
 // they never become world forms, and world forms, skills and inventory never come in.
 const X=P.chaos,figures=Object.fromEntries(X.figures.map(f=>[f.id,f])),ALICE='alice';
 function blankMeta(){return {clears:0,points:0,spent:0,nodes:[],trials:[],rewards:[0,0,0,0,0],entries:0,totalMs:0,achievement:false,attempts:{},legacyRefund:0,shards:0,met:[],identities:[ALICE],identity:ALICE,difficulty:0,maxDifficulty:0,topClears:0,complete:false,completeMs:0};}
 function fresh(){return {version:VERSION,meta:blankMeta(),run:null,lastResult:null};}
 function trial(id){return M.trialById(P,id);}
 // Identity: starting as a figure gives exactly her monster base HP/ATK (no variance, no difficulty) and
 // her skills. It is the only source of entry strength. Alice herself starts at attack 1, HP 1, no skills.
 function identityInfo(id){const f=figures[id];if(!f)return {id:ALICE,title:'アリス',category:null,race:null,floor:null,tier:null,guardian:false,hp:M.ALICE_BASE.hp,attack:M.ALICE_BASE.attack,skills:[],price:0,scene:null,combat:null};return {id,title:f.title,category:f.category,race:f.race,floor:f.floor,tier:f.tier,guardian:f.guardian,hp:f.hp*M.UNIT,attack:f.attack*M.UNIT,skills:[...f.skills],price:f.price,levelRequired:f.levelRequired,scene:f.scene,combat:f.combat};}
 const SLOTS=Array.from({length:20},(_,i)=>i).filter(i=>i!==7);
 function cast(floor,index){const f=figures[P.floors[floor].cast[index]];return {figure:f,title:f.title};}
 // Rebuild derived run fields (rules, effects bag, trial object, identity base) from the persisted snapshot.
 function hydrate(meta,run){const r=run.r;r.trial=trial(run.trialId);r.rules=M.rulesFor(r.trial,r.floor);r.bag=M.activeEffects(P,{nodes:run.snapshot.nodes,trials:run.snapshot.trials},r);const id=identityInfo(r.trial?ALICE:run.snapshot.identity);r.idAttack=id.attack;r.idHp=id.hp;r.idSkills=id.skills;if(r.trial)r.diff=0;return r;}
 // Lv.N+1 opens after ceil(levelClears x (N+1)) clears at the current top level N.
 function levelClearsNeeded(level){return Math.ceil(X.difficulty.levelClears*(level+1));}
 function difficultyView(state){const m=state.meta,level=state.run?state.run.r.diff||0:m.difficulty,info=M.difficultyInfo(P,level);return {...info,max:m.maxDifficulty,cap:X.difficulty.maxLevel,locked:!!state.run?.trialId,enemyStep:X.difficulty.enemyStep,topClears:m.topClears,needed:m.maxDifficulty<X.difficulty.maxLevel?levelClearsNeeded(m.maxDifficulty):null};}
 // Pick the 記憶の揺らぎ level: outside a run for the next entry, or between fights of a normal run.
 function setDifficulty(state,level){const m=state.meta,run=state.run;if(!Number.isInteger(level)||level<0||level>m.maxDifficulty)return false;if(run){if(run.trialId||!['ready','gate'].includes(run.phase))return false;run.r.diff=level;run.last='記憶の揺らぎを Lv.'+level+' にした。';}m.difficulty=level;return true;}
 function rewardKey(state){const m=state?.meta;return m?[m.rewards.join(','),m.nodes.length,m.trials.join(',')].join('|'):'';}
 function stats(state){const run=state.run;if(!run)return null;const r=run.r,st=M.stats(P,state.meta,r,{boss:false});return {...st,hpNow:r.hp,maxHp:st.hp};}
 function enemyOf(run,index){const e=M.mob(P,run.r,index),c=cast(run.r.floor,index);return {...e,name:c.title,figure:c.figure.id,scene:c.figure.scene,combat:c.figure.combat};}
 function meet(meta,figure){if(figure&&!meta.met.includes(figure))meta.met.push(figure);}
 // Met figures in floor/slot order with their identity stats, skills and price in 記憶の欠片.
 function identityList(state){const m=state.meta;return [{...identityInfo(ALICE),owned:true,cost:0},...X.figures.filter(f=>m.met.includes(f.id)).map(f=>({...identityInfo(f.id),owned:m.identities.includes(f.id),cost:f.price}))];}
 function buyIdentity(state,id){const m=state.meta,f=figures[id];if(state.run||!f||!m.met.includes(id)||m.identities.includes(id))return false;if(m.shards<f.price||m.maxDifficulty<f.levelRequired)return false;m.shards-=f.price;m.identities.push(id);return true;}
 function chooseIdentity(state,id){const m=state.meta;if(state.run||!m.identities.includes(id))return false;m.identity=id;return true;}
 // Whole-fight preview from the current HP: outcome, turns and seconds. No state change.
 function preview(state,index){const run=state.run;if(!run)return null;const e=enemyOf(run,index),x=M.simulate(P,state.meta,run.r,e);return {index,id:e.id,name:e.name,boss:e.boss,hp:e.hp,attack:e.attack,win:x.win,turns:x.turns,seconds:x.seconds,eligible:M.eligible(run.r,e)&&(!e.boss||M.bossOpen(run.r)),drops:e.drops?e.drops.map(d=>d*M.difficultyInfo(P,M.difficulty(P,run.r)).drop):null,skills:e.skills||[],tier:e.tier??null,roll:e.roll??1,figure:e.figure};}
 function fightView(state){const run=state.run;if(!run?.fight)return null;const e=enemyOf(run,run.fight.index),x=M.simulate(P,state.meta,run.r,e,true),progress=run.fight.durationMs?Math.min(1,run.fight.elapsedMs/run.fight.durationMs):1,turns=x.frames?.length||0,turn=turns?Math.min(turns-1,Math.floor(progress*turns)):0,frame=turns?x.frames[turn]:null;
  // turn/turnMs let the view time one exchange per turn; counter: the foe survived this turn's blow and strikes back.
  return {name:e.name,boss:e.boss,maxHp:e.hp,enemyHp:frame?frame.enemy:e.hp,hp:frame?frame.hp:run.r.hp,progress,turn,turnMs:turns?(run.fight.durationMs||1000)/turns:1000,counter:!!frame&&frame.enemy!==NEG,art:e.combat||e.scene||null};}
 function trialList(state){const m=state.meta;return P.trials.map(t=>({id:t.id,tier:t.tier,name:t.name,rules:t.rules,reward:t.reward,done:m.trials.includes(t.id),open:M.trialOpen(P,m,t,m.achievement),attempts:m.attempts[t.id]||0}));}
 function nodeList(state){const m=state.meta;return P.skills.map(s=>({...s,owned:m.nodes.includes(s.id),tierOpen:M.tierOpen(P,m,s),buyable:!state.run&&M.canBuy(P,m,s.id)}));}
 function shortcutOpen(meta){return meta.trials.includes(X.shortcut.trial);}
 function enter(state,{trialId=null,zone=0,identity=null,shortcut=false}={}){if(state.run)return false;const m=state.meta,t=trialId?trial(trialId):null;if(trialId&&(!t||!M.trialOpen(P,m,t,m.achievement)))return false;if(shortcut&&(t||!shortcutOpen(m)))return false;
  // Trials are always Alice herself at 記憶の揺らぎ Lv.0, against their calibrated plain numbers.
  let who=t?ALICE:identity||m.identity;if(!m.identities.includes(who))who=ALICE;const info=identityInfo(who);
  m.entries++;const snapshot={nodes:[...m.nodes],trials:[...m.trials],identity:who},r=M.enter(P,{...m,nodes:snapshot.nodes,trials:snapshot.trials},t);r.selectedZone=int(zone,0,4);r.seed=m.entries;r.diff=t?0:Math.min(m.difficulty,m.maxDifficulty);
  if(shortcut){r.shortcut=true;r.floor=P.floors.length-1;r.receipt=[];}
  state.run={id:String(m.entries),trialId:t?.id||null,snapshot,r,phase:'ready',fight:null,restMs:0,auto:false,explore:false,last:(t?'試練「'+t.nameJa+'」を始めた。':shortcut?'近道「'+X.shortcut.name+'」から最下層へ入った。':'混沌の記憶迷宮へ入った。')+(who===ALICE?'':'「'+info.title+'」として。')+(r.diff?' 記憶の揺らぎ Lv.'+r.diff+'。':'')};
  hydrate(m,state.run);const max=M.stats(P,m,r).hp;r.hp=r.rules.startHpFraction?max+Math.log10(r.rules.startHpFraction):max;return true;}
 function start(state,index,auto=false){const run=state.run;if(!run||run.phase!=='ready')return false;if(!Number.isInteger(index)||index<0||index>19)return false;const r=hydrate(state.meta,run),e=enemyOf(run,index);if(!M.eligible(r,e)||(e.boss&&!M.bossOpen(r)))return false;const x=M.simulate(P,state.meta,r,e);run.fight={index,elapsedMs:0,durationMs:Math.max(1,Math.round(x.seconds*1000))};run.auto=!e.boss&&auto===true;run.phase='fight';run.last=e.name+'と戦っている。';return true;}
 function stop(state){const run=state.run;if(!run||run.phase!=='fight')return false;run.fight=null;run.auto=false;run.phase='ready';run.last='戦闘を切り上げた。相手の傷は元に戻る。';return true;}
 function rest(state){const run=state.run;if(!run||!['ready','gate'].includes(run.phase))return false;const r=hydrate(state.meta,run);if(!M.canRest(r)||r.hp>=M.stats(P,state.meta,r).hp-1e-10)return false;run.restReturn=run.phase;run.phase='rest';run.restMs=Math.round(M.restSeconds(P,r)*1000);run.auto=false;run.last='休息している。';return true;}
 function nextFloor(state){const run=state.run;if(!run||run.phase!=='gate')return false;const r=hydrate(state.meta,run);M.nextFloor(P,state.meta,r);hydrate(state.meta,run);run.phase='ready';run.last='第'+(r.floor+1)+'層へ進んだ。';return true;}
 function retreat(state){const run=state.run;if(!run)return false;if(!['cleared','defeated'].includes(run.phase)){state.lastResult={kind:'retreat',runId:run.id,trialId:run.trialId,elapsedMs:Math.round(run.r.elapsed*1000)};if(run.trialId)state.meta.attempts[run.trialId]=(state.meta.attempts[run.trialId]||0)+1;}state.run=null;return true;}
 function setAuto(state,enabled){const run=state.run;if(!run)return false;run.auto=enabled===true&&run.phase==='fight'&&!enemyOf(run,run.fight.index).boss;return true;}
 function buy(state,id){if(state.run)return false;return M.buyNode(P,state.meta,id);}
 // Resolve the current fight with the same deterministic model the bot uses.
 function resolve(state){const run=state.run,m=state.meta,r=hydrate(m,run),index=run.fight.index,e=enemyOf(run,index),x=M.simulate(P,m,r,e);run.fight=null;
  if(x.win){M.victory(P,m,r,e,x);hydrate(m,run);meet(m,e.figure);
   if(e.boss){run.auto=false;const bonus=M.difficultyInfo(P,M.difficulty(P,r)).shard,shards=(X.currency.guardianShards[r.floor]||0)*bonus;m.shards+=shards;if(r.floor===P.floors.length-1){const first=M.clear(P,m,r),extra=X.currency.clearBonus*bonus;m.shards+=extra;
     // Achievement (gate of the last trial): every guardian of one normal run at 記憶の揺らぎ Lv.1 or
     // higher falls in one hit. (The old zero-farm entry one-shot is impossible now that entry strength
     // is only the identity base.)
     if(r.bossOneHits===P.floors.length&&!run.trialId&&r.diff>=1)m.achievement=true;let opened='';if(!run.trialId&&r.diff>=m.maxDifficulty&&m.maxDifficulty<X.difficulty.maxLevel){m.topClears++;if(m.topClears>=levelClearsNeeded(m.maxDifficulty)){m.maxDifficulty++;m.topClears=0;opened=' · 記憶の揺らぎ Lv.'+m.maxDifficulty+' が開いた';}else opened=' · 次の揺らぎまで踏破 '+m.topClears+'/'+levelClearsNeeded(m.maxDifficulty);}
     // Full completion: the shortcut run at the top level, 「ある創世の女神」 falls to the first blow on entry.
     if(r.shortcut&&r.diff>=X.difficulty.maxLevel&&x.turns===1&&!m.complete){m.complete=true;m.completeMs=m.totalMs;opened+=' · 混沌の記憶迷宮を完全踏破した';}
     run.phase='cleared';run.last=e.name+'を喰らった。'+(run.trialId?(first?'試練を達成した。報酬は次の探索から有効。':'試練を踏破した。'):'踏破した。心得 +1 pt · '+X.currency.name+' +'+count(shards+extra)+opened);state.lastResult={kind:'clear',runId:run.id,trialId:run.trialId,firstTrialClear:first,elapsedMs:Math.round(r.elapsed*1000)};}
    else{run.phase='gate';run.last=e.name+'を喰らった。結晶と'+X.currency.name+' +'+count(shards)+'を得た。';}}
   else{run.phase='ready';run.last=e.name+'を喰らった。';if(run.auto&&!start(state,index,true))run.auto=false;}
   return;}
  r.elapsed+=x.seconds;run.auto=false;
  if(x.usedSave){r.oneSave=true;r.hp=0;run.phase='ready';run.last='消えぬ記憶：致命の一撃をHP1で耐えた。戦闘は中断された。';return;}
  r.hp=NEG;meet(m,e.figure);run.phase='defeated';run.last=e.name+'に喰われかけた。その面影を覚えた。得た結晶は失われない。';if(run.trialId)m.attempts[run.trialId]=(m.attempts[run.trialId]||0)+1;state.lastResult={kind:'defeat',runId:run.id,trialId:run.trialId,elapsedMs:Math.round(r.elapsed*1000)};}
 function advance(state,milliseconds,{foreground=true}={}){const run0=state.run;if(!run0||!foreground||!Number.isFinite(milliseconds)||milliseconds<=0)return 0;let ms=Math.min(MAX_STEP_MS,Math.floor(milliseconds)),steps=0,guard=0;
  while(ms>0&&state.run&&guard++<100000){const run=state.run;
   if(run.phase==='fight'){const need=run.fight.durationMs-run.fight.elapsedMs,used=Math.min(ms,need);run.fight.elapsedMs+=used;ms-=used;state.meta.totalMs+=used;if(run.fight.elapsedMs>=run.fight.durationMs){resolve(state);steps++;}continue;}
   if(run.phase==='rest'){const used=Math.min(ms,run.restMs);run.restMs-=used;ms-=used;state.meta.totalMs+=used;if(run.restMs<=0){const r=hydrate(state.meta,run);M.rest(P,state.meta,r);run.phase=run.restReturn||'ready';delete run.restReturn;run.last='休息して回復した。';steps++;}continue;}
   if(run.explore&&autoStep(state))continue;
   break;}
  return steps;}
 // Foreground continuous exploration (after the first clear, never in trials): guardian when it falls
 // in one hit, otherwise the winnable target that adds the most guardian damage per second (heal cost
 // included); rest when hurt; on a clear,
 // re-enter a normal run. Only the host's foreground clock drives it; a defeat stops it.
 function autoStep(state){const run=state.run;if(!run?.explore)return false;
  if(run.phase==='cleared'){const zone=run.r.selectedZone||0;retreat(state);if(!enter(state,{zone}))return false;state.run.explore=true;return true;}
  if(run.phase==='defeated'){run.explore=false;return false;}
  const c=suggest(state);if(c&&command(state,c))return true;run.explore=false;run.last='連続探索を止めた。';return false;}
 // The planning bot's choice (balanced policy): guardian once it falls in one hit (or must take
 // several hits by rule); otherwise the target with the best guardian-damage gain per second,
 // counting the rest time its damage costs; rest when nothing is winnable.
 // Same rule as the planning bot: only take the guardian when the next floor still has a winnable target with the HP carried over.
 function safeNext(m,r,boss,x){if(r.floor===P.floors.length-1)return true;const mm={...m,rewards:[...m.rewards]},rr={...r,q:[...r.q],remainders:[...r.remainders],receipt:[...r.receipt],rotation:{...r.rotation}},won=M.fight(P,mm,rr,boss);if(!won)return false;M.victory(P,mm,rr,boss,won);M.nextFloor(P,mm,rr);return P.floors[rr.floor].enemies.some((_,i)=>{const e=M.mob(P,rr,i);return M.eligible(rr,e)&&M.simulate(P,mm,rr,e).win;});}
 function suggest(state){const run=state.run;if(!run)return null;if(run.phase==='gate')return {kind:'next'};if(run.phase!=='ready')return null;const m=state.meta,r=hydrate(m,run),max=M.stats(P,m,r).hp;
  const boss=M.mob(P,r,7);if(M.bossOpen(r)&&M.eligible(r,boss)){const x=M.simulate(P,m,r,boss);if(x.win&&(x.turns===1||r.rules.bossMinHits)&&safeNext(m,r,boss,x))return {kind:'target',index:7};}
  const current=M.stats(P,m,r,{boss:true}).hit;let best=null;
  for(const i of SLOTS){const e=M.mob(P,r,i);if(!M.eligible(r,e))continue;const x=M.simulate(P,m,r,e);if(!x.win)continue;const copy={...r,q:[...r.q],remainders:[...r.remainders],rotation:{...r.rotation},kills:r.kills+1};M.drop(P,copy,e,x);const gain=M.stats(P,m,copy,{boss:true}).hit-current,loss=M.sub(r.hp,x.hp),heal=loss===NEG?0:Math.min(1,10**(loss-max))*M.restSeconds(P,r),score=gain/(x.seconds+heal);if(!best||score>best.score)best={i,score};}
  if(best)return {kind:'target',index:best.i};if(M.canRest(r)&&r.hp<max-1e-10)return {kind:'rest'};if(M.bossOpen(r)&&M.eligible(r,boss)&&M.simulate(P,m,r,boss).win)return {kind:'target',index:7};return null;}
 function setExplore(state,enabled){const run=state.run;if(!run||run.trialId||state.meta.clears<1||['cleared','defeated'].includes(run.phase))return false;run.explore=enabled===true;if(run.explore&&run.phase!=='fight'&&run.phase!=='rest')autoStep(state);return true;}
 function command(state,c,{}={}){if(c?.kind==='explore')return setExplore(state,c.enabled);switch(c?.kind){case 'enter':{const ok=enter(state,{trialId:c.trialId||null,zone:c.zone,identity:c.identity||null,shortcut:c.shortcut===true});if(ok&&c.explore)setExplore(state,true);return ok;}case 'target':return start(state,c.index,c.auto===true);case 'stop':return stop(state);case 'rest':return rest(state);case 'next':return nextFloor(state);case 'retreat':return retreat(state);case 'buy':return buy(state,c.id);case 'auto':return setAuto(state,c.enabled);case 'identity':return chooseIdentity(state,c.id);case 'buyIdentity':return buyIdentity(state,c.id);case 'difficulty':return setDifficulty(state,c.level);default:return false;}}
 // World bridge: only scope=both growth, as exact rationals for the BigInt world.
 function rational(log){if(!(log>0))return {n:1n,d:1n};const e=Math.floor(log),mant=10**(log-e);return {n:BigInt(Math.round(mant*1e6))*10n**BigInt(e),d:1000000n};}
 function worldFactors(meta){const w=M.worldMultipliers(P,meta||blankMeta()),a=rational(w.attackLog),h=rational(w.hpLog);return {attackNumerator:a.n,attackDenominator:a.d,hpNumerator:h.n,hpDenominator:h.d,attackLog:w.attackLog,hpLog:w.hpLog};}
 const RUN_FIELDS=['floor','add','kills','floorKills','streak','elapsed','rested','bossOneHits','diff','seed'];
 function restoreRun(meta,raw){if(!raw||typeof raw!=='object'||!/^\d+$/.test(String(raw.id))||Number(raw.id)>meta.entries)return null;const t=raw.trialId&&trialIds.has(raw.trialId)?raw.trialId:null;const who=!t&&meta.identities.includes(raw.snapshot?.identity)?raw.snapshot.identity:ALICE,snap={nodes:(raw.snapshot?.nodes||[]).filter(id=>meta.nodes.includes(id)),trials:(raw.snapshot?.trials||[]).filter(id=>meta.trials.includes(id)),identity:who};const x=raw.r||{},r={};
  for(const k of RUN_FIELDS)r[k]=k==='elapsed'?num(x[k]):int(x[k]);r.diff=t?0:Math.min(r.diff,meta.maxDifficulty);r.shortcut=!t&&x.shortcut===true&&shortcutOpen(meta);r.floor=Math.min(4,r.floor);r.q=[0,1,2,3,4].map(i=>int(x.q?.[i]));r.remainders=[0,1,2,3,4,5].map(i=>int(x.remainders?.[i],0,M.SCALE-1));r.lastTarget=typeof x.lastTarget==='string'?x.lastTarget:null;r.lastOne=x.lastOne===true;r.hp=logv(x.hp);r.shield=logv(x.shield);r.receipt=[...new Set((x.receipt||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<=r.floor))];r.rotation=x.rotation&&typeof x.rotation==='object'?x.rotation:{};r.targetLock=typeof x.targetLock==='string'?x.targetLock:null;r.oneSave=x.oneSave===true;r.selectedZone=int(x.selectedZone,0,4);r.records=[];
  const run={id:String(raw.id),trialId:t,snapshot:snap,r,phase:['ready','fight','rest','gate','cleared','defeated'].includes(raw.phase)?raw.phase:'ready',fight:null,restMs:int(raw.restMs),auto:raw.auto===true,explore:raw.explore===true&&!t&&meta.clears>0,last:typeof raw.last==='string'?raw.last.slice(0,160):''};hydrate(meta,run);
  const max=M.stats(P,meta,r).hp;if(r.hp>max)r.hp=max;
  if(run.phase==='fight'){const f=raw.fight;if(f&&Number.isInteger(f.index)&&f.index>=0&&f.index<=19){const e=enemyOf(run,f.index),sim=M.simulate(P,meta,r,e);run.fight={index:f.index,durationMs:Math.max(1,Math.round(sim.seconds*1000)),elapsedMs:0};run.fight.elapsedMs=Math.min(run.fight.durationMs,int(f.elapsedMs));}else run.phase='ready';}
  if(run.phase==='rest'){run.restReturn=raw.restReturn==='gate'?'gate':'ready';if(!M.canRest(r))run.phase=run.restReturn;}
  if(r.hp===NEG&&run.phase!=='defeated'&&run.phase!=='cleared')run.phase='defeated';return run;}
 // Version 1 prototype saves: keep clears, unspent points, permanent items and history;
 // refund old upgrades once; map old trials to T01/T02; end a running old-rule run.
 function migrate(raw){const s=fresh(),m=s.meta,o=raw.meta||{},big=v=>{try{return /^\d{1,30}$/.test(String(v??0))?Number(BigInt(String(v??0))):0;}catch{return 0;}};
  m.clears=big(o.clears);m.entries=big(o.entries);m.totalMs=Number.isSafeInteger(o.totalMs)?Math.max(0,o.totalMs):0;m.rewards=[0,1,2,3,4].map(i=>big(o.rewards?.[i]));
  let refund=0;for(const [id,cost]of Object.entries(legacyCosts))refund+=int(o.skills?.[id],0,1000)*cost;m.legacyRefund=refund;m.points=Math.min(big(o.points),m.clears)+refund;
  for(const [old,id]of Object.entries(legacyTrials))if(o.trials?.[old]===true&&!m.trials.includes(id))m.trials.push(id);
  if(raw.run)s.lastResult={kind:'retreat',runId:String(raw.run.id||''),trialId:null,elapsedMs:0,legacyRunEnded:true};return s;}
 // Version 2 saves (before 混沌の記憶迷宮) load unchanged: the points tree, trials and rewards stay;
 // the new fields start empty (no shards, Alice only). Version 1 goes through the prototype migration.
 function normalize(raw){if(!raw||typeof raw!=='object')return fresh();if(raw.version===1)return migrate(raw);if(raw.version!==VERSION&&raw.version!==2)return fresh();const s=fresh(),m=s.meta,o=raw.meta||{};
  m.shards=int(o.shards);m.met=[...new Set((o.met||[]).filter(id=>figures[id]))];m.identities=[ALICE,...new Set((o.identities||[]).filter(id=>figures[id]&&m.met.includes(id)))];m.identity=m.identities.includes(o.identity)?o.identity:ALICE;m.maxDifficulty=int(o.maxDifficulty,0,X.difficulty.maxLevel);m.difficulty=int(o.difficulty,0,m.maxDifficulty);m.topClears=int(o.topClears,0,levelClearsNeeded(m.maxDifficulty)-1);m.complete=o.complete===true;m.completeMs=int(o.completeMs);
  m.clears=int(o.clears);m.entries=int(o.entries);m.totalMs=int(o.totalMs);m.achievement=o.achievement===true;m.legacyRefund=int(o.legacyRefund);m.rewards=[0,1,2,3,4].map(i=>num(o.rewards?.[i]));
  m.nodes=[...new Set((o.nodes||[]).filter(id=>nodeIds.has(id)))];m.spent=m.nodes.reduce((n,id)=>n+P.skills.find(x=>x.id===id).cost,0);m.points=int(o.points);
  m.trials=[...new Set((o.trials||[]).filter(id=>trialIds.has(id)))];for(const id of trialIds)if(Number.isSafeInteger(o.attempts?.[id]))m.attempts[id]=Math.max(0,o.attempts[id]);
  s.run=restoreRun(m,raw.run);if(raw.lastResult&&['clear','defeat','retreat'].includes(raw.lastResult.kind))s.lastResult={kind:raw.lastResult.kind,runId:String(raw.lastResult.runId||''),trialId:trialIds.has(raw.lastResult.trialId)?raw.lastResult.trialId:null,firstTrialClear:raw.lastResult.firstTrialClear===true,elapsedMs:int(raw.lastResult.elapsedMs)};return s;}
 function serialize(state){return JSON.stringify(state,(k,v)=>{if(typeof v==='bigint')return String(v);if(k==='trial'||k==='rules'||k==='bag')return undefined;return v===-Infinity?null:v;});}
 // World number style (systems/numbers.js): groups of four digits, 万 through 極, then the units repeat with *.
 const UNITS=['万','億','兆','京','垓','秭','穣','溝','澗','正','載','極'];
 function format(log){if(log===NEG||log===null||log===undefined)return '0';if(log<1){const v=10**log,d=v>=1?1:Math.min(6,1-Math.floor(log));return (Math.floor(v*10**d*(1+1e-9)+1e-9)/10**d).toLocaleString('ja-JP',{maximumFractionDigits:d});}if(log<4-1e-12)return String(Math.floor(10**log+1e-9));let group=Math.floor(log/4+1e-12),head=Math.floor(10**(log-4*group)*100*(1+1e-12))/100;if(head>=10000){group++;head=Math.floor(head/100)/100;}return head.toFixed(2).replace(/\.?0+$/,'')+UNITS[(group-1)%UNITS.length]+'*'.repeat(Math.floor((group-1)/UNITS.length));}
 // Counts kept as plain numbers (shards, items) use the same units.
 function count(n){return n>0?format(Math.log10(n)):'0';}
 return Object.freeze({VERSION,params:P,fresh,count,normalize,serialize,stats,preview,fightView,trialList,nodeList,enter,start,stop,rest,nextFloor,retreat,setAuto,buy,advance,command,setExplore,suggest,worldFactors,rewardKey,format,hydrate,cast,identityInfo,identityList,buyIdentity,chooseIdentity,difficultyView,setDifficulty,shortcutOpen,SLOTS});
})();

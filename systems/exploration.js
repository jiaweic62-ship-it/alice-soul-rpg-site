/* Card exploration runs (C.explorations; content/forest-exploration.json). A run walks one layer of an area step by
   step: its authored number of steps, the last one the guardian alone. Every other step offers 3 cards drawn once from
   the run's saved RNG (reloading never rerolls them); the player picks one. Battles auto-resolve in CollectionBattle (battle.run); HP persists through the
   run; a rest card heals and allows a form switch at that step; defeat or retreat ends the run in the village and
   keeps everything gained. Nothing here advances without a player choice: there is no auto exploration. */
const ExplorationRun=(()=>{
 const C=RPGCatalog,R=CollectionSystem,N=GameNumber.from,min=GameNumber.min,X=d=>C.explorations?.[d];
 const FIGHTS=['battle','swarm','ambush','elite'],RECENT=6;
 function fresh(seed=1){return {rng:((seed>>>0)^0x85ebca6b)>>>0,areas:{},run:null};}
 function state(s){return s.exploration??=fresh(s.rng);}
 function area(s,d){return state(s).areas[d]??={cleared:{},runs:0,wary:0};}
 function next(o){o.rng=(Math.imul(o.rng>>>0,1664525)+1013904223)>>>0;return o.rng;}
 function roll(o,n){return Math.floor(next(o)/4294967296*n);}
 function run(s){return s.exploration?.run||null;}
 // Reward areas (content/reward-zones.json): a short side area entered from a form card of a host layer. While inside,
 // layer(r) is the zone: its own monsters (scaled from the host layer's strongest regular monster at entry), events,
 // items and richer chests; the host layer's chest and background stay, and the host run resumes after the zone guardian.
 const Z=id=>C.explorationZones?.[id];
 // A zone's loot follows its target layer (user 2026-11-05: 宝箱、事件、金币、商店都按对齐层; scripts/apply-zone-difficulty.cjs
 // sets target): that layer's chest, chests, treasure and event chests (× the zone's own multipliers), gold and shop.
 function T(r){const t=r?.zone&&Z(r.zone.id)?.target;return t&&X(t.dungeon)?.layers[t.layer-1]?t:{dungeon:r.dungeon,layer:r.layer};}
 function layer(r){const h=X(r.dungeon).layers[r.layer-1];if(!r.zone)return h;const z=Z(r.zone.id),t=T(r),tl=X(t.dungeon).layers[t.layer-1];
  return {...z,chest:tl.chest||t.dungeon,chestMult:(tl.chestMult||1)*z.chestMult,eventBase:tl.eventBase*z.eventMult,treasure:tl.treasure*z.treasureMult,background:z.background||h.background};}
 // A merged area's deeper layers come from another former dungeon (layer.source): its enemies, chest (layer.chest) and
 // the memory route that used to open it (layer.opens).
 function members(d){const x=X(d);return new Set([d,...(x?.layers||[]).map(l=>l.source).filter(Boolean)]);}
 function layerOpen(s,d,n){const l=X(d)?.layers[n-1];return !!l&&(!l.opens||!!R.dungeonOpen(s,l.opens))&&(!l.requiresStory||!!s.completedStories?.[l.requiresStory]);}
 function chestOf(r){return layer(r).chest||r.dungeon;}
 // Form traits (content/forest-exploration.json traits, user 2026-10-23): the fairy goes unnoticed and may slip past any
 // non-guardian fight. Traits are never explained to the player and never change battle stats.
 function trait(s){return C.explorationTraits?.[s.active]||{};}
 // Chapter 2 dungeon mechanics (content/chapter2-<x>/mechanic.json, scripts/apply-chapter2.cjs; user 2026-11-03 「找出缺失 /
 // 实装」, CH1-VS-CH2-GAPS C): each chapter-two dungeon has one card of its own besides the puzzle and its routes.
 // alert (巨竜山脈): a hoard card; taking a lot raises the run's dragon alert and a full alert costs HP; a rest calms it.
 // candles (大墓地): a candle card lights one of a floor's candles for good; lit candles thin out swarms and ambushes on
 // that floor and the last one pays once. factions (王都): a checkpoint of one of three factions; helping one raises it
 // and lowers its rival, so only one can be friendly (pass) at a time. Standing and candles are saved per area.
 const MECH=['hoard','candle','faction'];
 const M=d=>X(d)?.mechanic||null;
 function lit(s,r){const m=M(r.dungeon);return m?.type==='candles'?Math.min(m.max,area(s,r.dungeon).candles?.[r.layer]||0):0;}
 function standing(s,d,id){return area(s,d).favor?.[id]||0;}
 const factionOf=(m,id)=>m?.factions?.find(f=>f.id===id)||null;
 const fillFaction=(m,f,t)=>typeof t==='string'?t.replaceAll('{faction}',f.name).replaceAll('{rival}',factionOf(m,f.rival)?.name||''):t;
 function layerWeights(s,r,l){const m=M(r.dungeon),w={...l.weights,rest:Math.ceil((l.weights.rest||0)/2),treasure:Math.ceil((l.weights.treasure||0)/2)};if(m?.type!=='candles'||r.zone)return w;const k=m.max-lit(s,r);
  return {...w,swarm:Math.round((w.swarm||0)*k/m.max),ambush:Math.round((w.ambush||0)*k/m.max)};}
 // The card face of a mechanic card ([title, text]); a checkpoint names its faction.
 function cardFace(r,c){const m=r&&M(r.dungeon),def=m&&X(r.dungeon).cards[c?.kind];if(!def||!MECH.includes(c.kind))return null;
  if(c.kind!=='faction')return [def.title,def.text];const f=factionOf(m,c.faction);return f?[fillFaction(m,f,def.title),f.text||fillFaction(m,f,def.text)]:null;}
 // One line for the run screen: the alert, this floor's candles or the three standings.
 function mechanicStatus(s){const r=run(s),m=r&&!r.zone&&M(r.dungeon);if(!m)return null;const dots=(n,k)=>'●'.repeat(n)+'○'.repeat(k-n);
  if(m.type==='alert')return m.label+'　'+dots(Math.min(r.alert||0,m.max),m.max);
  if(m.type==='candles')return m.label+'　'+dots(lit(s,r),m.max);
  if(m.type==='factions')return m.label+'　'+m.factions.map(f=>{const v=standing(s,r.dungeon,f.id);return f.name+' '+(v>0?'+'+v:v<0?'−'+(-v):'±0');}).join('・');
  return null;}
 function mechanicOptions(s,r){const m=M(r.dungeon),def=X(r.dungeon).cards[r.choice.kind];if(!m||!def)return [];
  if(r.choice.kind==='hoard'){const near=(r.alert||0)+1>=m.max;return def.options.map(o=>o.effect?.alert&&near?{...o,detail:o.detail+m.warn}:o);}
  if(r.choice.kind==='candle')return def.options;
  const f=factionOf(m,r.choice.faction);if(!f)return [];const v=standing(s,r.dungeon,f.id),cold=v<=m.distrustAt;
  return def.options.filter(o=>!(o.minStanding>v)).map(o=>{const e=JSON.parse(JSON.stringify(o.effect||{})),plain=cold&&o.distrust;
   if(e.favor)e.favor={id:f.id,d:e.favor,...(o.rival?{rival:f.rival}:{})};if(plain)delete e.treasureBps;
   return {...o,label:fillFaction(m,f,o.label),detail:fillFaction(m,f,plain?o.distrust.detail:o.detail),result:fillFaction(m,f,plain?o.distrust.result:o.result),effect:e};});}

 function highest(s,d){let n=0;const a=area(s,d);while(a.cleared[n+1])n++;return n;}
 function souls(s,d){const x=X(d);return x?R.quantity(s,x.souls.item):0n;}
 // Effects of events still active in the run (they count down per enemy defeated).
 function mods(r){const m={hpBps:10000,attackBps:10000,chestBps:0,healBps:0};for(const a of r?.effects||[]){if(a.enemyHpBps)m.hpBps=m.hpBps*a.enemyHpBps/10000;if(a.enemyAttackBps)m.attackBps=m.attackBps*a.enemyAttackBps/10000;m.chestBps+=a.chestBonusBps||0;m.healBps+=a.healPerBattleBps||0;}return m;}
 // The enemy as it fights in a run: the queued fight's overrides and the run's active effects.
 function foe(b,id){let e=C.enemies[id];if(!e||!b?.run||e.story)return e;const q=b.queue?.[0],m=b.mods||{hpBps:10000,attackBps:10000};if(q?.base&&q.enemy===id)e={...e,hp:q.base.hp,attack:q.base.attack};
  // A guardian that is also an ordinary monster has its guardian skill only here (C.guardianSkills, apply-boss-skills.cjs).
  const gs=(q?.guardian||q?.kind==='guardian')&&q.enemy===id&&C.guardianSkills?.[id];if(gs)e={...e,...gs};
  const hp=Math.round((q?.hpBps||10000)*m.hpBps/10000),at=Math.round((q?.attackBps||10000)*m.attackBps/10000);if(hp===10000&&at===10000&&!q?.label)return e;
  return {...e,name:q?.label||e.name,hp:String(GameNumber.max(1n,N(e.hp)*BigInt(hp)/10000n)),attack:String(N(e.attack)*BigInt(at)/10000n)};}
 // A zone monster's strength in this run: its share (zoneScale) of the reference monster saved when the zone was entered.
 // A zone with a fixed reference (scripts/apply-zone-difficulty.cjs, user 2026-11-04: 获取形态后下一层的难度) fights at it from any
 // host layer, saved zone runs included; chests still follow the host layer.
 function zb(r,id){const e=C.enemies[id],z=r?.zone;if(!e?.zoneScale||!z)return {};const ref=Z(z.id)?.ref||z.ref,k=(v,b)=>String(GameNumber.max(1n,N(v)*BigInt(b)/10000n));return {base:{hp:k(ref.hp,e.zoneScale.hpBps),attack:k(ref.attack,e.zoneScale.attackBps),chests:e.zoneChests?String(e.zoneChests):z.ref.chests}};}
 // The outcome a fight card promises from the current HP, simulated with the battle code ('？' until that enemy has
 // been fought once, won or lost; a layer guardian always shows its real odds): 'easy' (楽勝, under 15% of
 // max HP lost), 'win' (勝てる), 'risky' (危うい, wins but loses half or more) or 'lose' (勝てない). Swarms fight their
 // whole count without healing; ambush and boost overrides come from the card.
 const GRADES={easy:'楽勝',win:'勝てる',risky:'危うい',lose:'勝てない',unknown:'？'};
 function estimate(s,c){const r=run(s),st=R.stats(s),id=c.enemy||c.id,base=C.enemies[id];if(!base)return null;if(!s.seenEnemies?.[id]&&c.kind!=='guardian')return {grade:'unknown',label:GRADES.unknown};const e=r?foe({run:true,queue:[c],mods:mods(r)},id):base;let hp=N(s.hp),start=hp;for(let k=0;k<(c.count||1);k++){const result=BattleSystem.predict(st,e,{playerHp:hp,limit:c.escapeAfter||60,resolvePhase:id=>C.enemies[id]});if(result.outcome!=='victory')return {grade:'lose',label:GRADES.lose};hp=result.playerHp;if(hp<st.hp)hp=min(st.hp,hp+st.hp*st.killHealBps/10000n);}const lost=Number((start-hp)*100n/(st.hp||1n)),grade=lost<15?'easy':lost<50?'win':'risky';return {grade,label:GRADES[grade]};}
 function winnable(s,id,limit=20,full=false){const st=R.stats(s),e=typeof id==='object'?id:C.enemies[id];return BattleSystem.predict(st,e,{playerHp:full?st.hp:s.hp,limit,resolvePhase:id=>C.enemies[id]}).outcome==='victory';}
 function canStart(s,d,l){const x=X(d);return !!x&&!run(s)&&!s.battle&&!!R.dungeonOpen(s,d)&&N(s.hp)>0n&&Number.isInteger(l)&&l>=1&&l<=x.layers.length&&l<=highest(s,d)+1&&layerOpen(s,d,l);}
 function start(s,d,l){if(!canStart(s,d,l))return false;const st=state(s),a=area(s,d),o=X(d).layers[l-1].opens;if(o&&C.dungeons[o]?.firstEntryFormId)(s.enteredDungeons??={})[o]=true;a.runs++;if(a.wary>0)a.wary--;
  st.run={dungeon:d,layer:l,step:0,rng:next(st),cards:null,choice:null,rested:-1,effects:[],used:{},gained:{chests:'0',kills:0,gold:'0'},result:null,...(X(d).layers[l-1].water?{water:area(s,d).water||X(d).layers[l-1].water}:{})};
  st.run.shopStep=shopStep(s,st.run,X(d).layers[l-1]);s.dungeon=d;s.enteredDungeons[d]=true;s.view='run';s.battle=null;draw(s);R.touch(s);return true;}
 // Academy experiments use explicit player-visible rules and pure input replay.
 const experiments=()=>C.academyExperiments||{};
 const expDef=id=>experiments()[id];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function expInitial(d){if(d.type==='recipe')return Object.fromEntries(d.ingredients.map(k=>[k.id,0]));if(d.type==='order')return d.entries.map(k=>k.id);if(d.type==='matching')return {};if(d.type==='process')return {...d.initial};return [];}
 function expApply(d,input,action){let v=JSON.parse(JSON.stringify(input));const [op,a,b]=action.split(':');
  if(d.type==='sequence'&&op==='push'&&d.tokens.some(k=>k.id===a)&&v.length<d.sequence.length){v.push(a);return v;}
  if(d.type==='recipe'&&['add','remove'].includes(op)&&d.ingredients.some(k=>k.id===a)){const n=v[a]+(op==='add'?1:-1);if(n>=0&&n<=d.maxEach){v[a]=n;return v;}}
  if(d.type==='elimination'&&op==='toggle'&&d.candidates.some(k=>k.id===a))return v.includes(a)?v.filter(k=>k!==a):[...v,a];
  if(d.type==='order'&&['up','down'].includes(op)){const i=v.indexOf(a),j=i+(op==='up'?-1:1);if(i>=0&&j>=0&&j<v.length){[v[i],v[j]]=[v[j],v[i]];return v;}}
  if(d.type==='matching'&&d.slots.some(k=>k.id===a)){if(op==='clear'){delete v[a];return v;}if(op==='set'&&d.items.some(k=>k.id===b)){for(const k of Object.keys(v))if(v[k]===b)delete v[k];v[a]=b;return v;}}
  if(d.type==='process'&&op==='act'){const act=d.actions.find(k=>k.id===a);if(act&&Object.entries(act.requires||{}).every(([k,val])=>v[k]===val)){Object.assign(v,act.set);return v;}}
  return null;
 }
 function expReplay(d,actions){if(!Array.isArray(actions)||actions.length>200)return null;let input=expInitial(d);for(const action of actions){if(typeof action!=='string')return null;input=expApply(d,input,action);if(input===null)return null;}return input;}
 function expSolved(d,v){if(d.type==='sequence')return same(v,d.sequence);if(d.type==='recipe')return Object.entries(d.recipe).every(([k,n])=>v[k]===n);if(d.type==='elimination'){const accepted=d.candidates.filter(c=>d.conditions.every(q=>q.op==='eq'?c.properties[q.field]===q.value:c.properties[q.field]!==q.value)).map(c=>c.id);return d.candidates.every(c=>v.includes(c.id)===!accepted.includes(c.id));}if(d.type==='order')return d.before.every(([a,b])=>v.indexOf(a)<v.indexOf(b));if(d.type==='matching')return Object.entries(d.pairs).every(([slot,item])=>v[slot]===item);if(d.type==='process')return Object.entries(d.goal).every(([k,val])=>v[k]===val);return false;}
 function expProgress(s,d){const a=area(s,d.dungeon),all=a.experimentProgress??={};let p=all[d.id];if(!p||p.revision!==d.revision||expReplay(d,p.actions)===null)p=all[d.id]={revision:d.revision,actions:[],feedback:''};return p;}
 function experimentView(s){const r=run(s),d=r?.choice?.kind==='experiment'&&expDef(r.choice.id);if(!d)return null;const p=expProgress(s,d),definition=JSON.parse(JSON.stringify(d));delete definition.recipe;delete definition.pairs;return {definition,progress:{actions:[...p.actions],input:expReplay(d,p.actions),feedback:p.feedback||''},completed:area(s,d.dungeon).experiments?.[d.id]===d.revision};}
 function experimentOptions(s){const view=experimentView(s);if(!view)return [];const d=view.definition,v=view.progress.input,out=[],add=(id,label,detail='')=>out.push({id,label,detail});
  if(d.type==='sequence')for(const k of d.tokens)if(v.length<d.sequence.length)add('push:'+k.id,k.label);
  if(d.type==='recipe')for(const k of d.ingredients){if(v[k.id]<d.maxEach)add('add:'+k.id,k.label+' +1');if(v[k.id]>0)add('remove:'+k.id,k.label+' −1');}
  if(d.type==='elimination')for(const k of d.candidates)add('toggle:'+k.id,(v.includes(k.id)?'除外を戻す：':'除外する：')+k.label);
  if(d.type==='order')for(const [i,id]of v.entries()){const k=d.entries.find(k=>k.id===id);if(i>0)add('up:'+id,k.label+' ↑');if(i<v.length-1)add('down:'+id,k.label+' ↓');}
  if(d.type==='matching')for(const slot of d.slots){for(const item of d.items)add('set:'+slot.id+':'+item.id,slot.label+' ← '+item.label);if(v[slot.id])add('clear:'+slot.id,slot.label+'を空ける');}
  if(d.type==='process')for(const act of d.actions)if(Object.entries(act.showWhen||{}).every(([k,val])=>v[k]===val))add('act:'+act.id,act.label,act.detail||'');
  add('submit','確かめる');if(view.progress.actions.length)add('undo','ひとつ戻す');add('reset','最初から組み直す');return out;
 }
 function answerExperiment(s,id,report){const r=run(s),view=experimentView(s);if(!view||!experimentOptions(s).some(o=>o.id===id))return null;const d=expDef(view.definition.id),p=expProgress(s,d),out={kind:'runOption',choice:'experiment',id:d.id,option:id};
  if(id==='submit'){if(expSolved(d,view.progress.input)){(area(s,d.dungeon).experiments??={})[d.id]=d.revision;delete area(s,d.dungeon).experimentProgress[d.id];r.choice=null;out.text=d.success;out.experimentCompleted=true;step(s,r);}else p.feedback=d.retry;}
  else if(id==='reset'){p.actions=[];p.feedback='最初の状態に戻した。';}
  else if(id==='undo'){p.actions.pop();p.feedback='ひとつ前の状態に戻した。';}
  else if(p.actions.length>=200)p.feedback='操作記録がいっぱい。ひとつ戻すか、最初から組み直せる。';
  else{const input=expApply(d,view.progress.input,id);if(input===null){const act=d.type==='process'&&d.actions.find(a=>'act:'+a.id===id);p.feedback=act?.failureHints?Object.entries(act.requires||{}).filter(([k,val])=>view.progress.input[k]!==val).map(([k])=>act.failureHints[k]).filter(Boolean).join(' '):d.invalid||'今の状態では、その操作はできない。手順の条件を確かめよう。';}else{p.actions.push(id);p.feedback=d.type==='process'?(d.actions.find(a=>'act:'+a.id===id)?.result||''):'';}}
  report.events.push(out);R.touch(s);return out;
 }
 // ---- cards ----
 function pick(r,weights,skip){const ks=Object.keys(weights).filter(k=>weights[k]>0&&!skip.has(k));if(!ks.length)return null;let t=roll(r,ks.reduce((n,k)=>n+weights[k],0));for(const k of ks){t-=weights[k];if(t<0)return k;}return ks.at(-1);}
 function member(r,tier){return tier[roll(r,tier.length)];}
 // The layer's own elite or guardian item (content/chapter1-v2/layer-drops.json); no other layer shares it.
 function dropOf(r,kind){if(r.zone)return Z(r.zone.id)?.drops?.[kind]||null;return C.layerDrops?.[r.dungeon]?.[r.layer]?.[kind]||null;}
 // Battle cards follow the player's power like the old population: the highest tier won from full HP within
 // TARGET_ACTIONS actions (the lowest tier when none is). Early steps of a layer stay one tier lower.
 const TARGET_ACTIONS=5,ELITE_FROM=2,CARDS=3,HINT_FORM_ODDS=3,FIGHT_THIRD_BPS=6000;
 // User 2026-11-03: one elite a run (r.used.elite); rest and treasure cards half as often and at most RT_MAX taken a run
 // (休息卡和找到宝箱这类卡……感觉很重复); ENV cards only on a run's first step.
 const RT_MAX=2,ENV=['sluice','candle'];
 function tierFor(s,r,l){if(l.fixedTiers)return r.step<Math.floor(l.steps/3)?0:l.tiers.length-1;// user 2026-11-04: a layer's own monsters come by step, beatable or not (scripts/apply-layer-loot.cjs)
 let t=0;for(let i=l.tiers.length-1;i>0;i--)if(winnable(s,l.tiers[i][0],TARGET_ACTIONS,true)){t=i;break;}if(t>0&&r.step<Math.floor(l.steps/3))t--;return t;}
 // Healing (user 2026-11-07: 不要再设计回复卡了，回复卡每层中间出一次): a rest card or an event that heals shows once a run,
 // on one of three middle steps (from half the layer on, never the guardian step); the last of them always offers one.
 // Reward zones never offer one (user 2026-11-07: 奖励层不给休息卡).
 function healEvent(e){const h=f=>!!(f&&(f.healBps||f.duration?.healPerBattleBps));return !!e&&(h(e.effect)||(e.options||[]).some(o=>h(o.effect)));}
 function storyEvent(e){return !!e&&!!(e.once||e.quest||e.requires?.chain);}
 function healWindow(r){const n=layer(r).steps,lo=Math.ceil(n/2)-1;return [lo,Math.min(lo+2,n-2)];}
 function healDone(r){return Object.keys(r.used||{}).some(k=>k.startsWith('hs:')&&!k.endsWith(':'+r.step));}
 function healOk(r){if(r.zone)return false;const [lo,hi]=healWindow(r);return r.step>=lo&&r.step<=hi&&!healDone(r);}
 function eventAvailable(s,r,id,anyForm=false){const e=C.dungeonEvents.events[id],q=e.requires||{};if(r.used['ev:'+id])return false;if(e.effect&&onlyCapped(s,r,e.effect))return false;if(e.once&&area(s,r.dungeon).once?.[id])return false;if(e.runCap&&Object.keys(r.used).filter(k=>k.startsWith('fs:')&&!k.endsWith(':'+r.step)).length>=e.runCap)return false;if(q.winnable&&!winnable(s,q.winnable))return false;if(q.env?.water&&r.water!==q.env.water)return false;if(q.populations&&r.water!=='low')return false;
  // Event table conditions: current form, owned characters, stories read, HP or soul state, cooldown in runs and
  // chain steps (a later step only in a later run than the step before it).
  const a=area(s,r.dungeon);if(!anyForm&&(q.forms&&!q.forms.includes(s.active)||q.notForms?.includes(s.active)))return false;if(q.owned&&!q.owned.every(k=>s.owned[k]))return false;if(q.stories&&!q.stories.every(k=>s.completedStories?.[k]))return false;
  if(q.state){const st=R.stats(s),hp=N(s.hp)*100n;if(q.state==='low'&&hp>=st.hp*40n)return false;if(q.state==='high'&&hp<st.hp*90n)return false;if(q.state==='souls'&&souls(s,r.dungeon)+2n*BigInt(X(r.dungeon).souls.per||1)<N(X(r.dungeon).souls.cap))return false;}
  if(e.cooldown&&Number.isSafeInteger(a.lastRun?.[id])&&a.runs-a.lastRun[id]<e.cooldown)return false;
  if(q.chain){const c=a.chains?.[q.chain.id];if(q.chain.step===1?c!==undefined:c!==q.chain.step-1||a.runs<=(a.chainRun?.[q.chain.id]??0))return false;}
  return true;}
 // A reward that would be lost: only items or souls, all at their cap.
 function onlyCapped(s,r,e){const keys=Object.keys(e).filter(k=>!['chain','chainEnd','damageBps'].includes(k));if(!keys.length||keys.some(k=>!['items','soul','material','layerElite'].includes(k)))return false;
  const full=id=>!id||!C.items[id]||R.quantity(s,id)>=N(C.items[id].cap);return Object.keys(e.items||{}).every(full)&&(!e.soul||soulsFull(s,r))&&(!e.material||full(material(r,e.material.role)))&&(!e.layerElite||full(dropOf(r,'elite')));}
 function characterReady(s,id){const f=R.entryForm(id);return !s.owned[id]&&!C.characters[id].retired&&(!f||s.owned[f]&&s.active===f)&&R.conditions(s,id).every(c=>c.met);}
 // A form card: the exact form (form), one of several (forms), any form but some (notForms), the run's water level, and
 // a solved academy experiment (experiment, the T7 route cards).
 function formFits(s,r,f){const a=s.active;return (!f.zone||!!Z(f.zone)&&!r.zone&&(!f.layers||f.layers.includes(r.layer)))&&!!s.owned[a]&&(!f.form||f.form===a)&&(!f.forms||f.forms.includes(a))&&(!f.notForms||!f.notForms.includes(a))&&(!f.water||r.water===f.water)&&(!f.experiment||area(s,r.dungeon).experiments?.[f.experiment]===expDef(f.experiment)?.revision);}
 // Form cards the current form can find on this step of the run.
 function formOptions(s,r){const a=area(s,r.dungeon);return X(r.dungeon).forms.filter(f=>(!f.layers||f.layers.includes(r.layer))&&formFits(s,r,f)&&!r.used['form:'+f.id]&&!(f.id==='fairy_gathering'&&a.wary>0)).map(f=>f.id);}
 // Only valid reward-area entrances can hint in a different owned form. Ordinary form events stay hidden.
 // Story-character entry hints keep their existing rules; the table allows at most one hint per step.
 function formHints(s,r){const a=area(s,r.dungeon);return X(r.dungeon).forms.filter(f=>(!f.layers||f.layers.includes(r.layer))&&!formFits(s,r,f)&&!r.used['form:'+f.id]&&!(f.id==='fairy_gathering'&&a.wary>0)&&wants(s,r,{kind:'form',id:f.id})).map(f=>f.id);}
 function fitsAs(s,r,c,k){const a=s.active;s.active=k;try{return fits(s,r,c);}finally{s.active=a;}}
 function wants(s,r,c){if(fits(s,r,c))return null;let ks=null;
  if(c.kind==='form'){const f=X(r.dungeon).forms.find(f=>f.id===c.id);ks=f?.zone&&Z(f.zone)&&!r.zone&&(!f.layers||f.layers.includes(r.layer))?(f.form?[f.form]:f.forms||null):null;}
  else if(c.kind==='character'){const f=R.entryForm(c.id);ks=f?[f]:null;}
  const own=(ks||[]).filter(k=>k!==s.active&&s.owned[k]&&fitsAs(s,r,c,k));return own.length?own:null;}
 function hintText(s,r,c){const ks=wants(s,r,c);if(!ks)return null;if(c.kind==='form'){const f=X(r.dungeon).forms.find(f=>f.id===c.id);return f.hintText||'……奥へ続く道がある。今は、入口の様子だけ覚えておこう。';}const name=k=>C.characters[k]?.name||k,look=ks.includes('alice')?'元の姿':ks.slice(0,2).map(name).join('か')+(ks.length>2?'あたり':'')+'の姿';
  return c.kind==='character'?'……この相手には、'+look+'で会ったほうがよさそうね。休めるところで姿を変えておきましょう。':'……ここは'+look+'のほうが都合がよさそうね。休めるところで姿を変えておきましょう。';}
 function hint(s,c){const r=run(s);return r&&c?hintText(s,r,c):null;}
 function make(s,r,l,x,kind,hintOk=false){
  if(FIGHTS.includes(kind)){const b=x.battles[kind];let enemy,count=1,hpBps=10000,attackBps=10000,label='',sensed=false;
   const tier=l.tiers[tierFor(s,r,l)];
   if(kind==='swarm'){enemy=member(r,l.tiers[0]);count=l.swarmCount??b.count;}else if(kind==='ambush'){enemy=member(r,tier);}else if(kind==='elite'){enemy=l.elite;if(l.eliteBoost){hpBps=l.eliteBoost.hpBps||10000;attackBps=l.eliteBoost.attackBps||10000;label=l.eliteBoost.label||'';}}else enemy=member(r,tier);
   // An ally won through an event chain (the fox family after 貸しを作っておく) warns of ambushes on its layers, in any form.
   let ally=null;if(kind==='ambush'){const ch=area(s,r.dungeon).chains||{};ally=(b.allies||[]).find(a=>ch[a.chain]===a.step&&(!a.layers||a.layers.includes(r.layer)))||null;if(b.sense?.includes(s.active)||ally){sensed=true;hpBps=b.senseHpBps;}else attackBps=l.ambushAttackBps??b.attackBps;}
   const drop=kind==='elite'?dropOf(r,'elite'):null,rare=kind==='elite'?dropOf(r,'eliteRare'):null;
   const eb=kind==='elite'?l.eliteBoost:null;return {kind,enemy,count,chestBps:Math.round((b.chestBps||10000)*(eb?.chestBps||10000)/10000),...(eb?.goldBps?{goldBps:eb.goldBps}:{}),...zb(r,enemy),...(drop?{drop}:{}),...(rare?{rare}:{}),...(hpBps!==10000?{hpBps}:{}),...(attackBps!==10000?{attackBps}:{}),...(label?{label}:{}),...(sensed?{sensed}:{}),...(ally&&!b.sense?.includes(s.active)?{ally:ally.chain}:{})};}
  // Recently seen events are held back while others remain; events never seen in this area weigh double.
  if(kind==='event'){const table=l.events||x.events,all=table.filter(id=>!storyEvent(C.dungeonEvents.events[id])&&eventAvailable(s,r,id)&&(healOk(r)||!healEvent(C.dungeonEvents.events[id]))),a=area(s,r.dungeon),fresh=all.filter(id=>!a.recent?.includes(id)),ids=fresh.length?fresh:all;if(!ids.length)return null;const w=C.dungeonEvents.rarityWeights,ev=C.dungeonEvents.events,weight=id=>(ev[id].weight??w[ev[id].rarity])*(a.seen?.[id]?1:2)*4;let t=roll(r,ids.reduce((n,id)=>n+weight(id),0));for(const id of ids){t-=weight(id);if(t<0)return {kind,id};}return {kind,id:ids.at(-1)};}
  // The form slot of a table goes to a hint only now and then (HINT_FORM_ODDS) when the current form finds no card of its own.
  if(kind==='form'){const own=formOptions(s,r),hs=hintOk?formHints(s,r):[],fs=own.length||hs.length&&roll(r,HINT_FORM_ODDS)===0?[...own,...hs]:[];return fs.length?{kind,id:fs[roll(r,fs.length)]}:null;}
  if(kind==='nameless')return r.used.nameless?null:{kind};
  if(kind==='sluice')return r.water&&!r.used.sluice?{kind}:null;
  if(MECH.includes(kind)){const m=M(r.dungeon);if(!m||r.zone||!x.cards[kind])return null;
   if(kind==='hoard')return m.type==='alert'?{kind}:null;
   if(kind==='candle')return m.type==='candles'&&!r.used.candle&&lit(s,r)<m.max?{kind}:null;
   if(kind==='faction')return m.type==='factions'&&!r.used.faction?{kind,faction:m.factions[roll(r,m.factions.length)].id}:null;}
  if(kind==='rest'||kind==='treasure')return {kind};
  return null;}
 function draw(s){const r=run(s),l=layer(r),x=X(r.dungeon);r.choice=null;
  const experiment=!r.zone&&expDef(l.experiment);if(experiment&&r.step>=l.experimentStep&&r.step<lastStep(r,l)&&area(s,r.dungeon).experiments?.[experiment.id]!==experiment.revision){expProgress(s,experiment);r.cards=[];r.choice={kind:'experiment',id:experiment.id};return;}
  // Fixed steps (user 2026-10-29: 回到最早的步数定死的版本): a layer is its authored number of steps and its last step
  // is the guardian alone; the player fights it or retreats. It never comes earlier (no shortcut by winnability or by
  // record) and a player cannot keep walking a layer without it. A long stuck point withdraws after its turnLimit
  // actions (escapeAfter) instead of fighting to the end; a cleared layer's guardian pays replayChestBps.
  const g=l.guardian,gd=dropOf(r,'guardian'),cleared=!r.zone&&!!area(s,r.dungeon).cleared[r.layer],gb=x.battles.guardian,gc={kind:'guardian',enemy:g.enemy,count:1,chestBps:Math.round((cleared&&gb.replayChestBps||gb.chestBps)*(g.chestBps||10000)/10000),...(g.goldBps?{goldBps:g.goldBps}:{}),...(gd?{drop:gd}:{}),...(dropOf(r,'guardianRare')?{rare:dropOf(r,'guardianRare')}:{}),...(g.hpBps?{hpBps:g.hpBps}:{}),...(g.attackBps?{attackBps:g.attackBps}:{}),...(g.turnLimit&&!r.zone?{escapeAfter:g.turnLimit}:{}),label:g.label,...zb(r,g.enemy)};
  if(r.step>=lastStep(r,l)){r.cards=[gc];return;}
  const cards=[];if(r.bonusTreasure){r.bonusTreasure=false;cards.push({kind:'treasure',found:true});}
  // At most one character card a step (user 2026-11-03: 一次性事件卡就算有多个满足条件，一次最多也只出现一个), so other cards still come.
  let hinted=false;if(!r.zone){const due=x.characters.filter(c=>c.layer===r.layer&&r.step>=(c.from||0)&&!r.used['char:'+c.id]),ready=due.filter(c=>characterReady(s,c.id));
   // Story cards come first (user 2026-11-07: 首先剧情卡有就触发，然后是战斗卡和事件卡): a character ready to meet always shows.
   if(ready.length)cards.push({kind:'character',id:ready[roll(r,ready.length)].id});else for(const c of due){const k={kind:'character',id:c.id};if(wants(s,r,k)){hinted=true;cards.push(k);break;}}}
  // Cards that change the run's surroundings (the sluice, the necropolis candle) come once, on the first step of a run
  // (user 2026-11-03: 改变环境的事件卡……只出现一次), never from the weighted draw.
  if(!r.zone&&r.step===0)for(const k of ENV){const c=make(s,r,l,x,k);if(c)cards.push(c);}
  if(r.zone?r.step===r.zone.shopStep&&!r.zone.shopUsed:r.step===r.shopStep&&!r.used.shop)cards.push({kind:'shop'});
  // One-time events are story cards too (user 2026-11-07: 剧情卡就是一次性卡): an event chain step, a side-quest step or a
  // once-only event that can happen now shows as soon as it can, one a run and one story card a step.
  const story=c=>c.kind==='identity'||c.kind==='character'&&!hintText(s,r,c)||c.kind==='event'&&storyEvent(C.dungeonEvents.events[c.id]);
  if(!r.zone&&!r.used.story&&!cards.some(story)){const st=(l.events||x.events).filter(id=>storyEvent(C.dungeonEvents.events[id])&&eventAvailable(s,r,id));if(st.length){r.used.story=true;cards.push({kind:'event',id:st[roll(r,st.length)]});}}
  if(!r.zone&&l.identities&&r.step>=(l.identityFrom||0)&&!r.used.identity){const ids=l.identities.filter(id=>!s.owned[id]);if(ids.length&&!cards.some(story)&&roll(r,10000)<l.identityChanceBps)cards.push({kind:'identity',id:ids[roll(r,ids.length)]});}
  // The rest are fight cards and event cards only (user 2026-11-07: 战斗卡和事件卡，严格上只该有这两类): at least one of
  // each, the third a fight FIGHT_THIRD_BPS of the time; next to a story card, one of each. Treasure, rest, souls, the
  // shop, form paths and the sluice are event cards. Fixed cards beyond their share keep the story card, then the sluice
  // and the shop, then the found treasure (saved for the next step).
  const st=cards.some(story)?1:0,ne=st?2:roll(r,10000)<FIGHT_THIRD_BPS?1:CARDS-1;
  if(cards.length>ne){const rank=['character','identity','event','sluice','candle','shop','treasure'],at=c=>story(c)?0:fits(s,r,c)?rank.indexOf(c.kind):rank.length;cards.sort((a,b)=>at(a)-at(b));if(cards.splice(ne).some(c=>c.found))r.bonusTreasure=true;}
  const low=N(s.hp)*5n<R.stats(s).hp*2n,skip=new Set([...ENV,...(r.step<ELITE_FROM||r.used.elite?['elite']:[]),...['rest','treasure'].filter(k=>r.used[k+'Taken'+RT_MAX]),...(healOk(r)?[]:['rest'])]);
  if(!r.zone&&healOk(r)&&r.step===healWindow(r)[1]&&cards.length<ne&&!cards.some(c=>c.kind==='rest'||c.kind==='event'&&healEvent(C.dungeonEvents.events[c.id]))){cards.push({kind:'rest'});skip.add('rest');}
  const only=(w,fight)=>Object.fromEntries(Object.entries(w).filter(([k])=>FIGHTS.includes(k)===fight));
  for(let guard=0;cards.length<ne&&guard<30;guard++){const lw=layerWeights(s,r,l),kind=pick(r,only(low?{...lw,rest:(lw.rest||0)*2}:lw,false),skip);if(!kind)break;skip.add(kind);const c=make(s,r,l,x,kind,!hinted);if(c){if(!fits(s,r,c))hinted=true;cards.push(c);}}
  for(let guard=0;cards.length<CARDS&&guard<30;guard++){const kind=pick(r,only(layerWeights(s,r,l),true),skip);if(!kind)break;skip.add(kind);const c=make(s,r,l,x,kind);if(c)cards.push(c);}
  while(cards.length<CARDS)cards.push(make(s,r,l,x,'battle'));
  // Never only unwinnable fights: keep one card that is not a fight, or a fight won from the current HP.
  const safe=c=>fits(s,r,c)&&(c.kind!=='guardian'&&!FIGHTS.includes(c.kind)||(c.count||1)===1&&winnable(s,foe({run:true,queue:[c],mods:mods(r)},c.enemy),25));
  if(!cards.some(safe)){const k=r.used.treasureSafe&&healOk(r)?'rest':'treasure';r.used.treasureSafe=true;cards[cards.length-1]=k==='treasure'?{kind:k,sure:true}:{kind:k};}
  r.cards=cards;noteCards(s,r,cards,true);}
 // ---- プルル's shop (user 2026-11-02; content/chapter1-v2/shop.json, scripts/apply-shop.cjs) ----
 // A run of a chapter 1 or 2 main layer may hold one shop card on a step rolled at the start (chanceBps), always in the run
 // after a lost guardian fight on that layer, and on visits to forest layer 2 until she is first met; before that meeting she shows up nowhere else. The stall shows
 // `slots` lots drawn from the open tiers of the layer's chapter and the layer's chest; strengthening items are bought piece by piece, other
 // lots whole. 奪う fights her: her strength is set when the stall opens and a win takes every lot left.
 const SH=()=>C.shop;
 // Gold and the shop follow the dungeon, not the layer's chest (forest 4-6 open cave chests, waterway 4-6 sanctum ones,
  // which have no gold row: those layers dropped no gold and never met the shop, playtest 2026-11-04).
  function goldGroup(r){const sh=SH();if(!sh||!r)return null;const t=T(r),g=sh.gold[chestOf(r)]?chestOf(r):t.dungeon;return sh.gold[g]&&t.layer<=(sh.goldLayers[t.dungeon]||0)?g:null;}
 // Skills that raise gold drops (planned) add goldBps to skillCombat, like the extra-chest skills; balance tools may set
 // globalThis.SHOP_GOLD_SCALE_BPS to test gold inflation.
 function goldBonusBps(s){const k=Number(R.stats(s).skillCombat?.goldBps||0),t=Number(globalThis.SHOP_GOLD_SCALE_BPS||10000);return Math.max(0,Math.round((10000+k)*t/10000)-10000);}
 function tierOpen(s,t){const c=t.unlock?.cleared;return !c||!!area(s,c.dungeon).cleared[c.layer];}
 function shopItem(id){for(const t of SH()?.tiers||[]){const it=t.items.find(i=>i.id===id);if(it)return it;}return null;}
 function room(s,id){return N(C.items[id].cap)-R.quantity(s,id);}
 function shopStep(s,r,l){const sh=SH(),a=area(s,r.dungeon);if(!goldGroup(r)||l.steps<3)return -1;const met=!!s.shop?.met,first=!met&&r.dungeon===sh.first.dungeon&&r.layer===sh.first.layer,due=!!a.shopDue?.[r.layer];
  // Before the first meeting she only waits on forest layer 2 (user 11/4); a player who walked past her card there may meet her anywhere once that layer is cleared.
  if(!met&&!first&&!area(s,sh.first.dungeon).cleared[sh.first.layer])return -1;
  if(!first&&!due&&roll(r,10000)>=sh.chanceBps)return -1;if(due)delete a.shopDue[r.layer];return 1+roll(r,l.steps-2);}
 function slotPrice(s,sl){if(sl.price)return N(sl.price);const it=shopItem(sl.item);return BigInt(it.price)+BigInt(it.step)*R.quantity(s,sl.item)/BigInt(SH().pieceDivide||1);}
 // A run's gold on a layer (C.shop.runGold, scripts/apply-layer-loot.cjs: its guardian plus a monster each step) × bps.
 function runPrice(d,n,bps){return GameNumber.max(1n,(BigInt(SH().runGold?.[d]?.[n]||1)*BigInt(bps)+5000n)/10000n);}
 // Gold events (user 2026-11-06, content/gold-events.json): amounts are shares of one run's gold on the current layer, so they
 // follow the same anchor as the shop. Gold found gets the gold-drop bonus like monster gold; a price does not.
 function eventPrice(r,bps){const t=T(r);return runPrice(t.dungeon,t.layer,bps);}
 function eventGold(s,r,bps){return eventPrice(r,bps)*BigInt(10000+goldBonusBps(s))/10000n;}
 function gainGold(s,r,n,report){const got=R.addGold(s,N(n));r.gained.gold=String(N(r.gained.gold||0)+got);if(report)report.gold=String(N(report.gold||0)+got);return got;}
 // An option with a price shows it on its label and cannot be picked while the gold is short.
 function priced(s,r,o){const p=o.effect?.payRuns;if(!p)return o;const price=eventPrice(r,p);return {...o,label:o.label+' — '+GameNumber.format(price)+' G',...(N(s.gold||0n)<price?{short:true}:{})};}
 // Chest lots follow the layer the stall stands on (user 2026-11-05: 宝箱改成当前层boss掉落的1.5倍，金币成本按1.5轮): the chests its
 // guardian pays now (replay rate on a cleared layer) and the gold of that many runs.
 function packOf(s,r){const sh=SH(),t=T(r),l=X(t.dungeon).layers[t.layer-1],g=l.guardian,gb=X(t.dungeon).battles.guardian,cleared=!!area(s,t.dungeon).cleared[t.layer],
  bps=Math.round((cleared&&gb.replayChestBps||gb.chestBps)*(g.chestBps||10000)/10000),drop=BigInt(C.enemies[g.enemy].chests||0)*BigInt(l.chestMult||1)*BigInt(bps)/10000n;
  return {chests:GameNumber.max(1n,(drop*BigInt(sh.chestPack.runBps)+9999n)/10000n),price:runPrice(t.dungeon,t.layer,sh.chestPack.runBps)};}
 function trophies(s,ch){const out=[];for(const [d,ls]of Object.entries(C.layerDrops||{})){if(C.dungeons[d]?.chapter!==ch)continue;
  for(const [n,k]of Object.entries(ls)){const id=k.elite;if(!id)continue;const q=R.quantity(s,id);if(C.items[id]&&q>0n&&q<N(C.items[id].cap))out.push({item:id,dungeon:d,layer:Number(n)});}}return out;}
 function stall(s,r){const sh=SH(),g=goldGroup(r),d=C.dungeons[g],slots=[],used=new Set(),w={...sh.slotWeights},at=T(r);let big=false;
  const ch=C.dungeons[at.dungeon]?.chapter,pack=packOf(s,r),items=sh.tiers.filter(t=>tierOpen(s,t)&&t.area===g).flatMap(t=>t.items),total=d.pool.reduce((v,id)=>v+C.items[id].weight,0);
  for(let guard=0;slots.length<sh.slots&&guard<40;guard++){const kind=pick(r,w,new Set(big?['indep','final']:[]));if(!kind)break;let sl=null;
   // Her own goods, sold only here (user 2026-11-05: 商店的固有，就定个一轮的金币; 按层可购买上限 1 2 3 5 7 10; 各个地下城固有也不一样;
   // 1000个才满加成，这个设计就是给玩家刷的): only this dungeon's tier, one piece a buy for one run's gold on this layer, and a lot
   // holds ownLayerCaps[layer] pieces (layer 1: 1 ... layer 6: 10), never past the item's cap.
   if(['normal','indep','final'].includes(kind)){const c=items.filter(i=>i.zone===kind&&!used.has(i.id)&&room(s,i.id)>0n);if(c.length){const it=c[roll(r,c.length)],caps=sh.ownLayerCaps||[1],L=caps[Math.min(at.layer,caps.length)-1];
    sl={kind,item:it.id,price:String(runPrice(at.dungeon,at.layer,sh.ownRunBps)),left:Math.min(Number(room(s,it.id)),L)};if(kind!=='normal')big=true;}}
   else if(kind==='chestPack'){if(!used.has('pack')&&!d.pool.every(k=>room(s,k)<=0n))sl={kind,key:'pack',chests:String(pack.chests),price:String(pack.price),left:1};}
   // One chest item a lot (user 2026-11-05: 除了宝箱外不该有一次能买多个的物品), at the pack's gold per chest × the chests it takes on average.
   else if(kind==='chestItem'){const c=d.pool.filter(k=>C.items[k].rarity==='normal'&&!used.has(k)&&room(s,k)>0n);if(c.length){const k=c[roll(r,c.length)],w=BigInt(C.items[k].weight);sl={kind,item:k,count:'1',price:String(GameNumber.max(1n,(pack.price*BigInt(total)+pack.chests*w/2n)/(pack.chests*w))),left:1};}}
   // An elite's own drop the player has won at least once but not filled (user 2026-11-05: 打过但还没刷满的强敌的掉落; boss的不要放只放强敌;
   // one piece a lot, the gold of two runs on this layer). The chests' rare items are no longer sold.
   else if(kind==='trophy'){const c=trophies(s,ch).filter(t=>!used.has(t.item));if(c.length){const t=c[roll(r,c.length)];sl={kind,item:t.item,count:'1',price:String(runPrice(at.dungeon,at.layer,sh.trophy.runBps)),left:1};}}
   if(sl){used.add(sl.item||sl.key);slots.push(sl);}else w[kind]=0;}
  return slots;}
 // Her strength: the strongest version of her the player beats from full HP x a random spread (about an even gamble),
 // and on a layer not cleared yet at least its guardian x guardianFactor (a layer the player is stuck on cannot be
 // robbed); then raised for valuable lots and for each recent robbery. HP and attack scale together.
 function keeper(s,r,slots){const sh=SH(),rb=sh.rob,g=layer(r).guardian,ge=C.enemies[g.enemy],k=C.enemies[sh.keeper];
  const gh=N(ge.hp)*BigInt(g.hpBps||10000)/10000n,ga=N(ge.attack)*BigInt(g.attackBps||10000)/10000n;
  const at=f=>({...k,hp:String(GameNumber.max(1n,gh*f/10000n)),attack:String(GameNumber.max(1n,ga*f/10000n))});
  const beats=f=>winnable(s,at(f),25,true);let lo=0n,hi=10000n;
  if(beats(hi)){lo=hi;hi*=2n;for(let i=0;i<40&&beats(hi);i++){lo=hi;hi*=2n;}}
  for(let i=0;i<14&&hi-lo>1n;i++){const m=(lo+hi)/2n;if(beats(m))lo=m;else hi=m;}
  const [a,b]=rb.playerSpreadBps,matched=lo*BigInt(a+roll(r,b-a+1))/10000n;let f=area(s,T(r).dungeon).cleared[T(r).layer]?GameNumber.max(1n,matched):GameNumber.max(BigInt(rb.guardianFactorBps),matched);
  const rich=slots.filter(sl=>['indep','final','rare','trophy'].includes(sl.kind)).length;f=f*BigInt(Math.min(rb.valueMaxBps,10000+rb.valueStepBps*rich))/10000n;
  f=f*BigInt(10000+rb.streakStepBps*Math.min(rb.streakMax,s.shop?.robs||0))/10000n;const e=at(f);return {hp:e.hp,attack:e.attack};}
 function openShop(s,r,out){const sh=SH(),first=!s.shop?.met;(s.shop??={met:false,robs:0}).met=true;const slots=stall(s,r);
  r.choice={kind:'shop',slots,foe:keeper(s,r,slots),line:first?'first':'greet:'+roll(r,sh.lines.greet.length)};if(first)out.shopFirst=true;}
 function shopOptions(s,r){const ch=r.choice,out=[],g=goldGroup(r)||chestOf(r);
  ch.slots.forEach((sl,i)=>{if(sl.left<=0)return;const price=slotPrice(s,sl),it=sl.item&&C.items[sl.item];
   const name=sl.kind==='chestPack'?C.dungeons[g].chestName+' ×'+GameNumber.format(N(sl.chests)):it.name+(sl.count?' ×'+GameNumber.format(N(sl.count)):sl.left>1?'（あと'+sl.left+'個）':'');
   const effect=it&&typeof EffectSystem!=='undefined'?EffectSystem.describe(it.effects):'';
   out.push({id:'buy:'+i,label:name+' — '+GameNumber.format(price)+' G',detail:[effect,it?'所持 '+GameNumber.format(R.quantity(s,sl.item)):''].filter(Boolean).join(' · '),lot:{kind:sl.kind,item:sl.item||null,count:sl.count||null,chests:sl.chests||null,left:sl.left,price:String(price),effect,held:it?String(R.quantity(s,sl.item)):null,cap:it?String(it.cap):null},...(N(s.gold||0n)<price?{short:true}:{})});});
  ch.slots.forEach((sl,i)=>{if(sl.left<=0)out.push({id:'sold:'+i,label:'',detail:'',sold:true,short:true,lot:{kind:sl.kind,item:sl.item||null,count:sl.count||null,chests:sl.chests||null,left:0}});});
  out.push({id:'rob',label:'奪う',detail:'生命力 '+GameNumber.format(N(ch.foe.hp))+' · 攻撃 '+GameNumber.format(N(ch.foe.attack))});
  out.push({id:'leave',label:'立ち去る',detail:''});return out;}
 // Buying keeps the stall open (a new choice object, so the screen redraws); 奪う and 立ち去る close it.
 function answerShop(s,r,optionId,report){const ch=r.choice,sh=SH(),out={kind:'runOption',choice:'shop',id:'shop',option:optionId};
  if(optionId==='leave'){r.choice=null;out.text=sh.lines.leave;step(s,r);report.events.push(out);R.touch(s);return out;}
  if(optionId==='rob'){r.choice=null;fight(s,r,[{enemy:sh.keeper,chestBps:0,base:{hp:ch.foe.hp,attack:ch.foe.attack},shopLoot:ch.slots.filter(sl=>sl.left>0).map(sl=>({...sl}))}]);report.events.push(out);R.touch(s);return out;}
  const i=Number(String(optionId).split(':')[1]),sl=ch.slots[i];if(!String(optionId).startsWith('buy:')||!sl||sl.left<=0)return null;const price=slotPrice(s,sl);
  if(!R.spendGold(s,price)){out.noGold=true;out.text=sh.lines.noGold;report.events.push(out);return out;}
  const got=takeLot(s,r,sl,1);if(Object.keys(got.items).length){report.items??={};for(const [k,v]of Object.entries(got.items))report.items[k]=(N(report.items[k]||0))+N(v);}
  out.items=got.items;out.chests=got.chests;out.spent=String(price);out.text=sh.lines.bought;
  if(!ch.bought&&s.shop?.robs>0)s.shop.robs--;r.choice={...ch,bought:true,slots:ch.slots.map((x,j)=>j===i?{...x,left:x.left-1}:x)};
  report.events.push(out);R.touch(s);return out;}
 function takeLot(s,r,sl,n){const res={items:{},chests:'0'};if(sl.kind==='chestPack'){res.chests=String(chests(s,r,N(sl.chests)));return res;}
  const q=sl.count?N(sl.count)*BigInt(n):BigInt(n),got=R.add(s,sl.item,q);if(got>0n)res.items[sl.item]=String(got);return res;}
 // ---- resolving ----
 function chests(s,r,n){n=N(n);if(n<=0n)return 0n;const got=R.addChest(s,chestOf(r),n);r.gained.chests=String(N(r.gained.chests)+got);return got;}
 // Event rewards are scaled once more by the event table's rewardScaleBps (content/dungeon-events.json) so all events
 // together stay a modest share of growth.
 function eventChests(r,bps){return bps?(BigInt(layer(r).eventBase)*BigInt(bps)*BigInt(C.dungeonEvents.rewardScaleBps??10000)+99999999n)/100000000n:0n;}
 function heal(s,bps){const st=R.stats(s);R.healTo(s,st.hp*BigInt(bps)/10000n);}
 function hurt(s,bps){const loss=R.stats(s).hp*BigInt(bps)/10000n,hp=N(s.hp)-loss;s.hp=hp>0n?hp:1n;}
 function soul(s,r,report){const x=X(r.dungeon),got=R.add(s,x.souls.item,BigInt(x.souls.per||1));if(got>0n){report.souls=(report.souls||0)+Number(got);return true;}
  // Souls at their cap: devouring still works and heals, with a short 満ち足りた buff (user 2026-10-24; never chests).
  heal(s,SOUL_FULL.healBps);addEffect(r,SOUL_FULL.duration);report.soulFull=true;return false;}
 const SOUL_FULL={healBps:4000,duration:{label:'満ち足りた',battles:3,enemyHpBps:8333}};
 function soulsFull(s,r){return souls(s,r.dungeon)>=N(X(r.dungeon).souls.cap);}
 function addEffect(r,d){r.effects=r.effects.filter(a=>a.id!==d.label);r.effects.push({id:d.label,label:d.label,left:d.battles,enemyHpBps:d.enemyHpBps||0,enemyAttackBps:d.enemyAttackBps||0,chestBonusBps:d.chestBonusBps||0,healPerBattleBps:d.healPerBattleBps||0});}
 // Event items given directly: the layer's own chest material by role (sized like the chests it replaces), or the
 // layer's elite item. A capped one is named in the result instead of disappearing.
 function material(r,role){const d=C.dungeons[chestOf(r)];return d.pool.find(k=>C.items[k].role===role)||null;}
 function grant(s,r,id,n,report){if(!id||!C.items[id]||n<=0n)return;const got=R.add(s,id,n);if(got>0n)(report.items??={})[id]=String(N(report.items[id]||0)+got);if(got<n)(report.capped??=[]).push(id);}
 // An option or event effect. Fight entries come from events ({enemy}) or form cards ({tier}).
 // talk: what the history says once the effect's fights are over ({after} on a win, {escape} when a fleeing enemy gets away).
 function chainTo(s,r,step){const [c,n]=step.split(':'),a=area(s,r.dungeon);(a.chains??={})[c]=Number(n);(a.chainRun??={})[c]=a.runs;}
 function apply(s,r,e,report,talk={}){e=e||{};if(e.zone&&Z(e.zone)&&!r.zone){enter(s,r,e.zone,report);if(talk.after)report.text=talk.after;return true;}const l=layer(r);
  if(e.payRuns){const price=eventPrice(r,e.payRuns);if(!R.spendGold(s,price)){report.noGold=true;return false;}report.spent=String(N(report.spent||0)+price);}
  // A bet (gold events): the run's RNG picks the win or the loss, each an ordinary effect with its own closing line.
  if(e.gamble){const g=e.gamble,win=roll(r,10000)<g.winBps;report.gamble=win?'win':'lose';const t=win?g.winText:g.loseText;if(t)talk.after=t;return apply(s,r,win?g.win:g.lose,report,talk);}
  if(e.goldRuns)gainGold(s,r,eventGold(s,r,e.goldRuns),report);
  if(e.damageBps)hurt(s,e.damageBps);if(e.healBps)heal(s,e.healBps);
  const mm=M(r.dungeon),more=t=>{talk.after=[...(Array.isArray(talk.after)?talk.after:talk.after?[talk.after]:[]),t];};
  if(e.treasureBps){const n=chests(s,r,BigInt(l.treasure)*BigInt(e.treasureBps)/10000n);report.chests=String(N(report.chests||0)+n);}
  if(e.alert&&mm?.type==='alert'){r.alert=(r.alert||0)+e.alert;if(r.alert>=mm.max){r.alert=0;hurt(s,mm.breathBps);report.breath=true;more(mm.breath);}}
  if(e.candle&&mm?.type==='candles'&&!r.zone){const c=area(s,r.dungeon).candles??={},was=lit(s,r),n=Math.min(mm.max,was+e.candle);c[r.layer]=n;report.candles=n;
   if(n>=mm.max&&was<mm.max){const got=chests(s,r,BigInt(l.treasure)*BigInt(mm.completeBps)/10000n);report.chests=String(N(report.chests||0)+got);report.candlesLit=true;more(mm.complete);}}
  if(e.favor&&mm?.type==='factions'&&factionOf(mm,e.favor.id)){const fv=area(s,r.dungeon).favor??={},clamp=v=>Math.max(mm.min,Math.min(mm.max,v));fv[e.favor.id]=clamp((fv[e.favor.id]||0)+e.favor.d);if(e.favor.rival&&factionOf(mm,e.favor.rival))fv[e.favor.rival]=clamp((fv[e.favor.rival]||0)-1);}
  for(const [k,q]of Object.entries(e.items||{})){const got=R.add(s,k,N(q));if(got>0n)(report.items??={})[k]=String(got);}
  if(e.soul)soul(s,r,report);
  if(e.material){const id=material(r,e.material.role),n=eventChests(r,e.material.bps);grant(s,r,id,e.material.role==='specialty'?GameNumber.max(1n,n/8n):n,report);}
  if(e.layerElite)grant(s,r,dropOf(r,'elite'),BigInt(e.layerElite),report);
  if(e.treasure){r.bonusTreasure=true;report.treasureFound=true;}
  if(e.reveal){const l2=layer(r);for(const id of [...l2.tiers.flat(),l2.elite,l2.guardian.enemy])(s.seenEnemies??={})[id]=true;report.revealed=true;}
  if(e.wary)area(s,r.dungeon).wary=Math.max(area(s,r.dungeon).wary,e.wary);
  // A step that is a fight (the side quests, content/form-quests.json) moves its chain on only when the fight is won.
  if(e.chain&&!e.fights?.length)chainTo(s,r,e.chain);if(e.chainEnd)(area(s,r.dungeon).chains??={})[e.chainEnd]=-1;
  if(e.duration){addEffect(r,e.duration);report.duration=e.duration.label;}
  if(e.skip){r.skip=(r.skip||0)+e.skip;report.skipped=e.skip;}
  if(e.fights?.length){const queue=e.fights.map((f,i,_,id=f.enemy||(f.tier==='elite'?l.elite:member(r,l.tiers.at(-1))))=>({enemy:id,...zb(r,id),...(f.drop&&C.items[f.drop]?{drop:f.drop}:f.tier==='elite'&&dropOf(r,'elite')?{drop:dropOf(r,'elite')}:{}),...(f.hpBps?{hpBps:f.hpBps}:{}),...(f.attackBps?{attackBps:f.attackBps}:{}),...(f.label?{label:f.label}:{}),...(f.escapeAfter?{escapeAfter:f.escapeAfter}:{}),...(f.escapeAfter&&talk.escape?{escapeText:talk.escape}:{}),chestBps:f.chestBps||10000,...(f.rewardBps&&i===e.fights.length-1?{reward:String(eventChests(r,f.rewardBps))}:{}),...(f.goldRuns&&i===e.fights.length-1?{goldReward:String(eventGold(s,r,f.goldRuns))}:{}),...(talk.after&&i===e.fights.length-1?{afterText:talk.after}:{}),...(e.chain&&i===e.fights.length-1?{chain:e.chain}:{})}));fight(s,r,queue);return true;}
  if(e.rewardBps){const n=chests(s,r,eventChests(r,e.rewardBps));report.chests=String(N(report.chests||0)+n);}
  return false;}
 // Entering a zone keeps the host run's step and guardian; leaving (the zone guardian beaten) restores them and steps on.
 // The reference is the host layer's strongest regular monster, raised to the zone's floor (calibrated to the power of a
 // player who has just met the earliest entry form), so a zone entered right after its form is never a walkover.
 function enter(s,r,id,report){const h=X(r.dungeon).layers[r.layer-1],ref=C.enemies[h.tiers.at(-1)[0]],a=area(s,r.dungeon),f=Z(id).floor||{hp:'0',attack:'0'};
  r.zone={id,ref:{hp:String(GameNumber.max(N(ref.hp),N(f.hp))),attack:String(GameNumber.max(N(ref.attack),N(f.attack))),chests:String(ref.chests||1)},back:{step:r.step}};
  r.step=0;delete r.skip;delete r.restDraw;(a.zoneRuns??={})[id]=(a.zoneRuns[id]||0)+1;r.zone.shopStep=zoneShopStep(s,r);report.zone=id;draw(s);}
 // Her stall in a zone (user 2026-11-05): once she has been met, at her usual chance, on one of the zone's card steps.
 function zoneShopStep(s,r){const sh=SH(),z=Z(r.zone.id);if(!sh||!s.shop?.met||!goldGroup(r)||z.steps<2)return -1;if(roll(r,10000)>=sh.chanceBps)return -1;return 1+roll(r,z.steps-1);}
 function leave(s,r,report){const z=r.zone,a=area(s,r.dungeon);(a.zones??={})[z.id]=(a.zones[z.id]||0)+1;if(report)report.events.push({kind:'zoneCleared',dungeon:r.dungeon,zone:z.id});
  delete r.zone;r.step=z.back.step;delete r.skip;step(s,r);}
 function step(s,r){// A reward-area entrance offered on this step is not offered again this run (user 2026-11-03: 奖励区域入口……每趟只出现一次);
  // marked on leaving the step, so a form switch at a rest redraws the same cards.
  for(const c of r.cards||[])if(c.kind==='form'&&X(r.dungeon).forms.find(f=>f.id===c.id)?.zone)r.used['form:'+c.id]=true;let nextStep=r.step+1+(r.skip||0);const l=layer(r),d=!r.zone&&expDef(l.experiment);if(d&&area(s,r.dungeon).experiments?.[d.id]!==d.revision&&r.step<l.experimentStep&&nextStep>l.experimentStep)nextStep=l.experimentStep;r.step=nextStep;r.skip=0;delete r.restDraw;draw(s);}
 // The step whose only card is the guardian: the last authored step of a layer (steps 6-12), or the step after a reward
 // zone's steps, so the side trip always leads back.
 function lastStep(r,l){return r.zone?l.steps:l.steps-1;}
 // Repair old visible cards without rerolling or rechecking cooldown, loot caps, HP or other event conditions.
 function identityFits(s,c,f){const q=c.kind==='event'?C.dungeonEvents.events[c.id]?.requires:f;
  if(!q)return true;const forms=q.form?[q.form]:q.forms;
  return (!forms||!!s.owned[s.active]&&forms.includes(s.active))&&!q.notForms?.includes(s.active)&&(!q.owned||q.owned.every(k=>s.owned[k]));
 }
 function pendingFits(s,r,c){if(c.kind==='form'){const f=X(r.dungeon).forms.find(f=>f.id===c.id);return !!f&&(f.zone?formFits(s,r,f):identityFits(s,c,f));}return c.kind!=='event'||identityFits(s,c);}
 function reconcileRun(s,r){if(!r||r.result)return r;let repaired=false;
  if(r.choice&&['form','event'].includes(r.choice.kind)&&!pendingFits(s,r,r.choice)){
   const f=r.choice.kind==='form'&&X(r.dungeon).forms.find(f=>f.id===r.choice.id);
   if(!f?.zone){r.choice=null;repaired=true;}
  }
  if(Array.isArray(r.cards)){const previousCount=r.cards.length;r.cards=r.cards.filter(c=>{
   if(c.kind==='event')return identityFits(s,c);
   if(c.kind!=='form')return true;const f=X(r.dungeon).forms.find(f=>f.id===c.id);
   return !!f&&(f.zone?formFits(s,r,f)||!!wants(s,r,c):identityFits(s,c,f));
  });
   // Preserve surviving cards and their order; a rest keeps an old all-invalid table operable.
   if((repaired||r.cards.length<previousCount)&&!r.choice&&!r.cards.some(c=>!hintText(s,r,c)))r.cards.push(r.zone?{kind:'treasure',sure:true}:{kind:'rest'});
  }
  return r;
 }
 function reconcileCards(s){return reconcileRun(s,run(s));}
 // A drawn card still fits the current form (form cards, events for some forms, characters met only in an entry form).
 function fits(s,r,c){if(c.kind==='form'){const f=X(r.dungeon).forms.find(f=>f.id===c.id);return !!f&&formFits(s,r,f);}if(c.kind==='event')return identityFits(s,c);if(c.kind==='character')return characterReady(s,c.id);return true;}
 function choose(s,i,report={events:[]}){const r=run(s);if(!r||r.result||r.choice||s.view!=='run'||!r.cards?.[i]||!fits(s,r,r.cards[i]))return null;const c=r.cards[i],x=X(r.dungeon),l=layer(r),out={kind:'runCard',card:c.kind,...(c.id?{id:c.id}:{})};noteCards(s,r,[c]);
  if(c.kind==='elite')r.used.elite=true;if(c.kind==='rest'||c.kind==='treasure'){let n=1;while(r.used[c.kind+'Taken'+n])n++;r.used[c.kind+'Taken'+n]=true;}
  if(FIGHTS.includes(c.kind)&&trait(s).slip){r.choice={kind:'slip',card:{...c}};}
  else if(FIGHTS.includes(c.kind)||c.kind==='guardian'){const q={enemy:c.enemy,chestBps:c.chestBps,...(c.goldBps?{goldBps:c.goldBps}:{}),...(c.hpBps?{hpBps:c.hpBps}:{}),...(c.attackBps?{attackBps:c.attackBps}:{}),...(c.label?{label:c.label}:{}),...(c.drop&&C.items[c.drop]?{drop:c.drop}:{}),...(c.rare?{rare:c.rare}:{}),...(c.kind==='guardian'?{guardian:true}:{}),...(c.kind==='guardian'&&c.escapeAfter?{escapeAfter:c.escapeAfter}:{}),...(c.base?{base:{...c.base}}:{})};fight(s,r,Array.from({length:c.count||1},()=>({...q})));}
  else if(c.kind==='event'){r.used['ev:'+c.id]=true;const def=C.dungeonEvents.events[c.id],a=area(s,r.dungeon);if(def.once)(a.once??={})[c.id]=true;(a.seen??={})[c.id]=true;a.recent=[c.id,...(a.recent||[]).filter(k=>k!==c.id)].slice(0,RECENT);(a.lastRun??={})[c.id]=a.runs;if(def.options)r.choice={kind:'event',id:c.id};else{const talk={after:def.resultText,escape:def.escapeText};if(!apply(s,r,def.effect,out,talk)){if(talk.after)out.text=talk.after;step(s,r);}}}
  // The rest card remembers the draw state of the next cards: a form switch here redraws them from the same seed, so each
  // form always gets the same cards (no reroll by switching back and forth) and no card of the previous form is left.
  else if(c.kind==='rest'){heal(s,x.restHealBps);if(r.alert){r.alert=0;if(M(r.dungeon)?.calm)out.text=M(r.dungeon).calm;}const d={rng:r.rng,...(r.bonusTreasure?{bonus:true}:{}),...(r.used.treasureSafe?{safe:true}:{})};step(s,r);r.rested=r.step;r.restDraw=d;}
  else if(c.kind==='treasure'){const mm=mimicFor(s,r,c,l);if(mm){out.mimic=true;out.text=C.mimic.lines.reveal;fight(s,r,[mm]);}else{out.chests=String(chests(s,r,l.treasure));step(s,r);}}
  else if(c.kind==='nameless'){r.used.nameless=true;r.choice={kind:'nameless'};}
  else if(c.kind==='sluice'){r.used.sluice=true;r.choice={kind:'sluice'};}
  else if(MECH.includes(c.kind)){r.used[c.kind]=true;r.choice={kind:c.kind,...(c.faction?{faction:c.faction}:{})};}
  else if(c.kind==='form'){r.used['form:'+c.id]=true;r.choice={kind:'form',id:c.id};}
  else if(c.kind==='character'){const again=!!s.encounters[c.id];s.encounters[c.id]=true;out.story=true;if(C.characters[c.id]?.optionalDevour){r.choice={kind:'meet',id:c.id};out.meet=true;if(again)out.again=true;}}
  else if(c.kind==='shop'){if(r.zone)r.zone.shopUsed=true;else r.used.shop=true;openShop(s,r,out);}
  else if(c.kind==='identity'){r.used.identity=true;s.encounters[c.id]=true;storyFight(s,c.id);}
  report.events.push(out);R.touch(s);return out;}
 // ミミック (user 2026-11-03, content/mimic.json): a treasure card opens into a fight now and then. It is the layer's current
 // monster made stronger, and a win pays several times the treasure. Never in a reward area, on a found treasure or on
 // the card kept so that a table is never only unwinnable fights (sure).
 function mimicFor(s,r,c,l){const mc=C.mimic;if(!mc||!C.enemies[mc.id]||r.zone||c.found||c.sure||roll(r,10000)>=mc.chanceBps)return null;const e=C.enemies[member(r,l.tiers[tierFor(s,r,l)])];
  return {enemy:mc.id,chestBps:0,base:{hp:String(GameNumber.max(1n,N(e.hp)*BigInt(mc.hpBps)/10000n)),attack:String(N(e.attack)*BigInt(mc.attackBps)/10000n)},reward:String(BigInt(l.treasure)*BigInt(mc.rewardTreasure)),afterText:mc.lines.won};}
 const FULL_NOTE='（もう取り込めない：喰らうと傷が癒える）';
 // Optional characters (user 2026-11-03: 初遇のあと、ほかの事件と同じ絵の画面で襲うか立ち去るかを選ぶ): after her encounter the player either talks and parts
 // (nothing is gained; she is met again on a later run) or attacks her.
 const MEET_OPTIONS=Object.freeze([{id:'assault',label:'襲う'},{id:'talk',label:'立ち去る'}]);
 function answerMeet(s,r,optionId,report){const id=r.choice.id,out={kind:'runOption',choice:'meet',id,option:optionId};
  if(optionId==='talk'){r.choice=null;r.used['char:'+id]=true;out.leave=true;out.text=C.characters[id].name+'と別れて、先へ進んだ。';step(s,r);}
  else if(optionId==='assault')out.assault=true;
  else return null;
  report.events.push(out);R.touch(s);return out;}
 // Options may be limited to some forms (forms / notForms), like the 血を吸う of a vampire.
 function options(s){const r=run(s);if(r?.choice&&!pendingFits(s,r,r.choice)){const f=r.choice.kind==='form'&&X(r.dungeon).forms.find(f=>f.id===r.choice.id);return f?.zone?f.options.filter(o=>o.id==='leave'&&!Object.keys(o.effect||{}).length):[];}return rawOptions(s).filter(o=>(!o.forms||o.forms.includes(s.active))&&!o.notForms?.includes(s.active));}
 function rawOptions(s){const r=run(s),x=r&&X(r.dungeon);if(r?.choice?.kind==='experiment')return experimentOptions(s);if(!r?.choice)return [];if(r.choice.kind==='shop')return shopOptions(s,r);if(r.choice.kind==='meet')return MEET_OPTIONS;if(r.choice.kind==='event')return C.dungeonEvents.events[r.choice.id].options.map(o=>priced(s,r,o.effect?.soul&&soulsFull(s,r)?{...o,detail:(o.detail||'')+FULL_NOTE}:o));if(r.choice.kind==='nameless')return soulsFull(s,r)?x.cards.nameless.options.map(o=>o.id==='devour'?{...o,detail:FULL_NOTE}:o):x.cards.nameless.options;if(r.choice.kind==='sluice')return x.cards.sluice.options.filter(o=>o.water!==r.water);if(r.choice.kind==='slip')return x.cards.slip.options;if(MECH.includes(r.choice.kind))return mechanicOptions(s,r);return x.forms.find(f=>f.id===r.choice.id).options;}
 function answer(s,optionId,report={events:[]}){const r=run(s);if(!r?.choice||s.view!=='run')return null;if(r.choice.kind==='experiment')return answerExperiment(s,optionId,report);if(r.choice.kind==='shop')return answerShop(s,r,optionId,report);if(r.choice.kind==='meet')return answerMeet(s,r,optionId,report);if(!pendingFits(s,r,r.choice)){const f=r.choice.kind==='form'&&X(r.dungeon).forms.find(f=>f.id===r.choice.id);if(!f?.zone){reconcileRun(s,r);R.touch(s);return null;}if(optionId!=='leave')return null;}const o=options(s).find(o=>o.id===optionId);if(!o||o.short)return null;const ch=r.choice,x=X(r.dungeon),out={kind:'runOption',choice:ch.kind,id:ch.id||ch.kind,option:o.id};r.choice=null;
  if(ch.kind==='slip'){if(o.id==='slip')step(s,r);else{const c=ch.card;fight(s,r,Array.from({length:c.count||1},()=>({enemy:c.enemy,chestBps:c.chestBps,...(c.hpBps?{hpBps:c.hpBps}:{}),...(c.attackBps?{attackBps:c.attackBps}:{}),...(c.label?{label:c.label}:{}),...(c.base?{base:{...c.base}}:{})})));}report.events.push(out);R.touch(s);return out;}
  let e=o.effect;if(ch.kind==='nameless')e=o.id==='devour'?{soul:1}:x.cards.nameless.spare;if(ch.kind==='sluice'){r.water=o.water;out.water=o.water;area(s,r.dungeon).water=o.water;}
  // The history records the chosen action: the option's own result, else (for a fight) the event's closing line.
  const def=ch.kind==='event'?C.dungeonEvents.events[ch.id]:null,talk={after:o.result||(def&&e?.fights?.length?def.resultText:null),escape:def?.escapeText};
  if(!apply(s,r,e,out,talk)){if(talk.after)out.text=talk.after;step(s,r);}report.events.push(out);R.touch(s);return out;}
 // A character card's fight (after its stories) or an exploration identity: a one-win story fight inside the run.
 function storyFight(s,id){const r=run(s),e=C.enemies[id];if(!e?.story||s.owned[id]||(r&&s.view!=='run'))return false;if(r?.choice?.kind==='meet'){if(r.choice.id!==id)return false;r.choice=null;}const st=R.stats(s);(s.seenEnemies??={})[id]=true;
  if(r)r.used[C.characters[id].exploration?'identity':'char:'+id]=true;
  s.view='combat';s.battle={target:id,...(r?{run:true}:{}),dungeon:e.dungeon,hp:N(e.hp),turn:0,shield:st.hp*st.shieldBps/10000n,cooldown:0,paused:false,stalled:0,story:true,checkpoint:{hp:s.hp,active:s.active,dungeon:s.dungeon}};return true;}
 function fight(s,r,queue){const st=R.stats(s);s.view='combat';const m=mods(r);s.battle={run:true,dungeon:r.dungeon,queue,mods:{hpBps:m.hpBps,attackBps:m.attackBps},target:queue[0].enemy,hp:0n,turn:0,shield:st.hp*st.shieldBps/10000n,cooldown:0,paused:false,stalled:0,story:false};s.battle.hp=N(foe(s.battle,queue[0].enemy).hp);(s.seenEnemies??={})[queue[0].enemy]=true;}
 // CollectionBattle calls these for battle.run. A queued enemy was defeated: pay the run's share of chests, count down
 // effects, then fight the next queued enemy or return to the cards. Returns true while the battle continues. The kill's
 // own chests went to the enemy's area; an area without a chest pool (the hidden layers) refuses them, so the whole
 // share is paid into the run's chest instead and the run shows what actually arrived (Codex R3 comparison 2026-10-25).
 function won(s,b,id,report){const r=run(s);if(!r)return false;const l=layer(r),e=C.enemies[id],q=b.queue?.[0]||{},m=mods(r);
  const base=BigInt(q.base?.chests??e.chests??0)*BigInt(l.chestMult)*BigInt(q.chestBps||10000)*BigInt(10000+m.chestBps)/100000000n,paid=C.dungeons[e.dungeon]?.pool?.length?N(e.chests||0):0n;let extra=base>paid?base-paid:0n;
  if(q.reward)extra+=N(q.reward);if(q.chain)chainTo(s,r,q.chain);if(q.goldReward)gainGold(s,r,q.goldReward,report);
  // A capped unique item stops dropping; the result says so instead of silently skipping it.
  if(q.drop&&C.items[q.drop]){const got=R.add(s,q.drop,1n);if(report){if(got>0n)report.items[q.drop]=(report.items[q.drop]||0n)+got;else report.events.push({kind:'dropCapped',id:q.drop});}}
  // Castle collectibles (user 2026-11-06, content/castle-vault.json): a win rolls the set's dropBps, then one of its unfilled items.
  if(q.rare){const set=[].concat(q.rare).filter(id=>C.items[id]&&R.quantity(s,id)<N(C.items[id].cap));if(set.length&&roll(r,10000)<Number(C.items[set[0]].dropBps||0)){const id=set[roll(r,set.length)],got=R.add(s,id,1n);if(report&&got>0n)report.items[id]=(report.items[id]||0n)+got;}}r.gained.chests=String(N(r.gained.chests)+paid);const got=chests(s,r,extra)+(base>0n?chests(s,r,R.chestBonus(s,chestOf(r))):0n);r.gained.kills++;if(report)report.runChests=String(N(report.runChests||0)+paid+got);
  const gg=goldGroup(r);if(gg&&!e.shop){const t=SH().gold[gg],gold=R.addGold(s,(e.gold!=null?(q.goldBps?GameNumber.max(1n,BigInt(e.gold)*BigInt(q.goldBps)/10000n):BigInt(e.gold)*(q.guardian?10n:e.elite?3n:1n)):BigInt(q.guardian?t.guardian:e.elite?t.elite:t.normal))*BigInt(10000+goldBonusBps(s))/10000n);r.gained.gold=String(N(r.gained.gold||0)+gold);if(report)report.gold=String(N(report.gold||0)+gold);}
  if(q.shopLoot){for(const sl of q.shopLoot){const got=takeLot(s,r,sl,sl.left);if(report)for(const [k,v]of Object.entries(got.items))report.items[k]=(report.items[k]||0n)+N(v);}if(s.shop)s.shop.robs=Math.min(SH().rob.streakMax,(s.shop.robs||0)+1);if(report)report.events.push({kind:'runSaid',text:SH().lines.robWin+'\n'+SH().lines.aliceRobWin});}
  if(m.healBps)heal(s,m.healBps);for(const a of r.effects)a.left--;r.effects=r.effects.filter(a=>a.left>0);
  b.queue.shift();if(b.queue.length){const n=mods(r);b.mods={hpBps:n.hpBps,attackBps:n.attackBps};b.target=b.queue[0].enemy;b.hp=N(foe(b,b.target).hp);b.turn=0;delete b.enemyLeechTotal;delete b.stored;delete b.endured;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;(s.seenEnemies??={})[b.target]=true;return true;}
  if(q.afterText&&report)report.events.push({kind:'runSaid',text:q.afterText});s.battle=null;s.view='run';if(q.guardian&&r.zone)leave(s,r,report);else if(q.guardian){area(s,r.dungeon).cleared[r.layer]=true;r.result={cleared:true,layer:r.layer};r.cards=null;if(report)report.events.push({kind:'runCleared',dungeon:r.dungeon,layer:r.layer});}else step(s,r);R.touch(s);return false;}
 // A fleeing enemy got away: no reward, the run continues.
 function escaped(s,b,report,record=null){const r=run(s),q=b.queue.shift();if(report){report.events.push({kind:'runEscaped',id:b.target,...(q?.guardian?{guardian:true,label:q.label||C.enemies[b.target].name}:{}),...(record?{record}:{})});if(q?.escapeText)report.events.push({kind:'runSaid',text:q.escapeText});}if(b.queue.length){b.target=b.queue[0].enemy;b.hp=N(foe(b,b.target).hp);b.turn=0;b.stalled=0;return true;}s.battle=null;s.view='run';if(r)step(s,r);return false;}
 // A story fight inside a run ended in a devour: back to the cards on the next step.
 function storyWon(s){const r=run(s);if(!r)return false;s.view='run';step(s,r);R.touch(s);return true;}
 function end(s,reason){const r=run(s);if(!r)return null;if(reason==='defeat'&&s.battle?.queue?.[0]?.guardian&&!r.zone&&goldGroup(r))(area(s,r.dungeon).shopDue??={})[r.layer]=true;state(s).run=null;if(s.battle?.run)s.battle=null;R.touch(s);return {kind:'runEnded',reason,dungeon:r.dungeon,layer:r.layer,chests:r.gained.chests,gold:r.gained.gold||'0'};}
 function retreat(s){const out=end(s,'retreat');if(!out)return null;s.view='village';return out;}
 function finish(s){const r=run(s);if(!r?.result)return null;const out=end(s,'cleared');s.view='dungeon';return out;}
 // Form switch: before entering (outside a run) or at the step reached by a rest card.
 function canSwitch(s){const r=run(s);return !r||(!r.choice&&!r.result&&r.rested===r.step&&s.view==='run');}
 function switchForm(s,id){if(!s.owned[id]||!canSwitch(s)||s.battle)return false;const r=run(s),was=s.active;s.active=id;
  if(r&&was!==id){const d=r.restDraw;if(d){r.rng=d.rng>>>0;r.bonusTreasure=!!d.bonus;if(!d.safe)delete r.used.treasureSafe;draw(s);}else if(r.cards){const keep=r.cards.filter(c=>fits(s,r,c)||wants(s,r,c));if(keep.length)r.cards=keep;else draw(s);}}
  R.touch(s);return true;}
 // Met exploration characters keep a quick re-challenge outside the run; their stories are not replayed.
 function rechallengeable(s,d){return Object.values(C.characters).filter(c=>(c.exploration===d||c.exploreCard?.dungeon===d)&&!s.owned[c.id]&&s.encounters[c.id]).map(c=>c.id);}
 // ---- saves ----
 function shopBase(b){return b&&GameNumber.valid(b.hp)&&GameNumber.valid(b.attack)&&N(b.hp)>0n?{hp:String(N(b.hp)),attack:String(N(b.attack))}:null;}
 function shopSlots(a){return (Array.isArray(a)?a:[]).slice(0,C.shop.slots).filter(sl=>sl&&['normal','indep','final','chestPack','chestItem','rare','trophy'].includes(sl.kind)&&(sl.kind==='chestPack'?GameNumber.valid(sl.chests)&&GameNumber.valid(sl.price):!!C.items[sl.item]&&(['normal','indep','final'].includes(sl.kind)?!!shopItem(sl.item):GameNumber.valid(sl.count)&&GameNumber.valid(sl.price)))&&Number.isSafeInteger(sl.left)&&sl.left>=0&&sl.left<=10).map(sl=>({kind:sl.kind,...(sl.item?{item:sl.item}:{}),...(sl.key?{key:sl.key}:{}),...(sl.chests?{chests:String(N(sl.chests))}:{}),...(sl.count?{count:String(N(sl.count))}:{}),...(sl.price?{price:String(N(sl.price))}:{}),left:sl.left}));}
 function shopChoice(c){const foe=shopBase(c.foe);if(!foe)return null;return {kind:'shop',slots:shopSlots(c.slots),foe,line:typeof c.line==='string'?c.line.slice(0,20):'greet:0',...(c.bought===true?{bought:true}:{})};}
 function normalize(raw,seed,s){const out=fresh(seed);if(!raw||typeof raw!=='object')raw={};if(Number.isInteger(raw.rng))out.rng=raw.rng>>>0;
  for(const [d,a]of Object.entries(raw.areas||{})){const x=X(d);if(!x||!a||typeof a!=='object')continue;const v={cleared:{},runs:Number.isSafeInteger(a.runs)&&a.runs>=0?a.runs:0,wary:Number.isSafeInteger(a.wary)&&a.wary>=0?Math.min(a.wary,9):0};
   for(let i=1;i<=x.layers.length;i++)if(a.cleared?.[i]===true&&(i===1||v.cleared[i-1]))v.cleared[i]=true;for(const [k,t]of Object.entries(a.once||{}))if(t===true&&C.dungeonEvents?.events[k]?.once)(v.once??={})[k]=true;
   const known=k=>!!C.dungeonEvents?.events[k],int=(o,min)=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,n])=>Number.isSafeInteger(n)&&n>=min));
   // The water level stays as the player last set it (user 2026-10-27: 调节水位出现太多次了).
   if(['high','low'].includes(a.water))v.water=a.water;
   const mx=x.mechanic;if(mx?.type==='candles')for(let i=1;i<=x.layers.length;i++){const n=a.candles?.[i];if(Number.isSafeInteger(n)&&n>0)(v.candles??={})[i]=Math.min(n,mx.max);}
   if(mx?.type==='factions')for(const f of mx.factions){const n=a.favor?.[f.id];if(Number.isSafeInteger(n)&&n!==0)(v.favor??={})[f.id]=Math.max(mx.min,Math.min(mx.max,n));}
    for(let i=1;i<=x.layers.length;i++)if(a.shopDue?.[i]===true)(v.shopDue??={})[i]=true;
   for(const [k,t]of Object.entries(a.seen||{}))if(t===true&&known(k))(v.seen??={})[k]=true;if(Array.isArray(a.recent))v.recent=[...new Set(a.recent.filter(k=>typeof k==='string'&&known(k)))].slice(0,RECENT);
   for(const [k,v2]of Object.entries(a.book&&typeof a.book==='object'?a.book:{}))if(v2===true&&/^(ev|char|id|form|faction):[\w-]+$|^[a-z]+(:\d+)?$/.test(k))(v.book??={})[k]=true;const lr=int(a.lastRun,0);if(Object.keys(lr).length)v.lastRun=Object.fromEntries(Object.entries(lr).filter(([k])=>known(k)));const ch=int(a.chains,-1);if(Object.keys(ch).length)v.chains=ch;const cr=int(a.chainRun,0);if(Object.keys(cr).length)v.chainRun=cr;
   for(const k of ['zones','zoneRuns']){const z=Object.fromEntries(Object.entries(int(a[k],0)).filter(([id])=>Z(id)?.hosts?.[d]));if(Object.keys(z).length)v[k]=z;}
   for(const def of Object.values(experiments()).filter(e=>e.dungeon===d)){const completed=a.experiments?.[def.id];if(Number.isSafeInteger(completed)&&completed>0)(v.experiments??={})[def.id]=completed;const p=a.experimentProgress?.[def.id];if(p&&completed!==def.revision){const valid=p.revision===def.revision&&expReplay(def,p.actions)!==null;(v.experimentProgress??={})[def.id]={revision:def.revision,actions:valid?[...p.actions]:[],feedback:valid&&typeof p.feedback==='string'?p.feedback.slice(0,500):''};}}
   out.areas[d]=v;}
  // Saves from before the card exploration: a former area boss already defeated clears its layer and those before it.
  if(s?.bosses)for(const [d,x]of Object.entries(C.explorations||{})){let top=0;x.layers.forEach((l,i)=>{if(C.enemies[l.guardian.enemy]?.boss&&s.bosses[l.guardian.enemy])top=i+1;});
   if(top){const a=out.areas[d]??={cleared:{},runs:0,wary:0};for(let i=1;i<=top;i++)a.cleared[i]=true;}}
  const r=raw.run,x=X(r?.dungeon),l=x?.layers[r?.layer-1];
  if(l&&Number.isSafeInteger(r.step)&&r.step>=0&&Number.isInteger(r.rng)&&s&&R.dungeonOpen(s,r.dungeon)){
   const zd=Z(r.zone?.id),zone=zd?.hosts?.[r.dungeon]?.includes(r.layer)&&['hp','attack','chests'].every(k=>GameNumber.valid(r.zone.ref?.[k]))&&Number.isSafeInteger(r.zone.back?.step)&&r.zone.back.step>=0?{id:r.zone.id,ref:{hp:String(N(r.zone.ref.hp)),attack:String(N(r.zone.ref.attack)),chests:String(N(r.zone.ref.chests))},back:{step:r.zone.back.step},shopStep:Number.isSafeInteger(r.zone.shopStep)?r.zone.shopStep:-1,...(r.zone.shopUsed===true?{shopUsed:true}:{})}:null;
   const ms=members(r.dungeon),enemyOk=c=>!!C.enemies[c.enemy]&&!C.enemies[c.enemy].story&&(zone?C.enemies[c.enemy].zone===zone.id:ms.has(C.enemies[c.enemy].dungeon)&&!C.enemies[c.enemy].zone);
   const rebase=c=>c.enemy&&C.enemies[c.enemy]?.zoneScale?{...c,...zb({zone},c.enemy)}:c;
   const okCard=c=>c&&typeof c==='object'&&(FIGHTS.includes(c.kind)||c.kind==='guardian'?enemyOk(c):c.kind==='event'?!!C.dungeonEvents.events[c.id]:c.kind==='form'?x.forms.some(f=>f.id===c.id):c.kind==='character'||c.kind==='identity'?!!C.characters[c.id]:['rest','treasure','nameless','sluice','shop'].includes(c.kind)||MECH.includes(c.kind)&&!zone&&!!x.cards[c.kind]&&(c.kind!=='faction'||!!factionOf(x.mechanic,c.faction)));
   const cards=Array.isArray(r.cards)&&r.cards.length&&r.cards.every(okCard)?r.cards.map(c=>rebase({...c})):null;
   const choice=r.choice?.kind==='experiment'&&!zone&&r.choice.id===l.experiment&&expDef(r.choice.id)&&r.step>=l.experimentStep&&r.step<l.steps-1&&out.areas[r.dungeon]?.experiments?.[r.choice.id]!==expDef(r.choice.id).revision?{kind:'experiment',id:r.choice.id}:r.choice?.kind==='slip'&&okCard(r.choice.card)&&FIGHTS.includes(r.choice.card.kind)?{kind:'slip',card:rebase({...r.choice.card})}:r.choice?.kind==='nameless'?{kind:'nameless'}:r.choice?.kind==='sluice'&&l.water?{kind:'sluice'}:r.choice?.kind==='event'&&C.dungeonEvents.events[r.choice.id]?.options?{kind:'event',id:r.choice.id}:r.choice?.kind==='form'&&x.forms.some(f=>f.id===r.choice.id)?{kind:'form',id:r.choice.id}:r.choice?.kind==='shop'&&C.shop&&!zone?shopChoice(r.choice):MECH.includes(r.choice?.kind)&&!zone&&x.cards[r.choice.kind]&&(r.choice.kind!=='faction'||factionOf(x.mechanic,r.choice.faction))?{kind:r.choice.kind,...(r.choice.kind==='faction'?{faction:r.choice.faction}:{})}:null;
   const used={};for(const [k,v]of Object.entries(r.used||{}))if(v===true&&typeof k==='string'&&k.length<40)used[k]=true;
   const effects=(Array.isArray(r.effects)?r.effects:[]).filter(a=>a&&typeof a.label==='string'&&Number.isSafeInteger(a.left)&&a.left>0).map(a=>({id:a.label,label:a.label,left:Math.min(a.left,20),enemyHpBps:Number(a.enemyHpBps)||0,enemyAttackBps:Number(a.enemyAttackBps)||0,chestBonusBps:Number(a.chestBonusBps)||0,healPerBattleBps:Number(a.healPerBattleBps)||0}));
   const cleared=r.result?.cleared===true&&out.areas[r.dungeon]?.cleared[r.layer];
   out.run={dungeon:r.dungeon,layer:r.layer,step:r.step,rng:r.rng>>>0,cards:cleared?null:cards,choice:cleared?null:choice,rested:Number.isSafeInteger(r.rested)?r.rested:-1,effects,used,gained:{chests:GameNumber.valid(r.gained?.chests)?String(N(r.gained.chests)):'0',kills:Number.isSafeInteger(r.gained?.kills)?r.gained.kills:0,gold:GameNumber.valid(r.gained?.gold)?String(N(r.gained.gold)):'0'},result:cleared?{cleared:true,layer:r.layer}:null,shopStep:Number.isSafeInteger(r.shopStep)?r.shopStep:-1,...(Number.isSafeInteger(r.skip)&&r.skip>0?{skip:Math.min(r.skip,3)}:{}),...(l.water?{water:['high','low'].includes(r.water)?r.water:l.water}:{}),...(r.bonusTreasure===true?{bonusTreasure:true}:{}),...(x.mechanic?.type==='alert'&&Number.isSafeInteger(r.alert)&&r.alert>0?{alert:Math.min(r.alert,x.mechanic.max-1)}:{}),...(zone?{zone}:{}),...(Number.isSafeInteger(r.rested)&&r.rested===r.step&&Number.isInteger(r.restDraw?.rng)?{restDraw:{rng:r.restDraw.rng>>>0,...(r.restDraw.bonus===true?{bonus:true}:{}),...(r.restDraw.safe===true?{safe:true}:{})}}:{})};
   reconcileRun(s,out.run);
   const due=!zone&&expDef(l.experiment)&&r.step>=l.experimentStep&&r.step<l.steps-1&&out.areas[r.dungeon]?.experiments?.[l.experiment]!==expDef(l.experiment).revision;
   if(!cleared&&(!out.run.cards||due&&s.view==='run')){s.exploration=out;draw(s);}
  }
  return out;}
 // A run fight restored from a save continues against the same queue; anything invalid returns to the cards.
 function restoreBattle(s,b){const r=run(s);if(!r||!b?.run||b.story||!Array.isArray(b.queue)||!b.queue.length)return null;
  const ms=members(r.dungeon),queue=b.queue.filter(q=>q&&C.enemies[q.enemy]&&!C.enemies[q.enemy].story&&(C.enemies[q.enemy].shop?!!C.shop&&!!shopBase(q.base):C.enemies[q.enemy].mimic?!r.zone&&!!shopBase(q.base):r.zone?C.enemies[q.enemy].zone===r.zone.id:ms.has(C.enemies[q.enemy].dungeon)&&!C.enemies[q.enemy].zone)).map(q=>({enemy:q.enemy,...zb(r,q.enemy),chestBps:Number(q.chestBps)||10000,...(Number(q.goldBps)>0?{goldBps:Number(q.goldBps)}:{}),...(Number(q.hpBps)>0?{hpBps:Number(q.hpBps)}:{}),...(Number(q.attackBps)>0?{attackBps:Number(q.attackBps)}:{}),...(typeof q.label==='string'?{label:q.label}:{}),...(Number(q.escapeAfter)>0?{escapeAfter:Number(q.escapeAfter)}:{}),...(GameNumber.valid(q.reward)?{reward:String(q.reward)}:{}),...(GameNumber.valid(q.goldReward)?{goldReward:String(q.goldReward)}:{}),...(typeof q.afterText==='string'?{afterText:q.afterText}:{}),...(typeof q.escapeText==='string'?{escapeText:q.escapeText}:{}),...(typeof q.drop==='string'&&C.items[q.drop]?{drop:q.drop}:{}),...(typeof q.chain==='string'&&/^[a-z0-9_]+:\d+$/.test(q.chain)?{chain:q.chain}:{}),...(q.guardian===true?{guardian:true}:{}),...(C.enemies[q.enemy].mimic?{base:shopBase(q.base)}:{}),...(C.enemies[q.enemy].shop?{base:shopBase(q.base),...(Array.isArray(q.shopLoot)?{shopLoot:shopSlots(q.shopLoot)}:{})}:{})}));
  if(queue.length!==b.queue.length||queue[0].enemy!==b.target)return null;const m=mods(r),st=R.stats(s),nb={run:true,dungeon:r.dungeon,queue,mods:{hpBps:m.hpBps,attackBps:m.attackBps},target:b.target,hp:0n,turn:Math.max(0,Math.min(600,Number.isSafeInteger(b.turn)?b.turn:0)),shield:min(b.shield,st.hp*st.shieldBps/10000n),cooldown:Math.max(0,Math.min(1000,Number.isFinite(b.cooldown)?b.cooldown:0)),paused:b.paused===true,stalled:0,story:false,...(GameNumber.valid(b.enemyLeechTotal)?{enemyLeechTotal:N(b.enemyLeechTotal)}:{}),...(GameNumber.valid(b.stored)&&N(b.stored)>0n?{stored:N(b.stored)}:{}),...(b.endured===true?{endured:true}:{})};
  const f=foe(nb,b.target);nb.hp=GameNumber.valid(b.hp)&&N(b.hp)>0n?min(b.hp,f.hp):N(f.hp);return nb;}
 // Card book (user 2026-11-03: 图鉴可以查看各个地下城遇到的卡片，没遇到的就？): every card shown face up in a run is
 // remembered per area (area.book); a card only hinted at (wrong form) is not. Fights stay in the monster list.
 const BOOK_SPECIAL=['rest','treasure','nameless','sluice','hoard','candle','shop'];
 function ownTitle(d,n,k){const o=X(d)?.layers[n-1]?.cardText?.[k];return o&&typeof o==='object'&&o.title?o:null;}
 function bookKey(c,r){if(!c)return null;if(r&&!r.zone&&BOOK_SPECIAL.includes(c.kind)&&ownTitle(r.dungeon,r.layer,c.kind))return c.kind+':'+r.layer;if(c.kind==='event')return C.dungeonEvents?.events[c.id]?'ev:'+c.id:null;if(c.kind==='character')return 'char:'+c.id;if(c.kind==='identity')return 'id:'+c.id;if(c.kind==='form')return 'form:'+c.id;if(c.kind==='faction')return c.faction?'faction:'+c.faction:null;return BOOK_SPECIAL.includes(c.kind)?c.kind:null;}
 function noteCards(s,r,cards,count){if(!r||!X(r.dungeon))return;for(const c of cards||[]){const k=bookKey(c,r);if(!k||hintText(s,r,c))continue;const a=area(s,r.dungeon);(a.book??={})[k]=true;if(count&&c.kind==='event'&&C.dungeonEvents.events[c.id]?.runCap)r.used['fs:'+c.id+':'+r.step]=true;if(count&&!r.zone&&(c.kind==='rest'||c.kind==='event'&&healEvent(C.dungeonEvents.events[c.id])))r.used['hs:'+r.step]=true;}}
 // Every card an area can show, in groups: its events (main tables, layer tables and its reward areas), the people met
 // there, the cards a form finds, and the area's own cards (rest, treasure, its mechanic, the shop).
 // Every card an area can show, in groups (user 2026-11-04: 道中并到出来事，出来事太多再拆分): its ordinary events with
 // the area's own cards (rest, treasure, its mechanic, the shop), the people met there, the events and cards of one form
 // (sub = that form, or '*' for several), and the events of each reward area (sub = the zone).
 function bookEntries(d){const x=X(d);if(!x)return [];const out=[],keys=new Set(),ev=C.dungeonEvents?.events||{},add=(group,card,title,text,seen,key=bookKey(card),layer=1,sub='')=>{if(!key||keys.has(key)||!title)return;keys.add(key);out.push({key,group,sub,card,title,text:text||'',layer,seen});};
  const zones=Object.values(C.explorationZones||{}).filter(z=>z.hosts?.[d]),inLayers=new Set(x.layers.flatMap(l=>l.events||[])),formOf=q=>q?.form||(q?.forms?.length===1?q.forms[0]:q?.forms?.length?'*':'');
  // A side quest's steps (content/form-quests.json) stay together, in order, at the end of the form group.
  for(const id of [...(x.events||[]),...inLayers])if(ev[id]){const f=ev[id].quest?'quest:'+ev[id].quest.id:formOf(ev[id].requires);add(f?'form':'event',{kind:'event',id},ev[id].name,ev[id].text,(s,a)=>!!a.seen?.[id],undefined,1,f);}
  for(const k of BOOK_SPECIAL){const def=x.cards?.[k];if(!def||k==='shop'&&!C.shop)continue;if(MECH.includes(k)&&!(k==='hoard'&&M(d)?.type==='alert'||k==='candle'&&M(d)?.type==='candles'))continue;const own=x.layers.map((l,i)=>ownTitle(d,i+1,k));if(own.some(o=>!o)||zones.length)add('event',{kind:k},def.title,def.text,()=>false);own.forEach((o,i)=>{if(o)add('event',{kind:k},o.title,o.text||def.text,()=>false,k+':'+(i+1),i+1);});}
  const m=M(d);if(m?.type==='factions'&&x.cards?.faction)for(const f of m.factions){const face=cardFace({dungeon:d},{kind:'faction',faction:f.id});if(face)add('event',{kind:'faction',faction:f.id},face[0],face[1],()=>false);}
  for(const k of x.characters||[])if(C.characters[k.id]&&!C.characters[k.id].retired)add('meet',{kind:'character',id:k.id},k.title,k.text,s=>!!s.owned?.[k.id]);
  for(const [id,k]of Object.entries(x.identities||{}))if(C.enemies[id])add('meet',{kind:'identity',id},k.title,k.text,s=>!!s.owned?.[id]);
  for(const f of x.forms||[]){const g=formOf(f);add(g?'form':'event',{kind:'form',id:f.id},f.title,f.text,()=>false,undefined,1,g);}
  for(const z of zones)for(const id of z.events||[])if(ev[id])add('zone',{kind:'event',id},ev[id].name,ev[id].text,(s,a)=>!!a.seen?.[id],undefined,1,z.id);
  const order=new Map(Object.keys(C.characters).map((k,i)=>[k,i]));const rank=e=>e.group==='form'?(e.sub.startsWith('quest:')?2e6+(ev[e.card.id]?.quest?.step||0):e.sub==='*'?1e6:order.get(e.sub)??1e5):0;return out.map((e,i)=>[e,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(([e])=>e);}
 function book(s,d){const a=s.exploration?.areas?.[d]||{},b=a.book||{};return bookEntries(d).map(({seen,...e})=>({...e,known:!!b[e.key]||!!seen(s,a)}));}
 return Object.freeze({book,bookEntries,mechanicStatus,cardFace,experimentView,reconcileCards,hint,estimate,fresh,state,area,run,layer,highest,members,layerOpen,chestOf,formOptions,trait,souls,canStart,start,choose,options,answer,storyFight,won,escaped,storyWon,end,retreat,finish,canSwitch,switchForm,rechallengeable,foe,mods,normalize,restoreBattle,winnable,eventAvailable,zone:Z});
})();

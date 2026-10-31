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
 function layer(r){const h=X(r.dungeon).layers[r.layer-1];if(!r.zone)return h;const z=Z(r.zone.id);
  return {...z,chest:h.chest,chestMult:(h.chestMult||1)*z.chestMult,eventBase:h.eventBase*z.eventMult,treasure:h.treasure*z.treasureMult,background:z.background||h.background};}
 // A merged area's deeper layers come from another former dungeon (layer.source): its enemies, chest (layer.chest) and
 // the memory route that used to open it (layer.opens).
 function members(d){const x=X(d);return new Set([d,...(x?.layers||[]).map(l=>l.source).filter(Boolean)]);}
 function layerOpen(s,d,n){const l=X(d)?.layers[n-1];return !!l&&(!l.opens||!!R.dungeonOpen(s,l.opens))&&(!l.requiresStory||!!s.completedStories?.[l.requiresStory]);}
 function chestOf(r){return layer(r).chest||r.dungeon;}
 // Form traits (content/forest-exploration.json traits, user 2026-10-23): the fairy goes unnoticed and may slip past any
 // non-guardian fight. Traits are never explained to the player and never change battle stats.
 function trait(s){return C.explorationTraits?.[s.active]||{};}

 function highest(s,d){let n=0;const a=area(s,d);while(a.cleared[n+1])n++;return n;}
 function souls(s,d){const x=X(d);return x?R.quantity(s,x.souls.item):0n;}
 // Effects of events still active in the run (they count down per enemy defeated).
 function mods(r){const m={hpBps:10000,attackBps:10000,chestBps:0,healBps:0};for(const a of r?.effects||[]){if(a.enemyHpBps)m.hpBps=m.hpBps*a.enemyHpBps/10000;if(a.enemyAttackBps)m.attackBps=m.attackBps*a.enemyAttackBps/10000;m.chestBps+=a.chestBonusBps||0;m.healBps+=a.healPerBattleBps||0;}return m;}
 // The enemy as it fights in a run: the queued fight's overrides and the run's active effects.
 function foe(b,id){let e=C.enemies[id];if(!e||!b?.run||e.story)return e;const q=b.queue?.[0],m=b.mods||{hpBps:10000,attackBps:10000};if(q?.base&&q.enemy===id)e={...e,hp:q.base.hp,attack:q.base.attack};
  const hp=Math.round((q?.hpBps||10000)*m.hpBps/10000),at=Math.round((q?.attackBps||10000)*m.attackBps/10000);if(hp===10000&&at===10000&&!q?.label)return e;
  return {...e,name:q?.label||e.name,hp:String(GameNumber.max(1n,N(e.hp)*BigInt(hp)/10000n)),attack:String(N(e.attack)*BigInt(at)/10000n)};}
 // A zone monster's strength in this run: its share (zoneScale) of the reference monster saved when the zone was entered.
 function zb(r,id){const e=C.enemies[id],z=r?.zone;if(!e?.zoneScale||!z)return {};const k=(v,b)=>String(GameNumber.max(1n,N(v)*BigInt(b)/10000n));return {base:{hp:k(z.ref.hp,e.zoneScale.hpBps),attack:k(z.ref.attack,e.zoneScale.attackBps),chests:z.ref.chests}};}
 // The outcome a fight card promises from the current HP, simulated with the battle code ('？' until that enemy has
 // been fought once, won or lost; a layer guardian always shows its real odds): 'easy' (楽勝, under 15% of
 // max HP lost), 'win' (勝てる), 'risky' (危うい, wins but loses half or more) or 'lose' (勝てない). Swarms fight their
 // whole count without healing; ambush and boost overrides come from the card.
 const GRADES={easy:'楽勝',win:'勝てる',risky:'危うい',lose:'勝てない',unknown:'？'};
 function estimate(s,c){const r=run(s),st=R.stats(s),id=c.enemy||c.id,base=C.enemies[id];if(!base)return null;if(!s.seenEnemies?.[id]&&c.kind!=='guardian')return {grade:'unknown',label:GRADES.unknown};const e=r?foe({run:true,queue:[c],mods:mods(r)},id):base;let hp=N(s.hp),start=hp;for(let k=0;k<(c.count||1);k++){const result=BattleSystem.predict(st,e,{playerHp:hp,limit:c.escapeAfter||60,resolvePhase:id=>C.enemies[id]});if(result.outcome!=='victory')return {grade:'lose',label:GRADES.lose};hp=result.playerHp;if(hp<st.hp)hp=min(st.hp,hp+st.hp*st.killHealBps/10000n);}const lost=Number((start-hp)*100n/(st.hp||1n)),grade=lost<15?'easy':lost<50?'win':'risky';return {grade,label:GRADES[grade]};}
 function winnable(s,id,limit=20,full=false){const st=R.stats(s),e=typeof id==='object'?id:C.enemies[id];return BattleSystem.predict(st,e,{playerHp:full?st.hp:s.hp,limit,resolvePhase:id=>C.enemies[id]}).outcome==='victory';}
 function canStart(s,d,l){const x=X(d);return !!x&&!run(s)&&!s.battle&&!!R.dungeonOpen(s,d)&&N(s.hp)>0n&&Number.isInteger(l)&&l>=1&&l<=x.layers.length&&l<=highest(s,d)+1&&layerOpen(s,d,l);}
 function start(s,d,l){if(!canStart(s,d,l))return false;const st=state(s),a=area(s,d),o=X(d).layers[l-1].opens;if(o&&C.dungeons[o]?.firstEntryFormId)(s.enteredDungeons??={})[o]=true;a.runs++;if(a.wary>0)a.wary--;
  st.run={dungeon:d,layer:l,step:0,rng:next(st),cards:null,choice:null,rested:-1,effects:[],used:{},gained:{chests:'0',kills:0},result:null,...(X(d).layers[l-1].water?{water:area(s,d).water||X(d).layers[l-1].water}:{})};
  s.dungeon=d;s.enteredDungeons[d]=true;s.view='run';s.battle=null;draw(s);R.touch(s);return true;}
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
 const TARGET_ACTIONS=5,ELITE_FROM=2,CARDS=3,HINT_FORM_ODDS=3;
 function tierFor(s,r,l){let t=0;for(let i=l.tiers.length-1;i>0;i--)if(winnable(s,l.tiers[i][0],TARGET_ACTIONS,true)){t=i;break;}if(t>0&&r.step<Math.floor(l.steps/3))t--;return t;}
 function eventAvailable(s,r,id,anyForm=false){const e=C.dungeonEvents.events[id],q=e.requires||{};if(r.used['ev:'+id])return false;if(e.effect&&onlyCapped(s,r,e.effect))return false;if(e.once&&area(s,r.dungeon).once?.[id])return false;if(q.winnable&&!winnable(s,q.winnable))return false;if(q.env?.water&&r.water!==q.env.water)return false;if(q.populations&&r.water!=='low')return false;
  // Event table conditions: current form, owned characters, stories read, HP or soul state, cooldown in runs and
  // chain steps (a later step only in a later run than the step before it).
  const a=area(s,r.dungeon);if(!anyForm&&(q.forms&&!q.forms.includes(s.active)||q.notForms?.includes(s.active)))return false;if(q.owned&&!q.owned.every(k=>s.owned[k]))return false;if(q.stories&&!q.stories.every(k=>s.completedStories?.[k]))return false;
  if(q.state){const st=R.stats(s),hp=N(s.hp)*100n;if(q.state==='low'&&hp>=st.hp*40n)return false;if(q.state==='high'&&hp<st.hp*90n)return false;if(q.state==='souls'&&souls(s,r.dungeon)+2n<N(X(r.dungeon).souls.cap))return false;}
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
   if(kind==='swarm'){enemy=member(r,l.tiers[0]);count=l.swarmCount??b.count;}else if(kind==='ambush'){enemy=member(r,tier);}else if(kind==='elite'){enemy=l.elite;if(l.eliteBoost){hpBps=l.eliteBoost.hpBps;attackBps=l.eliteBoost.attackBps;label=l.eliteBoost.label;}}else enemy=member(r,tier);
   // An ally won through an event chain (the fox family after 貸しを作っておく) warns of ambushes on its layers, in any form.
   let ally=null;if(kind==='ambush'){const ch=area(s,r.dungeon).chains||{};ally=(b.allies||[]).find(a=>ch[a.chain]===a.step&&(!a.layers||a.layers.includes(r.layer)))||null;if(b.sense?.includes(s.active)||ally){sensed=true;hpBps=b.senseHpBps;}else attackBps=l.ambushAttackBps??b.attackBps;}
   const drop=kind==='elite'?dropOf(r,'elite'):null;
   return {kind,enemy,count,chestBps:b.chestBps||10000,...zb(r,enemy),...(drop?{drop}:{}),...(hpBps!==10000?{hpBps}:{}),...(attackBps!==10000?{attackBps}:{}),...(label?{label}:{}),...(sensed?{sensed}:{}),...(ally&&!b.sense?.includes(s.active)?{ally:ally.chain}:{})};}
  // Recently seen events are held back while others remain; events never seen in this area weigh double.
  if(kind==='event'){const table=l.events||x.events,all=table.filter(id=>eventAvailable(s,r,id)),a=area(s,r.dungeon),fresh=all.filter(id=>!a.recent?.includes(id)),ids=fresh.length?fresh:all;if(!ids.length)return null;const w=C.dungeonEvents.rarityWeights,ev=C.dungeonEvents.events,weight=id=>(ev[id].weight??w[ev[id].rarity])*(a.seen?.[id]?1:2)*4;let t=roll(r,ids.reduce((n,id)=>n+weight(id),0));for(const id of ids){t-=weight(id);if(t<0)return {kind,id};}return {kind,id:ids.at(-1)};}
  // The form slot of a table goes to a hint only now and then (HINT_FORM_ODDS) when the current form finds no card of its own.
  if(kind==='form'){const own=formOptions(s,r),hs=hintOk?formHints(s,r):[],fs=own.length||hs.length&&roll(r,HINT_FORM_ODDS)===0?[...own,...hs]:[];return fs.length?{kind,id:fs[roll(r,fs.length)]}:null;}
  if(kind==='nameless')return r.used.nameless?null:{kind};
  if(kind==='sluice')return r.water&&!r.used.sluice?{kind}:null;
  if(kind==='rest'||kind==='treasure')return {kind};
  return null;}
 function draw(s){const r=run(s),l=layer(r),x=X(r.dungeon);r.choice=null;
  const experiment=!r.zone&&expDef(l.experiment);if(experiment&&r.step>=l.experimentStep&&r.step<lastStep(r,l)&&area(s,r.dungeon).experiments?.[experiment.id]!==experiment.revision){expProgress(s,experiment);r.cards=[];r.choice={kind:'experiment',id:experiment.id};return;}
  // Fixed steps (user 2026-10-29: 回到最早的步数定死的版本): a layer is its authored number of steps and its last step
  // is the guardian alone; the player fights it or retreats. It never comes earlier (no shortcut by winnability or by
  // record) and a player cannot keep walking a layer without it. A long stuck point withdraws after its turnLimit
  // actions (escapeAfter) instead of fighting to the end; a cleared layer's guardian pays replayChestBps.
  const g=l.guardian,gd=dropOf(r,'guardian'),cleared=!r.zone&&!!area(s,r.dungeon).cleared[r.layer],gb=x.battles.guardian,gc={kind:'guardian',enemy:g.enemy,count:1,chestBps:cleared&&gb.replayChestBps||gb.chestBps,...(gd?{drop:gd}:{}),...(g.hpBps?{hpBps:g.hpBps}:{}),...(g.attackBps?{attackBps:g.attackBps}:{}),...(g.turnLimit&&!r.zone?{escapeAfter:g.turnLimit}:{}),label:g.label,...zb(r,g.enemy)};
  if(r.step>=lastStep(r,l)){r.cards=[gc];return;}
  const cards=[];if(r.bonusTreasure){r.bonusTreasure=false;cards.push({kind:'treasure',found:true});}
  let hinted=false;if(!r.zone)for(const c of x.characters)if(c.layer===r.layer&&r.step>=(c.from||0)&&!r.used['char:'+c.id]){const k={kind:'character',id:c.id};if(characterReady(s,c.id))cards.push(k);else if(!hinted&&wants(s,r,k)){hinted=true;cards.push(k);}}
  if(!r.zone&&l.identities&&r.step>=(l.identityFrom||0)&&!r.used.identity){const ids=l.identities.filter(id=>!s.owned[id]);if(ids.length&&roll(r,10000)<l.identityChanceBps)cards.push({kind:'identity',id:ids[roll(r,ids.length)]});}
  // Every other step offers exactly CARDS cards (user 2026-10-24). Fixed cards beyond that keep characters, then the
  // found treasure (saved for the next step), then the identity.
  if(cards.length>CARDS){const rank=['character','treasure','identity'],at=c=>fits(s,r,c)?rank.indexOf(c.kind):rank.length;cards.sort((a,b)=>at(a)-at(b));if(cards.splice(CARDS).some(c=>c.found))r.bonusTreasure=true;}
  const low=N(s.hp)*5n<R.stats(s).hp*2n,skip=new Set(r.step<ELITE_FROM?['elite']:[]);
  for(let guard=0;cards.length<CARDS&&guard<30;guard++){const kind=pick(r,low?{...l.weights,rest:(l.weights.rest||0)*2}:l.weights,skip);if(!kind)break;skip.add(kind);const c=make(s,r,l,x,kind,!hinted);if(c){if(!fits(s,r,c))hinted=true;cards.push(c);}}
  while(cards.length<CARDS)cards.push(make(s,r,l,x,'battle'));
  // Never only unwinnable fights: keep one card that is not a fight, or a fight won from the current HP.
  const safe=c=>fits(s,r,c)&&(c.kind!=='guardian'&&!FIGHTS.includes(c.kind)||(c.count||1)===1&&winnable(s,foe({run:true,queue:[c],mods:mods(r)},c.enemy),25));
  if(!cards.some(safe)){const k=r.used.treasureSafe?'rest':'treasure';r.used.treasureSafe=true;cards[cards.length-1]={kind:k};}
  r.cards=cards;}
 // ---- resolving ----
 function chests(s,r,n){n=N(n);if(n<=0n)return 0n;const got=R.addChest(s,chestOf(r),n);r.gained.chests=String(N(r.gained.chests)+got);return got;}
 // Event rewards are scaled once more by the event table's rewardScaleBps (content/dungeon-events.json) so all events
 // together stay a modest share of growth.
 function eventChests(r,bps){return bps?(BigInt(layer(r).eventBase)*BigInt(bps)*BigInt(C.dungeonEvents.rewardScaleBps??10000)+99999999n)/100000000n:0n;}
 function heal(s,bps){const st=R.stats(s);R.healTo(s,st.hp*BigInt(bps)/10000n);}
 function hurt(s,bps){const loss=R.stats(s).hp*BigInt(bps)/10000n,hp=N(s.hp)-loss;s.hp=hp>0n?hp:1n;}
 function soul(s,r,report){const x=X(r.dungeon),got=R.add(s,x.souls.item,1n);if(got>0n){report.souls=(report.souls||0)+1;return true;}
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
 function apply(s,r,e,report,talk={}){e=e||{};if(e.zone&&Z(e.zone)&&!r.zone){enter(s,r,e.zone,report);if(talk.after)report.text=talk.after;return true;}const l=layer(r);
  if(e.damageBps)hurt(s,e.damageBps);if(e.healBps)heal(s,e.healBps);
  for(const [k,q]of Object.entries(e.items||{})){const got=R.add(s,k,N(q));if(got>0n)(report.items??={})[k]=String(got);}
  if(e.soul)soul(s,r,report);
  if(e.material){const id=material(r,e.material.role),n=eventChests(r,e.material.bps);grant(s,r,id,e.material.role==='specialty'?GameNumber.max(1n,n/8n):n,report);}
  if(e.layerElite)grant(s,r,dropOf(r,'elite'),BigInt(e.layerElite),report);
  if(e.treasure){r.bonusTreasure=true;report.treasureFound=true;}
  if(e.reveal){const l2=layer(r);for(const id of [...l2.tiers.flat(),l2.elite,l2.guardian.enemy])(s.seenEnemies??={})[id]=true;report.revealed=true;}
  if(e.wary)area(s,r.dungeon).wary=Math.max(area(s,r.dungeon).wary,e.wary);
  if(e.chain){const [c,n]=e.chain.split(':'),a=area(s,r.dungeon);(a.chains??={})[c]=Number(n);(a.chainRun??={})[c]=a.runs;}if(e.chainEnd)(area(s,r.dungeon).chains??={})[e.chainEnd]=-1;
  if(e.duration){addEffect(r,e.duration);report.duration=e.duration.label;}
  if(e.skip){r.skip=(r.skip||0)+e.skip;report.skipped=e.skip;}
  if(e.fights?.length){const queue=e.fights.map((f,i,_,id=f.enemy||(f.tier==='elite'?l.elite:member(r,l.tiers.at(-1))))=>({enemy:id,...zb(r,id),...(f.drop&&C.items[f.drop]?{drop:f.drop}:f.tier==='elite'&&dropOf(r,'elite')?{drop:dropOf(r,'elite')}:{}),...(f.hpBps?{hpBps:f.hpBps}:{}),...(f.attackBps?{attackBps:f.attackBps}:{}),...(f.label?{label:f.label}:{}),...(f.escapeAfter?{escapeAfter:f.escapeAfter}:{}),...(f.escapeAfter&&talk.escape?{escapeText:talk.escape}:{}),chestBps:f.chestBps||10000,...(f.rewardBps&&i===e.fights.length-1?{reward:String(eventChests(r,f.rewardBps))}:{}),...(talk.after&&i===e.fights.length-1?{afterText:talk.after}:{})}));fight(s,r,queue);return true;}
  if(e.rewardBps){const n=chests(s,r,eventChests(r,e.rewardBps));report.chests=String(N(report.chests||0)+n);}
  return false;}
 // Entering a zone keeps the host run's step and guardian; leaving (the zone guardian beaten) restores them and steps on.
 // The reference is the host layer's strongest regular monster, raised to the zone's floor (calibrated to the power of a
 // player who has just met the earliest entry form), so a zone entered right after its form is never a walkover.
 function enter(s,r,id,report){const h=X(r.dungeon).layers[r.layer-1],ref=C.enemies[h.tiers.at(-1)[0]],a=area(s,r.dungeon),f=Z(id).floor||{hp:'0',attack:'0'};
  r.zone={id,ref:{hp:String(GameNumber.max(N(ref.hp),N(f.hp))),attack:String(GameNumber.max(N(ref.attack),N(f.attack))),chests:String(ref.chests||1)},back:{step:r.step}};
  r.step=0;delete r.skip;delete r.restDraw;(a.zoneRuns??={})[id]=(a.zoneRuns[id]||0)+1;report.zone=id;draw(s);}
 function leave(s,r,report){const z=r.zone,a=area(s,r.dungeon);(a.zones??={})[z.id]=(a.zones[z.id]||0)+1;if(report)report.events.push({kind:'zoneCleared',dungeon:r.dungeon,zone:z.id});
  delete r.zone;r.step=z.back.step;delete r.skip;step(s,r);}
 function step(s,r){let nextStep=r.step+1+(r.skip||0);const l=layer(r),d=!r.zone&&expDef(l.experiment);if(d&&area(s,r.dungeon).experiments?.[d.id]!==d.revision&&r.step<l.experimentStep&&nextStep>l.experimentStep)nextStep=l.experimentStep;r.step=nextStep;r.skip=0;delete r.restDraw;draw(s);}
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
   if((repaired||r.cards.length<previousCount)&&!r.choice&&!r.cards.some(c=>!hintText(s,r,c)))r.cards.push({kind:'rest'});
  }
  return r;
 }
 function reconcileCards(s){return reconcileRun(s,run(s));}
 // A drawn card still fits the current form (form cards, events for some forms, characters met only in an entry form).
 function fits(s,r,c){if(c.kind==='form'){const f=X(r.dungeon).forms.find(f=>f.id===c.id);return !!f&&formFits(s,r,f);}if(c.kind==='event')return identityFits(s,c);if(c.kind==='character')return characterReady(s,c.id);return true;}
 function choose(s,i,report={events:[]}){const r=run(s);if(!r||r.result||r.choice||s.view!=='run'||!r.cards?.[i]||!fits(s,r,r.cards[i]))return null;const c=r.cards[i],x=X(r.dungeon),l=layer(r),out={kind:'runCard',card:c.kind,...(c.id?{id:c.id}:{})};
  if(FIGHTS.includes(c.kind)&&trait(s).slip){r.choice={kind:'slip',card:{...c}};}
  else if(FIGHTS.includes(c.kind)||c.kind==='guardian'){const q={enemy:c.enemy,chestBps:c.chestBps,...(c.hpBps?{hpBps:c.hpBps}:{}),...(c.attackBps?{attackBps:c.attackBps}:{}),...(c.label?{label:c.label}:{}),...(c.drop&&C.items[c.drop]?{drop:c.drop}:{}),...(c.kind==='guardian'?{guardian:true}:{}),...(c.kind==='guardian'&&c.escapeAfter?{escapeAfter:c.escapeAfter}:{}),...(c.base?{base:{...c.base}}:{})};fight(s,r,Array.from({length:c.count||1},()=>({...q})));}
  else if(c.kind==='event'){r.used['ev:'+c.id]=true;const def=C.dungeonEvents.events[c.id],a=area(s,r.dungeon);if(def.once)(a.once??={})[c.id]=true;(a.seen??={})[c.id]=true;a.recent=[c.id,...(a.recent||[]).filter(k=>k!==c.id)].slice(0,RECENT);(a.lastRun??={})[c.id]=a.runs;if(def.options)r.choice={kind:'event',id:c.id};else{const talk={after:def.resultText,escape:def.escapeText};if(!apply(s,r,def.effect,out,talk)){if(talk.after)out.text=talk.after;step(s,r);}}}
  // The rest card remembers the draw state of the next cards: a form switch here redraws them from the same seed, so each
  // form always gets the same cards (no reroll by switching back and forth) and no card of the previous form is left.
  else if(c.kind==='rest'){heal(s,x.restHealBps);const d={rng:r.rng,...(r.bonusTreasure?{bonus:true}:{}),...(r.used.treasureSafe?{safe:true}:{})};step(s,r);r.rested=r.step;r.restDraw=d;}
  else if(c.kind==='treasure'){out.chests=String(chests(s,r,l.treasure));step(s,r);}
  else if(c.kind==='nameless'){r.used.nameless=true;r.choice={kind:'nameless'};}
  else if(c.kind==='sluice'){r.used.sluice=true;r.choice={kind:'sluice'};}
  else if(c.kind==='form'){r.used['form:'+c.id]=true;r.choice={kind:'form',id:c.id};}
  else if(c.kind==='character'){s.encounters[c.id]=true;out.story=true;}
  else if(c.kind==='identity'){r.used.identity=true;s.encounters[c.id]=true;storyFight(s,c.id);}
  report.events.push(out);R.touch(s);return out;}
 const FULL_NOTE='（もう取り込めない：喰らうと傷が癒える）';
 // Options may be limited to some forms (forms / notForms), like the 血を吸う of a vampire.
 function options(s){const r=run(s);if(r?.choice&&!pendingFits(s,r,r.choice)){const f=r.choice.kind==='form'&&X(r.dungeon).forms.find(f=>f.id===r.choice.id);return f?.zone?f.options.filter(o=>o.id==='leave'&&!Object.keys(o.effect||{}).length):[];}return rawOptions(s).filter(o=>(!o.forms||o.forms.includes(s.active))&&!o.notForms?.includes(s.active));}
 function rawOptions(s){const r=run(s),x=r&&X(r.dungeon);if(r?.choice?.kind==='experiment')return experimentOptions(s);if(!r?.choice)return [];if(r.choice.kind==='event')return C.dungeonEvents.events[r.choice.id].options.map(o=>o.effect?.soul&&soulsFull(s,r)?{...o,detail:(o.detail||'')+FULL_NOTE}:o);if(r.choice.kind==='nameless')return soulsFull(s,r)?x.cards.nameless.options.map(o=>o.id==='devour'?{...o,detail:FULL_NOTE}:o):x.cards.nameless.options;if(r.choice.kind==='sluice')return x.cards.sluice.options.filter(o=>o.water!==r.water);if(r.choice.kind==='slip')return x.cards.slip.options;return x.forms.find(f=>f.id===r.choice.id).options;}
 function answer(s,optionId,report={events:[]}){const r=run(s);if(!r?.choice||s.view!=='run')return null;if(r.choice.kind==='experiment')return answerExperiment(s,optionId,report);if(!pendingFits(s,r,r.choice)){const f=r.choice.kind==='form'&&X(r.dungeon).forms.find(f=>f.id===r.choice.id);if(!f?.zone){reconcileRun(s,r);R.touch(s);return null;}if(optionId!=='leave')return null;}const o=options(s).find(o=>o.id===optionId);if(!o)return null;const ch=r.choice,x=X(r.dungeon),out={kind:'runOption',choice:ch.kind,id:ch.id||ch.kind,option:o.id};r.choice=null;
  if(ch.kind==='slip'){if(o.id==='slip')step(s,r);else{const c=ch.card;fight(s,r,Array.from({length:c.count||1},()=>({enemy:c.enemy,chestBps:c.chestBps,...(c.hpBps?{hpBps:c.hpBps}:{}),...(c.attackBps?{attackBps:c.attackBps}:{}),...(c.label?{label:c.label}:{}),...(c.base?{base:{...c.base}}:{})})));}report.events.push(out);R.touch(s);return out;}
  let e=o.effect;if(ch.kind==='nameless')e=o.id==='devour'?{soul:1}:x.cards.nameless.spare;if(ch.kind==='sluice'){r.water=o.water;out.water=o.water;area(s,r.dungeon).water=o.water;}
  // The history records the chosen action: the option's own result, else (for a fight) the event's closing line.
  const def=ch.kind==='event'?C.dungeonEvents.events[ch.id]:null,talk={after:o.result||(def&&e?.fights?.length?def.resultText:null),escape:def?.escapeText};
  if(!apply(s,r,e,out,talk)){if(talk.after)out.text=talk.after;step(s,r);}report.events.push(out);R.touch(s);return out;}
 // A character card's fight (after its stories) or an exploration identity: a one-win story fight inside the run.
 function storyFight(s,id){const r=run(s),e=C.enemies[id];if(!e?.story||s.owned[id]||(r&&s.view!=='run'))return false;const st=R.stats(s);(s.seenEnemies??={})[id]=true;
  if(r)r.used[C.characters[id].exploration?'identity':'char:'+id]=true;
  s.view='combat';s.battle={target:id,...(r?{run:true}:{}),dungeon:e.dungeon,hp:N(e.hp),turn:0,shield:st.hp*st.shieldBps/10000n,cooldown:0,paused:false,stalled:0,story:true,checkpoint:{hp:s.hp,active:s.active,dungeon:s.dungeon}};return true;}
 function fight(s,r,queue){const st=R.stats(s);s.view='combat';const m=mods(r);s.battle={run:true,dungeon:r.dungeon,queue,mods:{hpBps:m.hpBps,attackBps:m.attackBps},target:queue[0].enemy,hp:0n,turn:0,shield:st.hp*st.shieldBps/10000n,cooldown:0,paused:false,stalled:0,story:false};s.battle.hp=N(foe(s.battle,queue[0].enemy).hp);(s.seenEnemies??={})[queue[0].enemy]=true;}
 // CollectionBattle calls these for battle.run. A queued enemy was defeated: pay the run's share of chests, count down
 // effects, then fight the next queued enemy or return to the cards. Returns true while the battle continues. The kill's
 // own chests went to the enemy's area; an area without a chest pool (the hidden layers) refuses them, so the whole
 // share is paid into the run's chest instead and the run shows what actually arrived (Codex R3 comparison 2026-10-25).
 function won(s,b,id,report){const r=run(s);if(!r)return false;const l=layer(r),e=C.enemies[id],q=b.queue?.[0]||{},m=mods(r);
  const base=BigInt(q.base?.chests??e.chests??0)*BigInt(l.chestMult)*BigInt(q.chestBps||10000)*BigInt(10000+m.chestBps)/100000000n,paid=C.dungeons[e.dungeon]?.pool?.length?N(e.chests||0):0n;let extra=base>paid?base-paid:0n;
  if(q.reward)extra+=N(q.reward);
  // A capped unique item stops dropping; the result says so instead of silently skipping it.
  if(q.drop&&C.items[q.drop]){const got=R.add(s,q.drop,1n);if(report){if(got>0n)report.items[q.drop]=(report.items[q.drop]||0n)+got;else report.events.push({kind:'dropCapped',id:q.drop});}}r.gained.chests=String(N(r.gained.chests)+paid);const got=chests(s,r,extra)+(base>0n?chests(s,r,R.chestBonus(s,chestOf(r))):0n);r.gained.kills++;if(report)report.runChests=String(N(report.runChests||0)+paid+got);
  if(m.healBps)heal(s,m.healBps);for(const a of r.effects)a.left--;r.effects=r.effects.filter(a=>a.left>0);
  b.queue.shift();if(b.queue.length){const n=mods(r);b.mods={hpBps:n.hpBps,attackBps:n.attackBps};b.target=b.queue[0].enemy;b.hp=N(foe(b,b.target).hp);b.turn=0;delete b.enemyLeechTotal;b.stalled=0;b.shield=R.stats(s).hp*R.stats(s).shieldBps/10000n;(s.seenEnemies??={})[b.target]=true;return true;}
  if(q.afterText&&report)report.events.push({kind:'runSaid',text:q.afterText});s.battle=null;s.view='run';if(q.guardian&&r.zone)leave(s,r,report);else if(q.guardian){area(s,r.dungeon).cleared[r.layer]=true;r.result={cleared:true,layer:r.layer};r.cards=null;if(report)report.events.push({kind:'runCleared',dungeon:r.dungeon,layer:r.layer});}else step(s,r);R.touch(s);return false;}
 // A fleeing enemy got away: no reward, the run continues.
 function escaped(s,b,report,record=null){const r=run(s),q=b.queue.shift();if(report){report.events.push({kind:'runEscaped',id:b.target,...(q?.guardian?{guardian:true,label:q.label||C.enemies[b.target].name}:{}),...(record?{record}:{})});if(q?.escapeText)report.events.push({kind:'runSaid',text:q.escapeText});}if(b.queue.length){b.target=b.queue[0].enemy;b.hp=N(foe(b,b.target).hp);b.turn=0;b.stalled=0;return true;}s.battle=null;s.view='run';if(r)step(s,r);return false;}
 // A story fight inside a run ended in a devour: back to the cards on the next step.
 function storyWon(s){const r=run(s);if(!r)return false;s.view='run';step(s,r);R.touch(s);return true;}
 function end(s,reason){const r=run(s);if(!r)return null;state(s).run=null;if(s.battle?.run)s.battle=null;R.touch(s);return {kind:'runEnded',reason,dungeon:r.dungeon,layer:r.layer,chests:r.gained.chests};}
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
 function normalize(raw,seed,s){const out=fresh(seed);if(!raw||typeof raw!=='object')raw={};if(Number.isInteger(raw.rng))out.rng=raw.rng>>>0;
  for(const [d,a]of Object.entries(raw.areas||{})){const x=X(d);if(!x||!a||typeof a!=='object')continue;const v={cleared:{},runs:Number.isSafeInteger(a.runs)&&a.runs>=0?a.runs:0,wary:Number.isSafeInteger(a.wary)&&a.wary>=0?Math.min(a.wary,9):0};
   for(let i=1;i<=x.layers.length;i++)if(a.cleared?.[i]===true&&(i===1||v.cleared[i-1]))v.cleared[i]=true;for(const [k,t]of Object.entries(a.once||{}))if(t===true&&C.dungeonEvents?.events[k]?.once)(v.once??={})[k]=true;
   const known=k=>!!C.dungeonEvents?.events[k],int=(o,min)=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,n])=>Number.isSafeInteger(n)&&n>=min));
   // The water level stays as the player last set it (user 2026-10-27: 调节水位出现太多次了).
   if(['high','low'].includes(a.water))v.water=a.water;
   for(const [k,t]of Object.entries(a.seen||{}))if(t===true&&known(k))(v.seen??={})[k]=true;if(Array.isArray(a.recent))v.recent=[...new Set(a.recent.filter(k=>typeof k==='string'&&known(k)))].slice(0,RECENT);
   const lr=int(a.lastRun,0);if(Object.keys(lr).length)v.lastRun=Object.fromEntries(Object.entries(lr).filter(([k])=>known(k)));const ch=int(a.chains,-1);if(Object.keys(ch).length)v.chains=ch;const cr=int(a.chainRun,0);if(Object.keys(cr).length)v.chainRun=cr;
   for(const k of ['zones','zoneRuns']){const z=Object.fromEntries(Object.entries(int(a[k],0)).filter(([id])=>Z(id)?.hosts?.[d]));if(Object.keys(z).length)v[k]=z;}
   for(const def of Object.values(experiments()).filter(e=>e.dungeon===d)){const completed=a.experiments?.[def.id];if(Number.isSafeInteger(completed)&&completed>0)(v.experiments??={})[def.id]=completed;const p=a.experimentProgress?.[def.id];if(p&&completed!==def.revision){const valid=p.revision===def.revision&&expReplay(def,p.actions)!==null;(v.experimentProgress??={})[def.id]={revision:def.revision,actions:valid?[...p.actions]:[],feedback:valid&&typeof p.feedback==='string'?p.feedback.slice(0,500):''};}}
   out.areas[d]=v;}
  // Saves from before the card exploration: a former area boss already defeated clears its layer and those before it.
  if(s?.bosses)for(const [d,x]of Object.entries(C.explorations||{})){let top=0;x.layers.forEach((l,i)=>{if(C.enemies[l.guardian.enemy]?.boss&&s.bosses[l.guardian.enemy])top=i+1;});
   if(top){const a=out.areas[d]??={cleared:{},runs:0,wary:0};for(let i=1;i<=top;i++)a.cleared[i]=true;}}
  const r=raw.run,x=X(r?.dungeon),l=x?.layers[r?.layer-1];
  if(l&&Number.isSafeInteger(r.step)&&r.step>=0&&Number.isInteger(r.rng)&&s&&R.dungeonOpen(s,r.dungeon)){
   const zd=Z(r.zone?.id),zone=zd?.hosts?.[r.dungeon]?.includes(r.layer)&&['hp','attack','chests'].every(k=>GameNumber.valid(r.zone.ref?.[k]))&&Number.isSafeInteger(r.zone.back?.step)&&r.zone.back.step>=0?{id:r.zone.id,ref:{hp:String(N(r.zone.ref.hp)),attack:String(N(r.zone.ref.attack)),chests:String(N(r.zone.ref.chests))},back:{step:r.zone.back.step}}:null;
   const ms=members(r.dungeon),enemyOk=c=>!!C.enemies[c.enemy]&&!C.enemies[c.enemy].story&&(zone?C.enemies[c.enemy].zone===zone.id:ms.has(C.enemies[c.enemy].dungeon)&&!C.enemies[c.enemy].zone);
   const rebase=c=>c.enemy&&C.enemies[c.enemy]?.zoneScale?{...c,...zb({zone},c.enemy)}:c;
   const okCard=c=>c&&typeof c==='object'&&(FIGHTS.includes(c.kind)||c.kind==='guardian'?enemyOk(c):c.kind==='event'?!!C.dungeonEvents.events[c.id]:c.kind==='form'?x.forms.some(f=>f.id===c.id):c.kind==='character'||c.kind==='identity'?!!C.characters[c.id]:['rest','treasure','nameless','sluice'].includes(c.kind));
   const cards=Array.isArray(r.cards)&&r.cards.length&&r.cards.every(okCard)?r.cards.map(c=>rebase({...c})):null;
   const choice=r.choice?.kind==='experiment'&&!zone&&r.choice.id===l.experiment&&expDef(r.choice.id)&&r.step>=l.experimentStep&&r.step<l.steps-1&&out.areas[r.dungeon]?.experiments?.[r.choice.id]!==expDef(r.choice.id).revision?{kind:'experiment',id:r.choice.id}:r.choice?.kind==='slip'&&okCard(r.choice.card)&&FIGHTS.includes(r.choice.card.kind)?{kind:'slip',card:rebase({...r.choice.card})}:r.choice?.kind==='nameless'?{kind:'nameless'}:r.choice?.kind==='sluice'&&l.water?{kind:'sluice'}:r.choice?.kind==='event'&&C.dungeonEvents.events[r.choice.id]?.options?{kind:'event',id:r.choice.id}:r.choice?.kind==='form'&&x.forms.some(f=>f.id===r.choice.id)?{kind:'form',id:r.choice.id}:null;
   const used={};for(const [k,v]of Object.entries(r.used||{}))if(v===true&&typeof k==='string'&&k.length<40)used[k]=true;
   const effects=(Array.isArray(r.effects)?r.effects:[]).filter(a=>a&&typeof a.label==='string'&&Number.isSafeInteger(a.left)&&a.left>0).map(a=>({id:a.label,label:a.label,left:Math.min(a.left,20),enemyHpBps:Number(a.enemyHpBps)||0,enemyAttackBps:Number(a.enemyAttackBps)||0,chestBonusBps:Number(a.chestBonusBps)||0,healPerBattleBps:Number(a.healPerBattleBps)||0}));
   const cleared=r.result?.cleared===true&&out.areas[r.dungeon]?.cleared[r.layer];
   out.run={dungeon:r.dungeon,layer:r.layer,step:r.step,rng:r.rng>>>0,cards:cleared?null:cards,choice:cleared?null:choice,rested:Number.isSafeInteger(r.rested)?r.rested:-1,effects,used,gained:{chests:GameNumber.valid(r.gained?.chests)?String(N(r.gained.chests)):'0',kills:Number.isSafeInteger(r.gained?.kills)?r.gained.kills:0},result:cleared?{cleared:true,layer:r.layer}:null,...(Number.isSafeInteger(r.skip)&&r.skip>0?{skip:Math.min(r.skip,3)}:{}),...(l.water?{water:['high','low'].includes(r.water)?r.water:l.water}:{}),...(r.bonusTreasure===true?{bonusTreasure:true}:{}),...(zone?{zone}:{}),...(Number.isSafeInteger(r.rested)&&r.rested===r.step&&Number.isInteger(r.restDraw?.rng)?{restDraw:{rng:r.restDraw.rng>>>0,...(r.restDraw.bonus===true?{bonus:true}:{}),...(r.restDraw.safe===true?{safe:true}:{})}}:{})};
   reconcileRun(s,out.run);
   const due=!zone&&expDef(l.experiment)&&r.step>=l.experimentStep&&r.step<l.steps-1&&out.areas[r.dungeon]?.experiments?.[l.experiment]!==expDef(l.experiment).revision;
   if(!cleared&&(!out.run.cards||due&&s.view==='run')){s.exploration=out;draw(s);}
  }
  return out;}
 // A run fight restored from a save continues against the same queue; anything invalid returns to the cards.
 function restoreBattle(s,b){const r=run(s);if(!r||!b?.run||b.story||!Array.isArray(b.queue)||!b.queue.length)return null;
  const ms=members(r.dungeon),queue=b.queue.filter(q=>q&&C.enemies[q.enemy]&&!C.enemies[q.enemy].story&&(r.zone?C.enemies[q.enemy].zone===r.zone.id:ms.has(C.enemies[q.enemy].dungeon)&&!C.enemies[q.enemy].zone)).map(q=>({enemy:q.enemy,...zb(r,q.enemy),chestBps:Number(q.chestBps)||10000,...(Number(q.hpBps)>0?{hpBps:Number(q.hpBps)}:{}),...(Number(q.attackBps)>0?{attackBps:Number(q.attackBps)}:{}),...(typeof q.label==='string'?{label:q.label}:{}),...(Number(q.escapeAfter)>0?{escapeAfter:Number(q.escapeAfter)}:{}),...(GameNumber.valid(q.reward)?{reward:String(q.reward)}:{}),...(typeof q.afterText==='string'?{afterText:q.afterText}:{}),...(typeof q.escapeText==='string'?{escapeText:q.escapeText}:{}),...(typeof q.drop==='string'&&C.items[q.drop]?{drop:q.drop}:{}),...(q.guardian===true?{guardian:true}:{})}));
  if(queue.length!==b.queue.length||queue[0].enemy!==b.target)return null;const m=mods(r),st=R.stats(s),nb={run:true,dungeon:r.dungeon,queue,mods:{hpBps:m.hpBps,attackBps:m.attackBps},target:b.target,hp:0n,turn:Math.max(0,Math.min(600,Number.isSafeInteger(b.turn)?b.turn:0)),shield:min(b.shield,st.hp*st.shieldBps/10000n),cooldown:Math.max(0,Math.min(1000,Number.isFinite(b.cooldown)?b.cooldown:0)),paused:b.paused===true,stalled:0,story:false,...(GameNumber.valid(b.enemyLeechTotal)?{enemyLeechTotal:N(b.enemyLeechTotal)}:{})};
  const f=foe(nb,b.target);nb.hp=GameNumber.valid(b.hp)&&N(b.hp)>0n?min(b.hp,f.hp):N(f.hp);return nb;}
 return Object.freeze({experimentView,reconcileCards,hint,estimate,fresh,state,area,run,layer,highest,members,layerOpen,chestOf,formOptions,trait,souls,canStart,start,choose,options,answer,storyFight,won,escaped,storyWon,end,retreat,finish,canSwitch,switchForm,rechallengeable,foe,mods,normalize,restoreBattle,winnable,eventAvailable,zone:Z});
})();

/* Labyrinth-only view. The host supplies state and command callbacks; this module has
 * no access to world combat, world inventory or localStorage. */
const MemoryLabyrinthUI=(()=>{
 const art='assets/alice.png';
 const zoneNames=['萌芽','波紋','残響','深淵','永遠'];
 function create({document,onAction,onClose}){
  const dialog=document.getElementById('memoryLabyrinth'),body=document.getElementById('memoryLabyrinthBody'),L=MemoryLabyrinth,P=L.params,F=L.format,N=L.count,UNIT=(typeof MemoryLabyrinthModel!=='undefined'&&MemoryLabyrinthModel.UNIT)||1;let lastKey='',zone=0,last=null;
  // View-only choices (open tab, folded lists, menu, retreat confirmation); never saved.
  const view={tab:'tree',tier:null,menu:false,confirm:false,lobby:false};
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const button=(id,text,command,disabled=false,cls='secondary')=>{const b=el('button',text,cls);b.id=id;b.type='button';b.disabled=disabled;b.onclick=()=>onAction(command);return b;};
  const label=(id,text,tag='p',cls='')=>{const n=el(tag,text,cls);n.id=id;return n;};
  // Two cards facing each other: the chosen 面影 on the left, the memory figure on the right, both in their scene art.
  function card(id,side){const c=el('figure',null,'memory-card memory-card-'+side);c.id=id;const img=el('img');img.alt='';img.draggable=false;img.onerror=()=>{img.removeAttribute('src');};const name=el('figcaption');c.append(img,name);c.memoryImg=img;c.memoryName=name;return c;}
  function stage(){const scene=el('section',null,'memory-scene');scene.id='memoryScene';scene.setAttribute('aria-label','混沌の記憶迷宮');const cards=el('div',null,'memory-cards');cards.append(card('memoryHero','hero'),el('span',null,'memory-spark'),card('memoryFoe','foe'));const head=el('div',null,'memory-floor-head'),where=el('b'),bar=el('div',null,'memory-floor-bar');bar.setAttribute('aria-hidden','true');scene.memorySteps=[];for(let i=0;i<5;i++){const seg=el('i');seg.setAttribute('data-floor-step',i);bar.append(seg);scene.memorySteps.push(seg);}scene.memoryWhere=where;head.append(where,el('span','全5層'));scene.memoryBg=portrait(null,'memory-floor-bg');scene.append(scene.memoryBg,head,bar,cards);return scene;}
  const sceneOf=new Map(P.chaos.figures.map(f=>[f.combat,f.scene]));
  function show(c,src,title,hint){const img=c.memoryImg;if(img.memorySrc!==src){img.memorySrc=src;if(!src)img.removeAttribute('src');else if(globalThis.GameAssets?.image)GameAssets.image(img,src);else img.src=src;}if(src)c.removeAttribute('data-empty');else c.setAttribute('data-empty','');img.alt=title;if(hint)c.memoryName.replaceChildren(el('b',title),el('small',hint));else c.memoryName.textContent=title;}
  function updateStage(state){const scene=document.getElementById('memoryScene'),hero=document.getElementById('memoryHero'),foe=document.getElementById('memoryFoe');if(!scene||!hero||!foe)return;const r=state.run,phase=r?.phase||'ready';scene.setAttribute('data-phase',phase==='fight'?'combat':phase);scene.setAttribute('data-floor',r?.r.floor||0);scene.setAttribute('data-run',r?'true':'false');const f=r?.r.floor||0;floorArt(scene.memoryBg,r?'assets/memory-labyrinth/floors/floor-'+(f+1)+'.webp':'assets/memory-labyrinth/entry-v1.webp');scene.memoryWhere.textContent=r?'第'+(f+1)+'層 · '+P.floors[f].name:'迷宮の入口';scene.memorySteps.forEach((seg,i)=>seg.setAttribute('data-state',!r?'':i<f?'done':i===f?'now':''));
   const who=L.identityInfo(r?.snapshot?.identity||state.meta.identity);show(hero,who.scene||who.combat||art,who.title);
   // The memory figure being fought; between fights its card lies face down.
   const v=phase==='fight'?L.fightView(state):null;scene.setAttribute('data-foe',!v?'':!v.boss?'memory':r.r.floor===P.floors.length-1?'goddess':'guardian');// Between fights the face-down card says where the run stands and what comes next.
   const idle=!r?['入口にいます','「入る」で探索を始めます']:{ready:['次の相手へ','すぐに次の戦いが始まります'],rest:['休息中','HPが回復しています'],gate:['層を踏破','次の層へ進むか、入口へ戻るか選べます'],cleared:['迷宮を踏破','入口へ戻れます'],defeated:['敗北','入口へ戻って立て直しましょう'],paused:['中断中','再開すると続きから戦います']}[phase]||['',''];if(v)show(foe,sceneOf.get(v.art)||v.art,v.name);else show(foe,'',idle[0],idle[1]);
   // Each turn replays one exchange: her blow, then the foe's counter when it survives it.
   const beat=v?[r.id,r.r.kills,r.fight.index,v.turn].join('|'):'';if(beat!==scene.memoryBeat){scene.memoryBeat=beat;scene.removeAttribute('data-beat');if(v){scene.style.setProperty?.('--memory-turn',Math.round(Math.max(400,Math.min(1200,v.turnMs)))+'ms');void scene.offsetWidth;scene.setAttribute('data-beat',v.counter?'exchange':'strike');}}}
  // What a target pays: base attack/HP, and the five multiplier kinds with the share each one adds.
  const zoneRate=(i,bag)=>P.zoneRates[i]*(1+(bag?.['zone_'+i]||0));
  const pct=v=>{const x=Math.round(v*1000)/10;return x>=10000?N(x)+'%':String(x)+'%';};
  const drops=(d,bag)=>{if(!d.some(Boolean))return null;const n=el('small','落とす：','ml-foe-drop');d.forEach((q,i)=>{if(q)n.append(icon(i?'item-zone'+i:'item-add'),el('span',(i?zoneNames[i-1]+'の雫 ×'+N(q)+'（攻撃・HP +'+pct(q*zoneRate(i-1,bag))+'）':'糧 ×'+N(q)+'（攻撃・HP +'+N(q*UNIT)+'）')+' '));});return n;};
  const skillText=list=>list.length?list.map(id=>P.chaos.skills[id].name+'（'+P.chaos.skills[id].text+'）').join(' · '):'技能なし';
  const statText=x=>'HP '+F(Math.log10(x.hp))+' · 攻撃 '+F(Math.log10(x.attack));
  const identityArt=x=>x.combat||x.scene||(x.id==='alice'?'assets/alice.png':'');
  const figureArt=id=>{const f=P.chaos.figures.find(x=>x.id===id);return f?.combat||f?.scene||'';};
  const portrait=(src,cls)=>{const img=el('img',undefined,cls);img.alt='';img.draggable=false;if(src){if(globalThis.GameAssets?.image)GameAssets.image(img,src);else img.src=src;}else img.hidden=true;return img;};
  // Labyrinth items: 記憶の欠片, the 糧 crystal, five in-run 雫 and five lasting 結晶.
  const icon=(id,cls)=>portrait('assets/memory-labyrinth/items/'+id+'.webp','ml-icon'+(cls?' '+cls:''));
  const withIcon=(tag,id,text,cls)=>{const n=el(tag,undefined,cls);n.append(icon(id),el('span',text));return n;};
  const floorArt=(img,src)=>{if(img.memorySrc===src)return;img.memorySrc=src;img.hidden=false;if(globalThis.GameAssets?.image)GameAssets.image(img,src);else img.src=src;};
  const box=(cls,...kids)=>{const n=el('div',undefined,cls);n.append(...kids.filter(Boolean));return n;};
  // Local view changes rebuild from the last state the host rendered.
  const local=fn=>()=>{fn();lastKey='';if(last)render(last);};
  const localButton=(id,text,fn,cls='secondary',disabled=false)=>{const b=el('button',text,cls);b.id=id;b.type='button';b.disabled=disabled;b.onclick=local(fn);return b;};
  // 記憶の揺らぎ as a stepper: lower / current level and what it pays / higher.
  function difficulty(state){const d=L.difficultyView(state),row=el('div',undefined,'ml-stepper');
   if(d.locked){row.append(el('p','試練はいつも揺らぎ Lv.0 で挑みます。','muted'));return row;}
   const info=el('div',undefined,'ml-stepper-info');info.append(label('memoryDifficultyLine','記憶の揺らぎ Lv.'+d.level,'b'),el('small','敵の強さ ×'+F(d.enemyLog)+' · 得る欠片 ×'+d.shard+' · 手に入る糧の数 ×'+d.drop+(d.needed?' · あと '+(d.needed-d.topClears)+' 回踏破で次の Lv':'')));
   row.append(button('memoryDifficultyDown','−',{kind:'difficulty',level:d.level-1},d.level<=0),info,button('memoryDifficultyUp','＋',{kind:'difficulty',level:d.level+1},d.level>=d.max));return row;}
  // Live numbers (HP, attack, fight progress) update in place without rebuilding the dialog.
  function update(state){updateStage(state);const run=state.run;if(!run)return;const st=L.stats(state),r=run.r,v=L.fightView(state),now=v?v.hp:r.hp;const hp=document.getElementById('memoryHP');if(hp)hp.textContent='HP '+F(now)+' / '+F(st.maxHp);const atk=document.getElementById('memoryAttack');if(atk)atk.textContent='攻撃 '+F(st.attack);const fill=document.getElementById('memoryHPFill');if(fill)fill.style.width=(now===-Infinity?0:Math.max(0,Math.min(100,100*10**(now-st.maxHp))))+'%';
   const fe=document.getElementById('memoryEnemy');if(fe)fe.textContent=v?v.name+' · HP '+F(v.enemyHp)+' / '+F(v.maxHp):'';const ef=document.getElementById('memoryEnemyFill');if(ef)ef.style.width=(v?(v.enemyHp===-Infinity?0:Math.max(0,Math.min(100,100*10**(v.enemyHp-v.maxHp)))):0)+'%';const msg=document.getElementById('memoryMessage');if(msg)msg.textContent=run.last;
   const inv=document.getElementById('memoryInventory');if(inv){const zones=zoneNames.map((n,i)=>[n,r.q[i]]).filter(([,q])=>q>0);inv.textContent=r.add>0||zones.length?'持ち物：'+[r.add>0?'糧 '+N(r.add)+'（攻撃・HP +'+N(r.add*UNIT)+'）':'',...zones.map(([n,q])=>n+'の雫 '+N(q)+'（攻撃・HP +'+pct(q*zoneRate(zoneNames.indexOf(n),r.bag))+'）')].filter(Boolean).join(' · ')+'。糧と雫は探索を終えると消えます':'持ち物はまだありません。幻影を喰らうと糧や雫を落とします';}}
  // A full screen of its own: the close button reads as the way back to the village.
  {const back=document.getElementById('memoryLabyrinthClose');back.onclick=onClose;back.replaceChildren(el('span','← 村へ'));}dialog.addEventListener('cancel',e=>{e.preventDefault();onClose();});
  // Lobby: the start controls first, everything else behind four tabs.
  function outside(state){const m=state.meta,w=L.worldFactors(m);
   body.append(el('p','迷宮の外への効果：攻撃 ×'+F(w.attackLog)+' / HP ×'+F(w.hpLog),'ml-outfx'));
   if(m.complete)body.append(el('p','混沌の記憶迷宮を完全に踏破しました。','protected'));
   const ids=L.identityList(state),cur=ids.find(x=>x.id===m.identity)||ids[0],start=el('section',undefined,'ml-depart');
   const who=el('div',undefined,'ml-who');who.append(portrait(identityArt(cur),'ml-avatar'),box('ml-who-text',el('b',cur.title),el('small',statText(cur)+' · '+skillText(cur.skills))),...state.run?[]:[localButton('memoryChangeIdentity','変える',()=>{view.tab='figs';},'ml-link')]);
   if(state.run){const run=state.run;const resume=el('section',undefined,'ml-resume');resume.append(box('ml-resume-text',el('b','探索中 · 第'+(run.r.floor+1)+'層「'+P.floors[run.r.floor].name+'」'),el('small',L.identityInfo(run.snapshot.identity).title+' · '+(run.explore?'連続探索中':run.phase==='fight'?'戦闘中':'次の相手を選ぶところ')),label('memoryHP','','small')),localButton('memoryResume','続きから →',()=>{view.lobby=false;},'primary'));body.append(resume);start.append(who,el('p','探索中は面影・心得・試練を変えられません。探索を終えて入口へ戻ると変えられます。','muted'));body.append(start);pages(state,ids,cur);return;}
   start.append(who,difficulty(state));
   if(m.nodes.includes('S43')){const seg=el('div',undefined,'ml-seg');zoneNames.forEach((n,i)=>{const b=localButton('memoryZone_'+i,n,()=>{zone=i;},zone===i?'primary':'secondary');seg.append(b);});start.append(box('ml-zone',el('small','多く集める雫'),seg));}
   const go=el('div',undefined,'ml-enter');go.append(button('memoryEnter','入る',{kind:'enter',zone},false,'primary'));if(m.clears>0)go.append(button('memoryExploreEnter','連続探索',{kind:'enter',zone,explore:true}));if(L.shortcutOpen(m))go.append(button('memoryShortcut','近道「'+P.chaos.shortcut.name+'」',{kind:'enter',shortcut:true}));start.append(go);body.append(start);
   pages(state,ids,cur);}
  // 心得 / 面影 / 試練 / 記録 as tabs. With a run in progress they are greyed out: preparation happens only before entering.
  function pages(state,ids,cur){const m=state.meta,trials=m.clears>0?L.trialList(state).filter(t=>t.open||t.done):[],waiting=trials.filter(t=>!t.done).length;
   const tabs=el('div',undefined,'ml-tabs');tabs.setAttribute('role','tablist');
   for(const [id,text,pip] of [['tree','心得',m.points],['figs','面影',0],['trials','試練',waiting],['record','記録',0]]){const b=localButton('memoryTab_'+id,text+(pip?' '+pip:''),()=>{view.tab=id;},view.tab===id?'ml-tab active':'ml-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view.tab===id));tabs.append(b);}
   body.append(tabs);const pane=el('section',undefined,'ml-pane'+(state.run?' ml-locked':''));body.append(pane);
   if(view.tab==='tree')treePane(state,pane);else if(view.tab==='figs')figurePane(state,pane,ids,cur);else if(view.tab==='trials')trialPane(trials,pane,!!state.run);else recordPane(state,pane);}
  // 心得: one tier at a time as a grid of small tiles.
  function treePane(state,pane){const m=state.meta,nodes=L.nodeList(state),open=t=>m.spent>=t.spentRequired;
   if(view.tier===null)view.tier=([...P.tiers].reverse().find(t=>open(t)&&nodes.some(n=>n.tier===t.tier&&!n.owned))||P.tiers[0]).tier;
   pane.append(el('p','使える '+m.points+' pt · 使用済み '+m.spent+' pt · 踏破 '+m.clears+'回','ml-line'));
   const seg=el('div',undefined,'ml-seg');for(const t of P.tiers)seg.append(localButton('memoryTier_'+t.tier,t.tier+'段目',()=>{view.tier=t.tier;},view.tier===t.tier?'primary':'secondary',!open(t)));pane.append(seg);
   const tier=P.tiers.find(t=>t.tier===view.tier);if(!open(tier)){pane.append(el('p','心得を '+tier.spentRequired+' pt 使うと開く','muted'));return;}
   const grid=el('div',undefined,'ml-nodes');for(const n of nodes.filter(n=>n.tier===view.tier)){const b=button('memoryNode_'+n.id,'',{kind:'buy',id:n.id},n.owned||!n.buyable,n.owned?'ml-node owned':'ml-node');b.append(el('b',n.nameJa),el('span',n.descriptionJa),el('em',n.owned?'習得済み':'習得 · '+n.cost+' pt'));grid.append(b);}pane.append(grid);}
  // 面影: met figures as portraits; owned ones are chosen, the rest bought with 記憶の欠片.
  function figurePane(state,pane,ids,cur){const m=state.meta,known=ids.filter(x=>x.id!=='alice');
   pane.append(withIcon('p','shard',P.chaos.currency.name+' '+N(m.shards)+' · 覚えた面影 '+known.filter(x=>x.owned).length+' / 出会った '+known.length+' / 全 '+P.chaos.figures.length+'人','ml-line'));
   const grid=el('div',undefined,'ml-figs');
   for(const x of ids){const card=el('div',undefined,'ml-fig'+(x.id===cur.id?' current':x.owned?'':' locked'));card.append(portrait(identityArt(x),'ml-fig-art'),el('b',x.title),el('small',statText(x)));
    if(x.id===cur.id)card.append(el('em','使用中'));else if(state.run)card.append(el('small',x.owned?'覚えた面影':'まだ得ていない','muted'));else if(x.owned)card.append(button('memoryIdentity_'+x.id,'この面影で入る',{kind:'identity',id:x.id}));else card.append(button('memoryBuyIdentity_'+x.id,m.maxDifficulty<x.levelRequired?'揺らぎ Lv.'+x.levelRequired+' が開くと得られる':'面影を得る · 欠片 '+N(x.cost),{kind:'buyIdentity',id:x.id},m.shards<x.cost||m.maxDifficulty<x.levelRequired));grid.append(card);}
   pane.append(grid);if(!known.length)pane.append(el('p','迷宮で出会った幻影が、ここに並びます。','muted'));}
  function trialPane(trials,pane,viewOnly){if(!trials.length){pane.append(el('p','踏破を重ねると、試練が一つずつ開きます。','muted'));return;}
   for(const t of trials){const def=P.trials.find(x=>x.id===t.id),card=el('section',undefined,'ml-trial');card.append(box('ml-trial-head',el('b',def.nameJa),el('span',t.done?'達成済み':t.attempts?'挑戦 '+t.attempts+'回':'未挑戦','ml-tag'+(t.done?' done':''))),el('p','規則：'+def.ruleJa),el('p','報酬「'+t.reward.nameJa+'」：'+t.reward.descriptionJa,'protected'));if(t.id===P.chaos.shortcut.trial)card.append(el('p','達成すると近道「'+P.chaos.shortcut.name+'」が開きます。','protected'));
    if(!t.done&&!viewOnly)card.append(button('memoryTrial_'+t.id,'挑戦する',{kind:'enter',trialId:t.id}));pane.append(card);}}
  function recordPane(state,pane){const m=state.meta,w=L.worldFactors(m),stats=el('div',undefined,'ml-stats');
   for(const [k,v] of [['踏破',m.clears+'回'],['開放した揺らぎ','Lv.'+m.maxDifficulty],['外への効果 攻撃','×'+F(w.attackLog)],['外への効果 HP','×'+F(w.hpLog)]])stats.append(box('ml-stat',el('small',k),el('b',v)));
   pane.append(stats,el('h4','迷宮で手に入る物'),el('p','糧：幻影が落とす。1つにつき攻撃・HP +'+UNIT+'。探索を終えると消える。','muted'),el('p','雫（萌芽・波紋・残響・深淵・永遠）：幻影が落とす。1つにつき攻撃・HP +'+P.zoneRates.map(v=>pct(v)).join('／')+'。種類の違う雫は掛け合わさる。探索を終えると消える。','muted'),el('p','結晶（萌芽〜永遠）：層の主が落とす。入口に戻っても残り、迷宮の外でも攻撃・HPを上げる。いま持っている結晶：','ml-line'));const zones=el('div',undefined,'ml-zones');m.rewards.forEach((q,i)=>zones.append(box('',icon('perm-zone'+(i+1)),el('small',zoneNames[i]),el('b',N(q)))));pane.append(zones);}
  // Inside a run (opened from the lobby's 続きから): a fixed status bar, then one focus per phase (who to farm now, the fight, or the floor gate).
  function inside(state){const run=state.run,r=run.r,t=run.trialId&&P.trials.find(x=>x.id===run.trialId),floor=P.floors[r.floor],over=['cleared','defeated'].includes(run.phase),st=L.stats(state);
   const top=el('section',undefined,'ml-top'),head=el('div',undefined,'ml-top-row');head.append(box('ml-floor',el('b','第'+(r.floor+1)+'層 / 5'),el('small',floor.name+' · '+L.identityInfo(run.snapshot.identity).title+(r.shortcut?' · 近道':'')+(r.diff?' · 揺らぎ Lv.'+r.diff:''))));
   if(!over)head.append(localButton('memoryMenu','…',()=>{view.menu=!view.menu;view.confirm=false;},'ml-menu-button'));top.append(head);
   const bar=el('div',undefined,'ml-bar');bar.append(label('memoryHPFill','','span'));top.append(bar,box('ml-top-row',label('memoryHP','','span'),label('memoryAttack','','span')));body.append(top);
   const canRest=!r.rules.noRest&&!r.rules.noHealing&&['ready','gate'].includes(run.phase),hurt=r.hp<st.maxHp-1e-10;
   if(view.menu&&!over){const menu=el('div',undefined,'ml-menu');if(canRest)menu.append(button('memoryRest','休息する',{kind:'rest'},!hurt));menu.append(localButton('memoryLobby','入口の様子を見る（探索は続く）',()=>{view.menu=false;view.lobby=true;}));if(!run.trialId&&state.meta.clears>0)menu.append(button('memoryExplore',run.explore?'連続探索をやめる':'連続探索',{kind:'explore',enabled:!run.explore}));menu.append(localButton('memoryRetreatAsk','探索を終えて入口へ戻る',()=>{view.menu=false;view.confirm=true;},'ml-danger'));body.append(menu);}
   if(view.confirm&&!over){const ask=el('section',undefined,'ml-confirm');ask.append(el('b','入口へ戻りますか？'),el('p','戻ると、この探索で手に入れた糧と雫は消えます。結晶と記憶の欠片は残ります。','muted'),box('ml-enter',localButton('memoryRetreatCancel','続ける',()=>{view.confirm=false;}),button('memoryRetreat','入口へ戻る',{kind:'retreat'},false,'primary')));body.append(ask);}
   if(t)body.append(el('p','試練「'+t.nameJa+'」· '+t.ruleJa,'protected'));
   if(run.phase==='ready'&&!run.explore)pick(state,canRest&&hurt);
   else{body.append(stage());const fight=el('section',undefined,'ml-fight');const foe=el('div',undefined,'ml-bar foe');foe.append(label('memoryEnemyFill','','span'));
    if(run.phase==='fight')fight.append(label('memoryEnemy','','p','ml-enemy'),foe);fight.append(label('memoryMessage','','p','memory-message'),label('memoryInventory','','p','ml-gain'));body.append(fight);
    const dock=el('div',undefined,'ml-dock');
    if(run.explore&&!over)dock.append(button('memoryExploreStop','連続探索をやめる',{kind:'explore',enabled:false},false,'primary'));
    else if(run.phase==='fight'){if(!L.fightView(state)?.boss)dock.append(button('memoryAuto',run.auto?'連戦中 · 止める':'連戦する',{kind:'auto',enabled:!run.auto},false,run.auto?'ml-on':'primary'));dock.append(button('memoryStop','相手を変える',{kind:'stop'}));}
    else if(run.phase==='gate'){dock.append(button('memoryNext','次の階層へ',{kind:'next'},false,'primary'));if(canRest)dock.append(button('memoryRestGate','休息する',{kind:'rest'},!hurt));}
    else if(over)dock.append(button('memoryRetreat','入口へ戻る',{kind:'retreat'},false,'primary'));
    if(dock.children.length)body.append(dock);}}
  // Choosing a target: every figure of the floor (19 and its 層の主) as a card, so the player picks freely.
  // A normal figure is hunted continuously once picked (stop it in the fight); the guardian is a single fight.
  function pick(state,restFirst){const run=state.run,r=run.r,slots=r.shortcut?[7]:[...L.SLOTS,7],all=slots.map(i=>L.preview(state,i)),hint=L.suggest(state),reward=P.floors[r.floor].permanentReward;
   const msg=label('memoryMessage','','p','memory-message');body.append(msg);
   if(restFirst)body.append(box('ml-enter',button('memoryRestNow','休息してから戦う',{kind:'rest'},false,hint?.kind==='rest'?'primary':'secondary')));
   body.append(el('p','第'+(r.floor+1)+'層の相手 · '+all.length+'人。選ぶとすぐ戦います。','ml-line'));
   const grid=el('div',undefined,'ml-foes');
   for(const v of all){const b=button('memoryTarget_'+v.index,'',{kind:'target',index:v.index,auto:!v.boss},!v.eligible,'ml-foe'+(v.boss?' boss':'')+(v.eligible?(v.win?'':' ominous'):' lost'));
    const status=!v.eligible?'まだ挑めない':'';
    b.append(portrait(figureArt(v.figure),'ml-foe-art'),box('ml-foe-text',el('small',v.boss?'層の主':'','ml-foe-tag'),el('b',v.name),status?el('span',status,'ml-foe-state'):null,v.boss?withIcon('small','perm-zone'+(reward.zone+1),'落とす：'+zoneNames[reward.zone]+'の結晶 ×'+N(reward.quantity)+'（持ち帰れる）','ml-foe-stat'):el('small','HP '+F(v.hp)+' · 攻撃 '+F(v.attack),'ml-foe-stat'),v.boss||!v.drops?null:drops(v.drops,state.run?.r?.bag)));
    grid.append(b);}
   body.append(grid);}
  function render(state){if(!dialog.open)return;last=state;const run=state.run;if(!run)view.menu=view.confirm=view.lobby=false;const key=JSON.stringify({m:[state.meta.points,state.meta.shards,state.meta.identity,state.meta.identities.length,run?0:state.meta.met.length,state.meta.difficulty,state.meta.maxDifficulty,state.meta.complete,state.meta.nodes.length,state.meta.trials.length,state.meta.clears,state.meta.rewards],r:run&&[run.id,run.r.floor,run.phase,run.auto,run.explore,run.fight?.index,run.r.diff,run.phase==='ready'&&run.r.hp]});if(key===lastKey){update(state);return;}lastKey=key;const scroll=dialog.scrollTop||0,focused=document.activeElement?.id;body.replaceChildren();body.className='modal-content '+(run&&!view.lobby?'ml-in':'ml-out')+(!run||view.lobby||run.phase!=='ready'||run.explore?' ml-split':'');if(run&&!view.lobby)inside(state);else{body.append(stage());outside(state);}update(state);dialog.scrollTop=scroll;if(focused)document.getElementById(focused)?.focus?.({preventScroll:true});}
  return {open(state){dialog.showModal();lastKey='';view.menu=view.confirm=false;view.lobby=!!state.run;render(state);},render,close(){dialog.close();lastKey='';},isOpen(){return dialog.open;}};
 }
 return {create};
})();

/* Growth comes from capped inventory, permanent passive nodes and finite owned devour cores.
   A single body owns HP; appearances never contribute stats. No levels or equipment. */
const CharacterSystem={definition:id=>RPGCatalog.characters[id]||null};
const GrowthSystem={damageAfterDefense:(raw,e={})=>GameNumber.subtract(raw,e.flatDefense)*(e.reductionNumerator||1n)*(10000n-GameNumber.from(e.extraReductionBps))/( (e.reductionDenominator||1n)*10000n)};
const CollectionSystem=(()=>{
 // Current review scope: chapter 1 only. Keep later chapters authored but inaccessible.
 const PLAYABLE_THROUGH_CHAPTER=1;
 const C=RPGCatalog,N=GameNumber.from,min=GameNumber.min,max=GameNumber.max,MAX_CHESTS=1000000000000000000n;
 const itemIds=Object.keys(C.items),nodeIds=Object.keys(C.nodes),enemyIds=Object.keys(C.enemies),cache=new WeakMap();
 const bossAliases={final:'duskBell',mine:'mineWarden',road:'briarWolf',ruins:'sealKeeper',mirror:'nameShadow',hunger:'hungerOrigin'};
 function fresh(seed=1){return {memoryLabyrinth:typeof MemoryLabyrinth!=='undefined'?MemoryLabyrinth.fresh():null,version:41,speedRulesRevision:C.speedRulesRevision||0,bossTrophyRevision:C.bossTrophyRevision||0,retiredSpeedInventory:{},itemScaleRevision:C.itemScaleRevision||0,itemSplitRevision:C.itemSplits?.revision||0,refundedNodes:{},collectionVersion:1,skillRulesRevision:C.skillRulesRevision||0,pendingSkillRefunds:{},skillPayments:{},memoryRouteVersion:1,memoryRoutesThroughChapter:releaseThroughChapter(),completedStories:{},memoryClues:{},memoryClueReceipts:{},enteredDungeons:{},opened:{},owned:{alice:true},active:'alice',hp:BASE.hp,inventory:{},discoveredItems:{},chests:{},skills:{},kills:{},seenEnemies:{},fightRecords:{},bosses:{},seen:{},storyForms:{},encounters:{},rng:seed>>>0,revision:0,dungeon:'forest',view:'village',battle:null,spawns:{},dungeonProgress:{},routes:{},repeatBoss:false,savedAt:0,offlineBlocked:false,migrated:false,...(typeof DungeonEvents==='undefined'?{}:{events:DungeonEvents.fresh(seed)}),...(typeof ExplorationRun==='undefined'?{}:{exploration:ExplorationRun.fresh(seed)})};}
 function touch(s){s.revision=(s.revision||0)+1;}
 function quantity(s,id){return N(s.inventory[id]);}
 function add(s,id,n){const d=C.items[id];if(!d||!GameNumber.valid(n))return 0n;const before=quantity(s,id),after=min(d.cap,before+N(n));if(after!==before){s.inventory[id]=after;(s.discoveredItems??={})[id]=true;touch(s)}return after-before;}
 // A merged area's chests are its home area's chests (scripts/apply-two-chests.cjs).
 function chestOf(id){return C.dungeons[id]?.chestInto||id;}
 function addChest(s,id,n){id=chestOf(id);if(!C.dungeons[id]?.pool.length||!GameNumber.valid(n))return 0n;
  // An area whose whole chest pool is at its caps no longer stores chests (they could never be opened).
  if(C.dungeons[id].pool.every(k=>quantity(s,k)>=N(C.items[k].cap)))return 0n;const before=N(s.chests[id]);s.chests[id]=min(MAX_CHESTS,before+N(n));return s.chests[id]-before;}
 function rng(s){s.rng=(Math.imul(s.rng>>>0,1664525)+1013904223)>>>0;return s.rng;}
 // A chapter is cleared by its required finale: chapter 1 by devouring Celia (clearCharacter); other chapters by their boss.
 function chapterCleared(s,ch){const c=C.chapters[ch-1];if(!c)return false;return c.clearCharacter?!!s.owned[c.clearCharacter]:!!s.bosses[c.boss];}
 function chapter(s){let ch=1;while(ch<PLAYABLE_THROUGH_CHAPTER&&chapterCleared(s,ch))ch++;return ch;}
 function killsIn(s,id){return C.dungeons[id]?.enemies.reduce((a,k)=>a+N(s.kills[k]),0n)||0n;}
 // Authored skills learned (a skill split one effect per skill counts once, by its first part).
 function branchCount(s,id){return (C.branches[id]||[]).filter(k=>s.skills[k]&&(!C.nodes[k].partOf||C.nodes[k].partOf===k)).length;}
 function collected(s,id,direct=false){const ids=C.dungeons[id]?.[direct?'direct':'pool']||[];return {full:ids.filter(k=>quantity(s,k)>=N(C.items[k].cap)).length,total:ids.length};}
 function chapterCollection(s,ch){const ids=itemIds.filter(k=>C.items[k].chapter===ch);return {full:ids.filter(k=>quantity(s,k)>=N(C.items[k].cap)).length,total:ids.length,found:ids.filter(k=>quantity(s,k)>0n).length};}
 function chapterSkills(s,ch,includeOptional=true){return nodeIds.filter(k=>(includeOptional||!C.characters[C.nodes[k].owner]?.optionalExpansion)&&s.skills[k]&&(C.nodes[k].chapter||C.characters[C.nodes[k].owner].chapter)===ch).length;}
 function legacyDungeonOpen(s,id){if(!C.dungeons[id])return false;if(s.opened?.[id])return true;if(id==='forest')return true;if(id==='cave')return !!s.owned.rina;if(['mine','road','ruins'].includes(id))return !!s.owned.mirei;if(id==='sanctum')return ['mineWarden','briarWolf','sealKeeper'].every(k=>s.bosses[k]);if(id==='hushed_shrine')return !!s.bosses.duskBell||!!s.owned.nemu;if(id==='forgotten')return !!s.bosses.origin_throne_boss||!!s.owned.ivlis;return !!s.bosses[C.dungeons[id].previous];}
 function releaseThroughChapter(){return C.releaseThroughChapter||5;}
 function memoryRouteActive(id){return !!C.dungeonMemoryRoutes?.[id]&&!C.dungeons[id].retired&&C.dungeons[id].chapter<=releaseThroughChapter();}
 function memoryClueId(id,clue){let hash=2166136261;for(let i=0;i<clue.line.length;i++)hash=Math.imul(hash^clue.line.charCodeAt(i),16777619);return id+'|'+clue.storyId+'|'+(hash>>>0).toString(16);}
 function missingMemoryClues(s,key){return Object.entries(C.dungeonMemoryRoutes||{}).filter(([id])=>memoryRouteActive(id)).flatMap(([id,route])=>(route.clues||[]).filter(clue=>clue.storyId===key&&!s.memoryClueReceipts?.[memoryClueId(id,clue)]).map(clue=>({id,clue})));}
 function dungeonDiscovered(s,id){if(!C.dungeons[id]||C.dungeons[id].retired||C.dungeons[id].chapter>PLAYABLE_THROUGH_CHAPTER)return false;if(C.dungeons[id].discoveryOwned)return !!s.owned[C.dungeons[id].discoveryOwned];if(s.opened?.[id]&&!C.dungeonMemoryRoutes?.[id]?.strict||id==='forest'||C.dungeonMemoryRoutes?.[id]?.initial)return true;if(!memoryRouteActive(id))return legacyDungeonOpen(s,id);const route=C.dungeonMemoryRoutes[id],clues=route.clues||[],has=c=>s.memoryClueReceipts?.[memoryClueId(id,c)];return clues.length>0&&(route.mode==='any'?clues.some(has):clues.every(has));}
 function explorationRequirementMet(s,id){const q=C.dungeons[id]?.requiresExploration;if(!q)return true;const guardian=C.explorations[q.dungeon]?.layers[q.layer-1]?.guardian.enemy;return !!s.exploration?.areas?.[q.dungeon]?.cleared?.[q.layer]||!!s.bosses[guardian];}
 function dungeonOpen(s,id){if(!C.dungeons[id]||C.dungeons[id].retired||C.dungeons[id].chapter>PLAYABLE_THROUGH_CHAPTER)return false;if(!explorationRequirementMet(s,id))return false;if(C.dungeons[id].discoveryOwned&&!s.owned[C.dungeons[id].discoveryOwned])return false;if(C.dungeons[id].firstEntryFormId&&!s.enteredDungeons?.[id]&&(s.active!==C.dungeons[id].firstEntryFormId||!s.owned[C.dungeons[id].firstEntryFormId]))return false;if(s.opened?.[id]&&!C.dungeonMemoryRoutes?.[id]?.strict)return true;if(C.dungeons[id].discoveryOwned)return dungeonDiscovered(s,id);if(!memoryRouteActive(id))return legacyDungeonOpen(s,id);return dungeonDiscovered(s,id)&&(C.dungeonMemoryRoutes[id]?.requireBossIds||[]).every(k=>s.bosses[k]);}
 function dungeonHint(s,id){if(dungeonOpen(s,id))return '';if(dungeonDiscovered(s,id)&&!explorationRequirementMet(s,id))return C.dungeons[id].entryHint||'先の層を踏破すると道が開く。';if(dungeonDiscovered(s,id)&&C.dungeons[id]?.firstEntryFormId&&!s.enteredDungeons?.[id])return formHint(s,C.dungeons[id].firstEntryFormId);if(!dungeonDiscovered(s,id))return '誰かの記憶に、まだ知らない道の手がかりが眠っている。';const barriers=(C.dungeonMemoryRoutes?.[id]?.requireBossIds||[]).filter(k=>!s.bosses[k]).map(k=>{const area=C.enemies[k]?.dungeon;return dungeonDiscovered(s,area)?C.dungeons[area].name+'の首領を討伐':'入口を守る封鎖を解く';});return '道筋は記憶に刻まれた。'+[...new Set(barriers)].join('・');}
 function enemyOpen(s,id){const e=C.enemies[id];if(!e||e.story||!dungeonOpen(s,e.dungeon)||C.dungeons[e.dungeon]?.exploration)return false;if(e.requires==='castle-entry'&&!s.completedStories['chapter:castle_entry'])return false;if(e.requires==='mirror'&&!s.bosses.nameShadow)return false;if(e.requires==='ivlis'&&!s.owned.ivlis)return false;if(e.boss&&!e.entryBoss&&!s.bosses[id]&&e.dungeon!=='forgotten'&&killsIn(s,e.dungeon)<15n)return false;return true;}
 function seen(s,key){return !!s.seen['chapter:'+key]||!!s.seen['memory:'+key];}
 function clueCount(s,id){return (C.secrets[id]?.clues||[]).filter(k=>seen(s,k)).length;}
 function secretVisible(s,id){const d=C.secrets[id];return !d||s.owned[id]||s.encounters[id]||clueCount(s,id)>0||!!s.bosses[C.chapters[d.chapter-1].boss];}
 function conditions(s,id){
  const c=C.characters[id];if(!c||id==='alice')return [];const sec=C.secrets[id],rows=[];const push=(label,met)=>rows.push({label,met:!!met});
  if(!C.dungeons[c.dungeon].narrative||c.dungeon!=='village')push(C.dungeons[c.dungeon].name+'への道を開く',dungeonOpen(s,c.dungeon));
  if(sec){push('第'+sec.chapter+'章の首領を討伐',s.bosses[C.chapters[sec.chapter-1].boss]);push('手がかりの物語 '+clueCount(s,id)+' / '+(sec.ultimate?5:2),clueCount(s,id)>=(sec.ultimate?5:2));
   if(sec.ultimate){push('五章の隠された姿を獲得',['nemu','freya','lenore','rachel','faustina'].every(k=>s.owned[k]));push(C.enemies.nameShadow.name+'を討伐',s.bosses.nameShadow);}
   else{const col=chapterCollection(s,sec.chapter),sk=chapterSkills(s,sec.chapter,false);push('本章の物品を30種類発見 '+col.found+'/30',col.found>=30);push('本章の常在能力を18個解放 '+sk+'/18',sk>=18);}
   if(sec.form)push(CharacterSystem.definition(sec.form).name+'の姿を獲得',s.owned[sec.form]);
  // Kill-count encounter requirements are removed; encounters will move to event triggers. Story order stays.
  // Authored story prerequisites (chapter 1 roster): labels never name unknown people or places.
  }else if(c.requires){for(const r of c.requires)push(r.label,r.completedStory?s.completedStories[r.completedStory]:r.story?s.seen[r.story]:r.boss?s.bosses[r.boss]:s.owned[r.owned]);}
  else{const deps={celia:'noa',charlotte:'fina',sophia:'celia',luna:'eris'};if(deps[id]&&C.characters[deps[id]])push(CharacterSystem.definition(deps[id]).name+'の姿を獲得',s.owned[deps[id]]);}
  if(entryForm(id))push(formHint(s,entryForm(id)),!!s.owned[entryForm(id)]&&s.active===entryForm(id));
  return rows;
 }
 // Entry appearance is an authored route prerequisite, never a statistical build choice.
 function entryForm(id){return (C.characters[id]?.optionalExpansion||C.characters[id]?.chapter<=releaseThroughChapter())?(C.storyForms?.[id]?.entryFormId||'alice'):null;}
 function formHint(s,id){return s.owned[id]||s.encounters[id]||s.seen[storyKey(id,'encounter')]?CharacterSystem.definition(id).name+'の姿で訪れる':'まだ獲得していない姿が必要。先に他の出会いを辿ろう。';}
 function storyPhase(t){return t?.id.split('_').at(-1);}
 // Replays deliberately use the current authored scene, not an obsolete arbitrary save snapshot.
 function storyUsesFixedForm(key){const t=C.stories[key];return !!t&&(C.characters[t.owner]?.optionalExpansion||(t.campaignChapter||(['hidden_door','hidden_finale'].includes(t.id)?5:C.characters[t.owner]?.chapter||1))<=releaseThroughChapter());}
 function storyForm(key){const t=C.stories[key];if(!t||t.anyForm||!storyUsesFixedForm(key))return null;const phase=storyPhase(t),route=C.storyForms?.[t.owner];return t.requiredFormId||(['identity','form'].includes(phase)?(route?.[phase+'FormId']||t.owner):['encounter','assault','devour'].includes(phase)?entryForm(t.owner):'alice');}
 function storyFormMatches(s,key){const form=storyForm(key);return !form||!!s.owned[form]&&s.active===form;}
 function canEncounter(s,id){const c=C.characters[id];
  // Exploration characters are first met on a run card (exploration.js); afterwards a quick re-challenge stays open.
  if(c&&(c.exploration||c.exploreCard))return !c.retired&&!s.owned[id]&&!!s.encounters[id]&&dungeonOpen(s,c.dungeon)&&(!c.exploreCard||!entryForm(id)||!!s.owned[entryForm(id)]&&s.active===entryForm(id));
  return !!C.characters[id]&&!C.characters[id].retired&&id!=='alice'&&!s.owned[id]&&(!entryForm(id)||s.owned[entryForm(id)]&&s.active===entryForm(id))&&dungeonOpen(s,C.characters[id].dungeon)&&(!C.characters[id].hiddenCastle&&s.encounters[id]||conditions(s,id).every(r=>r.met));}
 function dungeonsPower(id){return C.dungeons[id]?.power||0;}
 function prerequisites(id){const d=C.nodes[id];return d?(d.requires|| (d.previous?[d.previous]:[])):[];}
 function legacyMultiplier(s,dungeon){let bonus=0n;const target=C.dungeons[dungeon];for(const id of itemIds){const d=C.items[id],q=quantity(s,id);if(q&&d.special?.kind==='legacy'&&d.special.targets.includes(dungeon)){const diff=dungeonsPower(d.dungeon)-dungeonsPower(dungeon);bonus+=q*(10n**BigInt(Math.max(0,diff)))*2000n;}}return 10000n+bonus;}
 // Alice's own base stats (chapter 1 opening calibration; 10/100 when a catalog sets none).
 const BASE={attack:BigInt(C.aliceBase?.attack??10),hp:BigInt(C.aliceBase?.hp??100)};
 // Overheal (過量回復, user 2026-10-26): resting in the village may take HP above max by overhealBps; heals elsewhere
 // never raise it past max, and never lower an overhealed HP.
 function hpCap(s){const st=stats(s);return st.hp+st.hp*N(st.overhealBps||0n)/10000n;}
 function healTo(s,amount){const st=stats(s),hp=N(s.hp);s.hp=hp>=st.hp?hp:min(st.hp,hp+N(amount));return s.hp;}
 function stats(s){const prev=cache.get(s);if(prev?.revision===s.revision)return prev.stats;const value=compute(s);cache.set(s,{revision:s.revision,stats:value});return value;}
 // Purchases remain in the save; only the highest purchased rank in each family contributes.
 function effectiveNodes(s){const chosen={},other=[];for(const id of nodeIds)if(s.skills[id]){const n=C.nodes[id];if(!n.family)other.push(id);else if(!chosen[n.family]||C.nodes[chosen[n.family]].rank<n.rank)chosen[n.family]=id;}return [...other,...Object.values(chosen)];}
 // Every permanent source is an item or a skill node the player can see: items, Alice's tree, character skills and the
 // devour marks (C.devourMarks). `skip` leaves one group out, for the breakdown shown to the player.
 function group(id){const n=C.nodes[id];return n.mark?'marks':n.owner==='alice'?'alice':'skills';}
 function compute(s,skip=null){const e=EffectSystem.fresh(),abilities=[];const factors={};
  if(skip!=='items')for(const id of itemIds){const d=C.items[id],q=quantity(s,id);if(!q)continue;const effect={...d.effects};if(effect.attack||effect.hp){const factor=factors[d.dungeon]??=(legacyMultiplier(s,d.dungeon));if(effect.attack)effect.attack=N(effect.attack)*factor/10000n;if(effect.hp)effect.hp=N(effect.hp)*factor/10000n;}EffectSystem.add(e,effect,q);}
  const skillCombat={periodicAttacks:[]};
  for(const id of effectiveNodes(s))if(group(id)!==skip){const n=C.nodes[id];EffectSystem.add(e,n.effects);if(n.ability)abilities.push(n.ability);if(n.family)for(const [k,v]of Object.entries(n.effects)){if(k==='periodicAttack')skillCombat.periodicAttacks.push({...v,bps:N(v.bps)});else skillCombat[k]=N(v);}}
  // Sources add inside each named zone; the five permanent zones multiply. Independent factors (devour marks) multiply on top. Defense multiplies residuals. All individual sources are finite.
  const value={...e,attack:EffectSystem.permanent(BASE.attack+e.attack,e)*e.attackNumerator/e.attackDenominator,hp:EffectSystem.permanent(BASE.hp+e.hp,e,true)*e.hpNumerator/e.hpDenominator,multiplierMode:true,hits:1n+e.hits,intervalMs:Number(10000000n/(10000n+e.hasteBps)),abilities};
  // Explicit reward bridge: only the labyrinth's permanent (scope=both) growth crosses into world stats, shown as its own breakdown group.
  if(skip!=='memory'&&typeof MemoryLabyrinth!=='undefined'&&s.memoryLabyrinth){const f=MemoryLabyrinth.worldFactors(s.memoryLabyrinth.meta);value.attack=value.attack*f.attackNumerator/f.attackDenominator;value.hp=value.hp*f.hpNumerator/f.hpDenominator;}
  if(C.skillRulesRevision){value.skillCombat=skillCombat;value.combatRulesRevision=C.skillRulesRevision;value.hits=1n;value.legacyHits=e.hits;value.legacyFirstBps=e.firstBps-N(skillCombat.firstBps);value.legacyRampBps=e.rampBps-N(skillCombat.rampBps);value.regenBps=min(e.regenBps,500n);value.killHealBps=min(e.killHealBps,1500n);value.overhealBps=min(e.overhealBps,10000n);value.intervalMs=Number(10000000n/(10000n+(s.skills.alice_v2_speed_1?10000n:0n)));}
  value.intervalMs=Math.max(100,value.intervalMs);return value;
 }
 function claimSkillRefunds(s){let amount=0n;for(const [id,q]of Object.entries(s.pendingSkillRefunds||{})){if(!C.items[id])continue;const got=add(s,id,N(q));s.pendingSkillRefunds[id]=N(q)-got;amount+=got;if(!s.pendingSkillRefunds[id])delete s.pendingSkillRefunds[id];}return amount;}
 // How much each group of sources multiplies the current attack and HP (total with the group / total without it).
 function breakdown(s){const all=stats(s),out={base:{attack:BASE.attack,hp:BASE.hp},total:{attack:all.attack,hp:all.hp},groups:{}};
  for(const g of ['items','alice','skills','marks','memory']){const w=compute(s,g),bps=(a,b)=>b>0n?a*10000n/b:0n;out.groups[g]={attackBps:bps(all.attack,w.attack),hpBps:bps(all.hp,w.hp)};}return out;}
 function adjustHP(s,before){const after=stats(s).hp;s.hp=min(hpCap(s),N(s.hp)+(after>before?after-before:0n));return after;}
 // A mark split into one skill per effect (C.devourMarkParts) is granted whole.
 function markKeys(id){return C.devourMarkParts?.[id]||(C.devourMarks?.[id]?[C.devourMarks[id]]:[]);}
 function grantDevourSkill(s,id){for(const mark of markKeys(id))s.skills[mark]=true;const key=C.devourGrowth?.[id]?.firstSkillId;if(key&&!s.skills[key]){s.skills[key]=true;return key;}return null;}
 function devour(s,id){if(id==='alice'||!C.characters[id]||s.owned[id])return null;const before=stats(s);s.owned[id]=true;const firstSkillId=grantDevourSkill(s,id);touch(s);adjustHP(s,before.hp);return {id,firstSkillId:C.devourGrowth[id].firstSkillId,gainedSkillIds:firstSkillId?[firstSkillId]:[],before,after:stats(s)};}
 function canUnlock(s,id){const d=C.nodes[id];return !!d&&!!s.owned[d.owner]&&!s.skills[id]&&(!d.opensWith||dungeonOpen(s,d.opensWith))&&prerequisites(id).every(k=>s.skills[k])&&Object.entries(d.costs).every(([k,q])=>C.items[k]?.consumable===true&&quantity(s,k)>=N(q));}
 function preview(s,id){const d=C.nodes[id];if(!d)return null;const copy={...s,inventory:{...s.inventory},skills:{...s.skills},revision:0};for(const [k,q]of Object.entries(d.costs))copy.inventory[k]=GameNumber.subtract(quantity(copy,k),q);copy.skills[id]=true;return {before:stats(s),after:stats(copy)};}
 function unlock(s,id){if(!canUnlock(s,id))return false;const before=stats(s).hp;for(const [k,q]of Object.entries(C.nodes[id].costs))s.inventory[k]=quantity(s,k)-N(q);(s.skillPayments??={})[id]={...C.nodes[id].costs};s.skills[id]=true;claimSkillRefunds(s);touch(s);adjustHP(s,before);return true;}
 function open(s,dungeon,amount){dungeon=chestOf(dungeon);const d=C.dungeons[dungeon];if(!d?.pool.length||!dungeonOpen(s,dungeon)||!GameNumber.valid(amount)||N(amount)<=0n)return {opened:0,items:{}};const before=stats(s).hp;let remaining=min(N(s.chests[dungeon]),amount),opened=0;const won={};let pool=d.pool.filter(k=>quantity(s,k)<N(C.items[k].cap));
  // Nested pools (v2 number plan): an area's chests also hold the two areas before it at their own, smaller weights.
  const weight=k=>d.poolWeights?.[k]??C.items[k].weight;
  const grant=(id,count)=>{const actual=Number(min(count,N(C.items[id].cap)-quantity(s,id)));if(actual){add(s,id,actual);won[id]=(won[id]||0)+actual;opened+=actual;remaining-=BigInt(actual);}};
  while(remaining>0n&&pool.length){
   if(remaining<=2048n){const total=pool.reduce((v,k)=>v+weight(k),0);let ticket=Number(BigInt(rng(s))*BigInt(total)/4294967296n),choice=pool[0];for(const id of pool){ticket-=weight(id);if(ticket<0){choice=id;break;}}grant(choice,1);}
   else{const capacity=pool.reduce((v,k)=>v+N(C.items[k].cap)-quantity(s,k),0n),n=Number(min(remaining,capacity)),draws=ChestRandom.counts(n,pool.map(weight),()=>rng(s));for(let i=0;i<pool.length;i++)grant(pool[i],draws[i]);}
   pool=pool.filter(k=>quantity(s,k)<N(C.items[k].cap));
  }
  s.chests[dungeon]=N(s.chests[dungeon])-BigInt(opened);adjustHP(s,before);return {opened,items:won};
 }
 function chestBonus(s,home){const e=stats(s).skillCombat||{};return N(e[chestOf(home)==='forest'?'forestChestBonus':chestOf(home)==='mine'?'mineChestBonus':chestOf(home)==='academy'?'academyChestBonus':'']);}
 function drops(s,id,count=1n){const e=C.enemies[id],n=N(count),result={chests:{},items:{}};if(!e||e.story||n===0n)return result;const before=stats(s).hp;
  const extra={};for(const k of itemIds){const d=C.items[k],q=quantity(s,k);if(q&&d.special?.kind==='relay'&&C.dungeons[e.dungeon].chapter>=d.special.minimumChapter)for(const target of d.special.targets)if(dungeonOpen(s,target))extra[target]=(extra[target]||0n)+q;}
  // Snapshot held relics before granting this kill's boss reward; no recursive reward events.
  const home=chestOf(e.dungeon);result.chests[home]=addChest(s,home,N(e.chests)*n);for(const [target,q]of Object.entries(extra)){const t=chestOf(target);result.chests[t]=(result.chests[t]||0n)+addChest(s,t,q*n);}
  if(!s.battle?.run)for(const home of Object.keys(result.chests))if(result.chests[home]>0n)result.chests[home]+=addChest(s,home,chestBonus(s,home)*n);
  if(e.boss||e.elite)for(const k of C.dungeons[e.dungeon].direct){const d=C.items[k];if(d.source===id)result.items[k]=add(s,k,n);}
  if(resolveCore(s,e.dungeon,id))result.resolved=e.dungeon;
  s.kills[id]=N(s.kills[id])+n;if(e.boss)s.bosses[id]=true;adjustHP(s,before);return result;
 }
 function storyKey(id,kind){return id==='rina'?'memory:'+kind:id==='mirei'?'memory:mirei_'+kind:'chapter:'+id+'_'+kind;}
 function storyAvailable(s,key){const t=C.stories[key];if(!t||t.retired)return false;if(s.seen[key])return true;if(!storyFormMatches(s,key))return false;const id=t.id;if(!storyUsesFixedForm(key)&&storyPhase(t)==='form')return false;
  // Academy scenes are explicit local triggers, never chapter-wide village notifications.
  // Seen scenes return above, allowing old saves to revisit the story library in any form.
  if(t.academyStory){const a=t.academyStory,r=s.exploration?.run;
   if(a.kind==='entry')return s.dungeon==='academy'&&s.view==='dungeon'||s.view==='run'&&r?.dungeon==='academy'&&!r.zone;
   if(s.view!=='run'||r?.dungeon!=='academy'||r.zone||!a.shared&&(a.layers?!a.layers.includes(r.layer):r.layer!==a.layer))return false;// T7 shared events play on any floor
   if(a.kind==='intro')return !r.result?.cleared;
   if(a.kind==='clear'||a.kind==='completion')return !!r.result?.cleared;
   if(a.kind==='event')return r.choice?.kind==='event'&&r.choice.id===a.eventId;
   return false;
  }
  if(t.hiddenCastle&&t.requiresCompleted)return (!t.location||(t.location==='village'?s.view==='village':s.view==='dungeon'&&s.dungeon===t.location))&&t.requiresCompleted.every(k=>s.completedStories[k])&&(t.requiresOwned||[]).every(k=>s.owned[k]);if(t.after)return !!s.seen[t.after];
  if(id.endsWith('_phase'))return !!s.owned[t.owner]||!!s.encounters[t.owner];
  // Identity passages opened at three learned skills of the character; characters without a tree of their own (chapter 1 since
  // 2026-10-28, all skills are Alice's) open theirs with the devour.
  if(id.endsWith('_identity'))return !!s.owned[t.owner]&&branchCount(s,t.owner)>=Math.min(3,(C.branches[t.owner]||[]).length);
  if(/_(encounter|assault|devour|form)$/.test(id)||t.source==='memory'&&['encounter','assault','devour','form'].includes(id))return !!s.owned[t.owner];
  if(t.campaignChapter)return t.campaignKind==='clear'?chapterCleared(s,t.campaignChapter):chapter(s)>=t.campaignChapter;
  if(id==='finale')return !!s.bosses.duskBell;if(id==='hidden_door')return !!s.bosses.origin_throne_boss;if(id==='hidden_finale')return !!s.bosses.hungerOrigin;if(id==='covenant')return !!s.owned.mirei;
  const route=t.route||id;if(['mine','road','ruins'].includes(route))return t.tier? killsIn(s,route)>=BigInt(t.tier*15):!!s.bosses[{mine:'mineWarden',road:'briarWolf',ruins:'sealKeeper'}[route]];
  if(['guild','forge','evolution'].includes(id))return !!s.owned.rina;return false;
 }
 function canPlayStory(s,key){const t=C.stories[key];if(!t||t.retired)return false;if(s.seen[key])return true;if(!storyFormMatches(s,key))return false;const phase=storyPhase(t);if(!storyUsesFixedForm(key)&&phase==='form')return !!s.owned[t.owner];if(phase==='encounter')return !!s.owned[t.owner]||canEncounter(s,t.owner);if(phase==='assault')return !!s.owned[t.owner]||!!s.encounters[t.owner]&&canEncounter(s,t.owner);return storyAvailable(s,key);}
 function markStory(s,key){if(C.stories[key]){s.seen[key]=true;if(storyUsesFixedForm(key)||!s.storyForms[key])s.storyForms[key]=storyForm(key)||s.active;}}
 // Completion, not seen-at-start or ownership, records memory-route knowledge.
 function completeStory(s,key,lastLineIndex){const t=C.stories[key];if(!t||!s.seen[key]||lastLineIndex!==t.lines.length-1||!canPlayStory(s,key))return null;const prior=Object.keys(C.dungeons).filter(id=>dungeonDiscovered(s,id)),fresh=!s.completedStories[key];s.completedStories[key]=true;const items=[];for(const id of C.storyItems?.[key]||[])if(add(s,id,1n)>0n)items.push(id);const witnessed=missingMemoryClues(s,key).filter(({clue})=>s.owned[clue.characterId]&&t.lines.some(line=>line[1]===clue.line));for(const {id,clue}of witnessed)s.memoryClueReceipts[memoryClueId(id,clue)]=true;if(witnessed.length)s.memoryClues[key]=true;if(fresh||witnessed.length)touch(s);return {completed:true,items,firstCompletion:fresh,clue:witnessed.length>0,newClueIds:witnessed.map(({id,clue})=>memoryClueId(id,clue)),discovered:Object.keys(C.dungeons).filter(id=>!prior.includes(id)&&dungeonDiscovered(s,id))};}
 function restoreMemoryProgress(s,raw){for(const key of Object.keys(C.stories))if(raw.completedStories?.[key]===true&&s.seen[key])s.completedStories[key]=true;for(const [id,route]of Object.entries(C.dungeonMemoryRoutes||{}))if(memoryRouteActive(id))for(const clue of route.clues||[]){const receipt=memoryClueId(id,clue);if(raw.memoryClueReceipts?.[receipt]===true&&s.completedStories[clue.storyId]&&s.owned[clue.characterId]){s.memoryClueReceipts[receipt]=true;s.memoryClues[clue.storyId]=true;}}for(const id of Object.keys(C.dungeons))if(raw.opened?.[id]===true)s.opened[id]=true;const previous=raw.memoryRouteVersion===1?(raw.memoryRoutesThroughChapter??releaseThroughChapter()):0;for(const id of Object.keys(C.dungeons))if(C.dungeons[id].chapter>previous&&C.dungeons[id].chapter<=releaseThroughChapter()&&legacyDungeonOpen(s,id))s.opened[id]=true;s.memoryRouteVersion=1;s.memoryRoutesThroughChapter=releaseThroughChapter();// Character items whose story an older save already finished arrive once on load.
  for(const [k,ids]of Object.entries(C.storyItems||{}))if(s.completedStories[k])for(const id of ids)if(!quantity(s,id))add(s,id,1n);}
 // Authored dungeon mechanics (the aqueduct prototype): one environment variable set at the node where it was found,
 // routes picked before entering (a fixed walk, then the destination population), population modifiers that change
 // real enemy stats, and permanent one-time unlocks. Only foreground running time advances combat.
 function mechanics(id){return C.dungeons[id]?.mechanics||null;}
 function progress(s,id){return (s.dungeonProgress??={})[id]??={};}
 function nodeFound(s,id,node){return !!progress(s,id)['found:'+node];}
 function envFound(s,id,k){const e=mechanics(id)?.env?.[k];return !!e&&nodeFound(s,id,e.at);}
 function envLevel(s,id,k){const e=mechanics(id)?.env?.[k];return e?(e.levels[progress(s,id)[k]]?progress(s,id)[k]:e.default):null;}
 function setEnv(s,id,k,level){const e=mechanics(id)?.env?.[k];if(!e||!envFound(s,id,k)||!e.levels[level])return null;const p=progress(s,id),first=!p['set:'+k+':'+level];if(envLevel(s,id,k)===level)return {changed:false,first:false};p[k]=level;p['set:'+k+':'+level]=true;touch(s);return {changed:true,first};}
 function unlocked(s,id,k){return !!progress(s,id)['unlock:'+k];}
 function routeOpen(s,id,r){const m=mechanics(id),def=m?.routes.find(x=>x.id===r);if(!def)return false;const q=def.requires||{};
  if(q.found&&!nodeFound(s,id,q.found))return false;if(q.notFound&&nodeFound(s,id,q.notFound))return false;
  return Object.entries(q.env||{}).every(([k,v])=>envLevel(s,id,k)===v);}
 function routes(s,id){const m=mechanics(id);return m?m.routes.filter(r=>routeOpen(s,id,r.id)):[];}
 function route(s,id){const m=mechanics(id);if(!m)return null;const r=(s.routes??={})[id];if(routeOpen(s,id,r))return r;return routes(s,id)[0]?.id||null;}
 function selectRoute(s,id,r){if(!routeOpen(s,id,r))return false;s.routes[id]=r;touch(s);return true;}
 function routeDef(s,id){const m=mechanics(id),r=route(s,id);return m?.routes.find(x=>x.id===r)||null;}
 // The spawner population a dungeon uses now: its own id, or id@population for the selected route and environment.
 function population(s,id){const def=routeDef(s,id);if(!def)return id;if(def.stopAt)return null;const p=def.population;if(typeof p==='string')return id+'@'+p;return id+'@'+p.map[envLevel(s,id,p.env)];}
 // Fights walked before arriving: resolved core > repaired shortcut > environment level > the route's default walk.
 function transit(s,id){const def=routeDef(s,id);if(!def?.walk)return [];const w=def.walk;if(Array.isArray(w))return [...w];const p=progress(s,id);
  const pick=p.cleared&&w.resolved?w.resolved:Object.keys(mechanics(id).unlocks||{}).find(k=>p['unlock:'+k]&&w[k])?w[Object.keys(mechanics(id).unlocks).find(k=>p['unlock:'+k]&&w[k])]:Object.values(mechanics(id).env||{}).map((e,i)=>w[envLevel(s,id,Object.keys(mechanics(id).env)[i])]).find(Boolean)||w.default||[];return [...pick];}
 // Arriving at the end of a walk: a stop node is found (the walk ends there), a destination may be revealed.
 function arrive(s,id){const def=routeDef(s,id);if(!def)return null;const p=progress(s,id);let found=null;for(const n of [def.stopAt,def.reveals].filter(Boolean))if(!p['found:'+n]){p['found:'+n]=true;found=n;}if(found)touch(s);return {stop:def.stopAt||null,found};}
 function resolveCore(s,id,enemy){const m=mechanics(id);if(!m?.core||m.core.boss!==enemy)return false;const p=progress(s,id);if(p.cleared)return false;p.cleared=true;touch(s);return true;}
 // Permanent unlocks earned by the first defeat of an enemy in a given population (e.g. the repaired ladder).
 function unlockAfter(s,id,enemy,pop){const m=mechanics(id);const out=[];for(const [k,u]of Object.entries(m?.unlocks||{}))if(u.afterKill===enemy&&pop===id+'@'+u.population&&!progress(s,id)['unlock:'+k]){progress(s,id)['unlock:'+k]=true;touch(s);out.push(k);}return out;}
 function needsSkillMigration(raw){return !!C.skillRulesRevision&&raw&&Number(raw.skillRulesRevision||0)<C.skillRulesRevision;}
 function needsSpeedMigration(raw){return !!C.speedRulesRevision&&raw&&Number(raw.speedRulesRevision||0)<C.speedRulesRevision;}
 // Restore local v1 retirement archives once. Unapplied overflow stays archived, never duplicated.
 function restoreSpeedItems(s,raw){
  for(const [id,q]of Object.entries(raw.retiredSpeedInventory||{}))if(C.speedItemReplacements?.[id]&&GameNumber.valid(q)){
   const amount=N(q);if(Number(raw.speedRulesRevision||0)>=2){s.retiredSpeedInventory[id]=amount;continue;}
   raw.inventory??={};const held=N(GameNumber.valid(raw.inventory[id])?raw.inventory[id]:0),cap=N(C.items[id].cap),room=cap>held?cap-held:0n,restored=min(amount,room);
   raw.inventory[id]=String(held+restored);if(amount>restored)s.retiredSpeedInventory[id]=amount-restored;
  }
 }
 function needsTrophyMigration(raw){return !!C.bossTrophyRevision&&raw&&Number(raw.bossTrophyRevision||0)<C.bossTrophyRevision;}
 function normalize(raw){const s=fresh(Number.isInteger(raw?.rng)?raw.rng:1);if(!raw||typeof raw!=='object')return s;
  if(raw.collectionVersion!==1)return migrate(raw);
  const skillMigration=needsSkillMigration(raw);raw=JSON.parse(GameNumber.stringify(raw));restoreSpeedItems(s,raw);
  s.skillHistory=Array.isArray(raw.skillHistory)?raw.skillHistory.filter(k=>typeof k==='string'):[];if(skillMigration)s.skillHistory=[...new Set([...s.skillHistory,...Object.keys(raw.skills||{}).filter(k=>raw.skills[k]&&!C.nodes[k]?.mark)])];
  s.skillMigrationNotice=skillMigration||raw.skillMigrationNotice===true;s.skillPayments=raw.skillPayments&&typeof raw.skillPayments==='object'?raw.skillPayments:{};
  for(const [k,q]of Object.entries(raw.pendingSkillRefunds||{}))if(GameNumber.valid(q))s.pendingSkillRefunds[k]=N(q);
  if(typeof MemoryLabyrinth!=='undefined')s.memoryLabyrinth=MemoryLabyrinth.normalize(raw.memoryLabyrinth);
  for(const id of Object.keys(C.characters))if(raw.owned?.[id]===true)s.owned[id]=true;s.active=s.owned[raw.active]?raw.active:'alice';
  // Merged chapter 1 items carry their saved quantities into the item they were merged into.
  if(raw.inventory)for(const [from,to]of Object.entries(C.itemMerges||{}))if(GameNumber.valid(raw.inventory[from])&&C.items[to]){raw.inventory[to]=String(N(GameNumber.valid(raw.inventory[to])?raw.inventory[to]:0)+N(raw.inventory[from]));delete raw.inventory[from];}
  // Chest economy rescale (once per revision): items now carry their area's value scale, so held quantities and stored
  // chests from older saves are divided by it (rounded, at least one if any was held); the total value is unchanged.
  if(C.itemScaleRevision&&raw.itemScaleRevision!==C.itemScaleRevision){const div=(v,d)=>{const q=N(v),k=BigInt(d);return q>0n?String(GameNumber.max(1n,(q+k/2n)/k)):String(q);};
   if(raw.inventory)for(const [k,d]of Object.entries(C.itemScale||{}))if(GameNumber.valid(raw.inventory[k]))raw.inventory[k]=div(raw.inventory[k],d);
   if(raw.chests)for(const [k,d]of Object.entries(C.chestScale||{}))if(GameNumber.valid(raw.chests[k]))raw.chests[k]=div(raw.chests[k],d);}
  // Split chest materials (content/chapter1-v2/material-split.json): once, an old stack is shared evenly between the old
  // kind and its new sibling kinds (the old kind keeps the remainder); nothing is added or lost.
  if(C.itemSplits?.revision&&raw.itemSplitRevision!==C.itemSplits.revision&&raw.inventory)for(const [from,to]of Object.entries(C.itemSplits.items)){if(!GameNumber.valid(raw.inventory[from]))continue;const q=N(raw.inventory[from]),share=q/BigInt(to.length+1);if(share<=0n)continue;
   for(const t of to){raw.inventory[t]=String(N(GameNumber.valid(raw.inventory[t])?raw.inventory[t]:0)+share);if(raw.discoveredItems?.[from])raw.discoveredItems[t]=true;}raw.inventory[from]=String(q-share*BigInt(to.length));}
  // Fixed-budget trophy stacks change units once, before inventory is capped.
  // Integer factors preserve every old partial stack exactly; kills grant nothing.
  if(needsTrophyMigration(raw)&&raw.inventory)for(const [id,m]of Object.entries(C.bossTrophyMigration||{}))if(GameNumber.valid(raw.inventory[id]))raw.inventory[id]=String(min(raw.inventory[id],m.oldCap)*BigInt(m.quantityFactor));
  // Retired skill nodes (a character's skill set changed): their materials are refunded once, up to each cap.
  const refunds={};if(raw.skills)for(const [id,r]of Object.entries(C.retiredNodes||{}))if(raw.skills[id]===true&&!C.nodes[id]&&raw.refundedNodes?.[id]!==true){refunds[id]=raw.skillPayments?.[id]||{...r.costs,...r.retiredSpeedCosts};}
  for(const id of itemIds){if(GameNumber.valid(raw.inventory?.[id]))s.inventory[id]=min(raw.inventory[id],C.items[id].cap);if(raw.discoveredItems?.[id]===true||Object.hasOwn(raw.inventory||{},id)&&GameNumber.valid(raw.inventory[id]))s.discoveredItems[id]=true;}
  for(const id of C.dungeonOrder)if(GameNumber.valid(raw.chests?.[id])){const k=chestOf(id);s.chests[k]=min(N(s.chests[k]||0)+N(raw.chests[id]),MAX_CHESTS);}
  for(const id of nodeIds){const d=C.nodes[id];if(raw.skills?.[id]===true&&s.owned[d.owner]&&prerequisites(id).every(k=>s.skills[k]))s.skills[id]=true;}
  // A devoured character's mark is a visible node that comes with the devour itself: owners always hold it (a flag, so reloads never add it twice).
  for(const id of Object.keys(C.devourMarks||{}))if(s.owned[id])for(const mark of markKeys(id))if(C.nodes[mark])s.skills[mark]=true;
  for(const [id,v]of Object.entries(raw.refundedNodes||{}))if(v===true&&C.retiredNodes?.[id])s.refundedNodes[id]=true;
  for(const [id,costs]of Object.entries(refunds)){for(const [oldKey,q]of Object.entries(costs)){const k=C.itemMerges?.[oldKey]||oldKey;if(GameNumber.valid(q))s.pendingSkillRefunds[k]=N(s.pendingSkillRefunds[k])+N(q);}s.refundedNodes[id]=true;}claimSkillRefunds(s);
  for(const id of Object.keys(s.owned))grantDevourSkill(s,id);
  for(const id of enemyIds){if(GameNumber.valid(raw.kills?.[id]))s.kills[id]=N(raw.kills[id]);if(raw.bosses?.[id]===true&&C.enemies[id].boss)s.bosses[id]=true;}
  for(const id of enemyIds){const f=raw.fightRecords?.[id],ok=v=>Number.isInteger(v)&&v>=0&&v<=10000;if(f&&ok(f.last)&&ok(f.best))s.fightRecords[id]={last:f.last,best:Math.min(f.best,f.last)};}
  for(const id of enemyIds)if(raw.seenEnemies?.[id]===true||N(s.kills[id])>0n||s.bosses[id]||raw.battle?.target===id)s.seenEnemies[id]=true;
  for(const key of Object.keys(C.stories)){if(raw.seen?.[key]===true)s.seen[key]=true;if(C.characters[raw.storyForms?.[key]])s.storyForms[key]=storyForm(key)||raw.storyForms[key];}
  for(const id of Object.keys(C.characters))if(raw.encounters?.[id]===true)s.encounters[id]=true;
  restoreMemoryProgress(s,raw);for(const id of Object.keys(C.dungeons))if(raw.enteredDungeons?.[id]===true&&dungeonDiscovered(s,id))s.enteredDungeons[id]=true;
  s.hp=GameNumber.valid(raw.hp)?min(raw.hp,hpCap(s)):stats(s).hp;s.savedAt=Number.isFinite(raw.savedAt)?Math.max(0,raw.savedAt):0;s.repeatBoss=raw.repeatBoss===true;s.recoveryCarry=min(raw.recoveryCarry,4999);s.offlineBlocked=raw.offlineBlocked===true;s.migrated=raw.migrated===true;
  for(const id of Object.keys(C.dungeons)){const m=mechanics(id);if(!m)continue;const p={},r=raw.dungeonProgress?.[id]||{};
   for(const n of Object.keys(m.nodes||{}))if(r['found:'+n]===true)p['found:'+n]=true;for(const k of Object.keys(m.unlocks||{}))if(r['unlock:'+k]===true)p['unlock:'+k]=true;if(r.cleared===true)p.cleared=true;
   for(const [k,e]of Object.entries(m.env||{})){if(e.levels[r[k]])p[k]=r[k];for(const l of Object.keys(e.levels))if(r['set:'+k+':'+l]===true)p['set:'+k+':'+l]=true;}
   // The first prototype (a sluice switch): a found sluice is the found sluice room; an open sluice meant drained water.
   if(r['found:sluice']===true&&m.nodes?.sluice){p['found:sluice']=true;if(r.sluice===true&&m.env?.water){p.water='low';p['set:water:low']=true;}}
   // Saves from before the prototype that already defeated the core guardian keep its outcome, without new rewards.
   if(m.core&&s.bosses[m.core.boss]){p.cleared=true;for(const e of Object.values(m.env||{}))p['found:'+e.at]=true;}
   if(Object.keys(p).length)s.dungeonProgress[id]=p;if(typeof raw.routes?.[id]==='string'&&routeOpen(s,id,raw.routes[id]))s.routes[id]=raw.routes[id];}
  if(typeof DungeonEvents!=='undefined')s.events=DungeonEvents.normalize(raw.events,s.rng);
  s.spawns=typeof DungeonSpawner==='undefined'?{}:DungeonSpawner.normalize(raw.spawns);s.dungeon=dungeonOpen(s,raw.dungeon)?raw.dungeon:'forest';s.view=['village','dungeon','combat','run'].includes(raw.view)?raw.view:'village';const b=raw.battle,e=C.enemies[b?.target];
  if(skillMigration){if(typeof ExplorationRun!=='undefined'){s.exploration=ExplorationRun.normalize(raw.exploration,s.rng,s);s.exploration.run=null;}s.battle=null;s.view='village';s.hp=min(s.hp,hpCap(s));touch(s);return s;}
  // Card exploration: the run (cards, step, effects) is restored as saved; a run fight continues against its queue.
  // Areas merged into a card exploration (their layers live in another area) send the player to that area.
  if(C.dungeons[s.dungeon]?.mergedInto){s.dungeon=C.dungeons[s.dungeon].mergedInto;if(s.battle&&!s.battle.story&&!s.battle.run){s.battle=null;if(s.view==='combat')s.view='dungeon';}}
  let run=null;if(typeof ExplorationRun!=='undefined'){s.exploration=ExplorationRun.normalize(raw.exploration,s.rng,s);run=s.exploration.run;if(run)s.dungeon=run.dungeon;
   if(s.view==='combat'&&b?.run&&!e?.story){const nb=run&&s.hp>0n?ExplorationRun.restoreBattle(s,b):null;if(nb){s.battle=nb;s.seenEnemies[nb.target]=true;return s;}s.view=run?'run':'dungeon';}
   if(s.view==='run'&&!run)s.view='dungeon';}
  else if(s.view==='run')s.view='dungeon';
  if(C.skillRulesRevision&&s.view==='combat'&&e?.story&&b?.story&&GameNumber.valid(b.hp)&&N(b.hp)>0n&&s.hp>0n&&!s.owned[e.characterId||e.id]){const st=stats(s),turn=Math.max(0,Math.min(600,Number.isSafeInteger(b.turn)?b.turn:0));s.battle={target:e.id,hp:min(b.hp,e.hp),turn,phaseStart:Math.max(0,Math.min(turn,Number.isSafeInteger(b.phaseStart)?b.phaseStart:0)),shield:min(b.shield,max(st.hp*st.shieldBps/10000n,st.hp/4n)),cooldown:Math.max(0,Math.min(1000,Number(b.cooldown)||0)),paused:b.paused===true,stalled:Math.max(0,Math.min(600,Number(b.stalled)||0)),story:true,...(b.village?{village:true}:{}),...(b.run&&run?{run:true}:{}),checkpoint:{hp:min(b.checkpoint?.hp,hpCap(s)),active:s.owned[b.checkpoint?.active]?b.checkpoint.active:s.active,dungeon:C.dungeons[b.checkpoint?.dungeon]?b.checkpoint.dungeon:s.dungeon},enemyLeechTotal:min(b.enemyLeechTotal,N(e.hp)*BigInt(e.behavior?.leechCapBps??10000)/10000n)};s.offlineBlocked=true;return s;}
  if(s.view==='combat'&&e?.story){const checkpoint=b.checkpoint;s.view='dungeon';s.offlineBlocked=true;if(GameNumber.valid(checkpoint?.hp))s.hp=min(checkpoint.hp,stats(s).hp);if(s.owned[checkpoint?.active])s.active=checkpoint.active;if(dungeonOpen(s,checkpoint?.dungeon))s.dungeon=checkpoint.dungeon;if(b.run&&run)s.view='run';}
  else if(s.view==='combat'&&b?.explore===true&&C.dungeons[b.dungeon]?.spawn&&dungeonOpen(s,b.dungeon)&&s.hp>0n&&typeof DungeonSpawner!=='undefined'){const pop=population(s,b.dungeon),walk=transit(s,b.dungeon),left=Array.isArray(b.transit)&&b.transit.length<=walk.length&&b.transit.every((k,i)=>k===walk[walk.length-b.transit.length+i])?[...b.transit]:[],target=left.length?left[0]:pop?DungeonSpawner.front(s,pop):null,f=target?(left.length?C.enemies[target]:DungeonSpawner.foe(pop,target)):null;if(!f){s.view='dungeon';s.battle=null;}else{const same=target===b.target&&GameNumber.valid(b.hp)&&N(b.hp)>0n;s.battle={explore:true,dungeon:b.dungeon,population:pop,...(left.length?{transit:left}:{}),target,hp:same?min(b.hp,f.hp):N(f.hp),...(same&&f.behavior?.leechBps?{enemyLeechTotal:min(b.enemyLeechTotal,N(f.hp)*BigInt(f.behavior.leechCapBps??10000)/10000n)}:{}),shield:min(b.shield,max(stats(s).hp*stats(s).shieldBps/10000n,stats(s).hp/4n)),turn:same?Math.max(0,Math.min(600,Number.isSafeInteger(b.turn)?b.turn:0)):0,cooldown:Math.max(0,Math.min(1000,Number.isFinite(b.cooldown)?b.cooldown:0)),paused:b.paused===true,stalled:0,...(Number.isSafeInteger(b.carry)&&b.carry>0&&b.carry<10000?{carry:b.carry}:{})};s.seenEnemies[target]=true;}}else if(s.view==='combat'&&e&&enemyOpen(s,e.id)&&GameNumber.valid(b.hp)&&N(b.hp)>0n&&s.hp>0n)s.battle={target:e.id,hp:min(b.hp,e.hp),...(e.behavior?.leechBps?{enemyLeechTotal:min(b.enemyLeechTotal,N(e.hp)*BigInt(e.behavior.leechCapBps??10000)/10000n)}:{}),shield:min(b.shield,max(stats(s).hp*stats(s).shieldBps/10000n,stats(s).hp/4n)),turn:Math.max(0,Math.min(600,Number.isSafeInteger(b.turn)?b.turn:0)),cooldown:Math.max(0,Math.min(1000,Number.isFinite(b.cooldown)?b.cooldown:0)),paused:b.paused===true,stalled:Math.max(0,Math.min(600,Number(b.stalled)||0))};else if(s.view==='combat')s.view='dungeon';
  return s;
 }
 function migrate(raw){const s=fresh(Number.isInteger(raw.rng)?raw.rng:1);s.migrated=true;
  for(const id of Object.keys(C.characters))if(raw.forms?.[id]&&typeof raw.forms[id]==='object'||id==='rina'&&raw.devoured)s.owned[id]=true;s.active=s.owned[raw.active]?raw.active:'alice';
  for(const id of enemyIds)if(GameNumber.valid(raw.kills?.[id])){s.kills[id]=N(raw.kills[id]);if(C.enemies[id].boss&&s.kills[id]>0n)s.bosses[id]=true;}
  for(const [id,v]of Object.entries(raw.chapter?.bosses||{}))if(v===true&&C.enemies[bossAliases[id]||id]?.boss)s.bosses[bossAliases[id]||id]=true;
  for(const [key,t]of Object.entries(C.stories)){if((t.source==='memory'?raw.memories?.[t.id]:raw.chapter?.seen?.[t.id])===true)s.seen[key]=true;if(C.characters[raw.storyForms?.[key]])s.storyForms[key]=storyForm(key)||raw.storyForms[key];}
  for(const id of Object.keys(s.owned))if(id!=='alice'){s.encounters[id]=true;for(const kind of ['encounter','assault','devour'])markStory(s,storyKey(id,kind));}
  // Earned clears and old collections become finite collection stock; obsolete bonuses do not survive.
  for(const [id,d]of Object.entries(C.dungeons))if(!d.narrative){const cleared=d.bosses.some(k=>s.bosses[k]),killCount=killsIn(s,id);if(cleared){for(const k of d.pool)add(s,k,C.items[k].special?1:Math.ceil(C.items[k].cap*.75));for(const k of d.direct)if(s.bosses[C.items[k].source])add(s,k,1);}else if(killCount>0n)addChest(s,id,min(1500,killCount));}
  for(const [oldId,q]of Object.entries(raw.inventory||{})){if(!GameNumber.valid(q))continue;const source=C.legacyItemSources[oldId],pool=C.dungeons[source]?.pool.filter(k=>C.items[k].consumable&&C.items[k].rarity==='normal');if(pool?.length)add(s,pool[oldId.length%pool.length],min(q,99));}
  for(const id of Object.keys(s.owned)){const count=raw.chapter?.identities?.[id]?3:1;if(!C.skillRulesRevision)for(const key of (C.branches[id]||[]).slice(0,count))s.skills[key]=true;}
  // Devour marks come with ownership, exactly as normalize grants them, so a reload changes nothing.
  for(const id of Object.keys(C.devourMarks||{}))if(s.owned[id])for(const mark of markKeys(id))if(C.nodes[mark])s.skills[mark]=true;
  restoreMemoryProgress(s,raw);touch(s);s.hp=stats(s).hp;s.dungeon=dungeonOpen(s,raw.dungeon)?raw.dungeon:'forest';s.view='village';s.savedAt=Date.now();return s;
 }
 function full(){const s=fresh(1415926);s.owned=Object.fromEntries(Object.keys(C.characters).map(id=>[id,true]));s.skills=Object.fromEntries(nodeIds.map(id=>[id,true]));for(const id of itemIds){s.inventory[id]=N(C.items[id].cap);s.discoveredItems[id]=true;}for(const [id,e]of Object.entries(C.enemies))if(!e.story){s.seenEnemies[id]=true;s.kills[id]=10000n;if(e.boss)s.bosses[id]=true;}for(const id of C.dungeonOrder)if(C.dungeons[id].pool.length)s.chests[id]=500000000n;for(const key of Object.keys(C.stories)){s.seen[key]=true;s.storyForms[key]=storyForm(key)||'alice';s.completedStories[key]=true;}for(const [id,route]of Object.entries(C.dungeonMemoryRoutes||{}))if(memoryRouteActive(id))for(const clue of route.clues||[])if(C.stories[clue.storyId].lines.some(line=>line[1]===clue.line)){s.memoryClues[clue.storyId]=true;s.memoryClueReceipts[memoryClueId(id,clue)]=true;}s.encounters={...s.owned};touch(s);s.hp=stats(s).hp;return s;}
 return {chestBonus,effectiveNodes,claimSkillRefunds,needsSkillMigration,needsSpeedMigration,needsTrophyMigration,hpCap,healTo,fresh,normalize,migrate,full,prerequisites,quantity,add,addChest,chestOf,touch,rng,stats,breakdown,adjustHP,devour,chapter,chapterCleared,mechanics,progress,nodeFound,envFound,envLevel,setEnv,unlocked,arrive,unlockAfter,routeOpen,routes,route,selectRoute,routeDef,population,transit,killsIn,collected,chapterCollection,chapterSkills,branchCount,releaseThroughChapter,memoryRouteActive,memoryClueId,missingMemoryClues,dungeonDiscovered,dungeonOpen,dungeonHint,enemyOpen,secretVisible,conditions,canEncounter,legacyMultiplier,canUnlock,preview,unlock,open,drops,storyKey,storyAvailable,storyUsesFixedForm,storyForm,storyPhase,storyFormMatches,entryForm,formHint,canPlayStory,markStory,completeStory,clueCount,MAX_CHESTS};
})();

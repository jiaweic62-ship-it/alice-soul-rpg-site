/* One complete round. The actor attacks; only a surviving enemy retaliates. No rewards, UI or saves here. */
const BattleSystem=(()=>{
 function round({playerHp,playerAttack,enemyHp,enemyAttack}){playerHp=GameNumber.from(playerHp);enemyHp=GameNumber.from(enemyHp);if(playerHp===0n)return {playerHp,enemyHp,damageDealt:0n,damageTaken:0n,outcome:'defeat'};if(enemyHp===0n)return {playerHp,enemyHp,damageDealt:0n,damageTaken:0n,outcome:'victory'};const damageDealt=GameNumber.min(enemyHp,playerAttack);enemyHp-=damageDealt;if(enemyHp===0n)return {playerHp,enemyHp,damageDealt,damageTaken:0n,outcome:'victory'};const damageTaken=GameNumber.min(playerHp,enemyAttack);playerHp-=damageTaken;return {playerHp,enemyHp,damageDealt,damageTaken,outcome:playerHp===0n?'defeat':'ongoing'}}
 // Authored enemy behavior uses integer basis points. One-time effects key off the saved turn;
 // capped lifesteal keys off saved enemyLeechTotal. No wall-clock or unsaved random state.
 // A group fight (user 2026-11-11: 群敌一次出现三只、一场打完) passes the other living enemies in `others`
 // ({enemyHp,enemyMax,enemyAttack,enemyHits,mechanic,enemyBehavior,enemyFlatDefense,enemyLeechTotal}). The player's
 // packets hit the leftmost living enemy and move on to the next when it falls (a packet's overkill is lost); then every
 // living enemy strikes in order. The result's enemyHp is the first enemy's, others[] the rest; 'victory' = all down.
 function cumulative(input){
 const N=GameNumber.from,min=GameNumber.min;let hp=N(input.playerHp),shield=N(input.shield),damageDealt=0n,healed=0n,rawDamage=0n,impactDamage=0n,hits=0n;let enemyHealing=0n;const maximum=N(input.maxHp),turn=(input.turn||0)+1,has=id=>(input.abilities||[]).includes(id);
 const foe=v=>({hp:N(v.enemyHp),max:N(v.enemyMax),attack:v.enemyAttack,hits:v.enemyHits,mechanic:v.mechanic,behavior:v.enemyBehavior||{},flat:v.enemyFlatDefense,prior:N(v.enemyLeechTotal),leech:N(v.enemyLeechTotal),taken:0n}),foes=[foe(input),...(input.others||[]).map(foe)],first=foes[0];
 // Side-quest relics (2026-11-04): stored = damage taken kept for the next attack (storeBps), endured = the one HP-1 save
 // of this fight (endureOnce) is used, furnaceBps = an extra strike paid for with max HP (furnaceBurnBps, never below 1).
 let stored=N(input.stored),endured=!!input.endured;
 const out=extra=>({playerHp:hp,enemyHp:first.hp,damageDealt,rawDamage,impactDamage,hits,healed,turn,shield,events,stored,endured,...(foes.length>1?{others:foes.slice(1).map(f=>({enemyHp:f.hp,enemyLeechTotal:f.leech}))}:{}),...extra});
 if(!hp||foes.every(f=>!f.hp)){const r=round(input);return {...r,turn,shield,rawDamage,impactDamage,hits,healed,...(foes.length>1?{others:foes.slice(1).map(f=>({enemyHp:f.hp,enemyLeechTotal:f.leech})),outcome:hp?'victory':'defeat'}:{})};}
 const heal=amount=>{amount=N(amount);const actual=min(amount,GameNumber.subtract(maximum,hp)),overflow=amount-actual;hp+=actual;healed+=actual;if(overflow&&input.overflowBps&&shield<maximum/4n)shield=min(maximum/4n,shield+overflow*N(input.overflowBps)/10000n)};
 heal(maximum*N(input.regenBps)/10000n);
 const sc=input.skillCombat||{},modern=!!input.combatRulesRevision,events=[],target=()=>{const i=foes.findIndex(f=>f.hp>0n);return i<0?null:foes[i];},at=f=>foes.indexOf(f);
 if(modern){
  const A=N(input.playerAttack),packet=(kind,raw,cut=false)=>{const f=target();if(!f||raw<=0n)return;rawDamage=GameNumber.max(rawDamage,raw);let damage=cut?min(GameNumber.subtract(f.hp,1n),raw):GameNumber.subtract(raw,f.flat);if(!cut&&f.mechanic==='armor')damage=damage*60n/100n;if(!cut&&turn===1&&f.taken===0n&&f.behavior.initialGuardBps)damage=damage*(10000n-N(f.behavior.initialGuardBps))/10000n;impactDamage=GameNumber.max(impactDamage,damage);const dealt=min(f.hp,damage);f.hp-=dealt;damageDealt+=dealt;hits++;f.taken++;events.push({kind,damage:dealt,...(foes.length>1?{foe:at(f)}:{})});if(!cut)heal(dealt*N(input.leechBps)/10000n);};
  if(turn===1)packet('opening',A*N(sc.openingBps)/10000n);
  const firstBps=turn<=Number(sc.firstTurns||1)?N(sc.firstBps):0n,ramp=min(N(sc.rampMaxBps),N(sc.rampBps)*BigInt(turn-1)),t=target();
  const legacy=(turn===1?N(input.legacyFirstBps):0n)+(hp>=maximum?N(input.fullBps):0n)+(hp*10n<=maximum*3n?N(input.lowBps):0n)+(t&&t.hp*4n<=t.max?N(input.executeBps):0n)+N(input.legacyRampBps)*BigInt(Math.min(10,turn-1));
  packet('normal',A*(10000n+min(25000n,firstBps+ramp+legacy))/10000n);
  if(stored>0n){packet('stored',stored);stored=0n;}
  if(N(input.furnaceBps)>0n){packet('furnace',A*N(input.furnaceBps)/10000n);const burn=min(GameNumber.subtract(hp,1n),maximum*N(input.furnaceBurnBps)/10000n);hp-=burn;}
  const extra=min(15000n,N(sc.extraStrikeBps)+min(5000n,N(input.comboBps)+N(input.legacyHits)*10000n));packet('extra',A*extra/10000n);
  for(const p of sc.periodicAttacks||[])if(turn%Number(p.every)===0&&(!p.once||turn===Number(p.every)))packet(Number(p.every)>=12?'burst':'periodic',A*N(p.bps)/10000n);
  const oldPeriodic=(input.periodics||[]).reduce((v,p)=>v+(turn%p.every===0?N(p.bps):0n),0n);packet('item-periodic',A*oldPeriodic/10000n);
  if(turn===Number(sc.currentHpCutTurn)){const f=target();if(f)packet('current-hp',f.hp*N(sc.currentHpCutBps)/10000n,true);}
 }else{
 const wanted=N(input.hits)||1n,offset=N(input.hitOffset);
 for(let i=0n;i<wanted&&target();i++){const f=target();
  const style=(has('heavy')?4000n:0n)+(has('sweep')&&f.mechanic==='swarm'?8000n:0n),periodic=(input.periodics||[]).reduce((n,p)=>n+(turn%p.every===0?N(p.bps):0n),0n);
  const groups=[turn===1?N(input.firstBps):0n,periodic,hp===maximum?N(input.fullBps):0n,hp*10n<=maximum*3n?N(input.lowBps):0n,N(input.comboBps)*min(10n,offset+i+1n)+style,N(input.rampBps)*BigInt(Math.min(10,turn-1)),f.hp*4n<=f.max?N(input.executeBps):0n];
  let raw;if(input.multiplierMode){let numerator=N(input.playerAttack);for(const bps of groups)numerator*=10000n+bps;raw=numerator/(10000n**BigInt(groups.length));}else raw=N(input.playerAttack)*(10000n+groups.reduce((a,b)=>a+b,0n))/10000n;
  rawDamage=GameNumber.max(rawDamage,raw);let damage=GameNumber.subtract(raw,f.flat);if(f.mechanic==='armor'&&!has('pierce'))damage=damage*60n/100n;
  if(turn===1&&f.taken===0n&&f.behavior.initialGuardBps&&!has('pierce'))damage=damage*(10000n-N(f.behavior.initialGuardBps))/10000n;
  impactDamage=GameNumber.max(impactDamage,damage);const dealt=min(f.hp,damage);f.hp-=dealt;damageDealt+=dealt;hits++;f.taken++;heal(dealt*(N(input.leechBps)+(has('drain')?300n:0n))/10000n);
 }
 }
 if(!target())return out({damageTaken:0n,outcome:'victory'});
 let damageTaken=0n,phase=false;
 for(const f of foes){if(!f.hp||!hp)continue;const behavior=f.behavior,enemyMax=f.max;
 if(turn===1&&behavior.healOnceBps&&!has('silence')){const gain=min(enemyMax-f.hp,enemyMax*N(behavior.healOnceBps)/10000n);f.hp+=gain;enemyHealing+=gain;}
 if(f.mechanic==='regen'&&!has('silence')){const gain=min(enemyMax-f.hp,enemyMax*2n/100n);f.hp+=gain;enemyHealing+=gain;}
 let incoming=N(f.attack);
 if(behavior.attackCycleBps?.length)incoming=incoming*N(behavior.attackCycleBps[(turn-1)%behavior.attackCycleBps.length])/10000n;
 if(turn===1&&behavior.firstAttackBps!==undefined)incoming=incoming*N(behavior.firstAttackBps)/10000n;
 if(behavior.enrageBelowBps&&f.hp*10000n<=enemyMax*N(behavior.enrageBelowBps))incoming=incoming*N(behavior.enrageAttackBps)/10000n;const ph=(f.mechanic==='final'||f.mechanic==='hunger')&&f.hp<=enemyMax/2n;if(f===first)phase=ph;
 if(ph)incoming=incoming*140n/100n;if((f.mechanic==='charge'||ph)&&turn%3===0)incoming*=3n;
 if(f.mechanic==='mirror')incoming=incoming*(100n+min(10n,hits)*5n)/100n;
 const late=behavior.escalateAfterTurn??40;if(['mirror','hunger','void'].includes(f.mechanic)&&turn>late)incoming*=BigInt(turn-late+1)**2n;
 const defense=modern?{flatDefense:input.flatDefense,reductionNumerator:10000n-min(6000n,N(input.totalReductionBps)+(turn<=Number(sc.openingWardTurns)?N(sc.openingWardBps):0n)),reductionDenominator:10000n}:{flatDefense:input.flatDefense,reductionNumerator:input.reductionNumerator,reductionDenominator:input.reductionDenominator,extraReductionBps:has('ward')?2000n:0n};
 const perHit=GrowthSystem.damageAfterDefense(incoming,defense),incomingHits=N(f.hits)||(f.mechanic==='swarm'?3n:1n),retaliation=turn===1&&behavior.retaliateOnceBps?GrowthSystem.damageAfterDefense(N(f.attack)*N(behavior.retaliateOnceBps)/10000n,defense):0n,incomingTotal=perHit*incomingHits+retaliation,absorbed=min(shield,incomingTotal);shield-=absorbed;let taken=min(hp,incomingTotal-absorbed);hp-=taken;if(hp===0n&&N(input.endureOnce)>0n&&!endured&&maximum>1n){hp=1n;taken-=1n;endured=true;events.push({kind:'endure'});}stored+=taken*N(input.storeBps)/10000n;damageTaken+=taken;
 if(foes.length>1&&taken>0n)events.push({kind:'strike',foe:at(f),damage:taken});
 if(behavior.leechBps&&!has('silence')){const cap=enemyMax*N(behavior.leechCapBps??10000)/10000n,room=GameNumber.subtract(cap,f.prior),gain=min(enemyMax-f.hp,min(room,taken*N(behavior.leechBps)/10000n));f.hp+=gain;f.leech+=gain;enemyHealing+=gain;}
 }
 return out({damageTaken,phase,enemyLeechTotal:first.leech,enemyHealing,outcome:hp===0n?'defeat':'ongoing'});
 }

 function roundsToWin(enemyHp,attack){enemyHp=GameNumber.from(enemyHp);attack=GameNumber.from(attack);return attack===0n?null:(enemyHp+attack-1n)/attack}
 // Uses the same event resolver as live combat, including phase continuity and enemy lifesteal.
 function predict(stats,enemy,{playerHp=stats.hp,limit=600,resolvePhase=null}={}){const N=GameNumber.from;let e=enemy,hp=N(playerHp),eh=N(e.hp),shield=N(stats.hp)*N(stats.shieldBps)/10000n,turn=0,leech=0n,r=null,phaseStart=0,stored=0n,endured=false;const result=(r,turns)=>{let remainingHp=eh,next=e.phaseNext,seen=new Set();while(next&&resolvePhase&&!seen.has(next)){seen.add(next);const f=resolvePhase(next);if(!f)break;remainingHp+=N(f.hp);next=f.phaseNext;}return {...r,turns,phaseId:e.id,remainingHp};};for(let i=0;i<limit;i++){r=cumulative({...stats,playerHp:hp,playerAttack:stats.attack,maxHp:stats.hp,enemyHp:eh,enemyMax:N(e.hp),enemyAttack:N(e.attack),enemyHits:e.hits||1,mechanic:e.mechanic,enemyBehavior:e.behavior,enemyLeechTotal:leech,turn,shield,stored,endured});stored=r.stored||0n;endured=!!r.endured;hp=r.playerHp;eh=r.enemyHp;shield=r.shield;turn=r.turn;leech=r.enemyLeechTotal||0n;if(r.outcome==='victory'&&e.phaseNext&&resolvePhase){const next=resolvePhase(e.phaseNext);if(!next)return result({...r,outcome:'ongoing'},i+1);e=next;eh=N(e.hp);leech=0n;phaseStart=turn;if(!stats.combatRulesRevision)turn=0;r={...r,enemyHp:eh,outcome:'ongoing'};continue;}if(r.outcome!=='ongoing')return result(r,i+1);if(e.turnLimit&&turn-phaseStart>=e.turnLimit)return result({...r,outcome:'withdrew'},i+1);}return result({...r,outcome:r?.outcome||'ongoing'},limit);}
 // A group fight (all enemies at once, cumulative's `others`), predicted with the same resolver: kills heal killHealBps of
 // max HP like live combat. Returns {outcome,playerHp,turns}; enemies here never change form or withdraw.
 function predictGroup(stats,enemies,{playerHp=stats.hp,limit=600}={}){const N=GameNumber.from;let hp=N(playerHp),shield=N(stats.hp)*N(stats.shieldBps)/10000n,turn=0,stored=0n,endured=false,r=null;const fs=enemies.map(e=>({e,hp:N(e.hp),leech:0n})),pack=f=>({enemyHp:f.hp,enemyMax:N(f.e.hp),enemyAttack:N(f.e.attack),enemyHits:f.e.hits||1,mechanic:f.e.mechanic,enemyBehavior:f.e.behavior,enemyFlatDefense:stats.enemyFlatDefense,enemyLeechTotal:f.leech});
  for(let i=0;i<limit;i++){const live=fs.filter(f=>f.hp>0n);if(!live.length)return {outcome:'victory',playerHp:hp,turns:i};const [a,...rest]=live;r=cumulative({...stats,playerHp:hp,playerAttack:stats.attack,maxHp:stats.hp,...pack(a),others:rest.map(pack),turn,shield,stored,endured});
   hp=r.playerHp;shield=r.shield;turn=r.turn;stored=r.stored||0n;endured=!!r.endured;a.hp=r.enemyHp;a.leech=r.enemyLeechTotal||0n;(r.others||[]).forEach((o,k)=>{rest[k].hp=o.enemyHp;rest[k].leech=o.enemyLeechTotal||0n;});
   for(const f of live)if(!f.hp&&hp>0n&&hp<N(stats.hp))hp=GameNumber.min(N(stats.hp),hp+N(stats.hp)*N(stats.killHealBps)/10000n);
   if(r.outcome==='defeat')return {outcome:'defeat',playerHp:hp,turns:i+1};if(fs.every(f=>!f.hp))return {outcome:'victory',playerHp:hp,turns:i+1};}
  return {outcome:'ongoing',playerHp:hp,turns:limit};}
 function damageCeiling(p){if(p.combatRulesRevision){const N=GameNumber.from,A=N(p.attack),sc=p.skillCombat||{};let ceiling=0n;for(let t=1;t<=600;t++){const periodic=[...(sc.periodicAttacks||[]),...(p.periodics||[])].reduce((sum,v)=>sum+(t%Number(v.every)===0&&(!v.once||t===Number(v.every))?N(v.bps):0n),0n);ceiling=GameNumber.max(ceiling,A*(35000n+15000n+periodic+N(p.furnaceBps)+(t===1?N(sc.openingBps):0n))/10000n);}return ceiling;}const N=GameNumber.from,hits=N(p.hits)||1n,style=(p.abilities||[]).includes('sweep')?8000n:0n,state=GameNumber.max(p.fullBps,p.lowBps);let maximum=0n;for(let turn=1;turn<=600;turn++){let sum=0n;const periodic=(p.periodics||[]).reduce((a,b)=>a+(turn%b.every===0?N(b.bps):0n),0n);for(let hit=0n;hit<hits;hit++){const groups=[turn===1?N(p.firstBps):0n,periodic,state,N(p.comboBps)*GameNumber.min(10n,hit+1n)+style,N(p.rampBps)*BigInt(Math.min(10,turn-1)),N(p.executeBps)];let n=N(p.attack);for(const bonus of groups)n*=10000n+bonus;sum+=n/(10000n**BigInt(groups.length));}maximum=GameNumber.max(maximum,sum);}return maximum+N(p.attack)*30n/100n;}
 return Object.freeze({round,cumulative,roundsToWin,damageCeiling,predict,predictGroup});
})();

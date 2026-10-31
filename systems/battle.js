/* One complete round. The actor attacks; only a surviving enemy retaliates. No rewards, UI or saves here. */
const BattleSystem=(()=>{
 function round({playerHp,playerAttack,enemyHp,enemyAttack}){playerHp=GameNumber.from(playerHp);enemyHp=GameNumber.from(enemyHp);if(playerHp===0n)return {playerHp,enemyHp,damageDealt:0n,damageTaken:0n,outcome:'defeat'};if(enemyHp===0n)return {playerHp,enemyHp,damageDealt:0n,damageTaken:0n,outcome:'victory'};const damageDealt=GameNumber.min(enemyHp,playerAttack);enemyHp-=damageDealt;if(enemyHp===0n)return {playerHp,enemyHp,damageDealt,damageTaken:0n,outcome:'victory'};const damageTaken=GameNumber.min(playerHp,enemyAttack);playerHp-=damageTaken;return {playerHp,enemyHp,damageDealt,damageTaken,outcome:playerHp===0n?'defeat':'ongoing'}}
 // Authored enemy behavior uses integer basis points. One-time effects key off the saved turn;
 // capped lifesteal keys off saved enemyLeechTotal. No wall-clock or unsaved random state.
 function cumulative(input){
 const N=GameNumber.from,min=GameNumber.min;let hp=N(input.playerHp),eh=N(input.enemyHp),shield=N(input.shield),damageDealt=0n,healed=0n,rawDamage=0n,impactDamage=0n,hits=0n;const behavior=input.enemyBehavior||{},priorLeech=N(input.enemyLeechTotal);let enemyLeechTotal=priorLeech,enemyHealing=0n;const maximum=N(input.maxHp),enemyMax=N(input.enemyMax),turn=(input.turn||0)+1,has=id=>(input.abilities||[]).includes(id);
 if(!hp||!eh)return {...round(input),turn,shield,rawDamage,impactDamage,hits,healed};
 const heal=amount=>{amount=N(amount);const actual=min(amount,GameNumber.subtract(maximum,hp)),overflow=amount-actual;hp+=actual;healed+=actual;if(overflow&&input.overflowBps&&shield<maximum/4n)shield=min(maximum/4n,shield+overflow*N(input.overflowBps)/10000n)};
 heal(maximum*N(input.regenBps)/10000n);
 const sc=input.skillCombat||{},modern=!!input.combatRulesRevision,events=[];
 if(modern){
  const A=N(input.playerAttack),packet=(kind,raw,cut=false)=>{if(!eh||raw<=0n)return;rawDamage=GameNumber.max(rawDamage,raw);let damage=cut?min(GameNumber.subtract(eh,1n),raw):GameNumber.subtract(raw,input.enemyFlatDefense);if(!cut&&input.mechanic==='armor')damage=damage*60n/100n;if(!cut&&turn===1&&hits===0n&&behavior.initialGuardBps)damage=damage*(10000n-N(behavior.initialGuardBps))/10000n;impactDamage=GameNumber.max(impactDamage,damage);const dealt=min(eh,damage);eh-=dealt;damageDealt+=dealt;hits++;events.push({kind,damage:dealt});if(!cut)heal(dealt*N(input.leechBps)/10000n);};
  if(turn===1)packet('opening',A*N(sc.openingBps)/10000n);
  const first=turn<=Number(sc.firstTurns||1)?N(sc.firstBps):0n,ramp=min(N(sc.rampMaxBps),N(sc.rampBps)*BigInt(turn-1));
  const legacy=(turn===1?N(input.legacyFirstBps):0n)+(hp>=maximum?N(input.fullBps):0n)+(hp*10n<=maximum*3n?N(input.lowBps):0n)+(eh*4n<=enemyMax?N(input.executeBps):0n)+N(input.legacyRampBps)*BigInt(Math.min(10,turn-1));
  packet('normal',A*(10000n+min(25000n,first+ramp+legacy))/10000n);
  const extra=min(15000n,N(sc.extraStrikeBps)+min(5000n,N(input.comboBps)+N(input.legacyHits)*10000n));packet('extra',A*extra/10000n);
  for(const p of sc.periodicAttacks||[])if(turn%Number(p.every)===0&&(!p.once||turn===Number(p.every)))packet(Number(p.every)>=12?'burst':'periodic',A*N(p.bps)/10000n);
  const oldPeriodic=(input.periodics||[]).reduce((v,p)=>v+(turn%p.every===0?N(p.bps):0n),0n);packet('item-periodic',A*oldPeriodic/10000n);
  if(turn===Number(sc.currentHpCutTurn))packet('current-hp',eh*N(sc.currentHpCutBps)/10000n,true);
 }else{
 const wanted=N(input.hits)||1n,offset=N(input.hitOffset);
 for(let i=0n;i<wanted&&eh>0n;i++){
  const style=(has('heavy')?4000n:0n)+(has('sweep')&&input.mechanic==='swarm'?8000n:0n),periodic=(input.periodics||[]).reduce((n,p)=>n+(turn%p.every===0?N(p.bps):0n),0n);
  const groups=[turn===1?N(input.firstBps):0n,periodic,hp===maximum?N(input.fullBps):0n,hp*10n<=maximum*3n?N(input.lowBps):0n,N(input.comboBps)*min(10n,offset+i+1n)+style,N(input.rampBps)*BigInt(Math.min(10,turn-1)),eh*4n<=enemyMax?N(input.executeBps):0n];
  let raw;if(input.multiplierMode){let numerator=N(input.playerAttack);for(const bps of groups)numerator*=10000n+bps;raw=numerator/(10000n**BigInt(groups.length));}else raw=N(input.playerAttack)*(10000n+groups.reduce((a,b)=>a+b,0n))/10000n;
  rawDamage=GameNumber.max(rawDamage,raw);let damage=GameNumber.subtract(raw,input.enemyFlatDefense);if(input.mechanic==='armor'&&!has('pierce'))damage=damage*60n/100n;
  if(turn===1&&i===0n&&behavior.initialGuardBps&&!has('pierce'))damage=damage*(10000n-N(behavior.initialGuardBps))/10000n;
  impactDamage=GameNumber.max(impactDamage,damage);const dealt=min(eh,damage);eh-=dealt;damageDealt+=dealt;hits++;heal(dealt*(N(input.leechBps)+(has('drain')?300n:0n))/10000n);
 }
 }
 if(!eh)return {playerHp:hp,enemyHp:eh,damageDealt,damageTaken:0n,rawDamage,impactDamage,hits,healed,turn,shield,events,outcome:'victory'};
 if(turn===1&&behavior.healOnceBps&&!has('silence')){const gain=min(enemyMax-eh,enemyMax*N(behavior.healOnceBps)/10000n);eh+=gain;enemyHealing+=gain;}
 if(input.mechanic==='regen'&&!has('silence')){const gain=min(enemyMax-eh,enemyMax*2n/100n);eh+=gain;enemyHealing+=gain;}
 let incoming=N(input.enemyAttack);
 if(behavior.attackCycleBps?.length)incoming=incoming*N(behavior.attackCycleBps[(turn-1)%behavior.attackCycleBps.length])/10000n;
 if(turn===1&&behavior.firstAttackBps!==undefined)incoming=incoming*N(behavior.firstAttackBps)/10000n;
 if(behavior.enrageBelowBps&&eh*10000n<=enemyMax*N(behavior.enrageBelowBps))incoming=incoming*N(behavior.enrageAttackBps)/10000n;const phase=(input.mechanic==='final'||input.mechanic==='hunger')&&eh<=enemyMax/2n;
 if(phase)incoming=incoming*140n/100n;if((input.mechanic==='charge'||phase)&&turn%3===0)incoming*=3n;
 if(input.mechanic==='mirror')incoming=incoming*(100n+min(10n,hits)*5n)/100n;
 if(['mirror','hunger','void'].includes(input.mechanic)&&turn>40)incoming*=BigInt(turn-39)**2n;
 const defense=modern?{flatDefense:input.flatDefense,reductionNumerator:10000n-min(6000n,N(input.totalReductionBps)+(turn<=Number(sc.openingWardTurns)?N(sc.openingWardBps):0n)),reductionDenominator:10000n}:{flatDefense:input.flatDefense,reductionNumerator:input.reductionNumerator,reductionDenominator:input.reductionDenominator,extraReductionBps:has('ward')?2000n:0n};
 const perHit=GrowthSystem.damageAfterDefense(incoming,defense),incomingHits=N(input.enemyHits)||(input.mechanic==='swarm'?3n:1n),retaliation=turn===1&&behavior.retaliateOnceBps?GrowthSystem.damageAfterDefense(N(input.enemyAttack)*N(behavior.retaliateOnceBps)/10000n,defense):0n,incomingTotal=perHit*incomingHits+retaliation,absorbed=min(shield,incomingTotal);shield-=absorbed;const damageTaken=min(hp,incomingTotal-absorbed);hp-=damageTaken;
 if(behavior.leechBps&&!has('silence')){const cap=enemyMax*N(behavior.leechCapBps??10000)/10000n,room=GameNumber.subtract(cap,priorLeech),gain=min(enemyMax-eh,min(room,damageTaken*N(behavior.leechBps)/10000n));eh+=gain;enemyLeechTotal+=gain;enemyHealing+=gain;}
 return {playerHp:hp,enemyHp:eh,damageDealt,damageTaken,rawDamage,impactDamage,hits,healed,turn,shield,phase,events,enemyLeechTotal,enemyHealing,outcome:hp===0n?'defeat':'ongoing'};
 }

 function roundsToWin(enemyHp,attack){enemyHp=GameNumber.from(enemyHp);attack=GameNumber.from(attack);return attack===0n?null:(enemyHp+attack-1n)/attack}
 // Uses the same event resolver as live combat, including phase continuity and enemy lifesteal.
 function predict(stats,enemy,{playerHp=stats.hp,limit=600,resolvePhase=null}={}){const N=GameNumber.from;let e=enemy,hp=N(playerHp),eh=N(e.hp),shield=N(stats.hp)*N(stats.shieldBps)/10000n,turn=0,leech=0n,r=null,phaseStart=0;const result=(r,turns)=>{let remainingHp=eh,next=e.phaseNext,seen=new Set();while(next&&resolvePhase&&!seen.has(next)){seen.add(next);const f=resolvePhase(next);if(!f)break;remainingHp+=N(f.hp);next=f.phaseNext;}return {...r,turns,phaseId:e.id,remainingHp};};for(let i=0;i<limit;i++){r=cumulative({...stats,playerHp:hp,playerAttack:stats.attack,maxHp:stats.hp,enemyHp:eh,enemyMax:N(e.hp),enemyAttack:N(e.attack),enemyHits:e.hits||1,mechanic:e.mechanic,enemyBehavior:e.behavior,enemyLeechTotal:leech,turn,shield});hp=r.playerHp;eh=r.enemyHp;shield=r.shield;turn=r.turn;leech=r.enemyLeechTotal||0n;if(r.outcome==='victory'&&e.phaseNext&&resolvePhase){const next=resolvePhase(e.phaseNext);if(!next)return result({...r,outcome:'ongoing'},i+1);e=next;eh=N(e.hp);leech=0n;phaseStart=turn;if(!stats.combatRulesRevision)turn=0;r={...r,enemyHp:eh,outcome:'ongoing'};continue;}if(r.outcome!=='ongoing')return result(r,i+1);if(e.turnLimit&&turn-phaseStart>=e.turnLimit)return result({...r,outcome:'withdrew'},i+1);}return result({...r,outcome:r?.outcome||'ongoing'},limit);}
 function damageCeiling(p){if(p.combatRulesRevision){const N=GameNumber.from,A=N(p.attack),sc=p.skillCombat||{};let ceiling=0n;for(let t=1;t<=600;t++){const periodic=[...(sc.periodicAttacks||[]),...(p.periodics||[])].reduce((sum,v)=>sum+(t%Number(v.every)===0&&(!v.once||t===Number(v.every))?N(v.bps):0n),0n);ceiling=GameNumber.max(ceiling,A*(35000n+15000n+periodic+(t===1?N(sc.openingBps):0n))/10000n);}return ceiling;}const N=GameNumber.from,hits=N(p.hits)||1n,style=(p.abilities||[]).includes('sweep')?8000n:0n,state=GameNumber.max(p.fullBps,p.lowBps);let maximum=0n;for(let turn=1;turn<=600;turn++){let sum=0n;const periodic=(p.periodics||[]).reduce((a,b)=>a+(turn%b.every===0?N(b.bps):0n),0n);for(let hit=0n;hit<hits;hit++){const groups=[turn===1?N(p.firstBps):0n,periodic,state,N(p.comboBps)*GameNumber.min(10n,hit+1n)+style,N(p.rampBps)*BigInt(Math.min(10,turn-1)),N(p.executeBps)];let n=N(p.attack);for(const bonus of groups)n*=10000n+bonus;sum+=n/(10000n**BigInt(groups.length));}maximum=GameNumber.max(maximum,sum);}return maximum+N(p.attack)*30n/100n;}
 return Object.freeze({round,cumulative,roundsToWin,damageCeiling,predict});
})();

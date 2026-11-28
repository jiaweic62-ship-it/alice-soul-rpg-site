/* Shared typed effects; independent groups and defense residuals stay exact. */
const EffectSystem=(()=>{
 const N=GameNumber.from;
 const labels={attack:'基礎攻撃',attackBps:'攻撃加算',attackFactorBps:'攻撃独立倍率',hp:'基礎生命力',hpBps:'生命力加算',hpFactorBps:'生命力独立倍率',flatDefense:'基礎固定減傷',reductionBps:'割合減傷',hits:'攻撃回数',hasteBps:'攻撃速度',leechBps:'吸血',regenBps:'行動時回復',shieldBps:'開戦時の盾',firstBps:'初回行動の増傷',periodic:'周期増傷',rampBps:'蓄勢',fullBps:'生命力が満タンのときの増傷',lowBps:'生命力30%以下の増傷',comboBps:'連撃増傷',executeBps:'敵の生命力25%以下の増傷',income:'討伐G',incomeBps:'獲得G加算',overflowBps:'余剰回復の盾',overhealBps:'過量回復',killHealBps:'討伐時回復',endureOnce:'踏みとどまり',storeBps:'溜め返し',furnaceBps:'炉心の火',furnaceBurnBps:'炉心の火の代償'};
 // Chapter 1 zones (user 2026-10-26): skills, devour marks, and items in three groups (normal, independent, final).
 // Chapter 2 marks are their own zone (user 2026-11-03: 第二章刻印独立乘区): they add to each other, not to chapter 1 marks.
 const zones=[['attackBps','hpBps','スキル','スキル・命'],['originBps','hpOriginBps','道具・独立','道具・独立・命'],['resonanceBps','hpResonanceBps','喰らい','喰らい・命'],['markBps','hpMarkBps','喰らい・二','喰らい・二・命'],['relicBps','hpRelicBps','道具','道具・命'],['crownBps','hpCrownBps','道具・終','道具・終・命']];
 const zoneKeys=new Set(zones.flatMap(z=>z.slice(0,2)));for(const [a,h,an,hn]of zones){labels[a]=an;labels[h]=hn;}
 const additive=['originBps','hpOriginBps','resonanceBps','hpResonanceBps','markBps','hpMarkBps','relicBps','hpRelicBps','crownBps','hpCrownBps','attack','attackBps','hp','hpBps','flatDefense','hits','hasteBps','leechBps','regenBps','shieldBps','firstBps','rampBps','fullBps','lowBps','comboBps','executeBps','income','incomeBps','overflowBps','killHealBps','overhealBps','endureOnce','storeBps','furnaceBps','furnaceBurnBps'];
 function fresh(){return {...Object.fromEntries(additive.map(k=>[k,0n])),totalReductionBps:0n,attackNumerator:1n,attackDenominator:1n,hpNumerator:1n,hpDenominator:1n,reductionNumerator:1n,reductionDenominator:1n,periodics:[]}}
 function add(out,e={},count=1n){count=N(count);for(const k of additive)out[k]+=N(e[k])*count;for(const key of ['attack','hp'])if(e[key+'FactorBps']){out[key+'Numerator']*=10000n+N(e[key+'FactorBps'])*count;out[key+'Denominator']*=10000n}if(e.reductionBps){out.totalReductionBps+=N(e.reductionBps)*count;out.reductionNumerator*=(10000n-GameNumber.min(e.reductionBps,9999n))**count;out.reductionDenominator*=10000n**count}if(e.periodic&&count>0n)out.periodics.push({every:Math.max(1,Math.floor(e.periodic.every)),bps:N(e.periodic.bps)*count});return out}
 function merge(a,b){const out=fresh();for(const k of additive)out[k]=N(a[k])+N(b[k]);for(const k of ['attack','hp','reduction']){out[k+'Numerator']=N(a[k+'Numerator']||1n)*N(b[k+'Numerator']||1n);out[k+'Denominator']=N(a[k+'Denominator']||1n)*N(b[k+'Denominator']||1n)}out.periodics=[...(a.periodics||[]),...(b.periodics||[])];return out}
 function ratio(bps){const n=10000n+N(bps),whole=n/10000n,fraction=(n%10000n).toString().padStart(4,'0').replace(/0+$/,'');return GameNumber.format(whole)+(fraction&&whole<10000n?'.'+fraction:'');}
 function permanent(base,e,hp=false){let numerator=N(base);for(const z of zones)numerator*=10000n+N(e[z[hp?1:0]]);return numerator/(10000n**BigInt(zones.length));}
 function percent(v){const n=N(v);return n>=1000000n?GameNumber.format(n/100n):String(Number(n)/100);}
 // Plain player-facing sentences (no formula groups): what an effect does. Every multiplier and percentage shows its
 // percentage (user 2026-10-25: 乘算虽然不写明是哪个区，但是百分比要写进文本); which group it multiplies in is not named.
 // Item groups each have one fixed name (user 2026-11-05): normal「攻撃力 / 生命力」, independent「攻撃倍率 / 生命力倍率」,
 // final「最終攻撃力 / 最終生命力」 (no「生命力」in these lines). Skills and soul zones use the normal names.
 const stage={originBps:'攻撃倍率',hpOriginBps:'生命力倍率',crownBps:'最終攻撃力',hpCrownBps:'最終生命力'};for(const k of zoneKeys)stage[k]??=(zones.some(z=>z[0]===k)?'攻撃力':'生命力');
 function plain(e={}){const out=[],once=t=>{if(!out.includes(t))out.push(t);},pc=v=>percent(v)+'%';
  for(const [k,v]of Object.entries(e)){if(!v||v==='0')continue;
   if(k==='attack')once('攻撃力 +'+GameNumber.format(v));else if(k==='hp')once('生命力 +'+GameNumber.format(v));
   else if(zoneKeys.has(k))once(stage[k]+' +'+pc(v));
   else if(k==='attackFactorBps')once('攻撃力 +'+pc(v));else if(k==='hpFactorBps')once('生命力 +'+pc(v));
   else if(k==='reductionBps')once('受けるダメージ −'+pc(v));else if(k==='hits')once('1回の行動で攻撃 +'+v+'回');
   else if(k==='hasteBps')once('行動が速くなる（+'+pc(v)+'）');else if(k==='leechBps')once('与えたダメージの'+pc(v)+'を吸収する');
   else if(k==='regenBps')once('行動するたびに最大生命力の'+pc(v)+'を回復する');else if(k==='shieldBps')once('戦いの始めに最大生命力の'+pc(v)+'の盾を張る');
   else if(k==='killHealBps')once('敵を倒すと最大生命力の'+pc(v)+'を回復する');else if(k==='overflowBps')once('あふれた回復の'+pc(v)+'を盾にする');else if(k==='overhealBps')once('休むと、最大生命力を'+pc(v)+'こえて回復する');
   else if(k==='endureOnce')once('戦いごとに一度だけ、倒れるはずの攻撃を生命力1で耐える');else if(k==='storeBps')once('受けたダメージの'+pc(v)+'を溜め、次の攻撃でまとめて返す');else if(k==='furnaceBps')once('攻撃のたびに攻撃力の'+pc(v)+'で追加攻撃し、そのあと最大生命力の'+pc(e.furnaceBurnBps||0)+'を失う（生命力は1残る）');
   else if(k==='firstBps')once('最初の'+(e.firstTurns||1)+'ターン、通常攻撃のダメージ +'+pc(v));else if(k==='fullBps')once('生命力が満タンのとき、与えるダメージ +'+pc(v));
   else if(k==='lowBps')once('生命力が30%以下のとき、与えるダメージ +'+pc(v));else if(k==='executeBps')once('敵の生命力が25%以下のとき、与えるダメージ +'+pc(v));
   else if(k==='comboBps')once('通常攻撃後の追加攻撃に、攻撃力の'+pc(v)+'を加える（道具分は最大50%）');else if(k==='rampBps')once('経過ターンごとに通常攻撃 +'+pc(v)+(e.rampMaxBps?'、最大 +'+pc(e.rampMaxBps):'（10段階まで）'));
   else if(k==='openingBps')once('戦闘開始時、攻撃力の'+pc(v)+'で1回攻撃する');else if(k==='periodicAttack')once(v.every+'ターン'+(v.once?'目に1度':'ごとに')+'、攻撃力の'+pc(v.bps)+'で追加攻撃する');else if(k==='extraStrikeBps')once('通常攻撃の後、攻撃力の'+pc(v)+'で1回追加攻撃する');else if(k==='currentHpCutBps')once(e.currentHpCutTurn+'ターン目、敵の現在生命力を'+pc(v)+'削る（とどめ不可）');else if(k==='openingWardBps')once('最初の'+e.openingWardTurns+'ターン、受けるダメージ −'+pc(v));else if(/ChestBonus$/.test(k))once((k==='forestChestBonus'?'村はずれの森':k==='mineChestBonus'?'旧用水路':k==='academyChestBonus'?'魔法学院':(typeof RPGCatalog!=='undefined'&&RPGCatalog.dungeons[k.slice(0,-10)]?.name)||'')+'の宝箱を落とす敵の討伐時、宝箱 +'+v);else if(k==='battleSpeedBps')once('戦闘速度 ×'+ratio(v)+'（敵と味方の両方）');else if(k==='periodic')once(v.every+'ターンごとに、攻撃力の'+pc(v.bps)+'で追加攻撃する');else if(k==='income')once('手に入るG +'+GameNumber.format(v));else if(k==='incomeBps')once('手に入るG +'+pc(v));}
  return out;}
 function describe(e){return plain(e).join('／');}
 return {labels,additive,zones,ratio,permanent,fresh,add,merge,describe,plain};
})();

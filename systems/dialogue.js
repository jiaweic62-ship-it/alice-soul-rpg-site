/* Every speaking character has a genuine expression tile. Narration/offscreen voices are faceless. */
const DialogueSystem=(()=>{
 const labels={neutral:'平静',smile:'微笑み',concerned:'警戒',thoughtful:'思案',surprised:'驚き',angry:'怒り',fear:'怯え',pain:'苦痛'};
 const smugPortraits=new Set(["alice", "rina", "noa", "violet", "eva", "lilia", "charlotte", "erna", "kohaku", "milka", "rize", "mirei", "fiona", "lucy", "marina", "safira", "nerine", "perla", "celia", "celia_cursed", "lisette", "nemuria", "vermilia", "velouria", "odette", "tessa", "riola", "iris", "rouge", "yustina", "colette"]);
 const positions={neutral:[0,0],smile:[1,0],thoughtful:[0,1],surprised:[1,1],angry:[0,2],concerned:[1,2],fear:[0,3],pain:[1,3]};
 const npcs={receptionist:{name:'受付係',expressions:{src:'assets/receptionist-expressions-v24.webp',columns:2,rows:4,positions}},blacksmith:{name:'鍛冶師',expressions:{src:'assets/blacksmith-expressions-v24.webp',columns:2,rows:4,positions}},berta:{name:'ベルタ'},iris_tech:{name:'イリス'},yustina:{name:'ユスティナ'},colette:{name:'コレット'}};
 function face(line){
  const cue=line?.[2],d=cue?.npcId?npcs[cue.npcId]:CharacterSystem.definition(cue?.characterId);
  if(!d)return null;
  const atlas=PortraitAtlas[cue?.portraitId||cue?.npcId||d.id];if(!atlas)return null;
  const expression=atlas.frames[cue.expression]?cue.expression:'neutral',[x,y,w,h]=atlas.frames[expression];
  const label=expression==='smile'&&smugPortraits.has(cue?.portraitId||cue?.npcId||d.id)?'得意':labels[expression];
  // CSS background percentages use the remaining distance, not the image width.
  // Both axes come from the same reviewed pixel rectangle at every display size.
  return {src:atlas.src,position:(x/(atlas.width-w)*100)+'% '+(y/(atlas.height-h)*100)+'%',size:(atlas.width/w*100)+'% '+(atlas.height/h*100)+'%',rect:[x,y,w,h],sourceSize:[atlas.width,atlas.height],alt:d.name+'・'+label,label};
 }
 function appearance(lines,fallback='alice'){const explicit=lines.find(line=>line[0]?.startsWith('アリス／')&&CharacterSystem.definition(line[2]?.characterId));return explicit?.[2].characterId||fallback}
 function line(original,appearanceId){const d=CharacterSystem.definition(original?.[2]?.transformedAppearance||appearanceId);if(!d||!(original[0]==='アリス'||original[0]?.startsWith('アリス／')))return original;return [d.id==='alice'?'アリス':'アリス／'+d.name,original[1],{...original[2],characterId:d.id}]}
 function paint(element,face){if(globalThis.GameAssets)GameAssets.background(element,face?.src);else element.style.backgroundImage=face?'url("'+face.src+'")':'none';element.style.backgroundPosition=face?.position||'center';element.style.backgroundSize=face?.size||'cover';element.style.backgroundOrigin='border-box';element.style.backgroundRepeat='no-repeat';element.setAttribute('aria-label',face?.alt||'')}
 return Object.freeze({face,appearance,line,paint});
})();

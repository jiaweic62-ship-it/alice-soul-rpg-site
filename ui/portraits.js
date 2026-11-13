/* Native single-click / single-tap viewer. It never changes game state. */
const PortraitViewer=(()=>{
 const sources=new WeakMap();let dialog=null;
 function open(picture){
  if(!picture?.src||!dialog||dialog.open||document.hidden)return;
  const full=document.getElementById('portraitZoomImage'),face=document.getElementById('portraitZoomExpression');
  full.hidden=!!picture.size;face.hidden=!picture.size;
  face.style.aspectRatio=picture.aspect||1;face.style.width=picture.aspect?'min('+88*picture.aspect+'dvh,calc(100vw - 48px))':'';
  if(picture.size){full.removeAttribute('src');DialogueSystem.paint(face,picture)}
  else{if(globalThis.GameAssets)GameAssets.image(full,picture.src);else full.src=picture.src;full.alt=picture.alt||'';DialogueSystem.paint(face,null)}
  dialog.setAttribute('aria-label',picture.alt||'イラスト');dialog.showModal();
 }
 function close(){if(dialog?.open)dialog.close();if(globalThis.GameAssets)GameAssets.image(document.getElementById('portraitZoomImage'),null);document.getElementById('portraitZoomImage').removeAttribute('src');DialogueSystem.paint(document.getElementById('portraitZoomExpression'),null)}
 function bind(element,source){
  sources.set(element,typeof source==='function'?source:()=>source);
  element.setAttribute('data-portrait','');element.setAttribute('draggable','false');element.setAttribute('role','button');element.setAttribute('tabindex','0');
  for(const img of element.querySelectorAll?.('img')||[])img.setAttribute('draggable','false');
  // Bind to the visible element itself. Native clicks handle mouse, taps and
  // browser gesture cancellation; no timers or synthetic touch-click suppression.
  element.onclick=e=>{if(e?.button>0)return;const picture=sources.get(element)?.();if(!picture?.src)return;e?.preventDefault?.();e?.stopPropagation?.();open(picture)};
  element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(sources.get(element)?.())}};
  element.oncontextmenu=e=>e.preventDefault();
 }
 function init(){
  dialog=document.getElementById('portraitZoom');document.getElementById('portraitZoomClose').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
  dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
 }
 return Object.freeze({bind,init});
})();

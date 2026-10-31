/* Browser-local content-addressed resources. No game save or authentication data enters this cache. */
(()=>{
 const entries=globalThis.GAME_ASSET_INDEX||{},cacheName='alice-resources-v1',base=new URL('.',location.href),pending=new Map(),objects=new Map(),resolved=new Map(),listeners=new Set(),tokens=new WeakMap(),saved=new Set();let issue='',cancelBulk=false,bulkRunning=false;
 const manifest=new Map(Object.entries(entries).map(([path,e])=>[path,{...e,path,key:new URL(path,base).href+'?h='+e.hash.slice(0,20)}]));
 const cachePromise=(async()=>{try{if(!globalThis.caches)throw Error('unavailable');const c=await caches.open(cacheName);const current=new Set([...manifest.values()].map(e=>e.key));for(const r of await c.keys())if(current.has(r.url))saved.add(r.url);return c;}catch{issue='このブラウザでは一時保存になります';return null;}})();
 function stats(){const images=[...manifest.values()].filter(e=>e.type==='image'),done=images.filter(e=>saved.has(e.key));return {total:images.length,saved:done.length,bytes:done.reduce((n,e)=>n+e.bytes,0),totalBytes:images.reduce((n,e)=>n+e.bytes,0),issue,running:bulkRunning};}
 function emit(){for(const fn of listeners)fn(stats());}
 cachePromise.then(emit);
 function entry(path){return manifest.get(path);}
 async function verify(response,e){if(!response.ok)throw Error('resource unavailable');const type=response.headers.get('content-type')||'';if(type.includes('text/html'))throw Error('sign-in response');const bytes=await response.arrayBuffer();if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==e.hash)throw Error('resource changed '+e.path);}else if(bytes.byteLength!==e.bytes)throw Error('resource changed '+e.path);return new Response(bytes,{status:200,headers:{'content-type':e.type==='image'?(type.startsWith('image/')?type:/\.png$/.test(e.path)?'image/png':/\.gif$/.test(e.path)?'image/gif':/\.jpe?g$/.test(e.path)?'image/jpeg':'image/webp'):'text/javascript;charset=utf-8'}});}
 async function response(path){const e=entry(path);if(!e)throw Error('unknown resource');const c=await cachePromise;if(c){try{const hit=await c.match(e.key);if(hit){saved.add(e.key);return hit;}}catch{}}
  if(pending.has(e.key))return (await pending.get(e.key)).clone();
  const request=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);try{let result;try{result=await verify(await fetch(e.key,{credentials:'same-origin',cache:'force-cache',signal:controller.signal}),e);}catch(error){if(!error.message?.includes('resource changed'))throw error;result=await verify(await fetch(e.key,{credentials:'same-origin',cache:'reload',signal:controller.signal}),e);}if(c)try{await c.put(e.key,result.clone());saved.add(e.key);}catch{issue='保存容量が不足しています。未保存の画像は通信で表示します';}emit();return result;}finally{clearTimeout(timer);}})();pending.set(e.key,request);try{return (await request).clone();}finally{pending.delete(e.key);}
 }
 try{navigator.serviceWorker?.register?.(new URL('asset-worker.js',base).href,{scope:base.pathname}).catch(()=>{});}catch{}
 async function url(path){const src=await locate(path);if(entry(path))resolved.set(path,src);return src;}
 async function locate(path){const e=entry(path);if(!e)return path;if(objects.has(e.key))return objects.get(e.key);const result=await response(path);if(saved.has(e.key)&&navigator.serviceWorker?.controller?.scriptURL?.split('?')[0].endsWith('/asset-worker.js'))return e.key;const blob=await result.blob();if(!objects.has(e.key))objects.set(e.key,URL.createObjectURL(blob));return objects.get(e.key);}
 // Download, verify and decode before a scene opens. Keep a small decoded-image LRU for mobile memory.
 const decoded=new Map(),warming=new Map();
 async function readyImage(path){
  if(!entry(path)||entry(path).type!=='image')throw Error('unknown image '+path);
  if(decoded.has(path)){const image=decoded.get(path);decoded.delete(path);decoded.set(path,image);return;}
  if(warming.has(path))return warming.get(path);
  const job=(async()=>{const src=await url(path);if(typeof Image==='undefined')return;const image=new Image();image.decoding='async';const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('image unavailable '+path));});image.src=src;await loaded;if(image.decode)await image.decode();decoded.set(path,image);while(decoded.size>16)decoded.delete(decoded.keys().next().value);})();
  warming.set(path,job);try{await job;}finally{warming.delete(path);}
 }
 async function preload(paths){const list=[...new Set(paths.filter(Boolean))];let next=0;await Promise.all([0,1].map(async()=>{while(next<list.length)await readyImage(list[next++]);}));}
 function paint(element,path,background=false){if(!path){tokens.delete(element);if(background)element.style.backgroundImage='none';return;}
  // Artwork not yet uploaded must not show a broken-image icon: the final failed load hides the image but keeps its space.
  // An image already fetched once is painted at once: a new element for the same picture (each fight rebuilds its art)
  // must not dim and reload, which showed as the battle background flashing between fights.
  if(resolved.has(path)){tokens.delete(element);element.classList?.remove('asset-loading');if(background)element.style.backgroundImage='url("'+resolved.get(path)+'")';else{if(element.style)element.style.visibility='';element.onerror=null;element.src=resolved.get(path);}return;}
  const ticket={};tokens.set(element,ticket);element.classList?.add('asset-loading');if(!background&&element.style)element.style.visibility='';const hide=()=>{if(tokens.get(element)===ticket){element.onerror=null;if(element.style)element.style.visibility='hidden';}};
  url(path).then(src=>{if(tokens.get(element)!==ticket)return;if(background)element.style.backgroundImage='url("'+src+'")';else{element.src=src;element.onerror=()=>{if(tokens.get(element)===ticket){element.onerror=hide;element.src=entry(path)?.key||path;}};}element.classList?.remove('asset-loading');},()=>{if(tokens.get(element)!==ticket)return;const src=entry(path)?.key||path;if(background)element.style.backgroundImage='url("'+src+'")';else{element.onerror=hide;element.src=src;}element.classList?.remove('asset-loading');});
 }
 async function saveImages(){if(bulkRunning)return;if(!await cachePromise){emit();return;}issue='';cancelBulk=false;bulkRunning=true;emit();let failed=0;const list=[...manifest.values()].filter(e=>e.type==='image'&&!saved.has(e.key));let next=0;await Promise.all([0,1].map(async()=>{while(!cancelBulk&&next<list.length){const e=list[next++];try{await response(e.path);if(issue){cancelBulk=true;break;}}catch{failed++;}}}));bulkRunning=false;if(failed&&!issue)issue=failed+'件を保存できませんでした。もう一度お試しください';emit();}
 const bootNonce=document.currentScript?.nonce||'';
 function execute(text,path){return new Promise((resolve,reject)=>{let error=null;const capture=e=>{error=e.error||Error(e.message||'script error');};globalThis.addEventListener('error',capture);try{const script=document.createElement('script');if(bootNonce)script.nonce=bootNonce;script.textContent=text+'\n//# sourceURL='+new URL(path,base).href;document.body.append(script);script.remove();}catch(e){error=e;}finally{globalThis.removeEventListener('error',capture);}error?reject(error):resolve();});}
 globalThis.GameAssets={response,url,preload,image:(el,path)=>paint(el,path),background:(el,path)=>paint(el,path,true),text:async path=>(await response(path)).text(),execute,stats,subscribe(fn){listeners.add(fn);cachePromise.then(()=>fn(stats()));return ()=>listeners.delete(fn);},saveImages,cancel(){cancelBulk=true;},persist(){try{navigator.storage?.persist?.().catch(()=>{});}catch{}}};
})();

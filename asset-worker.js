/* Only content-addressed image files. Navigation, sign-in and API requests always use the network. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url),root=new URL('./',self.registration.scope);
 if(event.request.method!=='GET'||u.origin!==root.origin||!u.pathname.startsWith(root.pathname+'assets/')||!/^[a-f0-9]{20}$/.test(u.searchParams.get('h')||''))return;
 event.respondWith((async()=>{try{const cache=await caches.open('alice-resources-v1'),hit=await cache.match(event.request);if(hit)return hit;}catch{}return fetch(event.request);})());
});

// Minimal offline shell. Navigations are network-first so updates arrive;
// hashed bundles are cache-first. Cross-origin requests (the sealed pack on a
// Gist) are never cached here: the decrypted snapshot lives in app storage.
const CACHE='nus-study-shell-v1';
const scope=new URL(self.registration.scope);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll([scope.href,new URL('manifest.json',scope).href])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==scope.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(scope.href,copy));return response;}).catch(()=>caches.match(scope.href)));
    return;
  }
  if(url.pathname.includes('/_expo/static/')||/\.(png|ico|ttf|json)$/.test(url.pathname)){
    event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}return response;})));
  }
});

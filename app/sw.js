const C='structiar-89d76a031d';const SHELL=['./','vendor/supabase-2.45.4.js','icons/icon-192.png','manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  const lib=u.hostname==='cdnjs.cloudflare.com'||u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com';
  if(u.origin!==location.origin&&!lib)return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(C).then(c=>c.put('./',y));return x}).catch(()=>caches.match('./')));return}
  e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{if(x.ok||x.type==='opaque'){const y=x.clone();caches.open(C).then(c=>c.put(r,y))}return x})))});

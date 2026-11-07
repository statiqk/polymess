// Service worker : installation de l'appli + notifications (locales et Web Push).
// Pas de cache : l'appli se met à jour via version.json.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});

// Réception d'une notification envoyée par le serveur (même appli fermée)
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch(_){}
  e.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const ios=/iphone|ipad|ipod/i.test(self.navigator.userAgent);
    // Appli déjà à l'écran : elle affiche le message elle-même (sauf iPhone, qui exige une notification à chaque push)
    if(!ios&&list.some(c=>c.visibilityState==='visible'))return;
    await self.registration.showNotification(d.title||'PolyMess',{
      body:d.body||'',tag:d.tag,icon:'icon-192.png',badge:'icon-192.png',data:{id:d.conversation_id}
    });
  })());
});

// Clic sur une notification : ouvre la bonne conversation
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const id=e.notification.data&&e.notification.data.id;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){
      if('focus' in c){c.postMessage({type:'open',id});return c.focus()}
    }
    return self.clients.openWindow('./'+(id?'?c='+encodeURIComponent(id):''));
  }));
});

// Service worker : installation de l'appli + notifications (locales et Web Push).
// Pas de cache : l'appli se met à jour via version.json.
const PUSH_URL='https://qcogqpwjhtutxpyhrcld.supabase.co/functions/v1/push';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});

const setBadge=n=>{try{const nav=self.navigator;if(typeof n==='number'&&nav.setAppBadge)return (n>0?nav.setAppBadge(n):nav.clearAppBadge()).catch(()=>{})}catch(_){}};

// Réception d'une notification envoyée par le serveur (même appli fermée)
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch(_){}
  e.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const ios=/iphone|ipad|ipod/i.test(self.navigator.userAgent);
    // Appli déjà à l'écran : elle affiche le message elle-même (sauf iPhone, qui exige une notification à chaque push)
    if(!ios&&d.kind!=='test'&&list.some(c=>c.visibilityState==='visible'))return;
    // Une notification par message (elles s'empilent) ; tag unique pour qu'aucune n'en remplace une autre
    // Conversation déjà ouverte sous les yeux : sur iPhone la notification est obligatoire, on la rend discrète (silencieuse) puis on la referme aussitôt
    let seen=false;
    if(ios&&d.kind==='msg'&&d.cid){
      for(const c of list){
        if(c.visibilityState!=='visible')continue;
        const r=await new Promise(ok=>{const ch=new MessageChannel();const t=setTimeout(()=>ok(null),500);ch.port1.onmessage=ev=>{clearTimeout(t);ok(ev.data)};try{c.postMessage({type:'whereami'},[ch.port2])}catch(_){clearTimeout(t);ok(null)}});
        if(r&&r.visible&&r.cid===d.cid){seen=true;break}
      }
    }
    const title=d.title||'PolyMess',body=d.body||'';
    const tag=d.tag?d.tag+'|'+Date.now():undefined;
    const opts={body,tag,icon:'icon-192.png?v=3',badge:'badge-96.png',vibrate:[120,60,120],timestamp:Date.now(),
      data:{cid:d.cid,name:d.title,req:!!d.req}};
    if(seen){opts.silent=true;opts.vibrate=undefined}
    if(d.image&&!seen)opts.image=d.image;
    if(d.kind==='msg')opts.actions=[{action:'reply',title:'Répondre',type:'text',placeholder:'Ta réponse…'},{action:'read',title:'Marquer comme lu'}];
    await self.registration.showNotification(title,opts);
    if(seen){await new Promise(r=>setTimeout(r,700));try{(await self.registration.getNotifications({tag})).forEach(n=>n.close())}catch(_){}}
    setBadge(d.badge);
  })());
});

// Clic sur une notification : ouvre la bonne conversation, ou exécute l'action choisie
self.addEventListener('notificationclick',e=>{
  const n=e.notification,d=n.data||{};
  n.close();
  const closeAll=async()=>{if(!d.cid)return;try{(await self.registration.getNotifications()).forEach(x=>{if(x.data&&x.data.cid===d.cid)x.close()})}catch(_){}};
  e.waitUntil((async()=>{
    await closeAll();
    const sub=await self.registration.pushManager.getSubscription().catch(()=>null);
    const call=b=>fetch(PUSH_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub&&sub.endpoint,...b})}).then(r=>r.json()).catch(()=>null);
    if(e.action==='read'&&d.cid){const r=await call({action:'read',cid:d.cid});if(r)setBadge(r.unread);return}
    if(e.action==='reply'&&d.cid&&e.reply){const r=await call({action:'reply',cid:d.cid,text:e.reply});if(r)setBadge(r.unread);return}
    const focus=e.action==='reply'; // navigateur sans champ de réponse : on ouvre la conversation, clavier prêt
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of list){
      if('focus' in c){c.postMessage({type:'open',id:d.cid,focus,req:d.req});return c.focus()}
    }
    return self.clients.openWindow('./'+(d.req?'?req=1':d.cid?'?c='+encodeURIComponent(d.cid)+(focus?'&reply=1':''):''));
  })());
});

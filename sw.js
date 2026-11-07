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
    let title=d.title||'PolyMess',body=d.body||'',msgs=null;
    // Plusieurs messages d'une même conversation : on les regroupe dans une seule notification
    if(d.kind==='msg'&&d.tag){
      const ex=(await self.registration.getNotifications({tag:d.tag}))[0];
      msgs=(((ex&&ex.data&&ex.data.msgs)||[]).concat(d.body||'')).slice(-5);
      if(msgs.length>1){title=`${d.title} · ${msgs.length} messages`;body=msgs.join('\n')}
    }
    const opts={body,tag:d.tag,renotify:!!d.tag,icon:'icon-192.png?v=2',badge:'badge-96.png',vibrate:[120,60,120],timestamp:Date.now(),
      data:{cid:d.cid,msgs,name:d.title}};
    if(d.image)opts.image=d.image;
    if(d.kind==='msg')opts.actions=[{action:'reply',title:'Répondre',type:'text',placeholder:'Ta réponse…'},{action:'read',title:'Marquer comme lu'}];
    await self.registration.showNotification(title,opts);
    setBadge(d.badge);
  })());
});

// Clic sur une notification : ouvre la bonne conversation, ou exécute l'action choisie
self.addEventListener('notificationclick',e=>{
  const n=e.notification,d=n.data||{};
  n.close();
  e.waitUntil((async()=>{
    const sub=await self.registration.pushManager.getSubscription().catch(()=>null);
    const call=b=>fetch(PUSH_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub&&sub.endpoint,...b})}).then(r=>r.json()).catch(()=>null);
    if(e.action==='read'&&d.cid){const r=await call({action:'read',cid:d.cid});if(r)setBadge(r.unread);return}
    if(e.action==='reply'&&d.cid&&e.reply){const r=await call({action:'reply',cid:d.cid,text:e.reply});if(r)setBadge(r.unread);return}
    const focus=e.action==='reply'; // navigateur sans champ de réponse : on ouvre la conversation, clavier prêt
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of list){
      if('focus' in c){c.postMessage({type:'open',id:d.cid,focus});return c.focus()}
    }
    return self.clients.openWindow('./'+(d.cid?'?c='+encodeURIComponent(d.cid)+(focus?'&reply=1':''):''));
  })());
});

/* Mini Arcade — backend-free Telegram turn-based multiplayer transport.
   Telegram carries compact signed-by-checksum snapshots in startapp links.
   This is deliberately casual multiplayer: legality and revision chains are
   verified client-side, but without an authoritative server a modified client
   can still cheat. */
(function (global) {
  'use strict';
  var C = global.Chogan;
  if (!C) return;
  var T = global.MiniArcadeTMA || null;
  var CFG = global.MINI_ARCADE_CONFIG || {};
  var SESSION_KEY = 'miniarcade.mp.incoming.v1';
  var STORE = C.storage('multiplayer');
  var ALLOWED = { chess:1, reversi:1, mancala:1, dots:1, morris:1, backgammon:1 };

  C.strings({
    en: {
      tgFriend: 'Telegram friend', mpYou: 'You', mpWaiting: 'Waiting for {n}', mpYourTurn: 'Your turn',
      mpOpening: 'Make the first move, then send it to your friend.', mpSendMove: 'Send move',
      mpSendChallenge: 'Send challenge', mpJoined: 'Joined {n}', mpSpectator: 'Spectator mode',
      mpConfigTitle: 'Telegram multiplayer setup', mpConfigBody: 'Set botUsername in www/config.js before deployment so challenge links can reopen this Mini App.',
      mpBadLink: 'This multiplayer link is invalid or damaged.', mpWrongGame: 'This link belongs to another game.',
      mpStale: 'That move was already applied.', mpChain: 'This update does not continue your saved match.',
      mpOtherPlayer: 'This match already belongs to two other players.', mpSendHint: 'Send this update through Telegram if live play is unavailable.',
      mpMatch: 'Friend match', mpLive: 'Live', mpConnecting: 'Connecting live…', mpReconnecting: 'Reconnecting…', mpOffline: 'Live unavailable', mpFallback: 'Send via Telegram', mpInvite: 'Invite friend', mpPeerLeft: 'Opponent disconnected',
      mpMatchReady: 'Live connection ready', mpLeave: 'Leave match', mpLeaveAsk: 'Leave this friend match and start a normal game?'
    },
    fa: { tgFriend:'دوست تلگرامی', mpYou:'تو', mpWaiting:'منتظر {n}', mpYourTurn:'نوبت توست', mpOpening:'حرکت اول را انجام بده و بعد برای دوستت بفرست.', mpSendMove:'فرستادن حرکت', mpSendChallenge:'فرستادن دعوت', mpJoined:'پیوستی به {n}', mpSpectator:'حالت تماشاچی', mpConfigTitle:'تنظیم چندنفره تلگرام', mpConfigBody:'پیش از انتشار، botUsername را در www/config.js تنظیم کن تا لینک بازی دوباره همین مینی‌اپ را باز کند.', mpBadLink:'این لینک بازی خراب یا نامعتبر است.', mpWrongGame:'این لینک برای بازی دیگری است.', mpStale:'این حرکت قبلاً اعمال شده.', mpChain:'این به‌روزرسانی ادامه‌ی مسابقه‌ی ذخیره‌شده نیست.', mpOtherPlayer:'این مسابقه از قبل دو بازیکن دیگر دارد.', mpSendHint:'تلگرام برای هر حرکت باید مقصد را از تو بپرسد؛ سروری در کار نیست.', mpMatch:'مسابقه تلگرامی', mpLeave:'خروج از مسابقه', mpLeaveAsk:'از این مسابقه تلگرامی خارج شوی و بازی عادی شروع کنی؟' },
    zh: { tgFriend:'Telegram 好友', mpYou:'你', mpWaiting:'等待 {n}', mpYourTurn:'轮到你', mpOpening:'先走第一步，然后发给好友。', mpSendMove:'发送这一步', mpSendChallenge:'发送挑战', mpJoined:'已加入 {n}', mpSpectator:'观战模式', mpConfigTitle:'Telegram 多人设置', mpConfigBody:'部署前请在 www/config.js 中设置 botUsername，这样挑战链接才能重新打开此小程序。', mpBadLink:'多人链接无效或已损坏。', mpWrongGame:'此链接属于其他游戏。', mpStale:'这一步已经应用过了。', mpChain:'此更新无法接上你保存的对局。', mpOtherPlayer:'此对局已经有两名其他玩家。', mpSendHint:'由于没有后端，每一步都需要 Telegram 让你选择发送对象。', mpMatch:'Telegram 对局', mpLeave:'离开对局', mpLeaveAsk:'离开此 Telegram 对局并开始普通游戏？' },
    de: { tgFriend:'Telegram-Freund', mpYou:'Du', mpWaiting:'Warte auf {n}', mpYourTurn:'Du bist dran', mpOpening:'Mach den ersten Zug und sende ihn dann an deinen Freund.', mpSendMove:'Zug senden', mpSendChallenge:'Herausforderung senden', mpJoined:'Beigetreten: {n}', mpSpectator:'Zuschauermodus', mpConfigTitle:'Telegram-Mehrspieler einrichten', mpConfigBody:'Setze vor der Veröffentlichung botUsername in www/config.js, damit Spiellinks diese Mini App wieder öffnen.', mpBadLink:'Dieser Mehrspieler-Link ist ungültig oder beschädigt.', mpWrongGame:'Dieser Link gehört zu einem anderen Spiel.', mpStale:'Dieser Zug wurde bereits übernommen.', mpChain:'Dieses Update setzt dein gespeichertes Match nicht fort.', mpOtherPlayer:'Dieses Match gehört bereits zwei anderen Spielern.', mpSendHint:'Ohne Backend muss Telegram bei jedem Zug fragen, wohin er gesendet werden soll.', mpMatch:'Telegram-Match', mpLeave:'Match verlassen', mpLeaveAsk:'Dieses Telegram-Match verlassen und ein normales Spiel starten?' }
  });

  function b64u(s) {
    var bytes = new TextEncoder().encode(s), bin = '';
    for (var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function unb64u(s) {
    s = String(s||'').replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function(k){ return JSON.stringify(k)+':'+stable(v[k]); }).join(',') + '}';
  }
  function hash(s) { return (C.hash32(String(s)) >>> 0).toString(36).padStart(7,'0').slice(-7); }

  var GC={chess:'c',reversi:'r',mancala:'m',dots:'d',morris:'o',backgammon:'b'}, CG={c:'chess',r:'reversi',m:'mancala',d:'dots',o:'morris',b:'backgammon'};
  function compactEnv(e){ return [GC[e.g]||e.g,e.i,e.q,e.a||0,e.b||0,e.u||0,e.t,e.s,e.m==null?0:e.m,e.p||0,e.x||0,e.l||0]; }
  function expandEnv(a){
    if(!Array.isArray(a)||a.length<8)return null;
    var g=CG[a[0]]||a[0];
    return {v:1,g:g,i:a[1],q:+a[2],a:a[3]||null,b:a[4]||null,u:a[5]||[1,2],t:a[6],s:a[7],m:a[8]===0?null:a[8],p:a[9]===0?'':a[9],x:a[10]===0?null:a[10],l:a[11]===0||a[11]==null?'':a[11]};
  }
  function bytesB64u(bytes){ var bin=''; for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function b64uBytes(s){ s=String(s||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var bin=atob(s),o=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)o[i]=bin.charCodeAt(i);return o; }

  // Small synchronous LZSS codec. startapp is length-limited in Telegram clients,
  // so every move must stay compact without waiting for an async CompressionStream.
  function lzPack(input){
    var out=[], pos=0, dict=new Map();
    function k3(i){return i+2<input.length?((input[i]<<16)|(input[i+1]<<8)|input[i+2]):-1;}
    function remember(i){var k=k3(i);if(k<0)return;var a=dict.get(k)||[];a.push(i);while(a.length>24)a.shift();dict.set(k,a);}
    while(pos<input.length){
      var ci=out.length;out.push(0);var ctrl=0;
      for(var bit=0;bit<8&&pos<input.length;bit++){
        var bestL=0,bestD=0,key=k3(pos),cand=key<0?null:dict.get(key);
        if(cand){for(var z=cand.length-1;z>=0;z--){var at=cand[z],dist=pos-at;if(dist<1||dist>4096)continue;var L=0;while(L<18&&pos+L<input.length&&input[at+L]===input[pos+L])L++;if(L>bestL&&L>=3){bestL=L;bestD=dist;if(L===18)break;}}}
        if(bestL>=3){ctrl|=(1<<bit);var d=bestD-1;out.push(((bestL-3)<<4)|((d>>8)&15),d&255);for(var j=0;j<bestL;j++){remember(pos);pos++;}}
        else{out.push(input[pos]);remember(pos);pos++;}
      }
      out[ci]=ctrl;
    }
    return new Uint8Array(out);
  }
  function lzUnpack(input){
    var out=[],pos=0;
    while(pos<input.length){var ctrl=input[pos++];for(var bit=0;bit<8&&pos<input.length;bit++){
      if(ctrl&(1<<bit)){if(pos+1>=input.length)throw new Error('bad lz');var a=input[pos++],b=input[pos++],L=(a>>4)+3,d=((a&15)<<8|b)+1;if(d>out.length)throw new Error('bad lz distance');for(var j=0;j<L;j++)out.push(out[out.length-d]);}
      else out.push(input[pos++]);
      if(out.length>65536)throw new Error('lz too large');
    }}
    return new Uint8Array(out);
  }
  function encode(env) {
    var raw=JSON.stringify(compactEnv(env)), sum=hash(raw), bytes=new TextEncoder().encode(raw), packed=lzPack(bytes), use=packed.length+1<bytes.length;
    return 'ma2'+sum+(use?'c':'r')+'_'+bytesB64u(use?packed:bytes);
  }
  function decode(token) {
    try {
      token=String(token||'');
      if(token.slice(0,3)==='ma2'){
        if(token.length<14||token.charAt(11)!=='_')return null;
        var sum2=token.slice(3,10),flag=token.charAt(10),bytes=b64uBytes(token.slice(12));
        if(flag==='c')bytes=lzUnpack(bytes);else if(flag!=='r')return null;
        var raw2=new TextDecoder().decode(bytes);if(hash(raw2)!==sum2)return null;
        var env2=expandEnv(JSON.parse(raw2));if(!env2||!ALLOWED[env2.g]||!env2.i||!Number.isFinite(env2.q))return null;env2._sig=sum2;return env2;
      }
      if (token.slice(0,3)!=='ma1' || token.length < 13 || token.charAt(10)!=='_') return null;
      var sum=token.slice(3,10), raw=unb64u(token.slice(11));
      if (hash(raw)!==sum) return null;
      var env=JSON.parse(raw);
      if (!env || env.v!==1 || !ALLOWED[env.g] || !env.i || typeof env.q!=='number') return null;
      env._sig=sum;
      return env;
    } catch(e) { return null; }
  }
  function randomId() {
    var a=new Uint8Array(8); try { crypto.getRandomValues(a); } catch(e){ for(var i=0;i<a.length;i++)a[i]=(Math.random()*256)|0; }
    var s=''; for(var j=0;j<a.length;j++)s+=a[j].toString(36).padStart(2,'0'); return s.slice(0,14);
  }
  function randomSecret() {
    var a=new Uint8Array(16); try { crypto.getRandomValues(a); } catch(e){ for(var i=0;i<a.length;i++)a[i]=(Math.random()*256)|0; }
    return bytesB64u(a);
  }
  function shortName(v) {
    var chars=Array.from(String(v||'')),out='';
    for(var i=0;i<chars.length;i++){var next=out+chars[i];if(new TextEncoder().encode(next).length>18)break;out=next;}
    return out||C.t('mpYou');
  }
  function ident() {
    var p=C.state.profile||{};
    return [String(p.telegramId||p.uid||''), shortName(p.telegramName||p.name||C.t('mpYou'))];
  }
  function sameId(a,b){ return !!(a && b && String(a[0]) && String(a[0])===String(b[0])); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function key(g,id){ return g+'.'+id; }
  function save(m){ if(m&&m.g&&m.i){ STORE.set(key(m.g,m.i),m); STORE.set('active.'+m.g,m.i); } return m; }
  function load(g,id){ return STORE.get(key(g,id),null); }
  function active(g){ var id=STORE.get('active.'+g,''); return id?load(g,id):null; }
  function drop(g,id){ STORE.remove(key(g,id)); if(STORE.get('active.'+g,'')===id) STORE.remove('active.'+g); }
  function clearActive(g){ STORE.remove('active.'+g); }
  function saveDraft(g,id,d){ if(id) STORE.set('draft.'+g+'.'+id,d); }
  function loadDraft(g,id){ return id?STORE.get('draft.'+g+'.'+id,null):null; }
  function clearDraft(g,id){ if(id) STORE.remove('draft.'+g+'.'+id); }

  function startParam() {
    var p='';
    try { p = (T && T.telegram && T.telegram.initDataUnsafe && T.telegram.initDataUnsafe.start_param) || ''; } catch(e){}
    if (!p) try { p = new URLSearchParams(location.search).get('tgWebAppStartParam') || ''; } catch(e2){}
    return p;
  }
  function setIncoming(token){ try{ sessionStorage.setItem(SESSION_KEY,token); }catch(e){} }
  function getIncoming(){ try{return sessionStorage.getItem(SESSION_KEY)||'';}catch(e){return '';} }
  function clearIncoming(){ try{sessionStorage.removeItem(SESSION_KEY);}catch(e){} }
  function peekIncoming(){ var t=getIncoming()||startParam(); return decode(t); }
  function routeIncoming() {
    var token=startParam(); if(!token) return false;
    var env=decode(token); if(!env) return false;
    var m=(location.pathname||'').match(/\/games\/([^/]+)\//);
    if(m && m[1]===env.g){ setIncoming(token); return false; }
    setIncoming(token);
    var prefix=(location.pathname||'').indexOf('/games/')>=0?'../../':'./';
    location.replace(prefix+'games/'+env.g+'/index.html?mp=1');
    return true;
  }
  function takeIncoming(game) {
    var token=getIncoming() || startParam();
    if(!token) return null;
    var env=decode(token);
    if(!env) { clearIncoming(); return {error:'bad'}; }
    if(env.g!==game) return {error:'wrong',env:env};
    clearIncoming(); return {token:token,env:env};
  }

  function begin(game, snapshot, turn, extra, sides) {
    var me=ident();
    var m={v:1,g:game,i:randomId(),q:0,a:me,b:null,u:sides||[1,2],t:turn,s:snapshot,x:extra||null,l:randomSecret(),sg:'',sp:false};
    save(m); return m;
  }
  function role(m) {
    var me=ident();
    if(sameId(m.a,me)) return 1;
    if(m.b && sameId(m.b,me)) return 2;
    if(!m.b) return 2;
    return 0;
  }
  function opponent(m) {
    var r=role(m); return r===1?(m.b||null):r===2?m.a:null;
  }
  function bind(env) {
    var m=clone(env), me=ident(), r;
    delete m._sig;
    if(sameId(m.a,me)) r=1;
    else if(m.b && sameId(m.b,me)) r=2;
    else if(!m.b){ m.b=me; r=2; }
    else r=0;
    m.sg=env._sig||m.sg||'';
    m.sp=(r===0);
    return {match:m,role:r};
  }
  function receive(game, incoming) {
    if(!incoming || incoming.error) return {ok:false,reason:incoming&&incoming.error||'bad'};
    var env=incoming.env;
    if(env.g!==game) return {ok:false,reason:'wrong'};
    var bound=bind(env), m=bound.match, local=load(game,m.i);
    if(bound.role===0) { save(m); return {ok:true,spectator:true,match:m,env:env}; }
    if(local) {
      if((local.q||0) > env.q) return {ok:false,reason:'stale',match:local};
      if((local.q||0) === env.q && local.sg === env._sig) return {ok:false,reason:'stale',match:local};
      if(local.sg && env.p && local.sg!==env.p) return {ok:false,reason:'chain',match:local};
      // If a player reopens a newer full snapshot after clearing intermediate UI state,
      // allow resync only when the revision is newer. Game adapters still validate state.
      if((local.q||0) >= env.q) return {ok:false,reason:'stale',match:local};
    }
    save(m); return {ok:true,match:m,env:env,role:bound.role};
  }
  function advance(match, snapshot, turn, action, extra) {
    var m=clone(match), me=ident(), r=role(m);
    if(r===2 && !m.b) m.b=me;
    m.p=m.sg||''; m.q=(m.q||0)+1; m.s=snapshot; m.t=turn; m.m=action===undefined?null:action;
    if(extra!==undefined) m.x=extra;
    m.a=m.a||me;
    var env={v:1,g:m.g,i:m.i,q:m.q,a:m.a,b:m.b,u:m.u||[1,2],t:m.t,s:m.s,m:m.m,p:m.p,x:m.x||null,l:m.l||''};
    var token=encode(env), decoded=decode(token);
    m.sg=decoded?decoded._sig:''; m.tk=token;
    clearDraft(m.g,m.i);
    save(m);
    return {match:m,token:token,env:decoded};
  }
  function sideForRole(m,r){ var u=m.u||[1,2]; return r===1?u[0]:u[1]; }
  function isMine(m, player) {
    var r=role(m); if(!r || m.sp) return false;
    return String(player)===String(sideForRole(m,r));
  }
  function nameForRole(m,r){ var p=r===1?m.a:m.b; return p&&p[1]?p[1]:(r===1?C.t('mpYou'):C.t('player2')); }
  function currentName(m,player){ return nameForRole(m,String(player)===String(sideForRole(m,1))?1:2); }

  function deepLink(token) {
    var bot=String(CFG.botUsername||'').replace(/^@/,'').trim();
    if(!bot) return '';
    var app=String(CFG.appShortName||'').trim();
    var base='https://t.me/'+encodeURIComponent(bot)+(app?'/'+encodeURIComponent(app):'');
    return base+'?startapp='+encodeURIComponent(token)+'&mode='+encodeURIComponent(CFG.deepLinkMode||'fullscreen');
  }
  function share(token, text) {
    var link=deepLink(token);
    if(!link){ C.ui.modal({title:C.t('mpConfigTitle'),body:[C.el('p',{class:'ch-dim',text:C.t('mpConfigBody')})],actions:[{label:C.t('done'),kind:'primary'}]}); return false; }
    var share='https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent(String(text||''));
    try { if(T&&T.telegram&&T.telegram.openTelegramLink){ T.telegram.openTelegramLink(share); return true; } } catch(e){}
    try { if(navigator.share){ navigator.share({title:'Mini Arcade',text:String(text||''),url:link}); return true; } } catch(e2){}
    try { navigator.clipboard.writeText(link); C.ui.toast({icon:'info',title:link,ms:2600}); return true; } catch(e3){}
    return false;
  }
  function message(gameName, match) {
    var o=opponent(match), against=o&&o[1]?(' · '+o[1]):'';
    return '🎮 Mini Arcade · '+gameName+against+'\n'+C.t('mpSendHint');
  }
  function toastReason(reason){
    var k={bad:'mpBadLink',wrong:'mpWrongGame',stale:'mpStale',chain:'mpChain'}[reason]||'mpBadLink';
    C.ui.toast({icon:'info',title:C.t(k),ms:2600});
  }
  function renderStrip(host, o) {
    if(!host) return;
    host._maMpOpts=o||null;
    if(!o || !o.match){ host.innerHTML='';host.hidden=true; return; }
    host.innerHTML=''; host.hidden=false;
    var m=o.match, r=role(m), op=opponent(m), name=op&&op[1]?op[1]:C.t('player2');
    var live=C.multiplayer&&C.multiplayer.live, ls=live&&live.state?live.state(m):null;
    var connected=!!(ls&&ls.status==='connected'), connecting=!!(ls&&(ls.status==='connecting'||ls.status==='waiting'));
    var status=m.sp?C.t('mpSpectator'):(o.myTurn?C.t('mpYourTurn'):C.t('mpWaiting',{n:name}));
    var badgeText=connected?C.t('mpLive'):C.t('mpMatch');
    var badgeClass='ch-badge '+(connected?'ch-badge--good':'ch-badge--accent');
    host.appendChild(C.el('div',{class:'ma-mp__meta'},[
      C.el('span',{class:badgeClass},[C.icon(connected?'bolt':'user',14),C.el('span',{text:badgeText})]),
      C.el('span',{class:'ma-mp__status',text:status})
    ]));
    if(!m.sp && !connected && ls && ls.status && ls.status!=='disabled'){
      host.appendChild(C.el('span',{class:'ma-mp__live '+(connecting?'is-connecting':'is-offline'),text:C.t(connecting?(ls.status==='waiting'?'mpWaiting':'mpConnecting'):(ls.status==='reconnecting'?'mpReconnecting':'mpOffline'),{n:name})}));
    }
    if(o.pending && !m.sp && !connected){
      var label=(m.q<=1&&!m.b)?C.t('mpInvite'):(ls&&ls.fallbackReady?C.t('mpFallback'):C.t(m.q<=1?'mpSendChallenge':'mpSendMove'));
      var b=C.el('button',{class:'ch-btn ch-btn--primary ch-btn--sm',type:'button',text:label});
      b.addEventListener('click',function(){ share(o.pending,o.shareText||''); });
      host.appendChild(b);
    }
    if(r===2 && !m.b) host.appendChild(C.el('span',{class:'ch-dim ma-mp__join',text:C.t('mpJoined',{n:m.a&&m.a[1]||''})}));
  }
  function refreshStrips(){
    try{document.querySelectorAll('.ma-mp').forEach(function(h){if(h._maMpOpts)renderStrip(h,h._maMpOpts);});}catch(e){}
  }
  function deliver(out,text){
    if(!out||!out.token||!out.match)return false;
    var live=C.multiplayer&&C.multiplayer.live;
    if(live&&live.deliver){
      var result=live.deliver(out.match,out.token,text||'');
      if(result==='live'){refreshStrips();return true;}
      if(result==='queued'){refreshStrips();return true;}
      if(result==='invite')return share(out.token,text||'');
    }
    return share(out.token,text||'');
  }


  C.multiplayer={
    allowed:ALLOWED, encode:encode, decode:decode, routeIncoming:routeIncoming, takeIncoming:takeIncoming,
    begin:begin, receive:receive, advance:advance, save:save, load:load, active:active, drop:drop, clearActive:clearActive, saveDraft:saveDraft, loadDraft:loadDraft, clearDraft:clearDraft, role:role,
    opponent:opponent, sideForRole:sideForRole, isMine:isMine, currentName:currentName, deepLink:deepLink, share:share,
    message:message, toastReason:toastReason, renderStrip:renderStrip, refreshStrips:refreshStrips, deliver:deliver, identity:ident
  };
})(window);

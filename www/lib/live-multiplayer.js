/* Mini Arcade — live friend multiplayer transport.
   A tiny signaling service introduces the two browsers; game moves then travel
   over an encrypted, ordered WebRTC DataChannel. The existing Telegram link
   transport stays available as invite/recovery/fallback. No game state is
   stored by the signaling service. */
(function (global) {
  'use strict';
  var C=global.Chogan, M=C&&C.multiplayer, CFG=global.MINI_ARCADE_CONFIG||{};
  if(!C||!M)return;

  var LC=CFG.liveMultiplayer||{}, sessions=new Map(), iceCache=null, iceAt=0;
  var DEFAULT_ICE=[{urls:['stun:stun.cloudflare.com:3478']}];
  var CONNECT_TIMEOUT=Math.max(5000,+LC.connectTimeoutMs||12000);
  var FALLBACK_DELAY=Math.max(3500,+LC.fallbackDelayMs||8000);
  var ACK_TIMEOUT=Math.max(2000,+LC.ackTimeoutMs||4500);
  var RECONNECT_DELAY=Math.max(600,+LC.reconnectMs||1200);

  function enabled(){return LC.enabled!==false&&!!baseUrl()&&'RTCPeerConnection'in global&&'WebSocket'in global;}
  function baseUrl(){return String(LC.signalingUrl||'').trim().replace(/\/+$/,'');}
  function httpBase(){var b=baseUrl();return b.replace(/^wss:/i,'https:').replace(/^ws:/i,'http:');}
  function wsBase(){var b=baseUrl();return b.replace(/^https:/i,'wss:').replace(/^http:/i,'ws:');}
  function matchKey(m){return m&&m.g&&m.i?m.g+':'+m.i:'';}
  function roleOf(m){return M.role(m);}
  function cleanText(v,n){return String(v||'').slice(0,n||128);}
  function safeJson(v){try{return JSON.stringify(v);}catch(e){return '';}}
  function emit(){try{M.refreshStrips();}catch(e){} }

  function publicState(s){
    if(!s)return {status:enabled()?'idle':'disabled',fallbackReady:false,wasConnected:false};
    return {status:s.status||'idle',fallbackReady:!!s.fallbackReady,wasConnected:!!s.wasConnected,role:s.role||0};
  }
  function setState(s,status){if(!s||s.closed)return;s.status=status;emit();}

  async function getIce(){
    if(Array.isArray(LC.iceServers)&&LC.iceServers.length)return LC.iceServers;
    if(iceCache&&Date.now()-iceAt<15*60*1000)return iceCache;
    var fallback=DEFAULT_ICE;
    try{
      var ctrl='AbortController'in global?new AbortController():null;
      var timer=ctrl?setTimeout(function(){ctrl.abort();},3500):0;
      var res=await fetch(httpBase()+'/ice',{cache:'no-store',signal:ctrl?ctrl.signal:undefined,credentials:'omit'});
      if(timer)clearTimeout(timer);
      if(res.ok){var j=await res.json();if(j&&Array.isArray(j.iceServers)&&j.iceServers.length)fallback=j.iceServers;}
    }catch(e){}
    iceCache=fallback;iceAt=Date.now();return fallback;
  }

  function sessionFor(m){return sessions.get(matchKey(m))||null;}
  function createSession(m,handler){
    return {key:matchKey(m),match:m,game:m.g,role:roleOf(m),handler:handler||null,status:'idle',ws:null,pc:null,dc:null,
      candidates:[],makingOffer:false,closed:false,wasConnected:false,fallbackReady:false,fallbackTimer:0,connectTimer:0,reconnectTimer:0,
      queued:[],pendingAck:null,ackTimer:0,attempt:0,lastSignalAt:0};
  }
  function updateMatch(s,m){s.match=m;s.role=roleOf(m);}

  function closeRtc(s,keepWs){
    if(!s)return;
    try{if(s.dc)s.dc.close();}catch(e){} s.dc=null;
    try{if(s.pc)s.pc.close();}catch(e2){} s.pc=null;s.candidates=[];s.makingOffer=false;
    if(!keepWs){try{if(s.ws)s.ws.close(1000,'reset');}catch(e3){}s.ws=null;}
  }
  function clearTimers(s){['fallbackTimer','connectTimer','reconnectTimer','ackTimer'].forEach(function(k){if(s[k]){clearTimeout(s[k]);s[k]=0;}});}
  function destroy(s){if(!s)return;s.closed=true;clearTimers(s);closeRtc(s,false);sessions.delete(s.key);emit();}

  function sendSignal(s,obj){
    try{if(s.ws&&s.ws.readyState===1){s.ws.send(safeJson(obj));s.lastSignalAt=Date.now();return true;}}catch(e){}
    return false;
  }
  function sendData(s,obj){
    try{if(s.dc&&s.dc.readyState==='open'){s.dc.send(safeJson(obj));return true;}}catch(e){}
    return false;
  }

  function setupDataChannel(s,dc){
    if(!dc)return;
    s.dc=dc;dc.binaryType='arraybuffer';
    dc.onopen=function(){
      if(s.closed)return;s.wasConnected=true;s.fallbackReady=false;if(s.fallbackTimer){clearTimeout(s.fallbackTimer);s.fallbackTimer=0;}
      setState(s,'connected');
      sendData(s,{t:'sync',q:+s.match.q||0,sg:s.match.sg||''});
      flush(s);
      C.ui&&C.ui.toast&&C.ui.toast({icon:'good',title:C.t('mpMatchReady'),ms:1600});
    };
    dc.onclose=function(){if(!s.closed){setState(s,'reconnecting');scheduleReconnect(s);scheduleFallback(s);}};
    dc.onerror=function(){if(!s.closed){setState(s,'reconnecting');scheduleFallback(s);}};
    dc.onmessage=function(ev){onData(s,ev.data);};
  }

  function makePc(s,ice){
    closeRtc(s,true);
    var pc=new RTCPeerConnection({iceServers:ice||DEFAULT_ICE});s.pc=pc;
    pc.onicecandidate=function(ev){if(ev.candidate)sendSignal(s,{t:'ice',c:ev.candidate.toJSON?ev.candidate.toJSON():ev.candidate});};
    pc.ondatachannel=function(ev){if(s.role===2)setupDataChannel(s,ev.channel);};
    pc.onconnectionstatechange=function(){
      if(s.closed||pc!==s.pc)return;var st=pc.connectionState;
      if(st==='connected'){s.wasConnected=true;setState(s,'connected');}
      else if(st==='disconnected'){setState(s,'reconnecting');scheduleReconnect(s);scheduleFallback(s);}
      else if(st==='failed'){setState(s,'reconnecting');scheduleReconnect(s,true);scheduleFallback(s);}
      else if(st==='closed'&& !s.closed)setState(s,'reconnecting');
    };
    if(s.role===1)setupDataChannel(s,pc.createDataChannel('mini-arcade',{ordered:true}));
    return pc;
  }

  async function makeOffer(s,restart){
    if(!s.pc||s.makingOffer||s.role!==1)return;
    s.makingOffer=true;
    try{
      var offer=await s.pc.createOffer(restart?{iceRestart:true}:undefined);await s.pc.setLocalDescription(offer);
      sendSignal(s,{t:'offer',d:s.pc.localDescription});
    }catch(e){scheduleReconnect(s,true);}finally{s.makingOffer=false;}
  }
  async function onSignal(s,msg){
    if(!msg||s.closed)return;
    try{
      if(msg.t==='ready'){
        setState(s,msg.peers>=2?'connecting':'waiting');if(msg.peers>=2&&s.role===1)await makeOffer(s,false);return;
      }
      if(msg.t==='peer'){
        if(msg.state==='joined'){setState(s,'connecting');if(s.role===1)await makeOffer(s,false);}
        else if(msg.state==='left'&&s.status!=='connected'){setState(s,'waiting');}
        return;
      }
      if(msg.t==='offer'&&s.role===2&&msg.d){
        await s.pc.setRemoteDescription(msg.d);await drainCandidates(s);
        var ans=await s.pc.createAnswer();await s.pc.setLocalDescription(ans);sendSignal(s,{t:'answer',d:s.pc.localDescription});return;
      }
      if(msg.t==='answer'&&s.role===1&&msg.d){await s.pc.setRemoteDescription(msg.d);await drainCandidates(s);return;}
      if(msg.t==='ice'&&msg.c){if(s.pc.remoteDescription)await s.pc.addIceCandidate(msg.c);else s.candidates.push(msg.c);return;}
      if(msg.t==='error'){setState(s,'failed');s.fallbackReady=true;emit();}
    }catch(e){setState(s,'reconnecting');scheduleReconnect(s,true);scheduleFallback(s);}
  }
  async function drainCandidates(s){
    if(!s.pc||!s.pc.remoteDescription)return;var q=s.candidates.splice(0);
    for(var i=0;i<q.length;i++)try{await s.pc.addIceCandidate(q[i]);}catch(e){}
  }

  async function connect(s,force){
    if(!s||s.closed||!enabled()||!s.match.l||!s.role){if(s)setState(s,'disabled');return false;}
    if(!force&&(s.status==='connecting'||s.status==='waiting'||s.status==='connected'))return true;
    clearTimeout(s.reconnectTimer);s.reconnectTimer=0;s.attempt++;
    setState(s,s.wasConnected?'reconnecting':'connecting');
    var ice=await getIce();if(s.closed)return false;makePc(s,ice);
    var url=wsBase()+'/signal/'+encodeURIComponent(s.match.i);
    var ws;try{ws=new WebSocket(url);}catch(e){setState(s,'failed');scheduleFallback(s);return false;}s.ws=ws;
    ws.onopen=function(){
      if(s.closed||ws!==s.ws)return;
      sendSignal(s,{t:'hello',k:s.match.l,r:s.role});
      if(s.connectTimer)clearTimeout(s.connectTimer);
      s.connectTimer=setTimeout(function(){if(s.status!=='connected'&&s.status!=='waiting'){setState(s,'reconnecting');scheduleFallback(s);scheduleReconnect(s,true);}},CONNECT_TIMEOUT);
    };
    ws.onmessage=function(ev){var m=null;try{m=JSON.parse(ev.data);}catch(e){}if(m)onSignal(s,m);};
    ws.onerror=function(){};
    ws.onclose=function(){if(s.closed||ws!==s.ws)return;s.ws=null;if(s.status!=='connected'){setState(s,s.wasConnected?'reconnecting':'failed');scheduleFallback(s);}scheduleReconnect(s,false);};
    return true;
  }

  function scheduleReconnect(s,hard){
    if(!s||s.closed||!enabled()||s.reconnectTimer)return;
    s.reconnectTimer=setTimeout(function(){s.reconnectTimer=0;if(s.closed||s.status==='connected')return;if(hard)closeRtc(s,false);connect(s,true);},Math.min(8000,RECONNECT_DELAY*Math.max(1,s.attempt)));
  }
  function scheduleFallback(s){
    if(!s||s.closed||s.fallbackTimer||s.fallbackReady)return;
    s.fallbackTimer=setTimeout(function(){s.fallbackTimer=0;if(s.status!=='connected'){s.fallbackReady=true;emit();}},FALLBACK_DELAY);
  }

  function clearAck(s){if(s.ackTimer){clearTimeout(s.ackTimer);s.ackTimer=0;}s.pendingAck=null;}
  function markAcked(s,sig){
    if(!s.pendingAck||s.pendingAck.sig!==sig)return;
    clearAck(s);s.match.tk='';M.save(s.match);s.fallbackReady=false;emit();
  }
  function armAck(s,item){
    if(s.ackTimer)clearTimeout(s.ackTimer);
    s.ackTimer=setTimeout(function(){
      s.ackTimer=0;if(!s.pendingAck)return;
      if(s.status==='connected'&&(s.pendingAck.tries||0)<2){s.pendingAck.tries=(s.pendingAck.tries||0)+1;sendData(s,{t:'turn',k:s.pendingAck.token});armAck(s,s.pendingAck);}
      else{s.fallbackReady=true;emit();}
    },ACK_TIMEOUT);
  }
  function sendTurn(s,token,text){
    var env=M.decode(token);if(!env||env.i!==s.match.i||env.l!==s.match.l)return false;
    var item={sig:env._sig,token:token,text:text||'',tries:0};s.pendingAck=item;
    if(!sendData(s,{t:'turn',k:token})){s.pendingAck=null;return false;}
    // The receiver may ACK extremely quickly on a local/LAN path. Only arm the
    // timeout if that ACK did not already clear this exact pending item.
    if(s.pendingAck===item)armAck(s,item);return true;
  }
  function flush(s){
    if(!s||s.status!=='connected')return;
    while(s.queued.length){var q=s.queued.shift();if(sendTurn(s,q.token,q.text))break;}
  }
  function queue(s,token,text){
    s.queued=s.queued.filter(function(x){return x.token!==token;});s.queued.push({token:token,text:text||''});
    if(s.queued.length>3)s.queued.shift();scheduleFallback(s);scheduleReconnect(s,false);
  }

  function onData(s,raw){
    var msg=null;try{msg=JSON.parse(String(raw||''));}catch(e){return;}if(!msg||!msg.t)return;
    if(msg.t==='ack'){markAcked(s,msg.sg||'');return;}
    if(msg.t==='sync'){
      var lq=+s.match.q||0,rq=+msg.q||0;
      if(lq>rq&&s.match.tk)sendTurn(s,s.match.tk,'');
      else if(rq>lq)sendData(s,{t:'need',q:lq});
      return;
    }
    if(msg.t==='need'){if(s.match.tk&&(+s.match.q||0)>(+msg.q||0))sendTurn(s,s.match.tk,'');return;}
    if(msg.t!=='turn'||typeof msg.k!=='string'||msg.k.length>4096)return;
    var env=M.decode(msg.k);if(!env||env.g!==s.game||env.i!==s.match.i||env.l!==s.match.l)return;
    var local=M.load(env.g,env.i);
    if(local&&local.sg===env._sig){sendData(s,{t:'ack',sg:env._sig});return;}
    var ok=false;try{ok=s.handler?s.handler(msg.k,env)!==false:false;}catch(e){ok=false;}
    var latest=M.load(env.g,env.i);if(latest)updateMatch(s,latest);
    if(ok)sendData(s,{t:'ack',sg:env._sig});
  }

  function attach(match,handler){
    if(!match||match.sp)return null;var k=matchKey(match),s=sessions.get(k);
    if(!s){s=createSession(match,handler);sessions.set(k,s);}else{updateMatch(s,match);s.handler=handler||s.handler;}
    if(!enabled()||!match.l||!s.role){setState(s,'disabled');return s;}
    connect(s,false);return s;
  }
  function state(match){var s=sessionFor(match);return publicState(s);}
  function deliver(match,token,text){
    var s=attach(match,null);if(!s||s.status==='disabled')return 'fallback';
    updateMatch(s,match);
    if(s.status==='connected'&&sendTurn(s,token,text))return 'live';
    // The inviter's first completed move doubles as the one and only Telegram invite.
    if((+match.q||0)<=1&&s.role===1&&!s.wasConnected)return 'invite';
    queue(s,token,text);return 'queued';
  }
  function fallback(match,text){var s=sessionFor(match);if(!s||!match.tk)return false;s.fallbackReady=true;emit();return M.share(match.tk,text||'');}
  function detach(match){var s=sessionFor(match);if(s)destroy(s);}

  // Backgrounding Telegram commonly suspends WebRTC/WebSockets. Rejoin the same
  // room automatically when the Mini App becomes active again.
  try{
    document.addEventListener('visibilitychange',function(){if(document.hidden)return;sessions.forEach(function(s){if(!s.closed&&s.status!=='connected')connect(s,true);});});
    global.addEventListener('online',function(){sessions.forEach(function(s){if(!s.closed&&s.status!=='connected')connect(s,true);});});
    global.addEventListener('pagehide',function(){sessions.forEach(function(s){try{sendSignal(s,{t:'bye'});}catch(e){}});});
  }catch(e){}

  M.live={enabled:enabled,attach:attach,state:state,deliver:deliver,fallback:fallback,detach:detach,_sessions:sessions};
})(window);

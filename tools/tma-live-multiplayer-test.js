#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const MP=fs.readFileSync(path.join(ROOT,'www/lib/multiplayer.js'),'utf8');
const LIVE=fs.readFileSync(path.join(ROOT,'www/lib/live-multiplayer.js'),'utf8');
let pass=0,fail=0;
function ok(v,m,d=''){if(v){pass++;console.log('PASS  '+m+(d?' · '+d:''));}else{fail++;console.error('FAIL  '+m+(d?' · '+d:''));}}
function hash32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
class FakeDC{constructor(){this.readyState='connecting';this.onopen=null;this.onclose=null;this.onerror=null;this.onmessage=null;this.peer=null;}send(v){if(this.readyState!=='open')throw new Error('closed');const p=this.peer;if(p&&p.onmessage)setImmediate(()=>p.onmessage({data:v}));}close(){this.readyState='closed';}}
class FakePC{constructor(){this.connectionState='new';this.remoteDescription=null;this.localDescription=null;this.onicecandidate=null;this.ondatachannel=null;this.onconnectionstatechange=null;}createDataChannel(){this.dc=new FakeDC();return this.dc;}close(){this.connectionState='closed';}async createOffer(){return {type:'offer',sdp:'fake'};}async createAnswer(){return {type:'answer',sdp:'fake'};}async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(d){this.remoteDescription=d;}async addIceCandidate(){}}
class FakeWS{constructor(url){this.url=url;this.readyState=0;this.onopen=null;this.onmessage=null;this.onerror=null;this.onclose=null;}send(){}close(){this.readyState=3;}}
function client(id,name){
  const stores=new Map();
  function bucket(ns){if(!stores.has(ns))stores.set(ns,new Map());const b=stores.get(ns);return {set:(k,v)=>b.set(k,JSON.parse(JSON.stringify(v))),get:(k,d)=>b.has(k)?JSON.parse(JSON.stringify(b.get(k))):d,remove:k=>b.delete(k)};}
  const C={state:{profile:{telegramId:String(id),telegramName:name}},strings(){},t:(k,p)=>({mpMatchReady:'Live connection ready'}[k]||(p&&p.n?String(p.n):k)),hash32,storage:bucket,ui:{toast(){},modal(){}},el(){return {appendChild(){},addEventListener(){}}},icon(){return {}}};
  const doc={hidden:false,addEventListener(){},querySelectorAll(){return [];}};
  const ctx={window:null,Chogan:C,MINI_ARCADE_CONFIG:{botUsername:'MiniArcadeTestBot',liveMultiplayer:{enabled:true,signalingUrl:'https://signal.test',iceServers:[{urls:['stun:test']}] }},MiniArcadeTMA:{telegram:{initDataUnsafe:{},openTelegramLink(){}}},console,TextEncoder,TextDecoder,Uint8Array,Map,JSON,Math,Number,String,Object,Array,Date,Promise,setTimeout,clearTimeout,setImmediate,clearImmediate,URLSearchParams,AbortController,fetch:async()=>({ok:true,json:async()=>({iceServers:[{urls:['stun:test']}]})}),RTCPeerConnection:FakePC,WebSocket:FakeWS,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),crypto:crypto.webcrypto,sessionStorage:{_m:new Map(),setItem(k,v){this._m.set(k,String(v));},getItem(k){return this._m.get(k)||null;},removeItem(k){this._m.delete(k);}},navigator:{},location:{search:'',pathname:'/games/mancala/index.html',replace(){}},document:doc,addEventListener(){}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(MP,ctx,{filename:'multiplayer.js'});vm.runInContext(LIVE,ctx,{filename:'live-multiplayer.js'});return {C,M:C.multiplayer,ctx,stores};
}
const wait=()=>new Promise(r=>setImmediate(r));
(async()=>{
 try{
  const A=client(1,'Alice'),B=client(2,'Bob');
  let a=A.M.begin('mancala',{b:'start',t:0,d:false},0,null,[0,1]);
  ok(typeof a.l==='string'&&a.l.length>=20,'new matches get a cryptographically-sized live room secret');
  let sA=A.M.live.attach(a,()=>true);await wait();
  ok(sA&&sA.role===1,'inviter attaches to live transport as role one');
  const first=A.M.advance(a,{b:'after-a',t:1,d:false},1,[2]);a=first.match;
  const d1=B.M.decode(first.token);ok(d1&&d1.l===a.l,'live room secret survives compact Telegram invitation encoding');
  const rb=B.M.receive('mancala',{token:first.token,env:d1});ok(rb.ok&&rb.role===2,'recipient binds normally before live connection begins');
  let b=rb.match;
  let receivedOnA=false, receivedOnB=false;
  sA=A.M.live.attach(a,(token,env)=>{const r=A.M.receive('mancala',{token,env});if(r.ok){a=r.match;receivedOnA=true;return true;}return false;});
  const sB=B.M.live.attach(b,(token,env)=>{const r=B.M.receive('mancala',{token,env});if(r.ok){b=r.match;receivedOnB=true;return true;}return false;});
  await wait();
  // Role 2 receives its negotiated channel from RTCPeerConnection.ondatachannel.
  const bdc=new FakeDC();sB.pc.ondatachannel({channel:bdc});
  const adc=sA.dc;adc.peer=bdc;bdc.peer=adc;adc.readyState=bdc.readyState='open';adc.onopen();bdc.onopen();
  ok(A.M.live.state(a).status==='connected'&&B.M.live.state(b).status==='connected','both players reach connected live state');
  const reply=B.M.advance(b,{b:'after-b',t:0,d:false},0,[9]);b=reply.match;
  const mode=B.M.deliver(reply,'reply');ok(mode===true,'game delivery accepts live transport without opening Telegram');
  await wait();await wait();
  ok(receivedOnA&&A.M.active('mancala').q===2,'opponent receives and applies a live move automatically');
  ok(B.M.active('mancala').tk===''||!B.M.active('mancala').tk,'application-level ACK clears sender fallback packet after verified receipt');
  // Duplicate delivery should be ACKed from saved state instead of corrupting the match.
  sB.dc.send(JSON.stringify({t:'turn',k:reply.token}));await wait();
  ok(A.M.active('mancala').q===2,'duplicate live packet is idempotent');
  // A wrong room secret must never reach the game handler.
  const forged=Object.assign({},B.M.decode(reply.token),{l:'wrong-room-secret-xxxxxxxx'});const bad=B.M.encode(forged);receivedOnA=false;sB.dc.send(JSON.stringify({t:'turn',k:bad}));await wait();
  ok(!receivedOnA&&A.M.active('mancala').q===2,'wrong live-room secret is rejected before game application');
  // Disconnection queues later moves rather than unexpectedly launching Telegram mid-turn.
  adc.readyState='closed';sA.status='reconnecting';
  const third=A.M.advance(a,{b:'after-a2',t:1,d:false},1,[3]);a=third.match;
  const q=A.M.live.deliver(a,third.token,'third');ok(q==='queued'&&sA.queued.length===1,'temporary disconnect queues a move for automatic reconnect');
  // Brand-new role-one match still uses Telegram exactly once for the invitation.
  const Cc=client(3,'Cara');let c=Cc.M.begin('chess',{f:'x',h:'AA',o:0},'w',null,['w','b']);Cc.M.live.attach(c,()=>true);await wait();const cf=Cc.M.advance(c,{f:'x',h:'AA',o:0},'b',0);c=cf.match;
  ok(Cc.M.live.deliver(c,cf.token,'invite')==='invite','first move remains a one-time Telegram invitation when no peer has joined');
  // No signaling URL = graceful old transport fallback.
  const D=client(4,'Dan');D.ctx.MINI_ARCADE_CONFIG.liveMultiplayer.signalingUrl='';
  // live module captured config object by reference, so blanking the field disables it.
  let dm=D.M.begin('mancala',{b:'x',t:0,d:false},0);let dout=D.M.advance(dm,{b:'y',t:1,d:false},1,[1]);
  ok(D.M.live.deliver(dout.match,dout.token,'fallback')==='fallback','missing signaling deployment cleanly falls back to Telegram transport');
 }catch(e){fail++;console.error('FAIL  uncaught live multiplayer error: '+(e.stack||e));}
 console.log(`\nTMA live multiplayer: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
})();

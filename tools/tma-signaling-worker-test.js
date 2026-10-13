#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
let src=fs.readFileSync(path.join(ROOT,'signaling-worker/src/index.js'),'utf8');
let pass=0,fail=0;
function ok(v,m){if(v){pass++;console.log('PASS  '+m);}else{fail++;console.error('FAIL  '+m);}}
// Extract the Durable Object class for deterministic unit testing in Node.
src=src.replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject { constructor(ctx,env){ this.ctx=ctx; this.env=env; } }');
src=src.replace(/export default \{[\s\S]*?\n\};\n\nexport class SignalRoom/, 'class SignalRoom');
src+='\nthis.SignalRoom=SignalRoom;';
class Sock{
  constructor(name){this.name=name;this.sent=[];this.closed=false;this.meta={authed:false,role:0,peer:'',game:''};}
  send(v){this.sent.push(JSON.parse(v));}
  close(code,reason){this.closed=true;this.closeCode=code;this.closeReason=reason;}
  serializeAttachment(v){this.meta=JSON.parse(JSON.stringify(v));}
  deserializeAttachment(){return JSON.parse(JSON.stringify(this.meta));}
}
class Storage{constructor(){this.m=new Map();this.alarm=0;}async get(k){return this.m.get(k);}async put(k,v){this.m.set(k,v);}async setAlarm(v){this.alarm=v;}async deleteAll(){this.m.clear();this.alarm=0;}}
class Ctx{constructor(){this.socks=[];this.storage=new Storage();}getWebSockets(){return this.socks;}acceptWebSocket(ws){this.socks.push(ws);}}
(async()=>{
 try{
  const context={console,crypto:crypto.webcrypto,TextEncoder,Response,WebSocketPair:function(){},URL};context.globalThis=context;vm.createContext(context);vm.runInContext(src,context,{filename:'signal-worker-test.js'});
  const ctx=new Ctx(),room=new context.SignalRoom(ctx,{}),a=new Sock('a'),b=new Sock('b');ctx.socks.push(a,b);
  await room.webSocketMessage(a,JSON.stringify({t:'hello',k:'abcdefghijklmnopQRSTUVWX',r:1,p:'1',g:'chess'}));
  ok(a.meta.authed&&a.meta.role===1,'role one authenticates and establishes room secret');
  await room.webSocketMessage(b,JSON.stringify({t:'hello',k:'abcdefghijklmnopQRSTUVWX',r:2,p:'2',g:'chess'}));
  ok(b.meta.authed&&b.meta.role===2,'role two joins with matching room secret');
  ok(a.sent.some(x=>x.t==='peer'&&x.state==='joined'&&x.role===2),'existing peer is notified when opponent joins');
  const offer={t:'offer',d:{type:'offer',sdp:'abc'}};await room.webSocketMessage(a,JSON.stringify(offer));
  ok(b.sent.some(x=>x.t==='offer'&&x.from===1&&x.d.sdp==='abc'),'SDP offer is relayed only to opposite role');
  const before=a.sent.length;await room.webSocketMessage(b,JSON.stringify({t:'turn',k:'game-state-must-not-cross-signal-server'}));
  ok(a.sent.length===before,'signaling server refuses to relay game-state messages');
  const wrong=new Sock('wrong');ctx.socks.push(wrong);await room.webSocketMessage(wrong,JSON.stringify({t:'hello',k:'zzzzzzzzzzzzzzzzzzzzzzzz',r:2,p:'x',g:'chess'}));
  ok(wrong.closed&&wrong.closeCode===1008,'wrong room secret is rejected');
  const b2=new Sock('b2');ctx.socks.push(b2);await room.webSocketMessage(b2,JSON.stringify({t:'hello',k:'abcdefghijklmnopQRSTUVWX',r:2,p:'2',g:'chess'}));
  ok(b.closed&&b.closeCode===4001&&b2.meta.authed,'same-role reconnect replaces stale socket');
  await room.webSocketClose(b2);ok(a.sent.some(x=>x.t==='peer'&&x.state==='left'&&x.role===2),'opponent disconnect is relayed');
  const saved=await ctx.storage.get('secretHash');ok(typeof saved==='string'&&saved.length===64,'room stores only SHA-256 of live room secret');
  ok(ctx.storage.alarm>Date.now(),'room secret storage is given an automatic expiry alarm');
  ok(!fs.readFileSync(path.join(ROOT,'signaling-worker/src/index.js'),'utf8').includes("['turn'"),'worker source does not allow turn/game payload relay');
 }catch(e){fail++;console.error('FAIL  uncaught signaling worker error: '+(e.stack||e));}
 console.log(`\nTMA signaling worker: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
})();

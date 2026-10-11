#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'www','lib','multiplayer.js'),'utf8');
let pass=0,fail=0;
function ok(v,m,detail=''){if(v){pass++;console.log('PASS  '+m+(detail?' · '+detail:''));}else{fail++;console.error('FAIL  '+m+(detail?' · '+detail:''));}}
function hash32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function client(id,name){
  const stores=new Map();
  function bucket(ns){if(!stores.has(ns))stores.set(ns,new Map());const b=stores.get(ns);return {set:(k,v)=>b.set(k,JSON.parse(JSON.stringify(v))),get:(k,d)=>b.has(k)?JSON.parse(JSON.stringify(b.get(k))):d,remove:k=>b.delete(k)};}
  const C={state:{profile:{telegramId:String(id),telegramName:name}},strings(){},t:(k,p)=>p&&p.n?String(p.n):k,hash32,storage:bucket,
    ui:{toast(){},modal(){}},el(){return {appendChild(){},addEventListener(){}}},icon(){return {}}};
  const opened=[];
  const ctx={window:null,Chogan:C,MINI_ARCADE_CONFIG:{botUsername:'MiniArcadeTestBot',appShortName:'',deepLinkMode:'fullscreen'},MiniArcadeTMA:{telegram:{initDataUnsafe:{},openTelegramLink:u=>opened.push(u)}},
    console,TextEncoder,TextDecoder,Uint8Array,Map,JSON,Math,Number,String,Object,Array,Date,setTimeout,clearTimeout,URLSearchParams,
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),crypto:crypto.webcrypto,
    sessionStorage:{_m:new Map(),setItem(k,v){this._m.set(k,String(v));},getItem(k){return this._m.get(k)||null;},removeItem(k){this._m.delete(k);}},
    navigator:{},location:{search:'',pathname:'/games/chess/index.html',replace(){}},document:{}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(SRC,ctx,{filename:'multiplayer.js'});return {M:C.multiplayer,C,ctx,opened,stores};
}
function env(game,state,action=null,q=1,extra=null){return {v:1,g:game,i:'abcdefghijklmn',q,a:['1','Alice'],b:['2','Bob'],u:[1,2],t:2,s:state,m:action,p:'',x:extra};}
try{
  const A=client(1,'Alice'),B=client(2,'Bob'),D=client(4,'Dana');
  ok(JSON.stringify(Object.keys(A.M.allowed).sort())===JSON.stringify(['backgammon','chess','dots','mancala','morris','reversi']),'only the six supported games are exposed');
  const e=env('reversi',{b:'0'.repeat(64),t:1,l:-1,d:false},[19]); const tok=A.M.encode(e),dec=A.M.decode(tok);
  ok(/^ma2[0-9a-z]{7}[cr]_[A-Za-z0-9_-]+$/.test(tok),'startapp token uses Telegram-safe characters','len='+tok.length);
  ok(dec&&dec.g==='reversi'&&dec.q===1&&dec.s.b===e.s.b,'ma2 encode/decode round-trip');
  const bad=tok.slice(0,-1)+(tok.endsWith('A')?'B':'A'); ok(!A.M.decode(bad),'single-character token corruption is rejected');
  ok(!A.M.decode('garbage'),'malformed tokens are rejected');

  let ma=A.M.begin('mancala',{b:'4,'.repeat(13)+'0',t:0,d:false},0,null,[0,1]);
  let o1=A.M.advance(ma,{b:'x',t:1,d:false},1,[2]);ma=o1.match;
  const i1={token:o1.token,env:B.M.decode(o1.token)};let rb=B.M.receive('mancala',i1);
  ok(rb.ok&&rb.role===2&&B.M.role(rb.match)===2&&rb.match.b[0]==='2','recipient binds as player two on first opened move');
  let mb=rb.match;let o2=B.M.advance(mb,{b:'y',t:0,d:false},0,[9]);mb=o2.match;
  let ra=A.M.receive('mancala',{token:o2.token,env:A.M.decode(o2.token)});
  ok(ra.ok&&A.M.role(ra.match)===1&&ra.match.b[0]==='2','reply binds opponent identity back to inviter');
  ok(!A.M.receive('mancala',{token:o2.token,env:A.M.decode(o2.token)}).ok,'duplicate move is rejected as stale');
  const stale=A.M.receive('mancala',{token:o1.token,env:A.M.decode(o1.token)});ok(!stale.ok&&stale.reason==='stale','older revision is rejected');
  const forged=A.M.decode(B.M.encode(Object.assign({},A.M.decode(o2.token),{q:3,p:'xxxxxxx',s:{b:'z',t:1,d:false}})));
  const chain=A.M.receive('mancala',{env:forged});ok(!chain.ok&&chain.reason==='chain','branch with the wrong previous checksum is rejected');
  const spec=D.M.receive('mancala',{token:o2.token,env:D.M.decode(o2.token)});ok(spec.ok&&spec.spectator&&D.M.role(spec.match)===0,'forwarded bound match opens as spectator, not a third player');
  ok(A.M.sideForRole(ra.match,1)===0&&A.M.sideForRole(ra.match,2)===1,'game-specific side mapping survives exchange');
  ok(A.M.active('mancala')&&A.M.active('mancala').q===2,'active match persists for encrypted-vault resume semantics');
  const link=A.M.deepLink(o2.token);ok(/^https:\/\/t\.me\/MiniArcadeTestBot\?startapp=/.test(link),'deep link targets configured Telegram bot');
  const openedBefore=A.opened.length;ok(A.M.share(o2.token,'Move ready')&&A.opened.length===openedBefore+1&&A.opened[A.opened.length-1].includes('t.me/share/url'),"share opens Telegram's native destination chooser link");
  const U=client(9,'😀😀😀😀😀😀😀😀😀😀');const uname=U.M.identity()[1];ok(new TextEncoder().encode(uname).length<=18,'multibyte Telegram display names are byte-capped for safe payload size','bytes='+new TextEncoder().encode(uname).length);

  // Payload stress cases: representative late/full states should remain within Telegram's practical 512-char start_param ceiling.
  const samples=[];
  samples.push(['reversi',env('reversi',{b:'012210'.repeat(10)+'0122',t:2,l:63,d:false},[63],49)]);
  samples.push(['mancala',env('mancala',{b:[0,0,0,0,0,0,24,0,0,0,0,0,0,24].join(','),t:1,d:false},[12],80)]);
  let dh=Buffer.from(Array.from({length:144},(_,i)=>i)).toString('base64url');samples.push(['dots-8x8-full',env('dots',{n:8,h:dh,d:true},[143],144)]);
  let mh='';for(let i=0;i<120;i++)mh+=(i%24+1).toString(36)+((i*5)%24+1).toString(36)+'0';samples.push(['morris-120ply',env('morris',{h:mh},[1,2,-1],120)]);
  samples.push(['backgammon',env('backgammon',{z:4294967295,n:91,t:2,d:[6,5],l:[6],p:[2,0,0,-3,0,5,0,0,-4,0,0,0,5,0,0,0,-3,0,0,0,0,2,0,0],b:[0,0],o:[8,9],v:[[23,17,6],[17,12,5]],w:0},[23,17,6,17,12,5],90)]);
  // Dense chess history is already move-index packed by the adapter; random-looking base64 is the difficult case.
  const chessPacked=Buffer.from(Array.from({length:220},(_,i)=>(i*73+19)&255)).toString('base64url');samples.push(['chess-220ply-dense',env('chess',{h:chessPacked},19,220)]);
  for(const [name,se] of samples){const t=A.M.encode(se);ok(t.length<=512,name+' token remains <= 512 chars','len='+t.length);}
}catch(e){fail++;console.error('FAIL  uncaught multiplayer transport error: '+(e.stack||e));}
console.log(`\nTMA multiplayer transport: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);

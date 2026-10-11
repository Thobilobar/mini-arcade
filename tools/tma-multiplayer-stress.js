#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');let pass=0,fail=0;
function ok(v,m,d=''){if(v){pass++;console.log('PASS  '+m+(d?' · '+d:''));}else{fail++;console.error('FAIL  '+m+(d?' · '+d:''));}}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function loadEngine(id){const h=fs.readFileSync(path.join(ROOT,'www','games',id,'index.html'),'utf8'),m=h.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);const c={self:{},module:{exports:{}},exports:{},console,setTimeout,clearTimeout,performance:{now:()=>Date.now()}};vm.createContext(c);vm.runInContext(m[1],c);return c.module.exports();}
function adapter(id,E){const h=fs.readFileSync(path.join(ROOT,'www','games',id,'index.html'),'utf8'),m=h.match(/\/\* -+ Telegram multiplayer \*\/([\s\S]*?)\n\s*\/\* -{20,}/);const c={E,console,Date,Math,Number,String,Object,Array,JSON,setTimeout,clearTimeout,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),S:null,G:null,MP:null,mpActions:[],M:{},C:{ui:{toast(){}},t:k=>k},ctx:{store:{set(){}}},prefs:{},render(){},save(){},finish(){},stopAi(){},stopAnim(){},drawAll(){},resize(){},refresh(){},announceOpening(){},cancelThink(){},mpHost:{},sel:null,pend:null,anim:null,note:'',cursor:-1,cur:null,kf:-1,lastTo:null,targets:[]};vm.createContext(c);vm.runInContext(m[1],c);return c;}
function hash32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function core(){const src=fs.readFileSync(path.join(ROOT,'www','lib','multiplayer.js'),'utf8');const C={state:{profile:{telegramId:'1234567890123456789',telegramName:'ABCDEFGHIJKLMNOPQR'}},strings(){},t:k=>k,hash32,storage(){return{set(){},get(k,d){return d},remove(){}}},ui:{toast(){},modal(){}},el(){return{appendChild(){},addEventListener(){}}},icon(){}};const c={window:null,Chogan:C,MINI_ARCADE_CONFIG:{},console,TextEncoder,TextDecoder,Uint8Array,Map,JSON,Math,Number,String,Object,Array,Date,setTimeout,clearTimeout,URLSearchParams,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),crypto:crypto.webcrypto,sessionStorage:{getItem(){return''},setItem(){},removeItem(){}},navigator:{},location:{search:'',pathname:'/'},document:{}};c.window=c;vm.createContext(c);vm.runInContext(src,c);return C.multiplayer;}
const M=core(),P1=['1234567890123456789','ABCDEFGHIJKLMNOPQR'],P2=['9876543210987654321','QRSTUVWXYZABCDEFGH'];
function token(game,q,t,s,m,u=[1,2],x=null){return M.encode({v:1,g:game,i:'abcdefghijklmn',q,a:P1,b:P2,u,t,s,m,p:'zzzzzzz',x});}
try{
  // Reversi: play a complete game and validate every Telegram hand-off, including passes.
  {
    const E=loadEngine('reversi'),A=adapter('reversi',E);let st=A.mpState({b:E.initial().join(''),t:1,l:-1,d:false}),q=0,max=0,ex=0;
    while(!st.done&&q<80){const local=A.mpSnapshotOf(st),owner=st.turn,acts=[];do{const ms=E.legalMoves(st.board,st.turn);if(!ms.length)break;const mv=ms[(q+acts.length*3)%ms.length],r=E.applyMove(st,mv);st.last=mv;st.done=!!r.over;acts.push(mv);if(st.done||st.turn!==owner)break;}while(1);q++;const snap=A.mpSnapshotOf(st);if(!A.mpValidate({q,m:acts,s:snap},q===1?null:{s:local}))throw Error('reversi replay failed');max=Math.max(max,token('reversi',q,st.turn,snap,acts).length);ex++;}
    ok(st.done&&ex>20,'Reversi survives a complete cross-device replay game','exchanges='+ex+', maxToken='+max);ok(max<=512,'Reversi complete-game packets stay inside conservative Telegram budget','max='+max);
  }
  // Mancala: complete game with extra-turn batching.
  {
    const E=loadEngine('mancala'),A=adapter('mancala',E);let st=A.mpState({b:E.newBoard(4),t:0,d:false}),q=0,max=0,extraBatches=0;
    while(!st.done&&q<100){const local=A.mpSnapshotOf(st),owner=st.turn,acts=[];do{const ms=E.legalMoves(st.board,st.turn);if(!ms.length)break;const pit=ms[(q+acts.length)%ms.length],info=E.applyMove(st,pit);acts.push(pit);if(info.extra&&!info.over)extraBatches++;if(info.over||st.turn!==owner)break;}while(1);q++;const snap=A.mpSnapshotOf(st);if(!A.mpValidate({q,m:acts,s:snap},q===1?null:{s:local}))throw Error('mancala replay failed');max=Math.max(max,token('mancala',q,st.turn,snap,acts,[0,1]).length);}
    ok(st.done&&extraBatches>0,'Mancala survives a complete game with batched extra turns','exchanges='+q);ok(max<=512,'Mancala complete-game packets stay inside conservative Telegram budget','max='+max);
  }
  // Dots 8x8: complete maximum board; every scoring chain stays one hand-off.
  {
    const E=loadEngine('dots'),A=adapter('dots',E),z=A.mpState({n:8,h:'',d:false});let st=z.st,bd=z.bd,q=0,max=0,chains=0;
    while(!st.done&&q<200){const local=A.mpSnapshotOf(st),owner=st.turn,acts=[];do{const ms=E.legalMoves(bd,st.edges);if(!ms.length)break;const e=ms[(q*11+acts.length*7)%ms.length],before=st.turn;E.applyEdge(bd,st,e);st.lastEdge=e;acts.push(e);if(st.turn===before)chains++;if(!E.legalMoves(bd,st.edges).length){st.done=true;break;}if(st.turn!==owner)break;}while(1);q++;const snap=A.mpSnapshotOf(st);if(!A.mpValidate({q,m:acts,s:snap},{s:local}))throw Error('dots replay failed');max=Math.max(max,token('dots',q,st.turn,snap,acts).length);}
    ok(st.done&&st.history.length===bd.E&&chains>0,'Dots & Boxes completes the full 8×8 board with scoring-chain batching','edges='+st.history.length+', exchanges='+q);ok(max<=512,'Dots 8×8 packets stay inside conservative Telegram budget','max='+max);
  }
  // Morris: thousands of randomized legal games; replay and token size at the longest observed game.
  {
    const E=loadEngine('morris'),A=adapter('morris',E);let longest=0,max=0,replays=true,draws=0;
    for(let seed=1;seed<=750;seed++){const R=rng(seed);let st=E.newState('tg','medium');while(!st.result&&st.history.length<1000){const ms=E.movesOf(st.board,st.hand,st.turn);if(!ms.length)break;E.apply(st,ms[Math.floor(R()*ms.length)]);}if(st.result&&!st.result.winner)draws++;const h=A.mpPackHistory(st),rp=A.mpReplay(h);if(!rp||JSON.stringify(rp.board)!==JSON.stringify(st.board)||rp.turn!==st.turn)replays=false;longest=Math.max(longest,st.history.length);const lm=st.history.length?st.history[st.history.length-1].m:null;max=Math.max(max,token('morris',st.history.length,st.turn,{h},lm?[lm.from,lm.to,lm.remove]:null).length);}
    ok(replays&&longest>80,'Morris randomized stress replay is deterministic','750 games, longest='+longest+', draws='+draws);ok(max<=512,'Morris stress packets stay inside conservative Telegram budget','max='+max);
  }
  // Backgammon: deterministic full-turn exchanges across many turns.
  {
    const E=loadEngine('backgammon'),A=adapter('backgammon',E);let st=E.newGame(0xA51CE55),q=0,max=0;
    while(!st.winner&&q<250){const local=A.mpSnapshotOf(st),tp=E.turnPlays(st,st.turn,st.left);if(!tp.plays.length)throw Error('no backgammon turn play');const pl=tp.plays[q%tp.plays.length],flat=[];for(const m of pl.steps){if(!E.play(st,m))throw Error('backgammon legal step rejected');flat.push(m.from,m.to,m.die);if(st.winner)break;}if(!st.winner){if(!E.canEnd(st)||!E.endTurn(st))throw Error('backgammon turn did not end');}st.hist=[];q++;const snap=A.mpSnapshotOf(st);if(!A.mpValidate({q,m:flat,s:snap},{s:local}))throw Error('backgammon replay failed');max=Math.max(max,token('backgammon',q,st.turn,snap,flat,[1,2]).length);}
    ok(st.winner&&q>10,'Backgammon survives deterministic whole-dice-turn exchange until a winner','turns='+q);ok(max<=512,'Backgammon packets stay inside conservative Telegram budget','max='+max);
  }
  // Chess: force an unusually long legal game. Checkpoints after irreversible moves bound packet growth.
  {
    const E=loadEngine('chess'),A=adapter('chess',E);let st=E.parse(E.START),fens=[E.START],codes=[],max=0,valid=true;
    for(let i=0;i<650;i++){
      const ls=E.legal(st);if(!ls.length)break;const half=+E.fen(st).split(' ')[4],special=[];for(let j=0;j<ls.length;j++){const pc=st.board[ls[j].from],cap=st.board[ls[j].to]!=='.'||ls[j].ep;if(half>70&&(String(pc).toLowerCase()==='p'||cap))special.push(j);}const idx=special.length?special[(i*13)%special.length]:(i*29+7)%ls.length,m=ls[idx];codes.push(idx);st=E.make(st,m);fens.push(E.fen(st));A.G={fens,sans:[],mpCodes:codes,mpBaseOffset:0};const snap=A.mpSnapshot();if(!A.mpValidate({q:codes.length,t:st.turn,s:snap,m:idx}))valid=false;max=Math.max(max,token('chess',codes.length,st.turn,snap,idx,['w','b']).length);const status=E.status(fens);if(status.over)break;
    }
    ok(valid&&codes.length>300,'Chess validates every checkpoint in an unusually long legal game','plies='+codes.length);ok(max<=512,'Chess checkpoints prevent long-game startapp overflow','max='+max);
  }
}catch(e){fail++;console.error('FAIL  uncaught multiplayer stress error: '+(e.stack||e));}
console.log(`\nTMA multiplayer stress: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);

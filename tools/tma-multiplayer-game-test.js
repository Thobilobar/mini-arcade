#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
let pass=0,fail=0;
function ok(v,m){if(v){pass++;console.log('PASS  '+m);}else{fail++;console.error('FAIL  '+m);}}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function loadEngine(id){
  const h=fs.readFileSync(path.join(ROOT,'www','games',id,'index.html'),'utf8');
  const m=h.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);if(!m)throw Error('engine block missing '+id);
  const c={self:{},module:{exports:{}},exports:{},console,setTimeout,clearTimeout,performance:{now:()=>Date.now()}};vm.createContext(c);vm.runInContext(m[1],c,{filename:id+'-engine.js'});return c.module.exports();
}
function adapter(id,E){
  const h=fs.readFileSync(path.join(ROOT,'www','games',id,'index.html'),'utf8');
  const m=h.match(/\/\* -+ Telegram multiplayer \*\/([\s\S]*?)\n\s*\/\* -{20,}/);if(!m)throw Error('adapter block missing '+id);
  const c={E,console,Date,Math,Number,String,Object,Array,JSON,setTimeout,clearTimeout,
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
    S:null,G:null,MP:null,mpActions:[],M:{},C:{ui:{toast(){}},t:k=>k},ctx:{store:{set(){}}},prefs:{},
    render(){},save(){},finish(){},stopAi(){},stopAnim(){},drawAll(){},resize(){},refresh(){},announceOpening(){},cancelThink(){},clearTimeout,
    mpHost:{},sel:null,pend:null,anim:null,note:'',cursor:-1,cur:null,kf:-1,lastTo:null,targets:[]};
  vm.createContext(c);vm.runInContext(m[1],c,{filename:id+'-mp.js'});return c;
}
try{
  // Reversi: opening replay, tamper rejection, and automatic pass replay.
  {
    const E=loadEngine('reversi'),A=adapter('reversi',E),base=A.mpState({b:E.initial().join(''),t:1,l:-1,d:false});
    const mv=E.legalMoves(base.board,base.turn)[0],r=E.applyMove(base,mv);base.last=mv;base.done=!!r.over;const snap=A.mpSnapshotOf(base);
    ok(A.mpValidate({q:1,m:[mv],s:snap},null),'Reversi validates first Telegram move by replaying it');
    const bad=JSON.parse(JSON.stringify(snap));bad.b=(bad.b[0]==='0'?'1':'0')+bad.b.slice(1);ok(!A.mpValidate({q:1,m:[mv],s:bad},null),'Reversi rejects a tampered board snapshot');
    let st=A.mpState({b:E.initial().join(''),t:1,l:-1,d:false}),found=false;
    for(let ply=0;ply<60&&!st.done;ply++){
      const ms=E.legalMoves(st.board,st.turn);if(!ms.length)break;const before=A.mpSnapshotOf(st),m=ms[ply%ms.length],rr=E.applyMove(st,m);st.last=m;st.done=!!rr.over;
      if(rr.passed&&!rr.over){found=A.mpValidate({q:ply+2,m:[m],s:A.mpSnapshotOf(st)},{s:before});break;}
    }
    ok(found,'Reversi validates an automatic-pass turn without an extra Telegram round trip');
  }
  // Mancala: extra turns are batched and conservation is enforced.
  {
    const E=loadEngine('mancala'),A=adapter('mancala',E),st=A.mpState({b:E.newBoard(4),t:0,d:false}),acts=[];
    let info=E.applyMove(st,2);acts.push(2);ok(info&&info.extra,'Mancala fixture reaches an opening extra turn');
    if(info.extra&&!info.over){const m=E.legalMoves(st.board,st.turn)[0];info=E.applyMove(st,m);acts.push(m);}
    const snap=A.mpSnapshotOf(st);ok(A.mpValidate({q:1,m:acts,s:snap},null),'Mancala validates a batched same-player extra-turn sequence');
    const bad=JSON.parse(JSON.stringify(snap));bad.b[0]++;ok(!A.mpValidate({q:1,m:acts,s:bad},null),'Mancala rejects seed-count tampering');
  }
  // Dots: binary edge history, duplicate rejection, and box extra-turn batching.
  {
    const E=loadEngine('dots'),A=adapter('dots',E),z=A.mpState({n:3,h:'',d:false}),st=z.st,bd=z.bd;
    const box=bd.boxEdges[0];for(let i=0;i<3;i++){E.applyEdge(bd,st,box[i]);st.lastEdge=box[i];}
    const local=A.mpSnapshotOf(st),close=box[3];let acts=[close];E.applyEdge(bd,st,close);st.lastEdge=close;
    if(st.turn===A.mpState(local).st.turn){const next=E.legalMoves(bd,st.edges)[0];E.applyEdge(bd,st,next);st.lastEdge=next;acts.push(next);}
    st.done=E.legalMoves(bd,st.edges).length===0;const target=A.mpSnapshotOf(st);
    ok(A.mpValidate({q:7,m:null,s:target},{s:local}),'Dots & Boxes validates a box-completing extra-turn batch');
    const dup=A.mpPackEdges([{e:0},{e:0}],24);ok(dup==='', 'Dots & Boxes cannot encode duplicate edges into transported history');
    const full=A.mpState({n:8,h:'',d:false});for(let e=0;e<full.bd.E;e++){E.applyEdge(full.bd,full.st,e);full.st.lastEdge=e;}full.st.done=true;
    const packed=A.mpSnapshotOf(full.st),round=A.mpState(packed);ok(!!round&&round.st.done&&round.st.history.length===full.bd.E,'Dots & Boxes reconstructs a complete 8×8 Telegram match from compact history');
  }
  // Morris: replay reconstructs all derived state and rejects altered history/action.
  {
    const E=loadEngine('morris'),A=adapter('morris',E),st=E.newState('tg','medium');let last=null;
    for(let i=0;i<45&&!st.result;i++){const ms=E.movesOf(st.board,st.hand,st.turn);if(!ms.length)break;last=ms[(i*7)%ms.length];E.apply(st,last);}
    const h=A.mpPackHistory(st),rp=A.mpReplay(h);ok(!!rp&&same(rp.board,st.board)&&same(rp.hand,st.hand)&&rp.turn===st.turn&&rp.quiet===st.quiet,'Morris replay reconstructs board, hand, turn and draw clock');
    ok(A.mpValidate({q:st.history.length,t:st.turn,s:{h},m:last?[last.from,last.to,last.remove]:null}),'Morris validates its exact replay history and latest move');
    if(last){ok(!A.mpValidate({q:st.history.length,t:st.turn,s:{h},m:[last.from,last.to,(last.remove+2)%24-1]}),'Morris rejects a latest-action mismatch');}
    const corrupt=h.length>=3?h.slice(0,-3)+'zzz':'zzz';ok(!A.mpReplay(corrupt),'Morris rejects impossible/corrupted replay history');
  }
  // Backgammon: a whole dice turn is one transport unit; illegal die/state tampering fails.
  {
    const E=loadEngine('backgammon'),A=adapter('backgammon',E),seed=12345,base=E.newGame(seed),tp=E.turnPlays(base,base.turn,base.left),pl=tp.plays[0];
    const flat=[];for(const m of pl.steps){ok(E.play(base,m),'Backgammon fixture step is legal');flat.push(m.from,m.to,m.die);}ok(E.canEnd(base),'Backgammon complete legal play can end its dice turn');E.endTurn(base);base.hist=[];
    const snap=A.mpSnapshotOf(base);ok(A.mpValidate({q:1,m:flat,s:snap},null),'Backgammon validates a complete deterministic dice turn as one Telegram update');
    const badActs=flat.slice();badActs[2]=badActs[2]===6?1:6;ok(!A.mpValidate({q:1,m:badActs,s:snap},null),'Backgammon rejects an action using the wrong die');
    const bad=JSON.parse(JSON.stringify(snap));bad.p[0]+=1;ok(!A.mpValidate({q:1,m:flat,s:bad},null),'Backgammon rejects checker-conservation tampering');
  }
  // Chess: legal-index history replay, long games, illegal code, and resignation metadata.
  {
    const E=loadEngine('chess'),A=adapter('chess',E);let st=E.parse(E.START),fens=[E.START],codes=[];
    for(let i=0;i<180;i++){const ls=E.legal(st);if(!ls.length)break;const idx=(i*17+3)%ls.length,m=ls[idx];codes.push(idx);st=E.make(st,m);fens.push(E.fen(st));if(E.status(fens).over)break;}
    const h=A.mpPack(codes,E.START),snap={f:E.START,h:h,o:0},rp=A.mpReplay(snap);ok(!!rp&&E.fen(rp.S)===E.fen(st)&&rp.G.mpCodes.length===codes.length,'Chess reconstructs a long Telegram game from legal-move indices');
    ok(A.mpValidate({q:codes.length,t:st.turn,s:snap,m:codes[codes.length-1]}),'Chess validates legal replay revision and side to move');
    const raw=Buffer.from(h.replace(/-/g,'+').replace(/_/g,'/'),'base64');if(raw.length){raw[raw.length-1]=255;const badh=raw.toString('base64url');ok(!A.mpReplay({f:E.START,h:badh,o:0}),'Chess rejects an out-of-range legal-move index');}
    ok(A.mpValidate({q:codes.length+1,t:st.turn,s:snap,x:{end:'resign',loser:st.turn},m:['R',st.turn]}),'Chess accepts a valid resignation as a terminal metadata update');
    ok(!A.mpValidate({q:codes.length+1,t:st.turn,s:snap,x:{end:'resign',loser:'x'},m:['R','x']}),'Chess rejects invalid resignation side metadata');
  }
}catch(e){fail++;console.error('FAIL  uncaught per-game multiplayer error: '+(e.stack||e));}
console.log(`\nTMA multiplayer game adapters: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);

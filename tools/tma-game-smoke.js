#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(v, m) { if (v) { pass++; console.log('PASS  ' + m); } else { fail++; console.error('FAIL  ' + m); } }
function rng(seed) { let a=seed>>>0; const f=()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}; f.int=n=>Math.floor(f()*n); return f; }
function load(id) {
  const h=fs.readFileSync(path.join(ROOT,'www','games',id,'index.html'),'utf8');
  const m=h.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
  if(!m) throw new Error('engine block missing: '+id);
  const c={self:{},module:{exports:{}},exports:{},console,setTimeout,clearTimeout,performance:{now:()=>Date.now()}};
  vm.createContext(c); vm.runInContext(m[1],c,{filename:id+'-engine.js',timeout:5000});
  return c.module.exports();
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}

try {
  { const E=load('sudoku'), p=E.makePuzzle(rng(41),'easy'); ok(!!p && E.solveCount(p.puzzle,2)===1 && same(E.solve(p.puzzle),p.solution),'Sudoku generates a unique solvable puzzle'); }
  { const E=load('minesweeper'), nb=E.makeNeighbors(9,9), safe=40, g=E.generate({rows:9,cols:9,mines:10,rnd:rng(42),safe,nb,noGuess:false,budgetMs:500}); ok(g.mine.reduce((a,b)=>a+b,0)===10 && !g.mine[safe],'Minesweeper generates correct mine count with safe first click'); }
  { const E=load('dots'), b=E.makeBoard(3,3), edges=new Array(b.E).fill(0), owner=new Array(b.boxes).fill(0), moves=E.legalMoves(b,edges); const before=moves.length; E.play(b,edges,owner,moves[0],1); ok(E.legalMoves(b,edges).length===before-1,'Dots and Boxes accepts a legal edge and consumes it'); }
  { const E=load('nonogram'); const heart=[0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,1,0,0,0,1,0,0], c=E.cluesOf(heart,5), s=E.solve(c.rows,c.cols); ok(s.solved && same(s.grid,heart),'Nonogram clue solver reconstructs a known puzzle'); }
  { const E=load('mancala'), board=E.newBoard(4), S=E.newState('2p','medium',board,false), snap=JSON.stringify(S.board), m=E.legalMoves(S.board,S.turn)[0]; const info=E.applyMove(S,m), und=E.takeBack(S); ok(!!info && und===1 && JSON.stringify(S.board)===snap,'Mancala move and undo round-trip'); }
  { const E=load('freecell'), S=E.newGame(617); ok(E.validDeal(617) && E.validState(S) && S.cols.reduce((n,c)=>n+c.length,0)+S.cells.filter(x=>x>=0).length+S.found.reduce((a,b)=>a+b,0)===52,'FreeCell creates a valid 52-card state'); }
  { const E=load('peg'), S=E.newGame(E.CENTRE), first=E.legalMoves(S.board), before=E.pegCount(S.board); const moved=E.applyMove(S,first[0].from,first[0].to), u=E.undo(S); ok(first.length===4 && moved && E.pegCount(S.board)===before && u,'Peg Solitaire legal jump and undo round-trip'); }
  { const E=load('reversi'), S=E.newState('2p'), start=S.board.join(','), moves=E.legalMoves(S.board,1), r=E.applyMove(S,moves[0]), u=E.takeBack(S); ok(moves.length===4 && !!r && u===1 && S.board.join(',')===start,'Reversi opening move and undo round-trip'); }
  { const E=load('backgammon'), I=E.initial(), S=E.newGame(12345), turns=E.turnPlays(S,S.turn,S.left); ok(E.count(I,1)===15 && E.count(I,2)===15 && E.pips(I,1)===167 && E.pips(I,2)===167 && turns && Array.isArray(turns.plays) && turns.plays.length>0,'Backgammon initial position and opening legal plays are valid'); }
  { const E=load('morris'), S=E.newState('2p','medium'), moves=E.movesOf(S.board,S.hand,S.turn), snap=JSON.stringify([S.board,S.hand,S.turn]), m=moves[0]; E.apply(S,m); const n=E.takeBack(S); ok(moves.length===24 && n===1 && JSON.stringify([S.board,S.hand,S.turn])===snap,'Nine Men’s Morris placement and undo round-trip'); }
  { const E=load('battleship'), a=E.randomFleet(rng(7)), b=E.randomFleet(rng(8)), G=E.newGame(a,b,'medium'), target=E.cellsOf(G.foe.ships[0])[0], shot=E.playerFire(G,target); ok(E.validFleet(a)&&E.validFleet(b)&&shot&&shot.result==='hit','Battleship creates valid fleets and records a hit'); }
  { const E=load('bridges'), p=E.generate(rng(9),7); const g=p&&E.build(7,p.islands), S=g&&{bridges:new Array(g.edges.length).fill(0),history:[]}; let cyc=-1; if(g&&g.edges.length) cyc=E.cycle(g,S,0); const u=S?E.undo(S):-1; ok(!!p&&!!g&&g.edges.length>0&&cyc===1&&u===0&&S.bridges[0]===0,'Bridges generates a puzzle and bridge cycle/undo works'); }
  { const E=load('mastermind'), secret=E.makeSecret(rng(10),'easy'), S=E.newState('easy',secret), row=E.submit(S,secret); ok(row&&row.b===4&&row.w===0&&S.won&&S.done,'Code Breaker accepts an exact winning guess'); }
  { const E=load('breakout'), S=E.createGame(0), before=E.breakableLeft(S); E.launch(S); const ev=E.step(S,S.px); ok(E.LEVELS.length===12&&before>0&&!S.attached&&Array.isArray(ev),'Breakout launches and advances a valid level'); }
  { const E=load('pasur'), S=E.newDeal(rng(11)), total=S.deck.length+S.table.length+S.hands[0].length+S.hands[1].length; ok(total===52&&S.table.length===4&&S.hands[0].length===4&&S.hands[1].length===4,'Pasur deals all 52 cards without loss'); }
  { const E=load('mahjong'), S=E.deal('small',rng(12)), pair=S.solution[0], before=E.left(S), rem=E.remove(S,pair[0],pair[1]), u=E.undo(S); ok(S.faces.length===72&&rem&&before===72&&u&&E.left(S)===72,'Mahjong solvable deal removes and restores a solution pair'); }
  { const E=load('chess'), S=E.parse(E.START); ok(E.legal(S).length===20&&E.perft(S,2)===400&&E.fen(S)===E.START,'Chess opening legal moves, perft(2), and FEN round-trip'); }
  { const E=load('tower-defence'), p=E.genPath(rng(13),{minTurns:5}), G=E.createGame({path:p}); let spot=null; for(let r=0;r<E.GH&&!spot;r++)for(let c=0;c<E.GW&&!spot;c++)if(E.canBuild(G,r,c))spot={r,c}; const built=spot&&E.build(G,spot.r,spot.c,'archer'); E.startWave(G,rng(14)); const t0=G.time; E.step(G,0.1,rng(15)); ok(!E.validatePath(p)&&!!built&&G.wave===1&&G.waveActive&&G.time>t0,'Tower Defence path, build, wave start, and simulation step work'); }
} catch (e) { fail++; console.error('FAIL  uncaught smoke-test error: '+(e.stack||e)); }
console.log(`\nTMA game smoke: ${pass}/${pass+fail} passed`);
process.exit(fail?1:0);

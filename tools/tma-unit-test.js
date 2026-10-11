#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'www/lib/tma.js'), 'utf8');
let checks = 0, failures = 0;
function ok(v, msg) { checks++; if (!v) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); }

class LocalStorageMock {
  constructor(shared) { this.m = shared || new Map(); }
  get length() { return this.m.size; }
  key(i) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  setItem(k,v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(String(k)); }
}

function makeTelegram(device, secure, opts={}) {
  const events = Object.create(null);
  const back = { visible:false, handler:null, show(){this.visible=true;}, hide(){this.visible=false;}, onClick(fn){this.handler=fn;} };
  function api(map, withRestore) {
    return {
      setItem(k,v,cb){ map.set(k,String(v)); setTimeout(()=>cb && cb(null,true),0); },
      getItem(k,cb){ setTimeout(()=>cb && cb(null,map.has(k)?map.get(k):null, withRestore ? false : undefined),0); },
      removeItem(k,cb){ map.delete(k); setTimeout(()=>cb && cb(null,true),0); },
      clear(cb){ map.clear(); setTimeout(()=>cb && cb(null,true),0); },
      restoreItem: withRestore ? function(k,cb){ setTimeout(()=>cb && cb('NOT_RESTORABLE',null),0); } : undefined
    };
  }
  const tg = {
    version:'10.1', platform:'tdesktop', colorScheme:'dark',
    initData:'mock', initDataUnsafe:{ user:{ id:77, first_name:'Ada', last_name:'Tester', username:'ada', language_code:'en', photo_url:'https://example.invalid/a.png', is_premium:true } },
    viewportHeight:800, viewportStableHeight:790,
    safeAreaInset:{top:10,bottom:11,left:12,right:13}, contentSafeAreaInset:{top:2,bottom:3,left:4,right:5},
    themeParams:{bg_color:'#111111',text_color:'#eeeeee'},
    DeviceStorage:api(device,false), SecureStorage:api(secure,true), BackButton:back,
    HapticFeedback:{ impactOccurred(){ tg._haptic=true; }, notificationOccurred(){ tg._haptic=true; }, selectionChanged(){tg._haptic=true;} },
    ready(){tg._ready=true;}, expand(){tg._expanded=true;}, disableVerticalSwipes(){}, setHeaderColor(){}, setBackgroundColor(){},
    isVersionAtLeast(){return true;}, onEvent(n,fn){(events[n] ||= []).push(fn);},
    openTelegramLink(u){tg._shared=u;}, requestFullscreen(){tg.isFullscreen=true;}, exitFullscreen(){tg.isFullscreen=false;}, isFullscreen:false
  };
  return tg;
}

function makeDocument() {
  const vars = Object.create(null), attrs=Object.create(null), classes=new Set();
  return {
    hidden:false,
    documentElement:{
      style:{ setProperty(k,v){vars[k]=v;}, removeProperty(k){delete vars[k];} },
      setAttribute(k,v){attrs[k]=String(v);},
      classList:{add(k){classes.add(k);}}
    },
    addEventListener(){},
    _vars:vars,_attrs:attrs,_classes:classes
  };
}

async function load(shared, pathname) {
  const doc=makeDocument();
  const tg=makeTelegram(shared.device,shared.secure);
  const local=new LocalStorageMock(shared.local);
  const location={pathname,href:'https://app.example'+pathname};
  const sandbox={
    console, crypto:webcrypto, TextEncoder, TextDecoder, Uint8Array, Promise,
    setTimeout, clearTimeout, btoa:s=>Buffer.from(s,'binary').toString('base64'), atob:s=>Buffer.from(s,'base64').toString('binary'),
    document:doc, location, localStorage:local, indexedDB:undefined,
    Telegram:{WebApp:tg}, navigator:{}, addEventListener(){},
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC,sandbox,{filename:'tma.js'});
  await sandbox.MiniArcadeTMA.ready;
  return {sandbox,tg,doc,local,bridge:sandbox.MiniArcadeTMA,location};
}

(async()=>{
  const shared={device:new Map([['unrelated','keep']]),secure:new Map([['other-secret','keep']]),local:new Map([
    ['chogan.app.settings','{"lang":"fa"}'],
    ['chogan.test.score','42']
  ])};

  const a=await load(shared,'/index.html');
  ok(a.bridge.storageMode()==='telegram-secure','uses Telegram SecureStorage + DeviceStorage');
  ok(a.tg._ready && a.tg._expanded,'calls Telegram ready() and expand()');
  ok(a.bridge.user().name==='Ada Tester' && a.bridge.user().username==='ada','hydrates Telegram user fields');
  ok(a.doc._classes.has('is-telegram-mini-app'),'marks Telegram Mini App root class');
  ok(a.doc._vars['--tg-safe-left']==='12px' && a.doc._vars['--tg-content-safe-right']==='5px','applies Telegram safe-area CSS variables');
  ok(a.tg.BackButton.visible===false,'hides Telegram BackButton on the root menu');
  ok(!shared.local.has('chogan.app.settings') && !shared.local.has('chogan.test.score'),'removes legacy plaintext source keys after migration');
  ok(a.bridge.storage.getRaw('miniarcade.app.settings')==='{"lang":"fa"}' && a.bridge.storage.getRaw('miniarcade.test.score')==='42','migrates legacy values into new namespace');
  await a.bridge.storage.flush();
  const cipher=shared.device.get('mini_arcade_vault_v1') || '';
  ok(cipher.length>40 && !cipher.includes('"lang":"fa"') && !cipher.includes('42'),'DeviceStorage contains ciphertext rather than recognizable app data');
  ok(shared.secure.has('mini_arcade_key_v1'),'AES key is stored in SecureStorage');

  a.bridge.storage.setRaw('miniarcade.test.persist','secret-value');
  await a.bridge.storage.flush();
  const b=await load(shared,'/index.html');
  ok(b.bridge.storage.getRaw('miniarcade.test.persist')==='secret-value','encrypted vault decrypts across a fresh page context');
  ok(b.bridge.haptic('success') && b.tg._haptic===true,'uses Telegram native haptics');
  ok(b.bridge.shareText('hello') && /t\.me\/share\/url/.test(b.tg._shared || ''),'uses Telegram share routing');

  const game=await load(shared,'/games/sudoku/index.html');
  ok(game.tg.BackButton.visible===true && typeof game.tg.BackButton.handler==='function','shows Telegram BackButton on game pages');
  const privacy=await load(shared,'/privacy.html');
  ok(privacy.tg.BackButton.visible===true && typeof privacy.tg.BackButton.handler==='function','shows Telegram BackButton on privacy subpage');

  await b.bridge.reset();
  ok(!shared.device.has('mini_arcade_vault_v1') && !shared.secure.has('mini_arcade_key_v1'),'reset removes Mini Arcade vault and AES key');
  ok(shared.device.get('unrelated')==='keep' && shared.secure.get('other-secret')==='keep','reset preserves unrelated bot storage keys');

  console.log(`\nTMA bridge unit test: ${checks-failures}/${checks} passed`);
  process.exit(failures?1:0);
})().catch(e=>{console.error(e && e.stack || e);process.exit(1);});

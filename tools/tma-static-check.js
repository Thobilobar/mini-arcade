#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, label, detail) {
  if (cond) {
    passed++;
    console.log('PASS  ' + label);
  } else {
    failed++;
    const msg = label + (detail ? ' — ' + detail : '');
    failures.push(msg);
    console.error('FAIL  ' + msg);
  }
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(WWW, rel)); }
function allFiles(dir, pred, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) allFiles(p, pred, out);
    else if (!pred || pred(p)) out.push(p);
  }
  return out;
}
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function parseInlineScripts(html, file) {
  const rx = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = rx.exec(html))) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    const body = m[2].trim();
    if (!body) continue;
    n++;
    try { new Function(body); }
    catch (e) { throw new Error(`${file} inline script #${n}: ${e.message}`); }
  }
  return n;
}

const manifest = JSON.parse(read(path.join(WWW, 'manifest.webmanifest')));
const catalogue = JSON.parse(read(path.join(WWW, 'games.json')));
const games = catalogue.games || [];

ok(games.length === 18, 'catalogue contains all 18 games', `found ${games.length}`);
const ids = games.map(g => g.id);
ok(new Set(ids).size === ids.length, 'game IDs are unique');
for (const g of games) {
  ok(exists(g.path), `${g.id}: page exists`, g.path);
  ok(exists(g.icon), `${g.id}: icon exists`, g.icon);
  for (const extra of (g.files || [])) ok(exists(extra), `${g.id}: extra file exists`, extra);
}

const appPages = [path.join(WWW, 'index.html'), ...games.map(g => path.join(WWW, g.path))];
for (const page of appPages) {
  const h = read(page);
  const tgPos = h.indexOf('https://telegram.org/js/telegram-web-app.js');
  const tmaPos = h.search(/(?:\.\.\/)*lib\/tma\.js/);
  const corePos = h.search(/(?:\.\.\/)*lib\/chogan\.js/);
  ok(tgPos >= 0 && tmaPos > tgPos && corePos > tmaPos, `${rel(page)}: Telegram → bridge → core script order`);
  ok(/await\s+C\.ready\b/.test(h), `${rel(page)}: waits for encrypted vault hydration`);
  ok(!/C\.achievements\b|\bachievement\b|\bleague\b|\baward\b/i.test(h), `${rel(page)}: no league/achievement/award runtime`);
  ok(!/چوگان|choganhq|github\.com\/choganhq/i.test(h), `${rel(page)}: no old visible branding/source attribution`);
}

const index = read(path.join(WWW, 'index.html'));
const tabs = (index.match(/\{\s*id:\s*'(?:home|daily|profile)'/g) || []).length;
ok(tabs === 3, 'root navigation exposes exactly Home, Daily, Profile', `found ${tabs}`);
ok(/profileAvatar\(/.test(index) && /photoUrl/.test(index), 'root UI renders Telegram profile photo when available');

ok(manifest.name === 'Mini Arcade' && manifest.short_name === 'Mini Arcade', 'manifest is branded Mini Arcade');
ok(!/چوگان|chogan|open.?source|github/i.test(JSON.stringify(manifest)), 'manifest has no old brand/source claims');
const shortcuts = manifest.shortcuts || [];
ok(shortcuts.every(s => !s.url || exists(String(s.url).replace(/^\.\//, ''))), 'manifest shortcut targets exist');

const sw = read(path.join(WWW, 'sw.js'));
ok(/mini-arcade-v/i.test(sw), 'service worker uses Mini Arcade cache namespace');
ok(/lib\/tma\.js/.test(sw), 'service worker precaches the TMA bridge');
ok(/config\.js/.test(sw) && /lib\/multiplayer\.js/.test(sw), 'service worker precaches Telegram multiplayer runtime');
ok(!/چوگان|choganhq/i.test(sw), 'service worker has no old visible branding');


const mpGames = ['chess','reversi','mancala','dots','morris','backgammon'];
const mpLib = read(path.join(WWW, 'lib', 'multiplayer.js'));
ok(exists('config.js') && /botUsername/.test(read(path.join(WWW,'config.js'))), 'Telegram multiplayer deployment config exists');
ok(mpGames.every(id => /lib\/multiplayer\.js/.test(read(path.join(WWW,'games',id,'index.html')))), 'all six multiplayer games load the shared Telegram transport');
ok(mpGames.every(id => /tgFriend/.test(read(path.join(WWW,'games',id,'index.html')))), 'all six multiplayer games expose Telegram Friend mode');
ok(/routeIncoming/.test(index) && /lib\/multiplayer\.js/.test(index), 'root routes incoming Telegram match links');
ok(/AES|checksum|revision|spectator|startapp/i.test(mpLib), 'multiplayer runtime contains integrity, revision and spectator handling');

const privacy = read(path.join(WWW, 'privacy.html'));
ok(/AES-GCM/i.test(privacy) && /DeviceStorage/.test(privacy) && /SecureStorage/.test(privacy), 'privacy page documents the encrypted Telegram vault');
ok(!/mailto:|github\.com|choganhq|چوگان/i.test(privacy), 'privacy page contains no old author/source contact');

const tma = read(path.join(WWW, 'lib', 'tma.js'));
for (const token of ['SecureStorage', 'DeviceStorage', 'AES-GCM', 'BackButton', 'HapticFeedback', 'requestFullscreen', 'initDataUnsafe']) {
  ok(tma.includes(token), `TMA bridge implements ${token}`);
}
ok(/mini_arcade_key_v1/.test(tma) && /mini_arcade_vault_v1/.test(tma), 'TMA storage keys are app-scoped');
ok(/LEGACY_PREFIXES\s*=\s*\['chogan\.',\s*'miniarcade\.'\]/.test(tma), 'legacy plaintext migration is explicitly scoped');

const userPages = [...appPages, path.join(WWW, 'privacy.html')];
for (const page of userPages) {
  const h = read(page);
  ok(!/\blocalStorage\b/.test(h), `${rel(page)}: no direct plaintext localStorage access`);
}

const htmlFiles = allFiles(WWW, p => p.endsWith('.html')).concat([path.join(ROOT, 'template', 'game', 'index.html')]);
let inlineCount = 0;
try {
  for (const f of htmlFiles) inlineCount += parseInlineScripts(read(f), rel(f));
  ok(true, `all ${inlineCount} inline JavaScript blocks parse`);
} catch (e) {
  ok(false, 'all inline JavaScript blocks parse', e.message);
}

// Only the official Telegram WebApp bridge may be loaded remotely by HTML.
const remote = [];
for (const f of htmlFiles) {
  const h = read(f);
  const rx = /\b(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let m;
  while ((m = rx.exec(h))) remote.push({ file: rel(f), url: m[1] });
}
const unexpectedRemote = remote.filter(x => !/^https:\/\/telegram\.org\/js\/telegram-web-app\.js(?:\?|$)/.test(x.url));
ok(unexpectedRemote.length === 0, 'HTML has no unexpected remote runtime dependencies', unexpectedRemote.map(x => `${x.file}: ${x.url}`).join(', '));

// Parse every embedded engine in isolation and instantiate its exported factory.
for (const g of games) {
  const file = path.join(WWW, g.path);
  const h = read(file);
  const match = h.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
  if (!match) { ok(false, `${g.id}: engine block present`); continue; }
  try {
    const context = {
      module: { exports: {} }, exports: {}, self: {}, console,
      setTimeout, clearTimeout, setInterval, clearInterval,
      performance: { now: () => Date.now() },
      crypto: globalThis.crypto
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(match[1], context, { filename: g.path, timeout: 5000 });
    const factory = context.module.exports;
    if (typeof factory !== 'function') throw new Error('engine did not export a factory');
    const engine = factory();
    if (!engine || typeof engine !== 'object') throw new Error('factory did not return an engine object');
    ok(true, `${g.id}: engine factory loads and instantiates`);
  } catch (e) {
    ok(false, `${g.id}: engine factory loads and instantiates`, e.message);
  }
}

// Final user-facing scan. Legal notices are intentionally outside this scan.
const scanFiles = allFiles(WWW, p => /\.(?:html|js|css|json|webmanifest)$/i.test(p))
  .concat([path.join(ROOT, 'template', 'game', 'index.html')]);
const forbidden = [
  { label: 'league', rx: /\bleague\b/i },
  { label: 'achievement', rx: /\bachievement(?:s)?\b/i },
  { label: 'award', rx: /\baward(?:s)?\b/i },
  { label: 'old Persian brand', rx: /چوگان/ },
  { label: 'old author/source URL', rx: /choganhq|github\.com\/choganhq/i }
];
const scanHits = [];
for (const f of scanFiles) {
  const s = read(f);
  for (const x of forbidden) {
    if (x.rx.test(s)) scanHits.push(`${rel(f)}: ${x.label}`);
  }
}
ok(scanHits.length === 0, 'user-facing runtime is clear of league/awards/old author branding', scanHits.join(', '));

console.log(`\nTMA static check: ${passed}/${passed + failed} passed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' - ' + f);
  process.exitCode = 1;
}

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
let pass = 0;
function ok(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; return; }
  pass++; console.log('PASS:', msg);
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

ok(exists('www/.nojekyll'), 'www/.nojekyll disables accidental Jekyll processing');
ok(exists('.github/workflows/deploy-pages.yml'), 'GitHub Pages workflow is included');
const workflow = read('.github/workflows/deploy-pages.yml');
ok(workflow.includes('actions/configure-pages@v5'), 'workflow uses configure-pages@v5');
ok(workflow.includes('actions/upload-pages-artifact@v4'), 'workflow uses upload-pages-artifact@v4');
ok(workflow.includes('actions/deploy-pages@v4'), 'workflow uses deploy-pages@v4');
ok(workflow.includes('path: _site'), 'workflow publishes only the prepared web artifact');
ok(workflow.includes('node tools/github-pages-check.js'), 'Pages-specific checks run before deployment');
ok(workflow.includes('self.APP_BUILD'), 'every Pages deployment gets a unique service-worker build id');
ok(!workflow.includes('path: .\n'), 'workflow does not publish repository tooling/source files');

const manifest = JSON.parse(read('www/manifest.webmanifest'));
ok(manifest.id === './', 'manifest id is project-subpath safe');
ok(manifest.start_url === './', 'manifest start_url is project-subpath safe');
ok(manifest.scope === './', 'manifest scope is project-subpath safe');
ok((manifest.icons || []).every(i => !String(i.src || '').startsWith('/')), 'manifest icons are relative');
ok((manifest.shortcuts || []).every(s => !String(s.url || '').startsWith('/')), 'manifest shortcut URLs are relative');

const sw = read('www/sw.js');
ok(sw.includes("importScripts('./version.js')"), 'service worker imports version relative to its Pages scope');
ok(sw.includes("'./index.html'"), 'service-worker shell uses relative cache URLs');
ok(sw.includes("fetch('./games.json'"), 'service worker fetches games.json relative to project path');
const core = read('www/lib/chogan.js');
ok(core.includes("sw.register('sw.js', { scope: './'"), 'service worker registration is repository-subpath safe');

const mp = read('www/lib/multiplayer.js');
ok(mp.includes("'https://t.me/'" ) || mp.includes("'https://t.me/"), 'multiplayer deep links target Telegram, not the hosting origin');
ok(!mp.includes('location.origin+'), 'multiplayer transport is not coupled to a root GitHub Pages origin');
const cfg = read('www/config.js');
ok(!/botToken|BOT_TOKEN|api\.telegram\.org\/bot/i.test(cfg), 'frontend configuration contains no bot token');
ok(/botUsername\s*:\s*['"]/.test(cfg), 'frontend has an explicit public botUsername setting');

// Resolve every static href/src as if this were a GitHub project site under /mini-arcade/.
const htmlFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile() && ent.name.endsWith('.html')) htmlFiles.push(p);
  }
}
walk(WWW);
let refs = 0;
for (const file of htmlFiles) {
  const rel = path.relative(WWW, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  const base = new URL(rel, 'https://example.github.io/mini-arcade/');
  const re = /\b(?:src|href)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) {
    const ref = m[1].trim();
    if (!ref || ref.startsWith('#') || /^(?:https?:|data:|mailto:|tel:|tg:)/i.test(ref)) continue;
    refs++;
    ok(!ref.startsWith('/'), `${rel}: local ref stays relative (${ref})`);
    const url = new URL(ref, base);
    ok(url.pathname.startsWith('/mini-arcade/'), `${rel}: local ref remains inside project Pages path (${ref})`);
    const clean = decodeURIComponent(url.pathname.slice('/mini-arcade/'.length)).replace(/\/$/, '/index.html');
    const target = path.join(WWW, clean);
    ok(fs.existsSync(target), `${rel}: local ref resolves to a shipped file (${ref})`);
  }
}
ok(refs > 30, 'checked a broad set of HTML asset/navigation references');

// Reject hard-coded deployment origins and accidental root-relative asset URLs in source-like files.
const scanExt = new Set(['.html','.js','.css','.json','.webmanifest']);
let sourceFiles = 0;
function scan(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) scan(p);
    else if (ent.isFile() && scanExt.has(path.extname(ent.name))) {
      sourceFiles++;
      const t = fs.readFileSync(p, 'utf8');
      ok(!/https:\/\/[^\s"']+\.github\.io\//i.test(t), `${path.relative(WWW,p)} has no hard-coded github.io origin`);
    }
  }
}
scan(WWW);
ok(sourceFiles >= 25, 'scanned all shipped source/config files for hard-coded Pages origins');

if (process.exitCode) process.exit(process.exitCode);
console.log(`GitHub Pages checks passed: ${pass}`);

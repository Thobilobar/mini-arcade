#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function ok(cond, label) { if (cond) { pass++; console.log('PASS:', label); } else { fail++; console.error('FAIL:', label); } }
const index = read('www/index.html');
const css = read('www/lib/chogan.css');
const tma = read('www/lib/tma.js');
const core = read('www/lib/chogan.js');

ok(/<body class="ma-menu">/.test(index), 'menu page is explicitly identifiable for Telegram-only layout tuning');
ok(/ch-head ch-head--home/.test(index), 'home header has a dedicated compact-TMA hook');
ok(/ch-daily-hero/.test(index), 'daily hero has a dedicated compact-TMA hook');
ok(/is-telegram-mini-app\.is-telegram-theme-auto/.test(css), 'Auto theme has a Telegram-native palette layer');
ok(/--c-surface:\s+var\(--tg-theme-section-bg/.test(css), 'Telegram section background drives app surfaces');
ok(/--c-text:\s+var\(--tg-theme-text/.test(css), 'Telegram text color drives app text');
ok(/--c-accent:\s+var\(--tg-theme-button/.test(css), 'Telegram button color drives app accent in Auto mode');
ok(/not\(\.is-tg-fullscreen\)[\s\S]*ch-head--home[\s\S]*ch-head__title[\s\S]*display:\s*none/.test(css), 'duplicate home wordmark is hidden under native Telegram chrome');
ok(/is-tg-fullscreen/.test(css) && !/is-tg-fullscreen[^\n]*ch-head__title[^\n]*display:\s*none/.test(css), 'fullscreen can restore the in-app wordmark when native chrome is absent');
ok(/body\.ma-menu \.ch-page[\s\S]*padding-top/.test(css), 'Telegram menu uses compact top spacing');
ok(/ch-games--grid \.ch-game[\s\S]*aspect-ratio:\s*1\.08\s*\/\s*1/.test(css), 'Telegram game tiles are shortened to reduce first-screen crowding');
ok(/ch-section ch-games-panel/.test(index), 'game library has a dedicated layered section surface');
ok(/\.ch-games-panel[\s\S]*background:\s*color-mix/.test(css), 'games panel is visually separated from the page background');
ok(/\.ch-game[\s\S]*linear-gradient\(150deg/.test(css), 'individual game tiles use a raised tinted surface');
ok(/\.ch-game::after[\s\S]*var\(--game\)/.test(css), 'game tiles carry a restrained per-game color accent');
ok(/\.ch-game:active[\s\S]*translateY\(1px\) scale\(\.982\)/.test(css), 'game tiles provide tactile press feedback');
ok(/\.ch-game__icon[\s\S]*box-shadow/.test(css), 'game icons have their own elevated visual layer');
ok(/--tg-theme-bottom-bar/.test(css), 'fixed navigation follows Telegram bottom-bar color');
ok(/section_bg_color/.test(tma) && /section_separator_color/.test(tma), 'bridge consumes modern Telegram section theme parameters');
ok(/setBottomBarColor/.test(tma), 'bridge synchronizes Telegram native bottom bar color');
ok(/fullscreenChanged/.test(tma) && /is-tg-fullscreen/.test(tma), 'bridge tracks fullscreen state for adaptive chrome');
ok(/is-telegram-theme-auto/.test(core) && /tg\.colorScheme/.test(core), 'Auto theme follows Telegram color scheme rather than host OS');

console.log(`\nTMA UI integration: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);

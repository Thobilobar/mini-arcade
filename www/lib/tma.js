/* Mini Arcade — Telegram Mini App bridge and encrypted local vault. */
(function (global) {
  'use strict';

  var tg = global.Telegram && global.Telegram.WebApp ? global.Telegram.WebApp : null;
  var VAULT_KEY = 'mini_arcade_vault_v1';
  var SECURE_KEY = 'mini_arcade_key_v1';
  var FALLBACK_VAULT = 'mini-arcade.secure-vault.v1';
  var LEGACY_PREFIXES = ['chogan.', 'miniarcade.'];
  var cache = Object.create(null);
  var dirty = false;
  var persistTimer = null;
  var persistChain = Promise.resolve();
  var aesKey = null;
  var mode = 'browser-encrypted';
  var listeners = { theme: [], viewport: [], pause: [], resume: [] };

  function on(type, fn) {
    if (listeners[type]) listeners[type].push(fn);
    return function () {
      var a = listeners[type] || [];
      var i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    };
  }
  function emit(type, value) {
    (listeners[type] || []).slice().forEach(function (fn) {
      try { fn(value); } catch (e) { /* isolate app listeners */ }
    });
  }

  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(s) {
    var raw = atob(s || '');
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function utf8(s) { return new TextEncoder().encode(String(s)); }
  function text(bytes) { return new TextDecoder().decode(bytes); }

  function secureGet(key) {
    return new Promise(function (resolve, reject) {
      if (!tg || !tg.SecureStorage || typeof tg.SecureStorage.getItem !== 'function') return reject(new Error('secure storage unavailable'));
      try {
        tg.SecureStorage.getItem(key, function (err, value, canRestore) {
          if (err) reject(new Error(String(err)));
          else resolve({ value: value || null, canRestore: !!canRestore });
        });
      } catch (e) { reject(e); }
    });
  }
  function secureRestore(key) {
    return new Promise(function (resolve, reject) {
      if (!tg || !tg.SecureStorage || typeof tg.SecureStorage.restoreItem !== 'function') return reject(new Error('secure restore unavailable'));
      try {
        tg.SecureStorage.restoreItem(key, function (err, value) {
          if (err) reject(new Error(String(err))); else resolve(value || null);
        });
      } catch (e) { reject(e); }
    });
  }
  function secureSet(key, value) {
    return new Promise(function (resolve, reject) {
      if (!tg || !tg.SecureStorage || typeof tg.SecureStorage.setItem !== 'function') return reject(new Error('secure storage unavailable'));
      try {
        tg.SecureStorage.setItem(key, value, function (err) {
          if (err) reject(new Error(String(err))); else resolve(true);
        });
      } catch (e) { reject(e); }
    });
  }
  function secureRemove(key) {
    return new Promise(function (resolve) {
      if (!tg || !tg.SecureStorage || typeof tg.SecureStorage.removeItem !== 'function') return resolve(false);
      try { tg.SecureStorage.removeItem(key, function (err) { resolve(!err); }); } catch (e) { resolve(false); }
    });
  }
  function deviceGet(key) {
    return new Promise(function (resolve, reject) {
      if (!tg || !tg.DeviceStorage || typeof tg.DeviceStorage.getItem !== 'function') return reject(new Error('device storage unavailable'));
      try {
        tg.DeviceStorage.getItem(key, function (err, value) {
          if (err) reject(new Error(String(err))); else resolve(value || null);
        });
      } catch (e) { reject(e); }
    });
  }
  function deviceSet(key, value) {
    return new Promise(function (resolve, reject) {
      if (!tg || !tg.DeviceStorage || typeof tg.DeviceStorage.setItem !== 'function') return reject(new Error('device storage unavailable'));
      try {
        tg.DeviceStorage.setItem(key, value, function (err) {
          if (err) reject(new Error(String(err))); else resolve(true);
        });
      } catch (e) { reject(e); }
    });
  }
  function deviceRemove(key) {
    return new Promise(function (resolve) {
      if (!tg || !tg.DeviceStorage || typeof tg.DeviceStorage.removeItem !== 'function') return resolve(false);
      try { tg.DeviceStorage.removeItem(key, function (err) { resolve(!err); }); } catch (e) { resolve(false); }
    });
  }

  function openKeyDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('IndexedDB unavailable'));
      var req = global.indexedDB.open('mini-arcade-security', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('keys')) req.result.createObjectStore('keys');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
    });
  }
  function idbGet(key) {
    return openKeyDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('keys', 'readonly');
        var req = tx.objectStore('keys').get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB read failed')); };
        tx.oncomplete = function () { db.close(); };
      });
    });
  }
  function idbSet(key, value) {
    return openKeyDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').put(value, key);
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('IndexedDB write failed')); };
      });
    });
  }
  function idbClear() {
    return openKeyDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').clear();
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); resolve(false); };
      });
    }).catch(function () { return false; });
  }

  function makeTelegramKey() {
    var raw = new Uint8Array(32);
    global.crypto.getRandomValues(raw);
    return global.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
      .then(function (key) { return secureSet(SECURE_KEY, b64(raw)).then(function () { return key; }); });
  }
  function importTelegramKey(stored) {
    return global.crypto.subtle.importKey('raw', unb64(stored), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  function loadTelegramKey() {
    return secureGet(SECURE_KEY).then(function (entry) {
      if (entry.value) return importTelegramKey(entry.value);
      if (entry.canRestore) {
        return secureRestore(SECURE_KEY).then(function (restored) {
          return restored ? importTelegramKey(restored) : makeTelegramKey();
        }).catch(makeTelegramKey);
      }
      return makeTelegramKey();
    });
  }
  function loadBrowserKey() {
    return idbGet('vault').then(function (key) {
      if (key) return key;
      return global.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
        .then(function (created) { return idbSet('vault', created).then(function () { return created; }); });
    });
  }

  function encryptObject(obj) {
    var iv = new Uint8Array(12);
    global.crypto.getRandomValues(iv);
    return global.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, utf8(JSON.stringify(obj)))
      .then(function (ct) {
        return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(new Uint8Array(ct)) });
      });
  }
  function decryptObject(raw) {
    if (!raw) return Promise.resolve(Object.create(null));
    return Promise.resolve().then(function () {
      var box = JSON.parse(raw);
      if (!box || box.v !== 1 || !box.iv || !box.ct) throw new Error('invalid vault');
      return global.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, aesKey, unb64(box.ct));
    }).then(function (pt) {
      var obj = JSON.parse(text(new Uint8Array(pt)) || '{}');
      return obj && typeof obj === 'object' ? obj : Object.create(null);
    });
  }

  function legacyImport() {
    var found = Object.create(null);
    var sourceKeys = [];
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (!k || k === FALLBACK_VAULT || k.indexOf('__tma_mock_') === 0) continue;
        var match = LEGACY_PREFIXES.some(function (p) { return k.indexOf(p) === 0; });
        if (match) {
          var mapped = k.indexOf('chogan.') === 0 ? ('miniarcade.' + k.slice(7)) : k;
          found[mapped] = global.localStorage.getItem(k);
          sourceKeys.push(k);
        }
      }
      // Delete the actual plaintext source keys, not their mapped names.
      sourceKeys.forEach(function (k) { global.localStorage.removeItem(k); });
    } catch (e) { /* storage can be blocked */ }
    return found;
  }

  function readCiphertext() {
    if (mode === 'telegram-secure') {
      return deviceGet(VAULT_KEY).catch(function () {
        mode = 'telegram-secure-local-fallback';
        try { return global.localStorage.getItem(FALLBACK_VAULT); } catch (e) { return null; }
      });
    }
    try { return Promise.resolve(global.localStorage.getItem(FALLBACK_VAULT)); }
    catch (e) { return Promise.resolve(null); }
  }
  function writeCiphertext(raw) {
    if (mode === 'telegram-secure') {
      return deviceSet(VAULT_KEY, raw).catch(function () {
        mode = 'telegram-secure-local-fallback';
        try { global.localStorage.setItem(FALLBACK_VAULT, raw); } catch (e) { /* no-op */ }
        return false;
      });
    }
    try { global.localStorage.setItem(FALLBACK_VAULT, raw); } catch (e) { /* no-op */ }
    return Promise.resolve(true);
  }

  function persistNow() {
    if (!dirty || !aesKey) return Promise.resolve(false);
    dirty = false;
    var snapshot = {};
    Object.keys(cache).forEach(function (k) { snapshot[k] = cache[k]; });
    persistChain = persistChain.then(function () {
      return encryptObject(snapshot).then(writeCiphertext);
    }).catch(function () { dirty = true; return false; });
    return persistChain;
  }
  function schedulePersist() {
    dirty = true;
    if (persistTimer) return;
    persistTimer = global.setTimeout(function () {
      persistTimer = null;
      persistNow();
    }, 40);
  }

  function getRaw(key) { return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null; }
  function setRaw(key, value) { cache[key] = String(value); schedulePersist(); }
  function delRaw(key) { if (Object.prototype.hasOwnProperty.call(cache, key)) { delete cache[key]; schedulePersist(); } }
  function wipePrefix(prefix) {
    Object.keys(cache).forEach(function (k) { if (k.indexOf(prefix) === 0) delete cache[k]; });
    schedulePersist();
  }
  function keys(prefix) { return Object.keys(cache).filter(function (k) { return !prefix || k.indexOf(prefix) === 0; }); }

  function normalUser() {
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
    if (!u) return null;
    var first = String(u.first_name || '').trim();
    var last = String(u.last_name || '').trim();
    return {
      id: String(u.id || ''),
      firstName: first,
      lastName: last,
      name: (first + ' ' + last).trim() || String(u.username || ''),
      username: u.username ? String(u.username) : '',
      languageCode: u.language_code ? String(u.language_code) : '',
      photoUrl: u.photo_url ? String(u.photo_url) : '',
      premium: !!u.is_premium
    };
  }

  function setCssPx(name, value) {
    if (value === undefined || value === null || isNaN(+value)) return;
    document.documentElement.style.setProperty(name, (+value) + 'px');
  }
  function applyViewport() {
    if (!tg) return;
    setCssPx('--tg-viewport-height', tg.viewportHeight);
    setCssPx('--tg-viewport-stable-height', tg.viewportStableHeight);
    var sa = tg.safeAreaInset || {};
    var ca = tg.contentSafeAreaInset || {};
    setCssPx('--tg-safe-top', sa.top || 0); setCssPx('--tg-safe-bottom', sa.bottom || 0);
    setCssPx('--tg-safe-left', sa.left || 0); setCssPx('--tg-safe-right', sa.right || 0);
    setCssPx('--tg-content-safe-top', ca.top || 0); setCssPx('--tg-content-safe-bottom', ca.bottom || 0);
    setCssPx('--tg-content-safe-left', ca.left || 0); setCssPx('--tg-content-safe-right', ca.right || 0);
    emit('viewport', tg.viewportStableHeight || tg.viewportHeight || 0);
  }
  function applyTelegramTheme() {
    if (!tg) return;
    var p = tg.themeParams || {};
    var r = document.documentElement;
    if (p.bg_color) r.style.setProperty('--tg-theme-bg', p.bg_color);
    if (p.secondary_bg_color) r.style.setProperty('--tg-theme-secondary-bg', p.secondary_bg_color);
    if (p.text_color) r.style.setProperty('--tg-theme-text', p.text_color);
    if (p.hint_color) r.style.setProperty('--tg-theme-hint', p.hint_color);
    if (p.button_color) r.style.setProperty('--tg-theme-button', p.button_color);
    if (p.button_text_color) r.style.setProperty('--tg-theme-button-text', p.button_text_color);
    r.setAttribute('data-tg-theme', tg.colorScheme || 'light');
    emit('theme', tg.colorScheme || 'light');
  }
  function bindTelegram() {
    if (!tg) return;
    try { tg.ready(); } catch (e) { /* no-op */ }
    try { tg.expand(); } catch (e2) { /* no-op */ }
    try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e3) { /* no-op */ }
    try { if (tg.setHeaderColor) tg.setHeaderColor('bg_color'); } catch (e4) { /* no-op */ }
    try { if (tg.setBackgroundColor) tg.setBackgroundColor('bg_color'); } catch (e5) { /* no-op */ }
    applyTelegramTheme();
    applyViewport();
    try { tg.onEvent('themeChanged', applyTelegramTheme); } catch (e6) { /* no-op */ }
    try { tg.onEvent('viewportChanged', applyViewport); } catch (e7) { /* no-op */ }
    try { tg.onEvent('safeAreaChanged', applyViewport); } catch (e8) { /* no-op */ }
    try { tg.onEvent('contentSafeAreaChanged', applyViewport); } catch (e9) { /* no-op */ }
    try { tg.onEvent('activated', function () { emit('resume'); }); } catch (e10) { /* no-op */ }
    try { tg.onEvent('deactivated', function () { emit('pause'); }); } catch (e11) { /* no-op */ }
    document.documentElement.classList.add('is-telegram-mini-app');
  }

  function setupBackButton() {
    if (!tg || !tg.BackButton) return;
    var path = global.location ? global.location.pathname : '';
    var isGame = /\/games\//.test(path);
    var isPrivacy = /\/privacy\.html$/.test(path);
    try {
      if (isGame || isPrivacy) {
        tg.BackButton.show();
        tg.BackButton.onClick(function () {
          if (isGame && global.Chogan && global.Chogan.back) global.Chogan.back();
          else if (isGame) global.location.href = '../../index.html';
          else global.location.href = './index.html';
        });
      } else tg.BackButton.hide();
    } catch (e) { /* no-op */ }
  }

  function initVault() {
    if (!global.crypto || !global.crypto.subtle) {
      mode = 'memory-only';
      cache = legacyImport();
      return Promise.resolve();
    }
    var canTelegramStorage = !!(tg && tg.DeviceStorage && tg.SecureStorage && (!tg.isVersionAtLeast || tg.isVersionAtLeast('9.0')));
    mode = canTelegramStorage ? 'telegram-secure' : 'browser-encrypted';
    var keyPromise = canTelegramStorage ? loadTelegramKey().catch(function () {
      mode = 'browser-encrypted';
      return loadBrowserKey();
    }) : loadBrowserKey();
    return keyPromise.then(function (key) {
      aesKey = key;
      return readCiphertext();
    }).then(function (raw) {
      return decryptObject(raw).catch(function () { return Object.create(null); });
    }).then(function (loaded) {
      cache = loaded || Object.create(null);
      // Always sweep legacy plaintext keys. Merge only keys that are not already
      // present in the encrypted vault, then rewrite once if migration occurred.
      var legacy = legacyImport();
      var migrated = false;
      Object.keys(legacy).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(cache, k)) cache[k] = legacy[k];
        migrated = true;
      });
      if (migrated) { dirty = true; return persistNow().then(function () { return true; }); }
      return true;
    });
  }

  bindTelegram();
  var ready = initVault().then(function () { setupBackButton(); return true; }).catch(function () {
    mode = 'memory-only';
    cache = legacyImport();
    setupBackButton();
    return true;
  });

  global.addEventListener('pagehide', function () { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; } persistNow(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) persistNow(); });

  global.MiniArcadeTMA = {
    telegram: tg,
    ready: ready,
    on: on,
    isTelegram: function () { return !!tg; },
    user: normalUser,
    storageMode: function () { return mode; },
    storage: { getRaw: getRaw, setRaw: setRaw, delRaw: delRaw, wipePrefix: wipePrefix, keys: keys, flush: persistNow },
    haptic: function (kind) {
      if (!tg || !tg.HapticFeedback) return false;
      try {
        if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind === 'warning' ? 'warning' : kind);
        else if (kind === 'select') tg.HapticFeedback.selectionChanged();
        else tg.HapticFeedback.impactOccurred(kind === 'heavy' ? 'heavy' : kind === 'light' ? 'light' : 'medium');
        return true;
      } catch (e) { return false; }
    },
    shareText: function (value) {
      if (!tg || !tg.openTelegramLink) return false;
      try {
        tg.openTelegramLink('https://t.me/share/url?url=&text=' + encodeURIComponent(String(value || '')));
        return true;
      } catch (e) { return false; }
    },
    fullscreenAvailable: function () {
      try { return !!(tg && tg.requestFullscreen && (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))); } catch (e) { return false; }
    },
    isFullscreen: function () { return !!(tg && tg.isFullscreen); },
    toggleFullscreen: function () {
      if (!tg) return Promise.resolve(false);
      try {
        if (tg.isFullscreen && tg.exitFullscreen) tg.exitFullscreen();
        else if (tg.requestFullscreen) tg.requestFullscreen();
        return Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    },
    reset: function () {
      cache = Object.create(null);
      dirty = false;
      if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
      var ops = [];
      if (tg) { ops.push(deviceRemove(VAULT_KEY)); ops.push(secureRemove(SECURE_KEY)); }
      try { global.localStorage.removeItem(FALLBACK_VAULT); } catch (e) { /* no-op */ }
      legacyImport();
      ops.push(idbClear());
      return Promise.all(ops).catch(function () { return []; });
    }
  };
})(window);

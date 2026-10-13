# Telegram Mini App Deployment Guide

## 1. Host the web app

For this release, the preferred host is **GitHub Pages using the included GitHub Actions workflow**. The workflow runs all release gates and deploys only a prepared copy of `www/`. It is safe for GitHub project-site URLs such as `https://username.github.io/repository/`; the app does not assume it is hosted at `/`. See `GITHUB_PAGES_SETUP.md` for the complete setup.

If using another static HTTPS host, publish the **contents of `www/`** at a stable HTTPS origin. Keep relative paths intact. Do not publish only `index.html`; the games, shared libraries, fonts, icons, manifest, privacy page and service worker are all part of the runtime.

Recommended production headers:

- `Content-Type` appropriate to each asset.
- `Cache-Control: no-cache` or a short cache lifetime for `index.html`, `version.js` and `sw.js` so releases are discovered quickly.
- Long immutable caching is fine for content-addressed assets if you introduce hashed filenames later.
- `X-Content-Type-Options: nosniff`.
- A suitable `Referrer-Policy` such as `strict-origin-when-cross-origin`.
- HSTS after HTTPS deployment is stable.

A strict Content Security Policy is recommended, but this codebase currently contains inline scripts. Do not deploy a CSP that blocks the app. If you add CSP, either move inline logic into external files or generate exact hashes/nonces as part of the release process. The Telegram bridge must remain allowed from `https://telegram.org`.

## 2. Configure Telegram

Point the bot's Mini App/menu-button configuration at the deployed HTTPS URL. No bot token belongs in the browser bundle.

The runtime calls Telegram `ready()` and `expand()` during bootstrap, follows Telegram theme and safe-area changes, visually merges Auto theme surfaces with Telegram native header/bottom-bar colors, suppresses duplicate home branding under Telegram chrome, uses the Telegram BackButton on subpages/game pages, and uses Telegram haptics/fullscreen/share APIs where available.

## 3. Live friend multiplayer configuration

Mini Arcade v1.2.0 uses two transports together:

1. **Telegram deep link** for the first invitation and as a recovery fallback.
2. **WebRTC DataChannel** for automatic live turns after both Mini Apps are open.

A small Cloudflare Worker/Durable Object is included in `signaling-worker/`. It relays only WebRTC offer/answer/ICE messages; it rejects gameplay `turn` messages. The room secret is stored only as a SHA-256 hash and expires automatically.

Set `www/config.js` before publishing:

```js
window.MINI_ARCADE_CONFIG = Object.assign({
  botUsername: 'YourBotUsername',
  appShortName: '',
  deepLinkMode: 'fullscreen',
  liveMultiplayer: {
    enabled: true,
    signalingUrl: 'https://YOUR-WORKER.workers.dev',
    connectTimeoutMs: 12000,
    fallbackDelayMs: 8000,
    ackTimeoutMs: 4500,
    reconnectMs: 1200,
    iceServers: []
  }
}, window.MINI_ARCADE_CONFIG || {});
```

`botUsername` is required for the invitation/fallback links. `signalingUrl` is the HTTPS base URL printed after deploying `signaling-worker/`. If it is blank, multiplayer still works using the earlier Telegram-turn flow.

The live transport automatically reconnects after temporary network/WebView suspension. A sent move is kept pending until the receiving client validates it and returns an application-level ACK. If live reconnection does not recover in time, **Send via Telegram** becomes available so the match is not stranded.

See `LIVE_MULTIPLAYER_SETUP.md` for the Cloudflare deployment and two-account test procedure.

Optional TURN can be configured by storing `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` as Worker secrets. Those secrets must never be copied into the frontend.

## 4. Identity boundary

The frontend reads `Telegram.WebApp.initDataUnsafe.user` only to personalize the local interface (name, username, language, photo and premium badge state). This is not a security boundary.

If you later add a server, leaderboard, purchases, cloud sync, moderation, or any feature that trusts a Telegram identity, send raw `Telegram.WebApp.initData` to the server and validate its signature server-side before using it for authorization or account ownership.

## 5. Storage and migration

On compatible Telegram clients:

- AES-GCM key: Telegram `SecureStorage`, item `mini_arcade_key_v1`.
- Ciphertext vault: Telegram `DeviceStorage`, item `mini_arcade_vault_v1`.

Browser/older-client fallback:

- Non-extractable AES CryptoKey: IndexedDB database `mini-arcade-security`.
- Ciphertext vault: localStorage key `mini-arcade.secure-vault.v1`.

The app keeps synchronous game state in memory after an awaited startup hydration, then encrypts/persists changes asynchronously. It flushes pending state when the page is hidden or unloaded. Legacy `chogan.*` and `miniarcade.*` plaintext state is migrated into the encrypted vault and the migrated plaintext keys are deleted.

If all persistent browser storage is unavailable, the app can still run in memory for that session, but persistence cannot be guaranteed.

## 6. Service worker releases

`www/sw.js` uses the Mini Arcade cache namespace and includes the Telegram bridge/app shell in its cache list. `www/version.js` is the release version source. This package is version `1.2.0`.

The included GitHub Pages workflow appends `APP_BUILD=<first 12 chars of the Git commit SHA>` to the **deployed copy** of `version.js`. This changes the cache namespace on every successful deployment without modifying the committed release file, fixing the common case where `config.js` or another shell file changes while the semantic version stays the same.

After publishing a release, verify that a Telegram client which previously opened the Mini App receives the new shell and can still decrypt its existing vault.

## 7. Pre-launch device matrix

Before public release, test the deployed HTTPS build on real devices:

- Current Telegram Android: first launch, existing-state migration, profile photo, theme switch, BackButton, haptics, fullscreen, share, close/reopen persistence.
- Current Telegram iOS: the same flows, especially `SecureStorage` restore behavior after reinstall/restore scenarios that your product supports.
- Small-screen device and a device with display cutouts/safe areas.
- Light and dark Telegram themes.
- At least one older Telegram client to verify the encrypted browser fallback path.

Also play a short session in every game after deployment and reopen it to confirm state survives navigation/relaunch where that game supports resuming.

## 8. Release commands

From the project root, all of these should exit successfully:

```bash
node tools/tma-static-check.js
node tools/tma-unit-test.js
node tools/tma-ui-check.js
node tools/tma-game-smoke.js
node tools/tma-multiplayer-test.js
node tools/tma-multiplayer-game-test.js
node tools/tma-multiplayer-stress.js
node tools/tma-live-multiplayer-test.js
node tools/tma-signaling-worker-test.js
node tools/github-pages-check.js
```

Do not substitute the old Android/F-Droid release scripts from the upstream repository; they are not part of this TMA distribution.

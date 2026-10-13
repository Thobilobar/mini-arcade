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

## 3. Backend-free multiplayer configuration

Set `www/config.js` before publishing:

```js
window.MINI_ARCADE_CONFIG = Object.assign({
  botUsername: 'YourBotUsername',
  appShortName: '',
  deepLinkMode: 'fullscreen'
}, window.MINI_ARCADE_CONFIG || {});
```

`botUsername` is required for challenge/move links. Use the username without `@`. Keep `appShortName` empty for a Main Mini App; set it only when the deployed URL is registered as a named Direct Mini App.

The multiplayer transport uses Telegram `startapp` links and Telegram's share chooser. It does **not** include a bot token and does not require a backend. Direct-link Mini Apps cannot silently read the chat or silently send arbitrary chat messages, so each completed turn still requires the player to choose/send the Telegram destination. The app minimizes this friction by opening the chooser automatically exactly when control passes to the opponent.

Run real two-account tests for all six supported games before launch: Chess, Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon. Test challenge creation, recipient binding, reply, dismissed-share retry, duplicate-link reopening, forwarded-link spectator mode, app close/reopen, and final-game result handling.

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

`www/sw.js` uses the Mini Arcade cache namespace and includes the Telegram bridge/app shell in its cache list. `www/version.js` is the release version source. This package is version `1.1.4`.

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
node tools/github-pages-check.js
```

Do not substitute the old Android/F-Droid release scripts from the upstream repository; they are not part of this TMA distribution.

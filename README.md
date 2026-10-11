# Mini Arcade — Telegram Mini App

Mini Arcade is a local-first Telegram Mini App containing 18 compact games. This package is the TMA-focused distribution: gameplay stays client-side, Telegram supplies the app shell and user context, and game progress is stored in an encrypted device vault.

## What is included

- 18 games from the app catalogue, including Sudoku, Minesweeper, Chess, Backgammon, Mahjong, FreeCell and Tower Defence.
- Telegram Mini App lifecycle integration: `ready()`, `expand()`, viewport/safe-area updates, theme changes, activation/deactivation, BackButton routing, haptics, Telegram sharing and Telegram fullscreen where supported.
- Telegram profile integration for display name, username, language, premium flag and profile image when Telegram provides them.
- Encrypted local persistence using AES-GCM.
- Telegram-native storage on supported clients: the AES key is kept in `SecureStorage`, while the encrypted application vault is kept in `DeviceStorage`.
- Backend-free Telegram friend multiplayer for Chess, Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon. Completed turns are carried by Telegram deep links; no game server, WebSocket service or database is required.
- Encrypted browser fallback for development/older clients: a non-extractable CryptoKey is kept in IndexedDB and ciphertext is kept in localStorage.
- Home, Daily and Profile navigation only. The former league and achievement/award systems are removed from the UI, state model and game result paths.
- Privacy page designed to run inside Telegram with the same theme, safe-area and BackButton integration.

## Project layout

```text
www/                     Deploy this directory as the Mini App website
  index.html              Main menu
  privacy.html            Privacy information
  games/                  18 game pages and assets
  config.js               Bot username / Mini App deep-link configuration
  lib/tma.js              Telegram bridge + encrypted vault
  lib/multiplayer.js      Backend-free Telegram turn transport + match storage
  lib/chogan.js           Shared game/app core (legacy internal filename)
  lib/chogan.css          Shared UI styles (legacy internal filename)
  manifest.webmanifest    Web manifest
  sw.js                   Service worker
  version.js              Release version

template/game/            Game page template
tools/tma-static-check.js Production static contract audit
tools/tma-unit-test.js    Telegram/storage/crypto integration test
tools/tma-game-smoke.js   Deterministic smoke checks for all 18 engines
tools/tma-multiplayer-test.js       Telegram transport/adversarial checks
tools/tma-multiplayer-game-test.js  Per-game replay/tamper checks
tools/tma-multiplayer-stress.js     Complete-game and long-game stress checks
tools/github-pages-check.js          GitHub project-path/deployment audit
.github/workflows/deploy-pages.yml   Test + GitHub Pages deployment pipeline
GITHUB_PAGES_SETUP.md                End-to-end GitHub Pages/BotFather guide
LICENSE                    Required upstream MIT notice
```

The internal `Chogan` JavaScript namespace and a few legacy migration key names are intentionally retained as implementation details so the game engines do not need a risky wholesale API rewrite. They are not user-facing branding.

## Local development

Serve `www/` from an HTTP server; do not open the HTML directly from `file://`.

```bash
cd www
python3 -m http.server 8080
```

For real Telegram testing and production, use an HTTPS URL. The app can also open in an ordinary browser for development, where it uses its encrypted fallback vault.

## Release checks

From the project root:

```bash
node tools/tma-static-check.js
node tools/tma-unit-test.js
node tools/tma-game-smoke.js
node tools/tma-multiplayer-test.js
node tools/tma-multiplayer-game-test.js
node tools/tma-multiplayer-stress.js
node tools/github-pages-check.js
```

The release package was produced with the six TMA/game checks plus the GitHub Pages deployment audit green. See `QA_REPORT.md` for the recorded scope and limitations.

## GitHub Pages deployment

This package includes `.github/workflows/deploy-pages.yml`. It runs the full automated release suite, prepares a Pages artifact containing only `www/`, injects a unique build identifier for reliable service-worker cache rotation, and deploys it through GitHub Pages. All local URLs are relative so a project site such as `https://username.github.io/repository/` works without path rewriting. See `GITHUB_PAGES_SETUP.md` for the full click-by-click setup.

## Telegram setup

1. Deploy the contents of `www/` to a stable HTTPS origin (the included GitHub Pages workflow does this automatically).
2. Configure that HTTPS URL as the bot's Mini App/menu-button URL using Telegram's bot configuration tools.
3. Open the app from Telegram and test at least one current Android client and one current iOS client before public launch.
4. Never place the bot token in this frontend.
5. The profile fields from `initDataUnsafe` are suitable for local presentation only. If a backend is added later, send Telegram's raw `initData` to the backend and validate it there before trusting identity or authorization claims.

## Backend-free Telegram multiplayer

The six games that already had local multiplayer now also expose **Telegram friend** mode:

- **Chess** — one move per hand-off. White creates the challenge. Long games use irreversible-move replay checkpoints so the deep-link payload stays bounded while threefold-repetition and fifty-move state remain reconstructable.
- **Reversi** — automatic passes are kept inside the same hand-off, so a player who immediately moves again does not have to send an unnecessary intermediate link.
- **Mancala** — all consecutive extra turns from the same player are batched and sent once when control actually passes.
- **Dots & Boxes** — scoring chains stay on-device until the turn changes. The full edge order is packed as a compact permutation stream, allowing even an 8×8 game to be reconstructed.
- **Nine Men's Morris** — each complete placement/move/capture is replay-validated. Repetition and the fifty-move draw clock are rebuilt from the legal history.
- **Backgammon** — a whole legal dice turn is sent at once, after all usable dice have been played. Dice are deterministic from the match seed and turn number, so the receiving device can independently verify them.

The inviter makes the first legal action before Telegram asks where to send it. That removes a separate “accept challenge” round trip. The recipient taps the shared Mini App link, becomes player two, and their completed turn automatically opens Telegram's share chooser for the reply. A persistent **Send move** button remains as a retry if the chooser is dismissed.

Match IDs, revisions, previous-state checksums, bound Telegram IDs, per-game rule validation and spectator handling reject stale, duplicated, wrong-game, corrupted and non-continuing updates. Match data and in-progress same-turn drafts are kept in the existing encrypted vault. Forwarding a match link to a third account opens that account as a spectator instead of rebinding a player slot.

This is intentionally **casual serverless multiplayer**. A user controls their own web client, so without an authoritative backend it is not possible to provide strong anti-cheat guarantees suitable for prizes, rankings or trusted competitive results.

Before deploying, set the bot username in `www/config.js`:

```js
window.MINI_ARCADE_CONFIG = {
  botUsername: 'YourBotUsername',
  appShortName: '',
  deepLinkMode: 'fullscreen'
};
```

Leave `appShortName` empty when using the bot's Main Mini App. If you configured a named Direct Mini App in BotFather, put that short name there instead.

## Persistence model

Mini Arcade writes application values into one encrypted JSON vault rather than exposing game progress as individual plaintext storage keys. On current Telegram clients, it uses one `SecureStorage` item for the AES key and one `DeviceStorage` item for the encrypted vault. Legacy plaintext keys from the previous app namespace are imported once and removed after a successful migration.

Reset removes only Mini Arcade's own Telegram storage items and legacy app keys; it does not clear unrelated storage belonging to other features of the same bot.

## Legal

The original MIT notice in `LICENSE` is retained because the license requires the copyright and permission notice to accompany substantial copies of the software. The bundled Vazirmatn font retains its separate SIL Open Font License notice in `www/fonts/OFL.txt`. These legal notices are intentionally not stripped or rebranded.

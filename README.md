# Mini Arcade — Telegram Mini App

Mini Arcade is a local-first Telegram Mini App containing 18 compact games. The web app is designed for GitHub Pages, uses Telegram-native theme/profile/storage APIs where available, and keeps game progress inside an AES-GCM encrypted device vault.

## Current release: 1.2.0

This release adds **live friend multiplayer** to the six games that already support two players: Chess, Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon.

The first completed move is still sent once through Telegram as the invitation. After the second player opens that link, the two Mini App instances establish an encrypted WebRTC DataChannel. From then on, legal turns appear automatically on the other device with no Telegram share step between moves. The previous Telegram turn-link transport remains available as a recovery/fallback path.

### Live multiplayer architecture

```text
Telegram invite (once)
        │
        ▼
Player A ── signaling Worker ── Player B
        │      SDP / ICE only      │
        └════ encrypted WebRTC ════┘
                 game moves
```

The included Cloudflare Worker only coordinates WebRTC connection setup. It does **not** relay or store game moves. Once connected, gameplay travels peer-to-peer. If direct connectivity is not possible, the Worker can optionally provide short-lived TURN credentials; TURN relays encrypted WebRTC traffic rather than readable game state.

## What is included

- 18 games.
- Telegram lifecycle, theme, safe-area, profile, BackButton, haptics, fullscreen and sharing integration.
- AES-GCM encrypted local persistence.
- Telegram `SecureStorage` + `DeviceStorage` when available, encrypted browser fallback otherwise.
- Live WebRTC friend multiplayer for six games.
- Telegram deep-link multiplayer fallback and spectator handling.
- Per-game legality/replay validation, revision chains and duplicate/stale-update rejection.
- Automatic reconnect after temporary network loss or Telegram WebView backgrounding.
- Application-level ACKs so a live move is not considered delivered until the other client has accepted it.
- GitHub Pages deployment workflow.
- Optional Cloudflare signaling Worker deployment workflow.
- Layered Telegram-native UI across Home, Daily, Profile, Settings, onboarding and Privacy.

## Project layout

```text
www/                              GitHub Pages runtime
  config.js                       Telegram + live-multiplayer configuration
  lib/tma.js                      Telegram bridge + encrypted vault
  lib/multiplayer.js              Match format, validation transport + Telegram fallback
  lib/live-multiplayer.js         WebRTC live transport/reconnect/ACK layer
  games/                          18 games
  sw.js                           Offline/service-worker shell
  version.js                      Release version

signaling-worker/
  src/index.js                    Cloudflare Worker + Durable Object signaling service
  wrangler.jsonc                  Worker/Durable Object configuration
  package.json                    Wrangler development/deployment package

.github/workflows/
  deploy-pages.yml                Test + deploy GitHub Pages
  deploy-signal-worker.yml        Manual signaling Worker deployment

tools/
  tma-static-check.js
  tma-unit-test.js
  tma-ui-check.js
  tma-game-smoke.js
  tma-multiplayer-test.js
  tma-multiplayer-game-test.js
  tma-multiplayer-stress.js
  tma-live-multiplayer-test.js
  tma-signaling-worker-test.js
  github-pages-check.js
```

The internal `Chogan` JavaScript namespace and a few migration key names remain implementation details so the mature game engines do not require a risky wholesale API rewrite. They are not user-facing branding.

## Configure the frontend

Edit `www/config.js`.

```js
window.MINI_ARCADE_CONFIG = Object.assign({
  botUsername: 'MyMiniArcadeBot',
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

Keep `appShortName` empty when Mini Arcade is the bot's Main Mini App. Never put the BotFather token in frontend code.

If `signalingUrl` is blank, all six games continue to work using the existing Telegram-turn fallback.

## Live multiplayer setup

See **`LIVE_MULTIPLAYER_SETUP.md`**. The short version is:

1. Deploy `signaling-worker/` to Cloudflare Workers.
2. Put the resulting HTTPS Worker URL in `www/config.js`.
3. Push the project to GitHub.
4. GitHub Pages redeploys the Mini App.
5. Use two Telegram accounts to verify a live match.

The Worker is intentionally separate from GitHub Pages. GitHub Pages remains the host for the app itself.

## Local development

Serve `www/` over HTTP rather than opening files directly:

```bash
cd www
python3 -m http.server 8080
```

The live signaling Worker can be developed separately from `signaling-worker/` with Wrangler.

## Release checks

From the project root:

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

The GitHub Pages workflow runs these gates before deployment.

## Multiplayer behavior by game

- **Chess:** one validated move is sent immediately over the live channel. Long replay history still uses irreversible-move checkpoints.
- **Reversi:** forced passes stay automatic; the remote client updates only when control actually changes.
- **Mancala:** consecutive extra turns stay on the same device and are delivered as one validated batch when the turn changes.
- **Dots & Boxes:** box-scoring chains remain uninterrupted locally; the compact edge history is replayed on the other device.
- **Nine Men's Morris:** placement, sliding/flying, mills, captures, repetition and draw counters are replay-validated.
- **Backgammon:** both dice/checker movements complete locally and the whole validated dice turn is sent once.

A modified client can still cheat because there is no authoritative game server. This release is therefore suitable for casual friend play, not trusted competitive rankings or prize-based play.

## Persistence and privacy

Game progress and match state stay in the encrypted local vault. The signaling Worker receives only WebRTC negotiation traffic and normal connection metadata; it does not receive gameplay packets. The room secret is stored only as a SHA-256 hash and is automatically expired by the Worker. See `www/privacy.html` and `TMA_DEPLOYMENT.md` for details.

## Legal

The original MIT notice in `LICENSE` remains because the license requires it. The bundled Vazirmatn font retains its SIL Open Font License notice in `www/fonts/OFL.txt`.

# Live multiplayer setup

Mini Arcade v1.2.0 keeps the website on GitHub Pages and uses a tiny Cloudflare Worker only for WebRTC signaling. The Worker does not run the games and does not receive game moves.

## 1. Create a Cloudflare account

You need a Cloudflare account capable of deploying Workers/Durable Objects. No domain is required; a `workers.dev` URL is enough.

## 2. Lock the Worker to your GitHub Pages origin

`signaling-worker/wrangler.jsonc` currently contains:

```json
"ALLOWED_ORIGINS": "https://thobilobar.github.io"
```

That matches the current GitHub Pages origin for this repository. If you later use a custom domain, change this value to the new origin before redeploying the Worker.

## 3. Deploy the signaling Worker

### Easiest manual method

Open a terminal in the project folder:

```bash
cd signaling-worker
npm install
npx wrangler login
npx wrangler deploy
```

Wrangler prints the public HTTPS URL, for example:

```text
https://mini-arcade-signal.<your-subdomain>.workers.dev
```

Open `/health` on that URL. It should return JSON with `"ok": true`.

### Or deploy from GitHub Actions

The repository includes **Deploy Mini Arcade signaling worker** as a manual workflow.

Add these repository secrets in **GitHub > Settings > Secrets and variables > Actions**:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Then open **Actions > Deploy Mini Arcade signaling worker > Run workflow**.

## 4. Put the Worker URL into Mini Arcade

Edit `www/config.js`:

```js
liveMultiplayer: {
  enabled: true,
  signalingUrl: 'https://mini-arcade-signal.<your-subdomain>.workers.dev',
  connectTimeoutMs: 12000,
  fallbackDelayMs: 8000,
  ackTimeoutMs: 4500,
  reconnectMs: 1200,
  iceServers: []
}
```

Do not add a trailing `/`.

`iceServers: []` means the app asks the Worker for ICE configuration. Without TURN secrets, the Worker returns Cloudflare's public STUN endpoint and WebRTC tries a direct peer-to-peer connection.

## 5. Optional TURN fallback

Direct WebRTC works on many networks, but restrictive mobile networks/firewalls can require TURN. The Worker already supports optional Cloudflare Realtime TURN credentials.

If you create a Cloudflare TURN key, add these as **Worker secrets**, not frontend values:

```bash
cd signaling-worker
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler deploy
```

Never place TURN API secrets in `www/config.js` or GitHub Pages. The Worker exchanges them for short-lived browser credentials at `/ice`.

## 6. Commit and deploy GitHub Pages

From the project root:

```bash
git status
git add .
git commit -m "Add live WebRTC multiplayer v1.2.0"
git push origin main
```

Wait for **Test and deploy Mini Arcade to GitHub Pages** to finish successfully.

## 7. Test with two Telegram accounts

1. Account A opens Mini Arcade and starts **Telegram friend** mode in Chess.
2. Account A makes the first move and sends the Telegram invitation once.
3. Account B taps the invitation and the match opens.
4. Both devices should show **Live** after WebRTC connects.
5. Account B makes a move. Account A should see it without receiving or opening another Telegram message.
6. Continue several moves in both directions.
7. Put one phone into the background briefly, return, and verify it reconnects.
8. Switch one device between Wi-Fi/mobile data if possible and verify reconnection/fallback behavior.
9. If live reconnection cannot complete, the match should expose **Send via Telegram** so the existing turn-link protocol can recover the game.
10. Repeat with Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon.

## Connection states

The multiplayer strip can show:

- Connecting live…
- Waiting for opponent
- Live
- Reconnecting…
- Live unavailable
- Send via Telegram

A live move is retained until the receiving client validates it and returns an application-level acknowledgement. Duplicate live packets are safe because the existing match revision/checksum layer rejects reapplication.

## What the Worker sees

The signaling Worker receives:

- room identifier
- room secret during authentication (stored only as a SHA-256 hash)
- player role (1 or 2)
- WebRTC offer/answer and ICE candidate messages
- normal request metadata inherent to an internet connection

It does not accept or relay `turn` game messages. Game moves go through the WebRTC DataChannel once connected.

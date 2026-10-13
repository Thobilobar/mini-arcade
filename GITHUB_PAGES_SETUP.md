# GitHub Pages + Telegram setup

This release is prepared to run as a GitHub Pages **project site**, including URLs such as:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/
```

All runtime asset paths, the manifest, service worker, game navigation and Telegram multiplayer routing are relative to the project path. You do not need to rename the repository to `YOUR-USERNAME.github.io`.

## Before uploading

Open `www/config.js` and set the public username of the Telegram bot that will own the Mini App, without `@`:

```js
window.MINI_ARCADE_CONFIG = Object.assign({
  botUsername: 'YourBotUsername',
  appShortName: '',
  deepLinkMode: 'fullscreen',
  liveMultiplayer: {
    enabled: true,
    signalingUrl: '',
    connectTimeoutMs: 12000,
    fallbackDelayMs: 8000,
    ackTimeoutMs: 4500,
    reconnectMs: 1200,
    iceServers: []
  }
}, window.MINI_ARCADE_CONFIG || {});
```

For the recommended setup, configure Mini Arcade as the bot's **Main Mini App** and leave `appShortName` empty. The backend-free multiplayer links then use:

```text
https://t.me/YourBotUsername?startapp=<match-data>&mode=fullscreen
```

Never put the BotFather token in `config.js`, a GitHub secret that is injected into the website, or any other browser file. This project does not need a bot token to run.

## Upload to GitHub

Create a GitHub repository and put this project at the repository root. The repository should contain `.github/`, `www/`, `tools/`, this documentation, and the license files.

If using Git locally:

```bash
git init
git add .
git commit -m "Deploy Mini Arcade Telegram TMA"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

The included workflow `.github/workflows/deploy-pages.yml` runs the complete automated release suite before deployment and publishes **only** the web app, not the repository's QA tools or source documentation.

## Turn on GitHub Pages

On GitHub:

1. Open the repository.
2. Open **Settings**.
3. Open **Pages** under **Code and automation**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Open the **Actions** tab and select **Test and deploy Mini Arcade to GitHub Pages**.
6. Wait for the workflow to finish with a green check.
7. Open **Settings > Pages** again and copy the published HTTPS URL.

For a normal project repository, the URL is usually:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/
```

The workflow uses GitHub's Pages actions and creates an immutable deployment artifact from `www/`. It also adds the current Git commit as `APP_BUILD`, causing the service worker to discover every successful deployment even when the semantic app version does not change.


## Enable live multiplayer

GitHub Pages remains the host for Mini Arcade, but automatic live turns need the included signaling Worker. Follow `LIVE_MULTIPLAYER_SETUP.md` to deploy `signaling-worker/` to Cloudflare. Then paste its HTTPS URL into `www/config.js` as `liveMultiplayer.signalingUrl` and push again.

If you skip this step, multiplayer does not break: the six games continue using Telegram turn links exactly as the previous release did.

The repository also contains a manual GitHub Action named **Deploy Mini Arcade signaling worker** if you prefer deploying the Worker from GitHub after adding the required Cloudflare repository secrets.

## Connect the published URL to Telegram

Create or select the bot in **@BotFather**, then configure Mini Arcade as its **Main Mini App**. Use the exact GitHub Pages HTTPS URL including the repository path and trailing slash, for example:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/
```

A Main Mini App gives the bot an app-launch entry on its profile and makes the serverless multiplayer deep links used by this project work with the empty `appShortName` setting.

Optionally configure the bot's **Menu Button** to open the same URL so users can launch Mini Arcade directly from the bot chat as well.

After the Main Mini App is configured, the generic launch link is:

```text
https://t.me/YourBotUsername?startapp&mode=fullscreen
```

You should test that link instead of relying only on opening the raw GitHub Pages URL in a browser, because Telegram user information, secure storage, BackButton, haptics, theme data and other Mini App APIs exist only inside Telegram.

## First production test

Use two Telegram accounts.

1. Launch Mini Arcade from the bot and confirm Telegram name/photo, theme and BackButton behavior.
2. Close/reopen once and confirm progress/settings persist.
3. Account A opens Chess and chooses **Telegram friend**.
4. A makes the first move and sends the Telegram invitation to B. This is the only normal Telegram handoff needed.
5. B opens the invitation. Wait for the multiplayer strip on both devices to show **Live**.
6. B makes a move. A should see it automatically without opening another message.
7. Continue several moves in both directions.
8. Background one device briefly, return, and verify **Reconnecting…** returns to **Live**.
9. Temporarily interrupt one device's network. If automatic reconnection cannot recover, verify **Send via Telegram** appears and can recover the same match.
10. Repeat the basic live-turn test for Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon.
11. Reopen a duplicate fallback link and confirm it is rejected as stale rather than applying twice.
12. Forward a bound match link to a third account and confirm spectator mode rather than player replacement.
13. Finish at least one complete match and verify result/rematch behavior.

For restrictive mobile networks, configure the optional TURN credentials described in `LIVE_MULTIPLAYER_SETUP.md`.

## Updating the live app later

Make changes, run the tests locally if desired, commit, and push to `main`:

```bash
git add .
git commit -m "Update Mini Arcade"
git push
```

GitHub Actions tests the release first. Only a successful test run is deployed. The Git SHA is added to the deployed `version.js`, so returning users receive the new service-worker cache rather than staying indefinitely on an older build.

Do not change the BotFather Mini App URL for normal updates as long as the GitHub repository URL remains the same.

## Optional custom domain

A custom domain can be added later in **GitHub repository > Settings > Pages**. If you switch the production URL to the custom domain, update the Main Mini App URL and Menu Button URL in BotFather to the new HTTPS address. The app itself requires no path rewrite because its internal URLs are relative.

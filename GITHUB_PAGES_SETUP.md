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
  deepLinkMode: 'fullscreen'
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

Use two Telegram accounts for the multiplayer checks.

1. Open the bot profile and launch Mini Arcade.
2. Confirm the displayed Telegram name/photo are correct.
3. Switch Telegram between light and dark theme and confirm the app follows it.
4. Open several games and use the Telegram BackButton to return.
5. Close Mini Arcade, reopen it, and verify progress/settings persisted.
6. Test at least one solo game through completion.
7. On account A, open each supported multiplayer game and choose **Telegram friend**.
8. Make the opening action and send the generated challenge to account B.
9. On account B, open the link, make a legal turn and send it back.
10. Repeat for Chess, Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon.
11. Dismiss the Telegram share chooser once and confirm **Send move** lets you retry.
12. Open the same move link twice and confirm the second open is treated as stale/duplicate rather than replaying the move.
13. Forward a live-match link to a third Telegram account and confirm it opens as a spectator rather than replacing either player.
14. Close/reopen Telegram during a match and confirm the encrypted active match resumes.
15. Finish at least one multiplayer game and verify the result screen/rematch flow.

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

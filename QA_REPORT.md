# Mini Arcade TMA — QA Report

Release: **1.1.4**  
Prepared: **13 October 2026**

## Automated release gates

### TMA static contract audit — PASS

`node tools/tma-static-check.js`

Result: **181/181 passed**.

Coverage includes the 18-game catalogue and assets; Telegram SDK/bridge/core ordering; encrypted-vault hydration; root navigation; removal of league/achievement/award and old user-facing attribution; manifest/cache integrity; Telegram profile rendering; SecureStorage/DeviceStorage/AES-GCM/BackButton/haptics/fullscreen contracts; no direct plaintext localStorage in app pages; all inline scripts parsing; all 18 embedded engine factories loading; multiplayer deployment config; root incoming-link routing; service-worker caching of the multiplayer runtime; and Telegram Friend mode being present only on the six intended multiplayer games.

### Telegram bridge + encrypted storage unit test — PASS

`node tools/tma-unit-test.js`

Result: **17/17 passed**.

Coverage includes Telegram secure/device storage selection, lifecycle, user hydration, safe areas, BackButton behavior, plaintext migration/removal, ciphertext verification, AES-key placement, fresh-context decryption, native haptics/share routing and scoped reset.


### Telegram-native UI integration audit — PASS

`node tools/tma-ui-check.js`

Result: **35/35 passed**.

Coverage includes Telegram ThemeParams mapping for section/text/button/separator colors, native bottom-bar synchronization, duplicate home-title suppression while Telegram chrome is visible, fullscreen-aware title restoration, compact TMA spacing, denser game tiles, Telegram color-scheme tracking for Auto theme, the layered Games section, elevated/tinted game surfaces, per-game accent treatment, tactile press feedback and icon elevation, plus the shared layered redesign for Daily, Profile/Settings, day-detail modal, first-run onboarding and Privacy.

### Game-engine migration smoke — PASS

`node tools/tma-game-smoke.js`

Result: **18/18 passed**. Every engine receives a deterministic functional check rather than only a parse check.

### Multiplayer transport/adversarial suite — PASS

`node tools/tma-multiplayer-test.js`

Result: **22/22 passed**.

Coverage includes compact token round-trips, Telegram-safe token characters, corruption rejection, two-player identity binding, reply binding, stale/duplicate rejection, previous-state chain rejection, third-account spectator behavior, side mapping, encrypted active-match resume semantics, deep-link construction, Telegram share-chooser invocation, UTF-8 display-name byte bounding and conservative payload-size cases.

### Per-game multiplayer adapter suite — PASS

`node tools/tma-multiplayer-game-test.js`

Result: **24/24 passed**.

Coverage includes Reversi pass replay and tamper rejection; Mancala extra-turn batching and seed conservation; Dots scoring-chain replay, compact-history integrity and a complete 8×8 reconstruction; Morris replay of board/hand/turn/draw-clock state and action mismatch rejection; Backgammon whole-dice-turn replay, invalid-die rejection and checker conservation; and Chess long-history reconstruction, invalid move-index rejection and resignation validation.

### Multiplayer complete-game / long-game stress — PASS

`node tools/tma-multiplayer-stress.js`

Result: **12/12 passed**.

The stress gate completed full cross-device-style simulations for Reversi, Mancala, an 8×8 Dots board and Backgammon; replayed **750 randomized Morris games** (longest observed: **205 moves**); and drove Chess through an unusually long **478-ply legal game** while validating every checkpoint. With deliberately long Telegram-style identity fields, the largest observed conservative launch payloads were: Reversi **286**, Mancala **256**, Dots **478**, Morris **422**, Backgammon **358**, and Chess **351** characters.

The Dots encoder uses a rank/permutation bitstream rather than repeating edge numbers, and Chess checkpoints replay at the latest pawn move/capture so long matches do not grow the transmitted history without bound.

## Regression status

After the multiplayer changes, the original TMA migration gates remain green: **181/181 static**, **17/17 bridge/storage**, and **18/18 engine smoke**. The multiplayer-specific gates add **22/22 transport**, **24/24 adapter**, and **12/12 stress** checks, for **274 passing release assertions** across the six automated gates.

## Upstream exhaustive-suite note

The original repository's monolithic suite is not the final TMA release gate because parts intentionally assert the old distribution contract (for example, no external script and the old manifest branding), which conflicts with a Telegram Mini App that loads Telegram's bridge. Its heaviest solver/AI batches also exceed this sandbox's execution window. The focused release gates above keep the original game-engine checks while explicitly testing the new Telegram/crypto/multiplayer/UI contracts.

## Browser automation limitation

A deterministic Chromium/Playwright harness with mocked Telegram APIs was attempted again for this release, using the installed system Chromium. This execution environment blocked navigation to the local app with **`ERR_BLOCKED_BY_ADMINISTRATOR`**. Therefore real browser/device smoke testing is **not claimed as completed** here.

Before production launch, deploy `www/` over HTTPS and run the device/two-account matrix in `TMA_DEPLOYMENT.md` inside current Telegram Android and iOS clients. Platform WebView behavior, Telegram-client versions, OS-backed storage and the real share chooser cannot be fully proven by Node/VM tests.

## Legal scan

User-facing author/source references remain removed from the runtime. The MIT copyright/permission notice in `LICENSE` and the Vazirmatn font copyright/OFL notice in `www/fonts/OFL.txt` are intentionally retained as required license material.

## GitHub Pages deployment audit — PASS

`node tools/github-pages-check.js`

Result: **402/402 passed**.

Coverage includes the included GitHub Actions Pages workflow, `.nojekyll`, deployment of only the prepared web artifact, per-deploy Git SHA cache rotation, project-site-safe manifest scope/start URLs, relative service-worker registration, absence of hard-coded `github.io` origins, absence of frontend bot tokens, and resolution of every shipped local HTML `href`/`src` under a simulated `https://example.github.io/mini-arcade/` project path.

A second HTTP smoke mounted the exact `www/` tree at `/repository/` and returned **HTTP 200 with non-empty bodies** for the menu, configuration, version, service worker, manifest, catalogue, Telegram bridge, multiplayer runtime, Chess, Backgammon and privacy page. The workflow YAML also parsed successfully.

With the existing 274 TMA/game/multiplayer assertions, 35 Telegram-native/UI assertions, and 402 GitHub Pages assertions, this release records **711 passing automated assertions** before packaging.

# Mini Arcade QA Report

Release: **1.2.0**  
Date: **13 October 2026**

## Release summary

This release adds low-friction live multiplayer to the six existing two-player games while preserving the previous Telegram deep-link protocol as invitation/recovery fallback.

Normal flow:

1. The inviter makes the first legal action.
2. Telegram is used once to send the invitation.
3. The recipient opens the link.
4. The two Mini Apps negotiate WebRTC through the included signaling Worker.
5. Subsequent validated moves/turns travel automatically over an encrypted ordered DataChannel.
6. If the live connection drops, the app reconnects and queues a pending move. If recovery fails, **Send via Telegram** becomes available for the same match.

The signaling Worker accepts WebRTC signaling only. Game `turn` messages are not relayed through it. Room secrets are persisted only as SHA-256 hashes and are assigned an expiry alarm.

## Automated release gates

| Gate | Result |
|---|---:|
| TMA/static contract | **188/188** |
| Telegram bridge + encrypted storage | **17/17** |
| Telegram-native UI integration | **39/39** |
| 18 game-engine smoke tests | **18/18** |
| Telegram match transport/adversarial | **22/22** |
| Six per-game multiplayer adapters | **24/24** |
| Complete/long-match multiplayer stress | **12/12** |
| Live WebRTC transport/reconnect/ACK | **13/13** |
| Signaling Worker security/protocol | **11/11** |
| GitHub Pages/path/deployment audit | **421/421** |
| **Total** | **765/765** |

## Live multiplayer assertions covered

The dedicated live transport test verifies:

- cryptographically-sized per-match live room secrets;
- room secret survival through the compact Telegram invitation format;
- role-one/role-two binding;
- connected live state on both peers;
- automatic opponent move delivery without another Telegram handoff;
- application-level ACK clearing only after verified receipt;
- duplicate packet idempotence;
- wrong-room-secret rejection before game application;
- queuing during temporary disconnect;
- one-time Telegram invitation behavior;
- graceful fallback when no signaling URL is configured.

The signaling Worker test verifies:

- room-secret authentication;
- opposite-role peer joining;
- SDP offer relay;
- rejection of gameplay `turn` relay through the signaling service;
- wrong secret rejection;
- same-role reconnect replacement;
- disconnect notification;
- SHA-256-only secret persistence;
- automatic room-secret expiry scheduling.

## Existing multiplayer regression coverage retained

The earlier deterministic/replay tests remain green for Chess, Reversi, Mancala, Dots & Boxes, Nine Men's Morris and Backgammon. These cover stale/duplicate updates, previous-state chains, spectator handling, full replay reconstruction, corrupted/tampered state, extra-turn batching, forced passes, complete 8×8 Dots games, randomized Morris games, deterministic Backgammon turns and unusually long Chess histories.

## Deployment checks

The GitHub Pages audit confirms the app remains safe under a project path such as:

```text
https://username.github.io/repository/
```

The Pages workflow still publishes only the prepared `www/` artifact and now runs the live multiplayer and signaling Worker unit gates before deployment.

The signaling service itself is **not** automatically deployed by the Pages workflow. It is included under `signaling-worker/` and can be deployed manually or with the separate manual GitHub Actions workflow.

## Limitations / required real-device validation

Node/VM tests cannot reproduce every Telegram WebView, carrier NAT, firewall, mobile-network switch, or OS suspension condition. A real two-account device test is still required before public launch.

The environment used to build this release could not complete an online `npm install`/Wrangler dry-run within the execution timeout, so this report does **not** claim a live Cloudflare deployment was performed from this sandbox. The Worker source and protocol were syntax/unit tested locally against mocks, and its current configuration follows the included deployment guide.

For production reliability on restrictive networks, configure TURN as described in `LIVE_MULTIPLAYER_SETUP.md` and test on both Wi-Fi and mobile data.

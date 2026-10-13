/* Mini Arcade deployment configuration.
   botUsername: Telegram bot username without @.
   liveMultiplayer.signalingUrl: deploy signaling-worker/ and paste its HTTPS
   base URL here (example: https://mini-arcade-signal.example.workers.dev).
   Leave it blank to keep the Telegram turn-link transport only. */
window.MINI_ARCADE_CONFIG = Object.assign({
  botUsername: 'MyMiniArcadeBot',
  appShortName: '',
  deepLinkMode: 'fullscreen',
  liveMultiplayer: {
    enabled: true,
    signalingUrl: 'https://mini-arcade-signal.myarcadegametele.workers.dev',
    connectTimeoutMs: 12000,
    fallbackDelayMs: 8000,
    ackTimeoutMs: 4500,
    reconnectMs: 1200,
    // If the signaling worker has TURN configured, /ice automatically adds
    // short-lived TURN credentials. Otherwise Cloudflare's free STUN service
    // is used for direct peer-to-peer connectivity.
    iceServers: []
  }
}, window.MINI_ARCADE_CONFIG || {});

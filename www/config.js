/* Mini Arcade deployment configuration.
   Set botUsername once before production deployment, without the leading @.
   GitHub Pages project URLs need no special base path here; all app assets are relative.
   Leave appShortName empty when Mini Arcade is configured as the bot's Main Mini App. */
window.MINI_ARCADE_CONFIG = Object.assign({
  botUsername: 'MyMiniArcadeBot',
  appShortName: '',
  deepLinkMode: 'fullscreen'
}, window.MINI_ARCADE_CONFIG || {});

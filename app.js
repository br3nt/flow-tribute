// Starts flOw in Ruffle on click (the click also lets the browser play the music).
(() => {
  const stage = document.getElementById('stage');
  const start = document.getElementById('start');
  const status = document.getElementById('status');
  const fullscreen = document.getElementById('fullscreen');

  const say = (text, error = false) => { status.textContent = text; start.classList.toggle('error', error); };

  start.addEventListener('click', async () => {
    const ruffle = window.RufflePlayer && window.RufflePlayer.newest();
    if (!ruffle) { say('Ruffle did not load from unpkg.com. Check your connection and reload.', true); return; }

    start.disabled = true;
    say('loading…');
    const player = ruffle.createPlayer();
    stage.prepend(player);
    try {
      await player.ruffle().load({
        url: 'game/core.swf',
        // levels.xml and the music are loaded relative to the SWF.
        base: 'game/',
        autoplay: 'on',
        unmuteOverlay: 'hidden',
        splashScreen: false,
        // The stage is exactly 2:1, so no bars are needed; Ruffle's bars are black and would show at the edges.
        letterbox: 'off',
        backgroundColor: '#00BFFF',
        backgroundExecutionMode: 'none',
        contextMenu: 'rightClickOnly',
      });
    } catch (err) {
      player.remove();
      start.disabled = false;
      say(`couldn't load the game (${err && err.message ? err.message : err}). Click to try again.`, true);
      return;
    }
    start.remove();
    player.focus();
    if (window.flowOcean) window.flowOcean.gameStarted();
    // iPhone Safari has no element full screen.
    fullscreen.hidden = !document.fullscreenEnabled;
  });

  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    fullscreen.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    fullscreen.title = on ? 'Exit full screen' : 'Full screen';
  });
})();

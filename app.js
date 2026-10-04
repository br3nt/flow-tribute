// Starts flOw in Ruffle on click (the click also lets the browser play the music).
(() => {
  const stage = document.getElementById('stage');
  const start = document.getElementById('start');
  const status = document.getElementById('status');
  const fullscreen = document.getElementById('fullscreen');

  const say = (text, error = false) => { status.textContent = text; status.classList.toggle('error', error); };

  start.addEventListener('click', async () => {
    const ruffle = window.RufflePlayer && window.RufflePlayer.newest();
    if (!ruffle) { say('Ruffle did not load. It comes from a CDN (unpkg.com), so check your connection and reload.', true); return; }

    start.disabled = true;
    say('Loading…');
    const player = ruffle.createPlayer();
    stage.appendChild(player);
    try {
      await player.ruffle().load({
        url: 'game/core.swf',
        // levels.xml and the music are loaded relative to the SWF.
        base: 'game/',
        autoplay: 'on',
        unmuteOverlay: 'hidden',
        splashScreen: false,
        letterbox: 'on',
        backgroundColor: '#00BFFF',
        // Pause while the tab is in the background, resume when it's back.
        backgroundExecutionMode: 'none',
        contextMenu: 'rightClickOnly',
      });
    } catch (err) {
      player.remove();
      start.disabled = false;
      say(`The game failed to load (${err && err.message ? err.message : err}). Try again, or use another browser.`, true);
      return;
    }
    start.remove();
    player.focus();
    fullscreen.disabled = false;
    say('Move the mouse to swim. Hold the button to go faster.');
  });

  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => say('Your browser refused full screen.', true));
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  });
})();

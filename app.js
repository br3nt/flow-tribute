// Starts flOw in Ruffle on click (the click also lets the browser play the music), with whichever level set is picked.
(() => {
  const stage = document.getElementById('stage');
  const start = document.getElementById('start');
  const status = document.getElementById('status');
  const fullscreen = document.getElementById('fullscreen');
  let player = null, levelsUrl = null, levels = { id: 'original', name: '' };

  const say = (text, error = false) => { status.textContent = text; start.classList.toggle('error', error); };
  const idle = () => say(levels.id !== 'original' ? `sound on · ${levels.name}` : 'sound on');
  document.addEventListener('flow:levels', e => { levels = e.detail; if (!player) idle(); });
  if (window.flowLevels) { levels = window.flowLevels.pick(); idle(); }

  start.addEventListener('click', async () => {
    const ruffle = window.RufflePlayer && window.RufflePlayer.newest();
    if (!ruffle) { say('Ruffle did not load from unpkg.com. Check your connection and reload.', true); return; }

    const set = window.flowLevels ? window.flowLevels.current() : { url: null };
    if (!set) { say('these levels need fixing first (see the editor below)', true); return; }
    start.disabled = true;
    say('loading…');
    levelsUrl = set.url;
    // If the level set is switched while this loads, stop() replaces `player`; this load then quietly gives up.
    const mine = player = ruffle.createPlayer();
    stage.prepend(mine);
    try {
      await mine.ruffle().load({
        url: 'game/core.swf',
        // levels.xml and the music are loaded relative to the SWF.
        base: 'game/',
        // Another level set: send the game's request for levels.xml there instead. The rule has to match the
        // whole URL, because Ruffle swaps in only the matched part.
        urlRewriteRules: set.url ? [[/^.*\/levels\.xml$/, set.url]] : [],
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
      if (player !== mine) return;
      stop();
      say(`couldn't load the game (${err && err.message ? err.message : err}). Click to try again.`, true);
      return;
    }
    if (player !== mine) return;
    start.hidden = true;
    mine.focus();
    if (window.flowOcean) window.flowOcean.gameStarted(true);
    // iPhone Safari has no element full screen.
    fullscreen.hidden = !document.fullscreenEnabled;
  });

  // Picking another level set ends the current game and puts the start button back.
  function stop() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (player) { player.remove(); player = null; }
    if (levelsUrl && levelsUrl.startsWith('blob:')) URL.revokeObjectURL(levelsUrl);
    levelsUrl = null;
    start.hidden = false; start.disabled = false; fullscreen.hidden = true;
    if (window.flowOcean) window.flowOcean.gameStarted(false);
    idle();
  }
  window.flowGame = { stop };

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

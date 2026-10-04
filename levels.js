// Level sets: the original levels.xml, a shortcut to the Jellyfish campaign, and the visitor's own, kept in this
// browser's localStorage. The game reads levels.xml at startup; app.js points that request at whichever set is
// picked. The validator follows what core.swf's LevelLoader actually reads (see README).
(() => {
  const STORE = 'flow-tribute:levels', PICK = 'flow-tribute:pick';
  const BUILT_IN = [
    { id: 'original', name: "Jenova Chen's levels", url: 'game/levels.xml', note: 'The original game.' },
    { id: 'jellyfish', name: 'Shortcut to the jellyfish', url: 'levels/jellyfish-shortcut.xml',
      note: 'Campaign 1 cut to its title and a smaller final boss. Dive once, eat the boss, then the gold egg it drops, and you hatch as a jellyfish in the game\'s unfinished second campaign.' },
  ];

  // ---------- storage (best effort: private windows can refuse it) ----------
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  let saved = read(STORE, []);
  if (!Array.isArray(saved)) saved = [];
  saved = saved.filter(x => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.xml === 'string');
  let pick = read(PICK, 'original');
  const all = () => [...BUILT_IN, ...saved.map(s => ({ ...s, custom: true }))];
  const find = id => all().find(s => s.id === id);
  if (!find(pick)) pick = 'original';

  // ---------- validation ----------
  const INT = /^-?\d+$/;
  const FISH = ['num', 'numSegs', 'maxSegs', 'randEvolve', 'segLength', 'speedMin', 'speedVar', 'turnMin', 'turnVar'];
  const BIG = ['num', 'numSegs', 'segLength', 'speedMin', 'speedVar', 'turnMin', 'turnVar'];
  const SPAWNS = {
    SpawnFood: { need: ['num', 'foodType', 'hpMin', 'hpVar'] },
    SpawnFish: { need: FISH, opt: ['panic'] },
    SpawnJellyfish: { need: FISH, opt: ['panic'] },
    SpawnFlockfish: { need: FISH, opt: ['panic'] },
    SpawnManta: { need: BIG },
    SpawnBoss: { need: BIG },
    SpawnBillboard: { need: ['name', 'posX', 'posY'] },
    SpawnGoldEgg: { need: ['fishNum'] },
  };
  const BILLBOARDS = ['flowing_title', 'credits', 'tobecontinued', 'warning'];
  const FOOD_TYPES = [0, 1, 2, 3, 4, 5];
  const PLAYERS = ['Snakefish', 'Jellyfish'];
  const MUSIC_TRACKS = 20;
  // Sensible ceilings: past these the game crawls or the level is unplayable.
  const LIMITS = { num: 60, numSegs: 60, maxSegs: 60, segLength: 120, speedMin: 300, speedVar: 300, turnMin: 30, turnVar: 30, hpMin: 100, hpVar: 100, levelSize: 2000 };

  function validate(text) {
    const errors = [], warnings = [];
    const err = (line, msg) => errors.push({ line, msg }), warn = (line, msg) => warnings.push({ line, msg });
    if (text.length > 200000) { err(1, 'The file is over 200 KB; that is far bigger than any level set needs.'); return { errors, warnings, campaigns: [] }; }
    // Flash tolerated comments like <!------ Title ------>, which strict XML doesn't. Blank comments out for
    // checking only (keeping line breaks so line numbers still match); the saved file is left as written.
    const blank = m => m.replace(/[^\n]/g, ' ');
    const clean = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, blank);
    // For counting start tags only, also hide CDATA and processing instructions, which can contain "<Tag".
    const tagText = clean.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, blank).replace(/<\?[\s\S]*?\?>/g, blank);
    // Line of each start tag, in document order, to give elements line numbers.
    const tagLines = [];
    const re = /<([^\s\/>!?][^\s\/>]*)/g; let m;
    while ((m = re.exec(tagText))) tagLines.push(tagText.slice(0, m.index).split('\n').length);

    const doc = new DOMParser().parseFromString(clean, 'application/xml');
    const bad = doc.getElementsByTagName('parsererror')[0];
    if (bad) {
      const msg = bad.textContent.replace(/\s+/g, ' ').trim();
      const at = msg.match(/line(?: number)? (\d+)/i);
      err(at ? +at[1] : 1, 'Not well-formed XML: ' + msg.replace(/^This page contains the following errors: ?/i, '').replace(/\s*Below is a rendering.*$/i, ''));
      return { errors, warnings, campaigns: [] };
    }
    const els = [...doc.getElementsByTagName('*')];
    const lineOf = el => tagLines[els.indexOf(el)] || 1;
    const kids = el => [...el.childNodes].filter(n => n.nodeType === 1);
    const strayText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

    const root = doc.documentElement;
    if (root.nodeName !== 'flOw') err(lineOf(root), `The root element must be <flOw>, not <${root.nodeName}>.`);
    if (strayText(root)) err(lineOf(root), 'Text directly inside <flOw>; only <Campaign> elements belong there.');

    const campaigns = [], nums = new Set();
    for (const c of kids(root)) {
      const line = lineOf(c);
      if (c.nodeName !== 'Campaign') { err(line, `<${c.nodeName}> can't go inside <flOw>; only <Campaign>.`); continue; }
      const num = c.getAttribute('num'), player = c.getAttribute('player');
      if (num == null || !INT.test(num) || +num < 1) err(line, 'Each <Campaign> needs num="1", num="2", and so on.');
      else if (nums.has(+num)) err(line, `Two campaigns have num="${num}".`);
      else nums.add(+num);
      if (!PLAYERS.includes(player)) err(line, `player must be ${PLAYERS.map(p => `"${p}"`).join(' or ')}.`);
      const levels = [];
      for (const l of kids(c)) {
        const ll = lineOf(l);
        if (l.nodeName !== 'Level') { err(ll, `<${l.nodeName}> can't go inside <Campaign>; only <Level>.`); continue; }
        const bg = l.getAttribute('bgColor'), size = l.getAttribute('levelSize');
        if (!/^0x[0-9a-fA-F]{6}$/.test(bg || '')) err(ll, 'bgColor must look like 0x00BFFF.');
        if (size == null || !INT.test(size) || +size < 100) err(ll, 'levelSize must be a whole number of at least 100.');
        else if (+size > LIMITS.levelSize) warn(ll, `levelSize ${size} is huge; the original levels use 300 to 400.`);
        const spawns = {};
        for (const s of kids(l)) {
          const sl = lineOf(s), rule = SPAWNS[s.nodeName];
          if (!rule) { warn(sl, `The game ignores <${s.nodeName}>. It knows ${Object.keys(SPAWNS).map(k => `<${k}>`).join(', ')}.`); continue; }
          for (const a of rule.need) {
            const v = s.getAttribute(a);
            if (v == null) { err(sl, `<${s.nodeName}> is missing ${a}="…".`); continue; }
            if (a === 'name') continue;
            if (!INT.test(v)) { err(sl, `${a}="${v}" on <${s.nodeName}> must be a whole number.`); continue; }
            if (+v < 0 && !['posX', 'posY'].includes(a)) err(sl, `${a} on <${s.nodeName}> can't be negative.`);
            else if (LIMITS[a] && +v > LIMITS[a]) warn(sl, `${a}="${v}" on <${s.nodeName}> is very high and may make the game crawl.`);
          }
          for (const a of s.getAttributeNames()) if (!rule.need.includes(a) && !(rule.opt || []).includes(a)) warn(sl, `The game ignores ${a}="…" on <${s.nodeName}>.`);
          if (s.hasAttribute('panic') && !['true', 'false'].includes(s.getAttribute('panic'))) err(sl, 'panic must be "true" or "false".');
          if (s.nodeName === 'SpawnFood' && INT.test(s.getAttribute('foodType') || '') && !FOOD_TYPES.includes(+s.getAttribute('foodType')))
            err(sl, `foodType must be one of ${FOOD_TYPES.join(', ')}. The red and blue food are added for you: red on every level but the last, blue on every level but the first.`);
          if (s.nodeName === 'SpawnBillboard' && !BILLBOARDS.includes(s.getAttribute('name')))
            err(sl, `Billboard name must be one of ${BILLBOARDS.join(', ')}.`);
          if (s.hasAttribute('maxSegs') && INT.test(s.getAttribute('maxSegs')) && +s.getAttribute('maxSegs') < 1)
            err(sl, 'maxSegs must be at least 1.');
          if (s.nodeName === 'SpawnFood' && INT.test(s.getAttribute('num') || '')) spawns.food = (spawns.food || 0) + +s.getAttribute('num');
          else if (s.nodeName !== 'SpawnBillboard' && INT.test(s.getAttribute('num') || '')) spawns.creatures = (spawns.creatures || 0) + +s.getAttribute('num');
          if (s.nodeName === 'SpawnBoss' || s.nodeName === 'SpawnManta') spawns.big = true;
        }
        levels.push({ line: ll, bg: /^0x[0-9a-fA-F]{6}$/.test(bg || '') ? '#' + bg.slice(2) : null, spawns });
      }
      if (!levels.length) err(line, 'This campaign has no levels.');
      if (levels.length > MUSIC_TRACKS) warn(line, `This campaign has ${levels.length} levels; the game has music for ${MUSIC_TRACKS}, so levels past that are silent.`);
      campaigns.push({ num: +num, player, line, levels });
    }
    // After the gold egg the game always goes from campaign 1 to 2 and from 2 back to 1. The egg rides on the first
    // creature of the campaign's last level.
    for (const c of campaigns) {
      if (c.num > 2) warn(c.line, `The game only moves between campaigns 1 and 2, so campaign ${c.num} is never reached.`);
      const last = c.levels[c.levels.length - 1];
      if (c.num === 1 && last && !last.spawns.creatures)
        warn(last.line, 'The last level of campaign 1 has no creatures, so there is no gold egg to eat and no way on to campaign 2.');
    }
    if (nums.has(1) && !nums.has(2)) warn(lineOf(root), 'There is no campaign 2. Eating the gold egg moves the game to campaign 2; without one, your creature never hatches.');
    if (!campaigns.length) err(lineOf(root), 'There are no campaigns.');
    else if (!nums.has(1)) err(lineOf(root), 'The game starts at campaign num="1", and there isn\'t one.');
    else if (campaigns[0].num !== 1) err(campaigns[0].line, 'Campaign num="1" must come first: the game only builds the title level for the first campaign in the file.');
    errors.sort((a, b) => a.line - b.line); warnings.sort((a, b) => a.line - b.line);
    return { errors, warnings, campaigns };
  }

  // ---------- picker beside the game ----------
  const select = document.getElementById('level-pick');
  const pickNote = document.getElementById('level-note');
  // A saved set can stop validating (older saves, or a stricter validator later); never hand one of those to the game.
  const broken = set => set.custom && validate(set.xml).errors.length > 0;
  function renderPicker() {
    select.innerHTML = '';
    for (const s of all()) {
      const o = document.createElement('option');
      o.value = s.id; o.textContent = s.custom ? `${s.name} (yours${broken(s) ? ', needs fixing' : ''})` : s.name;
      select.append(o);
    }
    select.value = pick;
    const cur = find(pick);
    pickNote.textContent = !cur.custom ? cur.note : broken(cur) ? 'These levels have problems; fix them in the editor below before playing.' : 'Your levels, saved in this browser.';
    document.dispatchEvent(new CustomEvent('flow:levels', { detail: { id: cur.id, name: cur.name } }));
  }
  select.addEventListener('change', () => {
    pick = select.value; write(PICK, pick); renderPicker();
    if (window.flowGame) window.flowGame.stop();
  });

  // ---------- editor ----------
  const $ = id => document.getElementById(id);
  const list = $('my-levels'), editor = $('editor'), nameIn = $('lv-name'), area = $('lv-xml');
  const report = $('lv-report'), strip = $('lv-strip'), storeNote = $('lv-store'), guardBar = $('lv-guard');
  let editing = null, timer = 0, dirty = false;

  const fetchText = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
  const uid = () => 'lv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function renderList(focusId) {
    list.innerHTML = saved.length ? '' : '<li class="empty" tabindex="-1">Nothing saved yet.</li>';
    for (const s of saved) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="lv-name">${esc(s.name)}${broken(s) ? ' <em class="lv-fix">needs fixing</em>' : ''}</span>
        <span class="lv-actions"><button type="button" class="chip" data-act="play">Play</button><button type="button" class="chip" data-act="edit">Edit</button><button type="button" class="chip" data-act="download">Download</button><button type="button" class="chip danger" data-act="delete">Delete</button></span>`;
      li.dataset.id = s.id;
      list.append(li);
    }
    renderFrom();
    // Rebuilding the list drops keyboard focus; put it somewhere sensible.
    if (focusId !== undefined) {
      const row = focusId && list.querySelector(`li[data-id="${CSS.escape(focusId)}"] button`);
      (row || list.querySelector('button') || list.querySelector('li')).focus();
    }
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const s = saved.find(x => x.id === b.closest('li').dataset.id); if (!s) return;
    if (b.dataset.act === 'play') playSet(s.id);
    else if (b.dataset.act === 'edit') guard(() => open(s));
    else if (b.dataset.act === 'download') download(s.name, s.xml);
    else if (b.dataset.act === 'delete' && confirmDelete(b)) {
      const i = saved.indexOf(s);
      saved = saved.filter(x => x !== s); write(STORE, saved);
      if (pick === s.id) { pick = 'original'; write(PICK, pick); }
      if (editing && editing.id === s.id) close();
      renderList(saved[Math.min(i, saved.length - 1)]?.id || null); renderPicker();
    }
  });
  // Two-step delete instead of a dialog: the first click arms the button. A double-click doesn't count as both.
  function confirmDelete(btn) {
    const armed = +btn.dataset.armed || 0;
    if (armed && Date.now() - armed > 400) return true;
    if (armed) return false;
    btn.dataset.armed = Date.now(); btn.textContent = 'Really delete?';
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Delete'; }, 3000);
    return false;
  }

  // Don't throw away unsaved edits without asking.
  let pending = null;
  function guard(action) {
    if (!dirty || editor.hidden) { action(); return; }
    pending = action; guardBar.hidden = false; $('lv-discard').focus();
  }
  $('lv-discard').addEventListener('click', () => { guardBar.hidden = true; dirty = false; const a = pending; pending = null; if (a) a(); });
  $('lv-keep').addEventListener('click', () => { guardBar.hidden = true; pending = null; area.focus(); });

  function open(set, xml, name) {
    editing = set ? { id: set.id } : { id: null };
    nameIn.value = (set ? set.name : name || nextName()).slice(0, 60);
    area.value = xml != null ? xml : set.xml;
    editor.hidden = false; guardBar.hidden = true; dirty = false;
    check();
    nameIn.focus();
    editor.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function close() { editor.hidden = true; guardBar.hidden = true; editing = null; dirty = false; }
  function nextName() { let n = 1; while (saved.some(s => s.name === `My levels ${n}`)) n++; return `My levels ${n}`; }

  $('lv-new').addEventListener('click', () => guard(async () => {
    try { open(null, await fetchText(find('original').url)); } catch { say('Could not load the original levels.xml. Are you offline?'); }
  }));
  $('lv-new-from').addEventListener('change', e => {
    const id = e.target.value; e.target.value = '';
    if (!id) return;
    guard(async () => {
      const s = find(id);
      try { open(null, s.custom ? s.xml : await fetchText(s.url), `Copy of ${s.name}`); } catch { say('Could not load that level set.'); }
    });
  });
  $('lv-import').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 200000) { storeNote.textContent = 'That file is over 200 KB, which is far bigger than any flOw level set.'; return; }
    const text = await f.text();
    guard(() => open(null, text, f.name.replace(/\.xml$/i, '')));
  });
  $('lv-cancel').addEventListener('click', () => guard(close));
  $('lv-download').addEventListener('click', () => download(nameIn.value, area.value));
  $('lv-save').addEventListener('click', () => save(false));
  $('lv-save-play').addEventListener('click', () => save(true));
  nameIn.addEventListener('input', () => { dirty = true; });
  area.addEventListener('input', () => { dirty = true; clearTimeout(timer); timer = setTimeout(check, 250); });
  // Tab types a tab in the XML; Escape then Tab moves on (the hint under the box says so). Shift+Tab always leaves.
  let escaped = false;
  area.addEventListener('keydown', e => {
    if (e.key === 'Escape') { escaped = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !escaped) { e.preventDefault(); area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input')); }
    escaped = false;
  });

  function say(msg) { report.innerHTML = `<p class="lv-bad">${esc(msg)}</p>`; }

  function check() {
    const r = validate(area.value);
    const item = (x, cls) => `<li class="${cls}"><button type="button" class="lv-line" data-line="${x.line}">line ${x.line}</button> ${esc(x.msg)}</li>`;
    const head = r.errors.length
      ? `<p class="lv-bad">${r.errors.length} problem${r.errors.length > 1 ? 's' : ''} to fix before this can be played.</p>`
      : `<p class="lv-good">Valid. ${r.campaigns.reduce((n, c) => n + c.levels.length, 0)} levels in ${r.campaigns.length} campaign${r.campaigns.length > 1 ? 's' : ''}.</p>`;
    report.innerHTML = head + (r.errors.length + r.warnings.length
      ? `<ul>${r.errors.map(x => item(x, 'err')).join('')}${r.warnings.map(x => item(x, 'warn')).join('')}</ul>` : '');
    strip.innerHTML = r.campaigns.map(c => `<div class="lv-campaign"><span>Campaign ${esc(c.num)} &middot; ${esc(c.player || '?')}</span><div class="lv-swatches">${
      c.levels.map((l, i) => `<button type="button" class="lv-swatch${l.spawns.big ? ' big' : ''}" data-line="${l.line}" style="--c:${l.bg || 'transparent'}" title="Level ${i}${l.bg ? ' ' + l.bg : ''}: ${l.spawns.food || 0} food, ${l.spawns.creatures || 0} creatures${l.spawns.big ? ', manta or boss' : ''}"><span class="sr">Level ${i}</span></button>`).join('')
    }</div></div>`).join('');
    $('lv-save').disabled = $('lv-save-play').disabled = !!r.errors.length;
    return r;
  }
  // Clicking a line number or a level swatch selects that line in the XML.
  for (const el of [report, strip]) el.addEventListener('click', e => {
    const b = e.target.closest('[data-line]'); if (!b) return;
    const lines = area.value.split('\n'), n = +b.dataset.line - 1;
    const start = lines.slice(0, n).join('\n').length + (n ? 1 : 0);
    area.focus(); area.setSelectionRange(start, start + (lines[n] || '').length);
    const lh = parseFloat(getComputedStyle(area).lineHeight) || 18;
    area.scrollTop = Math.max(0, n * lh - area.clientHeight / 3);
  });

  function save(andPlay) {
    if (check().errors.length) return;
    const name = nameIn.value.trim().slice(0, 60) || nextName();
    let set = editing.id && saved.find(s => s.id === editing.id);
    if (set) Object.assign(set, { name, xml: area.value, updated: Date.now() });
    else { set = { id: uid(), name, xml: area.value, updated: Date.now() }; saved.push(set); editing.id = set.id; }
    const ok = write(STORE, saved);
    dirty = false;
    storeNote.textContent = ok ? `Saved in this browser at ${new Date().toLocaleTimeString()}.` : 'Couldn\'t save in this browser (storage is full or blocked). These levels will play, but will be gone when you leave.';
    renderList(); renderPicker();
    if (andPlay) playSet(set.id);
  }
  function playSet(id) {
    const set = find(id);
    if (broken(set)) { guard(() => open(set)); return; }
    pick = id; write(PICK, pick); renderPicker();
    if (window.flowGame) { window.flowGame.stop(); document.getElementById('play').scrollIntoView({ behavior: 'smooth' }); }
  }
  function download(name, xml) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    a.download = (String(name).trim() || 'levels').replace(/[^\w .-]+/g, '_') + '.xml';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Fill "copy another set" with every set.
  function renderFrom() {
    const from = $('lv-new-from');
    from.innerHTML = '<option value="">Copy another set…</option>' + all().map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  }
  if (write('flow-tribute:probe', 1)) { try { localStorage.removeItem('flow-tribute:probe'); } catch {} }
  else storeNote.textContent = 'This browser won\'t let the page save (private window?), so your levels will only last until you leave.';
  renderList(); renderPicker();

  // ---------- what app.js asks for when the game starts ----------
  window.flowLevels = {
    pick: () => { const s = find(pick); return { id: s.id, name: s.name }; },
    // null when the picked set can't be played (it has errors); the editor opens on it instead.
    current() {
      const s = find(pick);
      if (broken(s)) { open(s); return null; }
      if (s.id === 'original') return { name: s.name, url: null };
      if (s.custom) return { name: s.name, url: URL.createObjectURL(new Blob([s.xml], { type: 'application/xml' })) };
      return { name: s.name, url: new URL(s.url, location.href).href };
    },
    validate,
  };
})();

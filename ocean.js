// The sea behind the page. Two canvases: #deep is blurred by CSS, like the creatures one level below you in the
// game; #near is crisp. The page colour follows the game's own level colours (levels.xml, campaign 1) as you scroll,
// from the title screen's 0x00BFFF down to the final boss's 0x03110E.
(() => {
  const DEPTHS = [0x00BFFF, 0x009EE7, 0x008DD8, 0x007CC9, 0x006DBB, 0x0066AD, 0x00619E, 0x005C8F, 0x005780, 0x00516F,
    0x024C5F, 0x044553, 0x074047, 0x0A3A3F, 0x0E3437, 0x0E2E2F, 0x0B2626, 0x071E1C, 0x051613, 0x03110E];

  const deepCanvas = document.getElementById('deep');
  const nearCanvas = document.getElementById('near');
  const deep = deepCanvas.getContext('2d');
  const near = nearCanvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  let W = 0, H = 0, dpr = 1, depth = 0, lastScroll = scrollY;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- page colour from scroll depth ----------
  function seaColour(f) {
    const p = f * (DEPTHS.length - 1), i = Math.min(DEPTHS.length - 2, Math.floor(p)), t = p - i;
    const a = DEPTHS[i], b = DEPTHS[i + 1];
    const ch = s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  function updateDepth() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    depth = Math.min(1, Math.max(0, scrollY / max));
    const c = seaColour(depth);
    document.body.style.backgroundColor = c;
    document.documentElement.style.setProperty('--sea', c);
  }

  // ---------- a soft glow, rendered once and stamped ----------
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  {
    const g = glow.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }
  function stamp(ctx, x, y, r, a) { ctx.globalAlpha = a; ctx.drawImage(glow, x - r, y - r, r * 2, r * 2); }

  // Margin for wrapping: long enough that a snake's whole body has left the screen before its head reappears.
  const reach = e => e.segs ? (e.segs.length - 1) * e.spacing + e.size * 3 : e.S ? e.S * 1.3 : 40;
  function wrap(e, m = reach(e)) {
    let dx = 0, dy = 0;
    if (e.x < -m) dx = W + 2 * m; else if (e.x > W + m) dx = -(W + 2 * m);
    if (e.y < -m) dy = H + 2 * m; else if (e.y > H + m) dy = -(H + 2 * m);
    if (dx || dy) e.shift(dx, dy);
  }

  // ---------- particles that pop in and out ----------
  class Mote {
    constructor(big) { this.big = big; this.reset(true); }
    reset(first) {
      this.x = rand(0, W); this.y = rand(0, H);
      this.r = this.big ? rand(5, 11) : rand(1.6, 4.2);
      this.life = rand(3, 9); this.age = first ? rand(0, this.life) : 0;
      this.peak = this.big ? rand(0.35, 0.7) : rand(0.4, 0.95);
      this.vx = rand(-4, 4); this.vy = rand(-5, 2);
    }
    shift(dx, dy) { this.x += dx; this.y += dy; }
    update(dt) {
      this.age += dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.age > this.life) this.reset(false);
    }
    draw(ctx) { stamp(ctx, this.x, this.y, this.r * 2.4, this.peak * Math.pow(Math.sin(Math.PI * this.age / this.life), 1.6)); }
  }

  // ---------- snakefish: a chain of rings that follows its head ----------
  class Snake {
    constructor({ n, spacing, size, speed, crisp = false }) {
      this.n = n; this.spacing = spacing; this.size = size; this.speed = speed; this.crisp = crisp;
      this.x = rand(0, W); this.y = rand(0, H); this.a = rand(0, TAU);
      this.wf = rand(0.25, 0.6); this.ph = rand(0, TAU); this.turn = rand(0.5, 1.1);
      this.segs = Array.from({ length: n }, (_, i) => ({ x: this.x - Math.cos(this.a) * spacing * i, y: this.y - Math.sin(this.a) * spacing * i }));
      this.minDepth = 0;
    }
    shift(dx, dy) { this.x += dx; this.y += dy; for (const s of this.segs) { s.x += dx; s.y += dy; } }
    steer(dt, t) { this.a += Math.sin(t * this.wf + this.ph) * this.turn * dt; }
    update(dt, t) {
      this.steer(dt, t);
      this.x += Math.cos(this.a) * this.speed * dt; this.y += Math.sin(this.a) * this.speed * dt;
      this.follow();
    }
    follow() {
      const s = this.segs; s[0].x = this.x; s[0].y = this.y;
      for (let i = 1; i < s.length; i++) {
        const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y, d = Math.hypot(dx, dy) || 1;
        if (d > this.spacing) { s[i].x = s[i - 1].x + dx / d * this.spacing; s[i].y = s[i - 1].y + dy / d * this.spacing; }
      }
    }
    draw(ctx, fade = 1) {
      const s = this.segs, n = s.length;
      if (!this.crisp) {
        for (let i = n - 1; i >= 0; i--) {
          const k = 1 - i / n * 0.55;
          stamp(ctx, s[i].x, s[i].y, this.size * (i === 0 ? 2.6 : 2) * k, 0.55 * fade * k);
        }
        return;
      }
      // Crisp, the way your own creature looks: rings with small squares between, a lit core in the head.
      ctx.globalAlpha = fade; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.4;
      for (let i = n - 1; i >= 1; i--) {
        const r = this.size * (1 - i / n * 0.35);
        ctx.beginPath(); ctx.arc(s[i].x, s[i].y, r, 0, TAU); ctx.stroke();
        const mx = (s[i].x + s[i - 1].x) / 2, my = (s[i].y + s[i - 1].y) / 2, q = 1.6;
        ctx.fillRect(mx - q, my - q, q * 2, q * 2);
      }
      const hx = s[0].x, hy = s[0].y;
      stamp(ctx, hx, hy, this.size * 3.2, 0.35 * fade);
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(hx, hy, this.size * 1.45, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, this.size * 0.55, 0, TAU); ctx.fill();
      // A mouth: the open arc the game draws ahead of the head.
      ctx.beginPath(); ctx.arc(hx, hy, this.size * 2.3, this.a - 0.9, this.a + 0.9); ctx.globalAlpha = 0.55 * fade; ctx.stroke();
    }
  }

  // ---------- the one that follows your mouse, drawn like your creature in the game ----------
  // Front to back: an open mouth arc, a small ring, the double-ringed core, then small rings with square dots between.
  class Pet extends Snake {
    constructor() {
      super({ n: 7, spacing: 10, size: 4.5, speed: 0, crisp: true });
      this.x = W * 0.18; this.y = H * 0.8; this.a = -Math.PI / 4;
      this.segs.forEach((s, i) => { s.x = this.x - Math.cos(this.a) * 12 * i; s.y = this.y - Math.sin(this.a) * 12 * i; });
      this.follow();
      this.target = null; this.v = 0; this.chomp = 0;
    }
    gap(i) { return i === 1 ? 25 : i === 2 ? 15 : i === 3 ? 13 : 10; }
    follow() {
      const s = this.segs; s[0].x = this.x; s[0].y = this.y;
      for (let i = 1; i < s.length; i++) {
        const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y, d = Math.hypot(dx, dy) || 1, g = this.gap(i);
        if (d > g) { s[i].x = s[i - 1].x + dx / d * g; s[i].y = s[i - 1].y + dy / d * g; }
      }
    }
    grow() {
      this.chomp = 1;
      if (this.segs.length >= 17) return;
      for (let k = 0; k < 2; k++) { const t = this.segs[this.segs.length - 1]; this.segs.push({ x: t.x, y: t.y }); }
      this.n = this.segs.length;
    }
    update(dt, t) {
      this.t = t;
      let tx, ty;
      if (this.target) { tx = this.target.x; ty = this.target.y; }
      else { tx = this.x + Math.cos(this.a) * 80 + Math.sin(t * 0.7) * 40; ty = this.y + Math.sin(this.a) * 80; }
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      const want = Math.atan2(dy, dx);
      let da = want - this.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      // Like the game: slower means tighter turns.
      const maxTurn = (3.6 - Math.min(2.4, this.v / 90)) * dt;
      this.a += Math.max(-maxTurn, Math.min(maxTurn, da));
      const goal = this.target ? Math.min(260, d * 2.2) : 45;
      this.v += (goal - this.v) * Math.min(1, dt * 2.5);
      if (this.target && d < 6) this.v *= 0.9;
      this.x += Math.cos(this.a) * this.v * dt; this.y += Math.sin(this.a) * this.v * dt;
      this.chomp = Math.max(0, this.chomp - dt * 3);
      if (!this.target) wrap(this);
      this.follow();
    }
    draw(ctx) {
      const s = this.segs, n = s.length, t = this.t || 0;
      stamp(ctx, s[2].x, s[2].y, 34, 0.22);
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.2;
      // Tail first, so the head draws on top.
      for (let i = n - 1; i >= 3; i--) {
        const p = s[i];
        ctx.globalAlpha = 0.95;
        if (i === n - 1) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, TAU); ctx.fill(); }
        else if (i % 2 === 0) { ctx.fillRect(p.x - 1.7, p.y - 1.7, 3.4, 3.4); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, this.size, 0, TAU); ctx.stroke(); }
      }
      const core = s[2];
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(core.x, core.y, 9.5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(core.x, core.y, 5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(s[1].x, s[1].y, this.size, 0, TAU); ctx.stroke();
      // The mouth: the back half of a circle, convex toward the body, open toward where it's going.
      const back = Math.atan2(s[1].y - s[0].y, s[1].x - s[0].x);
      const half = 1.25 + 0.12 * Math.sin(t * 2.4) - 0.5 * this.chomp;
      ctx.globalAlpha = 0.9; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s[0].x, s[0].y, 22, back - half, back + half); ctx.stroke();
    }
  }

  // ---------- food, as the game draws its two kinds: a filled dot in a ring with a curling stalk,
  // and a capsule holding two dots with two whiskers trailing behind ----------
  class Food {
    constructor() { this.place(); this.pop = 0; }
    place() {
      this.x = rand(30, W - 30); this.y = rand(30, H - 30); this.ph = rand(0, TAU); this.gone = 0;
      this.kind = Math.random() < 0.35 ? 2 : 1; this.rot = rand(-0.6, 0.6);
    }
    shift(dx, dy) { this.x += dx; this.y += dy; }
    update(dt, t) {
      if (this.gone > 0) { this.gone -= dt; if (this.gone <= 0) this.place(); }
      if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 1.8);
      this.x += Math.sin(t * 0.4 + this.ph) * 6 * dt; this.y += Math.cos(t * 0.33 + this.ph) * 5 * dt;
      this.sway = 0.35 * Math.sin(t * 1.1 + this.ph);
    }
    eat() { this.pop = 1; this.px = this.x; this.py = this.y; this.gone = rand(3, 7); this.x = -999; }
    draw(ctx) {
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      if (this.pop > 0) {
        ctx.globalAlpha = this.pop * 0.7; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(this.px, this.py, 6 + (1 - this.pop) * 22, 0, TAU); ctx.stroke();
      }
      if (this.gone > 0) return;
      const { x, y } = this;
      if (this.kind === 1) {
        stamp(ctx, x, y, 13, 0.35);
        ctx.globalAlpha = 1; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 5.6, 0, TAU); ctx.stroke();
      }
      if (this.kind === 2) {
        stamp(ctx, x, y, 22, 0.3);
        ctx.save(); ctx.translate(x, y); ctx.rotate(this.rot + (this.sway || 0) * 0.5);
        ctx.globalAlpha = 1; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 12, 0.25, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(1.3, -4.3, 3.9, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(-0.6, 4.2, 3.9, 0, TAU); ctx.fill();
        const w = (this.sway || 0) * 4;
        ctx.lineWidth = 1.1; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-10, -6 + w, -17, -4.5 + w); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6.5, 2.5); ctx.quadraticCurveTo(-11, -0.5 + w, -18.5, 0.5 + w); ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.sway || 0);
      ctx.lineWidth = 1.1; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(-1.6, -5.4); ctx.quadraticCurveTo(-4.5, -11, -0.5, -14.5); ctx.quadraticCurveTo(1.2, -15.8, 2.6, -15.2); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- jelly ring: a soft donut that breathes ----------
  class Ring {
    constructor() {
      this.x = rand(0, W); this.y = rand(0, H); this.R = rand(16, 30); this.ph = rand(0, TAU);
      this.vx = rand(-10, 10); this.vy = rand(-8, 8); this.minDepth = 0;
    }
    shift(dx, dy) { this.x += dx; this.y += dy; }
    update(dt, t) { this.x += this.vx * dt; this.y += this.vy * dt; this.r = this.R * (1 + 0.12 * Math.sin(t * 1.4 + this.ph)); }
    draw(ctx, fade) {
      ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = this.R * 0.42;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.stroke();
      stamp(ctx, this.x + this.r * 0.9, this.y - this.r * 0.9, this.R * 0.4, 0.4 * fade);
    }
  }

  // ---------- manta: a flapping kite with curved sides, lit nodes and little swimmers inside ----------
  class Manta {
    constructor() {
      this.S = rand(150, 230); this.x = rand(0, W); this.y = rand(H * 0.2, H * 0.8);
      this.a = rand(0, TAU); this.speed = rand(9, 16); this.ph = rand(0, TAU); this.minDepth = 0.4;
      this.swimmers = Array.from({ length: 9 }, () => ({ u: rand(-0.45, 0.45), v: rand(-0.45, 0.45), ph: rand(0, TAU) }));
    }
    shift(dx, dy) { this.x += dx; this.y += dy; }
    update(dt, t) {
      this.a += Math.sin(t * 0.11 + this.ph) * 0.12 * dt;
      this.x += Math.cos(this.a) * this.speed * dt; this.y += Math.sin(this.a) * this.speed * dt;
      this.t = t;
    }
    corners() {
      const { S, a, t, ph } = this, f = Math.sin(t * 0.9 + ph);
      // Front, wing, back, wing. The wings beat; the back trails.
      const spec = [[0, 1.0], [Math.PI / 2 + 0.15 * f, 0.95 + 0.12 * f], [Math.PI, 0.9], [-Math.PI / 2 - 0.15 * f, 0.95 + 0.12 * f]];
      return spec.map(([ang, r]) => ({ x: this.x + Math.cos(a + Math.PI / 4 + ang) * S * r, y: this.y + Math.sin(a + Math.PI / 4 + ang) * S * r }));
    }
    draw(ctx, fade) {
      if (fade <= 0) return;
      const c = this.corners(), t = this.t, f = Math.sin(t * 0.9 + this.ph);
      ctx.globalAlpha = 0.45 * fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y);
      for (let i = 0; i < 4; i++) {
        const p = c[i], q = c[(i + 1) % 4], pull = 0.12 + 0.16 * (i % 2 ? 1 + f : 1 - f) / 2 + (i === 2 ? 0.12 : 0);
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        ctx.quadraticCurveTo(mx + (this.x - mx) * pull * 2, my + (this.y - my) * pull * 2, q.x, q.y);
      }
      ctx.stroke();
      // The eye ring at the front corner, and lit nodes at the others.
      const inset = (p, k) => ({ x: p.x + (this.x - p.x) * k, y: p.y + (this.y - p.y) * k });
      const eye = inset(c[0], 0.2);
      ctx.lineWidth = 5; ctx.globalAlpha = 0.35 * fade;
      ctx.beginPath(); ctx.arc(eye.x, eye.y, this.S * 0.2, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(eye.x, eye.y, this.S * 0.33, 0, TAU); ctx.globalAlpha = 0.18 * fade; ctx.stroke();
      stamp(ctx, eye.x, eye.y, this.S * 0.16, 0.9 * fade);
      for (const k of [1, 3]) { const p = inset(c[k], 0.17); stamp(ctx, p.x, p.y, this.S * 0.12, 0.85 * fade); }
      // Small swimmers, carried along inside it.
      const ca = Math.cos(this.a), sa = Math.sin(this.a);
      for (const s of this.swimmers) {
        const u = s.u + Math.sin(t * 0.8 + s.ph) * 0.05, v = s.v + Math.cos(t * 0.7 + s.ph) * 0.05;
        const lx = u * this.S, ly = v * this.S;
        stamp(ctx, this.x + lx * ca - ly * sa, this.y + lx * sa + ly * ca, 9, 0.45 * fade);
      }
    }
  }

  // ---------- the world ----------
  let deepThings = [], deepMotes = [], nearMotes = [], foods = [], pet = null;
  function populate() {
    const area = W * H, scale = Math.min(1.4, Math.max(0.5, area / (1400 * 900)));
    deepMotes = Array.from({ length: Math.round(16 * scale) }, () => new Mote(true));
    nearMotes = Array.from({ length: Math.round(55 * scale) }, () => new Mote(false));
    deepThings = [
      ...Array.from({ length: Math.max(2, Math.round(4 * scale)) }, () => new Snake({ n: Math.round(rand(8, 15)), spacing: rand(20, 28), size: rand(6, 9), speed: rand(22, 40) })),
      ...Array.from({ length: Math.max(1, Math.round(3 * scale)) }, () => new Ring()),
      new Manta(),
    ];
    foods = Array.from({ length: Math.max(4, Math.round(7 * scale)) }, () => new Food());
    pet = finePointer && !still ? new Pet() : null;
  }

  function resize() {
    const first = !W, oldW = W, oldH = H, newDpr = Math.min(2, devicePixelRatio || 1);
    // Mobile browsers fire resize as the URL bar shows and hides; only reallocate when something changed.
    if (innerWidth === W && innerHeight === H && newDpr === dpr) return;
    W = innerWidth; H = innerHeight; dpr = newDpr;
    nearCanvas.width = Math.round(W * dpr); nearCanvas.height = Math.round(H * dpr);
    deepCanvas.width = Math.round(W / 2); deepCanvas.height = Math.round(H / 2); // blurred anyway; half size is plenty
    if (first) populate();
    else {
      // Keep everything spread over the new size instead of clumped where the old window was.
      const sx = W / oldW, sy = H / oldH;
      for (const e of [...deepThings, ...deepMotes, ...nearMotes, ...foods]) e.shift(e.x * (sx - 1), e.y * (sy - 1));
      if (pet) pet.shift(pet.x * (sx - 1), pet.y * (sy - 1));
    }
    updateDepth();
    if (still) frame(0);
  }

  // Scrolling moves the layers at different speeds, so the sea has depth.
  function onScroll() {
    const dy = scrollY - lastScroll; lastScroll = scrollY;
    for (const list of [deepThings, deepMotes]) for (const e of list) e.shift(0, -dy * 0.18);
    for (const list of [nearMotes, foods]) for (const e of list) e.shift(0, -dy * 0.5);
    updateDepth();
    if (still) frame(0);
  }

  // ---------- pointer ----------
  if (finePointer) {
    addEventListener('pointermove', e => {
      if (!pet) return;
      pet.target = e.target.closest && e.target.closest('#stage') ? null : { x: e.clientX, y: e.clientY };
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { if (pet) pet.target = null; });
    // Ruffle may swallow moves inside the game, so let go as soon as the pointer enters it.
    document.getElementById('stage').addEventListener('pointerenter', () => { if (pet) pet.target = null; });
  }

  // ---------- pausing: Ruffle runs on the main thread, so stop animating while the game has the screen ----------
  let gameOn = false, stageVisible = false, running = false;
  const paused = () => still || document.fullscreenElement || (gameOn && stageVisible);
  function kick() { if (!running && !paused()) { running = true; requestAnimationFrame(now => { prev = now; frame(now); }); } }
  new IntersectionObserver(([e]) => { stageVisible = e.intersectionRatio >= 0.6; kick(); }, { threshold: [0, 0.6, 1] })
    .observe(document.getElementById('stage'));
  document.addEventListener('fullscreenchange', kick);
  window.flowOcean = { gameStarted() { gameOn = true; } };

  // ---------- loop ----------
  let t = 0, prev = 0;
  function frame(now) {
    const dt = still ? 0 : Math.min(0.05, (now - prev) / 1000 || 0); prev = now; t += dt;

    deep.setTransform(0.5, 0, 0, 0.5, 0, 0);
    deep.clearRect(0, 0, W, H);
    for (const m of deepMotes) { m.update(dt); m.draw(deep); }
    for (const e of deepThings) {
      e.update(dt, t); wrap(e);
      e.draw(deep, e.minDepth > 0 ? smooth(e.minDepth - 0.08, e.minDepth + 0.08, depth) : 1);
    }

    near.setTransform(dpr, 0, 0, dpr, 0, 0);
    near.clearRect(0, 0, W, H);
    for (const m of nearMotes) { m.update(dt); m.draw(near); }
    for (const f of foods) {
      f.update(dt, t); wrap(f, 20);
      if (pet && f.gone <= 0 && Math.hypot(f.x - pet.x, f.y - pet.y) < 22) { f.eat(); pet.grow(); }
      f.draw(near);
    }
    if (pet) { pet.update(dt, t); pet.draw(near); }
    near.globalAlpha = 1; deep.globalAlpha = 1;

    if (still) return;
    if (paused()) running = false; else requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  addEventListener('scroll', onScroll, { passive: true });
  updateDepth();
  resize();
  kick();
})();

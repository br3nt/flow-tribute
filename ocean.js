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

  function wrap(e, m) {
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

  // ---------- the one that follows your mouse ----------
  class Pet extends Snake {
    constructor() {
      super({ n: 5, spacing: 15, size: 6.5, speed: 0, crisp: true });
      this.x = W * 0.18; this.y = H * 0.8; this.a = -Math.PI / 4; this.follow();
      this.target = null; this.v = 0;
    }
    grow() {
      if (this.n >= 16) return;
      const t = this.segs[this.segs.length - 1];
      this.segs.push({ x: t.x, y: t.y }); this.n++;
    }
    update(dt, t) {
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
      if (!this.target) wrap(this, 40);
      this.follow();
    }
  }

  // ---------- food: a lit dot in a ring with a short tail ----------
  class Food {
    constructor(kind) { this.kind = kind; this.place(); this.pop = 0; }
    place() { this.x = rand(30, W - 30); this.y = rand(30, H - 30); this.ph = rand(0, TAU); this.tail = rand(0, TAU); this.gone = 0; }
    shift(dx, dy) { this.x += dx; this.y += dy; }
    update(dt, t) {
      if (this.gone > 0) { this.gone -= dt; if (this.gone <= 0) this.place(); }
      if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 1.8);
      this.x += Math.sin(t * 0.4 + this.ph) * 6 * dt; this.y += Math.cos(t * 0.33 + this.ph) * 5 * dt;
      this.tail += Math.sin(t * 1.3 + this.ph) * dt;
    }
    eat() { this.pop = 1; this.px = this.x; this.py = this.y; this.gone = rand(3, 7); this.x = -999; }
    draw(ctx) {
      const tint = this.kind === 'red' ? '#ff4d2e' : this.kind === 'blue' ? '#1f5fff' : '#fff';
      if (this.pop > 0) {
        ctx.globalAlpha = this.pop * 0.8; ctx.strokeStyle = tint; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(this.px, this.py, 6 + (1 - this.pop) * 26, 0, TAU); ctx.stroke();
      }
      if (this.gone > 0) return;
      const { x, y } = this;
      stamp(ctx, x, y, 15, this.kind === 'white' ? 0.45 : 0.25);
      if (this.kind !== 'white') {
        ctx.globalAlpha = 0.9; ctx.fillStyle = tint;
        ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff'; ctx.strokeStyle = this.kind === 'white' ? '#fff' : tint; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 5.2, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(this.tail) * 5.2, y + Math.sin(this.tail) * 5.2);
      ctx.quadraticCurveTo(x + Math.cos(this.tail) * 9, y + Math.sin(this.tail) * 9 + 3, x + Math.cos(this.tail - 0.5) * 12, y + Math.sin(this.tail - 0.5) * 12);
      ctx.stroke();
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
    foods = [...Array.from({ length: Math.max(4, Math.round(7 * scale)) }, () => new Food('white')), new Food('red'), new Food('blue')];
    pet = finePointer && !still ? new Pet() : null;
  }

  function resize() {
    const first = !W;
    W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
    nearCanvas.width = Math.round(W * dpr); nearCanvas.height = Math.round(H * dpr);
    deepCanvas.width = Math.round(W / 2); deepCanvas.height = Math.round(H / 2); // blurred anyway; half size is plenty
    if (first) populate();
    if (still) frame(0);
  }

  // Scrolling moves the layers at different speeds, so the sea has depth.
  function onScroll() {
    const dy = scrollY - lastScroll; lastScroll = scrollY;
    for (const e of [...deepThings, ...deepMotes]) e.shift(0, -dy * 0.18);
    for (const e of [...nearMotes, ...foods]) e.shift(0, -dy * 0.5);
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
  }

  // ---------- loop ----------
  let t = 0, prev = 0;
  function frame(now) {
    const dt = still ? 0 : Math.min(0.05, (now - prev) / 1000 || 0); prev = now; t += dt;

    deep.setTransform(0.5, 0, 0, 0.5, 0, 0);
    deep.clearRect(0, 0, W, H);
    for (const m of deepMotes) { m.update(dt); m.draw(deep); }
    for (const e of deepThings) {
      e.update(dt, t); wrap(e, e.S ? e.S * 1.3 : 260);
      e.draw(deep, e.minDepth > 0 ? smooth(e.minDepth - 0.08, e.minDepth + 0.08, depth) : 1);
    }

    near.setTransform(dpr, 0, 0, dpr, 0, 0);
    near.clearRect(0, 0, W, H);
    for (const m of nearMotes) { m.update(dt); m.draw(near); }
    for (const f of foods) {
      f.update(dt, t); wrap(f, 20);
      if (pet && f.gone <= 0 && Math.hypot(f.x - pet.x, f.y - pet.y) < pet.size * 2.6) { f.eat(); pet.grow(); }
      f.draw(near);
    }
    if (pet) { pet.update(dt, t); pet.draw(near); }
    near.globalAlpha = 1; deep.globalAlpha = 1;

    if (!still) requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  addEventListener('scroll', onScroll, { passive: true });
  resize();
  updateDepth();
  if (still) { for (let i = 0; i < 1; i++) frame(0); } else requestAnimationFrame(now => { prev = now; frame(now); });
})();

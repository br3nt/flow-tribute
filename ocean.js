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

  // ---------- the one that follows your mouse, drawn and steered like your creature in the game ----------
  // Front to back: the neck ring with the jaws on its rim, a square dot, the double-ringed core, then small rings
  // with square dots between them.
  //
  // The jaws are the game's c1_seghead1 sprite: 29 frames measured from the SWF. Each frame is the upper jaw as 9
  // points (x forward, y outward) in units of the neck ring's radius, starting on the ring's rim; the lower jaw
  // mirrors it. Frame 1 is the resting open mouth. A bite plays 2 to 22, chews on 20 to 22, then reopens 23 to 29.
  const JAW = '1.05 0.81 1.2 1.62 1.45 2.41 1.83 3.13 2.34 3.78 2.97 4.29 3.68 4.7 4.43 4.97 5.21 5.15 1.05 0.78 1.2 1.55 1.48 2.29 1.92 2.94 2.51 3.45 3.21 3.77 3.96 3.92 4.74 3.97 5.51 3.9 1.05 0.76 1.22 1.53 1.54 2.23 2.08 2.78 2.78 3.1 3.55 3.15 4.3 3.07 5.04 2.9 5.77 2.67 1.06 0.78 1.25 1.56 1.68 2.22 2.37 2.59 3.15 2.59 3.91 2.44 4.62 2.15 5.33 1.8 6.03 1.41 1.06 0.76 1.24 1.51 1.62 2.18 2.24 2.62 2.98 2.73 3.73 2.61 4.44 2.38 5.13 2.06 5.82 1.72 1.06 0.75 1.23 1.49 1.58 2.17 2.15 2.65 2.87 2.82 3.61 2.75 4.32 2.59 5.01 2.3 5.67 2 1.05 0.73 1.22 1.45 1.51 2.12 2.03 2.64 2.69 2.9 3.42 2.95 4.11 2.79 4.8 2.59 5.46 2.28 1.05 0.71 1.21 1.41 1.48 2.08 1.94 2.63 2.56 2.96 3.26 3.05 3.97 3 4.65 2.82 5.31 2.62 1.05 0.69 1.2 1.38 1.44 2.04 1.85 2.61 2.42 3.02 3.07 3.21 3.77 3.21 4.45 3.09 5.1 2.9 1.11 0.71 1.31 1.42 1.64 2.06 2.14 2.57 2.79 2.85 3.5 2.95 4.2 2.85 4.87 2.66 5.51 2.46 1.15 0.72 1.42 1.41 1.84 2.02 2.44 2.46 3.14 2.64 3.87 2.64 4.56 2.49 5.26 2.28 5.92 2 1.19 0.7 1.53 1.39 2.03 1.95 2.68 2.33 3.42 2.44 4.17 2.36 4.89 2.16 5.59 1.88 6.28 1.56 1.27 0.75 1.7 1.43 2.3 1.93 3.04 2.18 3.82 2.18 4.58 2.04 5.3 1.78 6 1.46 6.69 1.1 1.33 0.76 1.85 1.41 2.53 1.87 3.33 2.03 4.14 1.97 4.91 1.73 5.65 1.44 6.38 1.05 7.1 0.64 1.27 0.74 1.68 1.4 2.28 1.9 3.01 2.13 3.77 2.13 4.51 1.99 5.22 1.76 5.9 1.45 6.59 1.1 1.18 0.68 1.5 1.34 1.98 1.9 2.63 2.23 3.34 2.33 4.07 2.26 4.75 2.08 5.42 1.82 6.08 1.51 1.13 0.68 1.36 1.34 1.75 1.92 2.31 2.32 2.98 2.49 3.66 2.49 4.33 2.38 4.98 2.18 5.62 1.95 1.05 0.65 1.22 1.3 1.51 1.9 1.96 2.38 2.55 2.65 3.19 2.74 3.85 2.69 4.49 2.56 5.1 2.38 1.18 0.67 1.49 1.34 1.97 1.9 2.62 2.23 3.33 2.33 4.06 2.27 4.76 2.08 5.42 1.82 6.08 1.51 1.33 0.76 1.85 1.41 2.53 1.87 3.33 2.03 4.14 1.97 4.91 1.73 5.65 1.44 6.38 1.05 7.1 0.64 1.33 0.76 1.85 1.41 2.53 1.87 3.33 2.03 4.14 1.97 4.91 1.73 5.65 1.44 6.38 1.05 7.1 0.64 1.33 0.76 1.85 1.41 2.53 1.87 3.33 2.03 4.14 1.97 4.91 1.73 5.65 1.44 6.38 1.05 7.1 0.64 1.33 0.76 1.85 1.41 2.53 1.87 3.33 2.03 4.14 1.97 4.91 1.73 5.65 1.44 6.38 1.05 7.1 0.64 1.28 0.76 1.7 1.44 2.3 1.96 3.03 2.27 3.82 2.33 4.61 2.23 5.36 2.03 6.07 1.72 6.79 1.38 1.22 0.72 1.55 1.44 2.07 2.04 2.72 2.47 3.46 2.69 4.26 2.69 5.02 2.59 5.75 2.38 6.49 2.15 1.17 0.75 1.45 1.47 1.87 2.12 2.43 2.64 3.11 2.98 3.86 3.13 4.63 3.15 5.39 3.05 6.13 2.9 1.13 0.77 1.36 1.52 1.71 2.22 2.22 2.81 2.85 3.26 3.57 3.54 4.33 3.67 5.1 3.72 5.87 3.64 1.09 0.78 1.27 1.55 1.57 2.29 2.01 2.96 2.56 3.51 3.24 3.91 3.96 4.18 4.73 4.33 5.51 4.38 1.05 0.81 1.2 1.62 1.45 2.41 1.83 3.13 2.34 3.78 2.97 4.29 3.68 4.7 4.43 4.97 5.21 5.15'.split(' ').map(Number);
  const JAW_PTS = 9, JAW_FRAMES = JAW.length / (JAW_PTS * 2);
  function jawPoint(frame, i) {
    const f0 = Math.min(JAW_FRAMES - 1, Math.floor(frame)), f1 = Math.min(JAW_FRAMES - 1, f0 + 1), t = frame - Math.floor(frame);
    const a = (f0 * JAW_PTS + i) * 2, b = (f1 * JAW_PTS + i) * 2;
    return [JAW[a] + (JAW[b] - JAW[a]) * t, JAW[a + 1] + (JAW[b + 1] - JAW[a + 1]) * t];
  }

  // Creature.movementUpdate for the player: turn toward the cursor at a fixed rate; holding the button adds 400 px/s
  // per second up to full speed (200); every frame, speed eases 5% of the way back to a fifth of full speed. It never
  // stops at the cursor; it keeps swimming and loops around it.
  const FULL = 200, CRUISE = FULL * 0.2;
  class Pet extends Snake {
    constructor() {
      super({ n: 8, spacing: 10, size: 4.5, speed: 0, crisp: true });
      this.x = W * 0.18; this.y = H * 0.8; this.a = -Math.PI / 4;
      this.segs.forEach((s, i) => { s.x = this.x - Math.cos(this.a) * 12 * i; s.y = this.y - Math.sin(this.a) * 12 * i; });
      this.follow();
      this.target = null; this.v = CRUISE; this.boost = false;
      this.turn = (8 + Math.random() * 3) / 180 * Math.PI * 30;
      this.mouth = { frame: 0, mode: 'rest', chew: 0 };
      this.meal = null;
    }
    // Neck to core is long enough for the square dot between them; then dots and rings alternate.
    gap(i) { return i === 1 ? 24 : i === 2 ? 13 : 10; }
    follow() {
      const s = this.segs; s[0].x = this.x; s[0].y = this.y;
      for (let i = 1; i < s.length; i++) {
        const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y, d = Math.hypot(dx, dy) || 1, g = this.gap(i);
        if (d > g) { s[i].x = s[i - 1].x + dx / d * g; s[i].y = s[i - 1].y + dy / d * g; }
      }
    }
    grow() {
      if (this.segs.length >= 18) return;
      for (let k = 0; k < 2; k++) { const t = this.segs[this.segs.length - 1]; this.segs.push({ x: t.x, y: t.y }); }
      this.n = this.segs.length;
    }
    // Where the open mouth is, for deciding when to bite.
    mouthAt() { return { x: this.x + Math.cos(this.a) * this.size * 3, y: this.y + Math.sin(this.a) * this.size * 3 }; }
    canBite() { return this.mouth.mode === 'rest'; }
    bite(food) { this.mouth = { frame: 1, mode: 'closing', chew: 0.55 }; this.meal = food; }
    update(dt, t) {
      this.t = t;
      let tx, ty;
      if (this.target) { tx = this.target.x; ty = this.target.y; }
      else { tx = this.x + Math.cos(this.a) * 80 + Math.sin(t * 0.7) * 40; ty = this.y + Math.sin(this.a) * 80 + Math.cos(t * 0.5) * 30; }
      let da = Math.atan2(ty - this.y, tx - this.x) - this.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const step = this.turn * dt;
      this.a += Math.abs(da) <= step ? da : Math.sign(da) * step;
      if (this.boost && this.target) this.v = Math.min(FULL, this.v + 400 * dt);
      this.v += (CRUISE - this.v) * (1 - Math.pow(0.95, dt * 30));
      this.x += Math.cos(this.a) * this.v * dt; this.y += Math.sin(this.a) * this.v * dt;
      if (!this.target) wrap(this);
      this.follow();
      this.updateMouth(dt);
    }
    updateMouth(dt) {
      const m = this.mouth;
      if (m.mode === 'closing') {
        m.frame += 30 * dt;
        if (m.frame >= 21) { m.mode = 'chewing'; m.frame = 19; }
      } else if (m.mode === 'chewing') {
        m.chew -= dt;
        m.frame = 19 + ((m.frame - 19 + 30 * dt) % 2);
        if (m.chew <= 0) { m.mode = 'opening'; m.frame = 22; this.grow(); }
      } else if (m.mode === 'opening') {
        m.frame += 30 * dt;
        if (m.frame >= 28) { m.mode = 'rest'; m.frame = 0; }
      }
      // The food being eaten slides into the mouth as it closes.
      if (this.meal) {
        const mp = this.mouthAt(), f = this.meal, k = Math.min(1, dt * 12);
        f.x += (mp.x - f.x) * k; f.y += (mp.y - f.y) * k;
        f.shrink = Math.max(0, (f.shrink == null ? 1 : f.shrink) - dt * 4);
        if (m.mode !== 'closing') { f.eat(); this.meal = null; }
      }
    }
    draw(ctx) {
      const s = this.segs, n = s.length, R = this.size;
      stamp(ctx, s[1].x, s[1].y, 34, 0.22);
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Tail first, so the head draws on top.
      ctx.globalAlpha = 0.95;
      for (let i = n - 1; i >= 2; i--) {
        const p = s[i];
        if (i === n - 1) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, TAU); ctx.fill(); }
        else if (i % 2 === 0) ctx.fillRect(p.x - 1.7, p.y - 1.7, 3.4, 3.4);
        else { ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke(); }
      }
      const core = s[1];
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(core.x, core.y, 9.5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(core.x, core.y, 5, 0, TAU); ctx.stroke();
      // Head: neck ring, the square dot behind it, and the jaws on the ring's rim, along the body's axis.
      const h = s[0], ax = Math.atan2(h.y - core.y, h.x - core.x), ux = Math.cos(ax), uy = Math.sin(ax);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, TAU); ctx.stroke();
      ctx.fillRect(h.x - ux * R * 2.6 - 1.6, h.y - uy * R * 2.6 - 1.6, 3.2, 3.2);
      const frame = this.mouth.frame;
      ctx.lineWidth = 1.1;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(h.x + ux * R, h.y + uy * R);
        let px = h.x + ux * R, py = h.y + uy * R;
        for (let i = 0; i < JAW_PTS; i++) {
          const [fx, fy] = jawPoint(frame, i);
          const x = h.x + (ux * fx - uy * fy * side) * R, y = h.y + (uy * fx + ux * fy * side) * R;
          ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
          px = x; py = y;
        }
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
  }

  // ---------- food, as the game animates its two kinds (from the SWF's c1_food1 and c1_food2 shape tweens) ----------
  // Both swim facing forward with the tail behind. The tail's root stays put and the bend grows toward the tip:
  // food1's tail curls up, straightens, curls down, straightens; food2's whiskers go from a splayed V, to curving,
  // to parallel and back. One loop is about 0.65 s, as at the game's 30 fps.
  const TAIL_LOOP = 0.65;
  // A bending line: starts at (x, y) heading `dir`, and its heading turns by up to `bend` radians by the tip.
  function tail(ctx, x, y, dir, len, bend) {
    const n = 10, step = len / n;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 1; j <= n; j++) {
      const a = dir + bend * Math.pow(j / n, 1.6);
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  class Food {
    constructor() { this.place(); this.pop = 0; }
    place() {
      this.x = rand(30, W - 30); this.y = rand(30, H - 30); this.gone = 0;
      this.kind = Math.random() < 0.35 ? 2 : 1;
      this.h = rand(0, TAU); this.speed = rand(9, 14); this.cycle = rand(0, 1); this.turn = 0; this.shrink = 1;
    }
    shift(dx, dy) { this.x += dx; this.y += dy; }
    update(dt) {
      if (this.gone > 0) { this.gone -= dt; if (this.gone <= 0) this.place(); }
      if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 1.8);
      this.cycle = (this.cycle + dt / TAIL_LOOP) % 1;
      // Food.as nudges its aim a little every frame, more often one way than the other: a slow, wobbly curve.
      this.turn += (Math.random() < 1 / 3 ? 1 : -1) * 0.19 * Math.sqrt(dt);
      this.turn *= Math.pow(0.2, dt);
      this.h += (this.turn - 0.25) * dt;
      this.x += Math.cos(this.h) * this.speed * dt; this.y += Math.sin(this.h) * this.speed * dt;
    }
    eat() { this.pop = 1; this.px = this.x; this.py = this.y; this.gone = rand(3, 7); this.x = -999; }
    draw(ctx) {
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      if (this.pop > 0) {
        ctx.globalAlpha = this.pop * 0.7; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(this.px, this.py, 6 + (1 - this.pop) * 22, 0, TAU); ctx.stroke();
      }
      if (this.gone > 0) return;
      const ph = this.cycle * TAU;
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.h);
      if (this.shrink < 1) ctx.scale(Math.max(0.05, this.shrink), Math.max(0.05, this.shrink));
      ctx.lineCap = 'round';
      if (this.kind === 1) {
        stamp(ctx, 0, 0, 13, 0.35);
        ctx.globalAlpha = 1; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, 5.6, 0, TAU); ctx.stroke();
        // Behind is local -x. Curl up, straight, down, straight: bend follows a cosine.
        ctx.lineWidth = 1;
        tail(ctx, -5.6, 0, Math.PI, 9.5, 1.5 * Math.cos(ph));
      } else {
        stamp(ctx, 0, 0, 20, 0.3);
        ctx.globalAlpha = 1; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 9.5, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0.6, -3.4, 2.9, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0.6, 3.4, 2.9, 0, TAU); ctx.fill();
        // Splay (the V) is widest at the start of the loop; the bend swings outward, then slightly in.
        const splay = 0.35 + 0.35 * Math.cos(ph), bend = 0.9 * Math.sin(ph) - 0.2 * Math.sin(2 * ph);
        ctx.lineWidth = 1;
        tail(ctx, -4.6, -3.4, Math.PI + splay, 9, bend);
        tail(ctx, -4.6, 3.4, Math.PI - splay, 9, -bend);
      }
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
    document.documentElement.addEventListener('pointerleave', () => { if (pet) { pet.target = null; pet.boost = false; } });
    // Like the game: hold the button to swim faster.
    // Only from open water (the page background), so a held click never selects text or presses a link.
    // Open water: not on a control, the game or the editor, and not on actual letters (so text can still be selected).
    const CONTROLS = 'a, button, input, textarea, select, label, summary, [role="option"], [role="listbox"], #stage, .lv-editor';
    function overText(x, y) {
      let node, offset;
      if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { node = c.offsetNode; offset = c.offset; } }
      else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; offset = r.startOffset; } }
      if (!node || node.nodeType !== 3) return false;
      const r = document.createRange();
      r.setStart(node, Math.max(0, offset - 1)); r.setEnd(node, Math.min(node.length, offset + 1));
      return [...r.getClientRects()].some(b => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2);
    }
    const openWater = e => !(e.target.closest && e.target.closest(CONTROLS)) && !overText(e.clientX, e.clientY);
    addEventListener('mousedown', e => { if (pet && e.button === 0 && openWater(e)) { e.preventDefault(); pet.boost = true; } });
    addEventListener('pointerup', () => { if (pet) pet.boost = false; });
    addEventListener('blur', () => { if (pet) pet.boost = false; });
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
  window.flowOcean = { gameStarted(on) { gameOn = on; kick(); }, get pet() { return pet; }, get foods() { return foods; } };

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
      f.update(dt); wrap(f, 20);
      if (pet && f.gone <= 0 && pet.canBite() && !pet.meal) {
        const mp = pet.mouthAt();
        if (Math.hypot(f.x - mp.x, f.y - mp.y) < pet.size * 4) pet.bite(f);
      }
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

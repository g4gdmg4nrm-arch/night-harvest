// The player: a matte bowl/saucer craft (Josh's refs). Smooth charcoal, dark underside hole,
// no windows/lights/seams. Muscular motion: slow glides, still hover, sudden swoops and bursts.
import { WORLD_W, GROUND, TUNE } from "./config.js?v=25";
import { clamp, damp, lerp, TAU, noise1 } from "./util.js?v=25";

export class Creature {
  constructor() {
    this.reset(0, 0);
  }
  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.bank = 0;
    this.feeding = false;
    this.feedAmt = 0; // smoothed 0..1
    this.mouth = 0;
    this.tight = 0;
    this.cool = 0;
    this.sinceBurst = 99;
    this.t = Math.random() * 10;
    this.ripple = -1;
    this.swallow = 0;
    this.face = 1;
    this.inX = 0;
    this.inY = 0;
    this.swoop = 0; // 1 while actively swooping down to feed
    this.swoopT = 0;
    this.dustKick = 0; // visual pulse after a ground-level burst
    this.bounds = null; // {x0, x1, y0, y1} override (Area 51: hangar interior, wider world)
    this.power = 1; // speed multiplier (Area 51: weak when Energy is low)
    this.burstScale = 1; // burst impulse multiplier (Area 51: a weak burst on an empty tank)
    this.ground = GROUND;
    if (!this.craft) this.craft = { speed: 1, accel: 1, burst: 1, burstCool: 1, feed: 1, vis: 0 }; // v13 craft profile (kept across resets)
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }
  setInput(x, y) {
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.inX = x;
    this.inY = y;
  }
  /** Start a sharp dive toward feed height (called when FEED is held over the cow). */
  beginSwoop(targetY) {
    if (this.swoop > 0.4 || this.cool > 0) return;
    const need = targetY - this.y;
    if (need < 40) return; // already low enough
    this.swoop = 1;
    this.swoopT = 0;
    // Kick downward hard so the drop reads as a swoop, not a drift
    this.vy = Math.max(this.vy, Math.min(420, need * 2.4));
    this.tight = Math.max(this.tight, 0.55);
  }
  /** Returns true when a burst happened. Prefer upward escape when no stick input. */
  burst() {
    if (this.cool > 0) return false;
    let dx = this.inX;
    let dy = this.inY;
    const m = Math.hypot(dx, dy);
    if (m < 0.25) {
      // Default burst: hard UP into the clouds (Josh's gif)
      dx = Math.sign(this.vx || this.face) * 0.15;
      dy = -1;
    }
    const mm = Math.hypot(dx, dy) || 1;
    const impulse = TUNE.burstImpulse * this.burstScale * this.craft.burst;
    this.vx += (dx / mm) * impulse;
    this.vy += (dy / mm) * impulse * (dy < 0 ? 1.08 : 1); // slightly stronger when going up
    this.tight = 1;
    this.cool = TUNE.burstCooldown * this.craft.burstCool;
    this.sinceBurst = 0;
    this.feeding = false;
    this.swoop = 0;
    this.dustKick = this.y > this.ground - 220 ? 1 : 0.35;
    return true;
  }
  update(dt) {
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.sinceBurst += dt;
    this.dustKick = damp(this.dustKick, 0, 2.8, dt);
    if (this.swoop > 0) {
      this.swoopT += dt;
      this.swoop = damp(this.swoop, 0, 1.8, dt);
      if (this.swoopT > 1.1) this.swoop = 0;
    }
    const max = (this.feeding ? 24 : 185 * this.craft.speed) * this.power;
    const rate = (this.feeding ? 4.5 : this.sinceBurst < 0.5 ? 1.6 : 2.1) * this.craft.accel;
    // weighty, slightly lagging response; vertical is a little slower (it has to lift its bulk)
    let wantX = this.inX * max;
    let wantY = this.inY * max * 0.8;
    // During a swoop, bias hard downward toward feed height
    if (this.swoop > 0.15 && this.feeding) {
      wantY = Math.max(wantY, 280 * this.swoop);
      wantX *= 0.55;
    }
    this.vx = damp(this.vx, wantX, rate, dt);
    this.vy = damp(this.vy, wantY, rate * 0.9, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // soft bounds
    const B = this.bounds || { x0: 160, x1: WORLD_W - 160, y0: 70, y1: GROUND - 120 };
    if (this.x < B.x0) (this.x = B.x0), (this.vx = Math.max(0, this.vx));
    if (this.x > B.x1) (this.x = B.x1), (this.vx = Math.min(0, this.vx));
    if (this.y < B.y0) (this.y = B.y0), (this.vy = Math.max(0, this.vy) * 0.5);
    if (this.y > B.y1) (this.y = B.y1), (this.vy = Math.min(0, this.vy));
    this.feedAmt = damp(this.feedAmt, this.feeding ? 1 : 0, this.feeding ? 4 : 4, dt); // v13: ramps in faster (was 2.2)
    this.mouth = damp(this.mouth, this.feeding ? 1 : 0, this.feeding ? 1.4 : 5, dt);
    this.tight = damp(this.tight, 0, 2.2, dt);
    this.swallow = damp(this.swallow, 0, 1.5, dt);
    if (Math.abs(this.vx) > 25) this.face = damp(this.face, Math.sign(this.vx), 1.6, dt);
    const targetBank = clamp(this.vx * 0.0022, -0.42, 0.42) + clamp(this.vy * 0.0006, -0.1, 0.1) * Math.sign(this.vx || 1);
    this.bank = damp(this.bank, targetBank, 3, dt);
    if (this.ripple < 0 && Math.random() < dt * 0.08) this.ripple = 0;
    if (this.ripple >= 0) {
      this.ripple += dt * 0.7;
      if (this.ripple > 1) this.ripple = -1;
    }
  }
  /** Centre of the underside opening (the dark hole). */
  mouthPos() {
    return { x: this.x + Math.sin(this.bank) * 10, y: this.y + 18 };
  }
  /** Points used to test cloud cover and light (centre, rim, top, belly). */
  samplePoints() {
    const c = Math.cos(this.bank);
    const s = Math.sin(this.bank);
    const pts = [
      [0, 0],
      [-110, 0],
      [110, 0],
      [-55, -10],
      [55, -10],
      [0, 16],
    ];
    return pts.map(([px, py]) => [this.x + px * c - py * s, this.y + px * s + py * c]);
  }

  /**
   * Matte bowl/saucer path: wide lens profile, smooth tapered rim, no seams.
   * Returns { hw, th, tb } for shading.
   */
  bodyPath(ctx) {
    const t = this.t;
    const hw = 152 * (1 - this.tight * 0.08) * (1 + this.swallow * 0.03);
    // Top dome thickness and belly depth — shallow bowl / saucer
    const th = 22 * (1 - this.tight * 0.3) * (1 + 0.02 * Math.sin(t * 1.1));
    const tb = 14 + this.mouth * 3 + this.swallow * 4;
    const N = 36;
    ctx.beginPath();
    // Upper silhouette (smooth dome)
    for (let i = 0; i <= N; i++) {
      const u = Math.cos((i / N) * Math.PI); // 1 → -1
      const x = u * hw;
      // Soft dome: flatter near the rim, fuller near centre
      const dome = Math.pow(1 - u * u, 0.55);
      const y = -th * dome;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Underside: flatter belly with a slight central dip for the hole
    for (let i = N; i >= 0; i--) {
      const u = Math.cos((i / N) * Math.PI);
      const x = u * hw * 0.995;
      const belly = Math.pow(1 - u * u, 0.85) * tb;
      // Mouth opens the centre downward a little
      const open = this.mouth * 6 * Math.exp(-u * u * 22);
      ctx.lineTo(x, belly + open);
    }
    ctx.closePath();
    this._hw = hw;
    this._th = th;
    this._tb = tb;
    return { hw, th, tb };
  }

  /**
   * Draw the craft. `light` 0..1 = how much moon/flash/beam catches its edge.
   * Matte charcoal, dark underside hole — no lights, no windows, no seams.
   */
  draw(ctx, light, alpha = 1, silhouetteOnly = false) {
    const breathe = 1 + 0.01 * Math.sin(this.t * 1.2);
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.t * 0.7) * 2.5);
    ctx.rotate(this.bank);
    ctx.scale(breathe, 1 / breathe);
    ctx.globalAlpha = alpha;
    const { hw, th, tb } = this.bodyPath(ctx);
    // Base fill: night-farm matte charcoal (not bright grey)
    ctx.fillStyle = "#0a0b0d";
    ctx.fill();
    if (!silhouetteOnly) {
      ctx.save();
      ctx.clip();
      // Soft top-to-belly matte gradient (seamless metal, no rivets)
      const skin = ctx.createLinearGradient(0, -th, 0, tb + 6);
      skin.addColorStop(0, "#1c1f24");
      skin.addColorStop(0.35, "#121418");
      skin.addColorStop(0.7, "#0a0b0d");
      skin.addColorStop(1, "#050607");
      ctx.fillStyle = skin;
      ctx.fillRect(-hw - 8, -th - 8, hw * 2 + 16, th + tb + 24);
      // Very faint moon sheen on the upper dome only — matte, never shiny
      if (light > 0.02) {
        const g = ctx.createLinearGradient(0, -th, 0, th * 0.4);
        g.addColorStop(0, `rgba(90,98,110,${0.14 * light})`);
        g.addColorStop(0.55, `rgba(40,44,52,${0.04 * light})`);
        g.addColorStop(1, "rgba(20,22,26,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-hw - 4, -th - 4, hw * 2 + 8, th + 10);
        // Thin rim catch along the equator (still matte, no flashy arc)
        ctx.strokeStyle = `rgba(110,118,128,${0.22 * light})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(0, 1, hw * 0.98, Math.max(2.5, th * 0.22), 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      // Dark circular underside hole — the only opening (Josh's refs)
      const holeR = 28 + this.mouth * 22;
      const holeY = tb * 0.55 + 2;
      const hole = ctx.createRadialGradient(0, holeY, 0, 0, holeY, holeR);
      hole.addColorStop(0, "rgba(0,0,0,0.98)");
      hole.addColorStop(0.55, "rgba(2,3,4,0.95)");
      hole.addColorStop(0.82, "rgba(8,9,11,0.7)");
      hole.addColorStop(1, "rgba(12,13,15,0)");
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.ellipse(0, holeY, holeR, holeR * (0.55 + this.mouth * 0.12), 0, 0, TAU);
      ctx.fill();
      // Inner lip of the hole (subtle recessed ring, still no lights)
      if (this.mouth > 0.02 || light > 0.05) {
        ctx.strokeStyle = `rgba(30,32,36,${0.55 + this.mouth * 0.25})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, holeY, holeR * 0.92, holeR * (0.5 + this.mouth * 0.1), 0, 0, TAU);
        ctx.stroke();
      }
      // While feeding: the hole is the suction mouth — pale pressure from INSIDE, not a beam lamp
      if (this.mouth > 0.05) {
        const m = this.mouth;
        const glow = ctx.createRadialGradient(0, holeY, 0, 0, holeY, holeR * 1.1);
        glow.addColorStop(0, `rgba(160,170,180,${0.1 * m})`);
        glow.addColorStop(0.45, `rgba(90,98,108,${0.05 * m})`);
        glow.addColorStop(1, "rgba(40,44,50,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(0, holeY, holeR * 0.7, holeR * 0.4, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/**
 * Menu director: long hidden glides inside cloud, rare glimpses (every 12-24 s, under 2 s),
 * then a quick dart back into cover. Never runs the same circuit twice.
 */
export class MenuDirector {
  constructor(creature, clouds) {
    this.c = creature;
    this.clouds = clouds;
    this.reset();
  }
  reset() {
    this.mode = "lurk";
    this.timer = 0;
    this.nextGlimpse = 6 + Math.random() * 6;
    const hide = this.clouds.hideClouds ? this.clouds.hideClouds() : this.clouds.clouds;
    this.pickHidden(hide[0] || this.clouds.clouds[0]);
    this.events = [];
  }
  pickHidden(cloud) {
    this.cloud = cloud;
    this.ox = (Math.random() - 0.5) * cloud.w * 0.42;
    this.oy = cloud.h * (0.16 + Math.random() * 0.14); // v14: low in the cloud, so the saucer shows half-buried
    this.speed = 0.25 + Math.random() * 0.2;
    this.retarget = 4 + Math.random() * 5;
  }
  update(dt) {
    const c = this.c;
    this.timer += dt;
    this.nextGlimpse -= dt;
    const hide = this.clouds.hideClouds ? this.clouds.hideClouds() : this.clouds.clouds;
    let tx;
    let ty;
    if (this.mode === "lurk") {
      tx = this.cloud.cx + this.ox;
      ty = this.cloud.cy + this.oy;
      this.retarget -= dt;
      if (this.retarget <= 0) {
        const other = hide.find((k) => k !== this.cloud) || hide[0];
        this.pickHidden(Math.random() < 0.3 && other ? other : this.cloud);
      }
      if (this.nextGlimpse <= 0) {
        this.mode = "approach";
        this.timer = 0;
        const below = Math.random() < 0.6;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.gx = this.cloud.cx + side * (below ? 60 + Math.random() * 120 : this.cloud.w * 0.55);
        this.gy = this.cloud.cy + (below ? this.cloud.h * 0.55 + 30 + Math.random() * 40 : -10 + Math.random() * 30);
      }
    } else if (this.mode === "approach") {
      tx = this.gx;
      ty = this.gy;
      this.speed = 0.6;
      const d = Math.hypot(tx - c.x, ty - c.y);
      if (d < 30 || this.timer > 3.2) {
        this.mode = "peek";
        this.timer = 0;
        this.events.push("glimpse");
      }
    } else if (this.mode === "peek") {
      tx = c.x;
      ty = c.y;
      this.speed = 0;
      if (this.timer > 0.4 + Math.random() * 0.5) {
        this.mode = "dart";
        this.timer = 0;
        const target = this.clouds.nearest(c.x, c.y);
        const pick = Math.random() < 0.35 ? hide[(Math.random() * hide.length) | 0] : target;
        this.pickHidden(pick);
        c.setInput((this.cloud.cx + this.ox - c.x) / 100, (this.cloud.cy + this.oy - c.y) / 100);
        if (c.burst()) this.events.push("dart");
      }
    } else {
      tx = this.cloud.cx + this.ox;
      ty = this.cloud.cy + this.oy;
      this.speed = 0.5;
      if (this.timer > 1.2) {
        this.mode = "lurk";
        this.nextGlimpse = 12 + Math.random() * 12;
      }
    }
    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, d / 120) * this.speed;
    c.setInput(d > 1 ? (dx / d) * k : 0, d > 1 ? (dy / d) * k : 0);
  }
}

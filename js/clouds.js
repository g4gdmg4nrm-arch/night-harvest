// Cloud cover. The SAME puff list (positions, sizes, sprite alpha, tear fade) is used both to draw
// the clouds and to answer "how hidden is this point?", so what you see is what witnesses see.
// Sprites lean on Josh's heights ref: tall volumetric cumulus + flatter horizontal layers.
import { clamp, fbm2, makeCanvas, rng, smoothstep, TAU, damp } from "./util.js?v=19";

const S = 128; // sprite resolution
const VARIANTS = 6; // 0-2 tall cumulus, 3-5 flatter layers

function buildSprites() {
  const sprites = [];
  for (let v = 0; v < VARIANTS; v++) {
    const flat = v >= 3;
    const alpha = new Float32Array(S * S);
    const body = makeCanvas(S, S);
    const rim = makeCanvas(S, S);
    const bctx = body.getContext("2d");
    const rctx = rim.getContext("2d");
    const bimg = bctx.createImageData(S, S);
    const rimg = rctx.createImageData(S, S);
    const ox = v * 17.3;
    const oy = v * 9.1;
    // Tall cumulus: rounder, puffier. Flat layers: wider, lower aspect, soft undersides.
    const yStretch = flat ? 1.55 : 0.92;
    const softEdge = flat ? 0.52 : 0.38;
    const aAt = (x, y) => {
      const dx = (x / S) * 2 - 1;
      const dy = (y / S) * 2 - 1;
      const d = Math.sqrt(dx * dx + dy * dy * yStretch);
      // Extra lobe noise for volumetric bumps (cotton-like folds)
      const n = fbm2(x * 0.048 + ox, y * 0.048 + oy, 5);
      const n2 = fbm2(x * 0.11 + ox * 1.7, y * 0.09 + oy * 1.3, 3);
      const lobes = flat
        ? n * 0.38 + n2 * 0.18
        : n * 0.48 + n2 * 0.22 * (1 - Math.abs(dy));
      const core = smoothstep(1.02, softEdge, d + lobes);
      const rimSoft = smoothstep(0.98, flat ? 0.72 : 0.78, d);
      // Flatter clouds thin out more toward the top and bottom edge of the sprite
      const band = flat ? smoothstep(0.05, 0.28, y / S) * smoothstep(0.95, 0.62, y / S) : 1;
      return core * rimSoft * band * 0.97;
    };
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) alpha[y * S + x] = aAt(x, y);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const a = alpha[i];
        const ty = y / S;
        const n = fbm2(x * 0.09 + ox * 2, y * 0.09 + oy, 4);
        // Darker volumetric underside, soft lit top — night charcoal blues
        const shade = 14 + (1 - ty) * 22 + n * 12 + (flat ? 4 : 0);
        bimg.data[i * 4] = shade * 0.9;
        bimg.data[i * 4 + 1] = shade * 0.98;
        bimg.data[i * 4 + 2] = shade * 1.14;
        bimg.data[i * 4 + 3] = a * 255;
        // Moon-side rim light where alpha falls off toward upper-left
        const lx = Math.max(0, x - 6);
        const ly = Math.max(0, y - 7);
        const edge = clamp(a - alpha[ly * S + lx] * 1.05, 0, 1);
        const r = edge * (0.55 + 0.45 * (1 - ty)) * 255;
        rimg.data[i * 4] = 148;
        rimg.data[i * 4 + 1] = 160;
        rimg.data[i * 4 + 2] = 176;
        rimg.data[i * 4 + 3] = clamp(r * 1.55, 0, 255);
      }
    }
    bctx.putImageData(bimg, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    const lit = [0.12, 0.3, 0.5, 0.75].map((k) => {
      const c = makeCanvas(S, S);
      const x = c.getContext("2d");
      x.drawImage(body, 0, 0);
      x.globalAlpha = k;
      x.drawImage(rim, 0, 0);
      return c;
    });
    sprites.push({ alpha, body, rim, lit, flat });
  }
  return sprites;
}

let SPRITES = null;
export function cloudSprites() {
  if (!SPRITES) SPRITES = buildSprites();
  return SPRITES;
}

function makeCloud(cx, cy, w, h, seed, count, kind = "cumulus", opts = {}) {
  const r = rng(seed);
  const puffs = [];
  const flat = kind === "flat";
  // Dense core so the middle is opaque, then ragged volumetric edges
  for (let i = 0; i < count; i++) {
    const core = i < count * (flat ? 0.35 : 0.42);
    const ang = r() * TAU;
    const rad = core ? Math.sqrt(r()) * 0.48 : 0.32 + Math.sqrt(r()) * 0.62;
    // Flat layers spread wider and sit lower in the band
    const sx = Math.cos(ang) * rad * w * 0.5 * (flat ? 1.05 : 1);
    const sy = Math.sin(ang) * rad * h * 0.5 * (flat ? 0.7 : 0.95) - (core ? 0 : flat ? 4 : 8);
    const size = core
      ? (flat ? 70 : 90) + r() * (flat ? 45 : 55)
      : (flat ? 40 : 48) + r() * (flat ? 50 : 58);
    // Pick matching sprite family
    const vBase = flat ? 3 : 0;
    puffs.push({
      sx,
      sy,
      r: size * (1 - Math.abs(sx) / (w * 0.95)) + (flat ? 14 : 22),
      v: vBase + Math.floor(r() * 3),
      ox: 0,
      oy: 0,
      fade: 1,
      ph: r() * TAU,
      x: 0,
      y: 0,
      rr: 0,
    });
  }
  puffs.sort((a, b) => a.sy - b.sy);
  const drift = 180 + r() * 80;
  return { cx0: cx, cy0: cy, cx, cy, w, h, kind, puffs, phase: r() * TAU, drift: opts.drift != null ? opts.drift : drift, tough: !!opts.tough };
}

export class CloudField {
  /** opts: period (drift cycle seconds, default 140), regrow (fade recovery per second, default 0.22). */
  constructor(defs, quality = 1, opts = {}) {
    this.sprites = cloudSprites();
    this.defs = defs;
    this.period = opts.period || 140;
    this.regrow = opts.regrow != null ? opts.regrow : 0.22;
    this.baseRegrow = this.regrow;
    this.build(quality);
    this.t = 0;
    this.flash = 0;
  }
  build(quality) {
    // Cover must not change when the quality setting does
    this.clouds = this.defs.map((d, i) => {
      const n = d.count || (d.kind === "flat" ? 28 : 36);
      return makeCloud(d.x, d.y, d.w, d.h, d.seed || 11 + i * 97, n, d.kind || "cumulus", { drift: d.drift, tough: d.tough });
    });
    this.update(0);
  }
  reset() {
    for (const c of this.clouds)
      for (const p of c.puffs) {
        p.ox = 0;
        p.oy = 0;
        p.fade = 1;
      }
    this.t = 0;
    this.regrow = this.baseRegrow;
    this.update(0);
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    for (const c of this.clouds) {
      const slow = c.kind === "flat" ? 0.7 : 1;
      c.cx = c.cx0 + c.drift * Math.sin((t * TAU) / (this.period / slow) + c.phase) + 22 * Math.sin(t * 0.12 + c.phase);
      c.cy = c.cy0 + 8 * Math.sin(t * 0.065 + c.phase);
      for (const p of c.puffs) {
        p.ox = damp(p.ox, 0, 0.7, dt);
        p.oy = damp(p.oy, 0, 0.7, dt);
        p.fade = Math.min(1, p.fade + dt * (c.tough ? Math.max(0.22, this.regrow * 3) : this.regrow));
        const boil = 1 + 0.045 * Math.sin(t * 0.32 + p.ph);
        p.x = c.cx + p.sx + p.ox + 4 * Math.sin(t * 0.2 + p.ph);
        p.y = c.cy + p.sy + p.oy + 3 * Math.cos(t * 0.16 + p.ph);
        p.rr = p.r * boil;
      }
    }
  }
  /**
   * Push puffs away from a point. `tear` (0..1) also thins them, which really reduces cover.
   */
  disturb(x, y, radius, push, tear, vx = 0, vy = 0) {
    for (const c of this.clouds) {
      if (Math.abs(c.cx - x) > c.w + radius) continue;
      for (const p of c.puffs) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const reach = radius + p.rr * 0.5;
        if (d > reach) continue;
        const f = 1 - d / reach;
        p.ox += (dx / d) * push * f + vx * f * 0.04;
        p.oy += (dy / d) * push * f + vy * f * 0.04;
        p.ox = clamp(p.ox, -160, 160);
        p.oy = clamp(p.oy, -120, 120);
        if (tear > 0) p.fade = Math.max(0.12, p.fade - tear * f);
      }
    }
  }
  /**
   * Storm Farm: a gust front at world x tears through every cloud it touches. Ordinary cloud is shredded
   * almost to nothing (fade falls, puffs are flung downwind); the big storm banks (`tough`) barely thin.
   * Returns puffs that were torn hard this step (for the shredded-wisp particles).
   */
  rip(frontX, width, strength, dt) {
    const torn = [];
    for (const c of this.clouds) {
      if (Math.abs(c.cx - frontX) > c.w * 0.6 + width) continue;
      for (const p of c.puffs) {
        const d = Math.abs(p.x - frontX);
        if (d > width) continue;
        const f = 1 - d / width;
        if (c.tough) {
          p.fade = Math.max(0.78, p.fade - strength * 0.08 * f * dt);
          p.ox = Math.min(40, p.ox + 60 * f * dt);
          continue;
        }
        const before = p.fade;
        p.fade = Math.max(0.03, p.fade - strength * f * dt);
        p.ox = Math.min(320, p.ox + 520 * f * dt);
        p.oy = clamp(p.oy - 40 * f * dt, -120, 120);
        if (before > 0.35 && p.fade <= 0.35) torn.push(p);
      }
    }
    return torn;
  }
  /** Instantly strip ordinary cloud left of x (the part of the front that passed off-screen). */
  stripBefore(x, keep = 0.06) {
    for (const c of this.clouds) {
      if (c.tough) continue;
      for (const p of c.puffs) if (p.x < x) p.fade = Math.min(p.fade, keep);
    }
  }
  /** Average cover left in ordinary (non-storm-bank) cloud, 0..1. */
  coverLeft() {
    let s = 0;
    let n = 0;
    for (const c of this.clouds) {
      if (c.tough) continue;
      for (const p of c.puffs) (s += p.fade), n++;
    }
    return n ? s / n : 1;
  }
  /** Cover density 0..1 at a world point: exactly how opaque the drawn cloud is there. */
  density(x, y) {
    let clear = 1;
    for (const c of this.clouds) {
      if (Math.abs(c.cx - x) > c.w * 0.5 + 160 || Math.abs(c.cy - y) > c.h * 0.5 + 160) continue;
      for (const p of c.puffs) {
        const u = (x - p.x) / p.rr;
        const v = (y - p.y) / p.rr;
        if (u <= -1 || u >= 1 || v <= -1 || v >= 1) continue;
        const sx = ((u * 0.5 + 0.5) * S) | 0;
        const sy = ((v * 0.5 + 0.5) * S) | 0;
        const a = this.sprites[p.v].alpha[sy * S + sx] * p.fade;
        clear *= 1 - a;
        if (clear < 0.002) return 1;
      }
    }
    return 1 - clear;
  }
  /** Nearest cloud centre to x (used by the menu director and the hint). */
  nearest(x, y) {
    let best = null;
    let bd = 1e9;
    for (const c of this.clouds) {
      const d = Math.hypot(c.cx - x, (c.cy - y) * 1.5);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
  /** Hideable cumulus banks (the tall ones you can settle into). */
  hideClouds() {
    return this.clouds.filter((c) => c.kind !== "flat");
  }
  toughClouds() {
    return this.clouds.filter((c) => c.tough);
  }
  /** Draw in world space (ctx already translated for the camera). */
  draw(ctx, viewL, viewR, light) {
    const flash = this.flash;
    // Draw high/flat layers first, then denser cumulus on top for depth
    const order = this.clouds.slice().sort((a, b) => a.cy0 - b.cy0);
    for (const c of order) {
      if (c.cx + c.w < viewL - 200 || c.cx - c.w > viewR + 200) continue;
      const lite = this.lite;
      for (let i = 0; i < c.puffs.length; i++) {
        const p = c.puffs[i];
        // v17 Lite: draw every other small puff, the big ones a touch larger (same cover/density for gameplay)
        if (lite && (i & 1) && (p.rr < 70 || c.tough)) continue;
        const sp = this.sprites[p.v];
        const s = p.rr * 2 * (lite ? 1.12 : 1);
        ctx.globalAlpha = p.fade * (c.kind === "flat" ? 0.92 : 1);
        const L = light(p.x, p.y) * (c.tough ? 0.55 : 1) + flash * 0.9;
        const k = L < 0.2 ? 0 : L < 0.4 ? 1 : L < 0.62 ? 2 : 3;
        ctx.drawImage(sp.lit[k], p.x - s / 2, p.y - s / 2, s, s);
        // storm banks: a second, darker body pass so they read as heavy, solid cover
        if (c.tough && !lite) ctx.drawImage(sp.body, p.x - p.rr * 0.9, p.y - p.rr * 0.85, s * 0.9, s * 0.9);
      }
    }
    if (flash > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      for (const c of this.clouds) {
        if (c.cx + c.w < viewL - 200 || c.cx - c.w > viewR + 200) continue;
        for (const p of c.puffs) {
          ctx.globalAlpha = flash * 0.32 * p.fade;
          ctx.drawImage(this.sprites[p.v].body, p.x - p.rr, p.y - p.rr, p.rr * 2, p.rr * 2);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }
}

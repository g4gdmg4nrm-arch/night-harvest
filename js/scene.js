// Everything that is not an actor: sky, moon, distant cloud banks, hills, three layers of trees,
// haze, the farm, the road, fog, the long field grass and the dark foreground grass.
import { VH, WORLD_W, GROUND, HOUSE, MOON, roadY } from "./config.js?v=27";
import { clamp, damp, fbm2, lerp, makeCanvas, noise1, noise2, rng, smoothstep, TAU } from "./util.js?v=27";
import { cloudSprites } from "./clouds.js?v=27";

function tint(img, color) {
  const c = makeCanvas(img.width, img.height);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Draw an image bent by the wind: horizontal strips shift more the higher they are. */
export function drawBent(ctx, img, x, baseY, scale, bend, flutter, strips, t, seed) {
  const dw = img.width * scale;
  const dh = img.height * scale;
  const sh = img.height / strips;
  const top = baseY - dh;
  for (let k = 0; k < strips; k++) {
    const hf = 1 - (k + 0.5) / strips; // 1 at top, 0 at the base
    const f = Math.pow(hf, 1.6);
    const fl = flutter * hf * hf * Math.sin(t * (2.3 + seed * 0.7) + k * 0.9 + seed * 5);
    const off = (bend * f + fl) * dh;
    ctx.drawImage(img, 0, k * sh, img.width, sh + 0.6, x - dw * 0.5 + off, top + k * sh * scale, dw, sh * scale + 0.8);
  }
}

export class Scene {
  constructor(trees, quality) {
    this.treeImgs = trees; // raw images
    this.quality = quality;
    this.flash = 0;
    this.flashX = 600;
    this.doorOpen = 0;
    this.porchFlicker = 1;
    // Irregular blinds peek: soft silhouette, then slats snap shut (Game King)
    this.blinds = 0; // 0 closed .. 1 open with figure
    this.blindsPhase = "wait"; // wait | open | hold | snap
    this.blindsT = 4 + Math.random() * 8;
    this.blindsWin = 0; // which lit window
    this.build();
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.buildGrass();
  }

  build() {
    const r = rng(42);
    // --- sky gradient (stretched)
    this.sky = makeCanvas(4, VH);
    {
      const x = this.sky.getContext("2d");
      const g = x.createLinearGradient(0, 0, 0, VH);
      g.addColorStop(0, "#06080b");
      g.addColorStop(0.35, "#0e1217");
      g.addColorStop(0.62, "#20272f");
      g.addColorStop(0.72, "#2c333c");
      g.addColorStop(0.78, "#262c34");
      g.addColorStop(1, "#0b0e11");
      x.fillStyle = g;
      x.fillRect(0, 0, 4, VH);
    }
    // --- distant cloud banks (tile horizontally, drift slowly)
    const sprites = cloudSprites();
    const bank = (w, h, n, seed, dark, yBias) => {
      const c = makeCanvas(w, h);
      const x = c.getContext("2d");
      const rr = rng(seed);
      for (let i = 0; i < n; i++) {
        const px = rr() * w;
        const ty = Math.pow(rr(), yBias);
        const rad = 60 + rr() * 120 * (1 - ty * 0.5);
        const py = Math.min(ty * h * 0.8 + 20, h - rad * 0.9);
        const sp = sprites[(rr() * sprites.length) | 0];
        for (const dx of [-w, 0, w]) {
          x.globalAlpha = 0.85 + rr() * 0.15;
          x.drawImage(sp.body, px + dx - rad, py - rad, rad * 2, rad * 2);
          x.globalAlpha = 0.22 + (1 - ty) * 0.25;
          x.drawImage(sp.rim, px + dx - rad, py - rad, rad * 2, rad * 2);
        }
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = "source-atop";
      x.fillStyle = dark;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = "destination-out";
      const fade = x.createLinearGradient(0, h * 0.6, 0, h);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,1)");
      x.fillStyle = fade;
      x.fillRect(0, h * 0.6, w, h * 0.4);
      return c;
    };
    this.bankFar = bank(2600, 440, 150, 7, "rgba(10,12,16,0.28)", 1.7);
    this.bankNear = bank(2600, 380, 95, 19, "rgba(4,5,7,0.48)", 0.85);
    // --- hills, silo, distant poles (parallax 0.3)
    this.hillW = Math.ceil(WORLD_W * 0.3 + 2200);
    this.hills = makeCanvas(this.hillW, 160);
    {
      const x = this.hills.getContext("2d");
      const base = 120; // canvas y of the horizon (world y = 420 + base)
      x.fillStyle = "#1d232a";
      x.beginPath();
      x.moveTo(0, 160);
      for (let i = 0; i <= this.hillW; i += 8) {
        const h = 26 + 22 * noise1(i * 0.0021 + 3) + 9 * noise1(i * 0.011);
        x.lineTo(i, base - Math.max(4, h));
      }
      x.lineTo(this.hillW, 160);
      x.fill();
      // tree clumps on the hills
      x.fillStyle = "#192027";
      for (let i = 0; i < this.hillW; i += 6) {
        const n = noise1(i * 0.013 + 9);
        if (n > 0.15) {
          const h = 26 + 22 * noise1(i * 0.0021 + 3) + 9 * noise1(i * 0.011);
          const th = 4 + (n - 0.15) * 22 + r() * 4;
          x.beginPath();
          x.ellipse(i, base - h - th * 0.5 + 3, 4 + r() * 4, th * 0.6, 0, 0, TAU);
          x.fill();
        }
      }
      // silo and barn (distant human structures)
      const sx = 820;
      x.fillStyle = "#151a1f";
      x.fillRect(sx, base - 66, 14, 60);
      x.beginPath();
      x.ellipse(sx + 7, base - 66, 7, 5, 0, Math.PI, TAU);
      x.fill();
      x.fillRect(sx + 20, base - 30, 34, 26);
      x.beginPath();
      x.moveTo(sx + 17, base - 30);
      x.lineTo(sx + 37, base - 42);
      x.lineTo(sx + 57, base - 30);
      x.fill();
      // a faint far window
      x.fillStyle = "rgba(255,190,120,0.45)";
      x.fillRect(sx + 30, base - 22, 2, 2);
      // pole line
      x.strokeStyle = "rgba(20,24,30,0.9)";
      x.lineWidth = 1;
      for (let i = 60; i < this.hillW; i += 150) {
        x.beginPath();
        x.moveTo(i, base - 5);
        x.lineTo(i, base - 30);
        x.moveTo(i - 4, base - 27);
        x.lineTo(i + 4, base - 27);
        x.stroke();
      }
      // haze across the bottom so it melts into the field
      const g = x.createLinearGradient(0, base - 70, 0, 160);
      g.addColorStop(0, "rgba(44,51,60,0)");
      g.addColorStop(0.75, "rgba(44,51,60,0.45)");
      g.addColorStop(1, "rgba(40,46,54,0.8)");
      x.globalCompositeOperation = "source-atop";
      x.fillStyle = g;
      x.fillRect(0, 0, this.hillW, 160);
    }
    // --- v14 storm ceiling: a heavy, lumpy cloud mass over the top half (pre-rendered, tiles horizontally)
    {
      const W = 512, H = 150; // drawn at 2.5x: 1280 x 375
      this.ceiling = makeCanvas(W, H);
      const x = this.ceiling.getContext("2d");
      const img = x.createImageData(W, H);
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const u = i / W;
          const n1 = fbm2(i * 0.018, j * 0.03 + 7, 5);
          const n2 = fbm2((i - W) * 0.018, j * 0.03 + 7, 5);
          const n = n1 * (1 - u) + n2 * u;
          const v = j / H;
          // solid at the top, ragged billowing underside
          const edge = 0.62 + n * 0.55;
          const a = clamp((edge - v) * 3.2, 0, 1) * 0.92;
          const lum = 10 + clamp(n + 0.5, 0, 1) * 22 + smoothstep(edge - 0.25, edge, v) * 14; // lit underside
          const k = (j * W + i) * 4;
          img.data[k] = lum * 0.92; img.data[k + 1] = lum * 0.98; img.data[k + 2] = lum * 1.12; img.data[k + 3] = a * 255;
        }
      x.putImageData(img, 0, 0);
    }
    // --- fog texture (tiles horizontally)
    this.fog = makeCanvas(1024, 96);
    {
      const x = this.fog.getContext("2d");
      const img = x.createImageData(1024, 96);
      for (let j = 0; j < 96; j++)
        for (let i = 0; i < 1024; i++) {
          const u = i / 1024;
          // tileable noise by blending across the seam
          const n1 = fbm2(i * 0.012, j * 0.05, 4);
          const n2 = fbm2((i - 1024) * 0.012, j * 0.05, 4);
          const n = n1 * (1 - u) + n2 * u;
          const v = smoothstep(0, 0.35, j / 96) * smoothstep(1, 0.55, j / 96);
          const a = clamp((n + 0.35) * 1.3, 0, 1) * v;
          const k = (j * 1024 + i) * 4;
          img.data[k] = 58;
          img.data[k + 1] = 66;
          img.data[k + 2] = 76;
          img.data[k + 3] = a * 255;
        }
      x.putImageData(img, 0, 0);
    }
    // --- trees: three depths (far, mid, the yard tree)
    const imgs = this.treeImgs.filter(Boolean);
    this.treeLayers = [];
    if (imgs.length) {
      const far = imgs.map((im) => tint(im, "#161b21"));
      const mid = imgs.map((im) => tint(im, "#0b0e11"));
      const near = imgs.map((im) => tint(im, "#07090b"));
      const layer = (p, list, baseY, sMin, sMax, gapMin, gapMax, amp, lag, seed, span) => {
        const rr = rng(seed);
        const items = [];
        let x = 40 + rr() * 80;
        while (x < span) {
          const scale = sMin + rr() * (sMax - sMin);
          const k = (rr() * list.length) | 0;
          items.push({ img: list[k], x, y: baseY + rr() * 6, scale, seed: rr(), amp: amp * (0.75 + rr() * 0.5) });
          x += gapMin + rr() * (gapMax - gapMin);
          if (rr() < 0.18) x += 300 + rr() * 400; // open stretches
        }
        return { p, items, lag, amp };
      };
      this.treeLayers.push(layer(0.42, far, 532, 0.24, 0.36, 70, 170, 0.035, 1.3, 3, WORLD_W * 0.42 + 2200));
      this.treeLayers.push(layer(0.68, mid, 546, 0.4, 0.58, 160, 420, 0.06, 0.6, 5, WORLD_W * 0.68 + 2200));
      this.yardTree = { img: near[0], x: HOUSE.x + HOUSE.w + 60, y: GROUND + 4, scale: 0.78, seed: 0.3 };
      this.fieldTree = { img: near[3] || near[0], x: 520, y: GROUND + 4, scale: 0.62, seed: 0.7 };
    }
    // --- fence
    this.fence = [];
    {
      const rr = rng(77);
      for (let x = 140; x < HOUSE.x - 40; x += 58 + rr() * 14) {
        if (rr() < 0.08) continue;
        this.fence.push({ x, lean: (rr() - 0.5) * 0.12, h: 26 + rr() * 6 });
      }
    }
    this.buildGrass();
  }

  buildGrass() {
    const q = this.quality;
    const r = rng(9);
    // long field grass (playable plane), in uneven clumps; mown short in the yard
    this.field = [];
    const step = q >= 2 ? 3.4 : q >= 1 ? 4.6 : q >= 0 ? 7 : 11; // v17 Lite: sparser field grass
    for (let x = 0; x < WORLD_W; x += step * (0.6 + r() * 0.8)) {
      const yard = x > HOUSE.x - 300 && x < HOUSE.x + HOUSE.w + 30;
      const clump = 0.5 + 0.5 * noise1(x * 0.02 + 4);
      const h = yard ? 6 + r() * 7 : 12 + clump * 30 + r() * 14;
      const by = GROUND + 2 + r() * 34;
      this.field.push({ x, y: by, h, w: 1.6 + r() * 1.4, stiff: 0.55 + r() * 0.5, ph: r() * TAU, shade: r() });
    }
    // dark foreground grass (parallax 1.28), tall and heavy, catching a little moonlight
    this.front = [];
    const span = WORLD_W * 1.28 + 2400;
    const fstep = q >= 2 ? 3.6 : q >= 1 ? 4.8 : 8;
    for (let x = -100; x < span; x += fstep * (0.5 + r() * 1.0)) {
      const clump = 0.5 + 0.5 * noise1(x * 0.006 + 1.7);
      const h = 45 + clump * clump * 150 + r() * 45;
      this.front.push({
        x,
        y: VH + 8 + r() * 10,
        h,
        w: 5 + r() * 7,
        stiff: 0.8 + r() * 0.6,
        ph: r() * TAU,
        lit: r() < 0.13,
      });
    }
    this.frontStep = fstep;
  }

  // ------------------------------------------------------------------ drawing helpers
  moonScreen(camX, VW) {
    return { x: MOON.x - camX * 0.04 + (VW - 1280) * 0.25, y: MOON.y };
  }

  /** Background: sky -> moon -> far bank -> hills -> far trees -> haze -> mid trees. */
  drawBack(ctx, s, camX, VW, t, wind, flashAmt, part = "all") {
    const set = (p) => ctx.setTransform(s, 0, 0, s, -camX * p * s, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (part !== "trees") this.drawSky(ctx, s, camX, VW, t, flashAmt);
    if (part !== "sky") this.drawTrees(ctx, s, camX, VW, t, wind, set);
  }

  /** Sky, moon, the distant cloud banks and hills: soft content, so it can be drawn at half resolution. */
  drawSky(ctx, s, camX, VW, t, flashAmt) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.sky, 0, 0, VW, VH);
    // moon glow behind everything
    const m = this.moonScreen(camX, VW);
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 520);
    g.addColorStop(0, "rgba(170,186,205,0.55)");
    g.addColorStop(0.08, "rgba(120,136,156,0.32)");
    g.addColorStop(0.35, "rgba(60,70,84,0.14)");
    g.addColorStop(1, "rgba(20,24,30,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH * 0.8);
    ctx.fillStyle = "rgba(214,222,230,0.9)";
    ctx.beginPath();
    ctx.arc(m.x, m.y, MOON.r, 0, TAU);
    ctx.fill();
    // far cloud bank drifts slowly; the moon shows through its thin edges
    const fb = this.bankFar;
    const fx = -((camX * 0.08 + t * 3.2) % fb.width);
    for (let x = fx; x < VW; x += fb.width) ctx.drawImage(fb, x, -10);
    // lightning glow sits behind the nearer clouds
    if (flashAmt > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      const lx = this.flashX - camX * 0.1;
      const lg = ctx.createRadialGradient(lx, 160, 0, lx, 160, 700);
      lg.addColorStop(0, `rgba(170,185,215,${0.5 * flashAmt})`);
      lg.addColorStop(1, "rgba(60,70,90,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, VW, VH * 0.75);
      ctx.globalCompositeOperation = "source-over";
    }
    const nb = this.bankNear;
    const nx = -((camX * 0.16 + t * 6.5) % nb.width);
    for (let x = nx; x < VW; x += nb.width) ctx.drawImage(nb, x, -40);
    // v14: the heavy storm ceiling, half-hiding the moon
    const cw = this.ceiling.width * 2.5, ch = this.ceiling.height * 2.5;
    const cx0 = -((camX * 0.2 + t * 4.5) % cw);
    for (let x = cx0; x < VW; x += cw) ctx.drawImage(this.ceiling, x, -30, cw, ch);
    // moonlight seeping through the nearer clouds (back light on their edges)
    ctx.globalCompositeOperation = "lighter";
    const sg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 420);
    sg.addColorStop(0, "rgba(170,184,200,0.5)");
    sg.addColorStop(0.4, "rgba(70,80,94,0.08)");
    sg.addColorStop(1, "rgba(40,46,56,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(m.x - 420, 0, 840, m.y + 420);
    ctx.globalCompositeOperation = "source-over";
    // hills
    const hx = -camX * 0.3;
    ctx.drawImage(this.hills, hx, 420);
  }

  /** v14: low mist lying over the distant fields (behind actors, so it never hides danger). */
  drawFarMist(ctx, s, camX, VW, t, wind) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const fw = this.fog.width * 1.8;
    if (this.quality < 1) return; // low-end: the existing near fog is enough
    const lim = this.quality >= 2 ? 2 : 1;
    const bands = [{ y: 470, h: 80, p: 0.35, sp: 5, a: 0.5 }, { y: 500, h: 70, p: 0.5, sp: 8, a: 0.38 }];
    for (let i = 0; i < lim; i++) {
      const l = bands[i];
      const off = -((camX * l.p + t * l.sp * (0.6 + wind.gust)) % fw);
      ctx.globalAlpha = l.a;
      for (let x = off; x < VW; x += fw) ctx.drawImage(this.fog, x, l.y, fw, l.h);
    }
    ctx.globalAlpha = 1;
  }

  /** v15 menu: a parked car on the road, headlights on, like the reference. World coords (farm plane). */
  drawMenuCar(ctx, s, camX, x) {
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const y = roadY(x);
    ctx.fillStyle = "#050607";
    ctx.beginPath();
    ctx.moveTo(x - 46, y - 4); ctx.lineTo(x - 44, y - 16); ctx.lineTo(x - 22, y - 18); ctx.lineTo(x - 12, y - 30);
    ctx.lineTo(x + 18, y - 30); ctx.lineTo(x + 30, y - 18); ctx.lineTo(x + 48, y - 15); ctx.lineTo(x + 50, y - 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 28, y - 3, 7, 0, TAU); ctx.arc(x + 30, y - 3, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(90,100,112,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 12, y - 30); ctx.lineTo(x + 18, y - 30); ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    const hx = x + 49, hy = y - 11;
    const g = ctx.createLinearGradient(hx, hy, hx + 380, hy + 30);
    g.addColorStop(0, "rgba(255,232,190,0.28)"); g.addColorStop(1, "rgba(255,232,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(hx, hy - 3); ctx.lineTo(hx + 380, hy - 30); ctx.lineTo(hx + 380, hy + 60); ctx.lineTo(hx, hy + 3); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    this.menuHead = { x: hx, y: hy };
  }

  /** v14: warm lights punch back through the fog (cheap: a few small additive dots). */
  drawWarmGlints(ctx, s, camX, t, car) {
    if (this.quality < 0) return; // v17 Lite
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    ctx.globalCompositeOperation = "lighter";
    if (!this.glint) {
    // v14 warm glint sprite (replaces per-frame blur for the small lights)
      this.glint = makeCanvas(64, 64);
    {
      const x = this.glint.getContext("2d");
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,220,170,1)");
      g.addColorStop(0.12, "rgba(255,180,100,0.6)");
      g.addColorStop(0.45, "rgba(255,140,60,0.15)");
      g.addColorStop(1, "rgba(255,120,40,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    }
    }
    const f = this.porchFlicker;
    const dot = (x, y, r, a) => {
      ctx.globalAlpha = a;
      ctx.drawImage(this.glint, x - r, y - r, r * 2, r * 2);
    };
    dot(HOUSE.door - 34, GROUND - 74, 28, 0.55 * f);
    if (this.doorOpen > 0.02) dot(HOUSE.door, GROUND - 30, 40, 0.4 * this.doorOpen * f);
    if (car && car.state !== "off") { const h = car.headlight(); dot(h.x, h.y, 22, 0.75); dot(h.x - 8, h.y + 1, 14, 0.5); }
    if (this.menuHead) { const h = this.menuHead; dot(h.x, h.y, 26, 0.85); dot(h.x - 4, h.y + 1, 14, 0.6); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  drawTrees(ctx, s, camX, VW, t, wind, set) {
    // far trees then haze then mid trees
    const strips = this.quality >= 2 ? 14 : this.quality >= 1 ? 10 : 6;
    for (let li = 0; li < this.treeLayers.length; li++) {
      const L = this.treeLayers[li];
      set(L.p);
      const left = camX * L.p - 200;
      const right = left + VW + 400;
      for (const it of L.items) {
        if (it.x < left || it.x > right) continue;
        const w = wind.sample(it.x / L.p, L.lag, 0.6);
        drawBent(ctx, it.img, it.x, it.y, it.scale, 0.09 + w * it.amp * 1.8 + 0.02 * Math.sin(t * 1.3 + it.seed * 6), 0.012 + w * 0.012, strips, t, it.seed); // v15: bent sideways, swaying
      }
      ctx.setTransform(s, 0, 0, s, 0, 0);
      const hz = ctx.createLinearGradient(0, 430, 0, 570);
      const a = li === 0 ? 0.3 : 0.12;
      hz.addColorStop(0, "rgba(46,53,62,0)");
      hz.addColorStop(0.75, `rgba(46,53,62,${a})`);
      hz.addColorStop(1, `rgba(40,46,54,${a * 0.6})`);
      ctx.fillStyle = hz;
      ctx.fillRect(0, 430, VW, 140);
    }
  }

  /** v24: just the far, wind-bent tree line + its haze (levels 5-10 borrow the farm's horizon). */
  drawFarTrees(ctx, s, camX, VW, t, wind) {
    const L = this.treeLayers && this.treeLayers[1]; // the darker mid layer reads as a silhouette against the horizon mist
    if (!L) return;
    const strips = this.quality >= 2 ? 12 : this.quality >= 1 ? 8 : 5;
    const span = L.items.length ? L.items[L.items.length - 1].x : 0;
    const off = span > 0 ? Math.floor((camX * L.p) / (span - 600)) * (span - 600) : 0; // wrap long levels
    ctx.setTransform(s, 0, 0, s, -(camX * L.p - off) * s, 0);
    const left = camX * L.p - off - 200;
    const right = left + VW + 400;
    for (const it of L.items) {
      if (it.x < left || it.x > right) continue;
      const w = wind.sample(it.x / L.p, L.lag, 0.6);
      drawBent(ctx, it.img, it.x, it.y, it.scale, 0.09 + w * it.amp * 1.8 + 0.02 * Math.sin(t * 1.3 + it.seed * 6), 0.012 + w * 0.012, strips, t, it.seed);
    }
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const hz = ctx.createLinearGradient(0, 430, 0, 570);
    hz.addColorStop(0, "rgba(46,53,62,0)");
    hz.addColorStop(0.75, "rgba(46,53,62,0.12)");
    hz.addColorStop(1, "rgba(40,46,54,0.08)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, 430, VW, 140);
  }

  /** The farm plane (parallax 1), drawn before the actors. */
  drawFarm(ctx, s, camX, VW, t, wind, infl) {
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const L = camX - 60;
    const R = camX + VW + 60;
    // ground
    const g = ctx.createLinearGradient(0, GROUND - 6, 0, VH);
    g.addColorStop(0, "#232a31");
    g.addColorStop(0.12, "#151a1f");
    g.addColorStop(0.5, "#0a0c0e");
    g.addColorStop(1, "#050607");
    ctx.fillStyle = g;
    ctx.fillRect(L, GROUND - 4, R - L, VH - GROUND + 4);
    // trees in the playable plane
    const strips = this.quality >= 2 ? 22 : this.quality >= 1 ? 16 : 9;
    for (const tr of [this.fieldTree, this.yardTree]) {
      if (!tr) continue;
      if (tr.x < L - 300 || tr.x > R + 300) continue;
      const w = wind.sample(tr.x, 0.25, 1);
      const pull = this.pullAt(tr.x, infl) * 0.5;
      drawBent(ctx, tr.img, tr.x, tr.y, tr.scale, 0.08 + w * 0.14 + 0.02 * Math.sin(t * 1.1 + tr.seed * 5) + pull * 0.12, 0.016 + w * 0.02 + Math.abs(pull) * 0.02, strips, t, tr.seed);
    }
    this.drawPoles(ctx, L, R, t, wind);
    this.drawHouse(ctx, t);
    // fence
    ctx.fillStyle = "#0b0d10";
    ctx.strokeStyle = "#0b0d10";
    ctx.lineWidth = 2.2;
    const fy = GROUND + 18;
    ctx.beginPath();
    let prev = null;
    for (const p of this.fence) {
      if (p.x < L - 80 || p.x > R + 80) {
        prev = null;
        continue;
      }
      ctx.save();
      ctx.translate(p.x, fy);
      ctx.rotate(p.lean);
      ctx.fillRect(-1.8, -p.h, 3.6, p.h);
      ctx.restore();
      if (prev && p.x - prev.x < 90) {
        ctx.moveTo(prev.x, fy - prev.h * 0.82);
        ctx.lineTo(p.x, fy - p.h * 0.82);
        ctx.moveTo(prev.x, fy - prev.h * 0.42);
        ctx.lineTo(p.x, fy - p.h * 0.42);
      }
      prev = p;
    }
    ctx.stroke();
    // road
    ctx.beginPath();
    ctx.moveTo(L, roadY(L));
    for (let x = L; x <= R; x += 24) ctx.lineTo(x, roadY(x));
    ctx.lineTo(R, roadY(R) + 16);
    for (let x = R; x >= L; x -= 24) ctx.lineTo(x, roadY(x) + 16);
    ctx.closePath();
    ctx.fillStyle = "#14181c";
    ctx.fill();
    ctx.beginPath();
    for (let x = L; x <= R; x += 24) (x === L ? ctx.moveTo : ctx.lineTo).call(ctx, x, roadY(x) + 0.5);
    ctx.strokeStyle = "rgba(48,56,64,0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  drawPoles(ctx, L, R, t, wind) {
    const poles = [380, 1560, 2760];
    ctx.strokeStyle = "#0a0c0f";
    ctx.lineWidth = 4;
    for (const x of poles) {
      if (x < L - 1200 || x > R + 1200) continue;
      ctx.beginPath();
      ctx.moveTo(x, GROUND + 6);
      ctx.lineTo(x + 2, GROUND - 205);
      ctx.moveTo(x - 22, GROUND - 190);
      ctx.lineTo(x + 26, GROUND - 192);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(10,12,15,0.9)";
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      if (b < L || a > R) continue;
      for (const k of [-18, 22]) {
        const sway = Math.sin(t * 0.9 + k) * 4 * wind.gust;
        ctx.beginPath();
        ctx.moveTo(a + k, GROUND - 191);
        ctx.quadraticCurveTo((a + b) / 2 + sway, GROUND - 150 + sway, b + k, GROUND - 191);
        ctx.stroke();
      }
    }
  }


  /** Irregular peek through the blinds. Soft silhouette, then a hard snap shut. */
  updateBlinds(dt, force = false) {
    this.blindsT -= dt;
    if (this.blindsPhase === "wait") {
      this.blinds = damp(this.blinds, 0, 8, dt);
      if (this.blindsT <= 0 || force) {
        this.blindsPhase = "open";
        this.blindsT = 0.35 + Math.random() * 0.35; // brief soft open
        this.blindsWin = Math.random() < 0.7 ? 0 : 1;
      }
    } else if (this.blindsPhase === "open") {
      this.blinds = damp(this.blinds, 1, 5, dt);
      if (this.blindsT <= 0) {
        this.blindsPhase = "hold";
        this.blindsT = 0.45 + Math.random() * 0.7; // short hold — not a long stare
      }
    } else if (this.blindsPhase === "hold") {
      this.blinds = 1;
      if (this.blindsT <= 0) {
        this.blindsPhase = "snap";
        this.blindsT = 0.08; // hard snap
      }
    } else {
      // snap shut
      this.blinds = Math.max(0, this.blinds - dt * 14);
      if (this.blindsT <= 0 || this.blinds <= 0.02) {
        this.blinds = 0;
        this.blindsPhase = "wait";
        // Irregular: sometimes soon, sometimes a long quiet stretch
        const r = Math.random();
        this.blindsT = r < 0.25 ? 3 + Math.random() * 4 : r < 0.6 ? 8 + Math.random() * 10 : 16 + Math.random() * 22;
      }
    }
  }

  drawHouse(ctx, t) {
    const { x, w } = HOUSE;
    const top = GROUND - 112;
    // chimney + roof
    ctx.fillStyle = "#08090b";
    ctx.fillRect(x + w - 70, top - 82, 22, 70);
    ctx.beginPath();
    ctx.moveTo(x - 18, top + 4);
    ctx.lineTo(x + w * 0.5, top - 64);
    ctx.lineTo(x + w + 18, top + 4);
    ctx.closePath();
    ctx.fill();
    // moonlit roof edge (sharper double stroke)
    ctx.strokeStyle = "rgba(70,82,94,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 18, top + 4);
    ctx.lineTo(x + w * 0.5, top - 64);
    ctx.lineTo(x + w + 18, top + 4);
    ctx.stroke();
    ctx.strokeStyle = "rgba(20,24,28,0.7)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 14, top + 6);
    ctx.lineTo(x + w * 0.5, top - 58);
    ctx.stroke();
    // walls with faint weatherboards
    ctx.fillStyle = "#0c0f12";
    ctx.fillRect(x, top, w, GROUND - top);
    ctx.strokeStyle = "rgba(24,29,34,0.8)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let y = top + 8; y < GROUND; y += 8) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
    }
    ctx.stroke();
    // porch roof and posts on the left
    ctx.fillStyle = "#08090b";
    ctx.beginPath();
    ctx.moveTo(x + 120, top + 18);
    ctx.lineTo(x - 70, top + 34);
    ctx.lineTo(x - 70, top + 40);
    ctx.lineTo(x + 120, top + 26);
    ctx.fill();
    ctx.fillRect(x - 66, top + 38, 4, GROUND - top - 38);
    ctx.fillRect(x + 2, top + 30, 4, GROUND - top - 30);
    ctx.fillRect(x - 74, GROUND - 6, 200, 6); // porch boards
    // door: warm interior when open
    const dx = HOUSE.door - 13;
    const dTop = GROUND - 66;
    const open = this.doorOpen;
    const f = this.porchFlicker;
    ctx.fillStyle = `rgba(255,${170 + open * 30},${100 + open * 30},${(0.18 + open * 0.8) * f})`;
    ctx.fillRect(dx, dTop, 26, 60);
    ctx.fillStyle = "#0a0b0d";
    ctx.fillRect(dx + 26 * open, dTop, 26 * (1 - open) + 0.5, 60);
    // v15 menu: someone stands in the open doorway, backlit, watching the sky
    if (this.menuFigure > 0.05 && open > 0.4) {
      ctx.fillStyle = `rgba(6,5,4,${0.95 * this.menuFigure})`;
      const fx = dx + 13;
      ctx.beginPath(); ctx.arc(fx, dTop + 11, 4.2, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx - 6, dTop + 17); ctx.lineTo(fx + 6, dTop + 17); ctx.lineTo(fx + 5, dTop + 38);
      ctx.lineTo(fx + 4, dTop + 60); ctx.lineTo(fx + 1, dTop + 60); ctx.lineTo(fx, dTop + 40);
      ctx.lineTo(fx - 1, dTop + 60); ctx.lineTo(fx - 4, dTop + 60); ctx.lineTo(fx - 5, dTop + 38);
      ctx.closePath(); ctx.fill();
    }
    // windows with blinds; one may hold a soft peeping silhouette
    const wins = [
      { wx: x + 255, wy: top + 40, a: 0.58 },
      { wx: x + 150, wy: top + 40, a: 0.14 },
    ];
    wins.forEach((W, i) => {
      const peek = i === this.blindsWin ? this.blinds : 0;
      const glow = W.a * f * (1 + peek * 0.35);
      // warm interior
      ctx.fillStyle = `rgba(255,176,100,${glow})`;
      ctx.fillRect(W.wx, W.wy, 28, 32);
      // soft figure behind the glass (only while peeking)
      if (peek > 0.05) {
        ctx.fillStyle = `rgba(8,6,4,${0.55 * peek})`;
        ctx.beginPath();
        ctx.ellipse(W.wx + 14, W.wy + 20, 7 * peek, 11 * peek, 0, 0, Math.PI * 2);
        ctx.fill();
        // head
        ctx.beginPath();
        ctx.arc(W.wx + 14, W.wy + 10, 4.2 * peek, 0, Math.PI * 2);
        ctx.fill();
      }
      // horizontal blinds — part slightly when peeking, then slam
      const gap = 2.2 + peek * 2.8;
      ctx.fillStyle = `rgba(6,7,9,${0.82 - peek * 0.35})`;
      for (let by = W.wy; by < W.wy + 32; by += gap) {
        ctx.fillRect(W.wx - 1, by, 30, Math.max(1.1, gap - 1.1 - peek * 0.6));
      }
      // frame
      ctx.strokeStyle = "rgba(12,14,16,0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(W.wx - 0.5, W.wy - 0.5, 29, 33);
      // mullion
      ctx.fillStyle = "#07080a";
      ctx.fillRect(W.wx + 13, W.wy, 2, 32);
    });
    // chimney breath of smoke
    ctx.fillStyle = `rgba(40,44,50,${0.25 + 0.15 * Math.sin(t * 0.7)})`;
    ctx.beginPath();
    ctx.ellipse(x + w - 59, top - 88 - (t % 5) * 3, 6 + (t % 3), 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Warm pockets of human light, drawn additively after the actors. */
  drawLights(ctx, s, camX, VW, t) {
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    ctx.globalCompositeOperation = "lighter";
    const f = this.porchFlicker;
    const lx = HOUSE.door - 34;
    const ly = GROUND - 74;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 190);
    g.addColorStop(0, `rgba(255,190,110,${0.5 * f})`);
    g.addColorStop(0.15, `rgba(255,150,70,${0.16 * f})`);
    g.addColorStop(1, "rgba(120,60,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(lx - 200, ly - 200, 400, 400);
    ctx.fillStyle = `rgba(255,214,160,${0.9 * f})`;
    ctx.fillRect(lx - 2, ly - 2, 4, 4);
    // door spill on the ground
    if (this.doorOpen > 0.02) {
      const a = this.doorOpen * 0.22 * f;
      ctx.fillStyle = `rgba(255,170,90,${a})`;
      ctx.beginPath();
      ctx.moveTo(HOUSE.door - 13, GROUND);
      ctx.lineTo(HOUSE.door + 13, GROUND);
      ctx.lineTo(HOUSE.door + 40, GROUND + 26);
      ctx.lineTo(HOUSE.door - 60, GROUND + 26);
      ctx.fill();
    }
    // window glow
    const wg = ctx.createRadialGradient(HOUSE.x + 268, GROUND - 57, 0, HOUSE.x + 268, GROUND - 57, 70);
    wg.addColorStop(0, `rgba(255,160,80,${0.12 * f})`);
    wg.addColorStop(1, "rgba(255,160,80,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(HOUSE.x + 190, GROUND - 130, 160, 150);
    ctx.globalCompositeOperation = "source-over";
  }

  /** How much warm light reaches a point (for lighting actors). */
  warmAt(x, y) {
    const d = Math.hypot(x - (HOUSE.door - 34), (y - (GROUND - 74)) * 1.3);
    return clamp(1 - d / 210, 0, 1) * this.porchFlicker;
  }

  /** Signed lean toward the creature for vegetation at world x. */
  pullAt(x, infl) {
    if (!infl || infl.s <= 0.01) return 0;
    const R = 180 + infl.s * 220;
    const d = x - infl.x;
    if (Math.abs(d) > R) return 0;
    const f = 1 - Math.abs(d) / R;
    return -Math.sign(d) * f * infl.s;
  }

  drawFieldGrass(ctx, s, camX, VW, t, wind, infl) {
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const L = camX - 40;
    const R = camX + VW + 40;
    const paths = [new Path2D(), new Path2D()];
    for (const b of this.field) {
      if (b.x < L || b.x > R) continue;
      const w = wind.sample(b.x, 0, 1);
      const pull = this.pullAt(b.x, infl);
      let bend = (w * 0.55 + 0.08 * Math.sin(t * 3.1 + b.ph)) * b.stiff + pull * 0.9;
      const lift = Math.abs(pull) * 0.35 * infl.s;
      bend *= 1 - lift;
      const h = b.h * (1 + lift * 0.6);
      blade(paths[b.shade < 0.72 ? 0 : 1], b.x, b.y, h, b.w, bend);
    }
    ctx.fillStyle = "#0f1316";
    ctx.fill(paths[0]);
    ctx.fillStyle = "#21272e";
    ctx.fill(paths[1]);
  }

  drawFog(ctx, s, camX, VW, t, wind, alpha) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const fw = this.fog.width;
    const layers = [
      { y: 488, h: 90, p: 0.6, sp: 9, a: 0.4 },
      { y: 520, h: 80, p: 1.0, sp: 16, a: 0.32 },
    ];
    for (const l of layers) {
      if (this.quality < 0 && l.p < 1) continue; // v17 Lite: one fog layer
      const off = -((camX * l.p + t * l.sp * (0.6 + wind.gust)) % (fw * 1.6));
      ctx.globalAlpha = l.a * alpha;
      for (let x = off; x < VW; x += fw * 1.6) ctx.drawImage(this.fog, x, l.y, fw * 1.6, l.h);
    }
    ctx.globalAlpha = 1;
  }

  /** v15: pre-rendered foreground grass strips (two layers), tileable, drawn upright; wind applies a skew per segment. */
  buildFrontStrips() {
    const TW = 480, R = 2; // tile width (world units), render scale for crisp blades
    const mk = (H, n, hMin, hMax, colDark, colLit, seed, litP) => {
      const c = makeCanvas(TW * R, H * R);
      const x = c.getContext("2d");
      x.scale(R, R);
      const r = rng(seed);
      const dark = new Path2D(), lit = new Path2D();
      for (let i = 0; i < n; i++) {
        const bx = r() * TW;
        const clump = 0.5 + 0.5 * Math.sin((bx / TW) * TAU * 3 + seed);
        const h = hMin + (hMax - hMin) * (0.35 + 0.65 * clump) * (0.6 + r() * 0.4);
        const w = 4 + r() * 6;
        const bend = 0.05 + r() * 0.25;
        for (const ox of [0, -TW, TW]) if (bx + ox > -60 && bx + ox < TW + 60) blade(r() < litP ? lit : dark, bx + ox, H + 6, h, w, bend, 0.5);
      }
      x.fillStyle = colLit; x.fill(lit);
      x.fillStyle = colDark; x.fill(dark);
      x.fillRect(0, H - 14, TW, 14);
      return { c, H, TW, R };
    };
    this.stripBack = mk(200, 260, 70, 190, "#07090b", "#1a1f25", 11, 0.18);
    this.stripFront = mk(240, 200, 90, 230, "#020304", "#14181d", 23, 0.1);
  }
  drawStrips(ctx, s, camX, VW, t, wind, infl, st, p, amp, lag, yOff) {
    if (!st) return;
    const SEG = this.quality < 0 ? 120 : 48; // divides the tile width (480); v17 Lite: 4x fewer slices
    const off = camX * p;
    const X0 = -(((off % SEG) + SEG) % SEG) - SEG;
    const H = st.H;
    const base = VH + yOff;
    for (let X = X0; X < VW + SEG; X += SEG) {
      const wxp = X + off;
      const sx = (((wxp % st.TW) + st.TW) % st.TW);
      const wx = wxp / p;
      const w = wind.sample(wx, lag, 1);
      const pull = this.pullAt(wx, infl) * 0.5;
      const k = clamp((0.18 + w * 0.75 + 0.1 * Math.sin(t * 2.4 + wx * 0.012 + lag * 3)) * amp + pull, -0.5, 0.95);
      // x' = X + k * (base - y): blades rooted at base, tips whipped sideways
      ctx.setTransform(s, 0, -k * s, s, s * (X + k * base), 0);
      ctx.drawImage(st.c, sx * st.R, 0, SEG * st.R + 1, H * st.R, 0, base - H, SEG + 0.6, H);
    }
  }

  drawFrontGrass(ctx, s, camX, VW, t, wind, infl) {
    if (this.quality < 2) return this.drawFrontGrassStrips(ctx, s, camX, VW, t, wind, infl);
    const p = 1.28;
    ctx.setTransform(s, 0, 0, s, -camX * p * s, 0);
    const L = camX * p - 60;
    const R = L + VW + 120;
    const dark = new Path2D();
    const lit = new Path2D();
    const i0 = Math.max(0, Math.floor((L + 100) / (this.frontStep * 1.0)) - 40);
    for (let i = i0; i < this.front.length; i++) {
      const b = this.front[i];
      if (b.x < L) continue;
      if (b.x > R) break;
      const wx = b.x / p;
      const w = wind.sample(wx, -0.15, 1);
      const pull = this.pullAt(wx, infl) * 0.6;
      const bend = (0.25 + w * 0.8 + 0.07 * Math.sin(t * 2.2 + b.ph)) * b.stiff + pull;
      blade(b.lit ? lit : dark, b.x, b.y, b.h, b.w, bend, 0.55);
    }
    // a dense dark mass at the roots so the blades read as one heavy field
    ctx.fillStyle = "#030405";
    ctx.beginPath();
    ctx.moveTo(L, VH);
    for (let x = L; x <= R; x += 30) ctx.lineTo(x, VH - 52 - 26 * noise1(x * 0.01 + 2) - 8 * Math.sin(x * 0.05 + t * 1.5));
    ctx.lineTo(R, VH);
    ctx.fill();
    ctx.fillStyle = "#171b20";
    ctx.fill(lit);
    ctx.fillStyle = "#040506";
    ctx.fill(dark);
    // soft darkening at the very bottom so the controls sit on black
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const g = ctx.createLinearGradient(0, VH - 120, 0, VH);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(0, VH - 120, VW, 120);
  }
}

Scene.prototype.drawFrontGrassStrips = function (ctx, s, camX, VW, t, wind, infl) {
  if (!this.stripFront) this.buildFrontStrips();
  if (this.quality >= 0) this.drawStrips(ctx, s, camX, VW, t, wind, infl, this.stripBack, 1.12, 0.8, -0.05, -4); // v17 Lite: front layer only
  this.drawStrips(ctx, s, camX, VW, t, wind, infl, this.stripFront, 1.28, 1.0, -0.15, 12);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const g = ctx.createLinearGradient(0, VH - 120, 0, VH);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, VH - 120, VW, 120);
};

/** One tapered, curving blade added to a path. bend ~ radians of lean (positive = right). */
function blade(path, x, y, h, w, bend, droop = 0) {
  bend = clamp(bend, -1.35, 1.35);
  // long, heavy blades curl over at the tip
  const tipA = clamp(bend * (1 + droop), -1.9, 1.9);
  const sb = Math.sin(tipA) * (1 - droop * 0.25) + Math.sin(bend) * droop * 0.25;
  const cb = Math.cos(tipA);
  const tx = x + sb * h;
  const ty = y - cb * h * (1 - Math.abs(sb) * 0.12);
  const hb = bend * 0.45;
  const cx = x + Math.sin(hb) * h * 0.55;
  const cy = y - Math.cos(hb) * h * 0.55;
  path.moveTo(x - w * 0.5, y);
  path.quadraticCurveTo(cx - w * 0.25, cy, tx, ty);
  path.quadraticCurveTo(cx + w * 0.25, cy, x + w * 0.5, y);
}

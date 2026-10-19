// Level 10: Coast at Dawn (Game King, sandbox-gk-l10). The last night. The army has the coast road, the camp and
// the last paddock; the sea bank cloud past the shoreline is the way out. Dawn slowly brightens: cloud cover thins
// (thick cores still hide you) and soldiers see further. Same rules as Area 51: no combat, hide / feed / burst / EMP,
// and every searchlight catch has the ~1.5 s hesitation (1.2 s feeding low) before it locks.
// At the shoreline the Energy check decides the ending: enough = escape to space, too little = captured.
import { VH, GROUND, COAST, COAST_CLOUDS, EMP } from "./config.js?v=27";
import { clamp, lerp, makeCanvas, rng, smoothstep, TAU } from "./util.js?v=27";
import { Area51 } from "./a51.js?v=27";
import { audio } from "./audio.js?v=27";

export class Coast extends Area51 {
  constructor(game) {
    // per-instance config: soldier sight range grows with the dawn
    const C = Object.create(COAST);
    super(game, C, COAST_CLOUDS);
    const self = this;
    Object.defineProperty(C, "soldierSee", { get: () => COAST.soldierSeeBase * (1 + COAST.dawnSee * (self.dawn || 0)) });
    // dawn thins the cover: every density read (hiding, beams in cloud) sees less cloud as the light comes up
    const dens = this.clouds.density.bind(this.clouds);
    this.clouds.density = (x, y) => dens(x, y) * (1 - COAST.dawnThin * (this.dawn || 0));
  }

  build() {
    super.build();
    const r = rng(1010);
    this.dunes = [];
    for (let i = 0; i < 70; i++) this.dunes.push({ x: r() * COAST.fence, w: 120 + r() * 260, h: 8 + r() * 22 });
    this.tents = [1250, 1420, 2050, 3700, 3880, 4250];
    this.grass = [];
    for (let i = 0; i < 260; i++) this.grass.push({ x: r() * COAST.fence, h: 10 + r() * 26, p: r() * TAU });
  }

  /** v20 carry rule: arriving via Next from level 9 starts with that run's saved Energy, minus the night's
   *  crossing cost (COAST.carryCost), kept within carryMin..carryMax so the shore still needs at least one feed.
   *  Opened directly from the Levels menu (or nothing saved): COAST.energyStart. */
  startEnergy() {
    let e = COAST.energyStart;
    if (this.g.carryFrom === 9) {
      let v = NaN;
      try { v = parseFloat(localStorage.getItem("nh-energy-l9")); } catch { /* private mode */ }
      if (isFinite(v)) e = Math.min(COAST.carryMax, Math.max(COAST.carryMin, v / 100 - COAST.carryCost));
    }
    this.carried = e;
    return e;
  }

  reset(cp = this.checkpoint) {
    // there is no hangar: a fresh start is already "out" at the start cloud
    super.reset(cp === 0 ? 1 : cp);
    this.checkpoint = cp;
    if (cp !== 2) this.energy = this.startEnergy(); // v20: Energy carried over from level 9
    this.dawn = 0;
    this.ending = null;
    this.endFx = false;
    this.sirenDone = false;
    this.heliDone = false;
    this.alert = 1;
    this.trucks.forEach((tr, i) => {
      tr.x = -260 - i * 300;
      tr.stopX = COAST.truckStops[i];
      tr.start();
    });
    if (cp === 2) this.dawn = 0.35; // the paddock checkpoint keeps some of the light
    this.dawnT = this.dawn * COAST.dawnTime;
    audio.setMusic(null); // level 10 uses its own music bed
    this.g.warmOnce(10);
    this.setHint();
  }

  setHint() {
    const touch = this.g.touchy ? this.g.touchy() : true;
    const c = this.g.creature;
    let h;
    if (!this.harvested && c.x > COAST.fence - 60) h = "Not yet  ·  feed in the paddock first";
    else if (!this.harvested) h = touch ? "Dawn is coming  ·  feed in the paddock  ·  hold FEED" : "Dawn is coming  ·  feed in the paddock  ·  hold SPACE";
    else if (this.energy < COAST.escapeEnergy) h = "Not enough Energy to reach space  ·  feed again";
    else h = "Enough Energy  ·  cross the shoreline into the sea cloud";
    this.hint = h;
  }

  update(dt, input) {
    const g = this.g;
    if (g.mode === "play") {
      this.dawnT += dt;
      this.dawn = smoothstep(0, COAST.dawnTime, this.dawnT);
    }
    this.musicHold = -1e9; // never let the Area 51 music logic run here
    if (this.ending) return this.updateEnding(dt);
    super.update(dt, input);
    const play = g.mode === "play";
    if (audio.ctx && audio.amb) {
      audio.bed("l10CoastAmb", play || g.mode === "fail" ? 0.6 : 0, audio.amb);
      audio.bed("l10CoastMusic", play ? 0.7 : 0, audio.music);
    }
    if (play && !this.sirenDone && this.trucks[0].x > 900) {
      this.sirenDone = true;
      audio.fx("l10StingSirensShore", { gain: 0.9 });
    }
    if (play && !this.heliDone && this.dawn > 0.5) {
      this.heliDone = true;
      audio.fx("l10StingHeliOver", { gain: 0.9 });
      g.onEvent("l10-heli");
    }
  }

  /** Shoreline reached and hidden: the Energy check. */
  win() {
    const g = this.g;
    this.ending = this.energy >= COAST.escapeEnergy ? "space" : "captured";
    g.mode = "win";
    this.endT = 0;
    audio.releaseDuck(0.6);
    audio.setMusic(null);
    if (audio.ctx && audio.amb) {
      audio.bed("l10CoastMusic", 0, audio.music);
      audio.bed("l10CoastAmb", this.ending === "space" ? 0.25 : 0, audio.amb);
    }
    audio.fx(this.ending === "space" ? "endingEscapeSpace" : "endingCaptureSlam", { gain: 1 });
    audio.dlog("l10:ending " + this.ending);
    if (this.ending === "captured") for (const L of this.allLights()) (L.state = "lock"), (L.dark = 0);
    try {
      localStorage.setItem("nh-ending", this.ending);
    } catch {
      /* private mode */
    }
    g.onEvent("win");
    g.onEvent("ending-" + this.ending);
  }

  /** 5-10 s ending scene, then main.js shows the end card (3.2 s after "win"). */
  updateEnding(dt) {
    const g = this.g;
    const c = g.creature;
    this.t += dt;
    g.gt += dt;
    this.endT += dt;
    g.wind.update(dt);
    this.clouds.update(dt);
    c.setInput(0, 0);
    c.feeding = false;
    if (this.ending === "space") {
      // a heartbeat's pause, then straight up through the bank and out
      const k = smoothstep(0.8, 6, this.endT);
      c.bounds = null;
      c.y -= dt * lerp(0, 520, k);
      c.vx *= 0.95;
    } else {
      // every beam swings onto the craft; it sinks toward the water
      for (const L of this.allLights()) {
        const want = Math.atan2(c.y - L.y, c.x - L.x);
        L.ang += clamp(want - L.ang, -dt * 1.5, dt * 1.5);
        L.state = "lock";
      }
      c.y = Math.min(GROUND - 70, c.y + dt * 40 * smoothstep(1, 3, this.endT));
      this.capture = Math.min(1, this.capture + dt * 0.6);
    }
    c.update(dt);
    for (const tr of this.trucks) tr.update(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    g.flash *= 0.95;
    g.camX = this.camX;
  }

  // ---------------------------------------------------------------- art: dawn over the sea
  drawSky(ctx, s, camX, VW, t) {
    super.drawSky(ctx, s, camX, VW, t);
    const d = this.dawn || 0;
    // the light comes from the sea (right): a cold grey lift with one thin warm band low on the horizon
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, `rgba(70,82,98,${0.05 + d * 0.3})`);
    g.addColorStop(0.7, `rgba(110,120,134,${0.08 + d * 0.38})`);
    g.addColorStop(1, `rgba(170,140,110,${0.04 + d * 0.3})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, GROUND);
    const sunX = VW * 0.85 + (COAST.W - camX) * 0.02;
    const sg = ctx.createRadialGradient(sunX, GROUND - 40, 0, sunX, GROUND - 40, 520);
    sg.addColorStop(0, `rgba(230,170,110,${d * 0.35})`);
    sg.addColorStop(1, "rgba(230,170,110,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, VW, GROUND);
  }

  drawGround(ctx, s, camX, VW, t) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.floor, 0, GROUND - 2, VW, VH - GROUND + 2);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const L = camX - 60;
    const R = camX + VW + 60;
    const d = this.dawn || 0;
    // the sea past the shoreline: dark swell, a faint dawn sheen
    const sx = Math.max(L, COAST.fence);
    if (R > sx) {
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(sx, GROUND + 6, R - sx, VH - GROUND);
      ctx.fillStyle = `rgba(150,160,170,${0.08 + d * 0.22})`;
      for (let x = Math.floor(sx / 60) * 60; x < R; x += 60) {
        const y = GROUND + 14 + ((x * 7) % 40) + Math.sin(t * 1.2 + x * 0.03) * 2;
        ctx.fillRect(x, y, 30, 1.5);
      }
      // cliff edge
      ctx.fillStyle = "#060708";
      ctx.beginPath();
      ctx.moveTo(COAST.fence - 40, GROUND + 2);
      ctx.lineTo(COAST.fence + 20, GROUND + 2);
      ctx.lineTo(COAST.fence + 60, VH);
      ctx.lineTo(COAST.fence - 40, VH);
      ctx.fill();
    }
    // dunes and long coastal grass whipping in the wind
    ctx.fillStyle = "#08090b";
    for (const b of this.dunes) {
      if (b.x + b.w < L || b.x > R || b.x > COAST.fence - 40) continue;
      ctx.beginPath();
      ctx.ellipse(b.x, GROUND + 4, b.w * 0.5, b.h, 0, Math.PI, TAU);
      ctx.fill();
    }
    const w = this.g.wind && this.g.wind.gust != null ? this.g.wind.gust : 0.5;
    ctx.strokeStyle = "#07080a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const gr of this.grass) {
      if (gr.x < L || gr.x > R) continue;
      const bend = 6 + 8 * Math.sin(t * 2.4 + gr.p) * (0.4 + w);
      ctx.moveTo(gr.x, GROUND + 6);
      ctx.quadraticCurveTo(gr.x + bend * 0.4, GROUND + 6 - gr.h * 0.6, gr.x + bend, GROUND + 6 - gr.h);
    }
    ctx.stroke();
  }

  drawHangarBack() {}
  drawHangarFront() {}

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 300;
    const R = camX + VW + 300;
    // army tents
    ctx.fillStyle = "#08090b";
    for (const x of this.tents) {
      if (x < L || x > R) continue;
      ctx.beginPath();
      ctx.moveTo(x - 70, GROUND + 2);
      ctx.lineTo(x - 50, GROUND - 40);
      ctx.lineTo(x + 50, GROUND - 40);
      ctx.lineTo(x + 70, GROUND + 2);
      ctx.fill();
    }
    // power poles along the coast road
    ctx.strokeStyle = "#0a0b0d";
    ctx.lineWidth = 1;
    for (let x = 400; x < COAST.fence; x += 640) {
      if (x < L || x > R) continue;
      ctx.fillStyle = "#0a0b0d";
      ctx.fillRect(x - 2, GROUND - 150, 4, 152);
      ctx.fillRect(x - 18, GROUND - 142, 36, 3);
      ctx.beginPath();
      ctx.moveTo(x - 18, GROUND - 141);
      ctx.quadraticCurveTo(x + 302, GROUND - 120, x + 622, GROUND - 141);
      ctx.stroke();
    }
    // the last paddock: rails
    const p0 = COAST.pen.x0, p1 = COAST.pen.x1;
    if (p1 > L && p0 < R) {
      ctx.strokeStyle = "#0b0c0e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const y of [GROUND - 22, GROUND - 10]) {
        ctx.moveTo(p0, y);
        ctx.lineTo(p1, y);
      }
      for (let x = p0; x <= p1; x += 50) {
        ctx.moveTo(x, GROUND + 2);
        ctx.lineTo(x, GROUND - 28);
      }
      ctx.stroke();
    }
    // a lighthouse on the point, dead (the army cut it)
    const lx = COAST.fence - 120;
    if (lx > L && lx < R) {
      ctx.fillStyle = "#090a0c";
      ctx.beginPath();
      ctx.moveTo(lx - 22, GROUND + 2);
      ctx.lineTo(lx - 12, GROUND - 210);
      ctx.lineTo(lx + 12, GROUND - 210);
      ctx.lineTo(lx + 22, GROUND + 2);
      ctx.fill();
      ctx.fillRect(lx - 18, GROUND - 236, 36, 26);
    }
    // searchlight towers (same lattice as Area 51)
    for (const T of this.lights) {
      if (T.x < L || T.x > R) continue;
      const h = GROUND - T.y;
      ctx.strokeStyle = "#0b0c0e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(T.x - 24, GROUND + 2);
      ctx.lineTo(T.x - 9, T.y + 10);
      ctx.moveTo(T.x + 24, GROUND + 2);
      ctx.lineTo(T.x + 9, T.y + 10);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const y1 = GROUND - (h * (k + 1)) / 6;
        const w1 = lerp(24, 9, (k + 1) / 6);
        ctx.moveTo(T.x - w1, y1);
        ctx.lineTo(T.x + w1, y1);
      }
      ctx.stroke();
      ctx.fillStyle = "#0b0c0e";
      ctx.fillRect(T.x - 20, T.y + 6, 40, 6);
      ctx.save();
      ctx.translate(T.x, T.y);
      ctx.rotate(T.ang);
      ctx.fillRect(-8, -9, 22, 18);
      ctx.restore();
    }
  }

  drawGlows(ctx, t, camX, VW) {
    // only a few warm lights: tent lamps (EMP kills them)
    const L = camX - 200;
    const R = camX + VW + 200;
    ctx.globalCompositeOperation = "lighter";
    for (const x of this.tents) {
      if (x < L || x > R || this.empDark(x, GROUND - 30)) continue;
      ctx.globalAlpha = 0.5 * (1 - (this.dawn || 0) * 0.5);
      ctx.drawImage(this.glowS, x - 90, GROUND - 70, 180, 90);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  render() {
    super.render();
    const g = this.g;
    if (!this.ending) return;
    const ctx = g.ctx;
    ctx.setTransform(g.s, 0, 0, g.s, 0, 0);
    const VW = g.VW;
    if (this.ending === "space") {
      ctx.fillStyle = `rgba(0,0,0,${smoothstep(5, 8, this.endT)})`;
      ctx.fillRect(0, 0, VW, VH);
    } else {
      ctx.fillStyle = `rgba(150,160,180,${smoothstep(2.5, 3.2, this.endT) * (1 - smoothstep(3.2, 3.6, this.endT)) * 0.6})`;
      ctx.fillRect(0, 0, VW, VH);
      if (this.endT > 3.4) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, VW, VH);
      }
    }
  }
}

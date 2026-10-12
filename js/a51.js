// Level 1: Area 51 Escape. You wake starving, held in a gantry inside Hangar 18. Break the cables, force the
// hangar door, slip between the searchlights, take one risky feed in the test-animal pen, and get past the
// perimeter fence into the dark. No combat: hide, feed, flee.
//
// Searchlight fairness (Game King / Gamer Girl): the ballast hum swells as a beam swings near you; a beam that
// touches you HESITATES (everything goes quiet, ~1.5 s, about 1.2 s if you're low and feeding) before it can lock.
// Leave the cone or reach thick cloud in that window and it loses you. Only a locked beam builds exposure.
import { VH, GROUND, TUNE, A51, A51_CLOUDS, EMP } from "./config.js?v=21";
import { clamp, damp, lerp, makeCanvas, noise1, rng, smoothstep, TAU } from "./util.js?v=21";
import { CloudField, cloudSprites } from "./clouds.js?v=21";
import { Cow } from "./actors.js?v=21";
import { audio } from "./audio.js?v=21";

const HIDE = 0.62; // cloud density that hides you from a beam
const wrapA = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

function glowSprite(r, g, b) {
  const c = makeCanvas(128, 128);
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.18, `rgba(${r},${g},${b},0.55)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},0.14)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return c;
}

/** People: scientists in the hangar (pale coats), the pen guard (dark, torch). Silhouettes that walk, look up, run. */
// v20: levels 5-8 reuse Area51 but have no base: no hangar/base ambience under them (convoy + coast keep it)
const NO_BASE_AMB = new Set(["town", "rodeo", "suburb", "power"]);
export class Figure {
  constructor(x, kind, dir = 1) {
    this.x0 = x;
    this.kind = kind;
    this.dir0 = dir;
    this.reset();
  }
  reset() {
    this.x = this.x0;
    this.dir = this.dir0;
    this.state = "idle"; // idle | look | run | gone
    this.t = Math.random() * 5;
    this.v = 0;
    this.lookUp = 0;
    this.step = 0;
    this.point = 0; // v13 soldiers: 0..1 arm raised toward the craft
    this.pointWant = 0;
    this.pointAng = -1.2;
    this.seeT = 0;
    this.radioed = false;
    this.cool = 0;
  }
  flee(dir) {
    if (this.state === "run" || this.state === "gone") return false;
    this.state = "run";
    this.dir = dir;
    return true;
  }
  update(dt, x0, x1) {
    this.t += dt;
    if (this.state === "run") {
      this.v = damp(this.v, 150, 3, dt);
      this.x += this.v * this.dir * dt;
      this.step += dt * 9;
      if (this.x < x0 || this.x > x1) this.state = "gone";
    } else {
      this.v = 0;
      this.step = damp(this.step, Math.round(this.step / Math.PI) * Math.PI, 4, dt);
    }
    this.lookUp = damp(this.lookUp, this.state === "look" || this.state === "run" ? 1 : 0, 3, dt);
    this.point = damp(this.point, this.pointWant, this.pointWant ? 5 : 2, dt);
  }
  draw(ctx, rim) {
    if (this.state === "gone") return;
    const y = GROUND + 4;
    const run = this.state === "run";
    const coat = this.kind === "sci";
    ctx.save();
    ctx.translate(this.x, y);
    ctx.scale(this.dir, 1);
    const soldier = this.kind === "soldier";
    ctx.fillStyle = coat ? "#2a2e33" : soldier ? "#262b22" : "#08090b"; // v13 soldiers: olive, readable against the huts
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineCap = "round";
    const s1 = Math.sin(this.step);
    const lean = run ? 0.22 : 0;
    ctx.lineWidth = 4.2;
    for (const k of [1, -1]) {
      const sw = run ? s1 * k * 12 : 0;
      ctx.beginPath();
      ctx.moveTo(0, -27);
      ctx.lineTo(sw * 0.6 + 1, -13 + (run ? Math.abs(sw) * 0.15 : 0));
      ctx.lineTo(sw, 0);
      ctx.stroke();
    }
    ctx.rotate(lean);
    ctx.beginPath();
    ctx.moveTo(-6, -50);
    ctx.lineTo(6, -50);
    ctx.lineTo(coat ? 9 : 6, coat ? -20 : -26);
    ctx.lineTo(coat ? -9 : -6, coat ? -20 : -26);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3.4;
    for (const k of [1, -1]) {
      if (k === 1 && this.point > 0.05) {
        // v13: the arm swings up and points along pointAng (already in the figure's facing frame)
        const a = lerp(1.35, this.pointAng, this.point);
        ctx.beginPath();
        ctx.moveTo(0, -47);
        ctx.lineTo(Math.cos(a) * 21, -47 + Math.sin(a) * 21);
        ctx.stroke();
        continue;
      }
      const sw = run ? -s1 * k * 14 : (this.kind === "guard" || soldier) && k === 1 ? 10 : 2;
      ctx.beginPath();
      ctx.moveTo(0, -47);
      ctx.lineTo(sw * 0.7, -36);
      ctx.lineTo(sw, -27 - (run && k === 1 ? 8 : 0));
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(1, -54);
    ctx.rotate(-this.lookUp * (soldier ? 0.9 : 0.6));
    ctx.beginPath();
    ctx.arc(0, -2, 5, 0, TAU);
    ctx.fill();
    if (!coat) {
      ctx.beginPath();
      ctx.ellipse(0, -4.5, 7, 3.6, 0, Math.PI, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (rim > 0.02) {
      ctx.strokeStyle = coat ? `rgba(200,206,214,${0.5 * rim})` : `rgba(210,170,110,${0.35 * rim})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, -50);
      ctx.lineTo(coat ? -9 : -6, coat ? -20 : -26);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Army truck: rolls out after the first feed with a roof spotlight; parks as a roadblock near the fence. */
class Truck {
  constructor(i) {
    this.i = i;
    this.reset();
  }
  reset() {
    this.active = false;
    this.x = A51.hangar.x1 + 60;
    this.v = 0;
    this.stopX = this.i === 0 ? 5020 : 5400; // v13 bigger base: roadblock in front of the new fence
    this.delay = this.i * 2.2;
    this.passed = false;
    this.wheel = 0;
  }
  start() {
    this.active = true;
    this.delay = this.i * 2.2;
  }
  update(dt) {
    if (!this.active) return;
    if (this.delay > 0) return void (this.delay -= dt);
    const want = this.x < this.stopX - 260 ? 270 : clamp((this.stopX - this.x) * 1.1, 0, 270);
    this.v = damp(this.v, want, 1.4, dt);
    this.x += this.v * dt;
    this.wheel += (this.v * dt) / 11;
  }
  get roof() {
    return { x: this.x - 8, y: GROUND - 58 };
  }
  draw(ctx) {
    if (!this.active || this.delay > 0) return;
    const y = GROUND + 14;
    ctx.save();
    ctx.translate(this.x, y);
    ctx.fillStyle = "#07080a";
    ctx.beginPath();
    ctx.moveTo(-74, -18);
    ctx.lineTo(-74, -50);
    ctx.quadraticCurveTo(-74, -58, -64, -58);
    ctx.lineTo(4, -58);
    ctx.quadraticCurveTo(12, -58, 12, -50);
    ctx.lineTo(12, -18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -18);
    ctx.lineTo(14, -46);
    ctx.lineTo(40, -46);
    ctx.lineTo(52, -30);
    ctx.lineTo(60, -28);
    ctx.lineTo(60, -18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(70,84,96,0.45)";
    ctx.beginPath();
    ctx.moveTo(30, -43);
    ctx.lineTo(39, -43);
    ctx.lineTo(48, -31);
    ctx.lineTo(30, -31);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#050607";
    ctx.fillRect(-76, -20, 138, 8);
    for (const wx of [-56, -34, 40]) {
      ctx.beginPath();
      ctx.arc(wx, -8, 10, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,64,70,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(this.wheel) * 6, -8 + Math.sin(this.wheel) * 6);
      ctx.lineTo(wx - Math.cos(this.wheel) * 6, -8 - Math.sin(this.wheel) * 6);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(40,44,40,0.8)";
    ctx.lineWidth = 1;
    for (let k = -60; k < 8; k += 16) {
      ctx.beginPath();
      ctx.moveTo(k, -57);
      ctx.lineTo(k, -20);
      ctx.stroke();
    }
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(-14, -66, 12, 8);
    ctx.restore();
  }
  drawLights(ctx, glow) {
    if (!this.active || this.delay > 0) return;
    const hx = this.x + 60;
    const hy = GROUND - 8;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(hx, hy, hx + 420, hy);
    g.addColorStop(0, "rgba(255,236,200,0.32)");
    g.addColorStop(1, "rgba(255,236,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 3);
    ctx.lineTo(hx + 420, hy - 40);
    ctx.lineTo(hx + 420, hy + 28);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glow, hx - 18, hy - 18, 36, 36);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.redGlow || glow, this.x - 84, GROUND - 12, 16, 16);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

export class Area51 {
  constructor(game, C = A51, CL = A51_CLOUDS) {
    this.g = game;
    this.C = C; // level config (Town / Rodeo / Suburb / Power / Convoy / Coast reuse this class with their own)
    this.clouds = new CloudField(CL, game.quality, { period: 170, regrow: 0.2 });
    this.cows = this.C.cows.map((x, i) => {
      const c = new Cow();
      c.homeX = x;
      c.flip = i % 2 ? 1 : -1;
      return c;
    });
    this.scientists = [new Figure(470, "sci", 1), new Figure(820, "sci", -1), new Figure(905, "sci", -1)];
    this.guard = new Figure(this.C.guard.x, "guard", -1);
    this.soldiers = this.C.soldiers.map((S) => new Figure(S.x, "soldier", S.dir));
    this.active = []; // v13: reused list of live lights (no per-frame array allocation)
    this.lastKnown = { x: 0, y: 0 };
    this.trucks = [new Truck(0), new Truck(1)];
    this.lights = this.C.towers.map((T, i) => ({ ...T, i, kind: "tower" }));
    this.truckLights = this.trucks.map((tr, i) => ({ x: 0, y: 0, c: -1.2, r: 0.55, sp: 0.5, ph: i * 2, i: 10 + i, kind: "truck", truck: tr }));
    this.glowW = glowSprite(235, 240, 255);
    this.glowS = glowSprite(255, 160, 70); // sodium
    this.glowR = glowSprite(255, 40, 30);
    this.glowT = glowSprite(120, 230, 210); // tower cab
    this.glowB = glowSprite(90, 140, 255); // runway edge
    for (const tr of this.trucks) tr.redGlow = this.glowR;
    this.build();
    this.checkpoint = 0;
    this.particles = [];
    this.hint = "";
    this.drawLights = [];
    this.reset(0);
  }

  // ---------------------------------------------------------------- static art
  build() {
    const r = rng(51);
    this.sky = makeCanvas(4, VH);
    {
      const x = this.sky.getContext("2d");
      const g = x.createLinearGradient(0, 0, 0, VH);
      g.addColorStop(0, "#030407");
      g.addColorStop(0.3, "#080b12");
      g.addColorStop(0.55, "#121722");
      g.addColorStop(0.68, "#1f2129");
      g.addColorStop(0.74, "#2c2622");
      g.addColorStop(0.78, "#1a1716");
      g.addColorStop(1, "#070707");
      x.fillStyle = g;
      x.fillRect(0, 0, 4, VH);
    }
    this.stars = makeCanvas(2000, 420);
    {
      const x = this.stars.getContext("2d");
      for (let i = 0; i < 520; i++) {
        const sx = r() * 2000;
        const sy = Math.pow(r(), 1.5) * 400;
        const b = r();
        x.fillStyle = `rgba(${200 + b * 40},${205 + b * 40},${220 + b * 30},${0.15 + b * b * 0.7})`;
        x.fillRect(sx, sy, b > 0.93 ? 2 : 1, b > 0.93 ? 2 : 1);
      }
      const g = x.createLinearGradient(0, 0, 2000, 420);
      g.addColorStop(0.3, "rgba(120,130,160,0)");
      g.addColorStop(0.45, "rgba(120,130,160,0.05)");
      g.addColorStop(0.6, "rgba(120,130,160,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 2000, 420);
    }
    const ridge = (w, h, base, amp, f1, f2, col, edge, seed) => {
      const c = makeCanvas(w, h);
      const x = c.getContext("2d");
      const pts = [];
      for (let i = 0; i <= w; i += 6) {
        const n = noise1(i * f1 + seed) * 0.7 + noise1(i * f2 + seed * 3) * 0.3;
        pts.push([i, base - Math.max(6, amp * (0.45 + n * 0.55) + Math.abs(noise1(i * f2 * 3.1 + seed)) * amp * 0.18)]);
      }
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, h);
      for (const [px, py] of pts) x.lineTo(px, py);
      x.lineTo(w, h);
      x.fill();
      if (edge) {
        x.strokeStyle = edge;
        x.lineWidth = 1.2;
        x.beginPath();
        pts.forEach(([px, py], i) => (i ? x.lineTo(px, py + 1) : x.moveTo(px, py + 1)));
        x.stroke();
      }
      return c;
    };
    this.farW = Math.ceil(this.C.W * 0.12 + 2400);
    this.far = ridge(this.farW, 220, 200, 120, 0.0016, 0.007, "#141821", "rgba(120,132,152,0.22)", 3);
    {
      const x = this.far.getContext("2d");
      for (let i = 0; i < 70; i++) {
        const px = r() * this.farW;
        x.fillStyle = r() < 0.2 ? "rgba(255,80,60,0.8)" : "rgba(255,190,120,0.65)";
        x.fillRect(px, 196 + r() * 18, 1.5, 1.5);
      }
    }
    this.nearW = Math.ceil(this.C.W * 0.32 + 2400);
    this.ridgeNear = ridge(this.nearW, 160, 150, 52, 0.0035, 0.013, "#0c0e12", "rgba(90,98,112,0.18)", 11);
    this.floor = makeCanvas(4, 180);
    {
      const x = this.floor.getContext("2d");
      const g = x.createLinearGradient(0, 0, 0, 180);
      g.addColorStop(0, "#1a1714");
      g.addColorStop(0.15, "#100f0e");
      g.addColorStop(1, "#050505");
      x.fillStyle = g;
      x.fillRect(0, 0, 4, 180);
    }
    this.scrub = [];
    for (let i = 0; i < 160; i++) this.scrub.push({ x: r() * this.C.W, s: 0.5 + r() * 1.2, y: r() * 26 });
  }

  // ---------------------------------------------------------------- state
  /** cp 0 = hangar start, 1 = after the breakout (first cloud), 2 = after the first feed (cloud above the pen). */
  reset(cp = this.checkpoint) {
    this.checkpoint = cp;
    const g = this.g;
    const c = g.creature;
    this.clouds.reset();
    const start = cp === 0 ? this.C.start : cp === 1 ? this.C.checkpoint0 : this.C.checkpoint1;
    c.reset(start.x, start.y);
    this.t = 0;
    this.phase = cp === 0 ? "held" : "out"; // held -> free (in the hangar) -> out
    this.introT = 0;
    this.strain = 0;
    this.creaked = false;
    this.doorStrain = 0;
    this.doorOpen = cp === 0 ? 0 : 1;
    this.doorT = -1;
    this.exited = cp > 0;
    this.cableSnap = cp === 0 ? 0 : 1;
    this.facade = cp === 0 ? 0 : 1;
    if (cp === 0) this.cpEnergy2 = null;
    this.energy = cp === 2 ? (this.cpEnergy2 != null ? this.cpEnergy2 : 0.5) : this.C.energyStart;
    this.energyShown = this.energy;
    this.barVisible = cp > 0;
    this.energyPending = 0;
    // Low-Energy warn only after Energy has been above 20% once (Gamer Girl / Game King).
    this.energyWarnReady = this.energy >= 0.2;
    this.harvests = cp === 2 ? 1 : 0;
    this.harvested = cp === 2;
    for (let i = 0; i < this.cows.length; i++) {
      const cw = this.cows[i];
      cw.reset();
      cw.x = cw.homeX;
      cw.progress = 0;
      cw.maxP = 0;
      cw.vy = 0;
      cw.gone = cp === 2 && i === 0;
    }
    for (const s of this.scientists) s.reset();
    if (cp > 0) for (const s of this.scientists) s.state = "gone";
    this.guard.reset();
    this.guardT = 0;
    this.guardRunT = 0;
    if (cp === 2) this.guard.state = "gone";
    for (const s of this.soldiers) s.reset();
    this.emp = null; // v13 EMP blackout zone {x, y, t}
    for (const tr of this.trucks) tr.reset();
    if (cp === 2) this.trucks.forEach((tr) => tr.start());
    for (const L of [...this.lights, ...this.truckLights]) {
      L.phase = L.ph;
      L.ang = L.c + L.r * Math.sin(L.phase);
      L.state = "sweep";
      L.brushT = 0;
      L.outT = 0;
      L.cool = 0;
      L.alertT = 0;
      L.pause = 4 + Math.random() * 10;
      L.paused = 0;
      L.inBeam = false;
      L.passCool = 0;
      L.heat = 0;
      L.searchT = 0;
      L.penHunt = 0;
      L.dip = 0;
      L.dark = 0;
    }
    this.penHeat = 0;
    this.penNear = 0;
    this.penNoticed = false;
    this.alert = cp === 0 ? 0 : cp === 1 ? 1 : 2; // 0 asleep, 1 alarm (breakout), 2 hunt (after the feed)
    this.alarmNext = cp === 0 ? 1e9 : 3;
    this.exposure = 0;
    this.failWarned = false;
    this.lockedAny = false;
    this.lockHits = false;
    this.brushAny = false;
    this.brushProg = 0;
    this.hiddenT = 0;
    this.occ = 0;
    this.near = 0;
    this.hum = 0;
    this.winT = 0;
    this.endT = 0;
    this.lastKnown = null;
    this.fluor = cp === 0 ? 0 : 1;
    this.fluorFlick = 0;
    this.redSpin = 0;
    this.particles.length = 0;
    this.capture = 0;
    this.feedShock = false;
    this.distressed = false;
    this.weakWarned = false;
    this.feedHeard = false;
    this.nudged = false;
    this.camX = cp === 0 ? 0 : clamp(start.x - g.VW * 0.5, 0, this.C.W - g.VW);
    this.frameX = null;
    this.idleT = 0;
    this.applyBounds();
    clearTimeout(this.screamTimer);
    audio.stopAll();
    if (this.C === A51) g.warmOnce(1); // v20: level 1 pack (mods warm their own level once in their reset)
    audio.warmA51();
    audio.setMusic(cp === 0 ? null : cp === 1 ? "calm" : "dread");
    this.musicHold = 0;
    this.setHint();
  }

  applyBounds() {
    const c = this.g.creature;
    const H = this.C.hangar;
    if (this.phase === "held") c.bounds = { x0: this.C.start.x - 14, x1: this.C.start.x + 14, y0: this.C.start.y - 10, y1: this.C.start.y + 8 };
    else if (this.phase === "free") c.bounds = { x0: H.x0 + 160, x1: this.doorOpen > 0.55 ? this.C.W - 160 : H.x1 - 150, y0: H.roof + 48, y1: GROUND - 120 };
    else c.bounds = { x0: 160, x1: this.C.W - 160, y0: 70, y1: GROUND - 120 };
  }

  setHint() {
    const touch = this.g.touchy ? this.g.touchy() : true;
    let h = "";
    if (this.phase === "held") h = touch ? "Starving  ·  push the stick to tear free" : "Starving  ·  push to tear free  ·  WASD / arrows";
    else if (this.phase === "free") h = touch ? "The door  ·  push into it, or BURST through" : "The door  ·  push into it, or SHIFT to burst through";
    else if (!this.harvested && this.g.creature.x > this.C.fence - 60) h = "Go back  ·  you haven't fed  ·  the pen is behind you";
    else if (!this.harvested) h = touch ? "Feed in the pen  ·  hold FEED when the lights swing away" : "Feed in the pen  ·  hold SPACE when the lights swing away";
    else if (this.energy < this.C.energyMinExit) h = "Too weak to leave  ·  feed again";
    else h = "Get past the fence  ·  into the dark cloud";
    this.hint = h;
  }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    const g = this.g;
    const c = g.creature;
    const playing = g.mode === "play";
    this.t += dt;
    g.gt += dt;
    g.hintT = 0;
    g.wind.update(dt);
    this.clouds.update(dt);
    if (playing) this.controls(dt, input);
    if (this.phase === "out") this.setHint(); // "too weak to leave" / "go back, you haven't fed" follow the state
    if (!playing) {
      c.setInput(0, 0);
      c.feeding = false;
    }
    if (this.phase === "out") c.power = lerp(0.6, 1, smoothstep(0, 0.22, this.energy));
    else c.power = this.phase === "held" ? 0.3 : 0.72;
    c.update(dt);
    this.solidHangar(c);
    const sp = c.speed;
    this.clouds.disturb(c.x, c.y, 110, sp * 0.012, sp > 230 ? ((sp - 230) / 380) * dt * 5 : 0, c.vx * dt, c.vy * dt);
    let occ = 0;
    const pts = c.samplePoints();
    for (const [x, y] of pts) occ += this.clouds.density(x, y);
    this.occ = occ / pts.length;
    if (this.occ > 0.5 && c.sinceBurst < 1) {
      c.vx = damp(c.vx, 0, 4, dt);
      c.vy = damp(c.vy, 0, 4, dt);
    }
    this.updateHangar(dt, playing);
    this.updateLights(dt, playing);
    this.updatePeople(dt, playing);
    if (playing) this.updateFeed(dt);
    if (playing && this.phase === "out") this.updateExposure(dt);
    for (const tr of this.trucks) tr.update(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.updateAudio(dt);
    this.energyShown = damp(this.energyShown, this.energy, 6, dt);
    if (this.energy >= 0.2) this.energyWarnReady = true;
    if (g.mode === "fail" || g.mode === "win") this.endT += dt;
    if (g.mode === "fail") {
      this.capture = Math.min(1, this.capture + dt * 1.6);
      if (this.endT > 2.8) {
        g.mode = "play";
        this.reset(this.checkpoint);
        g.onEvent("restarted");
      }
    }
    g.flash = damp(g.flash, 0, 4, dt);
    g.camX = this.camX;
    g.shake = damp(g.shake, 0, 5, dt);
  }

  controls(dt, input) {
    const c = this.g.creature;
    const m = input.move;
    c.setInput(m.x, m.y);
    const pushing = Math.hypot(m.x, m.y) > 0.45;
    if (pushing) this.idleT = 0;
    else this.idleT += dt;
    const burst = input.takeBurst();
    if (this.phase === "held") {
      if (this.introT > 1.6 && (pushing || burst)) this.strain += burst ? 99 : dt;
      if (this.strain > 0.15 && !this.creaked) {
        this.creaked = true;
        audio.fx("door", { gain: 0.6, pan: -0.1 });
      }
      if (this.strain > 1.1) this.snapCables();
      return;
    }
    if (this.phase === "free") {
      const atDoor = c.x > this.C.hangar.x1 - 175;
      if (atDoor && m.x > 0.4) this.doorStrain += dt;
      if (this.doorT < 0 && atDoor && (burst || this.doorStrain > 1.0)) this.breakDoor(burst);
      if (burst && c.burst()) this.onBurst(); // bursts in the hangar are free (adrenaline)
      return;
    }
    if (input.takeEmp && input.takeEmp() && this.g.tryEmp()) this.fireEmp();
    if (burst) {
      const full = this.energy >= this.C.burstCost;
      c.burstScale = full ? 1 : 0.55; // an empty tank still twitches, just weakly
      if (c.burst()) {
        this.energy = Math.max(0, this.energy - this.C.burstCost);
        this.onBurst();
        if (!full) this.g.onEvent("weak-burst");
      }
    }
    // hard climbs spend a little
    if (c.inY < -0.55 && c.vy < -110 && !c.feeding) this.energy = Math.max(0, this.energy - this.C.climbCost * dt);
    c.feeding = input.feed && c.sinceBurst > 0.3;
    const cow = this.feedTarget();
    if (c.feeding && cow && Math.abs(c.x - cow.x) < TUNE.feedRangeX + 80) {
      if (c.y < TUNE.feedSwoopY - 50) c.beginSwoop(TUNE.feedSwoopY);
    } else if (!c.feeding) c.swoop = 0;
  }

  feedTarget() {
    const c = this.g.creature;
    let best = null;
    let bd = 1e9;
    for (const cw of this.cows) {
      if (cw.gone) continue;
      const d = Math.abs(cw.x - c.x);
      if (d < bd) (bd = d), (best = cw);
    }
    return best;
  }

  snapCables() {
    const g = this.g;
    this.phase = "free";
    this.cableSnap = 0.001;
    this.applyBounds();
    g.shake = 7;
    const c = g.creature;
    c.vy -= 120;
    // metal shrieks, the scientists scatter screaming
    audio.fx("slam", { gain: 1, pan: 0 });
    audio.fx("burst", { gain: 0.7 });
    this.sparks(c.x - 90, c.y - 30, 18);
    this.sparks(c.x + 90, c.y - 30, 18);
    this.scientists[0].flee(-1);
    this.scientists[1].flee(1);
    this.scientists[2].flee(1);
    audio.fx("scream", { gain: 1.05, pan: -0.3, dist: 0.15 });
    this.screamTimer = setTimeout(() => g.mode === "play" && audio.fx("screamRun", { gain: 0.9, pan: 0.4, dist: 0.25 }), 650);
    this.fluorFlick = 1.2;
    audio.setMusic("dread");
    g.onEvent("a51-free");
    this.setHint();
  }

  breakDoor(burst) {
    const g = this.g;
    this.doorT = 0;
    g.shake = burst ? 8 : 5;
    // the door is the shock: the base air drains away, then the rollers groan and the door tears up
    audio.fx("hangarDoor", { gain: 1 }); // v11 (Gamer Girl): plain hit, no hush/dip before it
    this.sparks(this.C.hangar.x1 - 6, GROUND - 160, 26);
    g.onEvent("a51-door");
  }

  onBurst() {
    const g = this.g;
    const c = g.creature;
    this.clouds.disturb(c.x, c.y, 190, 70, TUNE.burstTear, c.vx * 0.3, c.vy * 0.3);
    g.shake = 5;
    audio.fx("burst", { pan: this.panOf(c.x) });
    const sp = cloudSprites();
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU;
      this.particles.push({ k: "wisp", x: c.x + Math.cos(a) * 40, y: c.y + Math.sin(a) * 15, vx: -c.vx * 0.15 + Math.cos(a) * 50, vy: -c.vy * 0.15 + Math.sin(a) * 30, life: 0, max: 1.2 + Math.random(), size: 30 + Math.random() * 40, sp: sp[i % sp.length] });
    }
    const low = clamp(1 - (GROUND - 80 - c.y) / 280, 0, 1);
    for (let i = 0; i < 14 + low * 26; i++) {
      const ang = Math.random() * TAU;
      const spd = 40 + Math.random() * 140 * low;
      this.particles.push({ k: "dust", x: c.x + (Math.random() - 0.5) * 90, y: GROUND - 4 + Math.random() * 18, vx: Math.cos(ang) * spd, vy: -60 - Math.random() * 160 * low, life: 0, max: 0.7 + Math.random() * 1.1, size: 1.2 + Math.random() * 2.4 });
    }
  }

  sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random();
      const v = 120 + Math.random() * 320;
      this.particles.push({ k: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.7 });
    }
  }

  /** After the breakout the hangar is solid: you can't hide back inside it. */
  solidHangar(c) {
    const H = this.C.hangar;
    if (this.phase !== "out") {
      if (this.phase === "free" && this.doorOpen > 0.55 && c.x > H.x1 + 170) {
        this.phase = "out";
        this.exited = true;
        this.applyBounds();
        this.leaveHangar();
      }
      return;
    }
    const penX = H.x1 + 165 - c.x;
    const penY = c.y - (H.roof - 46);
    if (c.x > H.x0 - 165 && penX > 0 && penY > 0) {
      if (penX < penY) (c.x += penX), (c.vx = Math.max(0, c.vx));
      else (c.y -= penY), (c.vy = Math.min(0, c.vy));
    }
  }

  leaveHangar() {
    const g = this.g;
    this.barVisible = true;
    this.alert = Math.max(this.alert, 1);
    this.alarmNext = 2.2; // the searchlights wake, then the alarm
    this.checkpoint = 1;
    audio.setMusic("dread");
    this.musicHold = 0;
    g.onEvent("a51-out");
    this.setHint();
  }

  updateHangar(dt, playing) {
    this.introT += dt;
    // fluorescent tubes stutter on at the start (unsettling), then strobe at the snap
    if (this.checkpoint === 0 && this.phase === "held") {
      const k = this.introT;
      this.fluor = k < 0.6 ? 0 : k < 1.6 ? (Math.random() < 0.35 ? 1 : 0.08) : Math.random() < 0.02 ? 0.3 : 0.9;
    } else if (this.fluorFlick > 0) {
      this.fluorFlick -= dt;
      this.fluor = Math.random() < 0.5 ? 0.15 : 1;
    } else this.fluor = damp(this.fluor, this.alert > 0 || this.phase === "free" ? 0.55 : 0.9, 2, dt);
    if (this.cableSnap > 0 && this.cableSnap < 1) this.cableSnap = Math.min(1, this.cableSnap + dt * 2);
    if (this.doorT >= 0) {
      this.doorT += dt;
      this.doorOpen = smoothstep(0.35, 1.8, this.doorT); // the door lags the groan, tears upward over ~1.4 s
      if (this.phase === "free") this.applyBounds();
    }
    this.facade = damp(this.facade, this.exited ? 1 : 0, 1.2, dt);
    this.redSpin += dt * (this.alert > 0 || this.phase === "free" ? 3.2 : 0);
    if (playing && this.phase === "free" && this.idleT > 5 && !this.nudged) {
      this.nudged = true;
      this.g.onEvent("hint-nudge");
    }
  }

  // ---------------------------------------------------------------- searchlights
  allLights() {
    // v13 perf: reuse one array instead of spreading + filtering several times a frame
    const a = this.active;
    a.length = 0;
    for (const L of this.lights) a.push(L);
    for (const L of this.truckLights) if (L.truck.active && L.truck.delay <= 0) a.push(L);
    return a;
  }
  /** v13 EMP: is world point (x, y) inside the blacked-out circle right now? */
  empDark(x, y) {
    const E = this.emp;
    if (!E || E.t <= 0) return false;
    const dx = x - E.x;
    const dy = y - E.y;
    return dx * dx + dy * dy < EMP.radius * EMP.radius;
  }
  /** v13 EMP: black out every lamp in the circle. Locks and brushes in it are dropped. */
  fireEmp() {
    const g = this.g;
    const c = g.creature;
    this.emp = { x: c.x, y: Math.max(c.y, GROUND - 120), t: EMP.dark };
    for (const L of this.allLights()) {
      if (!this.empDark(L.x, L.y)) continue;
      L.dark = EMP.dark;
      if (L.state === "lock" || L.state === "brush") {
        L.state = "search";
        L.searchT = 3;
      }
      L.penHunt = 0;
      L.heat = 0;
    }
    g.shake = 4;
    g.flash = Math.max(g.flash, g.settings.reducedFlash ? 0.1 : 0.3);
    audio.fx("empBlast", { gain: 1, pan: 0 });
    g.onEvent("emp");
  }
  /** Angular distance of a point from a beam (radians), or 9 if out of reach / below the lamp. */
  beamDelta(L, x, y) {
    if (y > L.y - 10 && !(L.dip > 0.05)) return 9; // v11: a beam dipped onto the pen can light a low craft
    const dx = x - L.x;
    const dy = y - L.y;
    if (dx * dx + dy * dy > this.C.beamLen * this.C.beamLen) return 9;
    return Math.abs(wrapA(Math.atan2(dy, dx) - L.ang));
  }
  hits(L) {
    if (L.dark > 0) return false;
    const c = this.g.creature;
    const h = this.C.beamHalf;
    if (this.beamDelta(L, c.x, c.y) < h) return true;
    // the rim counts too (it's a big craft), but only its inner part
    return this.beamDelta(L, c.x - 80, c.y) < h * 0.8 || this.beamDelta(L, c.x + 80, c.y) < h * 0.8;
  }
  updateLights(dt, playing) {
    const c = this.g.creature;
    const out = this.phase === "out" && playing;
    const hidden = this.occ >= HIDE;
    const feedingLow = c.feedAmt > 0.3 && c.y > TUNE.dangerLowY - 30;
    let near = 0;
    let brushAny = false;
    let brushProg = 0;
    let lockedAny = false;
    let lockHits = false;
    for (const tr of this.truckLights) {
      const T = tr.truck;
      tr.x = T.roof.x;
      tr.y = T.roof.y;
      tr.c = T.v > 40 ? -0.75 : -1.35;
    }
    const active = this.allLights();
    const speedMul = this.alert >= 2 ? 1.3 : this.alert >= 1 ? 1 : 0.6;
    this.updatePenHeat(dt, out, hidden, active);
    if (this.emp && this.emp.t > 0) this.emp.t -= dt;
    for (const L of active) {
      // v13 EMP: a blacked-out lamp is just dead metal until the power comes back
      if (L.truck && this.empDark(L.x, L.y) && !(L.dark > 0) && this.emp.t > 0.5) L.dark = this.emp.t;
      if (L.dark > 0) {
        L.dark -= dt;
        L.inBeam = false;
        L.heat = 0;
        if (L.state === "lock" || L.state === "brush") L.state = "search";
        continue;
      }
      L.cool = Math.max(0, L.cool - dt);
      L.alertT = Math.max(0, L.alertT - dt);
      L.passCool = Math.max(0, L.passCool - dt);
      const inBeam = this.hits(L);
      if (L.state === "sweep" || L.state === "search") {
        // unsettling: now and then a light stops dead, then carries on
        L.pause -= dt;
        if (L.pause <= 0 && L.state === "sweep") {
          L.paused = 1.1 + Math.random() * 1.6;
          L.pause = 9 + Math.random() * 12;
        }
        if (L.paused > 0) L.paused -= dt;
        else L.phase += L.sp * speedMul * dt * (L.state === "search" ? 1.8 : 1);
        let centre = L.c;
        let range = L.r;
        if (L.penHunt > 0 && this.penTarget) {
          // v11: hunting the pen. Sweeps tight around the feed column, dipping below the lamp if it has to.
          L.penHunt -= dt;
          centre = Math.atan2(this.penTarget.y - L.y, this.penTarget.x - L.x);
          if (centre > Math.PI / 2) centre -= Math.PI * 2; // down-left: go round through the sky side, never the ground
          range = this.C.penHuntRange;
        } else if (L.state === "search" && this.lastKnown && this.lastKnown.x) {
          centre = Math.atan2(this.lastKnown.y - L.y, this.lastKnown.x - L.x); // hunting around where it last had you
          range = 0.32;
          L.searchT -= dt;
          if (L.searchT <= 0) L.state = "sweep";
        } else if (L.alertT > 0 && this.lastKnown && this.lastKnown.x) {
          const a = Math.atan2(this.lastKnown.y - L.y, this.lastKnown.x - L.x);
          if (a < -0.2 && a > -Math.PI + 0.2) centre = lerp(L.c, a, 0.6);
        }
        const want = centre + range * Math.sin(L.phase);
        L.ang = damp(L.ang, want, 3.5, dt);
        L.heat = damp(L.heat, 0, 3, dt);
        if (out && inBeam && !hidden && L.cool <= 0) {
          // the beam brushes you: it hesitates. Warning window before it can lock.
          L.state = "brush";
          L.brushT = 0;
          L.outT = 0;
          audio.preShock(feedingLow ? this.C.brushWarnLow : this.C.brushWarn, this.C.brushWarn + 1.4);
          this.g.onEvent("a51-brush");
        }
      } else if (L.state === "brush") {
        // creeps after you slowly, the way an operator squints at something odd
        const a = Math.atan2(c.y - L.y, c.x - L.x);
        const d = wrapA(a - L.ang);
        const bt = this.C.brushTrack ?? 0.18; // v21: per-level brush turn rate (rad/s), default 0.18 = levels 1-8 unchanged
        L.ang += clamp(d, -bt * dt, bt * dt);
        L.heat = damp(L.heat, 0.6, 4, dt);
        if (inBeam && !hidden) {
          L.brushT += dt;
          L.outT = 0;
        } else L.outT += dt;
        const warn = feedingLow ? this.C.brushWarnLow : this.C.brushWarn;
        if (L.outT > this.C.brushLose || !out) {
          // lost you: it swings on past and won't come back for a few seconds
          L.state = "sweep";
          L.cool = this.C.brushCool;
          const u = clamp((L.ang - L.c) / L.r, -1, 1);
          L.phase = Math.cos(L.phase) >= 0 ? Math.asin(u) : Math.PI - Math.asin(u);
          this.g.onEvent("a51-lost");
        } else if (L.brushT >= warn) this.lock(L);
      } else if (L.state === "lock") {
        const a = Math.atan2(c.y - L.y, c.x - L.x);
        const d = wrapA(a - L.ang);
        L.ang += clamp(d, -this.C.lockTrack * dt, this.C.lockTrack * dt);
        L.heat = damp(L.heat, 1, 6, dt);
        if (inBeam && !hidden) {
          L.outT = 0;
          lockHits = true;
          if (this.lastKnown) (this.lastKnown.x = c.x), (this.lastKnown.y = c.y);
          else this.lastKnown = { x: c.x, y: c.y };
        } else L.outT += dt;
        if (this.g.mode === "play" && (L.outT > this.C.lockLose || this.hiddenT > this.C.lockHiddenLose || !out)) {
          L.state = "search";
          L.searchT = 5;
          L.cool = this.C.brushCool;
          L.phase = 0;
        }
      }
      // beams point at the sky, unless dipped onto the pen (eases back up when the hunt ends)
      const dipWant = L.penHunt > 0 || ((L.state === "brush" || L.state === "lock") && L.dip > 0.5) ? 1 : 0;
      L.dip = damp(L.dip || 0, dipWant, dipWant ? 4 : 1.2, dt);
      L.ang = clamp(L.ang, -Math.PI + 0.12 - 0.6 * L.dip, -0.12 + 0.6 * L.dip);
      if (L.state === "brush") {
        brushAny = true;
        brushProg = Math.max(brushProg, clamp(L.brushT / (feedingLow ? this.C.brushWarnLow : this.C.brushWarn), 0, 1));
      }
      if (L.state === "lock") lockedAny = true;
      // the hum swells as a beam swings near (1-2 s of warning before it can even touch you)
      const dd = this.beamDelta(L, c.x, c.y);
      if (dd < 9) near = Math.max(near, smoothstep(0.6, this.C.beamHalf, dd) * (L.state === "sweep" && L.cool > 0 ? 0.5 : 1));
      // searchlight_pass when a beam sweeps over you (even through cloud: it's a warning)
      if (inBeam && !L.inBeam && L.passCool <= 0 && this.phase === "out" && playing) {
        L.passCool = 1.4;
        audio.fx("searchlightPass", { pan: this.panOf(c.x), gain: hidden ? 0.45 : 0.85 });
      }
      L.inBeam = inBeam;
    }
    this.near = damp(this.near, near * (1 - this.occ * 0.4), near > this.near ? 3 : 1.5, dt);
    if (this.brushAny && !brushAny && !lockedAny && audio.ducked && this.g.mode === "play") audio.releaseDuck(0.8);
    this.brushAny = brushAny;
    this.brushProg = brushProg; // 0..1 across the warning window: the hum ramp finishes exactly as the lock lands
    if (lockedAny && !this.lockedAny && this.C === A51) audio.fx("l1StingLockon", { gain: 0.85 }); // v20: a beam locks
    this.lockedAny = lockedAny;
    this.lockHits = lockHits;
  }

  /**
   * v11 (Game King debug pass, issue A): the beams sit above the pen, so a low feeding craft used to be
   * untouchable. Now the feed column gets noticed: heat builds while you feed low out of cloud, fast if a
   * nearby beam is turned toward your side, slowly if they're swung away. At 1.0 the nearby lights dip onto
   * the pen and hunt you (the normal brush warning and hum ramp still come before any lock).
   */
  updatePenHeat(dt, out, hidden, active) {
    const c = this.g.creature;
    const feedingLow = out && c.feedAmt > 0.3 && c.y > TUNE.dangerLowY - 30 && !hidden;
    let facing = 0;
    for (const L of active) {
      const dx = c.x - L.x;
      if (Math.abs(dx) > 1000) continue;
      const toward = Math.cos(L.ang) * Math.sign(dx || 1); // horizontal part of the beam aimed at your side
      facing = Math.max(facing, smoothstep(0.15, 0.8, toward) * (L.state === "sweep" && L.cool > 0 ? 0.5 : 1));
    }
    this.penNear = facing;
    if (feedingLow) this.penHeat += dt * (this.C.penHeatBase + this.C.penHeatFacing * facing) * (c.y > TUNE.dangerLowY ? 1 : 0.6);
    else this.penHeat = Math.max(0, this.penHeat - dt * this.C.penHeatDecay);
    if (feedingLow) this.penTarget = { x: c.x, y: c.y };
    if (this.penHeat >= 1 && feedingLow) {
      this.penHeat = 1;
      let n = 0;
      for (const L of active.slice().sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))) {
        if (Math.abs(L.x - c.x) > 1000 || n >= 2) continue;
        if (L.penHunt <= 0 && (L.state === "sweep" || L.state === "search")) {
          L.cool = 0;
          L.paused = 0;
          L.phase = -Math.PI / 2; // start the tight sweep from one side so it crosses you
        }
        L.penHunt = this.C.penHuntTime;
        n++;
      }
      if (!this.penNoticed) {
        this.penNoticed = true;
        this.alarmNext = Math.min(this.alarmNext, 0.4);
        this.g.onEvent("a51-pen-noticed");
      }
    }
    if (this.penHeat < 0.4) this.penNoticed = false;
  }

  lock(L) {
    const g = this.g;
    const c = g.creature;
    L.state = "lock";
    L.outT = 0;
    this.lastKnown = { x: c.x, y: c.y };
    for (const o of this.allLights()) if (o !== L) o.alertT = 12;
    audio.shock("spotted"); // lands as the hush completes
    audio.setMusic("chase");
    this.musicHold = 0;
    this.alarmNext = Math.min(this.alarmNext, 0.6);
    g.onEvent("spotted:searchlight");
  }

  updateExposure(dt) {
    const c = this.g.creature;
    const hidden = this.occ >= HIDE;
    this.hiddenT = hidden ? this.hiddenT + dt : 0;
    if (this.lockHits) {
      let w = 1;
      if (c.y > TUNE.dangerLowY) w *= 1.35;
      if (c.feedAmt > 0.3) w *= 1.3;
      if (c.y < TUNE.dangerHighY - 20) w *= this.C.highSoften;
      if (c.sinceBurst < 1 && c.vy < -100) w *= 0.4; // a burst out of the beam clearly helps
      this.exposure += dt * w;
    } else this.exposure = Math.max(0, this.exposure - dt * (hidden ? 0.9 : 0.45));
    if (this.exposure > this.C.failExposure * 0.65 && !this.failWarned) {
      this.failWarned = true;
      audio.preShock(1.2, 4);
    }
    if (this.exposure < this.C.failExposure * 0.35) this.failWarned = false;
    if (this.exposure >= this.C.failExposure) return this.fail();
    // win: past the fence after the first feed, hidden (or right out in the dark), with some Energy
    const past = c.x > this.C.exitX;
    if (this.harvested && past && this.energy >= this.C.energyMinExit && (hidden || c.x > this.C.W - 300) && !this.lockedAny) this.winT += dt;
    else this.winT = Math.max(0, this.winT - dt * 2);
    if (this.harvested && past && this.energy < this.C.energyMinExit && !this.weakWarned) {
      this.weakWarned = true;
      this.setHint();
      this.g.onEvent("a51-weak");
    }
    if (this.winT >= this.C.winHidden) return this.win();
    // music: calm only when hidden and nothing is hunting; dread otherwise; chase while locked
    this.musicHold += dt;
    if (this.musicHold > 3) {
      const cur = audio.musicState;
      const want = this.lockedAny ? "chase" : this.alert >= 2 || c.y > 330 || c.feedAmt > 0.2 ? "dread" : hidden ? "calm" : "dread";
      if (want !== cur) {
        audio.setMusic(want);
        this.musicHold = 0;
      }
    }
  }

  fail() {
    const g = this.g;
    g.mode = "fail";
    this.endT = 0;
    this.capture = 0;
    g.flash = g.settings.reducedFlash ? 0.25 : 0.6;
    g.shake = 7;
    for (const L of this.allLights()) L.state = "lock";
    audio.a51Sting("captureSting", 1, 0.5);
    audio.setMusic(null);
    g.onEvent("fail");
  }
  win() {
    const g = this.g;
    g.mode = "win";
    this.endT = 0;
    audio.releaseDuck(0.6);
    audio.setMusic(null);
    audio.fx("escapeSpace", { music: true, gain: 0.95 });
    audio.dlog("a51:escapeSpace");
    try {
      localStorage.setItem("nh-energy-l1", String(Math.round(this.energy * 100)));
    } catch {
      /* private mode */
    }
    g.onEvent("win");
  }

  // ---------------------------------------------------------------- people, cows, feeding
  updatePeople(dt, playing) {
    const c = this.g.creature;
    const H = this.C.hangar;
    for (const s of this.scientists) s.update(dt, H.x0 - 40, H.x1 + 200);
    for (const s of this.scientists) if (s.state === "idle" && this.phase === "held" && this.strain > 0.2) s.state = "look";
    const gd = this.guard;
    gd.update(dt, 2400, this.C.W);
    if (playing && gd.state === "idle" && this.phase === "out") {
      const close = Math.abs(c.x - gd.x) < 560 && c.y > 300;
      this.guardT = close && (c.feedAmt > 0.3 || c.y > 380) ? this.guardT + dt : 0;
      if (this.guardT > 1.0) {
        gd.state = "look";
        audio.fx("gasp", { pan: this.panOf(gd.x), dist: this.distOf(gd.x) });
        this.guardRunT = 0.9;
      }
    }
    if (this.guardRunT > 0) {
      this.guardRunT -= dt;
      if (this.guardRunT <= 0 && gd.flee(1)) {
        audio.fx("screamRun", { pan: this.panOf(gd.x), dist: this.distOf(gd.x), gain: 1.1 });
        // he radios it in: the nearest towers swing toward the pen (they still have to find you)
        this.lastKnown = { x: c.x, y: c.y };
        for (const L of this.lights) if (Math.abs(L.x - gd.x) < 1000) L.alertT = 10;
      }
    }
    // v13 soldiers: they look up, then point at the craft when it's low or caught in a light near them.
    // No combat: pointing radios it in, so nearby towers swing toward where they're pointing.
    const hidden = this.occ >= HIDE;
    for (const so of this.soldiers) {
      so.update(dt, -1e9, 1e9);
      so.cool = Math.max(0, so.cool - dt);
      const dx = c.x - so.x;
      const lit = this.lockedAny || this.brushAny;
      const canSee = playing && this.phase === "out" && !hidden && Math.abs(dx) < this.C.soldierSee && (c.y > this.C.soldierLookY || lit || c.feedAmt > 0.3) && !this.empDark(so.x, GROUND - 60);
      so.seeT = canSee ? so.seeT + dt : Math.max(0, so.seeT - dt * 0.7);
      if (so.seeT > 0.5) {
        if (so.state !== "look") {
          so.state = "look";
          if (so.cool <= 0) audio.fx("gasp", { pan: this.panOf(so.x), dist: this.distOf(so.x), gain: 0.7 });
          so.cool = 6;
        }
        so.dir = Math.sign(dx) || so.dir;
        // aim in the figure's own (mirrored) frame, measured from the shoulder
        so.pointAng = Math.atan2(c.y - (GROUND - 43), Math.abs(dx));
        so.pointWant = so.seeT > 0.9 ? 1 : 0;
        if (so.seeT > 1.6 && !so.radioed) {
          so.radioed = true;
          this.lastKnown = { x: c.x, y: c.y };
          for (const L of this.lights) if (Math.abs(L.x - so.x) < 900 && L.state === "sweep") L.alertT = Math.max(L.alertT, 6);
          this.g.onEvent("a51-soldier-point");
        }
      } else if (so.seeT <= 0.05) {
        so.state = "idle";
        so.pointWant = 0;
        so.radioed = false;
      }
    }
    const alarm = clamp(c.feedAmt * 1.5 + (c.y > 330 && Math.abs(c.x - 2850) < 300 ? 0.6 : 0), 0, 1);
    for (const cw of this.cows) cw.update(dt, alarm, 0.2);
  }

  updateFeed(dt) {
    const c = this.g.creature;
    if (this.phase !== "out") return;
    const m = c.mouthPos();
    const cow = this.feedTarget();
    let onTarget = false;
    if (cow) {
      const above = cow.baseY - 40 - m.y;
      onTarget = c.feeding && Math.abs(m.x - cow.x) < TUNE.feedRangeX && above > TUNE.feedMinAbove && above < TUNE.feedMaxAbove + 40;
    }
    if (c.feeding && !this.feedHeard && c.feedAmt > 0.3) {
      this.feedHeard = true;
      this.lastKnown = { x: c.x, y: c.y };
    }
    let pending = 0;
    for (const cw of this.cows) {
      if (cw.gone) continue;
      const on = onTarget && cw === cow;
      if (on) {
        if (cw.progress < 0.02) audio.fx("cow", { pan: this.panOf(cw.x), dist: this.distOf(cw.x) });
        cw.progress = Math.min(1, cw.progress + (dt / this.C.feedSeconds) * c.feedAmt * c.craft.feed);
        cw.x = damp(cw.x, m.x, 1.2, dt);
      } else cw.progress = Math.max(0, cw.progress - dt / 2.4);
      // v11 (Game King issue C): Energy only lands when the harvest completes, so a half-drawn animal never
      // makes you "able to leave". The bar shows the pending gain as a faint preview while you feed.
      if (cw.progress > cw.maxP) cw.maxP = cw.progress;
      pending = Math.max(pending, cw.progress * this.C.feedGain[Math.min(this.harvests, this.C.feedGain.length - 1)]);
      const reach = Math.max(0, cw.baseY - (m.y + 34));
      if (on) {
        cw.lift = reach * smoothstep(0, 1, cw.progress);
        cw.vy = 0;
      } else if (cw.lift > 0) {
        cw.vy += 900 * dt;
        cw.lift = Math.max(0, cw.lift - cw.vy * dt);
        if (cw.lift === 0) {
          if (cw.vy > 200) audio.fx("slam", { pan: this.panOf(cw.x), dist: this.distOf(cw.x), gain: 0.35 });
          cw.vy = 0;
        }
      }
      if (on && cw.progress > 0.5 && !this.distressed) {
        this.distressed = true;
        audio.fx("cowDistress", { pan: this.panOf(cw.x), dist: this.distOf(cw.x), gain: 0.85 });
      }
      if (on && cw.progress > 0.8 && !this.feedShock && this.harvests === 0) {
        this.feedShock = true;
        audio.preShock(1.2, 4); // near silence before the first-feed sting
        audio.warm("first_feed_sting");
      }
      if (cw.progress >= 1) this.harvest(cw);
    }
    if (!onTarget) this.distressed = false;
    this.energyPending = pending;
  }

  harvest(cw) {
    const g = this.g;
    const c = g.creature;
    cw.gone = true;
    cw.lift = 0;
    c.swallow = 1;
    c.feeding = false;
    g.shake = 3;
    const first = this.harvests === 0;
    this.energy = Math.min(1, this.energy + this.C.feedGain[Math.min(this.harvests, this.C.feedGain.length - 1)]);
    this.harvests++;
    if (first) {
      this.harvested = true;
      audio.a51Sting("firstFeed", 1, 0.6);
      this.alert = 2;
      this.alarmNext = Math.min(this.alarmNext, 1.5);
      for (const tr of this.trucks) tr.start();
      for (const L of this.lights) L.alertT = 8;
      this.lastKnown = { x: c.x, y: c.y };
      this.checkpoint = 2; // the cloud above the pen, with the Energy you have now
      this.cpEnergy2 = this.energy;
      g.onEvent("harvested");
    } else {
      audio.fx("cowDistress", { pan: this.panOf(c.x), gain: 0.6 });
      this.cpEnergy2 = Math.max(this.cpEnergy2 || 0, this.energy);
      g.onEvent("fed");
    }
    this.setHint();
  }

  // ---------------------------------------------------------------- particles, camera, audio
  updateParticles(dt) {
    const c = this.g.creature;
    if (c.feedAmt > 0.15) {
      const m = c.mouthPos();
      if (Math.random() < c.feedAmt * dt * 30)
        this.particles.push({ k: "suck", x: m.x + (Math.random() - 0.5) * 140, y: GROUND + Math.random() * 24, vx: 0, vy: -20, life: 0, max: 2.5, size: 0.8 + Math.random() * 1.6 });
    }
    const out = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life > p.max) continue;
      if (p.k === "dust") {
        p.vx *= Math.exp(-1.2 * dt);
        p.vy += 220 * dt;
      } else if (p.k === "spark") {
        p.vy += 600 * dt;
        if (p.y > GROUND + 10) (p.vy *= -0.3), (p.y = GROUND + 10);
      } else if (p.k === "suck") {
        const m = c.mouthPos();
        p.vx = damp(p.vx, (m.x - p.x) * 0.9 * c.feedAmt, 1.5, dt);
        p.vy = damp(p.vy, (-50 - p.life * 30) * c.feedAmt + (1 - c.feedAmt) * 60, 1.2, dt);
        if (p.y < m.y + 12 && c.feedAmt > 0.2) continue;
      } else if (p.k === "wisp") {
        p.vx = damp(p.vx, 0, 1.5, dt);
        p.vy = damp(p.vy, 0, 1.5, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      out.push(p);
    }
    this.particles = out.length > 220 ? out.slice(-220) : out;
  }

  updateCamera(dt) {
    const g = this.g;
    const c = g.creature;
    const VW = g.VW;
    let target;
    if (!this.exited) target = (this.C.hangar.x0 + this.C.hangar.x1) * 0.5 + 120 - VW * 0.5;
    else {
      const fx = c.x + c.vx * 0.7 + VW * 0.08;
      this.frameX = damp(this.frameX == null ? fx : this.frameX, fx, 1.5, dt);
      target = this.frameX - VW * 0.5;
    }
    target = clamp(target, 0, this.C.W - VW);
    this.camX = damp(this.camX, target, this.exited ? 2.2 : 3, dt);
  }

  panOf(x) {
    return clamp((x - (this.camX + this.g.VW / 2)) / (this.g.VW * 0.6), -1, 1);
  }
  distOf(x) {
    return clamp(Math.abs(x - (this.camX + this.g.VW / 2)) / 1600, 0, 1);
  }

  updateAudio(dt) {
    const g = this.g;
    const c = g.creature;
    const play = g.mode === "play";
    const out = this.phase === "out";
    // base_alarm: wakes after the breakout, retriggers while the base is alert (faster after the feed / when locked)
    if (play && out && this.alert > 0) {
      this.alarmNext -= dt;
      if (this.alarmNext <= 0) {
        const hx = this.C.hangar.x1;
        audio.fx("baseAlarm", { pan: this.panOf(hx), dist: Math.min(0.75, this.distOf(hx)), gain: this.lockedAny ? 0.95 : 0.7 });
        if (this.C === A51) audio.fx("l1StingSiren", { pan: this.panOf(hx), gain: 0.8 }); // v20
        this.alarmNext = this.lockedAny ? 5.2 : this.alert >= 2 ? 6.5 + Math.random() * 2 : 9 + Math.random() * 4;
      }
    }
    // trucks: idle bed by distance, truck_pass as each one rolls past the middle of the screen
    let truckG = 0;
    let truckPan = 0;
    for (const tr of this.trucks) {
      if (!tr.active || tr.delay > 0) continue;
      const k = Math.pow(1 - this.distOf(tr.x), 1.5);
      if (k > truckG) (truckG = k), (truckPan = this.panOf(tr.x));
      if (!tr.passed && tr.v > 120 && Math.abs(tr.x - (this.camX + g.VW / 2)) < g.VW * 0.35) {
        tr.passed = true;
        if (play) audio.fx("truckPass", { pan: this.panOf(tr.x), gain: 0.85 });
      }
    }
    // fairness ramp (v11: pen heat swells it too, so you hear the towers noticing your feed): the hum swells over ~1.5 s as a beam nears, then keeps climbing through the brush window,
    // topping out exactly when the beam locks. Nothing can catch you before this ramp has played out.
    const bp = this.lockedAny ? 1 : this.brushAny ? this.brushProg || 0 : 0;
    const humT = play && out ? Math.min(1, 0.06 + Math.max(this.near * 0.5, (this.penHeat || 0) * 0.42) + bp * 0.44) : this.phase === "free" && play ? 0.04 : 0;
    this.hum = damp(this.hum, humT, humT > this.hum ? (this.brushAny ? 6 : 2.2) : 1.5, dt);
    audio.update({
      breath: play ? (this.occ > 0.5 ? 0.7 : this.phase === "held" ? 0.6 : 0.3) : 0.2,
      hum: play ? smoothstep(280, 420, c.y) * (1 - c.feedAmt * 0.5) * (out ? 1 : 0.4) : 0,
      gust: 0.15,
      insects: 0,
      windMul: out ? 0.35 : 0,
      muffle: play ? clamp(this.occ * 0.9, 0, 0.9) : 0,
      feed: c.feedAmt,
      car: { gain: 0, speed: 0, pan: truckPan },
      storm: 0,
      howl: 0,
      a51: {
        amb: g.mode === "win" || NO_BASE_AMB.has(g.L.kind) ? 0 : out ? 0.55 * (1 - this.hum * 0.3) : 0.3,
        hum: g.mode === "fail" || g.mode === "win" ? 0 : this.hum * 0.9,
        humRate: 0.92 + this.near * 0.16 + bp * 0.12,
        truck: play ? truckG * 0.75 : 0,
        truckRate: 0.9,
        truckPan,
        energyWarn: play && out && this.energyWarnReady && this.energy < 0.2 ? 0.55 * (1 - this.energy / 0.2) + 0.2 : 0,
      },
    });
  }

  // ---------------------------------------------------------------- render
  /** How brightly the beams light a world point (for clouds and the craft's rim). */
  beamLight(x, y) {
    let k = 0;
    for (const L of this.drawLights) {
      if (L.dark > 0) continue;
      const d = this.beamDelta(L, x, y);
      if (d > 0.3) continue;
      const dist = Math.hypot(x - L.x, y - L.y);
      k += smoothstep(this.C.beamHalf * 2.6, this.C.beamHalf * 0.3, d) * (1 - dist / this.C.beamLen) * (0.75 + L.heat * 0.4);
    }
    return k;
  }

  render() {
    const g = this.g;
    const ctx = g.ctx;
    const s = g.s;
    const VW = g.VW;
    const c = g.creature;
    const t = this.t;
    const camX = this.camX + (Math.random() - 0.5) * g.shake;
    this.drawLights = this.allLights();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // half-res sky cache (soft content)
    const bw = Math.max(2, Math.round(g.canvas.width * 0.5));
    const bh = Math.max(2, Math.round(g.canvas.height * 0.5));
    if (!g.bg || g.bg.width !== bw || g.bg.height !== bh) {
      g.bg = makeCanvas(bw, bh);
      g.bgCtx = g.bg.getContext("2d", { alpha: false });
    }
    this.drawSky(g.bgCtx, s * 0.5, camX, VW, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(g.bg, 0, 0, g.canvas.width, g.canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const nx = -camX * 0.32;
    ctx.drawImage(this.ridgeNear, nx, GROUND - 146);
    if (g.scene) g.scene.drawFarMist(ctx, s, camX, VW, t, g.wind); // v14: low desert mist
    this.drawGround(ctx, s, camX, VW, t);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    this.drawHangarBack(ctx, t);
    this.drawStructures(ctx, t, camX, VW);
    for (const cw of this.cows) {
      ctx.save();
      if (cw.flip > 0) {
        ctx.translate(cw.x * 2, 0);
        ctx.scale(-1, 1);
      }
      cw.draw(ctx, c.feedAmt * (cw.progress > 0.02 ? 1 : 0.3));
      ctx.restore();
    }
    for (const sc of this.scientists) sc.draw(ctx, this.fluor * 0.8);
    this.guard.draw(ctx, 0.7);
    for (const so of this.soldiers) if (so.x > camX - 80 && so.x < camX + VW + 80) so.draw(ctx, 0.5);
    for (const tr of this.trucks) tr.draw(ctx);
    for (const tr of this.trucks) tr.drawLights(ctx, this.glowW);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    // the craft (the beam catches its rim) and its feeding column
    const bl = clamp(this.beamLight(c.x, c.y), 0, 1);
    c.draw(ctx, clamp(0.3 + bl + c.feedAmt * 0.4 + (!this.exited ? this.fluor * 0.4 : 0), 0, 1), 1);
    if (c.feedAmt > 0.02) g.drawColumn(ctx, s, camX);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    this.drawParticles(ctx, false);
    this.drawBeams(ctx, t);
    if (this.emp && this.emp.t > EMP.dark - 0.7) this.g.drawEmpRing(ctx, this.emp, EMP.dark - this.emp.t);
    // clouds, lit where the beams cut into them
    this.clouds.flash = g.flash;
    this.clouds.draw(ctx, camX - 100, camX + VW + 100, (x, y) => 0.1 + 0.2 * Math.exp(-Math.abs(y - 120) / 300) + this.beamLight(x, y) * 0.9);
    if (this.occ > 0.25 && g.mode !== "menu") c.draw(ctx, 0, (0.3 + bl * 0.4) * this.occ, true);
    this.drawParticles(ctx, true);
    this.drawHangarFront(ctx, t);
    this.drawGlows(ctx, t, camX, VW);
    this.drawHaze(ctx, s, camX, VW, t);
    if (g.mode === "play" && this.exited) g.drawHiddenCue(ctx, s, VW, this.occ);
    // screen space: alarm pulse, vignette, flash, fades, brightness
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (this.alert > 0 && this.exited) {
      const p = Math.max(0, Math.sin(t * 2.6)) * (this.lockedAny ? 0.09 : 0.03);
      ctx.fillStyle = `rgba(120,10,6,${p})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    const ex = g.mode === "play" ? clamp(this.exposure / this.C.failExposure, 0, 1) : g.mode === "fail" ? 1 : 0;
    const e2 = Math.max(ex, this.brushAny ? 0.14 : 0);
    ctx.globalAlpha = 0.55 + e2 * 0.45;
    ctx.drawImage(g.vignette, -VW * e2 * 0.08, -VH * e2 * 0.08, VW * (1 + e2 * 0.16), VH * (1 + e2 * 0.16));
    ctx.globalAlpha = 1;
    if (g.flash > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(200,210,230,${g.flash * 0.18})`;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = "source-over";
    }
    if (this.phase === "held" && this.introT < 1.2) {
      ctx.fillStyle = `rgba(0,0,0,${1 - smoothstep(0.2, 1.2, this.introT)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (g.mode === "fail") {
      ctx.fillStyle = `rgba(0,0,0,${smoothstep(1.2, 2.4, this.endT)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (g.mode === "win") {
      ctx.fillStyle = `rgba(0,0,0,${smoothstep(1.5, 4, this.endT) * 0.75})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    g.applyBrightness(ctx);
  }

  drawSky(ctx, s, camX, VW, t) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.sky, 0, 0, VW, VH);
    const st = this.stars;
    const sx = -((camX * 0.03) % st.width);
    ctx.globalAlpha = 0.9;
    for (let x = sx; x < VW; x += st.width) ctx.drawImage(st, x, 0);
    ctx.globalAlpha = 1;
    // v14 grade: pull the navy toward the farm's blue-grey
    ctx.fillStyle = "rgba(20,23,28,0.45)";
    ctx.fillRect(0, 0, VW, VH);
    // thin crescent moon, so the base lights own the night
    const mx = 980 - camX * 0.04 + (VW - 1280) * 0.3;
    const g = ctx.createRadialGradient(mx, 120, 0, mx, 120, 300);
    g.addColorStop(0, "rgba(150,165,190,0.22)");
    g.addColorStop(1, "rgba(30,36,46,0)");
    ctx.fillStyle = g;
    ctx.fillRect(mx - 300, 0, 600, 420);
    ctx.fillStyle = "rgba(220,226,234,0.92)";
    ctx.beginPath();
    ctx.arc(mx, 120, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#070a10";
    ctx.beginPath();
    ctx.arc(mx + 6, 117, 14, 0, TAU);
    ctx.fill();
    // v14: the same heavy storm ceiling as the farm, thinner so the base still owns the night
    const sc = this.g.scene;
    if (sc && sc.ceiling) {
      const cw = sc.ceiling.width * 2.5, ch = sc.ceiling.height * 2.2;
      const cx0 = -((camX * 0.2 + t * 4.5) % cw);
      ctx.globalAlpha = 0.85;
      for (let x = cx0; x < VW; x += cw) ctx.drawImage(sc.ceiling, x, -60, cw, ch);
      ctx.globalAlpha = 1;
    }
    // sodium light pollution rising off the base
    const hg = ctx.createLinearGradient(0, GROUND - 240, 0, GROUND);
    hg.addColorStop(0, "rgba(120,70,30,0)");
    hg.addColorStop(1, `rgba(130,78,36,${0.18 + (this.alert > 0 ? 0.05 : 0)})`);
    ctx.fillStyle = hg;
    ctx.fillRect(0, GROUND - 240, VW, 240);
    ctx.drawImage(this.far, -camX * 0.12, GROUND - 226);
  }

  drawGround(ctx, s, camX, VW, t) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.floor, 0, GROUND - 2, VW, VH - GROUND + 2);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const L = camX - 50;
    const R = camX + VW + 50;
    // apron / runway: darker tarmac, dashed centreline, blue edge lights
    const r0 = this.C.hangar.x0 - 40;
    const r1 = this.C.fence - 40;
    const a0 = Math.max(L, r0);
    const a1 = Math.min(R, r1);
    if (a1 > a0) {
      ctx.fillStyle = "#0b0b0c";
      ctx.fillRect(a0, GROUND + 10, a1 - a0, 26);
      ctx.fillStyle = "rgba(170,165,150,0.16)";
      for (let x = Math.max(r0, Math.floor(L / 90) * 90); x < a1; x += 90) ctx.fillRect(x, GROUND + 22, 44, 2);
      ctx.globalCompositeOperation = "lighter";
      for (let x = Math.max(r0 + 20, Math.floor(L / 70) * 70); x < a1; x += 70) {
        ctx.globalAlpha = 0.5 * (0.6 + 0.4 * Math.sin(t * 1.3 + x * 0.05));
        ctx.drawImage(this.glowB, x - 7, GROUND + 4, 14, 14);
        ctx.drawImage(this.glowB, x - 7, GROUND + 30, 14, 14);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    // the far fence line along the back of the base
    ctx.strokeStyle = "rgba(40,42,44,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, GROUND - 14);
    ctx.lineTo(Math.min(R, this.C.fence), GROUND - 14);
    for (let x = Math.floor(L / 46) * 46; x < Math.min(R, this.C.fence); x += 46) {
      ctx.moveTo(x, GROUND + 2);
      ctx.lineTo(x, GROUND - 17);
    }
    ctx.stroke();
    ctx.fillStyle = "#070707";
    for (const b of this.scrub) {
      if (b.x < L || b.x > R) continue;
      if (b.x > this.C.hangar.x0 - 60 && b.x < this.C.fence - 20 && b.y < 18) continue; // none on the tarmac
      ctx.beginPath();
      ctx.ellipse(b.x, GROUND + 12 + b.y, 9 * b.s, 5 * b.s, 0, Math.PI, TAU);
      ctx.fill();
    }
  }

  drawHangarBack(ctx, t) {
    const H = this.C.hangar;
    const w = H.x1 - H.x0;
    const top = H.roof;
    const f = this.fluor;
    const g = ctx.createLinearGradient(0, top, 0, GROUND);
    g.addColorStop(0, `rgb(${10 + 14 * f | 0},${12 + 16 * f | 0},${14 + 18 * f | 0})`);
    g.addColorStop(1, `rgb(${6 + 9 * f | 0},${7 + 10 * f | 0},${8 + 11 * f | 0})`);
    ctx.fillStyle = g;
    ctx.fillRect(H.x0, top, w, GROUND - top + 4);
    ctx.strokeStyle = `rgba(${30 + 40 * f | 0},${34 + 44 * f | 0},${38 + 48 * f | 0},0.9)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = H.x0 + 40; x < H.x1; x += 80) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, GROUND);
    }
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = H.x0; x < H.x1; x += 40) {
      ctx.moveTo(x, top + 2);
      ctx.lineTo(x + 20, top + 26);
      ctx.lineTo(x + 40, top + 2);
    }
    ctx.moveTo(H.x0, top + 26);
    ctx.lineTo(H.x1, top + 26);
    ctx.stroke();
    // floor: hazard stripes and a painted ring under the craft
    ctx.fillStyle = `rgba(${120 + 60 * f | 0},${100 + 50 * f | 0},20,0.35)`;
    for (let x = H.x0 + 10; x < H.x1 - 20; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x + 12, GROUND);
      ctx.lineTo(x + 18, GROUND - 6);
      ctx.lineTo(x + 6, GROUND - 6);
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(200,200,200,${0.08 + 0.12 * f})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.C.start.x, GROUND + 2, 170, 7, 0, 0, TAU);
    ctx.stroke();
    // crates, a lab bench with cold green screens, gas bottles
    ctx.fillStyle = "#0a0b0c";
    ctx.fillRect(H.x0 + 30, GROUND - 46, 60, 46);
    ctx.fillRect(H.x0 + 96, GROUND - 30, 40, 30);
    ctx.fillRect(H.x1 - 210, GROUND - 40, 110, 6);
    ctx.fillRect(H.x1 - 205, GROUND - 34, 6, 34);
    ctx.fillRect(H.x1 - 110, GROUND - 34, 6, 34);
    for (let k = 0; k < 3; k++) {
      const flick = this.phase === "held" ? 0.7 : 0.5 + 0.5 * Math.random();
      ctx.fillStyle = `rgba(80,200,150,${0.35 * flick})`;
      ctx.fillRect(H.x1 - 200 + k * 32, GROUND - 62, 24, 16);
    }
    ctx.fillStyle = "#0c0d0e";
    for (let k = 0; k < 4; k++) ctx.fillRect(H.x0 + 160 + k * 14, GROUND - 52, 10, 52);
    // gantry rail + restraint cables (they snap and whip away)
    ctx.fillStyle = "#101214";
    ctx.fillRect(H.x0 + 20, top + 30, w - 40, 10);
    const c = this.g.creature;
    const snap = this.cableSnap;
    ctx.strokeStyle = "rgba(90,96,104,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const k of [-110, -50, 50, 110]) {
      const ax = this.C.start.x + k * 1.3;
      if (snap <= 0) {
        ctx.moveTo(ax, top + 40);
        ctx.lineTo(c.x + k, c.y - 8 + (Math.abs(k) > 60 ? 4 : -10));
      } else if (snap < 1) {
        const len = 140 * (1 - snap * 0.4);
        const sw = Math.sin(t * 30 + k) * 30 * (1 - snap);
        ctx.moveTo(ax, top + 40);
        ctx.quadraticCurveTo(ax + sw, top + 40 + len * 0.6, ax + sw * 1.6 + k * 0.2, top + 40 + len);
      } else {
        ctx.moveTo(ax, top + 40);
        ctx.lineTo(ax + Math.sin(t * 0.8 + k) * 3, top + 110);
      }
    }
    ctx.stroke();
    // fluorescent tubes
    for (let x = H.x0 + 90; x < H.x1 - 40; x += 160) {
      ctx.fillStyle = `rgb(${200 * f + 20 | 0},${215 * f + 20 | 0},${225 * f + 22 | 0})`;
      ctx.fillRect(x, top + 52, 54, 4);
    }
    // the right wall's roller door (tears upward when forced) and the left wall
    ctx.fillStyle = "#0d0f11";
    const doorTop = top + 30;
    const doorH = GROUND - doorTop;
    const open = this.doorOpen;
    const shake = this.doorT >= 0 && open < 1 ? Math.sin(t * 60) * 2 * (1 - open) : this.doorStrain > 0 && this.phase === "free" ? Math.sin(t * 50) * 1.5 : 0;
    ctx.fillRect(H.x1 - 8 + shake, doorTop, 26, doorH * (1 - open));
    ctx.strokeStyle = "rgba(60,64,70,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = doorTop + 14; y < doorTop + doorH * (1 - open); y += 14) {
      ctx.moveTo(H.x1 - 8 + shake, y);
      ctx.lineTo(H.x1 + 18 + shake, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#0d0f11";
    ctx.fillRect(H.x0 - 16, top, 18, GROUND - top + 4);
  }

  drawHangarFront(ctx, t) {
    const H = this.C.hangar;
    const a = this.facade;
    const mid = (H.x0 + H.x1) / 2;
    // roof: always solid (curved, corrugated)
    ctx.fillStyle = "#0b0c0e";
    ctx.beginPath();
    ctx.moveTo(H.x0 - 30, H.roof + 4);
    ctx.quadraticCurveTo(mid, H.roof - 70, H.x1 + 30, H.roof + 4);
    ctx.lineTo(H.x1 + 30, H.roof + 12);
    ctx.lineTo(H.x0 - 30, H.roof + 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90,96,108,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(H.x0 - 30, H.roof + 3);
    ctx.quadraticCurveTo(mid, H.roof - 71, H.x1 + 30, H.roof + 3);
    ctx.stroke();
    const red = this.alert > 0 || this.phase === "free" ? 0.35 + 0.35 * Math.max(0, Math.sin(this.redSpin)) : 0.1;
    // facade (fades in once you're outside): corrugated panels, the 18 stencil, red windows, the torn door slot
    if (a > 0.02) {
      ctx.globalAlpha = a * 0.96;
      const g = ctx.createLinearGradient(0, H.roof, 0, GROUND);
      g.addColorStop(0, "#121417");
      g.addColorStop(1, "#08090a");
      ctx.fillStyle = g;
      ctx.fillRect(H.x0 - 18, H.roof + 8, H.x1 - H.x0 + 36, GROUND - H.roof - 4);
      ctx.strokeStyle = "rgba(70,76,84,0.35)";
      ctx.beginPath();
      for (let x = H.x0 - 10; x < H.x1 + 18; x += 12) {
        ctx.moveTo(x, H.roof + 10);
        ctx.lineTo(x, GROUND + 2);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(170,170,160,0.22)";
      ctx.font = "bold 64px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("18", H.x0 + 150, H.roof + 120);
      ctx.fillStyle = `rgba(200,40,30,${red})`;
      for (let x = H.x0 + 260; x < H.x1 - 40; x += 70) ctx.fillRect(x, H.roof + 40, 40, 10);
      ctx.fillStyle = `rgba(150,25,18,${0.5 * red + 0.15})`;
      ctx.fillRect(H.x1 - 30, H.roof + 46, 30, GROUND - H.roof - 46);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "lighter";
    if (this.alert > 0 || this.phase === "free") {
      for (const bx of [H.x0 - 20, H.x1 + 20]) {
        const k = 0.5 + 0.5 * Math.sin(this.redSpin + bx);
        ctx.globalAlpha = 0.4 + 0.6 * k;
        ctx.drawImage(this.glowR, bx - 26, H.roof - 30, 52, 52);
      }
      ctx.globalAlpha = 1;
    }
    // inside, after the snap: a red rotating light sweeping the walls
    if (!this.exited && this.phase === "free") {
      const cx = mid;
      const cy = H.roof + 60;
      const ang = this.redSpin;
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 620);
      gg.addColorStop(0, "rgba(190,24,12,0.4)");
      gg.addColorStop(1, "rgba(190,24,12,0)");
      ctx.fillStyle = gg;
      for (const off of [0, Math.PI]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 620, ang + off, ang + off + 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 300;
    const R = camX + VW + 300;
    this.drawBigSign(ctx, t, L, R);
    // v13 bigger base: barracks huts and a motor pool between the third tower and the fence
    for (let k = 0; k < 5; k++) {
      const bx = 4180 + k * 290;
      if (bx < L - 200 || bx > R) continue;
      ctx.fillStyle = "#08090b";
      ctx.beginPath();
      ctx.moveTo(bx, GROUND + 2);
      ctx.lineTo(bx, GROUND - 46);
      ctx.quadraticCurveTo(bx + 90, GROUND - 92, bx + 180, GROUND - 46);
      ctx.lineTo(bx + 180, GROUND + 2);
      ctx.fill();
      const lit = !this.empDark(bx + 90, GROUND - 40);
      ctx.fillStyle = lit ? "rgba(240,200,120,0.32)" : "rgba(20,20,20,0.6)";
      for (let w = 0; w < 3; w++) ctx.fillRect(bx + 30 + w * 50, GROUND - 34, 16, 10);
    }
    const tx = this.C.tower.x;
    if (tx > L && tx < R) {
      // control tower
      ctx.fillStyle = "#0a0b0d";
      ctx.fillRect(tx - 14, GROUND - 230, 28, 232);
      ctx.beginPath();
      ctx.moveTo(tx - 44, GROUND - 230);
      ctx.lineTo(tx + 44, GROUND - 230);
      ctx.lineTo(tx + 36, GROUND - 268);
      ctx.lineTo(tx - 36, GROUND - 268);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(90,190,170,0.5)";
      ctx.fillRect(tx - 34, GROUND - 262, 68, 22);
      ctx.fillStyle = "#0a0b0d";
      for (let k = -24; k <= 24; k += 16) ctx.fillRect(tx + k, GROUND - 262, 2, 22);
      ctx.fillRect(tx - 40, GROUND - 274, 80, 7);
      ctx.fillRect(tx - 1, GROUND - 300, 2, 28);
      // radar dish on a mast
      const rx = tx + 140;
      ctx.fillRect(rx - 4, GROUND - 120, 8, 122);
      const rs = Math.cos(t * 1.4);
      ctx.beginPath();
      ctx.ellipse(rx, GROUND - 132, Math.abs(rs) * 40 + 3, 14, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(80,86,94,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // low buildings with lit windows
      ctx.fillStyle = "#090a0b";
      ctx.fillRect(tx + 200, GROUND - 46, 180, 48);
      ctx.fillRect(tx - 260, GROUND - 36, 150, 38);
      ctx.fillStyle = "rgba(230,190,120,0.35)";
      for (let k = 0; k < 5; k++) ctx.fillRect(tx + 214 + k * 34, GROUND - 34, 14, 8);
    }
    // jeeps by the hangar
    const jx = this.C.hangar.x1 + 120;
    if (jx > L && jx < R) {
      ctx.fillStyle = "#060708";
      for (const k of [0, 90]) {
        ctx.beginPath();
        ctx.moveTo(jx + k, GROUND + 6);
        ctx.lineTo(jx + k, GROUND - 14);
        ctx.lineTo(jx + k + 18, GROUND - 16);
        ctx.lineTo(jx + k + 26, GROUND - 28);
        ctx.lineTo(jx + k + 48, GROUND - 28);
        ctx.lineTo(jx + k + 56, GROUND - 14);
        ctx.lineTo(jx + k + 64, GROUND - 12);
        ctx.lineTo(jx + k + 64, GROUND + 6);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(jx + k + 12, GROUND + 6, 7, 0, TAU);
        ctx.arc(jx + k + 52, GROUND + 6, 7, 0, TAU);
        ctx.fill();
      }
    }
    // sodium lamp posts
    ctx.fillStyle = "#08090a";
    for (let x = 1250; x < this.C.fence; x += 420) {
      if (x < L || x > R) continue;
      ctx.fillRect(x - 2, GROUND - 120, 4, 122);
      ctx.fillRect(x - 2, GROUND - 120, 22, 4);
    }
    // searchlight towers (lattice), lamp heads turned along their beams
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
        const y0 = GROUND - (h * k) / 6;
        const y1 = GROUND - (h * (k + 1)) / 6;
        const w0 = lerp(24, 9, k / 6);
        const w1 = lerp(24, 9, (k + 1) / 6);
        ctx.moveTo(T.x - w0, y0);
        ctx.lineTo(T.x + w1, y1);
        ctx.moveTo(T.x + w0, y0);
        ctx.lineTo(T.x - w1, y1);
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
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.4 + 0.6 * (Math.sin(t * 2.2 + T.x) > 0.6 ? 1 : 0.2);
      ctx.drawImage(this.glowR, T.x - 10, T.y - 22, 20, 20);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    // the test-animal pen: rails, a lamp post, the guard hut
    const p0 = this.C.pen.x0;
    const p1 = this.C.pen.x1;
    if (p1 > L && p0 < R) {
      ctx.strokeStyle = "#0e0d0b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = p0; x <= p1; x += 50) {
        ctx.moveTo(x, GROUND + 14);
        ctx.lineTo(x, GROUND - 22);
      }
      ctx.moveTo(p0, GROUND - 18);
      ctx.lineTo(p1, GROUND - 18);
      ctx.moveTo(p0, GROUND - 4);
      ctx.lineTo(p1, GROUND - 4);
      ctx.stroke();
      ctx.fillStyle = "#08090a";
      ctx.fillRect(p1 + 30, GROUND - 150, 4, 152);
      ctx.fillRect(p1 + 12, GROUND - 150, 24, 5);
      const hx = this.C.guard.x + 70;
      ctx.fillRect(hx, GROUND - 58, 52, 60);
      ctx.fillRect(hx - 6, GROUND - 64, 64, 7);
      ctx.fillStyle = "rgba(240,200,120,0.5)";
      ctx.fillRect(hx + 10, GROUND - 46, 30, 16);
    }
    // the perimeter fence (tall chain link, razor wire) and THE sign
    const fx = this.C.fence;
    if (fx > L - 200 && fx < R + 200) {
      ctx.strokeStyle = "rgba(60,62,64,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = fx - 60; x <= fx + 60; x += 30) {
        ctx.moveTo(x, GROUND + 18);
        ctx.lineTo(x, GROUND - 74);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(70,72,74,0.35)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = 0; k < 26; k++) {
        ctx.moveTo(fx - 60, GROUND - 70 + k * 4);
        ctx.lineTo(fx + 60, GROUND - 70 + k * 4 - 24);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(80,82,86,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = fx - 60; x < fx + 60; x += 7) {
        ctx.moveTo(x + 6, GROUND - 80);
        ctx.arc(x, GROUND - 80, 6, 0, TAU);
      }
      ctx.stroke();
      const sx = fx + 120;
      ctx.fillStyle = "#07080a";
      ctx.fillRect(sx - 2, GROUND - 40, 4, 42);
      ctx.fillStyle = "rgba(170,168,158,0.5)";
      ctx.fillRect(sx - 34, GROUND - 74, 68, 36);
      ctx.fillStyle = "rgba(120,20,18,0.85)";
      ctx.font = "bold 7px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("RESTRICTED AREA", sx, GROUND - 64);
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.font = "5px Arial, sans-serif";
      ctx.fillText("USE OF DEADLY FORCE", sx, GROUND - 54);
      ctx.fillText("AUTHORIZED", sx, GROUND - 47);
    }
  }

  /** v13 (Josh 5 Oct): the big AREA 51 sign on the apron, lit from below by two sodium lamps. */
  drawBigSign(ctx, t, L, R) {
    const sx = this.C.sign.x;
    if (sx < L - 260 || sx > R + 260) return;
    const top = GROUND - 150;
    const w = 300;
    const h = 92;
    ctx.fillStyle = "#06070a";
    ctx.fillRect(sx - w * 0.38, top + h, 8, GROUND - top - h + 2);
    ctx.fillRect(sx + w * 0.38 - 8, top + h, 8, GROUND - top - h + 2);
    const dark = this.empDark(sx, GROUND - 60);
    const lamp = dark ? 0.12 : 0.92 + 0.08 * noise1(t * 3);
    ctx.fillStyle = `rgba(${Math.round(150 * lamp)},${Math.round(140 * lamp)},${Math.round(118 * lamp)},1)`;
    ctx.fillRect(sx - w / 2, top, w, h);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    ctx.strokeRect(sx - w / 2, top, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(110,16,14,${0.35 + 0.6 * lamp})`;
    ctx.font = "bold 44px Arial, sans-serif";
    ctx.fillText("AREA 51", sx, top + 50);
    ctx.fillStyle = `rgba(16,16,16,${0.3 + 0.6 * lamp})`;
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.fillText("RESTRICTED MILITARY INSTALLATION", sx, top + 70);
    ctx.font = "10px Arial, sans-serif";
    ctx.fillText("NO TRESPASSING  ·  PHOTOGRAPHY PROHIBITED", sx, top + 84);
    if (!dark) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glowS, sx - w * 0.45 - 40, top + h - 40, 120, 120);
      ctx.drawImage(this.glowS, sx + w * 0.45 - 80, top + h - 40, 120, 120);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  drawBeams(ctx, t) {
    ctx.globalCompositeOperation = "lighter";
    const len = this.C.beamLen;
    const h = this.C.beamHalf;
    const g0 = this.g;
    const vl = this.camX - len;
    const vr = this.camX + g0.VW + len;
    for (const L of this.drawLights) {
      if (L.x < vl || L.x > vr) continue; // v13 perf: beams that can't reach the screen aren't drawn
      if (L.dark > 0 && !(L.dark < 0.6 && Math.sin(this.t * 60) > 0)) continue; // v13 EMP: dead, flickering back on
      const a = L.ang;
      const heat = L.heat;
      const k = (0.92 + 0.08 * noise1(t * 6 + L.i * 5)) * (0.85 + heat * 0.5);
      // cold white sweeping, warm while it hesitates on you, white-hot when locked
      const col = L.state === "lock" ? "255,250,240" : L.state === "brush" ? "255,236,200" : "215,226,245";
      const ex = L.x + Math.cos(a) * len;
      const ey = L.y + Math.sin(a) * len;
      let g = ctx.createLinearGradient(L.x, L.y, ex, ey);
      g.addColorStop(0, `rgba(${col},${0.16 * k})`);
      g.addColorStop(0.6, `rgba(${col},${0.05 * k})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(L.x, L.y);
      ctx.lineTo(L.x + Math.cos(a - h * 1.9) * len, L.y + Math.sin(a - h * 1.9) * len);
      ctx.lineTo(L.x + Math.cos(a + h * 1.9) * len, L.y + Math.sin(a + h * 1.9) * len);
      ctx.closePath();
      ctx.fill();
      g = ctx.createLinearGradient(L.x, L.y, ex, ey);
      g.addColorStop(0, `rgba(${col},${0.42 * k})`);
      g.addColorStop(0.35, `rgba(${col},${0.17 * k})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(L.x, L.y);
      ctx.lineTo(L.x + Math.cos(a - h) * len, L.y + Math.sin(a - h) * len);
      ctx.lineTo(L.x + Math.cos(a + h) * len, L.y + Math.sin(a + h) * len);
      ctx.closePath();
      ctx.fill();
      // dust motes hanging in the beam
      ctx.fillStyle = `rgba(${col},${0.35 * k})`;
      for (let m = 0; m < 14; m++) {
        const u = ((m * 0.618 + t * 0.03 * (1 + (m % 3))) % 1) * 0.8 + 0.05;
        const v = (((m * 0.377 + L.i * 0.13) % 1) - 0.5) * 1.6 * h;
        const d = u * len;
        ctx.fillRect(L.x + Math.cos(a + v) * d, L.y + Math.sin(a + v) * d, 1.5, 1.5);
      }
      ctx.globalAlpha = 0.9;
      const gs = 60 + heat * 30;
      ctx.drawImage(this.glowW, L.x + Math.cos(a) * 10 - gs / 2, L.y + Math.sin(a) * 10 - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";
  }

  drawGlows(ctx, t, camX, VW) {
    const L = camX - 200;
    const R = camX + VW + 200;
    ctx.globalCompositeOperation = "lighter";
    for (let x = 1250; x < this.C.fence; x += 420) {
      if (x < L || x > R) continue;
      if (this.empDark(x, GROUND - 120)) continue; // v13 EMP
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.glowS, x - 12, GROUND - 146, 60, 60);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(this.glowS, x - 132, GROUND - 60, 300, 120);
    }
    const px = this.C.pen.x1 + 24;
    if (px > L && px < R) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.glowS, px - 30, GROUND - 176, 60, 60);
      ctx.globalAlpha = 0.32;
      ctx.drawImage(this.glowS, px - 260, GROUND - 90, 400, 160);
    }
    const tx = this.C.tower.x;
    if (tx > L && tx < R) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.glowT, tx - 80, GROUND - 300, 160, 100);
      ctx.globalAlpha = Math.sin(t * 3) > 0.7 ? 1 : 0.5;
      ctx.drawImage(this.glowR, tx - 10, GROUND - 312, 20, 20);
    }
    if (!this.exited) {
      const H = this.C.hangar;
      for (let x = H.x0 + 90; x < H.x1 - 40; x += 160) {
        ctx.globalAlpha = 0.45 * this.fluor;
        ctx.drawImage(this.glowW, x - 60, H.roof, 174, 110);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  drawHaze(ctx, s, camX, VW, t) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const g = ctx.createLinearGradient(0, GROUND - 90, 0, GROUND + 40);
    g.addColorStop(0, "rgba(60,48,38,0)");
    g.addColorStop(0.7, `rgba(70,56,42,${0.16 + 0.04 * Math.sin(t * 0.3)})`);
    g.addColorStop(1, "rgba(20,16,12,0.2)");
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND - 90, VW, 130);
  }

  drawParticles(ctx, front) {
    for (const p of this.particles) {
      const f = 1 - p.life / p.max;
      if (p.k === "wisp") {
        if (!front) continue;
        const r = p.size * (1 + p.life * 0.8);
        ctx.globalAlpha = f * 0.5;
        ctx.drawImage(p.sp.body, p.x - r, p.y - r, r * 2, r * 2);
        continue;
      }
      if (front) continue;
      if (p.k === "spark") {
        ctx.strokeStyle = `rgba(255,${170 + 60 * f | 0},90,${f})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.k === "suck" ? `rgba(150,158,165,${0.45 * f})` : `rgba(150,130,105,${0.55 * f})`;
        ctx.fillRect(p.x, p.y, p.size * 1.5, p.size * 1.5);
      }
    }
    ctx.globalAlpha = 1;
  }
}

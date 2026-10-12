// Level 9: Army Convoy (Game King, sandbox-gk-l9). A ridge road at night: trucks with roof searchlights
// patrol it, more are parked with their lights sweeping, and soldiers look up and point (no combat). When a
// soldier points, the nearest convoy truck TURNS and hunts toward you (l9StingConvoyTurns). Three paddocks lie
// below the ridge; you need Energy >= 60% to leave, so bank two feeds while being hunted. Every catch still
// goes through the Area 51 brush warning (~1.5 s; ~1.2 s when low and feeding) before a beam can lock.
import { VH, GROUND, CONVOY, CONVOY_CLOUDS } from "./config.js?v=22";
import { clamp, damp, lerp, rng, TAU } from "./util.js?v=22";
import { Area51 } from "./a51.js?v=22";
import { audio } from "./audio.js?v=22";

export class Convoy extends Area51 {
  constructor(game) {
    super(game, Object.create(CONVOY), CONVOY_CLOUDS);
    // a third convoy truck (same Truck class as Area 51)
    const T = this.trucks[0].constructor;
    const t3 = new T(2);
    t3.redGlow = this.glowR;
    this.trucks.push(t3);
    this.truckLights.push({ x: 0, y: 0, c: -1.2, r: 0.55, sp: 0.5, ph: 4, i: 12, kind: "truck", truck: t3 });
    this.reset(0);
  }

  build() {
    super.build();
    const r = rng(909);
    this.parked = CONVOY.towers.map((T) => T.x);
    this.posts = [];
    for (let x = 300; x < CONVOY.W; x += 260 + r() * 60) this.posts.push(x);
  }

  reset(cp = this.checkpoint) {
    super.reset(cp === 0 ? 1 : cp);
    this.checkpoint = cp;
    this.alert = 1; // the army is already out
    this.alarmNext = 1e9;
    if (cp === 2 && this.cpPos) {
      this.g.creature.reset(this.cpPos.x, this.cpPos.y);
      this.camX = Math.max(0, this.cpPos.x - this.g.VW * 0.5);
      this.cows.forEach((cw, i) => (cw.gone = this.cpFed && this.cpFed.includes(i)));
      this.energy = this.cpEnergy2 != null ? this.cpEnergy2 : this.energy;
    }
    // trucks patrol their stretch of the ridge road
    (this.trucks || []).forEach((tr, i) => {
      const P = CONVOY.patrols[i] || CONVOY.patrols[0];
      tr.active = true;
      tr.delay = 0;
      tr.x = lerp(P[0], P[1], (i * 0.37) % 1);
      tr.dir = i % 2 ? -1 : 1;
      tr.v = 0;
      tr.hunt = 0;
      tr.update = (dt) => this.truckTick(tr, P, dt);
    });
    this.turnCool = 0;
    this.lastPointed = 0;
    audio.setMusic(null);
    this.g.warmOnce(9);
    this.setHint();
  }

  truckTick(tr, P, dt) {
    const c = this.g.creature;
    let want;
    if (tr.hunt > 0) {
      tr.hunt -= dt;
      const tx = clamp(c.x, P[0] - 300, P[1] + 300);
      want = clamp((tx - tr.x) * 1.5, -CONVOY.huntSpeed, CONVOY.huntSpeed);
    } else {
      if (tr.x > P[1]) tr.dir = -1;
      if (tr.x < P[0]) tr.dir = 1;
      want = tr.dir * CONVOY.patrolSpeed;
    }
    tr.v = damp(tr.v, want, 1.4, dt);
    tr.x += tr.v * dt;
    tr.wheel += (tr.v * dt) / 11;
  }

  harvest(cw) {
    super.harvest(cw);
    this.alert = Math.max(this.alert, 1);
    for (const tr of this.trucks) tr.active = true, (tr.delay = 0);
    this.cpPos = { x: cw.x, y: 180 };
    this.cpFed = this.cows.map((w, i) => (w.gone ? i : -1)).filter((i) => i >= 0);
    this.cpEnergy2 = this.energy;
  }

  setHint() {
    const touch = this.g.touchy ? this.g.touchy() : true;
    const c = this.g.creature;
    let h;
    if (this.energy < CONVOY.energyMinExit && c.x > CONVOY.fence - 60) h = "Not enough Energy for the coast  ·  you need 60%  ·  feed again";
    else if (this.energy < CONVOY.energyMinExit) h = touch ? `Bank Energy for the coast  ·  ${Math.round(this.energy * 100)}% of 60%  ·  hold FEED in a paddock` : `Bank Energy for the coast  ·  ${Math.round(this.energy * 100)}% of 60%  ·  SPACE feed`;
    else h = "Enough Energy  ·  past the end of the ridge, into the dark cloud";
    this.hint = h;
  }

  lock(L) {
    super.lock(L);
    audio.setMusic(null);
    audio.fx("l9StingSpotted", { gain: 0.9 });
  }

  update(dt, input) {
    this.musicHold = -1e9;
    // pen heat follows whichever paddock you're nearest
    const c = this.g.creature;
    let best = CONVOY.cows[0];
    for (const x of CONVOY.cows) if (Math.abs(x - c.x) < Math.abs(best - c.x)) best = x;
    this.C.pen = { x0: best - 150, x1: best + 150 };
    super.update(dt, input);
    const g = this.g;
    const play = g.mode === "play";
    if (audio.ctx && audio.amb) {
      audio.bed("l9ConvoyAmb", play || g.mode === "fail" ? 0.6 : 0, audio.amb);
      audio.bed("l9ConvoyMusic", play ? 0.7 : 0, audio.music);
    }
    if (play) {
      // a pointing soldier turns the nearest truck to hunt
      this.turnCool = Math.max(0, this.turnCool - dt);
      const pointing = this.soldiers.some((so) => so.radioed);
      if (pointing && this.turnCool <= 0) {
        let best = null;
        for (const tr of this.trucks) if (!best || Math.abs(tr.x - c.x) < Math.abs(best.x - c.x)) best = tr;
        if (best) {
          best.hunt = 5;
          this.turnCool = 10;
          audio.fx("l9StingConvoyTurns", { gain: 0.95, pan: this.panOf(best.x) });
          g.onEvent("convoy-turns");
        }
      }
      if (c.x > CONVOY.exitX - 400 && this.energy < CONVOY.energyMinExit) c.x = Math.min(c.x, CONVOY.fence); // can't leave without Energy
    }
  }

  win() {
    const g = this.g;
    g.mode = "win";
    this.endT = 0;
    audio.releaseDuck(0.6);
    audio.setMusic(null);
    try { localStorage.setItem("nh-energy-l9", String(Math.round(this.energy * 100))); } catch { /* private */ }
    g.onEvent("win");
  }

  // ---------------------------------------------------------------- art
  drawHangarBack() {}
  drawHangarFront() {}

  drawGround(ctx, s, camX, VW) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.floor, 0, GROUND - 2, VW, VH - GROUND + 2);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    // the ridge road
    const a0 = camX - 50, a1 = camX + VW + 50;
    ctx.fillStyle = "#0b0b0c";
    ctx.fillRect(a0, GROUND + 8, a1 - a0, 24);
  }

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 300, R = camX + VW + 300;
    ctx.fillStyle = "#08090a";
    for (const x of this.posts) if (x > L && x < R) ctx.fillRect(x - 1.5, GROUND - 20, 3, 22);
    // paddock rails
    ctx.strokeStyle = "#0b0c0e";
    ctx.lineWidth = 2;
    for (const cx of CONVOY.cows) {
      if (cx < L || cx > R) continue;
      ctx.beginPath();
      ctx.moveTo(cx - 150, GROUND - 18);
      ctx.lineTo(cx + 150, GROUND - 18);
      for (let x = cx - 150; x <= cx + 150; x += 50) (ctx.moveTo(x, GROUND + 2), ctx.lineTo(x, GROUND - 22));
      ctx.stroke();
    }
    // parked trucks under the fixed lights
    for (const T of this.lights) {
      if (T.x < L || T.x > R) continue;
      ctx.fillStyle = "#07080a";
      ctx.fillRect(T.x - 70, GROUND - 60, 110, 46);
      ctx.fillRect(T.x + 40, GROUND - 44, 34, 30);
      ctx.beginPath();
      ctx.arc(T.x - 46, GROUND - 10, 11, 0, TAU);
      ctx.arc(T.x + 50, GROUND - 10, 11, 0, TAU);
      ctx.fill();
      ctx.fillRect(T.x - 6, T.y + 4, 12, GROUND - 60 - T.y);
      ctx.save();
      ctx.translate(T.x, T.y);
      ctx.rotate(T.ang);
      ctx.fillRect(-8, -9, 22, 18);
      ctx.restore();
    }
  }

  drawGlows(ctx, t, camX, VW) {
    // the few warm lights: parked trucks' headlights and the red tail-lights
    const L = camX - 200, R = camX + VW + 200;
    ctx.globalCompositeOperation = "lighter";
    for (const T of this.lights) {
      if (T.x < L || T.x > R || this.empDark(T.x, GROUND - 30)) continue;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(this.glowS, T.x + 60, GROUND - 52, 40, 30);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glowR, T.x - 80, GROUND - 46, 16, 16);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

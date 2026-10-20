// Level 8: Power Station (Game King, sandbox-gk-l8). Chain-link, transformers, sodium yard lamps.
// Your presence costs: within interR of a lamp the radios crackle (l8StingRadioScream) and the lamp stutters for
// ~1.3 s (the warning). Stay and the lamp locks to full flood and the crew under it look up; it stays alerted ~7 s.
// Inside an alerted lamp's lit pool, out of thick cloud, exposure builds and you're caught in ~2 s.
// Brushing a transformer arcs (l8StingArcFlash): every lamp near it alerts at once. EMP kills lamps in range.
// Same rules as Area 51: no combat.
import { VH, GROUND, POWER, POWER_CLOUDS, TUNE } from "./config.js?v=29";
import { clamp, rng, TAU } from "./util.js?v=29";
import { Area51, Figure } from "./a51.js?v=29";
import { audio } from "./audio.js?v=29";
import { personSpotted } from "./people.js?v=29";

const HIDE = 0.62;
const LY = GROUND - POWER.lampH;

export class Power extends Area51 {
  constructor(game) {
    super(game, POWER, POWER_CLOUDS);
  }

  build() {
    super.build();
    this.crew = POWER.lamps.map((x, i) => new Figure(x + (i % 2 ? 40 : -40), "soldier", i % 2 ? -1 : 1));
    const r = rng(808);
    this.pylons = [];
    for (let x = 400; x < POWER.W; x += 700) this.pylons.push(x + r() * 80);
  }

  reset(cp = this.checkpoint) {
    super.reset(cp === 0 ? 1 : cp);
    this.checkpoint = cp;
    this.alert = 0;
    this.alarmNext = 1e9;
    for (const tr of this.trucks) tr.active = false;
    if (cp === 2 && this.cpPos) {
      this.g.creature.reset(this.cpPos.x, this.cpPos.y);
      this.camX = Math.max(0, this.cpPos.x - this.g.VW * 0.5);
      this.cows.forEach((cw, i) => (cw.gone = this.cpFed && this.cpFed.includes(i)));
    }
    this.lamps = POWER.lamps.map((x) => ({ x, px: x, state: "calm", t: 0, cool: 0 }));
    for (const f of this.crew) f.reset();
    this.arcCool = 0;
    this.litSeen = false;
    audio.setMusic(null);
    this.g.warmOnce(8);
    this.setHint();
  }

  harvest(cw) {
    super.harvest(cw);
    this.alert = 0;
    for (const tr of this.trucks) tr.active = false;
    this.cpPos = { x: cw.x, y: 180 };
    this.cpFed = this.cows.map((w, i) => (w.gone ? i : -1)).filter((i) => i >= 0);
  }

  setHint() {
    const touch = this.g.touchy ? this.g.touchy() : true;
    const c = this.g.creature;
    const warn = this.lamps && this.lamps.some((L) => L.state === "warn");
    let h;
    if (warn) h = "The radios hear you  ·  get away from the lamp";
    else if (!this.harvested && c.x > POWER.fence - 60) h = "Go back  ·  you haven't fed";
    else if (!this.harvested) h = touch ? "Your power bleeds into theirs  ·  keep clear of the yard lamps  ·  hold FEED" : "Your power bleeds into theirs  ·  keep clear of the yard lamps  ·  SPACE feed";
    else if (this.energy < POWER.energyMinExit) h = "Too weak to leave  ·  feed again";
    else h = "Over the far fence  ·  into the dark cloud";
    this.hint = h;
  }

  lock(L) {
    super.lock(L);
    audio.setMusic(null);
  }

  update(dt, input) {
    this.musicHold = -1e9;
    super.update(dt, input);
    const g = this.g;
    const play = g.mode === "play";
    if (audio.ctx && audio.amb) {
      audio.bed("l8PowerAmb", play || g.mode === "fail" ? 0.6 : 0, audio.amb);
      audio.bed("l8PowerMusic", play ? 0.7 : 0, audio.music);
    }
    for (const f of this.crew) f.update(dt, -1e9, 1e9);
    if (play) this.updateLamps(dt);
    this.setHint();
  }

  updateLamps(dt) {
    const c = this.g.creature;
    const hidden = this.occ >= HIDE;
    // arc flash: brushing a transformer
    this.arcCool = Math.max(0, this.arcCool - dt);
    for (const tx of POWER.transformers) {
      if (this.arcCool > 0) break;
      if (Math.hypot(c.x - tx, c.y - (GROUND - 30)) < POWER.arcR + 80) {
        this.arcCool = 8;
        audio.fx("l8StingArcFlash", { gain: 1, pan: this.panOf(tx) });
        this.g.flash = Math.max(this.g.flash, this.g.settings.reducedFlash ? 0.15 : 0.5);
        this.g.shake = 3;
        for (const L of this.lamps) if (Math.abs(L.x - tx) < 600 && L.state === "calm") (L.state = "warn"), (L.t = 0);
        this.g.onEvent("power-arc");
      }
    }
    let lit = false;
    for (let i = 0; i < this.lamps.length; i++) {
      const L = this.lamps[i];
      const dark = this.empDark(L.x, LY);
      const near = !dark && Math.hypot(c.x - L.x, c.y - LY) < POWER.interR;
      L.cool = Math.max(0, L.cool - dt);
      if (dark) {
        if (L.state !== "calm") L.state = "calm";
        continue;
      }
      if (L.state === "calm" && near && L.cool <= 0) {
        L.state = "warn";
        L.t = 0;
        audio.fx("l8StingRadioScream", { gain: 0.9, pan: this.panOf(L.x) });
        this.g.onEvent("power-crackle");
      } else if (L.state === "warn") {
        L.t += dt;
        if (!near && L.t > 0.3 && Math.hypot(c.x - L.x, c.y - LY) > POWER.interR * 1.25) {
          L.state = "calm"; // you backed off in time: the crackle dies away
          L.cool = 2;
        } else if (L.t >= POWER.interWarn) {
          L.state = "alert";
          L.t = POWER.alertHold;
          this.crew[i].state = "look";
          try { personSpotted?.({ kind: "guard", x: L.x }, "look"); } catch {} // v28 voice hook
          this.g.onEvent("power-alert");
        }
      } else if (L.state === "alert") {
        if (near) L.t = Math.max(L.t, 2);
        L.t -= dt;
        if (L.t <= 0) (L.state = "calm"), (L.cool = 3), (this.crew[i].state = "idle"), (L.px = L.x);
        // v29: an alerted lamp swings its pool toward a craft that's low or feeding nearby (stops the low lamp-skim to the gap cow)
        const chase = (c.feedAmt > 0.1 || c.y > POWER.poolY) && Math.abs(c.x - L.x) < POWER.swingR + POWER.poolR;
        const want = chase ? clamp(c.x, L.x - POWER.swingR, L.x + POWER.swingR) : L.x;
        L.px += clamp(want - L.px, -POWER.swingSpeed * dt, POWER.swingSpeed * dt);
        const inPool = Math.abs(c.x - L.px) < POWER.poolR && c.y > POWER.poolY;
        if (inPool && !hidden) lit = true;
        const f = this.crew[i];
        if (inPool) (f.pointWant = 1), (f.dir = Math.sign(c.x - f.x) || f.dir), (f.pointAng = Math.atan2(c.y - (GROUND - 43), Math.abs(c.x - f.x)));
        else f.pointWant = 0;
      }
    }
    if (lit) {
      let w = 1;
      if (c.y > TUNE.dangerLowY) w *= 1.35;
      if (c.feedAmt > 0.3) w *= 1.3;
      this.exposure += dt * (w + 0.45);
      if (!this.litSeen) (this.litSeen = true), audio.shock("spotted"), this.g.onEvent("spotted:yard");
      if (this.exposure > POWER.failExposure * 0.65 && !this.failWarned) (this.failWarned = true), audio.preShock(1.2, 4);
      if (this.exposure >= POWER.failExposure) this.fail();
    } else this.litSeen = false;
  }

  win() {
    const g = this.g;
    g.mode = "win";
    this.endT = 0;
    audio.releaseDuck(0.6);
    audio.setMusic(null);
    g.onEvent("win");
  }

  // ---------------------------------------------------------------- art
  drawHangarBack() {}
  drawHangarFront() {}

  drawGround(ctx, s, camX, VW) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.floor, 0, GROUND - 2, VW, VH - GROUND + 2);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    // gravel yard
    const a0 = Math.max(camX - 50, POWER.yard.x0), a1 = Math.min(camX + VW + 50, POWER.yard.x1);
    if (a1 > a0) (ctx.fillStyle = "#0c0c0d"), ctx.fillRect(a0, GROUND + 4, a1 - a0, 30);
  }

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 300, R = camX + VW + 300;
    // pylons and lines across the sky
    ctx.strokeStyle = "#0b0c0e";
    ctx.lineWidth = 2;
    for (const px of this.pylons) {
      if (px < L - 700 || px > R + 700) continue;
      ctx.beginPath();
      ctx.moveTo(px - 30, GROUND + 2);
      ctx.lineTo(px, GROUND - 260);
      ctx.lineTo(px + 30, GROUND + 2);
      ctx.moveTo(px - 40, GROUND - 220);
      ctx.lineTo(px + 40, GROUND - 220);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 40, GROUND - 220);
      ctx.quadraticCurveTo(px + 350, GROUND - 190, px + 660, GROUND - 220);
      ctx.stroke();
      ctx.lineWidth = 2;
    }
    // transformers
    ctx.fillStyle = "#090a0c";
    for (const tx of POWER.transformers) {
      if (tx < L || tx > R) continue;
      ctx.fillRect(tx - 40, GROUND - 60, 80, 62);
      for (let k = -1; k <= 1; k++) ctx.fillRect(tx + k * 24 - 3, GROUND - 92, 6, 32);
    }
    // chain-link with razor wire
    const y0 = POWER.yard.x0, y1 = POWER.yard.x1;
    ctx.strokeStyle = "rgba(30,32,36,0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const fx of [y0, y1]) if (fx > L && fx < R) (ctx.moveTo(fx, GROUND + 2), ctx.lineTo(fx, GROUND - 50));
    ctx.moveTo(Math.max(L, y0), GROUND - 46);
    ctx.lineTo(Math.min(R, y1), GROUND - 46);
    for (let x = Math.max(y0, Math.floor(L / 30) * 30); x < Math.min(R, y1); x += 30) (ctx.moveTo(x, GROUND + 2), ctx.lineTo(x + 15, GROUND - 46));
    ctx.stroke();
    // lamp posts
    ctx.fillStyle = "#08090a";
    for (const Lp of this.lamps) {
      if (Lp.x < L || Lp.x > R) continue;
      ctx.fillRect(Lp.x - 3, LY, 6, POWER.lampH + 2);
      ctx.fillRect(Lp.x - 14, LY - 4, 28, 6);
    }
    for (let i = 0; i < this.crew.length; i++) if (this.lamps[i].state === "alert") this.crew[i].draw(ctx, 0.7);
  }

  drawGlows(ctx, t, camX, VW) {
    const L = camX - 300, R = camX + VW + 300;
    ctx.globalCompositeOperation = "lighter";
    for (const Lp of this.lamps) {
      if (Lp.x < L || Lp.x > R || this.empDark(Lp.x, LY)) continue;
      const k = Lp.state === "alert" ? 1 : Lp.state === "warn" ? (Math.random() < 0.45 ? 0.15 : 0.8) : 0.45;
      ctx.globalAlpha = 0.9 * k;
      ctx.drawImage(this.glowS, Lp.x - 22, LY - 22, 44, 44);
      // the lit pool (reads as the danger zone; full only when alerted)
      ctx.globalAlpha = 0.35 * k;
      ctx.drawImage(this.glowS, (Lp.px ?? Lp.x) - POWER.poolR - 60, POWER.poolY, (POWER.poolR + 60) * 2, GROUND - POWER.poolY + 30);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

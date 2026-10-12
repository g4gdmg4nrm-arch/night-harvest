// Level 6: Rodeo Fairground (Game King, sandbox-gk-l6). Fairground bulbs in fog. New scare: the BAIT, a cow alone
// in a soft warm cone, too bright and too still. Scout it (hover high and near for 1.5 s) and you see the tripod
// and wire: it's a decoy. Drop low on it and the trap springs: relay clack + l6StingBaitTrap + bulbs stutter for
// 1.3 s (get out = it misses you), then l6StingFloodlights and the nearby towers snap straight onto you.
// The real feed is in the rodeo arena under sweeping floodlights. Same rules as Area 51: no combat.
import { VH, GROUND, RODEO, RODEO_CLOUDS } from "./config.js?v=23";
import { clamp, lerp, rng, TAU } from "./util.js?v=23";
import { Cow } from "./actors.js?v=23";
import { Area51 } from "./a51.js?v=23";
import { audio } from "./audio.js?v=23";

const HIDE = 0.62;

export class Rodeo extends Area51 {
  constructor(game) {
    super(game, RODEO, RODEO_CLOUDS);
  }

  build() {
    super.build();
    const r = rng(606);
    this.baitCow = new Cow();
    this.tents = [1150, 1700, 2600];
    this.bulbs = [];
    for (let x = 600; x < 3000; x += 34) this.bulbs.push({ x, y: GROUND - 92 + Math.sin(x * 0.012) * 14, p: r() * TAU });
  }

  reset(cp = this.checkpoint) {
    super.reset(cp === 0 ? 1 : cp); // no hangar: a fresh start is already out
    this.checkpoint = cp;
    this.alert = cp === 2 ? 2 : 0;
    this.alarmNext = cp === 2 ? 3 : 1e9;
    const b = this.baitCow;
    b.reset();
    b.x = RODEO.bait.x;
    b.homeX = RODEO.bait.x;
    this.bait = { state: "idle", t: 0, scoutT: 0, revealed: false, cool: 0 };
    this.stutter = 0;
    this.trucks.forEach((tr, i) => {
      tr.x = -300 - i * 300;
      tr.stopX = RODEO.truckStops[i];
    });
    audio.setMusic(null);
    this.g.warmOnce(6);
    this.setHint();
  }

  setHint() {
    const touch = this.g.touchy ? this.g.touchy() : true;
    const c = this.g.creature;
    const B = this.bait;
    let h;
    if (B && B.state === "warn") h = "A trap  ·  get out NOW";
    else if (B && B.revealed && !this.harvested) h = "Too still  ·  that cow is a decoy  ·  the real ones are in the arena";
    else if (!this.harvested && c.x > RODEO.fence - 60) h = "Go back  ·  you haven't fed";
    else if (!this.harvested) h = touch ? "Easy food is a lie  ·  scout before you drop  ·  hold FEED" : "Easy food is a lie  ·  scout before you drop  ·  hold SPACE";
    else if (this.energy < RODEO.energyMinExit) h = "Too weak to leave  ·  feed again";
    else h = "Get past the stock yards  ·  into the dark cloud";
    this.hint = h;
  }

  lock(L) {
    super.lock(L);
    audio.setMusic(null); // this level's music is its own bed
  }

  update(dt, input) {
    this.musicHold = -1e9; // never let the Area 51 music switcher run here
    super.update(dt, input);
    const g = this.g;
    const play = g.mode === "play";
    if (audio.ctx && audio.amb) {
      audio.bed("l6RodeoAmb", play || g.mode === "fail" ? 0.6 : 0, audio.amb);
      audio.bed("l6RodeoMusic", play ? 0.7 : 0, audio.music);
    }
    if (play) this.updateBait(dt);
    this.stutter = Math.max(0, this.stutter - dt);
  }

  updateBait(dt) {
    const c = this.g.creature;
    const B = this.bait;
    const dx = Math.abs(c.x - RODEO.bait.x);
    // scouting: hover high and near for a moment and the decoy gives itself away
    if (!B.revealed && dx < RODEO.baitScoutR && c.y < RODEO.baitScoutY && B.state === "idle") {
      B.scoutT += dt;
      if (B.scoutT >= RODEO.baitScoutT) {
        B.revealed = true;
        audio.fx("searchlightPass", { gain: 0.35, pan: this.panOf(RODEO.bait.x) });
        this.g.onEvent("bait-revealed");
        this.setHint();
      }
    } else if (!B.revealed) B.scoutT = Math.max(0, B.scoutT - dt * 0.5);
    if (B.state === "cool") {
      B.cool -= dt;
      if (B.cool <= 0) B.state = "idle";
      return;
    }
    const low = c.y > RODEO.baitTrigY || c.feedAmt > 0.2;
    if (B.state === "idle" && dx < RODEO.baitTrigR && low) {
      B.state = "warn";
      B.t = 0;
      audio.fx("l6StingBaitTrap", { gain: 1, pan: this.panOf(RODEO.bait.x) });
      this.g.onEvent("bait-trap");
      this.setHint();
      return;
    }
    if (B.state === "warn") {
      B.t += dt;
      this.stutter = 0.2;
      const away = dx > RODEO.baitTrigR * 2.4 || c.y < RODEO.baitTrigY - 90 || this.occ >= HIDE;
      if (away) {
        // got out inside the warning: the floodlights come up on an empty ring
        B.state = "cool";
        B.cool = 6;
        for (const L of this.lights) if (Math.abs(L.x - RODEO.bait.x) < RODEO.baitFloodR) L.alertT = 6;
        this.g.onEvent("bait-escaped");
        this.setHint();
        return;
      }
      if (B.t >= RODEO.baitWarn) {
        B.state = "sprung";
        B.t = 0;
        audio.fx("l6StingFloodlights", { gain: 1, pan: this.panOf(RODEO.bait.x) });
        this.g.shake = 4;
        this.g.flash = Math.max(this.g.flash, this.g.settings.reducedFlash ? 0.15 : 0.45);
        let first = true;
        for (const L of this.lights) {
          if (Math.abs(L.x - RODEO.bait.x) > RODEO.baitFloodR || L.dark > 0) continue;
          L.ang = Math.atan2(c.y - L.y, c.x - L.x);
          if (first) this.lock(L), (first = false);
          else L.state = "lock", (L.outT = 0);
        }
        this.alert = Math.max(this.alert, 1);
        this.g.onEvent("bait-sprung");
      }
      return;
    }
    if (B.state === "sprung") {
      B.t += dt;
      if (B.t > 8) (B.state = "cool"), (B.cool = 6);
    }
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
  drawGround(ctx, s, camX, VW, t) {
    // packed dirt and straw, no runway (Area 51's drawGround would paint tarmac + blue edge lights)
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.floor, 0, GROUND - 2, VW, VH - GROUND + 2);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    ctx.fillStyle = "#070707";
    for (const b of this.scrub) {
      if (b.x < camX - 50 || b.x > camX + VW + 50) continue;
      ctx.beginPath();
      ctx.ellipse(b.x, GROUND + 12 + b.y, 9 * b.s, 5 * b.s, 0, Math.PI, TAU);
      ctx.fill();
    }
  }

  drawHangarBack() {}
  drawHangarFront() {}

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 400;
    const R = camX + VW + 400;
    ctx.fillStyle = "#08090b";
    ctx.strokeStyle = "#0a0b0d";
    // ferris wheel (stopped)
    const fx = 900, fy = GROUND - 190;
    if (fx > L && fx < R) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx, fy, 150, 0, TAU);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(a) * 150, fy + Math.sin(a) * 150);
      }
      ctx.moveTo(fx - 70, GROUND + 2);
      ctx.lineTo(fx, fy);
      ctx.lineTo(fx + 70, GROUND + 2);
      ctx.stroke();
    }
    // tents
    for (const x of this.tents) {
      if (x < L || x > R) continue;
      ctx.beginPath();
      ctx.moveTo(x - 90, GROUND + 2);
      ctx.lineTo(x - 80, GROUND - 50);
      ctx.lineTo(x, GROUND - 96);
      ctx.lineTo(x + 80, GROUND - 50);
      ctx.lineTo(x + 90, GROUND + 2);
      ctx.fill();
    }
    // bulb string poles
    for (let x = 600; x < 3000; x += 340) if (x > L && x < R) ctx.fillRect(x - 2, GROUND - 100, 4, 102);
    // the arena: rails + chutes
    const p0 = RODEO.pen.x0, p1 = RODEO.pen.x1;
    if (p1 > L && p0 < R) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const y of [GROUND - 26, GROUND - 12]) (ctx.moveTo(p0 - 40, y), ctx.lineTo(p1 + 40, y));
      for (let x = p0 - 40; x <= p1 + 40; x += 45) (ctx.moveTo(x, GROUND + 2), ctx.lineTo(x, GROUND - 32));
      ctx.stroke();
    }
    // stock yard pens toward the exit
    for (let x = 3900; x < RODEO.fence; x += 120) if (x > L && x < R) ctx.fillRect(x, GROUND - 20, 90, 3), ctx.fillRect(x, GROUND - 22, 3, 24);
    // the bait: a cow alone in a ring of hay bales. Once scouted: tripod + wire glint
    const bx = RODEO.bait.x;
    if (bx > L && bx < R) {
      for (const k of [-90, -50, 50, 90]) ctx.fillRect(bx + k - 14, GROUND - 12, 28, 14);
      const B = this.bait;
      if (B && B.revealed) {
        ctx.strokeStyle = `rgba(200,205,215,${0.35 + 0.25 * Math.sin(t * 5)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx - 4, GROUND - 46);
        ctx.lineTo(bx - 24, GROUND + 2);
        ctx.moveTo(bx + 4, GROUND - 46);
        ctx.lineTo(bx + 24, GROUND + 2);
        ctx.moveTo(bx, GROUND - 46);
        ctx.lineTo(RODEO.towers[1].x, RODEO.towers[1].y + 20); // the trip wire to the tower
        ctx.stroke();
      }
      ctx.save();
      this.baitCow.draw(ctx, 0.15);
      ctx.restore();
    }
    // searchlight towers (Area 51 lattice)
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
      for (let k = 1; k <= 6; k++) {
        const y1 = GROUND - (h * k) / 6;
        const w1 = lerp(24, 9, k / 6);
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
    // the warm lights: fairground bulbs (stutter when the trap springs, die in an EMP) + the bait's soft cone
    const L = camX - 200;
    const R = camX + VW + 200;
    ctx.globalCompositeOperation = "lighter";
    const st = this.stutter > 0 && Math.random() < 0.5;
    for (const b of this.bulbs) {
      if (b.x < L || b.x > R || this.empDark(b.x, b.y) || st) continue;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 1.7 + b.p);
      ctx.drawImage(this.glowS, b.x - 7, b.y - 7, 14, 14);
    }
    const fx = 900, fy = GROUND - 190;
    if (fx > L && fx < R && !this.empDark(fx, fy) && !st)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        ctx.globalAlpha = 0.7;
        ctx.drawImage(this.glowS, fx + Math.cos(a) * 150 - 9, fy + Math.sin(a) * 150 - 9, 18, 18);
      }
    const bx = RODEO.bait.x;
    if (bx > L && bx < R && !this.empDark(bx, GROUND - 120)) {
      const B = this.bait;
      ctx.globalAlpha = B && B.state === "warn" ? (Math.random() < 0.5 ? 0.2 : 0.9) : 0.6;
      ctx.drawImage(this.glowS, bx - 160, GROUND - 120, 320, 150);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.glowS, bx - 18, GROUND - 150, 36, 36);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

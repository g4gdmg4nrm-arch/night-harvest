// Level 5: Small Town (Game King, sandbox-gk-l5). Two streets watching each other across the square.
// Feeding on one street WAKES THE OTHER: its windows go dark together (listening, l5StingWindowsDark), then
// blaze on, dogs go off (l5StingDogsWake) and people come out onto the porches and look up. Out of thick cloud
// over an awake street they see you: gasps and pointing for ~1.4 s (the warning; ~2.8 s if you're high), then the
// nearest spotlight snaps on and locks. An awake street settles after ~18 s. Lesson: plan the order.
// Same rules as Area 51: no combat; hide / feed / burst / EMP (an EMP over a street blinds its porches).
import { VH, GROUND, TOWN, TOWN_CLOUDS } from "./config.js?v=30";
import { lerp, rng, TAU } from "./util.js?v=30";
import { Area51, Figure } from "./a51.js?v=30";
import { audio } from "./audio.js?v=30";
import { personSpotted } from "./people.js?v=30";

const HIDE = 0.62;

export class Town extends Area51 {
  constructor(game) {
    super(game, TOWN, TOWN_CLOUDS);
  }

  build() {
    super.build();
    const r = rng(505);
    this.streets = TOWN.streets.map((S) => {
      const houses = [];
      for (let x = S.x0; x < S.x1 - 60; x += 150 + r() * 40) houses.push({ x, w: 100 + r() * 30, h: 60 + r() * 30, roof: 22 + r() * 14, lit: r() < 0.25 });
      const people = houses.filter((_, i) => i % 2 === 0).map((h, i) => new Figure(h.x + h.w * 0.5, "civ", i % 2 ? 1 : -1));
      return { ...S, houses, people };
    });
  }

  reset(cp = this.checkpoint) {
    super.reset(cp === 0 ? 1 : cp); // no hangar
    this.checkpoint = cp;
    this.alert = 0;
    this.alarmNext = 1e9;
    for (const tr of this.trucks) tr.active = false; // no army in town (yet)
    if (cp === 2 && this.cpPos) {
      const c = this.g.creature;
      c.reset(this.cpPos.x, this.cpPos.y);
      this.camX = Math.max(0, this.cpPos.x - this.g.VW * 0.5);
      // keep the street you already fed on fed
      this.cows.forEach((cw, i) => (cw.gone = this.cpFed && this.cpFed.includes(i)));
    }
    for (const S of this.streets) {
      S.state = "asleep";
      S.wake = 0;
      S.holdT = 0;
      S.watchT = 0;
      S.gasped = false;
      S.cool = 0;
      for (const p of S.people) p.reset(), (p.state = "gone");
    }
    audio.setMusic(null);
    this.g.warmOnce(5);
    this.setHint();
  }

  harvest(cw) {
    super.harvest(cw);
    this.alert = 0; // the town has no alarm siren; the streets do the watching
    for (const tr of this.trucks) tr.active = false;
    this.cpPos = { x: cw.x, y: 180 };
    this.cpFed = this.cows.map((w, i) => (w.gone ? i : -1)).filter((i) => i >= 0);
  }

  setHint() {
    const touch = this.g.touchy ? this.g.touchy() : true;
    const c = this.g.creature;
    const S = this.streets && this.streets.find((s) => s.state === "awake" || s.state === "listening");
    let h;
    if (S && S.state === "listening") h = `${S.name} has gone dark  ·  it's listening`;
    else if (S && S.state === "awake" && !(this.harvested && this.energy >= TOWN.energyMinExit && c.x > S.x1)) h = `${S.name} is awake  ·  stay in thick cloud, or wait for it to settle`;
    else if (!this.harvested && c.x > TOWN.fence - 60) h = "Go back  ·  you haven't fed";
    else if (!this.harvested) h = touch ? "Two streets, watching each other  ·  feeding on one wakes the other  ·  plan your order" : "Two streets, watching each other  ·  feeding on one wakes the other  ·  SPACE feed";
    else if (this.energy < TOWN.energyMinExit) h = "Too weak to leave  ·  feed again";
    else h = "Out past the last houses  ·  into the dark cloud";
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
      audio.bed("l5TownAmb", play || g.mode === "fail" ? 0.6 : 0, audio.amb);
      audio.bed("l5TownMusic", play ? 0.7 : 0, audio.music);
    }
    for (const S of this.streets) for (const p of S.people) p.update(dt, S.x0 - 200, S.x1 + 200);
    if (play) this.updateStreets(dt);
  }

  updateStreets(dt) {
    const c = this.g.creature;
    const [A, B] = this.streets;
    const feedingOn = c.feedAmt > 0.3 ? this.streets.find((S) => c.x > S.x0 - 100 && c.x < S.x1 + 100) : null;
    for (const S of this.streets) {
      const other = feedingOn && feedingOn !== S;
      if (S.state === "asleep" || S.state === "listening") {
        if (other) S.wake += dt * TOWN.wakeRate;
        else S.wake = Math.max(0, S.wake - dt * 0.15);
        if (S.state === "asleep" && S.wake > 0.15) {
          S.state = "listening";
          audio.fx("l5StingWindowsDark", { gain: 0.95, pan: this.panOf((S.x0 + S.x1) / 2) });
          this.g.onEvent("town-listening");
          this.setHint();
        } else if (S.state === "listening" && S.wake <= 0) {
          S.state = "asleep";
          this.setHint();
        }
        if (S.wake >= 1) {
          S.state = "awake";
          S.holdT = TOWN.wakeHold;
          audio.fx("l5StingDogsWake", { gain: 1, pan: this.panOf((S.x0 + S.x1) / 2) });
          for (const p of S.people) p.reset(), (p.state = "idle");
          try { personSpotted?.({ kind: "civ", x: (S.x0 + S.x1) / 2 }, "look"); } catch {} // v28 voice hook
          this.g.onEvent("town-awake");
          this.setHint();
        }
      } else if (S.state === "awake") {
        if (other) S.holdT = Math.max(S.holdT, TOWN.wakeHold * 0.6); // more feeding keeps it up
        S.holdT -= dt;
        if (S.holdT <= 0) {
          S.state = "settling";
          S.holdT = TOWN.wakeFade;
        }
      } else if (S.state === "settling") {
        S.holdT -= dt;
        if (S.holdT <= 0) {
          S.state = "asleep";
          S.wake = 0;
          for (const p of S.people) p.state = "gone";
          this.g.onEvent("town-settled");
          this.setHint();
        }
      }
      // watching: an awake street sees you out of thick cloud above it
      S.cool = Math.max(0, S.cool - dt);
      const over = c.x > S.x0 - 150 && c.x < S.x1 + 150;
      const blind = this.empDark((S.x0 + S.x1) / 2, GROUND - 60) || this.empDark(c.x, GROUND - 60);
      const sees = S.state === "awake" && over && this.occ < HIDE && !blind && S.cool <= 0;
      const rate = c.y > TOWN.watchY || c.feedAmt > 0.2 || this.brushAny || this.lockedAny ? 1 : 0.5;
      S.watchT = sees ? S.watchT + dt * rate : Math.max(0, S.watchT - dt * 0.8);
      for (const p of S.people) {
        if (p.state === "gone") continue;
        p.state = S.watchT > 0.25 ? "look" : "idle";
        if (S.watchT > 0.25) p.dir = Math.sign(c.x - p.x) || p.dir;
        p.pointWant = S.watchT > 0.6 ? 1 : 0;
        p.pointAng = Math.atan2(c.y - (GROUND - 43), Math.abs(c.x - p.x));
      }
      if (S.watchT > 0.25 && !S.gasped) {
        S.gasped = true;
        audio.fx("gasp", { pan: this.panOf(c.x), gain: 0.9 });
        this.g.onEvent("town-seen-warn");
      }
      if (S.watchT <= 0.05) S.gasped = false;
      if (S.watchT >= TOWN.watchWarn) {
        // the nearest spotlight snaps onto where they're pointing
        let best = null;
        for (const L of this.lights) if (L.dark <= 0 && (!best || Math.abs(L.x - c.x) < Math.abs(best.x - c.x))) best = L;
        if (best) {
          best.ang = Math.atan2(c.y - best.y, c.x - best.x);
          this.lock(best);
        }
        S.watchT = 0;
        S.cool = 4;
        this.g.onEvent("town-spotted");
      }
    }
    void A, B;
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

  drawGround(ctx, s, camX, VW, t) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.drawImage(this.floor, 0, GROUND - 2, VW, VH - GROUND + 2);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    // the road through town
    const a0 = Math.max(camX - 50, 900), a1 = Math.min(camX + VW + 50, 4000);
    if (a1 > a0) {
      ctx.fillStyle = "#0b0b0c";
      ctx.fillRect(a0, GROUND + 10, a1 - a0, 22);
      ctx.fillStyle = "rgba(170,165,150,0.12)";
      for (let x = Math.floor(a0 / 90) * 90; x < a1; x += 90) ctx.fillRect(x, GROUND + 20, 40, 2);
    }
  }

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 300, R = camX + VW + 300;
    for (const S of this.streets) {
      if (S.x1 < L || S.x0 > R) continue;
      for (const h of S.houses) {
        ctx.fillStyle = "#08090b";
        ctx.fillRect(h.x, GROUND - h.h, h.w, h.h + 2);
        ctx.beginPath();
        ctx.moveTo(h.x - 8, GROUND - h.h);
        ctx.lineTo(h.x + h.w / 2, GROUND - h.h - h.roof);
        ctx.lineTo(h.x + h.w + 8, GROUND - h.h);
        ctx.fill();
        // v24 detail: weatherboards, moonlit roof edge, chimney, window frames, door and step
        ctx.strokeStyle = "rgba(120,132,150,0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = GROUND - h.h + 7; y < GROUND - 2; y += 6) (ctx.moveTo(h.x + 1, y), ctx.lineTo(h.x + h.w - 1, y));
        ctx.stroke();
        if (((h.x / 10) | 0) % 3 === 0) (ctx.fillStyle = "#08090b"), ctx.fillRect(h.x + h.w * 0.68, GROUND - h.h - h.roof * 0.75, 9, h.roof * 0.5);
        ctx.strokeStyle = "rgba(130,142,160,0.28)";
        ctx.beginPath();
        ctx.moveTo(h.x - 8, GROUND - h.h);
        ctx.lineTo(h.x + h.w / 2, GROUND - h.h - h.roof);
        ctx.lineTo(h.x + h.w + 8, GROUND - h.h);
        ctx.stroke();
        ctx.fillStyle = "rgba(14,17,22,1)";
        ctx.fillRect(h.x + 15, GROUND - h.h + 15, 18, 14);
        ctx.fillRect(h.x + h.w - 33, GROUND - h.h + 15, 18, 14);
        ctx.fillRect(h.x + h.w / 2 - 9, GROUND - 27, 18, 27);
        ctx.strokeStyle = "rgba(90,100,116,0.22)";
        ctx.beginPath();
        for (const wx of [h.x + 16, h.x + h.w - 32]) (ctx.rect(wx, GROUND - h.h + 16, 16, 12), ctx.moveTo(wx + 8, GROUND - h.h + 16), ctx.lineTo(wx + 8, GROUND - h.h + 28));
        ctx.stroke();
        ctx.fillStyle = "#0c0d10";
        ctx.fillRect(h.x + h.w / 2 - 13, GROUND - 2, 26, 4);
        // windows: asleep = a few warm; listening = all dark; awake = all blazing (settling = fading)
        const k = S.state === "awake" ? 1 : S.state === "settling" ? S.holdT / TOWN.wakeFade : S.state === "listening" ? 0 : h.lit ? 0.6 : 0;
        if (k > 0 && !this.empDark(h.x, GROUND - 40)) {
          ctx.fillStyle = `rgba(240,196,120,${0.55 * k})`;
          ctx.fillRect(h.x + 16, GROUND - h.h + 16, 16, 12);
          ctx.fillRect(h.x + h.w - 32, GROUND - h.h + 16, 16, 12);
          ctx.fillRect(h.x + h.w / 2 - 8, GROUND - 26, 16, 26); // open door
        }
      }
      // picket fence
      ctx.strokeStyle = "#0a0b0d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = S.x0; x < S.x1; x += 14) (ctx.moveTo(x, GROUND + 4), ctx.lineTo(x, GROUND - 10));
      ctx.moveTo(S.x0, GROUND - 6);
      ctx.lineTo(S.x1, GROUND - 6);
      ctx.stroke();
      for (const p of S.people) p.draw(ctx, S.state === "awake" ? 0.6 : 0.3);
    }
    // church on the square (its steeple carries a spotlight)
    const cx = 2450;
    if (cx > L && cx < R) {
      ctx.fillStyle = "#090a0c";
      ctx.fillRect(cx - 70, GROUND - 70, 140, 72);
      ctx.beginPath();
      ctx.moveTo(cx - 18, GROUND - 70);
      ctx.lineTo(cx - 18, GROUND - 130);
      ctx.lineTo(cx, GROUND - 175);
      ctx.lineTo(cx + 18, GROUND - 130);
      ctx.lineTo(cx + 18, GROUND - 70);
      ctx.fill();
    }
    // water towers / steeple light heads
    for (const T of this.lights) {
      if (T.x < L || T.x > R) continue;
      ctx.fillStyle = "#0b0c0e";
      if (T.x !== cx) {
        ctx.strokeStyle = "#0b0c0e";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(T.x - 22, GROUND + 2);
        ctx.lineTo(T.x - 12, T.y + 30);
        ctx.moveTo(T.x + 22, GROUND + 2);
        ctx.lineTo(T.x + 12, T.y + 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(T.x, T.y + 22, 30, 18, 0, 0, TAU);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(T.x, T.y);
      ctx.rotate(T.ang);
      ctx.fillRect(-8, -9, 22, 18);
      ctx.restore();
    }
    // street lamps
    for (let x = 1000; x < 3900; x += 380) if (x > L && x < R) (ctx.fillStyle = "#08090a"), ctx.fillRect(x - 2, GROUND - 110, 4, 112), ctx.fillRect(x - 2, GROUND - 110, 18, 3);
  }

  drawGlows(ctx, t, camX, VW) {
    const L = camX - 200, R = camX + VW + 200;
    ctx.globalCompositeOperation = "lighter";
    for (let x = 1000; x < 3900; x += 380) {
      if (x < L || x > R || this.empDark(x, GROUND - 110)) continue;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(this.glowS, x + 2, GROUND - 120, 24, 24);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(this.glowS, x - 110, GROUND - 60, 240, 100);
    }
    for (const S of this.streets) {
      if (S.state !== "awake" || S.x1 < L || S.x0 > R) continue;
      for (const h of S.houses) {
        if (this.empDark(h.x, GROUND - 40)) continue;
        ctx.globalAlpha = 0.35;
        ctx.drawImage(this.glowS, h.x - 30, GROUND - 70, h.w + 60, 90);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    void lerp;
  }
}

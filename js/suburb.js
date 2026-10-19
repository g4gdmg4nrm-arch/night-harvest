// Level 7: Suburb Backyards (Game King, sandbox-gk-l7). Dark houses that aren't asleep: bedroom windows hide
// phones. A phone glows on and tips toward the sky (l7StingPhoneGlow + a cold screen glow + the window face, ~1.4 s:
// the warning), then films straight up for 4 s. In its view cone and out of thick cloud you're exposed and caught
// in ~2 s. Feeding near a house wakes its phone ~1.6 s in. A phone that has filmed is spent for 12 s.
// Same rules as Area 51: no combat; hide / feed / burst / EMP (an EMP kills the phones in range for its duration).
import { VH, GROUND, SUBURB, SUBURB_CLOUDS, TUNE } from "./config.js?v=28";
import { rng, TAU } from "./util.js?v=28";
import { Area51, Figure } from "./a51.js?v=28";
import { audio } from "./audio.js?v=28";

const HIDE = 0.62;
const WIN_Y = GROUND - 62; // bedroom window height

export class Suburb extends Area51 {
  constructor(game) {
    super(game, SUBURB, SUBURB_CLOUDS);
  }

  build() {
    super.build();
    const r = rng(707);
    this.houses = [];
    for (let x = 700; x < 4250; x += 175 + r() * 50) this.houses.push({ x, w: 120 + r() * 30, h: 78 + r() * 20, roof: 26 + r() * 12 });
    this.trees = [];
    for (let i = 0; i < 14; i++) this.trees.push({ x: 700 + r() * 3500, h: 70 + r() * 50, lean: 6 + r() * 10 });
    this.faces = SUBURB.phones.map((P) => new Figure(P.x, "civ", 1));
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
    this.phones = SUBURB.phones.map((P) => ({ x: P.x, state: "off", t: P.first, k: 0 }));
    this.feedNearT = 0;
    this.phoneSeen = false;
    this.faceDone = false;
    audio.setMusic(null);
    this.g.warmOnce(7);
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
    const warn = this.phones && this.phones.some((P) => P.state === "warn" && Math.abs(P.x - c.x) < 500);
    let h;
    if (warn) h = "A phone is coming up  ·  get into thick cloud or out of its view";
    else if (!this.harvested && c.x > SUBURB.fence - 60) h = "Go back  ·  you haven't fed";
    else if (!this.harvested) h = touch ? "The houses look asleep  ·  watch the bedroom windows  ·  hold FEED" : "The houses look asleep  ·  watch the bedroom windows  ·  SPACE feed";
    else if (this.energy < SUBURB.energyMinExit) h = "Too weak to leave  ·  feed again";
    else h = "Past the last yard  ·  into the dark cloud";
    this.hint = h;
  }

  lock(L) {
    super.lock(L);
    audio.setMusic(null);
  }

  /** Is the craft inside this phone's upward view cone? */
  inCone(P) {
    const c = this.g.creature;
    const dy = WIN_Y - c.y;
    if (dy <= 0) return false;
    return Math.abs(c.x - P.x) < Math.tan(SUBURB.phoneCone) * dy + 120;
  }

  update(dt, input) {
    this.musicHold = -1e9;
    super.update(dt, input);
    const g = this.g;
    const play = g.mode === "play";
    if (audio.ctx && audio.amb) {
      audio.bed("l7SuburbAmb", play || g.mode === "fail" ? 0.6 : 0, audio.amb);
      audio.bed("l7SuburbMusic", play ? 0.7 : 0, audio.music);
    }
    this.phonesFilming = false;
    if (play) this.updatePhones(dt);
    this.setHint();
  }

  updatePhones(dt) {
    const c = this.g.creature;
    const hidden = this.occ >= HIDE;
    // feeding is heard: the nearest live phone wakes ~1.6 s into a feed
    const feeding = c.feedAmt > 0.3;
    this.feedNearT = feeding ? this.feedNearT + dt : Math.max(0, this.feedNearT - dt);
    if (this.feedNearT >= SUBURB.phoneFeedWake) {
      let best = null;
      for (const P of this.phones) if (P.state === "off" && Math.abs(P.x - c.x) < SUBURB.phoneFeedR && (!best || Math.abs(P.x - c.x) < Math.abs(best.x - c.x))) best = P;
      if (best) best.t = 0;
      this.feedNearT = 0;
    }
    let filming = false;
    for (let i = 0; i < this.phones.length; i++) {
      const P = this.phones[i];
      const dark = this.empDark(P.x, WIN_Y);
      P.t -= dt;
      if (P.state === "off" && P.t <= 0 && !dark) {
        P.state = "warn";
        P.t = SUBURB.phoneWarn;
        if (Math.abs(P.x - c.x) < 900) audio.fx("l7StingPhoneGlow", { gain: 0.9, pan: this.panOf(P.x), dist: this.distOf(P.x) });
        this.faces[i].state = "look";
        this.g.onEvent("phone-warn");
      } else if (P.state === "warn" && P.t <= 0) {
        P.state = "film";
        P.t = SUBURB.phoneFilm;
        if (!this.faceDone && this.inCone(P)) {
          this.faceDone = true;
          audio.fx("l7StingWindowFace", { gain: 0.9, pan: this.panOf(P.x) });
        }
      } else if (P.state === "film") {
        if (dark) P.t = 0;
        if (P.t <= 0) {
          P.state = "dead";
          P.t = SUBURB.phoneDead;
          this.faces[i].state = "idle";
        } else if (!hidden && this.inCone(P)) filming = true;
      } else if (P.state === "dead" && P.t <= 0) {
        P.state = "off";
        P.t = SUBURB.phoneGapMin + Math.random() * (SUBURB.phoneGapMax - SUBURB.phoneGapMin);
      }
      P.k = P.state === "warn" ? 1 - P.t / SUBURB.phoneWarn : P.state === "film" ? 1 : 0;
    }
    this.phonesFilming = filming;
    // a filming phone builds exposure like a locked beam (the base decays exposure when no beam is on you)
    if (filming) {
      let w = 1;
      if (c.y > TUNE.dangerLowY) w *= 1.35;
      if (c.feedAmt > 0.3) w *= 1.3;
      if (c.y < TUNE.dangerHighY - 20) w *= SUBURB.highSoften;
      this.exposure += dt * (w + 0.45);
      if (!this.phoneSeen) {
        this.phoneSeen = true;
        audio.shock("spotted");
        this.g.onEvent("spotted:phone");
      }
      if (this.exposure > SUBURB.failExposure * 0.65 && !this.failWarned) {
        this.failWarned = true;
        audio.preShock(1.2, 4);
      }
      if (this.exposure >= SUBURB.failExposure) this.fail();
    } else this.phoneSeen = false;
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
  }

  drawStructures(ctx, t, camX, VW) {
    const L = camX - 300, R = camX + VW + 300;
    ctx.fillStyle = "#08090b";
    for (const T of this.trees) {
      if (T.x < L || T.x > R) continue;
      ctx.fillRect(T.x - 3, GROUND - T.h * 0.5, 6, T.h * 0.5 + 2);
      ctx.beginPath();
      ctx.ellipse(T.x + T.lean + Math.sin(t * 1.3 + T.x) * 3, GROUND - T.h * 0.7, 34, T.h * 0.35, 0.2, 0, TAU);
      ctx.fill();
    }
    for (const h of this.houses) {
      if (h.x + h.w < L || h.x > R) continue;
      ctx.fillStyle = "#08090b";
      ctx.fillRect(h.x, GROUND - h.h, h.w, h.h + 2);
      ctx.beginPath();
      ctx.moveTo(h.x - 8, GROUND - h.h);
      ctx.lineTo(h.x + h.w / 2, GROUND - h.h - h.roof);
      ctx.lineTo(h.x + h.w + 8, GROUND - h.h);
      ctx.fill();
    }
    // backyards: chain-link + a shed per feeding yard
    ctx.strokeStyle = "#0b0c0e";
    ctx.lineWidth = 1;
    for (const yx of SUBURB.yards) {
      if (yx < L || yx > R) continue;
      ctx.beginPath();
      ctx.moveTo(yx - 140, GROUND - 16);
      ctx.lineTo(yx + 140, GROUND - 16);
      for (let x = yx - 140; x <= yx + 140; x += 40) (ctx.moveTo(x, GROUND + 2), ctx.lineTo(x, GROUND - 18));
      ctx.stroke();
    }
    // bedroom windows: black, or a cold phone glow with a face behind it
    for (let i = 0; i < this.phones.length; i++) {
      const P = this.phones[i];
      if (P.x < L || P.x > R) continue;
      ctx.fillStyle = "#050607";
      ctx.fillRect(P.x - 12, WIN_Y - 8, 24, 16);
      if (P.k > 0 && !this.empDark(P.x, WIN_Y)) {
        ctx.fillStyle = `rgba(180,200,235,${0.25 + 0.6 * P.k})`;
        ctx.fillRect(P.x - 3, WIN_Y + 4 - 8 * P.k, 6, 9); // the screen tips up
      }
    }
  }

  drawGlows(ctx, t, camX, VW) {
    const L = camX - 300, R = camX + VW + 300;
    ctx.globalCompositeOperation = "lighter";
    for (const P of this.phones) {
      if (P.x < L || P.x > R || P.k <= 0 || this.empDark(P.x, WIN_Y)) continue;
      ctx.globalAlpha = 0.4 * P.k + (P.state === "warn" ? 0.2 * Math.sin(t * 20) : 0);
      ctx.drawImage(this.glowW, P.x - 30, WIN_Y - 30, 60, 60);
      if (P.state === "film") {
        // the view cone straight up: faint, so you can read it
        const h = WIN_Y - 40;
        const w = Math.tan(SUBURB.phoneCone) * h;
        const g = ctx.createLinearGradient(0, WIN_Y, 0, 40);
        g.addColorStop(0, "rgba(150,170,210,0.16)");
        g.addColorStop(1, "rgba(150,170,210,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(P.x - 4, WIN_Y);
        ctx.lineTo(P.x - w - 120, 40);
        ctx.lineTo(P.x + w + 120, 40);
        ctx.lineTo(P.x + 4, WIN_Y);
        ctx.fill();
      }
    }
    // the few warm lights: a porch light every few houses
    for (let i = 0; i < this.houses.length; i += 4) {
      const h = this.houses[i];
      if (h.x < L || h.x > R || this.empDark(h.x, GROUND - 30)) continue;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.glowS, h.x + h.w * 0.5 - 40, GROUND - 60, 80, 60);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

// The first encounter: observe from cloud, descend, feed on the cow, get noticed, escape.
import { EMP, CRAFTS, VH, WORLD_W, GROUND, HOUSE, COW_X, CLOUD_LAYERS, CREATURE_START, TUNE, LEVELS, levelById, STORM_LAYERS, STORM } from "./config.js?v=30";
import { Area51 } from "./a51.js?v=30";
import { Town } from "./town.js?v=30";
import { Rodeo } from "./rodeo.js?v=30";
import { Suburb } from "./suburb.js?v=30";
import { Power } from "./power.js?v=30";
import { Convoy } from "./convoy.js?v=30";
import { Coast } from "./coast.js?v=30";
const MODS = { town: Town, rodeo: Rodeo, suburb: Suburb, power: Power, convoy: Convoy, coast: Coast };
import { clamp, damp, lerp, makeCanvas, noise1, smoothstep, TAU } from "./util.js?v=30";
import { Wind } from "./wind.js?v=30";
import { CloudField, cloudSprites } from "./clouds.js?v=30";
import { Scene } from "./scene.js?v=30";
import { Creature, MenuDirector } from "./creature.js?v=30";
import { Witness, Car, Cow, HerdCow } from "./actors.js?v=30";
import { audio } from "./audio.js?v=30";
import { hwyStart, hwyTick, hwyDraw, hwyTruck, HWY } from "./highway.js?v=30";

export class Game {
  constructor(canvas, trees, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.settings = settings;
    this.quality = 1;
    this.wind = new Wind();
    this.scene = new Scene(trees, this.quality);
    this.clouds = new CloudField(CLOUD_LAYERS, this.quality);
    this.quietClouds = this.clouds;
    // Storm Farm: faster drifting cloud that the gusts can shred, plus two heavy storm banks
    this.stormClouds = new CloudField(STORM_LAYERS, this.quality, { period: 80, regrow: STORM.regrowCalm });
    this.level = 2;
    this.L = levelById(2);
    this.howl = 0;
    this.creature = new Creature();
    this.director = new MenuDirector(this.creature, this.clouds);
    this.witness = new Witness();
    this.car = new Car();
    this.cow = new Cow();
    // Extra cows in the field (not harvestable) for a fuller farm
    this.herd = [
      new HerdCow(1180, 0.78, 3),
      new HerdCow(1520, 0.9, 7),
      new HerdCow(1680, 0.72, 11),
      new HerdCow(980, 0.65, 13),
    ];
    this.particles = [];
    this.colCanvas = makeCanvas(256, 512);
    this.vignette = this.makeVignette();
    this.mode = "menu";
    this.t = 0;
    this.camX = 800;
    this.VW = 1280;
    this.s = 1;
    this.shake = 0;
    this.flash = 0;
    this.nextFlash = 14 + Math.random() * 10;
    this.flashSeq = null;
    this.onEvent = () => {};
    this.resetEncounter(true);
    this.a51 = new Area51(this); // level 1 (its own scene; shares the creature, wind, audio and canvas)
  }

  makeVignette() {
    const c = makeCanvas(256, 144);
    const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 72, 30, 128, 72, 150);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.6, "rgba(0,0,0,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0.85)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 144);
    return c;
  }

  setQuality(q) {
    this.quality = q;
    this.scene.setQuality(q);
    this.creature.q = q; // v27: chrome skin has a cheap Lite version
    // v17 Lite tier (q = -1): cheaper clouds everywhere
    for (const cf of [this.quietClouds, this.stormClouds, this.a51 && this.a51.clouds, this.town && this.town.clouds, this.rodeo && this.rodeo.clouds, this.suburb && this.suburb.clouds, this.power && this.power.clouds, this.convoy && this.convoy.clouds, this.coast && this.coast.clouds]) if (cf) cf.lite = q < 0;
  }

  resize(VW, s) {
    this.VW = VW;
    this.s = s;
  }

  /** Pick the level by id (1 Area 51 Escape, 2 Quiet Farm, 3 Storm Farm). 2 and 3 are the same farm, different sky. */
  setLevel(n) {
    this.L = levelById(n | 0);
    this.level = this.L.id;
    this.clouds = this.L.storm ? this.stormClouds : this.quietClouds;
  }
  get isMod() {
    return this.L.kind === "a51" || !!MODS[this.L.kind];
  }
  /** The self-contained level module (Area 51 or levels 5-10), built on first use. */
  get mod() {
    const K = MODS[this.L.kind];
    if (!K) return this.a51;
    return this[this.L.kind] || (this[this.L.kind] = new K(this)); // this.town, this.rodeo, ... (main.js reads game.coast)
  }
  get isA51() {
    return this.isMod && this.mode !== "menu";
  }

  /** Checkpoint: restore every actor, the clouds, timers and audio scheduling together. */
  resetEncounter(menu = false) {
    if (!menu && this.isMod) return this.mod.reset(); // restart from its last checkpoint
    this.creature.bounds = null;
    this.clouds.reset();
    this.creature.reset(CREATURE_START.x, CREATURE_START.y);
    this.director.reset();
    this.witness.reset();
    this.car.reset();
    this.cow.reset();
    for (const h of this.herd) h.reset();
    this.particles.length = 0;
    this.scene.doorOpen = 0;
    this.gt = 0; // encounter time
    this.phase = "observe";
    this.harvested = false;
    this.progress = 0;
    this.exposure = 0;
    this.hiddenT = 0;
    this.winHidden = 0;
    this.lastKnown = null;
    this.empCool = 0; // v13: a fresh attempt starts with the EMP ready
    this.powerOut = 0;
    this.carDead = 0;
    this.emp = null;
    this.carNext = menu ? 6 : 9;
    this.carCool = 0;
    this.feedStarted = false;
    this.swooped = false;
    this.seenStreak = 0;
    this.feedHeard = -1;
    this.dogNext = 20 + Math.random() * 20;
    this.dogCool = 0;
    this.spotted = false;
    this.seeT = 0;
    this.beamAng = -2.2;
    this.beam = 0;
    this.searchDelay = -1;
    this.feedTime = 0;
    this.lastSteps = 0;
    this.endT = 0;
    this.vis = 0;
    this.occ = 1;
    this.wind.calm = 0;
    this.frameX = null;
    this.flicker = 0;
    this.carRolled = false;
    this.feedShock = false;
    this.distressed = false;
    this.exposedT = 0;
    this.failWarned = false;
    this.porchSeq = -1;
    this.porchSnap = 0;
    this.porchHush = false;
    this.porchDark = false;
    this.cowVy = 0;
    this.musicHold = 0;
    this.preFlash = false;
    // storm cycle (Storm Farm only)
    this.st = { phase: "calm", t: 0, dur: STORM.firstCalm, front: -1e4, crossed: true, n: 0, shreds: 0 };
    this.wind.storm = this.L.storm ? 0.45 : 0;
    this.wind.hush = 0;
    this.howl = 0;
    if (this.L.storm) this.nextFlash = 9 + Math.random() * 6;
    // checkpoint: nothing from the last attempt keeps playing (stings, screams, thunder, chase)
    clearTimeout(this.thunderTimer);
    clearTimeout(this.whineTimer);
    this.dogArmed = false;
    audio.stopAll();
    if (!menu && !this.L.highway && (this.L.id === 2 || this.L.id === 3)) this.warmOnce(this.L.id); // v20 (level 4 warms in hwyStart)
    if (!menu && this.L.highway) hwyStart(this); // level 4: old music off, warm only level 4's pack
    else if (!menu) audio.setMusic("calm");
  }

  /** v13 craft choice (Settings): applied to the shared creature. */
  setCraft(id) {
    this.craftId = CRAFTS[id] ? id : "stalker";
    this.creature.craft = CRAFTS[this.craftId];
  }
  /** v13 EMP: one shared recharge for every level. Returns true if it fired. */
  tryEmp() {
    if (this.mode !== "play" || this.empCool > 0) return false;
    this.empCool = EMP.cooldown;
    return true;
  }
  /** Farm EMP: the house, the porch light, the witness's torch and the car's headlights die if they're in the circle. */
  fireFarmEmp() {
    const c = this.creature;
    const R2 = EMP.radius * EMP.radius;
    const near = (x, y) => (x - c.x) ** 2 + (y - Math.max(c.y, GROUND - 120)) ** 2 < R2;
    this.emp = { x: c.x, y: Math.max(c.y, GROUND - 120), t: EMP.dark };
    if (near(HOUSE.door, GROUND - 60) || near(this.witness.x, GROUND - 40)) this.powerOut = EMP.dark;
    if (this.car.active && near(this.car.x, GROUND - 20)) this.carDead = EMP.dark;
    this.shake = 4;
    this.flash = Math.max(this.flash, this.settings.reducedFlash ? 0.1 : 0.3);
    audio.fx("empBlast", { gain: 1, pan: 0 });
    this.onEvent("emp");
  }
  /** Expanding ring at the moment of an EMP (world space). */
  drawEmpRing(ctx, E, age) {
    const k = clamp(age / 0.7, 0, 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(150,200,255,${0.55 * (1 - k)})`;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(E.x, E.y, EMP.radius * (0.2 + 0.8 * k), 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  /** v20: warm a level's sound pack once per level start (module constructors also call reset). */
  warmOnce(n) {
    if (this._warmed === n) return;
    this._warmed = n;
    audio.warmLevel(n);
  }
  startPlay(level = this.level) {
    this._warmed = null;
    this.setLevel(level);
    if (this.isMod) this.mod.checkpoint = 0; // a fresh start begins in the hangar
    this.mode = "play";
    this.resetEncounter(false);
    this.hintT = 0;
  }
  toMenu() {
    this.mode = "menu";
    this.setLevel(2); // the title screen is the farm at night
    this.resetEncounter(true);
    audio.setMusic("calm");
  }

  // ---------------------------------------------------------------- update
  /** v14 Quiet Farm storm ambience (Gamer Girl's sounds): wind + grass beds, far thunder every 15-40 s. */
  farmAudioTick(dt) {
    const on = !this.isA51 && this.L.id === 2 && !this.L.storm && (this.mode === "play" || this.mode === "fail");
    if (audio.ctx && audio.amb) {
      audio.bed("farmWindHeavy", on ? 0.6 : 0, audio.amb);
      audio.bed("grassRustle", on ? 0.4 : 0, audio.amb);
    }
    if (!on) { this.farThunderT = 15 + Math.random() * 25; return; }
    this.farThunderT -= dt;
    if (this.farThunderT <= 0) {
      this.farThunderT = 15 + Math.random() * 25;
      audio.fx("thunderFar", { amb: true, gain: 0.8, pan: -0.3 });
      // faint lightning lift deep in the clouds, far left (cheap: reuses the flash glow)
      this.scene.flashX = this.camX + this.VW * 0.2;
      this.flash = Math.max(this.flash, this.settings.reducedFlash ? 0.05 : 0.14);
    }
  }
  empTick(dt) {
    this.farmAudioTick(dt);
    if (this.mode === "play") {
      const was = this.empCool || 0;
      this.empCool = Math.max(0, was - dt);
      // v13 EMP hook: recharge ping. Silent until audio.js maps empReady to a file (Gamer Girl's pass).
      if (was > 0 && this.empCool === 0) { audio.fx("empReady", { gain: 0.8 }); this.onEvent("emp-ready"); }
    }
    this.powerOut = Math.max(0, (this.powerOut || 0) - dt);
    this.carDead = Math.max(0, (this.carDead || 0) - dt);
    if (this.emp) this.emp.t -= dt;
    // the porch light and windows are dead during a blackout (scene reads porchFlicker)
    if (this.powerOut > 0) this.scene.porchFlicker = this.powerOut < 0.5 && Math.random() < 0.5 ? 0.6 : 0;
  }
  update(dt, input) {
    this.scene.menuFigure = this.mode === "menu" ? 1 : 0;
    if (this.mode !== "menu") this.scene.menuHead = null;
    if (this.isA51) {
      this.t += dt;
      this.empTick(dt);
      return this.mod.update(dt, input);
    }
    this.t += dt;
    this.empTick(dt);
    // v15 fix: Area 51's hangar box ("held" bounds) leaked into the farm when the boot pre-warms Area 51,
    // pinning the menu craft off-screen until the first tap. The farm never uses bounds.
    this.creature.bounds = null;
    this.wind.update(dt);
    this.clouds.update(dt);
    const c = this.creature;
    const playing = this.mode === "play";
    if (this.mode === "menu") {
      this.director.update(dt);
      for (const e of this.director.events.splice(0)) {
        if (e === "glimpse" && this.occ < 0.5 && Math.random() < 0.65) this.menuSting();
        if (e === "dart") audio.fx("pass", { gain: 0.6, pan: this.panOf(c.x), dist: 0.3 });
      }
    } else if (playing) {
      const m = input.move;
      c.setInput(m.x, m.y);
      if (input.takeBurst() && c.burst()) this.onBurst();
      if (input.takeEmp && input.takeEmp() && this.tryEmp()) this.fireFarmEmp();
      c.feeding = input.feed && c.sinceBurst > 0.3;
      // Swoop down to feed: the drop out of cloud is the vulnerable moment
      if (c.feeding && !this.harvested && Math.abs(c.x - COW_X) < TUNE.feedRangeX + 80) {
        if (c.y < TUNE.feedSwoopY - 50) {
          c.beginSwoop(TUNE.feedSwoopY);
          this.swooped = true;
        }
      } else if (!c.feeding) {
        this.swooped = false;
        c.swoop = 0;
      }
    } else {
      c.setInput(0, 0);
      c.feeding = false;
    }
    if (this.L.storm) this.updateStorm(dt, playing);
    c.update(dt);
    // the creature pushes cloud around as it moves; moving fast really tears it open
    const sp = c.speed;
    this.clouds.disturb(c.x, c.y, 110, sp * 0.012, sp > 230 ? ((sp - 230) / 380) * dt * 5 : 0, c.vx * dt, c.vy * dt);
    this.updateVisibility();
    // cloud catch: a burst into cover settles there instead of shooting out the far side
    if (this.occ > 0.5 && c.sinceBurst < 1) {
      c.vx = damp(c.vx, 0, 4, dt);
      c.vy = damp(c.vy, 0, 4, dt);
    }
    this.updateActors(dt, playing);
    if (playing) this.updateEncounter(dt);
    if (this.mode === "fail" || this.mode === "win") this.endT += dt;
    if (this.mode === "fail" && this.endT > 2.2) {
      this.mode = "play";
      this.resetEncounter(false);
      this.onEvent("restarted");
    }
    this.updateParticles(dt);
    this.updateLightning(dt);
    if (this.L.highway) hwyTick(this, dt, this.flashPeak || 0);
    // camera
    if (this.mode === "menu") {
      const target = clamp(1610 - this.VW * 0.5, 0, WORLD_W - this.VW);
      this.camX = damp(this.camX, target, 3, dt);
    } else {
      let fx = c.x + c.vx * 0.7;
      const w = this.witness;
      if (w.visible && Math.abs(w.x - c.x) < this.VW * 0.9) fx = lerp(fx, w.x, 0.5);
      this.frameX = damp(this.frameX == null ? fx : this.frameX, fx, 1.5, dt);
      let target = this.frameX - this.VW * 0.5;
      // phones: keep the witness between 15% and 70% of the screen width (out from under FEED/BURST)
      if (w.visible && this.phase === "observe" && Math.abs(w.x - c.x) < this.VW * 1.2) {
        target = clamp(target, w.x - this.VW * 0.7, w.x - this.VW * 0.15);
      }
      target = clamp(target, 0, WORLD_W - this.VW);
      this.camX = damp(this.camX, target, 2.2, dt);
    }
    this.shake = damp(this.shake, 0, 5, dt);
    this.updateAudio(dt);
  }

  // ---------------------------------------------------------------- Storm Farm
  /** Ordinary cover has just been stripped: the torn phase and the first seconds of calm after it. */
  stormBare() {
    const S = this.st;
    return S.phase === "torn" || S.phase === "hole" || (S.phase === "rip" && S.front > this.creature.x) || (S.phase === "calm" && S.n > 0 && S.t < 5);
  }
  /** Scramble window: from the gust until the calm hole ends, nothing can spot you. */
  stormGrace() {
    return this.L.storm && (this.st.phase === "rip" || this.st.phase === "hole");
  }
  stormPhase(phase) {
    const S = this.st;
    const c = this.creature;
    const playing = this.mode === "play";
    S.phase = phase;
    S.t = 0;
    if (phase === "calm") S.dur = STORM.calmMin + Math.random() * (STORM.calmMax - STORM.calmMin);
    else if (phase === "warn") {
      S.rumbled = false;
      ["thunder_1", "thunder_2"].forEach((n) => audio.warm(n));
      audio.warmStorm();
      this.onEvent("storm-warn");
    } else if (phase === "hush") {
      // the air goes still and the music drains away just before the gust
      if (playing) {
        audio.stormHush(STORM.hush, STORM.hush + 1.6 + STORM.hole + 3);
        audio.fx("cricketsStop", { gain: 0.5, amb: true });
      }
      this.onEvent("storm-hush");
    } else if (phase === "hole") {
      // the gust has passed: everything the front would still hit off-screen is gone too
      this.clouds.stripBefore(1e9);
      if (playing) audio.stormHole();
      this.onEvent("storm-hole");
    } else if (phase === "rip") {
      S.n++;
      S.front = this.camX - 420;
      this.clouds.stripBefore(S.front);
      S.crossed = c.x < S.front;
      S.shreds = 0;
      this.shake = 6;
      if (playing) {
        audio.stormRip(this.panOf(this.camX));
        if (this.L.id === 3) audio.fx("l3StingCoverTorn", { gain: 0.85 }); // v20: cover torn away
        // the gust bangs the screen door; anyone calm indoors comes out to look
        clearTimeout(this.bangTimer);
        this.bangTimer = setTimeout(() => {
          if (this.mode !== "play") return;
          audio.fx("slam", { pan: this.panOf(HOUSE.door), dist: this.distOf(HOUSE.door), gain: 0.7 });
        }, 900);
        const w = this.witness;
        if (w.state === "inside" && !w.scared && !this.harvested && Math.random() < 0.6) {
          w.timer = Math.max(w.timer, w.nextExit - 1.4);
          w.quickTrip = true;
        }
      }
      this.onEvent("storm-rip");
    } else if (phase === "torn") {
      // the hole ends: still exposed low with a cow = caught; then thunder, a flash, and the howl comes back
      const low = c.y > TUNE.dangerLowY - 40;
      if (playing && this.phase !== "search" && low && this.occ < 0.4 && (c.feedAmt > 0.25 || this.harvested)) this.stormCatch("storm");
      if (playing) {
        audio.releaseDuck(0.5);
        audio.fx("thunderClose", { pan: this.panOf(this.camX + this.VW * 0.6), dist: 0.15, gain: 1 });
        if (this.L.id === 3) audio.fx("l3StingFlash", { gain: 0.85 }); // v20
        this.flashThunderless = true; // this flash's thunder already played
        this.preFlash = true; // no extra hush: the calm hole was the hush
        this.nextFlash = 0.05;
      }
      this.onEvent("storm-torn");
    }
  }
  /** Caught by the storm: the gust front or a flash exposed you low over the farm. */
  stormCatch(who) {
    const c = this.creature;
    const w = this.witness;
    this.lastKnown = { x: c.x, y: c.y };
    if (w.outside) w.hear(c.x);
    else if (w.state === "inside") w.scared = true; // they saw it from the window: torch in ~2 s
    this.startSearch(who);
  }
  updateStorm(dt, playing) {
    const S = this.st;
    const c = this.creature;
    const W = this.wind;
    S.t += dt;
    let stormT = 0.45;
    let hushT = 0;
    let howl = 0;
    const live = playing || this.mode === "fail";
    if (S.phase === "calm") {
      stormT = 0.45 + 0.12 * Math.sin(this.t * 0.31);
      this.clouds.regrow = STORM.regrowCalm;
      if (S.t > S.dur && live) this.stormPhase("warn");
    } else if (S.phase === "warn") {
      const k = clamp(S.t / STORM.warn, 0, 1);
      stormT = 0.55 + 0.75 * k * k;
      this.clouds.regrow = STORM.regrowCalm * 0.4;
      if (!S.rumbled && S.t > 0.3) {
        S.rumbled = true;
        if (playing) audio.fx("thunder", { pan: -0.85, dist: 0.95, gain: 0.6 });
      }
      if (S.t > STORM.warn) this.stormPhase("hush");
    } else if (S.phase === "hush") {
      stormT = 0.25;
      hushT = 1;
      this.clouds.regrow = 0;
      if (S.t > STORM.hush) this.stormPhase("rip");
    } else if (S.phase === "rip") {
      stormT = 1.5;
      howl = 1;
      this.clouds.regrow = 0;
      S.front += STORM.frontSpeed * dt;
      const torn = this.clouds.rip(S.front, STORM.frontWidth, STORM.ripStrength, dt);
      // shredded cloud streams away downwind
      const cap = this.quality >= 2 ? 70 : this.quality >= 1 ? 45 : 22;
      const sp = cloudSprites();
      for (const p of torn) {
        if (S.shreds >= cap || p.x < this.camX - 200 || p.x > this.camX + this.VW + 200) continue;
        S.shreds++;
        this.particles.push({ k: "shred", x: p.x, y: p.y, vx: 380 + Math.random() * 360, vy: -20 + Math.random() * 40, life: 0, max: 1.4 + Math.random() * 1.2, size: p.rr * (0.6 + Math.random() * 0.4), sp: sp[p.v] });
      }
      // the front shoves the craft downwind (less when it's holding a cow)
      const d = c.x - S.front;
      const inBank = this.occ > 0.6 && this.clouds.toughClouds().some((cl) => Math.abs(cl.cx - c.x) < cl.w * 0.5);
      if (Math.abs(d) < 360 && !inBank) {
        const f = 1 - Math.abs(d) / 360;
        c.vx += STORM.gustPush * f * dt * (c.feeding ? 0.55 : 1);
        c.vy -= 60 * f * dt;
      }
      if (!S.crossed && S.front > c.x) S.crossed = true;
      if (S.front > this.camX + this.VW + 380) this.stormPhase("hole");
    } else if (S.phase === "hole") {
      stormT = 0.3;
      hushT = 1; // dead calm: trees stop, rain thins, the storm bed drops out
      this.clouds.regrow = 0;
      if (S.t > STORM.hole) this.stormPhase("torn");
    } else if (S.phase === "torn") {
      const k = clamp(S.t / STORM.torn, 0, 1);
      stormT = 1.0 - 0.45 * k;
      howl = Math.max(0, 1 - S.t / 2.2);
      this.clouds.regrow = STORM.regrowTorn;
      if (S.t > STORM.torn) this.stormPhase("calm");
    }
    // rain and low scud keep moving (and stop dead in the hush)
    const rainT = { calm: 0.4, warn: 0.4 + 0.5 * clamp(S.t / STORM.warn, 0, 1), hush: 0.06, rip: 1, hole: 0.08, torn: 0.75 - 0.35 * clamp(S.t / STORM.torn, 0, 1) }[S.phase];
    this.rainAmt = damp(this.rainAmt || 0.4, rainT, S.phase === "hush" ? 4 : 2, dt);
    this.rainT = (this.rainT || 0) + dt * (1 - W.hush * 0.85);
    this.scudX = (this.scudX || 0) + dt * (30 + W.storm * 140 + this.howl * 300) * (1 - W.hush * 0.9);
    this.stormDark = damp(this.stormDark == null ? 1 : this.stormDark, this.stormBare() ? 0.35 : 1, 1.2, dt);
    // dust ripped off the field along the front
    if (S.phase === "rip" && Math.abs(S.front - (this.camX + this.VW / 2)) < this.VW * 0.7 && Math.random() < dt * (this.quality >= 1 ? 40 : 15)) {
      this.particles.push({ k: "dust", x: S.front - 80 + Math.random() * 160, y: GROUND + Math.random() * 20, vx: 300 + Math.random() * 300, vy: -60 - Math.random() * 120, life: 0, max: 0.8 + Math.random() * 0.8, size: 1.5 + Math.random() * 2.5, rot: Math.random() * TAU, burst: true });
    }
    W.storm = damp(W.storm, stormT, hushT ? 7 : 1.4, dt);
    W.hush = damp(W.hush, hushT, hushT ? 5 : 9, dt);
    this.howl = damp(this.howl, howl, howl > this.howl ? 12 : 1.6, dt);
  }

  menuSting() {
    if (!audio.ctx) return;
    if (audio.ctx.currentTime - audio.lastSting < 12) return;
    audio.shock("menu");
  }

  panOf(x) {
    return clamp((x - (this.camX + this.VW / 2)) / (this.VW * 0.6), -1, 1);
  }

  onBurst() {
    const c = this.creature;
    try { audio.fx?.("ufo_boost"); } catch { /* v28: Gamer Girl's boost sound (audio.js) */ }
    this.clouds.disturb(c.x, c.y, 190, 70, TUNE.burstTear, c.vx * 0.3, c.vy * 0.3);
    this.shake = 5;
    audio.fx("burst", { pan: this.panOf(c.x) });
    // swirl of torn cloud behind it
    const sp = cloudSprites();
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      this.particles.push({
        k: "wisp",
        x: c.x + Math.cos(a) * 40,
        y: c.y + Math.sin(a) * 15,
        vx: -c.vx * 0.15 + Math.cos(a) * 50,
        vy: -c.vy * 0.15 + Math.sin(a) * 30,
        life: 0,
        max: 1.2 + Math.random(),
        size: 30 + Math.random() * 40,
        sp: sp[i % sp.length],
      });
    }
    // Dust / grass kick-up from the ground (Josh's burst gif) — strongest when low
    const low = clamp(1 - (GROUND - 80 - c.y) / 280, 0, 1);
    const nDust = Math.floor(18 + low * 28);
    for (let i = 0; i < nDust; i++) {
      const ang = Math.random() * TAU;
      const spd = 40 + Math.random() * 140 * low;
      this.particles.push({
        k: Math.random() < 0.25 ? "grass" : "dust",
        x: c.x + (Math.random() - 0.5) * 90,
        y: GROUND - 4 + Math.random() * 18,
        vx: Math.cos(ang) * spd,
        vy: -60 - Math.random() * 160 * low - Math.max(0, -c.vy) * 0.08,
        life: 0,
        max: 0.7 + Math.random() * 1.1,
        size: 1.2 + Math.random() * 2.4,
        rot: Math.random() * TAU,
        burst: true,
      });
    }
  }

  /** How exposed the creature is (0 hidden .. 1 plainly visible), from cloud cover and light. */
  updateVisibility() {
    const c = this.creature;
    const pts = c.samplePoints();
    let occ = 0;
    for (const [x, y] of pts) occ += this.clouds.density(x, y);
    occ /= pts.length;
    this.occ = occ;
    const ms = this.scene.moonScreen(this.camX, this.VW);
    const sx = c.x - this.camX;
    const moonNear = clamp(1 - Math.hypot(sx - ms.x, c.y - ms.y) / 420, 0, 1);
    this.moonNear = moonNear;
    const head = this.carDead > 0 ? 0 : this.car.litAt(c.x, c.y);
    const beam = this.beamHits(c.x, c.y);
    this.inBeam = beam;
    let light = 0.5 + moonNear * 0.35 + this.flash + head * 0.6 + beam + c.feedAmt * 0.28 + smoothstep(300, 420, c.y) * 0.15;
    if (c.sinceBurst < 0.8) light += 0.25; // a tearing burst is conspicuous
    light += c.craft.vis; // v13: the Raider is faster but easier to see
    if (this.L.storm) light += this.stormBare() ? STORM.tornLight : -0.08; // bare sky after a gust: the moon floods in
    this.light = clamp(light, 0, 1);
    this.vis = clamp((1 - occ) * this.light, 0, 1);
    this.edgeLight = clamp(moonNear * 0.7 + this.flash + head + beam + c.feedAmt * 0.4 + 0.15, 0, 1);
  }

  beamHits(x, y) {
    if (this.beam < 0.3 || this.powerOut > 0) return 0;
    const o = this.beamOrigin();
    const a = Math.atan2(y - o.y, x - o.x);
    let d = a - this.beamAng;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const dist = Math.hypot(x - o.x, y - o.y);
    if (dist > 1150) return 0;
    return Math.abs(d) < 0.16 ? this.beam : 0;
  }
  beamOrigin() {
    const h = this.witness.hand;
    return h && this.witness.state === "search" ? h : { x: HOUSE.door - 8, y: GROUND - 40 };
  }

  updateActors(dt, playing) {
    const c = this.creature;
    const w = this.witness;
    const car = this.car;
    const tv = TUNE.seenVis;
    // --- witness
    if (playing || this.mode === "fail") {
      const seesNow = !this.stormGrace() && w.looking(c.x, c.y) && this.vis > tv;
      w.sees = seesNow ? this.vis : 0;
      w.headUpT = clamp(Math.atan2(GROUND - 50 - c.y, Math.abs(c.x - w.x) + 1), 0, 1.15);
      if (seesNow && ["idle", "walk"].includes(w.state)) {
        this.seeT += dt;
        if (this.seeT > 0.7) w.hear(c.x);
      } else this.seeT = 0;
      w.update(dt, this.scene);
    } else {
      // menu: the house just glows; door stays shut
      // v15 menu: the door stands open with someone in it (the reference shot)
      this.scene.doorOpen = damp(this.scene.doorOpen, 1, 1.5, dt);
    }
    for (const e of w.events.splice(0)) this.witnessEvent(e);
    if (w.stepEvents !== this.lastSteps) {
      const run = Math.abs(w.v) > 90;
      audio.fx(Math.abs(w.x - HOUSE.door) < 70 ? "stepWood" : "step", { pan: this.panOf(w.x), gain: run ? 0.9 : 0.6, dist: this.distOf(w.x) });
      this.lastSteps = w.stepEvents;
    }
    // --- car: passes now and then; arrives soon after feeding starts so the driver can react
    this.carCool -= dt;
    this.carNext -= dt;
    if (!car.active && this.carNext <= 0) {
      car.spawn(Math.max(-1200, this.camX - TUNE.carSpawnBack));
      this.carNext = this.L.highway ? HWY.truckMin + Math.random() * (HWY.truckMax - HWY.truckMin) : 45 + Math.random() * 30;
    }
    if (car.active) {
      const dx = c.x - car.x;
      const ahead = dx > 40 && dx < 760;
      // the driver only reacts if the headlights touch it, or it's plainly visible close ahead
      if (playing && !this.stormGrace() && car.state === "drive" && ahead && ((this.carDead > 0 ? 0 : car.litAt(c.x, c.y)) > 0.2 || (this.vis > tv && dx < 520 && c.y > 230))) {
        car.scare();
        this.lastKnown = { x: c.x, y: c.y };
        this.startSearch("car");
      }
      car.sees = playing && !this.stormGrace() && car.scared && car.state !== "off" && dx > -120 && dx < 1000 && this.vis > tv ? this.vis : 0;
    }
    car.update(dt, this.camX);
    for (const e of car.events.splice(0)) {
      if (e === "brake") audio.fx("brake", { pan: this.panOf(car.x), dist: this.distOf(car.x) });
      if (e === "pass") {
        audio.fx("carPass", { pan: -0.9, dist: 1, gain: 0.35 });
        audio.warm("chase");
        audio.warm("car_brakes");
      }
    }
    // --- cow
    const alarm = clamp(c.feedAmt * 1.5 + (c.y > 330 && Math.abs(c.x - COW_X) < 300 ? 0.6 : 0), 0, 1);
    this.cow.update(dt, alarm, this.wind.gust);
    for (const h of this.herd) {
      const near = clamp(1 - Math.abs(h.x - c.x) / 500, 0, 1);
      h.update(dt, Math.max(alarm * 0.7, near * c.feedAmt), this.wind.gust);
    }
    // blinds peek: irregular on menu and while the house is quiet
    if (this.scene.updateBlinds) {
      const quiet = this.mode === "menu" || (playing && this.witness.state === "inside" && !this.witness.scared);
      const prevPhase = this.scene.blindsPhase;
      if (quiet) this.scene.updateBlinds(dt);
      else if (this.scene.blindsPhase !== "wait") this.scene.updateBlinds(dt); // finish a snap
      if (prevPhase !== "snap" && this.scene.blindsPhase === "snap") {
        audio.fx("blindsSnap", { pan: this.panOf(HOUSE.x + 260), dist: this.distOf(HOUSE.x), gain: 0.45 });
      }
    }
    // --- dog across the field
    this.dogCool -= dt;
    this.dogNext -= dt;
    if (this.dogNext <= 0) {
      this.bark(0.8);
      this.dogNext = 30 + Math.random() * 35;
    }
    if (playing && c.y > 340 && Math.abs(c.x - HOUSE.x) < 700 && this.dogCool <= 0) this.bark(0.3);
    // feeding stills the wind around the farm
    this.wind.calm = damp(this.wind.calm, c.feedAmt, 1.5, dt);
  }

  bark(dist) {
    if (this.dogCool > 0) return;
    this.dogCool = 9;
    audio.fx("dog", { pan: this.panOf(HOUSE.x + 400), dist: Math.max(dist, this.distOf(HOUSE.x + 400)) });
    if (this.L.id === 2 && this.mode === "play" && this.dogArmed) { this.dogArmed = false; audio.fx("l2StingDogLunge", { pan: this.panOf(HOUSE.x + 400), gain: 0.8 }); } // v23: first bark after you are seen
    if (this.mode === "play") this.witness.hear(this.creature.x);
  }

  distOf(x) {
    return clamp(Math.abs(x - (this.camX + this.VW / 2)) / 1600, 0, 1);
  }

  witnessEvent(e) {
    const w = this.witness;
    const o = { pan: this.panOf(w.x), dist: this.distOf(w.x) };
    if (e === "notice") {
      // they've heard something: the world goes quiet before the gasp
      if (this.mode === "play") audio.preShock(2.5, 6);
      audio.warm("chase");
    } else if (e === "door") {
      audio.fx("door", o);
      if (this.L.id === 2 && !this.L.storm) audio.fx("farmDoorCreak", { pan: 0.4, dist: 0.3 }); // v14
    }
    else if (e === "slam") audio.fx("slam", o);
    else if (e === "doorclose") audio.fx("slam", { ...o, gain: 0.3 });
    else if (e === "gasp") {
      audio.fx("gasp", o);
      this.lastKnown = { x: this.creature.x, y: this.creature.y };
      this.startSearch("witness");
    } else if (e === "scream") {
      // Fleeing: prefer the receding run scream; otherwise terror scream
      audio.fx(audio.has("screamRun") ? "screamRun" : "scream", { ...o, gain: (o.gain == null ? 1 : o.gain) * 1.15 });
      this.bark(0.3);
      clearTimeout(this.whineTimer);
      this.whineTimer = setTimeout(() => this.mode === "play" && audio.fx("dogWhine", { pan: this.panOf(HOUSE.x + 400), dist: 0.7, gain: 0.7 }), 2600);
    }
  }

  startSearch(who) {
    if (this.phase === "search") return;
    this.phase = "search";
    this.hiddenT = 0;
    this.exposure = Math.max(this.exposure, 0);
    if (who !== "storm" && who !== "lightning") audio.shock("spotted");
    audio.setMusic("chase");
    this.musicHold = 0;
    // a calm witness indoors still reacts: the porch light dies, then snaps on with them in the doorway
    if (who === "car" && this.witness.state === "inside" && !this.witness.scared) (this.porchSeq = 0), (this.porchHush = false);
    this.dogArmed = true; // v23
    this.onEvent("spotted:" + who);
  }

  updateEncounter(dt) {
    const c = this.creature;
    const w = this.witness;
    this.gt += dt;
    this.hintT = (this.hintT || 0) + dt;
    // --- feeding
    const m = c.mouthPos();
    const above = this.cow.baseY - 40 - m.y;
    const onTarget =
      !this.harvested && c.feeding && Math.abs(m.x - this.cow.x) < TUNE.feedRangeX && above > TUNE.feedMinAbove && above < TUNE.feedMaxAbove + 40;
    if (c.feeding) this.feedTime += dt;
    else this.feedTime = 0;
    if (c.feeding && !this.feedStarted && c.feedAmt > 0.3) {
      this.feedStarted = true;
      this.feedHeard = 0.9;
    }
    // a car may come while you feed: about half the time, from far off, heard well before it's seen
    if (c.feeding && this.feedTime > 2 && !this.carRolled) {
      this.carRolled = true;
      if (Math.random() < 0.5 && !this.car.active && this.carCool <= 0 && c.x > 700) {
        this.car.spawn(Math.max(-1200, this.camX - TUNE.carSpawnBack));
        this.carCool = 40;
        this.carNext = 45;
      }
    }
    if (!c.feeding) (this.feedStarted = false), (this.carRolled = false);
    if (this.feedHeard > 0) {
      this.feedHeard -= dt;
      if (this.feedHeard <= 0) {
        w.hear(c.x);
        this.bark(0.4);
      }
    }
    if (onTarget) {
      if (this.progress < 0.02) audio.fx("cow", { pan: this.panOf(this.cow.x), dist: this.distOf(this.cow.x) });
      this.progress = Math.min(1, this.progress + (dt / TUNE.feedSeconds) * c.feedAmt * c.craft.feed);
    } else if (!this.harvested) {
      // released early: the cow is lowered gently back to the grass
      this.progress = Math.max(0, this.progress - dt / 2.4);
    }
    const reach = Math.max(0, this.cow.baseY - (m.y + 34));
    if (onTarget || this.harvested) {
      this.cow.lift = reach * smoothstep(0, 1, this.progress);
      this.cowVy = 0;
      if (onTarget) this.cow.x = damp(this.cow.x, m.x, 1.2, dt);
    } else if (this.cow.lift > 0) {
      // let go: never pulled further up. Burst away and it drops; release in place and it sinks back down
      if (c.sinceBurst < 1.5 || Math.abs(m.x - this.cow.x) > TUNE.feedRangeX * 1.5) {
        this.cowVy += 900 * dt;
        this.cow.lift = Math.max(0, this.cow.lift - this.cowVy * dt);
        if (this.cow.lift === 0 && this.cowVy > 200) {
          audio.fx("slam", { pan: this.panOf(this.cow.x), dist: this.distOf(this.cow.x), gain: 0.35 });
          this.cowVy = 0;
        }
      } else this.cow.lift = Math.max(0, Math.min(this.cow.lift, reach) - dt * 90);
      this.progress = Math.min(this.progress, 0.999);
    }
    // feeding sound beats and the pre-shock hush before the cow is taken
    if (this.progress > 0.2) audio.warm("cow_distress"), audio.warm("taken");
    if (this.progress > 0.5 && !this.distressed) {
      this.distressed = true;
      audio.fx("cowDistress", { pan: this.panOf(this.cow.x), dist: this.distOf(this.cow.x), gain: 0.8 });
    }
    if (this.progress < 0.3) this.distressed = false;
    if (this.progress > 0.8 && !this.feedShock) {
      this.feedShock = true;
      audio.preShock(1.6, 4);
    }
    if (this.progress < 0.5) this.feedShock = false;
    if (this.progress >= 1 && !this.harvested) {
      this.harvested = true;
      this.cow.gone = true;
      c.swallow = 1;
      c.feeding = false;
      audio.sting("taken"); // lands when the feed hush has fully dipped
      // Stronger human terror when the cow/person is taken
      if (audio.has("scream")) setTimeout(() => audio.fx("scream", { pan: this.panOf(c.x), dist: 0.25, gain: 0.95 }), 400);
      audio.warm("escape");
      this.shake = 3;
      this.onEvent("harvested");
      if (w.outside) w.hear(c.x);
    }
    // --- search, exposure, escape
    const beamSees = !this.stormGrace() && this.inBeam > 0 && this.vis > TUNE.seenVis;
    const seen = w.sees > 0 || this.car.sees > 0 || beamSees;
    // how hard each observer is looking: a torch beam locks on, a fleeing glance barely counts
    const wWeight = w.state === "flee" ? 0.35 : w.state === "turn" ? 0.3 : 0.8;
    let weight = Math.max(w.sees > 0 ? wWeight : 0, this.car.sees > 0 ? 0.9 : 0, beamSees ? 1.2 : 0);
    if (seen) weight += c.feedAmt * 0.4; // the feeding column is the brightest thing on screen
    // Game King feel: swoop/feed low is the vulnerable window. Mid-height peeks are soft.
    // Low + feeding (or just harvested and still low) = full danger. High peeks get a soft warning.
    const heightFactor = smoothstep(TUNE.dangerHighY, TUNE.dangerLowY, c.y);
    const lowFeeding = c.y >= TUNE.dangerLowY - 30 && (c.feedAmt > 0.3 || (this.harvested && c.y > 300));
    if (seen) this.seenStreak += dt;
    else this.seenStreak = Math.max(0, this.seenStreak - dt * 2);
    if (lowFeeding) {
      // Full weight while vulnerable — no soft ramp. Slightly hotter so careless ~11-15s Seen.
      weight *= 1.35 + 0.2 * c.feedAmt;
    } else {
      // Mid-height / just-peeking: much softer, with a clear warning before it ramps
      weight *= (this.L.storm && this.stormBare() ? 0.4 : 0.2) + 0.55 * heightFactor;
      if (this.seenStreak < 1.1) weight *= 0.35 + 0.65 * (this.seenStreak / 1.1);
    }
    // A well-timed burst climbing into cover clearly saves you
    if (c.sinceBurst < 1.0 && c.vy < -100 && this.occ > 0.25) weight *= 0.25;
    else if (c.sinceBurst < 0.7 && c.vy < -80) weight *= 0.55;
    if (seen) this.lastKnown = { x: c.x, y: c.y };
    const hidden = this.occ >= TUNE.hiddenDensity;
    if (this.phase === "search") {
      if (seen) this.exposure += dt * weight;
      else if (lowFeeding && this.vis > 0.25 && !this.stormGrace()) {
        // Still hanging low after a spot: suspicion keeps climbing slowly until you burst into cloud
        this.exposure += dt * 0.55;
      } else {
        // Still low after being spotted: exposure holds/bleeds slowly so escape must be a real burst up
        const cling = lowFeeding && (c.feedAmt > 0.15 || this.harvested) ? 0.05 : (0.35 + (c.sinceBurst < 1.2 ? 0.55 : 0));
        this.exposure = Math.max(0, this.exposure - dt * cling);
      }
      this.hiddenT = hidden ? this.hiddenT + dt : Math.max(0, this.hiddenT - dt * 0.5);
      // the witness comes back to the doorway with a torch
      if (w.state === "inside" && w.scared && this.searchDelay < 0) this.searchDelay = 2.2;
      if (this.searchDelay > 0) {
        this.searchDelay -= dt;
        if (this.searchDelay <= 0) {
          w.startSearch(this.lastKnown || { x: c.x, y: c.y });
          this.searchDelay = 0;
        }
      }
      // the vignette closing in: music and wind fall away just before "Seen."
      if (this.exposure > TUNE.failExposure * 0.65 && !this.failWarned) {
        this.failWarned = true;
        audio.preShock(1.5, 4);
      }
      if (this.exposure < TUNE.failExposure * 0.35) this.failWarned = false;
      if (this.exposure >= TUNE.failExposure) this.fail();
      else if (!this.harvested && this.hiddenT > TUNE.searchEaseHidden && this.porchSeq < 0) this.endSearch(); // the porch scare still comes
    }
    if (this.harvested) {
      this.exposedT = hidden ? 0 : this.stormGrace() ? this.exposedT : this.exposedT + dt;
      if (this.exposedT > TUNE.exposedAfterHarvest && this.mode === "play") return this.fail();
      this.winHidden = hidden ? this.winHidden + dt : 0;
      if (this.winHidden >= TUNE.winHidden && this.mode === "play") this.win();
    }
    // the torch sweeps around the last place it was seen
    const searching = w.state === "search";
    this.beam = damp(this.beam, searching ? 1 : 0, 3, dt);
    if (searching) {
      const o = this.beamOrigin();
      const lk = this.lastKnown || { x: c.x, y: c.y };
      const aim = Math.atan2(lk.y - o.y, lk.x - o.x) + Math.sin(this.t * 0.6) * 0.12 + noise1(this.t * 0.8) * 0.12;
      this.beamAng = damp(this.beamAng, aim, 1.6, dt);
    }
  }

  endSearch() {
    this.phase = "observe";
    this.exposure = 0;
    this.searchDelay = -1;
    if (this.witness.state === "search") this.witness.endSearch();
    this.witness.scared = false;
    audio.setMusic(this.L.highway ? null : "calm");
    this.onEvent("search-ended");
  }

  fail() {
    this.mode = "fail";
    this.endT = 0;
    this.flash = Math.max(this.flash, this.settings.reducedFlash ? 0.25 : 0.6);
    this.shake = 6;
    audio.shock("fail");
    this.onEvent("fail");
  }
  win() {
    this.mode = "win";
    this.endT = 0;
    audio.releaseDuck(0.6);
    audio.sting("escape");
    audio.setMusic(null);
    this.onEvent("win");
  }

  updateLightning(dt) {
    this.nextFlash -= dt;
    // Storm Farm: no lightning on top of the gust build-up; it waits for the bare sky after
    if (this.L.storm && ["warn", "hush", "rip", "hole"].includes(this.st.phase) && this.nextFlash < 3) this.nextFlash = 3 + Math.random() * 2;
    // lightning gets a hush first: everything drains away, then the flash
    if (this.mode === "play" && this.nextFlash <= 2.5 && !this.preFlash) {
      this.preFlash = true;
      audio.preShock(2.5, 4.5);
      audio.warm("thunder_1");
    }
    if (this.nextFlash <= 0 && !this.flashSeq) {
      this.preFlash = false;
      if (this.mode === "play") audio.releaseDuck(1.0);
      this.flashSeq = { t: 0, x: this.camX + Math.random() * this.VW, peaks: [0, 0.11 + Math.random() * 0.06, 0.32 + Math.random() * 0.15] };
      this.scene.flashX = this.flashSeq.x;
      this.nextFlash = this.L.highway ? HWY.flashMin + Math.random() * (HWY.flashMax - HWY.flashMin) : this.L.storm ? 13 + Math.random() * 14 : 22 + Math.random() * 30;
      this.flashCaught = false;
      const delay = 1200 + Math.random() * 2400;
      if (this.flashThunderless) this.flashThunderless = false;
      else this.thunderTimer = setTimeout(() => audio.fx("thunder", { pan: this.panOf(this.flashSeq ? this.flashSeq.x : this.camX), dist: 0.3 + Math.random() * 0.5 }), delay);
    }
    let f = 0;
    if (this.flashSeq) {
      const s = this.flashSeq;
      s.t += dt;
      for (const p of s.peaks) {
        const d = s.t - p;
        if (d >= 0) f = Math.max(f, Math.exp(-d * 14) * (p === 0 ? 0.7 : 1));
      }
      if (s.t > 1.2) this.flashSeq = null;
    }
    this.flashPeak = f;
    const k = this.settings.reducedFlash ? 0.3 : 1;
    this.flash = Math.max(f * 0.8 * k, damp(this.flash, 0, 6, dt));
    this.clouds.flash = this.flash;
    // Storm Farm: a flash against bare sky lights you up for anyone looking
    if (this.L.storm && this.mode === "play" && f > 0.55 && !this.flashCaught && this.stormBare() && !this.stormGrace() && this.occ < 0.3 && this.phase !== "search" && (this.creature.y > TUNE.dangerHighY || this.creature.feedAmt > 0.25)) {
      this.flashCaught = true;
      this.stormCatch("lightning");
    }
    // porch sequence after the car's screech when the witness was calmly indoors
    if (this.porchSeq >= 0) {
      // waits for the 12 s shock cooldown: hush 2.5 s before, light dies 1.2 s before, then it snaps on
      this.porchSeq += dt;
      const wait = Math.max(audio.shockWait(), 3.6 - this.porchSeq);
      if (this.phase !== "search" || this.mode !== "play") this.porchSeq = -1;
      else {
        if (wait <= 2.5 && !this.porchHush) {
          this.porchHush = true;
          audio.preShock(Math.max(0.8, wait), 5);
        }
        this.porchDark = wait <= 1.2;
        if (wait <= 0) {
          this.porchSeq = -1;
          this.porchDark = false;
          this.porchSnap = 2.5;
          audio.shock("porch");
          if (this.L.id === 2) audio.fx("l2StingPorchLight", { pan: this.panOf(HOUSE.door), gain: 0.85 }); // v20
          this.witness.scared = true;
          this.searchDelay = 0.01;
          this.flicker = 0;
        }
      }
    }
    this.porchSnap = Math.max(0, this.porchSnap - dt);
    const porchDark = this.porchSeq >= 0 && this.porchDark;
    this.scene.porchFlicker = porchDark || this.powerOut > 0 ? (this.powerOut > 0 && this.powerOut < 0.5 && Math.random() < 0.5 ? 0.6 : 0) : this.flash > 0.5 ? 0.85 : this.porchSnap > 0 ? Math.max(this.scene.porchFlicker, 1.9) : damp(this.scene.porchFlicker, 1, 4, dt);
  }

  updateParticles(dt) {
    const c = this.creature;
    // feeding lifts dust and torn grass from below
    if (c.feedAmt > 0.15) {
      const m = c.mouthPos();
      const n = Math.random() < c.feedAmt * dt * 40 * (this.quality >= 1 ? 1 : 0.5) ? 1 + (Math.random() * 2) | 0 : 0;
      for (let i = 0; i < n; i++)
        this.particles.push({
          k: Math.random() < 0.3 ? "grass" : "dust",
          x: m.x + (Math.random() - 0.5) * 140,
          y: GROUND + Math.random() * 30,
          vx: 0,
          vy: -20 - Math.random() * 30,
          life: 0,
          max: 2.5 + Math.random() * 2,
          size: 0.8 + Math.random() * 1.8,
          rot: Math.random() * TAU,
          tx: m.x,
          ty: m.y,
        });
    }
    // loose leaves on gusts
    const leafRate = (0.4 + this.wind.gust * 1.2 + (this.L.storm ? this.wind.storm * 3 + this.howl * 8 : 0)) * (1 - this.wind.hush);
    if (Math.random() < dt * leafRate * (this.quality >= 1 ? 1 : 0.4)) {
      this.particles.push({
        k: "leaf",
        x: this.camX - 20,
        y: 470 + Math.random() * 200,
        vx: 80,
        vy: 0,
        life: 0,
        max: 14,
        size: 2 + Math.random() * 2,
        rot: Math.random() * TAU,
        ph: Math.random() * TAU,
      });
    }
    const out = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life > p.max) continue;
      if (p.k === "dust" || p.k === "grass") {
        if (p.burst) {
          // Burst kick-up: expand outward, settle, no suction
          p.vx *= Math.exp(-1.2 * dt);
          p.vy += 220 * dt;
          p.rot += dt * 5;
        } else {
          const m = c.mouthPos();
          const pull = c.feedAmt;
          p.vx = damp(p.vx, (m.x - p.x) * 0.9 * pull + Math.sin(p.life * 3 + p.rot) * 30, 1.5, dt);
          p.vy = damp(p.vy, (-50 - p.life * 30) * pull + (1 - pull) * 60, 1.2, dt);
          p.rot += dt * 3;
          if (p.y < m.y + 12 && pull > 0.2) continue;
        }
      } else if (p.k === "leaf") {
        const w = this.wind.sample(p.x, 0, 1);
        p.vx = damp(p.vx, 60 + w * 220 + this.howl * 420, 1.2, dt);
        p.vy = damp(p.vy, Math.sin(p.life * 2.3 + p.ph) * 50 + 8, 2, dt);
        p.rot += dt * (4 + w * 4);
        if (p.x > this.camX + this.VW + 40) continue;
      } else if (p.k === "shred") {
        p.vx = damp(p.vx, 160, 0.8, dt);
        p.vy = damp(p.vy, 0, 1, dt);
      } else if (p.k === "wisp") {
        p.vx = damp(p.vx, 0, 1.5, dt);
        p.vy = damp(p.vy, 0, 1.5, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      out.push(p);
    }
    this.particles = out.length > 260 ? out.slice(-260) : out;
  }

  updateAudio(dt) {
    const c = this.creature;
    const low = smoothstep(220, 420, c.y);
    if (low > 0.15 || c.feedAmt > 0.05) audio.warm("dread"); // decode dread only once it's about to be needed
    let insects = clamp(1 - low * 0.85 - c.feedAmt, 0, 1) * (this.mode === "menu" ? 0.9 : 1);
    if (this.L.storm) insects *= ({ calm: 0.6, warn: 0.3 }[this.st.phase] || 0) * clamp(1 - this.wind.storm * 0.4, 0, 1);
    const car = this.car;
    let carG = 0;
    // heard from far off-screen: faint at first, rising steeply as it closes in (3-6 s of warning)
    if (car.active) carG = smoothstep(0, 3, car.age || 0) * (Math.abs(car.v) < 5 ? 0.6 : 1) * Math.pow(clamp(1 - Math.abs(car.x - (this.camX + this.VW / 2)) / 2300, 0, 1), 1.6) * clamp(0.3 + Math.abs(car.v) / 250, 0, 1);
    const play = this.mode === "play";
    // little cues: slipping into cloud, crickets falling silent, the porch light failing
    this.cueCool = (this.cueCool || 0) - dt;
    this.cricketCool = (this.cricketCool || 0) - dt;
    this.flickCool = (this.flickCool || 0) - dt;
    this.moveCool = (this.moveCool || 0) - dt;
    if (play && this.occ > 0.7 && (this.prevOcc || 0) <= 0.7 && this.cueCool <= 0) {
      audio.fx("rustle", { gain: 0.6, pan: this.panOf(c.x) });
      this.cueCool = 4;
    }
    this.prevOcc = this.occ;
    if (play && insects < 0.35 && (this.prevInsects || 1) >= 0.35 && this.cricketCool <= 0) {
      audio.fx("cricketsStop", { gain: 0.6, amb: true });
      this.cricketCool = 25;
    }
    this.prevInsects = insects;
    if (play && c.y > 320 && Math.abs(c.x - (HOUSE.x + 60)) < 420 && this.flickCool <= 0) {
      this.flickCool = 16;
      this.flicker = 1.4;
      audio.fx("flicker", { pan: this.panOf(HOUSE.x), dist: this.distOf(HOUSE.x) });
    }
    if (this.flicker > 0 && this.porchSeq < 0 && this.porchSnap <= 0) {
      this.flicker -= dt;
      this.scene.porchFlicker = Math.random() < 0.5 ? 0.25 + Math.random() * 0.3 : 1;
    }
    if (play && this.moveCool <= 0 && c.speed > 140 && Math.abs(c.vx * c.inX + c.vy * c.inY) < 40 * c.speed * 0.01 && Math.hypot(c.inX, c.inY) > 0.6) {
      audio.fx("move", { gain: 0.45, pan: this.panOf(c.x), dist: this.occ * 0.5 });
      this.moveCool = 3.5;
    }
    audio.update({
      breath: play ? (this.occ > 0.5 ? 0.7 : 0.25) : 0.2,
      hum: play ? smoothstep(280, 420, c.y) * (1 - c.feedAmt * 0.5) : 0,
      gust: this.wind.gust * (1 - this.wind.calm * 0.7),
      insects,
      muffle: this.mode === "play" ? clamp(this.occ * 0.9, 0, 0.9) : 0,
      feed: c.feedAmt,
      car: { gain: carG, speed: car.v, pan: this.panOf(car.x) },
      storm: this.L.storm && this.mode !== "menu" ? clamp(this.wind.storm, 0, 1.5) * (1 - this.wind.hush) : 0,
      howl: this.L.storm ? this.howl : 0,
    });
    // calm <-> dread with a dead zone and a 4 s minimum hold, so it never flaps
    this.musicHold += dt;
    if (this.mode === "play" && this.phase === "observe" && this.musicHold > 4 && !this.L.highway) {
      const cur = audio.musicState;
      let want = cur === "dread" || cur === "calm" ? cur : "calm";
      if (low > 0.6 || c.feedAmt > 0.2) want = "dread";
      else if (low < 0.3 && c.feedAmt < 0.05) want = "calm";
      if (want !== cur) {
        audio.setMusic(want);
        this.musicHold = 0;
      }
    }
  }

  /** v14 readability: a small clear cue for hidden vs exposed (Game King's rule). */
  drawHiddenCue(ctx, s, VW, occ = this.occ) {
    const h = clamp((occ - 0.45) / 0.25, 0, 1);
    this.cueA = damp(this.cueA || 0, h, 8, 1 / 60);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.font = "13px Georgia, serif";
    ctx.textAlign = "left";
    const a = this.cueA;
    ctx.fillStyle = a > 0.5 ? `rgba(150,170,190,${0.55 * a})` : `rgba(230,200,160,${0.55 * (1 - a)})`;
    ctx.beginPath(); ctx.arc(26, 24, 5, 0, TAU);
    if (a > 0.5) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.stroke(); } else ctx.fill();
    ctx.fillText(a > 0.5 ? "HIDDEN" : "EXPOSED", 38, 29);
  }

  // ---------------------------------------------------------------- render
  render() {
    if (this.isA51) return this.mod.render();
    const ctx = this.ctx;
    const s = this.s;
    const VW = this.VW;
    const t = this.t;
    const sc = this.scene;
    const c = this.creature;
    const camX = this.camX + (Math.random() - 0.5) * this.shake;
    const infl = { x: c.x, s: clamp(c.feedAmt * 1.0 + smoothstep(330, 430, c.y) * 0.35, 0, 1) };
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // the soft sky layers render at half resolution into a cache, then scale up (a big saving on phones)
    const bw = Math.max(2, Math.round(this.canvas.width * 0.5));
    const bh = Math.max(2, Math.round(this.canvas.height * 0.5));
    if (!this.bg || this.bg.width !== bw || this.bg.height !== bh) {
      this.bg = makeCanvas(bw, bh);
      this.bgCtx = this.bg.getContext("2d", { alpha: false });
    }
    // v17 Lite: the soft sky cache is refreshed every other frame (it barely moves)
    this.skyTick = (this.skyTick || 0) + 1;
    if (this.quality >= 0 || this.skyTick % 2 === 0 || this.flash > 0.02) sc.drawBack(this.bgCtx, s * 0.5, camX, VW, t, this.wind, this.flash, "sky");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0, this.canvas.width, this.canvas.height);
    if (this.L.storm || this.L.highway) this.drawStormSky(ctx, s, camX, VW);
    sc.drawBack(ctx, s, camX, VW, t, this.wind, this.flash, "trees");
    if (this.quality >= 0) sc.drawFarMist(ctx, s, camX, VW, t, this.wind);
    sc.drawFarm(ctx, s, camX, VW, t, this.wind, infl);
    sc.drawFieldGrass(ctx, s, camX, VW, t, this.wind, infl);
    // actors in the farm plane
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const colLight = c.feedAmt * (this.progress > 0.02 ? 1 : 0.3);
    for (const h of this.herd) h.draw(ctx);
    this.cow.draw(ctx, colLight);
    if (this.L.highway && this.mode !== "menu") hwyDraw(ctx, s, camX, VW, t, this.flash, this.powerOut || 0), ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    this.car.draw(ctx);
    if (this.L.highway) hwyTruck(ctx, this.car);
    this.witness.draw(ctx, sc.warmAt(this.witness.x, GROUND - 30));
    if (this.mode === "menu") { sc.drawMenuCar(ctx, s, camX, camX + VW * 0.13); ctx.setTransform(s, 0, 0, s, -camX * s, 0); }
    sc.drawLights(ctx, s, camX, VW, t);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    if (!(this.carDead > 0)) this.car.drawLights(ctx);
    // the creature, then its feeding column, then the clouds that hide it
    c.draw(ctx, this.edgeLight, 1);
    if (c.feedAmt > 0.02) this.drawColumn(ctx, s, camX);
    this.drawParticles(ctx, s, camX, false);
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    const ms = sc.moonScreen(camX, VW);
    this.clouds.draw(ctx, camX - 100, camX + VW + 100, (x, y) => 0.12 + 0.6 * Math.exp(-Math.hypot(x - camX - ms.x, y - ms.y) / 380));
    // a faint presence through the cloud; lightning briefly throws its shape onto the cloud
    if (this.mode === "menu") {
      // v14 title shot: a huge saucer hangs half-buried in the storm ceiling near the moon
      const mx = camX + ms.x - 120, my = 132;
      const ox = c.x, oy = c.y;
      c.x = mx; c.y = my;
      ctx.save();
      ctx.beginPath();
      ctx.rect(mx - 500, my - 8, 1000, 300);
      ctx.clip();
      ctx.translate(mx, my); ctx.scale(3.4, 3.0); ctx.translate(-mx, -my);
      c.draw(ctx, 0.75, 0.9);
      ctx.restore();
      // faint light on its underside (one cached gradient sprite, scaled)
      if (!this.underGlow) {
        this.underGlow = makeCanvas(128, 32);
        const u = this.underGlow.getContext("2d");
        const ug = u.createRadialGradient(64, 8, 0, 64, 8, 64);
        ug.addColorStop(0, "rgba(150,165,185,0.55)"); ug.addColorStop(1, "rgba(150,165,185,0)");
        u.fillStyle = ug; u.fillRect(0, 0, 128, 32);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6 + 0.15 * Math.sin(t * 0.7);
      ctx.drawImage(this.underGlow, mx - 260, my + 2, 520, 60);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      c.x = ox; c.y = oy;
      if (this.occ > 0.25 && this.flash > 0.05) c.draw(ctx, 0, this.flash * 0.6 * this.occ, true);
    } else if (this.occ > 0.25) {
      const a = 0.3 + this.flash * 0.6;
      c.draw(ctx, 0, a * this.occ, true);
    } else if (this.occ > 0.25 && this.flash > 0.05) c.draw(ctx, 0, this.flash * 0.6 * this.occ, true);
    this.drawParticles(ctx, s, camX, true);
    if (this.beam > 0.02 && !(this.powerOut > 0)) this.drawBeam(ctx);
    if (this.emp && this.emp.t > EMP.dark - 0.7) this.drawEmpRing(ctx, this.emp, EMP.dark - this.emp.t);
    sc.drawFog(ctx, s, camX, VW, t, this.wind, 1);
    sc.drawWarmGlints(ctx, s, camX, t, this.carDead > 0 ? null : this.car);
    sc.drawFrontGrass(ctx, s, camX, VW, t, this.wind, infl);
    if (this.mode === "play") this.drawHiddenCue(ctx, s, VW);
    if (this.L.storm) this.drawStormFront(ctx, s, camX, VW);
    // vignette tightens with exposure
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const ex = this.mode === "play" ? clamp(this.exposure / TUNE.failExposure, 0, 1) : 0;
    ctx.globalAlpha = 0.55 + ex * 0.45;
    ctx.drawImage(this.vignette, -VW * ex * 0.08, -VH * ex * 0.08, VW * (1 + ex * 0.16), VH * (1 + ex * 0.16));
    ctx.globalAlpha = 1;
    if (this.flash > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(150,165,190,${this.flash * 0.12})`;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = "source-over";
    }
    if (this.mode === "fail") {
      ctx.fillStyle = `rgba(0,0,0,${smoothstep(0.6, 1.6, this.endT)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (this.mode === "win") {
      ctx.fillStyle = `rgba(0,0,0,${smoothstep(1.5, 4, this.endT) * 0.75})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    this.applyBrightness(ctx);
  }

  /** Brightness calibration (shared with Area 51). Expects a screen-space transform. */
  applyBrightness(ctx) {
    const VW = this.VW;
    const b = this.settings.brightness;
    // low end: a real darkening (0.7 is about half as bright). v28 (Mr Bug Fixit M7): the high end is ONE additive
    // ("lighter") fill instead of a full-screen color-dodge + screen pair; non-basic blends over the whole screen
    // were slowing old iPhones (A9-A11) whenever brightness was above 1. Additive is a plain GPU blend.
    if (b > 1.001) {
      const k = (b - 1) * 2; // 0..1 over 1.0..1.5
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${Math.round(30 * k)},${Math.round(33 * k)},${Math.round(38 * k)},1)`;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = "source-over";
    } else if (b < 0.999) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, (1 - b) * 1.7)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  /** Storm Farm sky: a heavier, darker overcast and low scud racing over, thinning when a gust strips it. */
  drawStormSky(ctx, s, camX, VW) {
    const sc = this.scene;
    const dark = this.stormDark == null ? 1 : this.stormDark;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = `rgba(3,5,8,${0.12 + 0.3 * dark})`;
    ctx.fillRect(0, 0, VW, VH * 0.82);
    const nb = sc.bankNear;
    if (nb) {
      const x0 = -((camX * 0.22 + (this.scudX || 0)) % nb.width);
      ctx.globalAlpha = 0.25 + 0.5 * dark;
      for (let x = x0; x < VW; x += nb.width) ctx.drawImage(nb, x, -70, nb.width, nb.height * 1.15);
      if (this.quality >= 0) { // v17 Lite: one scud layer
        const x1 = -((camX * 0.3 + (this.scudX || 0) * 1.6 + 400) % nb.width);
        ctx.globalAlpha = 0.18 + 0.35 * dark;
        for (let x = x1; x < VW; x += nb.width) ctx.drawImage(nb, x, 40, nb.width, nb.height * 0.8);
      }
      ctx.globalAlpha = 1;
    }
    // stripped sky: cold moonlight floods back in where the overcast was torn away
    if (dark < 0.95) {
      const m = sc.moonScreen(camX, VW);
      const mx = clamp(m.x, VW * 0.15, VW * 0.85);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(mx, 60, 0, mx, 60, VW * 0.8);
      g.addColorStop(0, `rgba(120,135,158,${0.2 * (1 - dark)})`);
      g.addColorStop(1, "rgba(40,48,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH * 0.85);
      ctx.globalCompositeOperation = "source-over";
    }
  }
  /** Rain, the approaching rain curtain, and the gust front itself. */
  drawStormFront(ctx, s, camX, VW) {
    const S = this.st;
    const W = this.wind;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const slant = 0.22 + W.storm * 0.3 + this.howl * 0.5;
    // the warn phase: a grey curtain of rain building at the left edge
    if (S.phase === "warn" || S.phase === "hush") {
      const k = S.phase === "hush" ? 1 : clamp(S.t / STORM.warn, 0, 1);
      const g = ctx.createLinearGradient(0, 0, VW * 0.35, 0);
      g.addColorStop(0, `rgba(70,78,90,${0.32 * k})`);
      g.addColorStop(1, "rgba(70,78,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW * 0.35, VH);
    }
    // the front: a bright, dense wall of rain sweeping left to right
    let fx = -1e4;
    if (S.phase === "rip") {
      fx = S.front - camX;
      if (fx > -400 && fx < VW + 400) {
        const w = STORM.frontWidth;
        // slanted and soft: the top of the front runs ahead of the ground (wind is faster aloft)
        ctx.save();
        ctx.transform(1, 0, -0.45, 1, 0.45 * GROUND, 0);
        const g = ctx.createLinearGradient(fx - w * 2, 0, fx + w * 0.7, 0);
        g.addColorStop(0, "rgba(110,120,135,0)");
        g.addColorStop(0.5, "rgba(115,125,140,0.07)");
        g.addColorStop(0.8, "rgba(140,150,168,0.15)");
        g.addColorStop(1, "rgba(120,130,145,0)");
        ctx.fillStyle = g;
        ctx.fillRect(fx - w * 2, 0, w * 2.7, VH);
        ctx.restore();
        ctx.setTransform(s, 0, 0, s, 0, 0);
      }
    }
    // rain streaks: one path, cheap; count scales with quality
    const amt = this.rainAmt || 0;
    const n = Math.round((this.quality >= 2 ? 150 : this.quality >= 1 ? 95 : 50) * amt);
    if (n > 0) {
      const rt = this.rainT || 0;
      const span = VW * 1.4;
      ctx.strokeStyle = `rgba(165,176,192,${0.07 + 0.08 * amt})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const h1 = ((i * 73.13) % 1 + (i * 0.6180339) % 1) % 1;
        const h2 = (i * 0.7548776 + 0.31) % 1;
        const sp = 0.8 + ((i * 0.5698) % 1) * 0.5;
        const len = (14 + 16 * sp) * (1 + this.howl * 0.8);
        const y = (h2 * VH + rt * 880 * sp) % (VH + 40) - 20;
        let x = (h1 * span + rt * 880 * sp * slant - camX * 0.6) % span;
        if (x < 0) x += span;
        x -= VW * 0.2;
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * slant, y - len);
      }
      // a denser streak wall inside the front
      if (fx > -300 && fx < VW + 300) {
        for (let i = 0; i < n * 0.6; i++) {
          const x = fx - Math.random() * STORM.frontWidth * 1.2;
          const y = Math.random() * VH;
          ctx.moveTo(x, y);
          ctx.lineTo(x - 50 * slant, y - 40);
        }
      }
      ctx.stroke();
    }
  }

  drawColumn(ctx, s, camX) {
    const c = this.creature;
    const m = c.mouthPos();
    const a = c.feedAmt;
    const top = m.y + 6;
    const bot = GROUND + 18;
    const wTop = 58 * a;
    const wBot = 120 * a + 20;
    // 1) distortion: copy what's behind the column and redraw it in wavering strips
    const x0 = Math.floor((m.x - wBot - 10 - camX) * s);
    const y0 = Math.floor(top * s);
    const w = Math.ceil((wBot * 2 + 20) * s);
    const h = Math.ceil((bot - top) * s);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (w > 4 && h > 4 && x0 > -w && x0 < cw) {
      const sx = Math.max(0, x0);
      const sw = Math.min(cw, x0 + w) - sx;
      const shh = Math.min(ch - y0, h);
      if (sw > 2 && shh > 2) {
        if (this.colCanvas.width < sw || this.colCanvas.height < shh) {
          this.colCanvas.width = Math.max(this.colCanvas.width, sw);
          this.colCanvas.height = Math.max(this.colCanvas.height, shh);
        }
        const cc = this.colCanvas.getContext("2d");
        cc.clearRect(0, 0, sw, shh);
        cc.drawImage(this.canvas, sx, y0, sw, shh, 0, 0, sw, shh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const strips = this.quality >= 2 ? 40 : this.quality >= 1 ? 26 : 14;
        const sh = shh / strips;
        ctx.save();
        // clip to the column shape
        const cx = (m.x - camX) * s;
        ctx.beginPath();
        ctx.moveTo(cx - wTop * s, top * s);
        ctx.lineTo(cx + wTop * s, top * s);
        ctx.lineTo(cx + wBot * s, bot * s);
        ctx.lineTo(cx - wBot * s, bot * s);
        ctx.closePath();
        ctx.clip();
        for (let i = 0; i < strips; i++) {
          const yy = i * sh;
          const off = Math.sin(i * 0.7 - this.t * 7) * 4.5 * s * a + Math.sin(i * 1.9 + this.t * 3) * 2.2 * s * a;
          ctx.drawImage(this.colCanvas, 0, yy, sw, sh + 1, sx + off, y0 + yy, sw, sh + 1);
        }
        ctx.restore();
      }
    }
    // 2) pale, faint pressure light
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    ctx.globalCompositeOperation = "lighter";
    const flick = 0.85 + 0.15 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3);
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, `rgba(150,160,170,${0.08 * a * flick})`);
    g.addColorStop(0.5, `rgba(120,130,140,${0.025 * a * flick})`);
    g.addColorStop(1, `rgba(120,130,140,${0.05 * a * flick})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(m.x - wTop, top);
    ctx.lineTo(m.x + wTop, top);
    ctx.lineTo(m.x + wBot, bot);
    ctx.lineTo(m.x - wBot, bot);
    ctx.closePath();
    ctx.fill();
    // rising ripples
    ctx.strokeStyle = `rgba(200,210,220,${0.05 * a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const p = (this.t * 0.35 + k / 6) % 1;
      const y = lerp(bot, top, p);
      const hw = lerp(wBot, wTop, p) * 0.9;
      ctx.moveTo(m.x - hw, y);
      ctx.quadraticCurveTo(m.x, y - 6, m.x + hw, y);
    }
    ctx.stroke();
    // a pool of pale light on the ground
    const pg = ctx.createRadialGradient(m.x, bot - 6, 0, m.x, bot - 6, wBot * 1.3);
    pg.addColorStop(0, `rgba(150,158,166,${0.08 * a})`);
    pg.addColorStop(1, "rgba(170,180,190,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(m.x - wBot * 1.4, bot - 40, wBot * 2.8, 60);
    ctx.globalCompositeOperation = "source-over";
  }

  drawBeam(ctx) {
    const o = this.beamOrigin();
    const a = this.beamAng;
    const len = 1150;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(o.x, o.y, o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,240,215,${0.3 * this.beam})`);
    g.addColorStop(1, "rgba(255,240,215,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.cos(a - 0.08) * len, o.y + Math.sin(a - 0.08) * len);
    ctx.lineTo(o.x + Math.cos(a + 0.08) * len, o.y + Math.sin(a + 0.08) * len);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,245,225,${0.8 * this.beam})`;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 2.5, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  drawParticles(ctx, s, camX, front) {
    ctx.setTransform(s, 0, 0, s, -camX * s, 0);
    for (const p of this.particles) {
      const f = 1 - p.life / p.max;
      if (p.k === "shred") {
        if (!front) continue;
        const r = p.size * (1 + p.life * 0.5);
        ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, p.life / p.max)) * 0.8;
        ctx.drawImage(p.sp.lit[1], p.x - r * 1.6, p.y - r * 0.45, r * 3.2, r * 0.9);
        continue;
      }
      if (p.k === "wisp") {
        if (!front) continue;
        const r = p.size * (1 + p.life * 0.8);
        ctx.globalAlpha = f * 0.5;
        ctx.drawImage(p.sp.body, p.x - r, p.y - r, r * 2, r * 2);
        continue;
      }
      if (front) continue;
      if (p.k === "dust") {
        const a = (p.burst ? 0.55 : 0.45) * f;
        const col = p.burst ? `rgba(168,155,130,${a})` : `rgba(150,158,165,${a})`;
        ctx.fillStyle = col;
        if (p.burst) {
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * 1.8, p.size * 1.2, p.rot || 0, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(p.x, p.y, p.size, p.size);
      } else if (p.k === "grass") {
        ctx.strokeStyle = `rgba(20,24,28,${0.9 * f})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(p.rot) * 6, p.y + Math.sin(p.rot) * 6);
        ctx.stroke();
      } else if (p.k === "leaf") {
        ctx.fillStyle = "rgba(8,9,11,0.9)";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.sin(p.rot * 1.3)) + 0.2);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.6, p.size, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}

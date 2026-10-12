// Grounded actors: a witness with planted feet, a car with weight and suspension, and a cow.
import { GROUND, HOUSE, COW_X, WORLD_W, roadY } from "./config.js?v=22";
import { clamp, damp, lerp, smooth, TAU, noise1 } from "./util.js?v=22";

const FOOT_Y = GROUND + 4;
const L1 = 18;
const L2 = 18;

function ik(hx, hy, fx, fy, facing) {
  // two-bone leg; knee bends forward (in the facing direction)
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.01;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const a = Math.atan2(dy, dx);
  const cosK = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const k = Math.acos(cosK);
  const ang = a - k * facing;
  return { kx: hx + Math.cos(ang) * L1, ky: hy + Math.sin(ang) * L1, fx: hx + dx, fy: hy + dy };
}

export class Witness {
  constructor() {
    this.reset();
  }
  reset() {
    this.state = "inside";
    this.timer = 0;
    this.x = HOUSE.door;
    this.v = 0;
    this.prevV = 0;
    this.dir = -1; // facing
    this.face = -1; // smoothed facing (-1..1) for turning
    this.lean = 0;
    this.headUp = 0;
    this.headUpT = 0;
    this.fear = 0;
    this.sightless = 0;
    this.targetX = 1840;
    this.feet = [
      { x: this.x - 3, y: FOOT_Y, sw: -1 },
      { x: this.x + 3, y: FOOT_Y, sw: -1 },
    ];
    this.idleT = 0;
    this.outT = 0;
    this.outLimit = 18 + Math.random() * 6;
    this.attnX = 0;
    this.sees = 0;
    this.visible = false;
    this.events = [];
    this.flash = 0; // flashlight on
    this.beamAng = -1.2;
    this.lastKnown = null;
    this.armUp = 0;
    this.scared = false;
    this.nextExit = 4;
    this.quickTrip = false;
    this.stepEvents = 0;
  }
  get outside() {
    return !["inside", "search"].includes(this.state);
  }
  setState(s) {
    this.state = s;
    this.timer = 0;
  }
  /** Something heard (feeding pressure, the dog, the cow). */
  hear(x) {
    if (["walk", "idle"].includes(this.state)) {
      this.attnX = x;
      this.setState("notice");
      this.events.push("notice");
    }
  }
  /** Can the witness physically see a point right now? (attention + facing + in the open) */
  looking(x, y) {
    if (!this.outside || this.state === "exit") return false;
    const dx = x - this.x;
    const d = Math.hypot(dx, y - GROUND);
    if (d > 1500) return false;
    if (["lookup", "backaway"].includes(this.state)) return true;
    if (this.state === "flee") return dx * this.dir > -40 && d < 700; // glances back
    if (this.state === "notice") return dx * this.dir > -80;
    // idle / walk: eyes on the horizon — only low craft (feeding height) or very close
    // Mid-height peeks above ~320 are soft / missed so high cloud hides feel safe
    return dx * this.dir > -60 && y > 320;
  }
  update(dt, scene) {
    this.timer += dt;
    let want = 0; // desired velocity
    let accel = 70;
    switch (this.state) {
      case "inside":
        scene.doorOpen = damp(scene.doorOpen, 0, 8, dt);
        if (!this.scared && this.timer > this.nextExit) this.setState("exit");
        break;
      case "exit":
        scene.doorOpen = damp(scene.doorOpen, 1, 5, dt);
        if (this.timer > 0.7) {
          this.visible = true;
          this.events.push("door");
          this.dir = -1;
          this.face = -1;
          this.targetX = 1800 + Math.random() * 110;
          this.outT = 0;
          // a short trip outside, then back in (35-45 s loop); a storm bang is just a quick look at the weather
          this.outLimit = this.quickTrip ? 6 + Math.random() * 3 : 18 + Math.random() * 6;
          this.quickTrip = false;
          this.setState("walk");
        }
        break;
      case "walk": {
        this.outT += dt;
        const dx = this.targetX - this.x;
        this.dir = Math.sign(dx) || this.dir;
        want = Math.sign(dx) * Math.min(44, Math.abs(dx) * 0.9);
        if (Math.abs(dx) < 3 && Math.abs(this.v) < 6) this.setState("idle");
        if (this.timer > 3) scene.doorOpen = damp(scene.doorOpen, 0.15, 1, dt);
        break;
      }
      case "idle":
        this.idleT += dt;
        this.outT += dt;
        this.headUp = damp(this.headUp, 0.12 * Math.max(0, Math.sin(this.timer * 0.4)), 2, dt);
        // occasionally look the other way, or wander a few steps along the fence
        if (this.timer > 5 + (this.x % 3)) {
          const r = Math.random();
          if (this.outT > this.outLimit) {
            this.targetX = HOUSE.door;
            this.goingIn = true;
            this.setState("walk");
          } else if (r < 0.5) {
            this.dir *= -1;
            this.timer = 0;
          } else {
            this.targetX = clamp(this.x + (Math.random() - 0.5) * 160, 1700, 1990);
            this.setState("walk");
          }
        }
        if (this.goingIn && Math.abs(this.x - HOUSE.door) < 4) this.goIn(false);
        break;
      case "notice":
        // freeze, turn toward the sound, listen
        this.dir = Math.sign(this.attnX - this.x) || this.dir;
        this.headUp = damp(this.headUp, 0.25, 3, dt);
        if (this.timer > 1.1) this.setState("lookup");
        break;
      case "lookup":
        this.headUp = damp(this.headUp, this.headUpT, 3.5, dt);
        if (this.sees > 0) {
          this.fear += dt * (0.6 + this.sees);
          this.sightless = 0;
        } else {
          this.sightless += dt;
          this.fear = Math.max(0, this.fear - dt * 0.15);
        }
        if (this.fear > 1.3) {
          this.setState("backaway");
          this.events.push("gasp");
        } else if (this.sightless > 4.5) {
          this.fear = 0;
          this.sightless = 0;
          this.setState("idle");
        }
        break;
      case "backaway":
        this.headUp = damp(this.headUp, this.headUpT, 3, dt);
        // keep facing the thing, step backwards away from it
        want = -this.dir * 24;
        accel = 50;
        if (this.timer > 2.3) {
          this.setState("turn");
          this.events.push("scream");
        }
        break;
      case "turn":
        this.dir = Math.sign(HOUSE.door - this.x) || 1;
        this.headUp = damp(this.headUp, 0, 6, dt);
        want = this.dir * 30;
        accel = 160;
        if (this.timer > 0.32) this.setState("flee");
        break;
      case "flee": {
        const dx = HOUSE.door - this.x;
        this.dir = Math.sign(dx) || this.dir;
        want = this.dir * Math.min(175, Math.abs(dx) * 3 + 30);
        accel = 330;
        scene.doorOpen = damp(scene.doorOpen, 1, 6, dt);
        if (Math.abs(dx) < 6) this.goIn(true);
        break;
      }
      case "search":
        // standing in the doorway with a torch, sweeping the sky
        scene.doorOpen = damp(scene.doorOpen, 1, 5, dt);
        this.flash = damp(this.flash, 1, 3, dt);
        this.armUp = damp(this.armUp, 1, 4, dt);
        break;
    }
    if (this.state !== "search") {
      this.flash = damp(this.flash, 0, 6, dt);
      this.armUp = damp(this.armUp, 0, 4, dt);
    }
    // --- locomotion with limited acceleration
    const dv = want - this.v;
    const a = clamp(dv, -accel * dt, accel * dt);
    this.prevV = this.v;
    this.v += a;
    this.x += this.v * dt;
    const acc = (this.v - this.prevV) / Math.max(dt, 1e-4);
    // turning: the body narrows through side-on
    this.face = damp(this.face, this.dir, this.state === "turn" || this.state === "flee" ? 12 : 6, dt);
    const speed = Math.abs(this.v);
    const run = clamp((speed - 60) / 90, 0, 1);
    const moveDir = Math.sign(this.v);
    let leanT = clamp(this.v / 175, -1, 1) * (0.1 + run * 0.28) + clamp(acc / 1200, -0.12, 0.12);
    if (this.state === "backaway") leanT = this.dir * -0.1; // leaning back away from it
    if (this.state === "lookup") leanT = this.dir * -0.05;
    this.lean = damp(this.lean, leanT, 7, dt);
    this.stepFeet(dt, speed, moveDir, run);
  }
  goIn(scared) {
    this.visible = false;
    this.x = HOUSE.door;
    this.v = 0;
    this.feet[0].x = this.x - 3;
    this.feet[1].x = this.x + 3;
    this.feet[0].sw = this.feet[1].sw = -1;
    this.idleT = 0;
    this.goingIn = false;
    this.events.push(scared ? "slam" : "doorclose");
    this.scared = scared;
    this.nextExit = 10 + Math.random() * 6;
    this.setState("inside");
  }
  startSearch(lastKnown) {
    this.lastKnown = lastKnown;
    this.x = HOUSE.door;
    this.visible = true;
    this.dir = -1;
    this.face = -1;
    this.setState("search");
  }
  endSearch() {
    this.scared = false;
    this.goIn(false);
    this.events.pop(); // quiet close
    this.events.push("doorclose");
  }
  stepFeet(dt, speed, md, run) {
    const feet = this.feet;
    let swinging = feet.find((f) => f.sw >= 0);
    const stride = clamp(speed * 0.55, 17, 29) + run * 30;
    if (!swinging) {
      if (speed > 4) {
        // the rear foot (relative to motion) steps when it falls behind the hips
        const back = (feet[0].x - this.x) * md < (feet[1].x - this.x) * md ? feet[0] : feet[1];
        if ((this.x - back.x) * md > stride * 0.48) {
          const dur = clamp((stride / speed) * 0.85, 0.14, 0.42);
          back.sw = 0;
          back.sx = back.x;
          back.dur = dur;
          back.tx = this.x + this.v * dur + md * stride * 0.5;
          back.lift = 3.5 + run * 8;
          swinging = back;
        }
      } else {
        // settling: a small final step brings the feet under the body (no sliding to a stop)
        const far = Math.abs(feet[0].x - this.x) > Math.abs(feet[1].x - this.x) ? feet[0] : feet[1];
        const other = far === feet[0] ? feet[1] : feet[0];
        if (Math.abs(far.x - this.x) > 7) {
          far.sw = 0;
          far.sx = far.x;
          far.dur = 0.3;
          far.tx = this.x + (other.x < this.x ? 4 : -4);
          far.lift = 3;
        }
      }
    }
    for (const f of feet) {
      if (f.sw < 0) {
        f.y = FOOT_Y;
        continue;
      }
      f.sw += dt / f.dur;
      const p = Math.min(1, f.sw);
      f.x = lerp(f.sx, f.tx, smooth(p));
      f.y = FOOT_Y - Math.sin(p * Math.PI) * f.lift;
      if (f.sw >= 1) {
        f.sw = -1;
        f.y = FOOT_Y;
        this.stepEvents++;
      }
    }
  }
  draw(ctx, warm, flashLight) {
    if (!this.visible) return;
    const [fa, fb] = this.feet;
    const spread = Math.abs(fa.x - fb.x);
    const run = clamp((Math.abs(this.v) - 60) / 90, 0, 1);
    const legReach = (L1 + L2) * (0.97 - run * 0.05);
    const hipY = FOOT_Y - Math.sqrt(Math.max(30, legReach * legReach - (spread * 0.5) * (spread * 0.5))) - 1;
    const hipX = this.x;
    const f = this.face;
    const facing = f >= 0 ? 1 : -1;
    const w = Math.max(0.35, Math.abs(f)); // body narrows mid-turn
    const torso = 24;
    const sx = hipX + Math.sin(this.lean) * torso;
    const sy = hipY - Math.cos(this.lean) * torso;
    const rim = warm > 0.02 ? `rgba(255,170,100,${0.5 * warm})` : null;
    const body = "#07080a";
    const drawAll = (col, ox) => {
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // legs (far leg slightly darker is skipped; silhouette)
      for (const ft of [fa, fb]) {
        const leg = ik(hipX + ox, hipY, ft.x + ox, ft.y, facing);
        ctx.lineWidth = 5.6;
        ctx.beginPath();
        ctx.moveTo(hipX + ox, hipY);
        ctx.lineTo(leg.kx, leg.ky);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(leg.kx, leg.ky);
        ctx.lineTo(leg.fx, leg.fy);
        ctx.lineTo(leg.fx + facing * 5, leg.fy + 0.5);
        ctx.stroke();
      }
      // torso
      ctx.lineWidth = 11.5 * w;
      ctx.beginPath();
      ctx.moveTo(hipX + ox, hipY - 1);
      ctx.lineTo(sx + ox, sy + 2);
      ctx.stroke();
      // arms swing opposite to the legs; raised a little when frightened
      const fear = this.state === "backaway" ? 1 : 0;
      const sides = [fa, fb];
      for (let i = 0; i < 2; i++) {
        const opp = sides[1 - i];
        const swing = clamp((opp.x - hipX) / 22, -1, 1) * (0.45 + run * 0.6);
        let ua = Math.PI / 2 - swing * facing * -1 - fear * facing * 0.6;
        let elbow = 0.25 + run * 1.1 + fear * 0.8;
        if (i === 0 && this.armUp > 0.01) {
          ua = lerp(ua, Math.PI / 2 - facing * 2.0, this.armUp);
          elbow = lerp(elbow, 0.1, this.armUp);
        }
        const ex = sx + ox + Math.cos(ua) * 14;
        const ey = sy + 2 + Math.sin(ua) * 14;
        const la = ua - elbow * facing;
        const hx = ex + Math.cos(la) * 13;
        const hy = ey + Math.sin(la) * 13;
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + 2);
        ctx.lineTo(ex, ey);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        if (i === 0) this.hand = { x: hx, y: hy };
      }
      // head + cap; tilts back when looking up
      const ha = this.lean - this.headUp * facing;
      const hx = sx + ox + Math.sin(ha) * 8.6;
      const hy = sy - Math.cos(ha) * 8.6;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ha);
      ctx.fillRect(-6.2, -7, 12.4, 3.6);
      ctx.fillRect(facing > 0 ? 3.5 : -10.5, -5, 7, 2); // brim
      ctx.restore();
      this.head = { x: hx, y: hy };
    };
    if (rim) drawAll(rim, facing * -0.9 * Math.sign(this.x - HOUSE.door + 0.1));
    drawAll(body, 0);
  }
}

export class Car {
  constructor() {
    this.reset();
  }
  reset() {
    this.state = "off";
    this.x = -300;
    this.v = 0;
    this.wheel = 0;
    this.pitch = 0;
    this.pitchV = 0;
    this.bounce = 0;
    this.bounceV = 0;
    this.timer = 0;
    this.brakeLight = 0;
    this.reverseLight = 0;
    this.sees = 0;
    this.scared = false;
    this.events = [];
    this.target = 245;
  }
  get active() {
    return this.state !== "off";
  }
  spawn(x) {
    this.age = 0;
    this.state = "drive";
    this.x = x;
    this.v = 150;
    this.scared = false;
    this.timer = 0;
    this.target = 225 + Math.random() * 50;
    this.events.push("pass");
  }
  scare() {
    if (this.state !== "drive") return;
    this.scared = true;
    this.state = "brake";
    this.timer = 0;
    this.events.push("brake");
  }
  update(dt, camL) {
    if (this.state === "off") return;
    this.timer += dt;
    this.age = (this.age || 0) + dt;
    let a = 0;
    switch (this.state) {
      case "drive":
        a = clamp((this.target - this.v) * 0.8, -160, 85); // gentle acceleration
        if (this.x > WORLD_W + 300) this.state = "off";
        break;
      case "brake":
        a = -Math.min(430, this.v / Math.max(dt, 1e-3));
        if (this.v <= 0.5) {
          this.v = 0;
          this.state = "hesitate";
          this.timer = 0;
        }
        break;
      case "hesitate":
        // a small creep, a jolt as the gearbox goes into reverse
        a = this.timer < 0.6 ? 6 : -this.v * 8;
        if (this.timer > 1.5) {
          this.state = "reverse";
          this.timer = 0;
          this.events.push("reverse");
        }
        break;
      case "reverse":
        a = clamp((-170 - this.v) * 1.2, -140, 140);
        if (this.x < Math.min(camL - 320, -100) || this.x < -260) this.state = "off";
        break;
    }
    this.v += a * dt;
    this.x += this.v * dt;
    this.wheel += (this.v * dt) / 11;
    this.brakeLight = damp(this.brakeLight, this.state === "brake" || this.state === "hesitate" ? 1 : 0.15, 12, dt);
    this.reverseLight = damp(this.reverseLight, this.state === "reverse" || (this.state === "hesitate" && this.timer > 1) ? 1 : 0, 10, dt);
    // suspension: nose dips under braking, squats when accelerating; road bumps excite the body
    const pt = clamp(a / 2600, -0.09, 0.05);
    this.pitchV += ((pt - this.pitch) * 90 - this.pitchV * 9) * dt;
    this.pitch += this.pitchV * dt;
    const bumpIn = noise1(this.x * 0.05) * 1.2 * Math.min(1, Math.abs(this.v) / 100);
    this.bounceV += ((bumpIn - this.bounce) * 140 - this.bounceV * 10) * dt;
    this.bounce += this.bounceV * dt;
  }
  pose() {
    const r = roadY(this.x - 48);
    const f = roadY(this.x + 48);
    const roadAng = Math.atan2(f - r, 96);
    // positive pitch = nose up in screen space (we rotate by -pitch)
    return { y: (r + f) / 2 - 11, ang: roadAng + this.pitch };
  }
  headlight() {
    const p = this.pose();
    const c = Math.cos(p.ang);
    const s = Math.sin(p.ang);
    const lx = 74;
    const ly = -14 + this.bounce;
    return { x: this.x + lx * c - ly * s, y: p.y + this.bounce + lx * s + ly * c, ang: p.ang + 0.05 };
  }
  draw(ctx) {
    if (this.state === "off") return;
    const p = this.pose();
    // wheels stay on the road; the body rides on springs above them
    for (const wx of [-48, 48]) {
      const x = this.x + wx;
      const y = roadY(x) - 1;
      ctx.fillStyle = "#050607";
      ctx.beginPath();
      ctx.arc(x, y - 10, 11, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,66,72,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = this.wheel + (k * TAU) / 3;
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + Math.cos(a) * 6, y - 10 + Math.sin(a) * 6);
      }
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(this.x, p.y + this.bounce);
    ctx.rotate(p.ang);
    ctx.fillStyle = "#0b0d10";
    ctx.beginPath();
    ctx.moveTo(-78, -2);
    ctx.lineTo(-80, -18);
    ctx.quadraticCurveTo(-70, -24, -44, -25);
    ctx.lineTo(-30, -42);
    ctx.quadraticCurveTo(-5, -46, 22, -42);
    ctx.lineTo(40, -26);
    ctx.quadraticCurveTo(70, -24, 78, -17);
    ctx.lineTo(79, -4);
    ctx.quadraticCurveTo(60, 0, 58, 2);
    ctx.arc(48, 2, 13, 0, Math.PI, true);
    ctx.lineTo(-35, 2);
    ctx.arc(-48, 2, 13, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    // windows: dim, a driver's silhouette
    ctx.fillStyle = "rgba(42,48,56,0.85)";
    ctx.beginPath();
    ctx.moveTo(-26, -39);
    ctx.quadraticCurveTo(-4, -42, 18, -39);
    ctx.lineTo(33, -26);
    ctx.lineTo(-38, -26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#07080a";
    ctx.fillRect(-4, -39, 3, 13);
    ctx.beginPath();
    ctx.arc(14, -32, 4.2, 0, TAU);
    ctx.fill();
    ctx.fillRect(10, -30, 8, 5);
    // chrome line
    ctx.strokeStyle = "rgba(90,100,110,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-78, -12);
    ctx.lineTo(78, -11);
    ctx.stroke();
    // lamps
    ctx.fillStyle = "rgba(255,240,210,0.95)";
    ctx.fillRect(73, -17, 6, 5);
    ctx.fillStyle = `rgba(255,40,30,${0.35 + this.brakeLight * 0.65})`;
    ctx.fillRect(-81, -17, 4, 5);
    if (this.reverseLight > 0.05) {
      ctx.fillStyle = `rgba(240,240,255,${this.reverseLight})`;
      ctx.fillRect(-81, -11, 4, 3);
    }
    ctx.restore();
  }
  /** Additive light: head-light cones, a pool on the road, tail glow. */
  drawLights(ctx) {
    if (this.state === "off") return;
    const h = this.headlight();
    ctx.globalCompositeOperation = "lighter";
    const len = 560;
    const spread = 0.13;
    const flick = 0.92 + 0.08 * Math.sin(this.x * 0.3);
    for (const [k, a] of [
      [1, 0.2],
      [0.55, 0.12],
    ]) {
      const g = ctx.createLinearGradient(h.x, h.y, h.x + Math.cos(h.ang) * len, h.y + Math.sin(h.ang) * len);
      g.addColorStop(0, `rgba(255,236,200,${a * flick})`);
      g.addColorStop(1, "rgba(255,236,200,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y - 2);
      ctx.lineTo(h.x + Math.cos(h.ang - spread * k) * len, h.y + Math.sin(h.ang - spread * k) * len);
      ctx.lineTo(h.x + Math.cos(h.ang + spread * k * 0.8) * len, h.y + Math.sin(h.ang + spread * k * 0.8) * len);
      ctx.closePath();
      ctx.fill();
    }
    const gx = h.x + 130;
    const gy = roadY(gx) + 4;
    const pg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 140);
    pg.addColorStop(0, `rgba(255,230,190,${0.16 * flick})`);
    pg.addColorStop(1, "rgba(255,230,190,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(gx - 140, gy - 40, 280, 70);
    const hg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 26);
    hg.addColorStop(0, "rgba(255,245,220,0.7)");
    hg.addColorStop(1, "rgba(255,245,220,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(h.x - 26, h.y - 26, 52, 52);
    const p = this.pose();
    const tx = this.x - 80 * Math.cos(p.ang);
    const ty = p.y - 15;
    const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 30 + this.brakeLight * 20);
    tg.addColorStop(0, `rgba(255,40,30,${0.25 + this.brakeLight * 0.35})`);
    tg.addColorStop(1, "rgba(255,40,30,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(tx - 50, ty - 50, 100, 100);
    ctx.globalCompositeOperation = "source-over";
  }
  /** Is a point lit by the headlights? 0..1 */
  litAt(x, y) {
    if (this.state === "off") return 0;
    const h = this.headlight();
    const dx = x - h.x;
    const dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > 560 || dx <= 0) return 0;
    const a = Math.atan2(dy, dx) - h.ang;
    return Math.abs(a) < 0.15 ? 1 - d / 560 : 0;
  }
}

export class Cow {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = COW_X;
    this.baseY = GROUND + 10;
    this.y = this.baseY;
    this.lift = 0; // metres above the ground (world units)
    this.head = 0; // 0 grazing .. 1 up
    this.headT = 0;
    this.timer = 3;
    this.tail = 0;
    this.alert = 0;
    this.gone = false;
    this.rot = 0;
    this.fall = 0;
    this.kick = 0;
    this.t = Math.random() * 10;
    this.legLift = [0, 0, 0, 0];
  }
  update(dt, alarm, windGust) {
    this.t += dt;
    this.alert = damp(this.alert, alarm, 2, dt);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.headT = this.headT > 0.5 ? 0 : 1;
      this.timer = this.headT ? 2 + Math.random() * 3 : 4 + Math.random() * 6;
    }
    const ht = Math.max(this.headT, this.alert);
    this.head = damp(this.head, ht, 2.5, dt);
    this.tail = Math.sin(this.t * (1.3 + this.alert * 3)) * (0.3 + windGust * 0.3);
    this.rot = damp(this.rot, this.lift > 4 ? Math.sin(this.t * 0.9) * 0.25 : 0, 1.5, dt);
    this.kick = this.lift > 8 ? Math.sin(this.t * 7) * (1 - Math.min(1, this.lift / 200)) : 0;
    // nervous shuffling when alarmed: legs lift one at a time, hooves stay put otherwise
    for (let i = 0; i < 4; i++) {
      const ph = this.t * 6 + i * 1.7;
      this.legLift[i] = this.alert > 0.4 && this.lift < 1 ? Math.max(0, Math.sin(ph)) * 3 * this.alert : 0;
    }
  }
  draw(ctx, columnLight) {
    if (this.gone) return;
    const y = this.baseY - this.lift;
    ctx.save();
    ctx.translate(this.x, y);
    ctx.rotate(this.rot);
    const col = "#0a0b0d";
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = "round";
    // legs: planted, or dangling while lifted
    const dangle = Math.min(1, this.lift / 20);
    ctx.lineWidth = 4;
    const legs = [-20, -12, 16, 23];
    for (let i = 0; i < 4; i++) {
      const lx = legs[i];
      const sw = dangle * (Math.sin(this.t * 3 + i) * 4 + this.kick * 5 * (i % 2 ? 1 : -1));
      ctx.beginPath();
      ctx.moveTo(lx, -24);
      ctx.lineTo(lx + sw * 0.5, -12 - this.legLift[i] * 0.5);
      ctx.lineTo(lx + sw, 0 - this.legLift[i] + dangle * 3);
      ctx.stroke();
    }
    // body (heavier shoulder + hip for a sharper silhouette)
    ctx.beginPath();
    ctx.moveTo(-30, -38);
    ctx.quadraticCurveTo(-18, -48, -2, -46);
    ctx.quadraticCurveTo(14, -48, 24, -42);
    ctx.quadraticCurveTo(34, -38, 33, -28);
    ctx.quadraticCurveTo(32, -18, 20, -17);
    ctx.lineTo(-16, -16);
    ctx.quadraticCurveTo(-33, -18, -33, -30);
    ctx.closePath();
    ctx.fill();
    // udder / belly shadow mass
    ctx.beginPath();
    ctx.ellipse(2, -16, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // head and neck: down to graze, up when alert
    const ha = lerp(0.95, -0.15, this.head) - dangle * 0.5;
    ctx.save();
    ctx.translate(-27, -36);
    ctx.rotate(ha);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-16, -6);
    ctx.quadraticCurveTo(-24, -6, -25, 1);
    ctx.lineTo(-22, 6);
    ctx.lineTo(-12, 5);
    ctx.lineTo(2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-15, -6);
    ctx.lineTo(-13, -10);
    ctx.moveTo(-17, -5);
    ctx.lineTo(-21, -8);
    ctx.stroke();
    ctx.restore();
    // tail
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(30, -38);
    ctx.quadraticCurveTo(34 + this.tail * 4, -26, 32 + this.tail * 7, -16);
    ctx.stroke();
    // pale light from the column catching its back
    if (columnLight > 0.02) {
      ctx.strokeStyle = `rgba(190,200,210,${0.5 * columnLight})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-28, -40);
      ctx.quadraticCurveTo(-4, -46, 22, -42);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Background herd: more cows in the field. Not harvestable — they react and look up. */
export class HerdCow {
  constructor(x, scale = 0.85, seed = 1) {
    this.x0 = x;
    this.x = x;
    this.scale = scale;
    this.seed = seed;
    this.baseY = GROUND + 10 + (seed % 5);
    this.reset();
  }
  reset() {
    this.x = this.x0 + (this.seed % 7) - 3;
    this.head = 0;
    this.headT = 0;
    this.timer = 2 + (this.seed % 5);
    this.tail = 0;
    this.alert = 0;
    this.t = this.seed * 1.7;
    this.facing = this.seed % 2 ? 1 : -1;
  }
  update(dt, alarm, windGust) {
    this.t += dt;
    this.alert = damp(this.alert, alarm * (0.5 + (this.seed % 3) * 0.15), 1.6, dt);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.headT = this.headT > 0.5 ? 0 : 1;
      this.timer = this.headT ? 1.5 + Math.random() * 2.5 : 5 + Math.random() * 8;
      if (Math.random() < 0.15) this.facing *= -1;
    }
    this.head = damp(this.head, Math.max(this.headT, this.alert), 2.2, dt);
    this.tail = Math.sin(this.t * (1.1 + this.alert * 2.5) + this.seed) * (0.25 + windGust * 0.25);
    // tiny idle shift
    this.x = damp(this.x, this.x0 + Math.sin(this.t * 0.15 + this.seed) * 6, 0.4, dt);
  }
  draw(ctx) {
    const s = this.scale;
    ctx.save();
    ctx.translate(this.x, this.baseY);
    ctx.scale(this.facing * s, s);
    const col = "#08090b";
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = "round";
    ctx.lineWidth = 3.5;
    for (const lx of [-18, -10, 14, 20]) {
      ctx.beginPath();
      ctx.moveTo(lx, -20);
      ctx.lineTo(lx + Math.sin(this.t * 2 + lx) * this.alert, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-26, -34);
    ctx.quadraticCurveTo(-4, -40, 18, -36);
    ctx.quadraticCurveTo(26, -34, 25, -24);
    ctx.quadraticCurveTo(24, -16, 14, -15);
    ctx.lineTo(-14, -14);
    ctx.quadraticCurveTo(-28, -16, -28, -28);
    ctx.closePath();
    ctx.fill();
    const ha = lerp(0.9, -0.2, this.head);
    ctx.save();
    ctx.translate(-24, -30);
    ctx.rotate(ha);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(-14, -4);
    ctx.quadraticCurveTo(-20, -4, -21, 2);
    ctx.lineTo(-18, 5);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(24, -32);
    ctx.quadraticCurveTo(28 + this.tail * 3, -22, 26 + this.tail * 6, -12);
    ctx.stroke();
    ctx.restore();
  }
}

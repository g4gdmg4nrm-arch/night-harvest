// Touch: a floating stick on the left half, Feed (hold) and Burst on the right. Keyboard on desktop.
// Each touch is tracked by its own pointer id, and everything is released on blur/pause.
import { clamp } from "./util.js?v=26";

export class Input {
  constructor(root) {
    this.root = root;
    this.keys = new Set();
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.feedIds = new Set();
    this.burstQueued = false;
    this.pauseQueued = false;
    this.restartQueued = false;
    this.empQueued = false;
    this.enabled = false;
    this.touchUsed = false;
    this.el = {
      zone: root.querySelector("#stickZone"),
      base: root.querySelector("#stickBase"),
      knob: root.querySelector("#stickKnob"),
      feed: root.querySelector("#btnFeed"),
      burst: root.querySelector("#btnBurst"),
      emp: root.querySelector("#btnEmp"),
    };
    window.addEventListener("keydown", (e) => {
      if (e.repeat && !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === "shift" || k === "e" || k === "x") this.burstQueued = true;
      if (k === "escape" || k === "p") this.pauseQueued = true;
      if (k === "r") this.restartQueued = true;
      if (k === "q" || k === "c") this.empQueued = true; // v13 EMP
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.releaseAll());
    document.addEventListener("visibilitychange", () => document.hidden && this.releaseAll());

    const z = this.el.zone;
    z.addEventListener("pointerdown", (e) => {
      if (!this.enabled || this.stick.id !== null) return;
      this.touchUsed = true;
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      this.stick.x = 0;
      this.stick.y = 0;
      try {
        z.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.showStick(true);
      e.preventDefault();
    });
    const move = (e) => {
      if (e.pointerId !== this.stick.id) return;
      const R = 56;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // the base follows a finger that runs past it, so the stick never "sticks"
        this.stick.ox += (dx / d) * (d - R);
        this.stick.oy += (dy / d) * (d - R);
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.stick.x = dx / R;
      this.stick.y = dy / R;
      this.showStick(true);
    };
    z.addEventListener("pointermove", move);
    const up = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null;
      this.stick.x = this.stick.y = 0;
      this.showStick(false);
    };
    z.addEventListener("pointerup", up);
    z.addEventListener("pointercancel", up);
    z.addEventListener("lostpointercapture", up);

    const f = this.el.feed;
    f.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      this.touchUsed = true;
      this.feedIds.add(e.pointerId);
      try {
        f.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      f.classList.add("down");
      e.preventDefault();
    });
    const fUp = (e) => {
      this.feedIds.delete(e.pointerId);
      if (!this.feedIds.size) f.classList.remove("down");
    };
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) f.addEventListener(ev, fUp);
    this.el.burst.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      this.touchUsed = true;
      this.burstQueued = true;
      this.el.burst.classList.add("down");
      setTimeout(() => this.el.burst.classList.remove("down"), 160);
      e.preventDefault();
    });
    if (this.el.emp)
      this.el.emp.addEventListener("pointerdown", (e) => {
        if (!this.enabled) return;
        this.touchUsed = true;
        this.empQueued = true;
        e.preventDefault();
      });
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  showStick(on) {
    const { base, knob } = this.el;
    if (!on) {
      base.style.opacity = "0";
      knob.style.opacity = "0";
      return;
    }
    const r = this.root.getBoundingClientRect();
    base.style.opacity = "1";
    knob.style.opacity = "1";
    base.style.transform = `translate(${this.stick.ox - r.left - 56}px, ${this.stick.oy - r.top - 56}px)`;
    knob.style.transform = `translate(${this.stick.ox - r.left - 24 + this.stick.x * 56}px, ${this.stick.oy - r.top - 24 + this.stick.y * 56}px)`;
  }
  releaseAll() {
    this.keys.clear();
    this.stick.id = null;
    this.stick.x = this.stick.y = 0;
    this.feedIds.clear();
    this.el.feed.classList.remove("down");
    this.showStick(false);
    this.burstQueued = false;
    this.empQueued = false;
  }
  get move() {
    let x = this.stick.x;
    let y = this.stick.y;
    const k = this.keys;
    if (k.has("arrowleft") || k.has("a")) x -= 1;
    if (k.has("arrowright") || k.has("d")) x += 1;
    if (k.has("arrowup") || k.has("w")) y -= 1;
    if (k.has("arrowdown") || k.has("s")) y += 1;
    // a small dead zone, then a soft curve for fine stalking control
    const m = Math.hypot(x, y);
    const o = this._mv || (this._mv = { x: 0, y: 0 }); // v13 perf: one reused object
    if (m < 0.12) return (o.x = 0), (o.y = 0), o;
    const c = clamp((m - 0.12) / 0.88, 0, 1);
    const s = (c * c * 0.4 + c * 0.6) / m;
    o.x = x * s;
    o.y = y * s;
    return o;
  }
  get feed() {
    return this.feedIds.size > 0 || this.keys.has(" ") || this.keys.has("f");
  }
  takeBurst() {
    const b = this.burstQueued;
    this.burstQueued = false;
    return b;
  }
  takeEmp() {
    const b = this.empQueued;
    this.empQueued = false;
    return b;
  }
  takePause() {
    const b = this.pauseQueued;
    this.pauseQueued = false;
    return b;
  }
  takeRestart() {
    const b = this.restartQueued;
    this.restartQueued = false;
    return b;
  }
}

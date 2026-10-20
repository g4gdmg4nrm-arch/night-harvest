// v24: shared people renderer. Shaded, clothed, readable figures (heads, hands, shoes, folds) that still sit
// dark in the night: a cold moon rim on one side, an optional warm rim (doorway / torch), a soft contact shadow.
// Local frame: facing +x, feet on y = 0, about 60 units tall at scale 1. Angles are from straight down,
// positive = toward the facing direction.
import { clamp, TAU } from "./util.js?v=29";
import { audio } from "./audio.js?v=29";

// v28 voice-line hook: a person who spots the UFO (starts looking up, pointing or running) calls
// audio.say("spot-<kind>", { kind, x, why }) for Gamer Girl's clips. A guarded no-op until audio.say exists, so it
// never throws or plays anything by itself. One line at a time across all people (VOICE_GAP ms apart).
// Kinds: sci, soldier, guard, farmer, civ. why: "look" | "point" | "run".
const VOICE_GAP = 3500;
let voiceLast = -1e9;
export function personSpotted(fig, why = "look") {
  try {
    if (typeof audio.say !== "function") return false;
    const now = performance.now();
    if (now - voiceLast < VOICE_GAP) return false;
    voiceLast = now;
    audio.say("spot-" + fig.kind, { kind: fig.kind, x: fig.x, why });
    return true;
  } catch {
    return false;
  }
}

const T = 14, S = 14.5, TORSO = 23, UA = 11, FA = 10.5; // thigh, shin, torso, upper arm, forearm
export const PERSON = { T, S, TORSO };

const STYLES = {
  // pale lab coat over dark trousers, bare head
  sci: { top: [150, 156, 162], bot: [30, 32, 36], skin: [128, 110, 98], hair: [26, 22, 20], shoe: [12, 12, 13], coat: 15, head: "hair" },
  // olive fatigues, webbing belt, helmet
  soldier: { top: [58, 64, 44], bot: [50, 56, 38], skin: [112, 94, 82], hair: [20, 20, 18], shoe: [14, 13, 12], coat: 4, head: "helmet", belt: [26, 28, 20], helm: [46, 52, 36] },
  // dark security uniform, peaked cap, torch
  guard: { top: [30, 34, 40], bot: [22, 24, 28], skin: [116, 98, 86], hair: [18, 18, 18], shoe: [10, 10, 11], coat: 3, head: "cap", belt: [12, 12, 14], torch: true },
  // farmer (levels 2-4): canvas jacket, jeans, cap
  farmer: { top: [62, 52, 40], bot: [34, 40, 54], skin: [126, 104, 90], hair: [30, 26, 22], shoe: [16, 14, 12], coat: 5, head: "cap" },
};
// townsfolk woken in the night: robes, pyjamas, hoodies (picked per person)
const CIV = [
  { top: [92, 84, 96], bot: [92, 84, 96], skin: [130, 110, 96], hair: [40, 32, 24], shoe: [20, 18, 18], coat: 16, head: "hair" }, // dressing gown
  { top: [70, 82, 96], bot: [56, 64, 78], skin: [122, 102, 90], hair: [22, 20, 18], shoe: [18, 18, 18], coat: 2, head: "hair" }, // pyjamas
  { top: [48, 50, 54], bot: [36, 40, 50], skin: [118, 98, 86], hair: [16, 14, 12], shoe: [14, 14, 14], coat: 5, head: "hood" }, // hoodie
  { top: [110, 104, 92], bot: [40, 38, 36], skin: [134, 114, 100], hair: [86, 80, 74], shoe: [20, 18, 16], coat: 3, head: "hair" }, // old man, vest
];
export function styleFor(kind, seed = 0) {
  return kind === "civ" ? CIV[Math.abs(seed | 0) % CIV.length] : STYLES[kind] || STYLES.sci;
}

const rgb = (c, k, a = 1) => `rgba(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0},${a})`;
const P = (x, y, a, L) => [x + Math.sin(a) * L, y + Math.cos(a) * L];

/** Pose helper for a gait: phase ph (radians), amount run 0..1 (0 = walk, 1 = sprint). Returns legs/arms angles + hip height. */
export function gaitPose(ph, run, moving) {
  const A = moving ? 0.34 + run * 0.2 : 0;
  const legs = [];
  for (const k of [0, Math.PI]) {
    const p = ph + k;
    const hip = A * Math.sin(p);
    const knee = moving ? 0.18 + (0.45 + run * 0.4) * Math.max(0, Math.cos(p)) : 0.04;
    legs.push([hip, hip - knee]);
  }
  let reach = 0;
  for (const [a, b] of legs) reach = Math.max(reach, Math.cos(a) * T + Math.cos(b) * S);
  const arms = [];
  for (const k of [Math.PI, 0]) { // arms opposite the legs
    const sw = -(0.32 + run * 0.5) * Math.sin(ph + k) * (moving ? 1 : 0);
    const el = 0.18 + run * 1.15;
    arms.push([sw, sw + el]);
  }
  return { hipY: -Math.max(reach, (T + S) * (moving ? 0.9 : 0)), legs, arms }; // the body never sinks into a lunge; a foot lifts instead
}

/** Draw one person. o: { st, legs:[[a,b],[a,b]] (far, near), arms:[[a,b],[a,b]] (far, near), hipX, hipY, lean, head,
 *  light 0..1, rim (+1 light from the front, -1 from behind), warm 0..1 (warm rim alpha), face 0..1 (pale upturned face),
 *  sc scale, shadow true }. Returns { head, hand } in local units (for torches). */
export function drawPerson(ctx, o) {
  const st = o.st, sc = o.sc || 1;
  const L = clamp(o.light == null ? 0.3 : o.light, 0, 1);
  const base = 0.34 + L * 0.42; // night: clothes read as muted tones, not flat black
  const dark = base * 0.55;
  const rimK = 0.75 + L * 0.9;
  const rimS = o.rim || 1;
  ctx.save();
  ctx.scale(sc, sc);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const hx = o.hipX || 0, hy = o.hipY;
  // contact shadow
  if (o.shadow !== false) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(hx, 0.6, 11, 2.2, 0, 0, TAU);
    ctx.fill();
  }
  const leg = (lg, near) => {
    const [kx, ky] = P(hx, hy, lg[0], T);
    const [ax, ay] = P(kx, ky, lg[1], S);
    const k = near ? 1 : 0.62;
    ctx.strokeStyle = rgb(st.bot, base * k);
    ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ax, ay); ctx.stroke();
    // shoe: a little wedge, toe forward
    ctx.fillStyle = rgb(st.shoe, 1);
    ctx.beginPath();
    ctx.moveTo(ax - 2.2, ay - 1.6);
    ctx.lineTo(ax + 4.6, ay - 0.6);
    ctx.quadraticCurveTo(ax + 5.4, ay + 1.1, ax + 3.8, ay + 1.3);
    ctx.lineTo(ax - 2.4, ay + 1.3);
    ctx.closePath();
    ctx.fill();
    // moonlit edge of the trouser leg + knee crease
    if (near) {
      ctx.strokeStyle = rgb(st.bot, rimK * 1.25, 0.55);
      ctx.lineWidth = 1;
      const e = rimS * 2.2;
      ctx.beginPath(); ctx.moveTo(hx + e, hy); ctx.lineTo(kx + e, ky); ctx.lineTo(ax + e * 0.8, ay - 1); ctx.stroke();
    }
  };
  const lean = o.lean || 0;
  const nx = hx + Math.sin(lean) * TORSO, ny = hy - Math.cos(lean) * TORSO; // neck
  const shx = nx - Math.sin(lean) * 2.5, shy = ny + Math.cos(lean) * 2.5; // shoulder pivot
  const arm = (am, near, idx) => {
    const [ex, ey] = P(shx, shy, am[0], UA);
    const [wx, wy] = P(ex, ey, am[1], FA);
    const k = near ? 1 : 0.6;
    ctx.strokeStyle = rgb(st.top, base * k);
    ctx.lineWidth = 3.9;
    ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
    if (near) {
      ctx.strokeStyle = rgb(st.top, rimK * 1.15, 0.5);
      ctx.lineWidth = 0.9;
      const e = rimS * 1.6;
      ctx.beginPath(); ctx.moveTo(shx + e, shy); ctx.lineTo(ex + e, ey); ctx.lineTo(wx + e, wy); ctx.stroke();
    }
    // hand
    ctx.fillStyle = rgb(st.skin, base * k * 0.9);
    ctx.beginPath(); ctx.arc(wx, wy + 0.6, 1.9, 0, TAU); ctx.fill();
    if (idx === 1) out.hand = { x: wx * sc, y: wy * sc };
  };
  const out = { head: null, hand: null };
  // far side first
  leg(o.legs[0], false);
  arm(o.arms[0], false, 0);
  leg(o.legs[1], true);
  // torso (in a frame rotated by the lean, hip at origin, up = -y)
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean);
  const coat = st.coat || 0;
  const sway = o.sway || 0;
  const g = ctx.createLinearGradient(-6 * rimS, 0, 6 * rimS, 0);
  g.addColorStop(0, rgb(st.top, dark));
  g.addColorStop(0.55, rgb(st.top, base));
  g.addColorStop(1, rgb(st.top, base * 1.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-4.6, coat > 6 ? 0 : 1.5);
  if (coat > 6) {
    // long coat: flares past the thighs and swings a little with the stride
    ctx.lineTo(-6.5 - sway * 0.6, coat);
    ctx.quadraticCurveTo(0, coat + 1.6, 6.8 + sway, coat - 0.5);
    ctx.lineTo(4.8, 0);
  } else {
    ctx.lineTo(-4.4, coat);
    ctx.lineTo(4.6, coat);
    ctx.lineTo(4.8, 0);
  }
  ctx.quadraticCurveTo(5.8, -12, 5.0, -TORSO + 3.5); // chest
  ctx.quadraticCurveTo(3.6, -TORSO - 0.6, 0, -TORSO - 0.4); // shoulder top
  ctx.quadraticCurveTo(-4.6, -TORSO, -5.2, -TORSO + 4); // back of the shoulder, slight hunch
  ctx.quadraticCurveTo(-6.2, -11, -4.6, 0);
  ctx.closePath();
  ctx.fill();
  // folds / seams: a front line on coats, a belt, pockets
  ctx.lineWidth = 0.8;
  if (coat > 6) {
    ctx.strokeStyle = rgb(st.top, dark * 0.8);
    ctx.beginPath(); ctx.moveTo(3.8, -TORSO + 5); ctx.lineTo(4.2, coat - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, 2); ctx.quadraticCurveTo(0, coat * 0.6, -2 - sway * 0.3, coat); ctx.stroke(); // fold
  }
  if (st.belt) {
    ctx.fillStyle = rgb(st.belt, base);
    ctx.fillRect(-4.8, -2.2, 9.8, 2.2);
    ctx.fillRect(-1, -13, 1.4, 11); // strap
  }
  if (st.head === "hood") {
    ctx.fillStyle = rgb(st.top, dark);
    ctx.beginPath(); ctx.ellipse(-3, -TORSO + 1, 3.6, 2.4, 0.3, 0, TAU); ctx.fill(); // the hood bunched at the neck
  }
  // rim light along the lit side of the body
  ctx.strokeStyle = rgb(st.top, rimK * 1.25, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (rimS > 0) { ctx.moveTo(5.0, -TORSO + 3.5); ctx.quadraticCurveTo(5.8, -12, coat > 6 ? 6.6 + sway : 4.8, coat > 6 ? coat - 1 : coat); }
  else { ctx.moveTo(-5.2, -TORSO + 4); ctx.quadraticCurveTo(-6.2, -11, coat > 6 ? -6.4 : -4.4, coat > 6 ? coat - 1 : coat); }
  ctx.stroke();
  if (o.warm > 0.02) {
    ctx.strokeStyle = `rgba(255,176,104,${0.55 * o.warm})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-5.2, -TORSO + 4); ctx.quadraticCurveTo(-6.2, -11, -4.6, coat > 6 ? coat : 0); ctx.stroke();
  }
  ctx.restore();
  // head on a short neck, tilted back when looking up
  const ha = lean - (o.head || 0);
  const hcx = nx + Math.sin(ha) * 6.2, hcy = ny - Math.cos(ha) * 6.2;
  ctx.strokeStyle = rgb(st.skin, base * 0.7);
  ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + Math.sin(ha) * 2.6, ny - Math.cos(ha) * 2.6); ctx.stroke();
  ctx.save();
  ctx.translate(hcx, hcy);
  ctx.rotate(ha);
  ctx.fillStyle = rgb(st.skin, base * 0.82);
  ctx.beginPath();
  ctx.ellipse(0.3, 0, 4.1, 4.7, 0, 0, TAU);
  ctx.fill();
  // nose + jaw bump on the face side
  ctx.beginPath(); ctx.moveTo(3.9, -1.2); ctx.lineTo(5.4, 0.8); ctx.lineTo(3.8, 1.4); ctx.fill();
  // the face catches the light when it turns up toward the sky: pale skin, dark eye sockets
  const face = clamp(o.face || 0, 0, 1);
  if (face > 0.05) {
    ctx.fillStyle = rgb(st.skin, 0.9 + L * 0.5, face * 0.85);
    ctx.beginPath(); ctx.ellipse(2.3, 0.2, 2.2, 4.1, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = `rgba(4,4,6,${0.9 * face})`;
    ctx.beginPath(); ctx.ellipse(2.6, -1.1, 0.9, 0.75, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2.9, 2.6, 0.9, 0.45, 0, 0, TAU); ctx.fill(); // mouth open
  }
  // hair / helmet / cap / hood
  if (st.head === "helmet") {
    ctx.fillStyle = rgb(st.helm, base);
    ctx.beginPath(); ctx.ellipse(0, -1.6, 5.8, 4.6, 0, Math.PI, TAU); ctx.fill();
    ctx.fillRect(-6.4, -1.9, 12.6, 1.5);
    ctx.strokeStyle = rgb(st.helm, rimK * 1.3, 0.6);
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, -1.6, 5.8, 4.6, 0, rimS > 0 ? -Math.PI / 2.2 : Math.PI, rimS > 0 ? 0 : -Math.PI / 1.8); ctx.stroke();
  } else if (st.head === "cap") {
    ctx.fillStyle = rgb(st.top, base * 0.8);
    ctx.beginPath(); ctx.ellipse(-0.2, -2.4, 4.6, 3.2, 0, Math.PI, TAU); ctx.fill();
    ctx.fillRect(1.5, -2.8, 5.4, 1.3); // peak
  } else if (st.head === "hood") {
    ctx.fillStyle = rgb(st.top, base * 0.85);
    ctx.beginPath(); ctx.arc(-0.6, -0.4, 5.6, Math.PI * 0.45, Math.PI * 1.95); ctx.fill();
  } else {
    ctx.fillStyle = rgb(st.hair, 1);
    ctx.beginPath(); ctx.ellipse(-0.8, -1.6, 4.4, 3.6, -0.25, Math.PI * 0.85, Math.PI * 2.05); ctx.fill();
  }
  // ear
  ctx.fillStyle = rgb(st.skin, base * 0.6);
  ctx.beginPath(); ctx.ellipse(-0.6, 0.6, 0.9, 1.3, 0, 0, TAU); ctx.fill();
  ctx.restore();
  out.head = { x: hcx * sc, y: hcy * sc };
  // near arm last, over the body
  arm(o.arms[1], true, 1);
  if (st.torch && out.hand) {
    ctx.fillStyle = "#121314";
    ctx.save(); ctx.translate(out.hand.x / sc, out.hand.y / sc); ctx.rotate(-0.25); ctx.fillRect(-0.5, -1.2, 6, 2.4); ctx.restore();
  }
  ctx.restore();
  return out;
}

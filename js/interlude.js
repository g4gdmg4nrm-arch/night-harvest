// v19: short silent between-level scenes (5-10 s) after levels 1-9. Tap / key skips.
// Craft rises off -> an army truck convoy crosses the dark road -> the next place fades in.
import { audio } from "./audio.js?v=28";
import { LEVELS } from "./config.js?v=28";

const DUR = { 1: 8, 2: 7, 3: 7, 4: 7, 5: 8, 6: 7, 7: 8, 8: 8, 9: 9 }; // seconds, matching clipAfterLn (ALL-LEVELS-SOUND.md)

export function playInterlude(fromLevel, done) {
  const next = LEVELS.find((l) => l.id === fromLevel + 1);
  const D = DUR[fromLevel];
  if (!D || !next) return done();
  const cv = document.createElement("canvas");
  cv.id = "interlude";
  cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:50;background:#02040a;touch-action:none";
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  const dpr = Math.min(3, window.devicePixelRatio || 1); // v24: full phone sharpness
  let W = 0, H = 0;
  const size = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  window.addEventListener("resize", size);
  let seed = fromLevel * 977;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 70 }, () => [rnd(), rnd() * 0.7, rnd() * 1.2 + 0.3]);
  try { audio.setMusic(null); audio.fx("clipAfterL" + fromLevel, { gain: 0.9 }); } catch { /* audio off */ }
  const t0 = performance.now();
  let finished = false, raf = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", size);
    ["pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, skip, true));
    cv.remove();
    done();
  };
  const skip = (e) => { if (performance.now() - t0 > 250) { e.stopPropagation(); e.preventDefault(); finish(); } };
  ["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, skip, true));
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const frame = () => {
    const t = (performance.now() - t0) / 1000, p = t / D;
    if (p >= 1) return finish();
    const hz = H * 0.72;
    ctx.fillStyle = "#02040a"; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, "#03060f"); g.addColorStop(1, "#0b1424");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
    for (const [x, y, r] of stars) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + x * 40); ctx.fillStyle = "#cfd8ff"; ctx.fillRect(x * W, y * H, r, r); }
    ctx.globalAlpha = 1;
    // ground + hills
    ctx.fillStyle = "#05070b";
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, hz - 18 * Math.sin(x * 0.006 + fromLevel) - 10 * Math.sin(x * 0.017));
    ctx.lineTo(W, H); ctx.fill();
    // phase 1: the craft rises off (0 - 0.4)
    const a1 = 1 - sm(0.32, 0.42, p);
    if (a1 > 0) {
      const k = sm(0, 0.4, p), cx = W * (0.45 + 0.1 * k), cy = hz - 30 - k * hz * 0.9, s = Math.max(6, Math.min(W, H) * 0.06 * (1 - 0.6 * k));
      ctx.globalAlpha = a1 * 0.25 * (1 - k);
      const bg = ctx.createRadialGradient(cx, cy + s, 0, cx, cy + s, s * 4); bg.addColorStop(0, "#9fb4ff"); bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg; ctx.fillRect(cx - s * 4, cy - s * 3, s * 8, s * 8);
      ctx.globalAlpha = a1;
      // v27: polished chrome (night sky on top, sharp bright horizon, dark ground below, moon glint)
      const ch = ctx.createLinearGradient(0, cy - s * 0.6, 0, cy + s * 0.32);
      ch.addColorStop(0, "#2a3140"); ch.addColorStop(0.45, "#6d7e96"); ch.addColorStop(0.5, "#0d0f12"); ch.addColorStop(1, "#050607");
      ctx.fillStyle = ch;
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.6, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.12, s * 0.6, s * 0.34, 0, Math.PI, 0); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(220,230,250,0.55)";
      ctx.beginPath(); ctx.ellipse(cx - s * 0.25, cy - s * 0.3, s * 0.18, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(170,185,210,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.58, s * 0.06, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#6f86c8"; ctx.globalAlpha = a1 * (0.4 + 0.3 * Math.sin(t * 9));
      for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * s * 0.55 - 1, cy - 1, 2, 2);
    }
    // phase 2: army truck convoy along the road (0.3 - 0.75)
    const a2 = sm(0.3, 0.4, p) * (1 - sm(0.68, 0.78, p));
    if (a2 > 0) {
      ctx.globalAlpha = a2;
      const ry = hz + (H - hz) * 0.35;
      ctx.fillStyle = "#0a0c10"; ctx.fillRect(0, ry, W, 10);
      const k = (p - 0.3) / 0.48, tw = Math.max(40, W * 0.07);
      for (let i = 0; i < 4; i++) {
        const x = W * 1.1 - k * W * 1.5 + i * tw * 1.6;
        ctx.fillStyle = "#151a14";
        ctx.fillRect(x, ry - tw * 0.42, tw * 0.75, tw * 0.42);           // canvas back
        ctx.fillRect(x - tw * 0.3, ry - tw * 0.3, tw * 0.3, tw * 0.3);   // cab
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, ry + 2, tw * 0.09, 0, 7); ctx.arc(x + tw * 0.55, ry + 2, tw * 0.09, 0, 7); ctx.fill();
        const hl = ctx.createLinearGradient(x - tw * 0.3, 0, x - tw * 1.8, 0);
        hl.addColorStop(0, "rgba(255,236,180,0.45)"); hl.addColorStop(1, "rgba(255,236,180,0)");
        ctx.fillStyle = hl; ctx.beginPath(); ctx.moveTo(x - tw * 0.3, ry - tw * 0.12); ctx.lineTo(x - tw * 1.8, ry - tw * 0.3); ctx.lineTo(x - tw * 1.8, ry + tw * 0.08); ctx.fill();
      }
    }
    // phase 3: the next place fades in (0.65 - 1)
    const a3 = sm(0.65, 0.8, p) * (1 - sm(0.94, 1, p));
    if (a3 > 0) {
      ctx.globalAlpha = a3; ctx.textAlign = "center"; ctx.fillStyle = "#dfe6ff";
      const f = Math.max(18, Math.min(W, H) * 0.08);
      ctx.font = `600 ${f * 0.45}px system-ui, sans-serif`; ctx.fillText("LEVEL " + next.id, W / 2, H * 0.4 - f * 0.4);
      ctx.font = `600 ${f}px system-ui, sans-serif`; ctx.fillText(next.name, W / 2, H * 0.4 + f * 0.5);
    }
    ctx.globalAlpha = 0.5 * (1 - sm(0.9, 1, p)); ctx.textAlign = "right"; ctx.fillStyle = "#aab4d0";
    ctx.font = "13px system-ui, sans-serif"; ctx.fillText("tap to skip", W - 14, H - 14);
    // fade from / to black
    ctx.globalAlpha = Math.max(1 - sm(0, 0.08, p), sm(0.95, 1, p)); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  window.__nhInterlude = { skip: finish, D };
}

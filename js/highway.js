// Level 4: Highway Rest Stop (design/levels-10.md: "Lightning + first army truck patrol. Move between flashes;
// trucks mean the hunt has started"). Runs on the farm engine; this file only ADDS dressing, rules and sound.
import { VH, GROUND, roadY, TUNE } from "./config.js?v=30";
import { clamp, noise1, TAU } from "./util.js?v=30";
import { audio } from "./audio.js?v=30";

export const HWY = {
  firstFlash: 7, // seconds before the first flash (plenty of warning: the hush starts 2.5 s before)
  flashMin: 6.5,
  flashMax: 9.5,
  flashExposure: 1.4, // a flash while already being searched for and out of cover adds this much exposure
  truckFirst: 10,
  truckMin: 16,
  truckMax: 24,
  diner: { x: 2700, w: 420 },
  sign: { x: 560 },
  pumps: [2500, 2580],
};

/** Level start: stop the old music, warm only this level's pack. */
export function hwyStart(game) {
  audio.setMusic(null);
  game.warmOnce(4);
  game.nextFlash = HWY.firstFlash;
  game.carNext = HWY.truckFirst;
  game.hwyHorn = false;
}

/** Called each frame from Game.update (after updateLightning). */
export function hwyTick(game, dt, flashPeak) {
  const play = game.mode === "play" || game.mode === "fail";
  if (audio.ctx && audio.amb) {
    audio.bed("l4HighwayAmb", play ? 0.6 : 0, audio.amb);
    audio.bed("l4HighwayMusic", play ? (game.phase === "search" ? 0.35 : 0.7) : 0, audio.music);
  }
  if (game.mode !== "play") return;
  if (game.nextFlash > HWY.flashMax + 1) game.nextFlash = HWY.flashMin + Math.random() * (HWY.flashMax - HWY.flashMin);
  const c = game.creature;
  if (flashPeak > 0.55 && !game.flashCaught && game.occ < 0.3) {
    const exposedLow = c.y > TUNE.dangerHighY || c.feedAmt > 0.25;
    if (game.phase !== "search" && exposedLow) {
      game.flashCaught = true;
      audio.fx("l4StingLightningReveal", { gain: 1 });
      game.stormCatch("lightning");
      game.onEvent("hwy-flash-caught");
    } else if (game.phase === "search" && c.y > TUNE.dangerHighY) {
      game.flashCaught = true;
      game.exposure += HWY.flashExposure;
    }
  }
  if (game.car.scared && !game.hwyHorn) {
    game.hwyHorn = true;
    audio.fx("l4StingTruckHorn", { gain: 1, pan: game.panOf(game.car.x) });
  }
  if (!game.car.active) game.hwyHorn = false;
}

let neon = 1;
/** Rest-stop dressing in the farm plane (world transform already set by the caller). Few warm lights only. */
export function hwyDraw(ctx, s, camX, VW, t, flash, powerOut) {
  const out = powerOut > 0;
  // neon flicker: mostly steady, the odd stutter
  neon = noise1(t * 3.1) > 0.82 ? 0.25 : Math.random() < 0.01 ? 0.4 : 1;
  const D = HWY.diner;
  if (D.x + D.w > camX - 100 && D.x < camX + VW + 100) {
    const y0 = GROUND;
    ctx.fillStyle = "#07090c";
    ctx.fillRect(D.x, y0 - 92, D.w, 92); // low diner block
    ctx.fillRect(D.x - 20, y0 - 98, D.w + 40, 8); // roof lip
    ctx.fillRect(D.x + D.w * 0.62, y0 - 168, 10, 76); // sign pole
    // one long lit window, warm
    if (!out) {
      ctx.fillStyle = `rgba(214,150,78,${0.55 + 0.1 * Math.sin(t * 0.7)})`;
      ctx.fillRect(D.x + 30, y0 - 62, D.w * 0.45, 26);
      ctx.fillStyle = "rgba(10,10,12,0.85)";
      for (let i = 1; i < 5; i++) ctx.fillRect(D.x + 30 + (D.w * 0.45 * i) / 5, y0 - 62, 3, 26);
      // neon DINER sign
      const a = neon;
      const g = ctx.createRadialGradient(D.x + D.w * 0.62 + 5, y0 - 182, 0, D.x + D.w * 0.62 + 5, y0 - 182, 150);
      g.addColorStop(0, `rgba(230,70,50,${0.32 * a})`);
      g.addColorStop(1, "rgba(230,70,50,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.fillRect(D.x + D.w * 0.62 - 150, y0 - 332, 300, 300);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.fillStyle = "#0a0b0e";
    ctx.fillRect(D.x + D.w * 0.62 - 60, y0 - 200, 130, 34);
    ctx.font = "bold 24px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = out ? "#2a1a18" : `rgba(255,${90 + 40 * neon},70,${0.4 + 0.6 * neon})`;
    ctx.fillText("DINER", D.x + D.w * 0.62 + 5, y0 - 175);
    // fuel canopy + pumps with one sodium lamp
    const p0 = HWY.pumps[0] - 50, p1 = HWY.pumps[1] + 50;
    ctx.fillStyle = "#06080a";
    ctx.fillRect(p0, y0 - 120, p1 - p0, 12);
    ctx.fillRect(p0 + 6, y0 - 110, 6, 110);
    ctx.fillRect(p1 - 12, y0 - 110, 6, 110);
    for (const px of HWY.pumps) ctx.fillRect(px - 9, y0 - 44, 18, 44);
    if (!out) {
      const cx = (p0 + p1) / 2;
      const g2 = ctx.createRadialGradient(cx, y0 - 104, 0, cx, y0 - 60, 170);
      g2.addColorStop(0, "rgba(230,170,90,0.28)");
      g2.addColorStop(1, "rgba(230,170,90,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g2;
      ctx.fillRect(cx - 170, y0 - 230, 340, 240);
      ctx.globalCompositeOperation = "source-over";
    }
  }
  // the big green highway sign on two posts, dark until lightning catches it
  const S = HWY.sign;
  if (S.x + 200 > camX && S.x - 200 < camX + VW) {
    ctx.fillStyle = "#06080a";
    ctx.fillRect(S.x - 110, GROUND - 150, 6, 150);
    ctx.fillRect(S.x + 104, GROUND - 150, 6, 150);
    const lit = clamp(0.18 + flash * 1.4, 0, 1);
    ctx.fillStyle = `rgb(${10 + 20 * lit | 0},${30 + 70 * lit | 0},${22 + 40 * lit | 0})`;
    ctx.fillRect(S.x - 130, GROUND - 230, 260, 84);
    ctx.fillStyle = `rgba(220,230,220,${0.25 + 0.7 * lit})`;
    ctx.font = "bold 22px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("REST AREA", S.x, GROUND - 196);
    ctx.font = "15px Helvetica, Arial, sans-serif";
    ctx.fillText("NEXT RIGHT  ·  1 MI", S.x, GROUND - 168);
  }
  ctx.textAlign = "left";
}

/** Army truck: a tarp-covered cargo box over the patrol vehicle (the car actor drives left to right). */
export function hwyTruck(ctx, car) {
  if (!car.active) return;
  const x = car.x;
  const y = roadY(x) - 8;
  ctx.fillStyle = "#121611";
  ctx.beginPath();
  ctx.moveTo(x - 92, y - 6);
  ctx.lineTo(x - 92, y - 52);
  ctx.quadraticCurveTo(x - 50, y - 64, x - 6, y - 52);
  ctx.lineTo(x - 6, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0b0d0a";
  for (let i = 0; i < 3; i++) ctx.fillRect(x - 84 + i * 26, y - 54, 3, 48);
  // amber roof marker
  ctx.fillStyle = "rgba(240,160,60,0.8)";
  ctx.fillRect(x + 2, y - 46, 5, 3);
}

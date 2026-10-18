// One shared wind field drives grass, trees, dust, fog and the wind sound.
// Positive values lean things to the right (the wind blows left to right).
import { noise1, noise2, clamp } from "./util.js?v=25";

export class Wind {
  constructor() {
    this.t = 0;
    this.gust = 0; // 0..1, slow overall gustiness used by audio
    this.calm = 0; // 0..1, the creature "stills" the air when it feeds
    this.storm = 0; // 0..1+, Storm Farm: everything leans harder
    this.hush = 0; // 0..1, the dead-still moment before a gust front
  }
  update(dt) {
    this.t += dt;
    const g = 0.5 + 0.5 * noise1(this.t * 0.11) + 0.35 * Math.max(0, noise1(this.t * 0.37 + 7));
    this.gust = clamp(g + this.storm * 0.35, 0, 1) * (1 - this.hush);
  }
  /**
   * Wind strength at world x for a layer. `lag` delays the response (distant things react later),
   * `scale` stretches the spatial waves. Returns roughly -0.3..1.4.
   */
  sample(x, lag = 0, scale = 1) {
    const t = this.t - lag;
    // travelling gust fronts of different sizes -> uneven waves rather than one sine
    const a = Math.sin(x * 0.0042 * scale - t * 1.9) * 0.32;
    const b = Math.sin(x * 0.011 * scale - t * 3.3 + 1.7) * 0.16;
    const c = noise2(x * 0.0021 * scale - t * 0.55, t * 0.13) * 0.55;
    const d = noise2(x * 0.009 * scale - t * 1.4, 3.1) * 0.22;
    const base = 0.35 + this.gust * 0.45;
    const v = base + (a + b + c + d) * (0.55 + this.gust * 0.6);
    return v * (1 + this.storm * 0.9) * (1 - this.calm * 0.75) * (1 - this.hush * 0.92);
  }
}

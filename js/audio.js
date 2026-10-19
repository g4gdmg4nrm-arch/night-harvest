// Night Harvest sound.
/** Bump with the game cache version so phones refetch sharpened MP3s. */
const AUDIO_VER = "20";

// Music and effects load by name from audio/<name>.mp3 and audio/sfx/<name>.mp3 when those files
// exist. Until then every sound has a simple Web Audio placeholder (clearly temporary, not final).
// Buses: music / ambience (muffled inside cloud) / effects -> glue -> limiter -> master.
// iPhone: unlock on the first tap, play through the silent switch (same trick as Fold Fleet:
// navigator.audioSession = "playback" plus a looping silent <audio> element), pause in background.

export const MUSIC = ["calm", "dread", "uforise", "chase", "taken", "escape", "hush"];
// Loops that run continuously once started (crossfaded, never restarted from 0).
const MUSIC_LOOPS = ["calm", "dread", "chase"];
// Music one-shots actually used by the game (uforise is no longer used as a shock).
const MUSIC_SHOTS = ["taken", "escape", "hush"];
// Mix (v2, from Gamer Girl's in-game check): about 6 dB more bus headroom than v1.
const BUS = { music: 0.35, amb: 0.45, sfx: 0.45 };
const DUCK_FLOOR = 0.0316; // -30 dB pre-shock dip
const SHOCK_COOLDOWN = 12; // seconds between shock stings ("Seen." is the only exception)
// Memory (older iPhones/iPads): these files are folded to mono after decoding. They're beds or sounds the game
// pans itself, so nothing audible is lost and their decoded size halves.
const MONO = /^(l\d+_|clip_after_|ending_|farm_wind_heavy_loop|grass_rustle_loop|thunder_far_|farm_door_creak|base_ambience_loop|searchlight_hum_loop|truck_idle_loop|energy_warn_loop|base_alarm|truck_pass|storm_wind_loop|rain_soft_loop|storm_calm_hole|wind_loop|insects_loop|creature_breath_loop|hum_close_loop|creature_feed_loop|heartbeat_loop|car_engine_loop|footstep_|gasp_|door_|dog_|cow_|car_brakes|scream_distant|power_flicker|hide_rustle|crickets_stop)/;
// Decoded up front after the first tap: only what the first moments of the farm scene need (first variant of each).
const UPFRONT = ["calm", "sfx/wind_loop", "sfx/insects_loop", "sfx/creature_breath_loop", "sfx/hum_close_loop", "sfx/creature_feed_loop",
  "hush", "sfx/hide_rustle", "sfx/creature_move_1", "sfx/cloud_burst", "sfx/footstep_dirt_1", "sfx/footstep_wood_1", "sfx/door_creak"];
// Then, in the background one at a time, what the first encounter will need soon.
const SOON = ["sfx/crickets_stop", "sfx/power_flicker", "sfx/gasp_1", "sfx/sting_2", "sfx/door_slam", "sfx/cow_low_1", "sfx/dog_bark_1"];
const MEM_BUDGET = 60e6; // bytes of decoded one-shots kept around before unused ones are dropped
// Each game sound -> the file names that can play it (first found wins; several = random variation).
// These match Gamer Girl's pack in audio/sfx/; anything missing falls back to a placeholder.
export const SFX_FILES = {
  wind: ["wind_loop", "wind"],
  insects: ["insects_loop", "insects"],
  feed: ["creature_feed_loop", "feed"],
  breath: ["creature_breath_loop"],
  hum: ["hum_close_loop"],
  burst: ["cloud_burst", "burst"],
  pass: ["ufo_pass_overhead"],
  move: ["creature_move_1", "creature_move_2", "creature_move_3"],
  rustle: ["hide_rustle"],
  cricketsStop: ["crickets_stop"],
  flicker: ["power_flicker"],
  glimpse: ["sting_1", "sting_2", "sting_3"],
  door: ["door_creak", "door"],
  step: ["footstep_dirt_1", "footstep_dirt_2", "footstep_dirt_3", "step"],
  stepWood: ["footstep_wood_1", "footstep_wood_2", "footstep_wood_3"],
  dog: ["dog_bark_1", "dog_bark_2", "dog_bark_3"],
  dogWhine: ["dog_whine"],
  thunder: ["thunder_1", "thunder_2"],
  // Storm Farm pack (STORM-FARM-PASS.md): only decoded on level 2
  stormWind: ["storm_wind_loop"],
  // Quiet Farm storm pass (QUIET-FARM-STORM-PASS.md)
  farmWindHeavy: ["farm_wind_heavy_loop"], // bed, seamless 20 s
  grassRustle: ["grass_rustle_loop"], // bed, seamless 12 s
  thunderFar: ["thunder_far_1", "thunder_far_2", "thunder_far_3"], // one-shot, random variant
  farmDoorCreak: ["farm_door_creak"], // one-shot
  stormGust: ["storm_gust"],
  stormHole: ["storm_calm_hole"],
  thunderClose: ["thunder_close", "thunder_1"],
  rainSoft: ["rain_soft_loop"],
  scream: ["scream_terror_1", "scream_terror_2", "scream", "scream_distant"],
  screamRun: ["scream_run"],
  gasp: ["gasp_1", "gasp_2"],
  // Gamer Girl menu pack (wired when files land under audio/sfx/)
  menuPiano: ["menu_piano"],
  menuOpen: ["menu_open"],
  menuSting: ["menu_sting_1", "menu_sting_2"],
  menuBurst: ["menu_sting_1", "menu_sting_2"], // alias
  heartbeat: ["heartbeat_loop"],
  blindsSnap: ["blinds_snap", "blinds_shut", "hide_rustle"],
  slam: ["door_slam", "slam"],
  brake: ["car_brakes"],
  car: ["car_engine_loop"],
  carPass: ["car_engine_pass"],
  cow: ["cow_low_1", "cow_low_2"],
  cowDistress: ["cow_distress"],
  // Area 51 Escape pack (AREA51-PASS.md): only decoded on level 1 (warmA51)
  baseAmbience: ["base_ambience_loop"],
  baseAlarm: ["base_alarm"],
  searchlightHum: ["searchlight_hum_loop"],
  searchlightPass: ["searchlight_pass"],
  hangarDoor: ["hangar_door"],
  truckIdle: ["truck_idle_loop"],
  truckPass: ["truck_pass"],
  firstFeed: ["first_feed_sting"],
  captureSting: ["capture_sting"],
  escapeSpace: ["escape_space"],
  energyWarn: ["energy_warn_loop"],
  empBlast: ["emp_blast"], // EMP strike: electric thump + power-down whine (~1.5 s)
  empReady: ["emp_ready"], // EMP recharged: soft charge-up ping
  // All-levels pass (ALL-LEVELS-SOUND.md): beds/music via audio.bed(name, 0..1, bus), the rest via audio.fx(name)
  l4HighwayAmb: ["l4_highway_amb_loop"],
  l5TownAmb: ["l5_town_amb_loop"],
  l6RodeoAmb: ["l6_rodeo_amb_loop"],
  l7SuburbAmb: ["l7_suburb_amb_loop"],
  l8PowerAmb: ["l8_power_amb_loop"],
  l9ConvoyAmb: ["l9_convoy_amb_loop"],
  l10CoastAmb: ["l10_coast_amb_loop"],
  l4HighwayMusic: ["l4_highway_music_loop"],
  l5TownMusic: ["l5_town_music_loop"],
  l6RodeoMusic: ["l6_rodeo_music_loop"],
  l7SuburbMusic: ["l7_suburb_music_loop"],
  l8PowerMusic: ["l8_power_music_loop"],
  l9ConvoyMusic: ["l9_convoy_music_loop"],
  l10CoastMusic: ["l10_coast_music_loop"],
  l1StingSiren: ["l1_sting_siren"],
  l1StingLockon: ["l1_sting_lockon"],
  l2StingPorchLight: ["l2_sting_porch_light"],
  l2StingDogLunge: ["l2_sting_dog_lunge"],
  l3StingCoverTorn: ["l3_sting_cover_torn"],
  l3StingFlash: ["l3_sting_flash"],
  l4StingLightningReveal: ["l4_sting_lightning_reveal"],
  l4StingTruckHorn: ["l4_sting_truck_horn"],
  l5StingWindowsDark: ["l5_sting_windows_dark"],
  l5StingDogsWake: ["l5_sting_dogs_wake"],
  l6StingBaitTrap: ["l6_sting_bait_trap"],
  l6StingFloodlights: ["l6_sting_floodlights"],
  l7StingPhoneGlow: ["l7_sting_phone_glow"],
  l7StingWindowFace: ["l7_sting_window_face"],
  l8StingArcFlash: ["l8_sting_arc_flash"],
  l8StingRadioScream: ["l8_sting_radio_scream"],
  l9StingSpotted: ["l9_sting_spotted"],
  l9StingConvoyTurns: ["l9_sting_convoy_turns"],
  l10StingSirensShore: ["l10_sting_sirens_shore"],
  l10StingHeliOver: ["l10_sting_heli_over"],
  clipAfterL1: ["clip_after_l1"],
  clipAfterL2: ["clip_after_l2"],
  clipAfterL3: ["clip_after_l3"],
  clipAfterL4: ["clip_after_l4"],
  clipAfterL5: ["clip_after_l5"],
  clipAfterL6: ["clip_after_l6"],
  clipAfterL7: ["clip_after_l7"],
  clipAfterL8: ["clip_after_l8"],
  clipAfterL9: ["clip_after_l9"],
  endingEscapeSpace: ["ending_escape_space"],
  endingCaptureSlam: ["ending_capture_slam"],
  // shocks (each has a _soft version for the "softer shock sounds" setting)
  shockSpotted: ["sting_2"],
  shockFail: ["sting_3"],
  shockPorch: ["sting_1"],
  // v28: UFO boost whoosh (a51.js / game.js call fx("ufo_boost")); listed here so discover() keeps it
  ufo_boost: ["ufo_boost"],
};

// v28 voice lines (Gamer Girl): people who spot the craft call audio.say("spot-<kind>").
// Real CC0 recordings + ElevenLabs v3 takes, all mono MP3 in audio/sfx/voice_*.mp3 (see design/VOICES-*.md).
const RADIO = ["voice_radio_what_was_that", "voice_radio_do_you_hear_that", "voice_radio_contact_north", "voice_radio_confirm_sighted",
  "voice_radio_target_located", "voice_radio_sighting_my_location", "voice_radio_take_cover", "voice_radio_roger_that"];
export const VOICE_POOLS = {
  farmer: ["voice_farmer_what_is_that", "voice_farmer_whos_that", "voice_farmer_what_was_that", "voice_farmer_wait", "voice_farmer_something_field"],
  civ: ["voice_woman_go_inside", "voice_woman_get_inside", "voice_woman_where_are_you", "voice_man_help", "voice_scream_man", "voice_scream_woman"],
  soldier: RADIO,
  guard: ["voice_radio_what_was_that", "voice_radio_do_you_hear_that", "voice_radio_contact_north", "voice_radio_confirm_sighted",
    "voice_radio_target_located", "voice_radio_roger_that"],
  sci: ["voice_radio_what_was_that", "voice_radio_do_you_hear_that", "voice_radio_confirm_sighted", "voice_man_help"],
};
// Which kinds of people each level has (so warmLevel only decodes those voices; anything else loads on first use).
const LEVEL_VOICES = { 1: ["sci", "guard", "soldier"], 2: ["farmer"], 3: ["farmer"], 4: ["farmer", "civ"], 5: ["civ"], 6: ["civ"],
  7: ["civ"], 8: ["soldier"], 9: ["soldier"], 10: ["soldier", "civ"] };
const VOICE_GAIN = 0.8; // clips are mastered to about -18 LUFS; this sits them just under the stings
const VOICE_MIN_GAP = 1.0; // seconds of silence between two lines, on top of people.js's 3.5 s
Object.values(VOICE_POOLS).flat().forEach((n) => (SFX_FILES[n] = SFX_FILES[n] || [n]));

export const LEVEL_SOUNDS = {
 "1": [
  "l1_sting_siren",
  "l1_sting_lockon",
  "clip_after_l1",
  "base_ambience_loop",
  "searchlight_hum_loop"
 ],
 "2": [
  "l2_sting_porch_light",
  "l2_sting_dog_lunge",
  "clip_after_l2",
  "farm_wind_heavy_loop",
  "grass_rustle_loop",
  "farm_door_creak",
  "thunder_far_1"
 ],
 "3": [
  "l3_sting_cover_torn",
  "l3_sting_flash",
  "clip_after_l3",
  "storm_wind_loop",
  "storm_gust",
  "thunder_close"
 ],
 "4": [
  "l4_highway_amb_loop",
  "l4_highway_music_loop",
  "l4_sting_lightning_reveal",
  "l4_sting_truck_horn",
  "clip_after_l4"
 ],
 "5": [
  "l5_town_amb_loop",
  "l5_town_music_loop",
  "l5_sting_windows_dark",
  "l5_sting_dogs_wake",
  "clip_after_l5"
 ],
 "6": [
  "l6_rodeo_amb_loop",
  "l6_rodeo_music_loop",
  "l6_sting_bait_trap",
  "l6_sting_floodlights",
  "clip_after_l6"
 ],
 "7": [
  "l7_suburb_amb_loop",
  "l7_suburb_music_loop",
  "l7_sting_phone_glow",
  "l7_sting_window_face",
  "clip_after_l7"
 ],
 "8": [
  "l8_power_amb_loop",
  "l8_power_music_loop",
  "l8_sting_arc_flash",
  "l8_sting_radio_scream",
  "clip_after_l8"
 ],
 "9": [
  "l9_convoy_amb_loop",
  "l9_convoy_music_loop",
  "l9_sting_spotted",
  "l9_sting_convoy_turns",
  "clip_after_l9"
 ],
 "10": [
  "l10_coast_amb_loop",
  "l10_coast_music_loop",
  "l10_sting_sirens_shore",
  "l10_sting_heli_over",
  "ending_escape_space",
  "ending_capture_slam"
 ]
};

function ctor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}
function isIOS() {
  const ua = navigator.userAgent || "";
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
function silentWavUrl() {
  const rate = 8000;
  const n = rate;
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o, t) => {
    for (let i = 0; i < t.length; i++) bytes[o + i] = t.charCodeAt(i);
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + n, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, "data");
  dv.setUint32(40, n, true);
  for (let i = 44; i < bytes.length; i++) bytes[i] = 128;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

function noiseBuffer(ctx, seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  // fade the seam
  const f = Math.min(2000, len >> 3);
  for (let i = 0; i < f; i++) {
    const k = i / f;
    d[i] = d[i] * k + d[len - f + i] * (1 - k);
  }
  return b;
}
function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - p * 0.42);
      d[i] = lp * Math.pow(1 - p, decay);
    }
  }
  return b;
}

/** Scan the audio folder: a directory listing (test server) first, else audio/manifest.json. */
async function discover() {
  const found = { music: new Set(), sfx: new Set() };
  const flat = Object.values(SFX_FILES).flat();
  const allSfx = new Set([...flat, ...flat.map((n) => n + "_soft")]);
  const scan = async (url) => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("html")) return null;
      const html = await r.text();
      const names = [];
      html.replace(/href="([^"?#]+)\.mp3"/gi, (_, n) => names.push(decodeURIComponent(n)));
      return names;
    } catch {
      return null;
    }
  };
  found.loops = {};
  let man = null;
  try {
    const r = await fetch("audio/manifest.json?v=" + AUDIO_VER, { cache: "no-store" });
    if (r.ok) man = await r.json();
  } catch {
    /* no manifest */
  }
  if (man && man.loops) found.loops = man.loops;
  const m = man ? null : await scan("audio/"); // v19 QA: the manifest is enough; the listing 404s on Pages
  if (m) {
    m.forEach((n) => MUSIC.includes(n) && found.music.add(n));
    const s = await scan("audio/sfx/");
    if (s) s.forEach((n) => allSfx.has(n) && found.sfx.add(n));
  }
  // Always merge manifest so iPhone / no-listing hosts and any scan gaps still get every keyed file
  if (man) {
    (man.music || []).forEach((n) => MUSIC.includes(n) && found.music.add(n));
    (man.sfx || []).forEach((n) => allSfx.has(n) && found.sfx.add(n));
  }
  return found;
}

export class AudioDirector {
  constructor() {
    this.ctx = null;
    this.levels = { music: 0.8, amb: 0.8, sfx: 0.9 };
    this.reducedStings = false;
    this.files = { music: new Set(), sfx: new Set(), loops: {} };
    this.buffers = new Map();
    this.musicState = null;
    this.musicLoops = {}; // name -> {s, g} (kept running, crossfaded)
    this.lastSting = -99;
    this.lastShock = -99;
    this.lastHush = -99;
    this.shots = new Set(); // playing one-shots {s, g}, so they can be faded on reset
    this.loopInfo = {}; // buffer path -> how its loop points were set (debug/QA)
    this.hidden = false;
    this.paused = false;
    this.mem = new Map(); // path -> decoded bytes
    this.used = new Map(); // path -> last use (ctx time)
    this.decodedTotal = 0;
    this.memPeak = 0;
    this.ready = discover().then((f) => {
      this.files = f;
      this.report = `music files: ${[...f.music].join(", ") || "none"}; sfx files: ${[...f.sfx].join(", ") || "none"}`;
    });
  }

  // ---------------------------------------------------------------- unlock / iOS
  /** First user gesture: create/resume AudioContext. Returns a promise that resolves when ctx is running (iOS-safe). */
  async unlock() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback";
    } catch {
      /* not supported */
    }
    this.startKeepAlive();
    const C = ctor();
    if (!C) return false;
    if (!this.ctx) {
      try {
        this.ctx = new C({ latencyHint: "interactive" });
      } catch {
        try {
          this.ctx = new C();
        } catch {
          return false;
        }
      }
      this.build();
      this.watchState();
      this.preload();
      if (this.warmQ) {
        const q = [...this.warmQ];
        this.warmQ = null;
        this.ready.then(() => q.forEach((n) => this.warm(n)));
      }
    }
    if (!this.primed || this.ctx.state !== "running") {
      try {
        const s = this.ctx.createBufferSource();
        s.buffer = this.ctx.createBuffer(1, 1, 22050);
        s.connect(this.ctx.destination);
        s.start(0);
        this.primed = true;
      } catch {
        /* ignore */
      }
    }
    // iOS often stays "suspended" until resume() finishes — must await or fx() bails silently
    if (!this.hidden && this.ctx.state !== "running") {
      try {
        // v13: iOS can leave resume() pending forever while "interrupted"; never hang the caller on it
        await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 800))]);
      } catch {
        /* old WebKit */
      }
    }
    await this.ready;
    return !!(this.ctx && this.ctx.state === "running");
  }
  /** Ensure context exists and is running (for fx / stings / beds). */
  async ensureRunning() {
    if (!this.ctx || this.ctx.state !== "running") await this.unlock();
    if (!this.ctx) return false;
    if (this.ctx.state !== "running") {
      try {
        await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 800))]);
      } catch {
        return false;
      }
    }
    await this.ready;
    return this.ctx.state === "running";
  }
  startKeepAlive() {
    if (!isIOS() || this.hidden || typeof Audio === "undefined") return;
    try {
      if (!this.keepAlive) {
        const el = new Audio();
        el.src = silentWavUrl();
        el.loop = true;
        el.preload = "auto";
        el.setAttribute("playsinline", "");
        el.setAttribute("webkit-playsinline", "");
        el.setAttribute("x-webkit-airplay", "deny");
        el.disableRemotePlayback = true;
        el.addEventListener("playing", () => (this.kaPlaying = true));
        el.addEventListener("pause", () => (this.kaPlaying = false));
        this.keepAlive = el;
      }
      if (this.kaPlaying || this.kaPending) return;
      const p = this.keepAlive.play();
      if (p && p.then) {
        this.kaPending = true;
        p.then(
          () => ((this.kaPending = false), (this.kaPlaying = true)),
          () => (this.kaPending = false),
        );
      }
    } catch {
      /* ignore */
    }
  }
  /** iOS: recover from "interrupted" (a call, Siri, an alarm) without waiting for the next tap. */
  watchState() {
    const c = this.ctx;
    let tries = 0;
    const kick = () => {
      clearTimeout(this.kickTimer);
      if (!this.hidden && !this.paused && c.state !== "running" && c.state !== "closed") {
        try {
          c.resume().catch(() => undefined);
        } catch {
          /* old WebKit */
        }
        // iOS can stay "interrupted" for a while after a call or Siri: keep trying, gently
        if (tries++ < 20) this.kickTimer = setTimeout(kick, 1000);
      } else tries = 0;
    };
    try {
      c.addEventListener ? c.addEventListener("statechange", () => setTimeout(kick, 300)) : (c.onstatechange = () => setTimeout(kick, 300));
    } catch {
      /* ignore */
    }
    // v13: a fresh kick (tab back in view, phone unlocked) gets a full set of retries again
    this.kick = () => {
      tries = 0;
      kick();
    };
  }
  /**
   * Decode only what the first scene needs up front, then a short "soon" list in the background.
   * Everything else (variants, soft stings, chase, taken, escape, thunder...) decodes on first use or when warmed.
   */
  async preload() {
    await this.ready;
    const path = (k) => (k.startsWith("sfx/") ? (this.files.sfx.has(k.slice(4)) ? `audio/${k}.mp3` : null) : this.files.music.has(k) ? `audio/${k}.mp3` : null);
    const up = UPFRONT.map(path).filter(Boolean);
    for (const p of up) await this.buffer(p);
    this.preloaded = up.length;
    this.upfrontBytes = this.memNow();
    for (const k of SOON) {
      const p = path(k);
      if (p) await this.buffer(p);
    }
    if (this.reducedStings) this.buffer("audio/sfx/sting_2_soft.mp3");
    this.soonBytes = this.memNow();
  }
  /** Pause menu: suspend the context; resume when unpaused. */
  setPaused(p) {
    this.paused = p;
    if (!this.ctx) return;
    if (p) this.ctx.suspend().catch(() => undefined);
    else if (!this.hidden) this.ctx.resume().catch(() => undefined);
  }
  suspend() {
    this.hidden = true;
    try {
      this.keepAlive && this.keepAlive.pause();
    } catch {
      /* ignore */
    }
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => undefined);
  }
  resume() {
    this.hidden = false;
    if (this.ctx) {
      this.startKeepAlive();
      if (!this.paused && this.ctx.state !== "running") this.ctx.resume().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- graph
  build() {
    const c = this.ctx;
    const g = (v) => {
      const n = c.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g(0.9);
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 2.5;
    glue.knee.value = 10;
    glue.attack.value = 0.01;
    glue.release.value = 0.3;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.15;
    glue.connect(lim);
    lim.connect(this.master);
    this.master.connect(c.destination);
    this.music = g(this.levels.music * BUS.music);
    this.amb = g(this.levels.amb * BUS.amb);
    this.sfx = g(this.levels.sfx * BUS.sfx);
    // pre-shock ducks: music and ambience (wind, insects, car bed) fall to -30 dB before a shock
    this.musicDuck = g(1);
    this.ambDuck = g(1);
    this.muffle = c.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 16000;
    this.amb.connect(this.muffle);
    this.muffle.connect(this.ambDuck);
    this.ambDuck.connect(glue);
    this.music.connect(this.musicDuck);
    this.musicDuck.connect(glue);
    this.sfx.connect(glue);
    // stings bypass the duck so they hit out of the silence
    this.stingBus = g(1);
    this.stingBus.connect(this.music);
    this.stingDirect = g(this.levels.music * BUS.music);
    this.stingDirect.connect(glue);
    // meters (QA): RMS after each duck
    this.meters = {};
    for (const [k, node] of [["music", this.musicDuck], ["amb", this.ambDuck], ["out", lim]]) {
      const a = c.createAnalyser();
      a.fftSize = 2048;
      node.connect(a);
      this.meters[k] = a;
    }
    this.verb = c.createConvolver();
    this.verb.buffer = impulse(c, 2.6, 2.4);
    this.verbOut = g(0.5);
    this.verb.connect(this.verbOut);
    this.verbOut.connect(glue);
    this.noise = noiseBuffer(c, 3.3);
    this.brown = noiseBuffer(c, 4.1, true);
    this.startBeds();
    this.nextChirp = c.currentTime + 0.5;
    this.nextCrickets = [0, 0, 0, 0].map(() => c.currentTime + Math.random() * 2);
    if (this.pendingMusic !== undefined) this.setMusic(this.pendingMusic);
  }
  pan(v) {
    const c = this.ctx;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, v));
      return p;
    }
    return c.createGain();
  }
  /**
   * Exact loop points from audio/manifest.json "loops" (key "calm" or "sfx/wind_loop").
   * WebKit keeps the MP3's 1105-sample encoder delay, Chromium strips it: if the decoded buffer is longer
   * than the true length, loop from 1105/44100 s for exactly `seconds`; otherwise loop 0..seconds.
   */
  loopPoints(buf, key) {
    if (buf.__bed) return { start: 0, end: buf.duration };
    const info = key && this.files.loops && this.files.loops[key];
    if (!info || !info.seconds) return null;
    const secs = info.seconds;
    const delay = (info.mp3_encoder_delay_samples || 1105) / 44100;
    const start = buf.duration > secs + 0.5 / 44100 + 1e-4 ? delay : 0;
    if (start + secs > buf.duration + 1e-4) return null;
    return { start, end: start + secs };
  }
  loop(buf, dest, gain = 1, key = null) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const lp = this.loopPoints(buf, key);
    if (lp) {
      s.loopStart = lp.start;
      s.loopEnd = lp.end;
    } else {
      s.loopStart = 0;
      s.loopEnd = buf.duration;
    }
    if (key) this.loopInfo[key] = { decoded: +buf.duration.toFixed(5), loopStart: +s.loopStart.toFixed(5), loopEnd: +s.loopEnd.toFixed(5), exact: !!lp, src: buf.__src || "" };
    const gn = c.createGain();
    gn.gain.value = gain;
    s.connect(gn);
    gn.connect(dest);
    s.start(0, s.loopStart || 0);
    return { s, g: gn };
  }
  async buffer(path) {
    if (this.buffers.has(path)) {
      this.used.set(path, this.ctx ? this.ctx.currentTime : 0);
      return this.buffers.get(path);
    }
    this.used.set(path, this.ctx ? this.ctx.currentTime : 0);
    const name = path.replace(/^.*\//, "").replace(/\.(mp3|wav)$/, "");
    const p = fetch(path + (path.includes("?") ? "&" : "?") + "v=" + AUDIO_VER) // v13: versioned URL, so the phone may cache it (was no-store: re-downloaded every visit)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then(
        (ab) =>
          new Promise((res, rej) => {
            // callback form for older Safari
            this.ctx.decodeAudioData(ab, res, rej);
          }),
      )
      .then((b) => {
        if (!b) return b;
        const lkey = path.startsWith("audio/sfx/") ? "sfx/" + name : name;
        const li = this.files.loops && this.files.loops[lkey];
        if (/_loop$/.test(name) && li && path.endsWith(".mp3")) b = this.bedBuffer(b, li);
        else if (b.numberOfChannels > 1 && MONO.test(name)) b = this.toMono(b);
        b.__src = path;
        const bytes = b.length * b.numberOfChannels * 4;
        this.mem.set(path, bytes);
        this.memLog = this.memLog || {};
        this.memLog[path] = +(bytes / 1e6).toFixed(2);
        this.decodedTotal += b.duration;
        this.memPeak = Math.max(this.memPeak, this.memNow());
        this.trim();
        return b;
      })
      .catch(() => {
        // v13: don't remember a failure forever (a decode that failed while iOS was interrupted, or a
        // network blip on the tunnel, used to leave that sound silent for the whole session)
        if (this.buffers.get(path) === p) this.buffers.delete(path);
        return null;
      });
    this.buffers.set(path, p);
    return p;
  }
  /**
   * Ambience/creature/engine loop beds: cut to the exact loop (skipping WebKit's kept encoder delay),
   * fold to mono and halve the sample rate. Quarter of the decoded size; the loop is then simply 0..end.
   */
  bedBuffer(b, info) {
    const sr = b.sampleRate;
    const delay = b.duration > info.seconds + 0.5 / 44100 + 1e-4 ? (info.mp3_encoder_delay_samples || 1105) / 44100 : 0;
    const outRate = sr / 2;
    const n = Math.round(info.seconds * outRate);
    if (delay * sr + 2 * n > b.length + 2) return this.toMono(b);
    let m;
    try {
      m = this.ctx.createBuffer(1, n, outRate);
    } catch {
      return this.toMono(b); // very old engines may refuse low rates
    }
    const o = m.getChannelData(0);
    const L = b.getChannelData(0);
    const R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
    const off = delay * sr;
    const len = b.length;
    for (let i = 0; i < n; i++) {
      // 3-tap average around each kept sample (gentle anti-alias), linear interpolation for the fractional offset
      let acc = 0;
      for (let k = -1; k <= 1; k++) {
        let x = off + 2 * i + k;
        if (x < off) x += 2 * n; // wrap inside the loop so the seam stays continuous
        if (x >= off + 2 * n) x -= 2 * n;
        const j = Math.min(Math.floor(x), len - 1); // v16: clamp, an index past the end read undefined -> NaN (killed the whole mix)
        const f = x - Math.floor(x);
        const j1 = Math.min(j + 1, len - 1);
        acc += (L[j] + R[j]) * (1 - f) + (L[j1] + R[j1]) * f;
      }
      o[i] = acc / 6;
    }
    m.__bed = true;
    return m;
  }
  toMono(b) {
    const m = this.ctx.createBuffer(1, b.length, b.sampleRate);
    const o = m.getChannelData(0);
    const L = b.getChannelData(0);
    const R = b.getChannelData(1);
    for (let i = 0; i < o.length; i++) o[i] = (L[i] + R[i]) * 0.5;
    return m;
  }
  /** Decoded audio currently cached, in bytes. */
  memNow() {
    let t = 0;
    for (const v of this.mem.values()) t += v;
    return t;
  }
  /** Drop cached one-shots that haven't been used for a while once over budget (loops in use are never dropped). */
  trim() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const keep = new Set(Object.values(this.beds || {}).map((b) => b.l && b.l.s.buffer && b.l.s.buffer.__src));
    for (const l of Object.values(this.musicLoops)) if (l) keep.add(l.s.buffer && l.s.buffer.__src);
    const playing = new Set([...(this.alive || [])].map((h) => h.name));
    let total = this.memNow();
    const cands = [...this.mem.keys()]
      .filter((p) => !keep.has(p) && !playing.has(p) && !/(\/(calm|dread|chase)|_loop)\.mp3$/.test(p))
      .sort((a, b) => (this.used.get(a) || 0) - (this.used.get(b) || 0));
    for (const p of cands) {
      if (total <= MEM_BUDGET) break;
      if (now - (this.used.get(p) || 0) < 30) continue;
      total -= this.mem.get(p);
      this.mem.delete(p);
      this.buffers.delete(p);
      this.evicted = (this.evicted || 0) + 1;
    }
  }
  /** Music loops that have been silent a while are stopped and their buffers released. */
  releaseIdleMusic() {
    const now = this.ctx.currentTime;
    for (const [k, l] of Object.entries(this.musicLoops)) {
      if (!l || k === this.musicState) continue;
      if (l.g.gain.value > 0.002) {
        l.quietSince = null;
        continue;
      }
      l.quietSince = l.quietSince || now;
      if (now - l.quietSince > 25) {
        try {
          l.s.stop();
        } catch {
          /* gone */
        }
        this.musicLoops[k] = null;
        const path = l.s.buffer && l.s.buffer.__src;
        if (path) {
          this.mem.delete(path);
          this.buffers.delete(path);
        }
        this.dlog("released:" + k);
      }
    }
  }
  /** Start decoding something soon needed (no-op if cached). */
  warm(name) {
    // v13: asked before the first tap (no context yet)? remember it and decode right after unlock
    if (!this.ctx) return void (this.warmQ = this.warmQ || new Set()).add(name);
    if (this.files.music.has(name)) this.buffer(`audio/${name}.mp3`);
    else if (this.files.sfx.has(name)) this.buffer(`audio/sfx/${name}.mp3`);
  }

  /** A looping file: the MP3 with exact loop points, or the gapless WAV in wav_loops/ if those are missing. */
  async loopBuffer(key) {
    const base = key.replace(/^sfx\//, "");
    const mp3 = await this.buffer(`audio/${key}.mp3`);
    if (mp3 && (this.loopPoints(mp3, key) || this.forceWav === false)) return mp3;
    const wav = this.forceWav !== false ? await this.buffer(`audio/wav_loops/${base}.wav`) : null;
    return wav || mp3;
  }

  /** Continuous beds: wind, insects, the feeding breath, car engine, placeholder drones. */
  startBeds() {
    this.menuHeart = 0; // 0..1 level for heartbeat_loop under the menu
    const c = this.ctx;
    // wind: band-passed noise, gusting
    this.windGain = c.createGain();
    this.windGain.gain.value = 0.2;
    this.windBP = c.createBiquadFilter();
    this.windBP.type = "bandpass";
    this.windBP.frequency.value = 500;
    this.windBP.Q.value = 0.7;
    const wl = this.loop(this.noise, this.windBP, 1);
    this.windBP.connect(this.windGain);
    this.windGain.connect(this.amb);
    this.windHi = c.createBiquadFilter();
    this.windHi.type = "bandpass";
    this.windHi.frequency.value = 1800;
    this.windHi.Q.value = 3;
    this.windHiG = c.createGain();
    this.windHiG.gain.value = 0.02;
    wl.g.connect(this.windHi);
    this.windHi.connect(this.windHiG);
    this.windHiG.connect(this.amb);
    // insects: scheduled chirps into this gain
    this.insectGain = c.createGain();
    this.insectGain.gain.value = 0.5;
    this.insectGain.connect(this.amb);
    // feeding: deep breath-like resonance
    this.feedGain = c.createGain();
    this.feedGain.gain.value = 0;
    const breath = c.createGain();
    breath.gain.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoAmt = c.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt);
    lfoAmt.connect(breath.gain);
    lfo.start();
    for (const [f, a] of [
      [36, 0.5],
      [54.3, 0.25],
      [72.7, 0.12],
    ]) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(breath);
      o.start();
    }
    const nlp = c.createBiquadFilter();
    nlp.type = "lowpass";
    nlp.frequency.value = 260;
    this.loop(this.brown, nlp, 0.7);
    nlp.connect(breath);
    breath.connect(this.feedGain);
    this.feedGain.connect(this.sfx);
    // car engine
    this.carOsc = c.createOscillator();
    this.carOsc.type = "sawtooth";
    this.carOsc.frequency.value = 38;
    const clp = c.createBiquadFilter();
    clp.type = "lowpass";
    clp.frequency.value = 280;
    this.carGain = c.createGain();
    this.carGain.gain.value = 0;
    this.carPan = this.pan(0);
    this.carOsc.connect(clp);
    clp.connect(this.carGain);
    this.carGain.connect(this.carPan);
    this.carPan.connect(this.sfx); // the engine is the warning: never ducked by the pre-shock hush
    this.carOsc.start();
    // placeholder drones (only heard when no music files exist)
    this.drone = {};
    const mk = (freqs, type, lpF, trem) => {
      const out = c.createGain();
      out.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lpF;
      lp.connect(out);
      for (const f of freqs) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 12;
        const og = c.createGain();
        og.gain.value = 0.25 / freqs.length;
        o.connect(og);
        og.connect(lp);
        o.start();
      }
      if (trem) {
        const l = c.createOscillator();
        l.frequency.value = trem;
        const la = c.createGain();
        la.gain.value = 0.5;
        const base = c.createGain();
        base.gain.value = 0.6;
        lp.disconnect();
        lp.connect(base);
        l.connect(la);
        la.connect(base.gain);
        l.start();
        base.connect(out);
      }
      out.connect(this.music);
      return out;
    };
    this.drone.calm = mk([41.2, 61.7, 82.4], "sine", 400, 0);
    this.drone.dread = mk([41.2, 43.65, 87.3, 92.5], "sawtooth", 220, 0.13);
    this.drone.chase = mk([55, 58.3, 110, 116.5], "sawtooth", 360, 1.7);
  }

  setLevels(l) {
    this.levels = { ...this.levels, ...l };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.levels.music * BUS.music, t, 0.1);
    this.stingDirect.gain.setTargetAtTime(this.levels.music * BUS.music, t, 0.1);
    this.amb.gain.setTargetAtTime(this.levels.amb * BUS.amb, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.levels.sfx * BUS.sfx, t, 0.1);
  }

  // ---------------------------------------------------------------- music
  /**
   * Loops: calm, dread, chase (or null). All three keep running once started and only crossfade,
   * so switching never restarts a track from 0 or stacks copies.
   */
  async setMusic(name) {
    if (!this.ctx) {
      this.pendingMusic = name;
      return;
    }
    if (this.musicState === name) return;
    this.musicState = name;
    const t = this.ctx.currentTime;
    const tau = name === "chase" ? 0.35 : 1.2;
    for (const [k, l] of Object.entries(this.musicLoops)) if (k !== name && l) l.g.gain.setTargetAtTime(0, t, tau);
    for (const k of Object.keys(this.drone)) this.drone[k].gain.setTargetAtTime(0, t, 1.5);
    if (!name) return;
    await this.ready;
    if (this.files.music.has(name)) {
      let l = this.musicLoops[name];
      if (!l) {
        if (this.musicLoading && this.musicLoading[name]) return void (await this.musicLoading[name], this.applyMusic());
        this.musicLoading = this.musicLoading || {};
        this.musicLoading[name] = this.loopBuffer(name).then((buf) => {
          if (buf && !this.musicLoops[name]) this.musicLoops[name] = this.loop(buf, this.music, 0, name);
        });
        await this.musicLoading[name];
        this.musicLoading[name] = null;
        return this.applyMusic();
      }
      return this.applyMusic();
    }
    if (this.drone[name] && this.musicState === name) {
      const lvl = { calm: 0.5, dread: 0.7, chase: 0.8 }[name];
      this.drone[name].gain.setTargetAtTime(lvl, this.ctx.currentTime, 1.6);
    }
  }
  applyMusic() {
    const t = this.ctx.currentTime;
    const name = this.musicState;
    for (const [k, l] of Object.entries(this.musicLoops)) {
      if (!l) continue;
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setTargetAtTime(k === name ? 1 : 0, t, k === name ? (name === "chase" ? 0.25 : 1.2) : k === "chase" ? 0.4 : 1.2);
    }
  }
  /** Music one-shots (taken, escape). No shocks here any more: those are shock(). */
  async sting(name) {
    if (!this.ctx) return;
    const gen = this.gen;
    // taken: if a hush is under way, land it when the dip is complete
    const at = name === "taken" && this.ducked ? Math.max(this.ctx.currentTime, this.duckEnd) : 0;
    if (at) this.releaseDuck(0.7, at + 0.25);
    await this.ready;
    if (this.files.music.has(name)) {
      const buf = await this.buffer(`audio/${name}.mp3`);
      if (gen !== this.gen) return;
      if (buf) {
        this.oneShot(buf, this.stingDirect, name === "taken" && this.reducedStings ? 0.6 : 0.9, 0, 1, at); // not ducked
        return;
      }
    }
    this.synthSting(name);
  }
  /**
   * Pre-shock hush: fade music and ambience to -30 dB over `lead` seconds and play `hush`.
   * The next shock() lands when the dip is complete and brings them back; with no shock within `hold`
   * seconds of audio time (frozen while paused) they recover on their own (see update()).
   */
  preShock(lead = 2.5, hold = 6) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if (this.ducked || t < (this.shockPending || 0)) return false;
    this.ducked = true;
    this.duckAt = t;
    this.duckEnd = t + lead;
    this.duckUntil = t + hold;
    for (const d of [this.musicDuck, this.ambDuck]) {
      d.gain.cancelScheduledValues(t);
      d.gain.setValueAtTime(Math.max(d.gain.value, 0.0001), t);
      d.gain.exponentialRampToValueAtTime(DUCK_FLOOR, t + lead);
    }
    if (t - this.lastHush > 6 && this.files.music.has("hush")) {
      this.lastHush = t;
      const gen = this.gen;
      this.buffer("audio/hush.mp3").then((b) => b && gen === this.gen && this.oneShot(b, this.stingDirect, 0.8, 0));
    }
    this.dlog("preShock");
    return true;
  }
  /** Bring music and ambience back, starting at audio time `at` (default now). Never cuts a dip short unless now. */
  releaseDuck(tau = 0.5, at = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    at = Math.max(at || now, now);
    for (const d of [this.musicDuck, this.ambDuck]) {
      if (at <= now + 0.001 || !this.ducked) {
        d.gain.cancelScheduledValues(now);
        d.gain.setValueAtTime(Math.max(d.gain.value, 0.0001), now);
      } else d.gain.cancelScheduledValues(Math.max(this.duckEnd || now, now) + 0.0001); // keep the ramp, drop later events
      d.gain.setTargetAtTime(1, at, tau);
    }
    this.ducked = false;
    this.duckUntil = 0;
    this.dlog("release");
  }
  /** Seconds until a (non-fail) shock may play again. */
  shockWait() {
    if (!this.ctx) return 0;
    return Math.max(0, this.lastShock + SHOCK_COOLDOWN - this.ctx.currentTime);
  }
  /**
   * A shock sting (spotted -> sting_2, fail -> sting_3, porch -> sting_1; _soft with softer shocks).
   * 12 s cooldown ("Seen." always lands and cuts the old sting). Every shock gets the full -30 dB dip first:
   * if a hush is already under way the sting waits for it to finish, otherwise a quick one starts now.
   */
  async shock(kind) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (kind !== "fail" && this.shockWait() > 0) return;
    this.lastShock = now;
    this.lastSting = now;
    const gen = this.gen;
    if (!this.ducked) this.preShock(kind === "fail" ? 0.9 : kind === "menu" ? 1.0 : 1.2, 6);
    const at = Math.max(now, this.duckEnd);
    this.releaseDuck(0.9, at + 0.35);
    this.shockPending = at + 0.35; // the sting hits out of the silence, then the beds come back
    const key = kind === "fail" ? "shockFail" : kind === "menu" ? "glimpse" : kind === "porch" ? "shockPorch" : "shockSpotted";
    const file = this.pick(key, this.reducedStings);
    if (this.curShock) this.fadeShot(this.curShock, 0.08);
    this.curShock = null;
    this.warm("chase");
    await this.ready;
    if (file) {
      const buf = await this.buffer(`audio/sfx/${file}.mp3`);
      if (gen !== this.gen) return; // restarted while it decoded
      if (buf) {
        const h = this.oneShot(buf, this.stingDirect, kind === "menu" ? 0.7 : 1, 0, 1, at);
        this.curShock = h;
        h.at = at;
        h.duckAtHit = { music: this.duckValueAt(at) };
        this.dlog("shock:" + kind + " hits@" + at.toFixed(2) + " fade " + (at - this.duckAt).toFixed(2) + "s");
        return;
      }
    }
    this.synthSting("uforise");
  }
  /** Expected duck gain at audio time t (exponential ramp from duckAt to duckEnd). */
  duckValueAt(t) {
    if (!this.duckEnd) return 1;
    if (t >= this.duckEnd) return DUCK_FLOOR;
    return Math.pow(DUCK_FLOOR, (t - this.duckAt) / (this.duckEnd - this.duckAt));
  }
  fadeShot(h, tau = 0.15) {
    if (!h || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setTargetAtTime(0, t, tau);
      h.s.stop(t + tau * 6);
    } catch {
      /* already stopped */
    }
    this.shots.delete(h);
  }
  /**
   * Checkpoint restart / back to menu: fade every playing one-shot (stings, screams, thunder...),
   * pull chase down, release any duck, cancel pending delayed sounds.
   */
  stopAll(tau = 0.12) {
    this.gen = (this.gen || 0) + 1; // invalidates sounds still decoding
    this.ending = null; // v20: a reset ends the ending hush
    if (!this.ctx) return;
    for (const h of [...this.shots]) this.fadeShot(h, tau);
    this.curShock = null;
    const ch = this.musicLoops.chase;
    if (ch) ch.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    this.releaseDuck(0.4);
    // v11 (Gamer Girl): a reset always comes back at full level, even if a duck ramp was still scheduled
    const now = this.ctx.currentTime;
    for (const d of [this.musicDuck, this.ambDuck]) {
      if (!d) continue;
      try {
        d.gain.cancelScheduledValues(now);
        d.gain.setValueAtTime(Math.max(d.gain.value, 0.0001), now);
        d.gain.linearRampToValueAtTime(1, now + 0.06);
      } catch {
        /* old WebKit */
      }
    }
    // v19 QA: level-pack beds (l4HighwayAmb...) fade on every reset; only the running level drives its own back up
    for (const [name, b] of Object.entries(this.beds || {})) {
      if (!/^l\d+[A-Z]/.test(name) || !b.l) continue;
      try {
        b.l.g.gain.cancelScheduledValues(now);
        b.l.g.gain.setTargetAtTime(0, now, tau);
      } catch {
        /* gone */
      }
    }
    for (const n of this.synthNodes || []) {
      try {
        n.gain.cancelScheduledValues(this.ctx.currentTime);
        n.gain.setTargetAtTime(0, this.ctx.currentTime, tau);
      } catch {
        /* gone */
      }
    }
    this.synthNodes = [];
    this.lastShock = -99;
    this.shockPending = 0;
    this.dlog("stopAll");
  }
  dlog(e) {
    this.log = this.log || [];
    if (this.ctx) this.log.push([+this.ctx.currentTime.toFixed(2), e]);
    if (this.log.length > 200) this.log.shift();
  }
  /** QA meter: RMS (dBFS) after the music and ambience ducks, and at the output. */
  meter() {
    const out = {};
    for (const [k, a] of Object.entries(this.meters || {})) {
      const d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      let sum = 0;
      for (const v of d) sum += v * v;
      out[k] = +(10 * Math.log10(sum / d.length + 1e-12)).toFixed(1);
    }
    if (this.musicDuck) out.duckMusic = +this.musicDuck.gain.value.toFixed(4);
    if (this.ambDuck) out.duckAmb = +this.ambDuck.gain.value.toFixed(4);
    return out;
  }
  synthSting(name) {
    const c = this.ctx;
    const t = c.currentTime + 0.01;
    const soft = this.reducedStings ? 0.45 : 1;
    const out = c.createGain();
    out.connect(this.stingDirect);
    out.connect(this.verb);
    this.synthNodes = (this.synthNodes || []).slice(-6);
    this.synthNodes.push(out);
    if (name === "uforise") {
      // a sudden dissonant cluster that slams in, then decays into the dark
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(400, t + 2.5);
      lp.connect(out);
      for (const f of [110, 116.5, 164.8, 174.6, 246.9, 233.1]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 25;
        o.connect(lp);
        o.start(t);
        o.stop(t + 3.2);
      }
      const boom = c.createOscillator();
      boom.frequency.setValueAtTime(70, t);
      boom.frequency.exponentialRampToValueAtTime(32, t + 1.5);
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.9 * soft, t + 0.02);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 2);
      boom.connect(bg);
      bg.connect(out);
      boom.start(t);
      boom.stop(t + 2.1);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.32 * soft, t + (this.reducedStings ? 0.25 : 0.03));
      out.gain.exponentialRampToValueAtTime(0.001, t + 3.1);
    } else if (name === "taken") {
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(200, t);
      lp.frequency.exponentialRampToValueAtTime(1800, t + 2.2);
      lp.connect(out);
      for (const f of [55, 58.3, 82.4, 87.3]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 2.3);
        o.connect(lp);
        o.start(t);
        o.stop(t + 2.4);
      }
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.25 * soft, t + 2.2);
      out.gain.setValueAtTime(0.25 * soft, t + 2.28);
      out.gain.linearRampToValueAtTime(0, t + 2.34); // cut to silence
    } else {
      // escape: a slow exhale, a held fifth that fades
      for (const f of [65.4, 98, 130.8]) {
        const o = c.createOscillator();
        o.frequency.value = f;
        o.connect(out);
        o.start(t);
        o.stop(t + 7);
      }
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.12, t + 1.5);
      out.gain.exponentialRampToValueAtTime(0.001, t + 6.8);
    }
  }
  oneShot(buf, dest, gain, panV, rate = 1, when = 0) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    const p = this.pan(panV);
    s.connect(g);
    g.connect(p);
    p.connect(dest);
    s.start(when > c.currentTime ? when : 0);
    const h = { s, g, name: buf.__src, at: Math.max(when, c.currentTime) };
    this.shots.add(h);
    this.alive = this.alive || new Set();
    this.alive.add(h); // QA: everything still physically playing (until onended)
    s.onended = () => (this.shots.delete(h), this.alive.delete(h));
    return h;
  }

  // ---------------------------------------------------------------- effects
  /** Play an effect: a file from audio/sfx/ when present, otherwise the placeholder. */
  async fx(name, opts = {}) {
    if (!(await this.ensureRunning())) return;
    if (/^ending(Escape|Capture)/.test(name)) this.endingHush(name); // v20: endings play into silence
    const pan = opts.pan || 0;
    const dist = opts.dist || 0; // 0 near .. 1 far
    const gain = (opts.gain == null ? 1 : opts.gain) * (1 - dist * 0.6);
    const file = this.pick(name, opts.soft);
    const gen = this.gen;
    if (file) {
      const buf = await this.buffer(`audio/sfx/${file}.mp3`);
      if (gen !== this.gen) return; // a restart happened while it decoded
      if (buf) {
        return this.oneShot(buf, opts.amb ? this.amb : opts.music ? this.stingDirect : this.sfx, gain, pan, opts.rate || 1);
      }
    }
    const fn = this["_" + name];
    if (fn) fn.call(this, gain, pan, dist);
  }
  /** v20: an ending owns the mix: every bed fades out (the coast's own bed is kept for the escape), the base hum/beds stop being driven. */
  endingHush(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const keep = name === "endingEscapeSpace" ? /^l10CoastAmb$/ : /^$/;
    for (const [k, b] of Object.entries(this.beds || {})) {
      if (!b.l || keep.test(k)) continue;
      try {
        b.l.g.gain.cancelScheduledValues(now);
        b.l.g.gain.setTargetAtTime(0, now, name === "endingCaptureSlam" ? 0.05 : 0.6);
      } catch {
        /* gone */
      }
    }
    this.ending = name;
  }
  /** Which file (if any) plays this sound; `soft` prefers the *_soft variant. */
  /**
   * Which file (if any) plays this sound; `soft` prefers the *_soft variant (decoded only when that setting is on).
   * Variants are lazy: prefer one that's already decoded, and warm one other variant in the background for next time.
   */
  pick(name, soft) {
    const list = (SFX_FILES[name] || [name]).filter((n) => this.files.sfx.has(n));
    if (!list.length) return null;
    const ready = list.filter((n) => this.mem.has(`audio/sfx/${n}.mp3`));
    const f = (ready.length ? ready : list)[(Math.random() * (ready.length || list.length)) | 0];
    if (ready.length && ready.length < list.length && Math.random() < 0.5) {
      const other = list.find((n) => !this.buffers.has(`audio/sfx/${n}.mp3`));
      if (other) this.buffer(`audio/sfx/${other}.mp3`);
    }
    return soft && this.files.sfx.has(f + "_soft") ? f + "_soft" : f;
  }
  has(name) {
    return (SFX_FILES[name] || [name]).some((n) => this.files.sfx.has(n));
  }
  envOut(gain, pan, dist, wet = 0.3) {
    const c = this.ctx;
    const g = c.createGain();
    const p = this.pan(pan);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 9000 - dist * 7500;
    g.connect(lp);
    lp.connect(p);
    p.connect(this.sfx);
    const w = c.createGain();
    w.gain.value = wet + dist * 0.5;
    p.connect(w);
    w.connect(this.verb);
    return g;
  }
  noiseSrc(t, dur, buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf || this.noise;
    s.start(t, Math.random() * 2);
    s.stop(t + dur);
    return s;
  }
  _burst(gain, pan) {
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain, pan, 0, 0.2);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 0.8);
    const n = this.noiseSrc(t, 1.1);
    n.connect(bp);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    bp.connect(g);
    g.connect(out);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const og = c.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(og);
    og.connect(out);
    o.start(t);
    o.stop(t + 0.6);
  }
  _dog(gain, pan, dist) {
    // a run of 2-4 barks across the field
    const c = this.ctx;
    const out = this.envOut(gain * 0.55, pan, dist, 0.35);
    let t = c.currentTime + 0.05;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      const f0 = 420 + Math.random() * 80;
      o.frequency.setValueAtTime(f0 * 0.8, t);
      o.frequency.linearRampToValueAtTime(f0, t + 0.03);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.14);
      const f1 = c.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.value = 1100;
      f1.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(f1);
      f1.connect(g);
      g.connect(out);
      const nz = this.noiseSrc(t, 0.1);
      const nf = c.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 1800;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.3, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      nz.connect(nf);
      nf.connect(ng);
      ng.connect(out);
      o.start(t);
      o.stop(t + 0.18);
      t += 0.22 + Math.random() * 0.25;
    }
  }
  _thunder(gain, pan, dist) {
    const c = this.ctx;
    const t = c.currentTime + 0.05;
    const out = this.envOut(gain, pan, dist, 0.4);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 3);
    const s = this.noiseSrc(t, 4.5, this.brown);
    s.connect(lp);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.15);
    g.gain.setTargetAtTime(0.4, t + 0.5, 0.4);
    g.gain.setTargetAtTime(0.0001, t + 1.5, 0.9);
    lp.connect(g);
    g.connect(out);
  }
  _scream(gain, pan, dist) {
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const out = this.envOut(gain * 0.35, pan, Math.max(0.5, dist), 0.5);
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(650, t);
    o.frequency.linearRampToValueAtTime(980, t + 0.25);
    o.frequency.linearRampToValueAtTime(760, t + 1.1);
    const vib = c.createOscillator();
    vib.frequency.value = 7;
    const va = c.createGain();
    va.gain.value = 25;
    vib.connect(va);
    va.connect(o.frequency);
    const f1 = c.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 1000;
    f1.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.06);
    g.gain.setTargetAtTime(0.0001, t + 0.9, 0.18);
    o.connect(f1);
    f1.connect(g);
    g.connect(out);
    o.start(t);
    vib.start(t);
    o.stop(t + 1.8);
    vib.stop(t + 1.8);
  }
  _gasp(gain, pan, dist) {
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain * 0.3, pan, dist, 0.2);
    const n = this.noiseSrc(t, 0.4);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(bp);
    bp.connect(g);
    g.connect(out);
  }
  _thud(gain, pan, dist, f = 90, len = 0.25) {
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain, pan, dist, 0.3);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
    const n = this.noiseSrc(t, 0.12);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(out);
  }
  _stepWood(gain, pan, dist) {
    this._step(gain * 1.3, pan, dist);
  }
  _slam(gain, pan, dist) {
    this._thud(gain, pan, dist, 110, 0.3);
  }
  _door(gain, pan, dist) {
    // a short creak
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain * 0.25, pan, dist, 0.2);
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(220, t + 0.5);
    const am = c.createOscillator();
    am.frequency.value = 33;
    const ag = c.createGain();
    ag.gain.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.4;
    am.connect(ag);
    ag.connect(g.gain);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 4;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(1, t + 0.08);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(bp);
    bp.connect(g);
    g.connect(e);
    e.connect(out);
    o.start(t);
    am.start(t);
    o.stop(t + 0.65);
    am.stop(t + 0.65);
  }
  _brake(gain, pan, dist) {
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain * 0.4, pan, dist, 0.2);
    const n = this.noiseSrc(t, 0.9);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    n.connect(bp);
    bp.connect(g);
    g.connect(out);
  }
  _step(gain, pan, dist) {
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain * 0.12, pan, dist, 0.05);
    const n = this.noiseSrc(t, 0.05);
    const hp = c.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 2400 + Math.random() * 800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    n.connect(hp);
    hp.connect(g);
    g.connect(out);
  }
  _cow(gain, pan, dist) {
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.envOut(gain * 0.35, pan, dist, 0.3);
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(120, t);
    o.frequency.linearRampToValueAtTime(150, t + 0.3);
    o.frequency.linearRampToValueAtTime(105, t + 1.1);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(900, t + 0.4);
    lp.frequency.linearRampToValueAtTime(350, t + 1.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 1.25);
  }

  // ---------------------------------------------------------------- Area 51 Escape
  /** Decode the level 1 pack (beds first) so the hangar has its air and the door is ready. */
  /** All-levels pass: decode level n's pack in the background (call when the level starts or its clip begins). */
  // ---------------------------------------------------------------- voice lines (v28)
  /**
   * A person spotted the craft: say("spot-<kind>", {kind, x, why}). One random line from that kind's pool (never the
   * same line twice in a row), never over another voice, slight random pitch/level. Silently does nothing if the
   * kind is unknown, audio is locked, or the clip is missing / fails to decode (old iOS safe).
   */
  async say(what, opts = {}) {
    try {
      const kind = String((opts && opts.kind) || what || "").replace(/^spot-/, "");
      const pool = (VOICE_POOLS[kind] || []).filter((n) => this.files.sfx.has(n));
      if (!pool.length || this.voiceBusy) return null; // one line (or decode) at a time
      const v = this.voice;
      if (v && this.ctx && (this.alive && this.alive.has(v.h) ? true : this.ctx.currentTime < v.end + VOICE_MIN_GAP)) return null; // never overlap
      this.voiceBusy = true;
      let ok = false;
      try {
        ok = await this.ensureRunning();
      } finally {
        this.voiceBusy = false;
      }
      if (!ok) return null;
      const c = this.ctx;
      this.lastVoice = this.lastVoice || {};
      const choices = pool.length > 1 ? pool.filter((n) => n !== this.lastVoice[kind] && n !== this.voiceLastAny) : pool;
      const ready = choices.filter((n) => this.mem.has(`audio/sfx/${n}.mp3`));
      const list = ready.length ? ready : choices;
      const file = list[(Math.random() * list.length) | 0];
      const gen = this.gen;
      this.voiceBusy = true;
      let buf = null;
      try {
        buf = await this.buffer(`audio/sfx/${file}.mp3`);
      } finally {
        this.voiceBusy = false;
      }
      if (!buf || gen !== this.gen) return null;
      const v2 = this.voice;
      if (v2 && this.alive && this.alive.has(v2.h)) return null; // another line started while this one decoded
      const rate = 0.96 + Math.random() * 0.08; // about +-0.7 semitone
      const gain = VOICE_GAIN * (0.85 + Math.random() * 0.2);
      const pan = Math.max(-0.35, Math.min(0.35, (Math.random() - 0.5) * 0.3));
      const h = this.oneShot(buf, this.sfx, gain, pan, rate);
      this.voice = { h, file, end: c.currentTime + buf.duration / rate };
      this.lastVoice[kind] = file;
      this.voiceLastAny = file;
      this.voiceLog = this.voiceLog || [];
      this.voiceLog.push({ kind, file, t: +c.currentTime.toFixed(3), dur: +(buf.duration / rate).toFixed(3) });
      // warm one other line of this pool for next time (cheap: clips are under 2.5 s mono)
      const next = pool.find((n) => n !== file && !this.buffers.has(`audio/sfx/${n}.mp3`));
      if (next) this.buffer(`audio/sfx/${next}.mp3`);
      return h;
    } catch {
      this.voiceBusy = false;
      return null;
    }
  }
  /** Decode the voice pools for the kinds of people in level n (two lines each, the rest on demand). */
  warmVoices(n) {
    try {
      const kinds = LEVEL_VOICES[n] || [];
      const want = new Set(kinds.flatMap((k) => (VOICE_POOLS[k] || []).filter((f) => this.files.sfx.has(f)).slice(0, 2)));
      // free other levels' voices that aren't playing
      const all = new Set(Object.values(VOICE_POOLS).flat());
      const drop = new Set([...all].filter((f) => !want.has(f) && !(kinds.some((k) => (VOICE_POOLS[k] || []).includes(f)))));
      for (const f of drop) {
        const p = `audio/sfx/${f}.mp3`;
        if (!this.mem.has(p) || (this.voice && this.voice.file === f)) continue;
        this.mem.delete(p);
        this.buffers.delete(p);
        this.used.delete(p);
      }
      if (this.ctx) want.forEach((f) => this.buffer(`audio/sfx/${f}.mp3`));
    } catch {
      /* never let voices break a level start */
    }
  }
  warmLevel(n) {
    this.warmVoices(n);
    // v19 QA: a level start also retires every other level's pack, so beds can't stack and old loops are freed
    const keep = new Set(LEVEL_SOUNDS[String(n)] || []);
    const others = new Set(Object.values(LEVEL_SOUNDS).flat().filter((f) => !keep.has(f) && /^(l\d+_|clip_after_|ending_)/.test(f)));
    this.dropFiles(others);
    keep.forEach((f) => this.warm(f));
  }
  /** Stop beds that play any of these files and forget their decoded buffers. */
  dropFiles(files) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [name, b] of Object.entries(this.beds || {})) {
      const src = b.l && b.l.s.buffer && b.l.s.buffer.__src;
      const f = src && src.replace(/^.*\//, "").replace(/\.(mp3|wav)$/, "");
      if (!f || !files.has(f)) continue;
      try {
        b.l.g.gain.cancelScheduledValues(now);
        b.l.g.gain.setTargetAtTime(0, now, 0.15);
        b.l.s.stop(now + 1);
      } catch {
        /* already stopped */
      }
      delete this.beds[name];
    }
    for (const f of files) {
      const p = `audio/sfx/${f}.mp3`;
      if (!this.mem.has(p)) continue;
      this.mem.delete(p);
      this.buffers.delete(p);
      this.used.delete(p);
    }
  }
  warmA51() {
    // v11 (Gamer Girl debug pass): trucks, the low-Energy pulse and the escape cue warm too, so their first play doesn't hitch
    ["base_ambience_loop", "hangar_door", "searchlight_hum_loop", "searchlight_pass", "base_alarm", "first_feed_sting", "capture_sting",
      "truck_idle_loop", "truck_pass", "energy_warn_loop", "escape_space"].forEach((n) => this.warm(n));
  }
  /**
   * A level-1 sting played out of the silence: if a hush is under way it lands when the dip completes,
   * otherwise a quick dip first. kind: "firstFeed" | "captureSting" | "hangarDoor".
   */
  async a51Sting(kind, gain = 1, lead = 0.9) {
    if (!(await this.ensureRunning())) return;
    const now = this.ctx.currentTime;
    if (!this.ducked) this.preShock(lead, 5);
    const at = Math.max(now, this.duckEnd || now);
    this.releaseDuck(1.0, at + 0.4);
    this.shockPending = at + 0.4;
    this.lastShock = now;
    const gen = this.gen;
    const f = this.pick(kind);
    if (f) {
      const buf = await this.buffer(`audio/sfx/${f}.mp3`);
      if (gen !== this.gen || !buf) return;
      const h = this.oneShot(buf, this.stingDirect, gain, 0, 1, at);
      this.dlog("a51:" + kind + " hits@" + at.toFixed(2) + " fade " + (at - (this.duckAt || at)).toFixed(2) + "s");
      return h;
    }
    this.synthSting(kind === "captureSting" ? "uforise" : "taken");
  }

  // ---------------------------------------------------------------- Storm Farm
  /** Decode the storm pack ahead of the first gust (level 2 only, so level 1 memory is unchanged). */
  warmStorm() {
    ["storm_wind_loop", "storm_gust", "storm_calm_hole", "thunder_close", "rain_soft_loop"].forEach((n) => this.warm(n));
  }
  /**
   * The dead-quiet hole before a gust front: music and ambience fall to -30 dB over `lead` seconds
   * (the usual pre-shock duck) and storm_calm_hole (or hush) plays under it.
   */
  stormHush(lead = 1.2, hold = 8) {
    if (!this.ctx) return;
    // the dip holds through the gust and the calm hole; the game releases it when the thunder lands
    this.preShock(lead, hold);
    this.dlog("stormHush");
  }
  /** The gust front hits out of the silence: storm_gust (or a synth howl) lands when the dip completes. */
  async stormRip(pan = -0.6) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    // music and the storm bed stay down; the gust (effects bus, never ducked) hits once the dip is complete
    const at = this.ducked ? Math.max(now, this.duckEnd || now) : now;
    const gen = this.gen;
    const f = this.pick("stormGust");
    if (f) {
      const buf = await this.buffer(`audio/sfx/${f}.mp3`);
      if (gen !== this.gen || !buf) return;
      const h = this.oneShot(buf, this.sfx, 1.0, 0, 1, at);
      this.dlog("stormRip hits@" + at.toFixed(2));
      return h;
    }
    this._howl(1, pan, at);
  }
  /** After the gust: the air is gone for a moment (bed muted by the game), then it creeps back. */
  stormHole() {
    if (!this.ctx) return;
    const gen = this.gen;
    const f = this.pick("stormHole");
    if (f) this.buffer(`audio/sfx/${f}.mp3`).then((b) => b && gen === this.gen && this.oneShot(b, this.stingDirect, 0.85, 0));
    this.dlog("stormHole");
  }
  /** Placeholder gust: resonant noise sweep with a low rumble (only if storm_gust is missing). */
  _howl(gain, pan, when = 0) {
    const c = this.ctx;
    const t = Math.max(c.currentTime, when);
    const out = this.envOut(gain, pan, 0, 0.35);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 5;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1300, t + 0.9);
    bp.frequency.exponentialRampToValueAtTime(420, t + 3);
    const n = this.noiseSrc(t, 3.4);
    n.connect(bp);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.2, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    bp.connect(g);
    g.connect(out);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const n2 = this.noiseSrc(t, 2.6, this.brown);
    n2.connect(lp);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(1.0, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    lp.connect(g2);
    g2.connect(out);
  }

  // ---------------------------------------------------------------- per frame
  /**
   * p: { gust, insects (0..1), muffle (0..1 in cloud), feed (0..1), car: {gain, speed, pan} }
   */
  update(p) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const c = this.ctx;
    const t = c.currentTime;
    // a hush with no shock recovers after its hold (audio time: frozen while paused)
    if (this.ducked && this.duckUntil && t > this.duckUntil) this.releaseDuck(2.5);
    if ((this.nextHouse = (this.nextHouse || 0) - 1) <= 0) {
      this.nextHouse = 120;
      this.releaseIdleMusic();
      this.trim();
    }
    const fileWind = this.has("wind");
    const storm = p.storm || 0; // Storm Farm bed level (0 on the quiet farm and the menu)
    const howl = p.howl || 0; // 0..1 while a gust front is tearing through
    const fileStorm = storm > 0 && this.has("stormWind");
    // the noise wind doubles as a howl layer in the storm (a resonant whistle on top of the storm bed)
    this.windGain.gain.setTargetAtTime((fileWind ? 0 : 0.12 + p.gust * 0.4) + howl * 0.22, t, 0.3);
    this.windBP.frequency.setTargetAtTime(380 + p.gust * 650 + howl * 500, t, 0.4);
    this.windBP.Q.setTargetAtTime(0.7 + howl * 3.5, t, 0.3);
    this.windHiG.gain.setTargetAtTime((fileWind ? 0 : Math.max(0, p.gust - 0.6) * 0.12) + howl * 0.06, t, 0.5);
    this.muffle.frequency.setTargetAtTime(16000 - p.muffle * 15000, t, 0.25);
    this.insectGain.gain.setTargetAtTime(p.insects * 0.5, t, 0.6);
    const fileCar = this.has("car");
    this.carGain.gain.setTargetAtTime(fileCar ? 0 : p.car.gain * 0.35, t, 0.1);
    this.carOsc.frequency.setTargetAtTime(32 + Math.abs(p.car.speed) * 0.12, t, 0.15);
    if (this.carPan.pan) this.carPan.pan.setTargetAtTime(p.car.pan, t, 0.1);
    // file-based beds
    const fileFeed = this.has("feed");
    this.feedGain.gain.setTargetAtTime(fileFeed ? 0 : p.feed * 0.9, t, 0.15);
    // the music already carries wind and crickets, so the beds sit lower (v2 mix)
    // Storm Farm swaps the calm wind_loop for storm_wind_loop (louder, swelling with the storm and the howl)
    const windMul = p.windMul == null ? 1 : p.windMul;
    this.bed("wind", fileWind ? (fileStorm ? 0 : 0.15 + p.gust * 0.25 + storm * 0.3 + howl * 0.3) * windMul : 0, this.amb);
    if (storm > 0 || (this.beds && this.beds.stormWind)) {
      this.bed("stormWind", fileStorm ? Math.min(0.95, 0.2 + storm * 0.38 + howl * 0.3) : 0, this.amb);
      const sb = this.beds && this.beds.stormWind;
      if (sb && sb.l) sb.l.s.playbackRate.setTargetAtTime(0.94 + Math.min(storm, 1.5) * 0.05 + howl * 0.1, t, 0.4);
      this.bed("rainSoft", this.has("rainSoft") ? Math.min(0.35, storm * 0.22) : 0, this.amb);
    }
    this.bed("insects", this.has("insects") ? 0.6 * (p.windMul == null ? 1 : p.windMul) : 0, this.insectGain); // insectGain peaks at 0.5 -> 0.3
    this.bed("feed", fileFeed ? p.feed * 0.8 : 0, this.sfx);
    this.bed("breath", (p.breath || 0) * 0.45, this.sfx);
    this.bed("hum", (p.hum || 0) * 0.5, this.sfx);
    // Menu fear bed (Gamer Girl): low heartbeat under the title screen
    const mh = this.menuHeart || 0;
    this.bed("heartbeat", mh * 0.55, this.amb);
    // car engine: starts quietly while the car is still off-screen, louder and higher as it closes in
    if (fileCar) {
      this.bed("car", p.car.gain * 0.9, this.carPan);
      const b = this.beds && this.beds.car;
      if (b && b.l) b.l.s.playbackRate.setTargetAtTime(0.8 + Math.min(0.55, Math.abs(p.car.speed) / 300) + p.car.gain * 0.15, t, 0.2);
    }
    // Area 51 Escape beds (level 1 only): desert base air, searchlight ballast hum (rises as a beam nears),
    // army truck idle, and the low-Energy pulse
    const A = p.a51;
    if (A || (this.beds && this.beds.baseAmbience)) {
      const a = A || {};
      this.bed("baseAmbience", a.amb || 0, this.amb);
      this.bed("searchlightHum", a.hum || 0, this.sfx); // effects bus: the warning is never ducked away
      const hb = this.beds && this.beds.searchlightHum;
      if (hb && hb.l) hb.l.s.playbackRate.setTargetAtTime(a.humRate || 1, t, 0.15);
      this.bed("truckIdle", a.truck || 0, this.carPan);
      const tb = this.beds && this.beds.truckIdle;
      if (tb && tb.l) tb.l.s.playbackRate.setTargetAtTime(a.truckRate || 1, t, 0.3);
      if (a.truckPan != null && this.carPan.pan) this.carPan.pan.setTargetAtTime(a.truckPan, t, 0.15);
      this.bed("energyWarn", a.energyWarn || 0, this.sfx);
    }
    // crickets (placeholder) when no insect file
    if (!this.has("insects") && !A) {
      for (let i = 0; i < this.nextCrickets.length; i++) {
        if (this.nextCrickets[i] < t + 0.15) {
          const at = Math.max(t, this.nextCrickets[i]);
          this.chirp(at, 4100 + i * 230, (i - 1.5) * 0.5);
          this.nextCrickets[i] = at + 0.55 + Math.random() * (i === 3 ? 2.5 : 0.6);
        }
      }
    }
  }
  bed(name, level, dest) {
    this.beds = this.beds || {};
    let b = this.beds[name];
    if (level <= 0 && !b) return;
    if (!b) {
      b = this.beds[name] = { loading: true };
      const file = this.pick(name);
      if (!file) return void delete this.beds[name]; // v16: files not listed yet: retry next frame instead of staying dead
      const key = "sfx/" + file;
      (this.files.loops && this.files.loops[key] ? this.loopBuffer(key) : this.buffer(`audio/sfx/${file}.mp3`)).then((buf) => {
        if (!buf) return void (this.beds[name] === b && delete this.beds[name]); // v16: failed load: retry
        const l = this.loop(buf, dest, 0, key);
        b.l = l;
        b.loading = false;
      });
    }
    if (this.ending && !(this.ending === "endingEscapeSpace" && name === "l10CoastAmb")) level = 0; // v20: ending silence holds
    if (b.l) b.l.g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
  }
  chirp(t, f, pan) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0;
    const p = this.pan(pan);
    o.connect(g);
    g.connect(p);
    p.connect(this.insectGain);
    const pulses = 2 + ((Math.random() * 2) | 0);
    for (let k = 0; k < pulses; k++) {
      const s = t + k * 0.05;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.06, s + 0.008);
      g.gain.linearRampToValueAtTime(0, s + 0.035);
    }
    o.start(t);
    o.stop(t + pulses * 0.05 + 0.05);
  }
}

export const audio = new AudioDirector();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      audio.resume();
      setTimeout(() => audio.kick && audio.kick(), 400); // iOS: may come back "interrupted"
    } else audio.suspend();
  });
  window.addEventListener("pagehide", () => audio.suspend());
  window.addEventListener("pageshow", () => document.visibilityState === "visible" && audio.resume());
  window.addEventListener("focus", () => document.visibilityState === "visible" && audio.resume()); // v13: back from Control Centre / a call banner
  const kick = () => {
    audio.unlock();
  };
  audio.kick = kick;
  for (const ev of ["touchstart", "touchend", "pointerdown", "pointerup", "mousedown", "click", "keydown"])
    document.addEventListener(ev, kick, { capture: true, passive: true });
}

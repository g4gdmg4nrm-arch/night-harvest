// World layout. Units are "virtual pixels": the screen is always 720 units tall.
export const VH = 720;
export const WORLD_W = 3400;
export const GROUND = 548; // field line where the house, cow and witness stand
export const ROAD_Y = 584; // road surface base (car)
export const HOUSE = { x: 2120, w: 330, door: 2168 };
export const COW_X = 1360;
// Main hide clouds (keep first two indices for playtest / director)
export const CLOUD_A = { x: 860, y: 196 };
export const CLOUD_B = { x: 2010, y: 168 };
// Extra layers at different heights: high cover to hide in, mid bands, lower wisps
export const CLOUD_LAYERS = [
  { x: CLOUD_A.x, y: CLOUD_A.y, w: 680, h: 210, seed: 11, kind: "cumulus" }, // hide A
  { x: CLOUD_B.x, y: CLOUD_B.y, w: 620, h: 190, seed: 29, kind: "cumulus" }, // hide B
  { x: 1400, y: 118, w: 720, h: 140, seed: 47, kind: "flat" }, // high mid shelf
  { x: 2800, y: 150, w: 560, h: 170, seed: 61, kind: "cumulus" }, // far right bank
  { x: 420, y: 145, w: 480, h: 120, seed: 73, kind: "flat" }, // far left high
  { x: 1650, y: 248, w: 420, h: 100, seed: 89, kind: "flat" }, // mid drop ledge
];
export const CREATURE_START = { x: 860, y: 196 };
export const MOON = { x: 520, y: 92, r: 24 }; // screen-ish (parallax 0.04)

/** Road height at world x (gentle rise and dip so the car pitches and its lights sweep). */
export function roadY(x) {
  return ROAD_Y + 7 * Math.sin(x / 430) + 3 * Math.sin(x / 113 + 1.3) + 1.2 * Math.sin(x / 37);
}

// Tunables for the encounter (all provisional, first-pass values).
export const TUNE = {
  feedSeconds: 2.4, // v13 (Josh 5 Oct): ~2.5-3 s real feed incl. the ramp-in (was 6.0)
  feedRangeX: 90,
  feedMinAbove: 20, // creature must be at least this far above the cow
  feedMaxAbove: 170,
  feedSwoopY: 428, // height the craft settles to while feeding
  burstCooldown: 2.2,
  hiddenDensity: 0.7, // cloud density that counts as hidden
  seenVis: 0.3, // visibility above this counts as "seen"
  failExposure: 4.5, // seconds seen during a search before restart
  winHidden: 4, // seconds hidden after the harvest to escape
  searchEaseHidden: 11, // seconds hidden before an unfed search calms down
  exposedAfterHarvest: 8, // harvested and out of cover this long = seen
  burstImpulse: 560, // slightly sharper upward escape
  burstTear: 0.32,
  carSpawnBack: 900, // the car starts this far left of the screen, so you hear it first
  // Height-based danger: catches mainly while low/feeding; mid-height peeks are soft
  dangerLowY: 360, // below this, full exposure weight
  dangerHighY: 260, // above this (in / near cloud), exposure is heavily softened
};

// ------------------------------------------------------------------ levels
// Josh's locked list (design/levels-10.md, Area 51 arc). Built: 1 Area 51 Escape, 2 Quiet Farm.
// 3 Storm Farm is the paused WIP (all storm code keys off `storm: true`); `wip: true` keeps it locked in the
// Levels menu until it's properly remounted. Add `?all` to the URL to open every built level for testing.
export const LEVELS = [
  { id: 1, name: "Area 51 Escape", kind: "a51" },
  { id: 2, name: "Quiet Farm", kind: "farm", storm: false },
  { id: 3, name: "Storm Farm", kind: "farm", storm: true, wip: true },
];
export const levelById = (id) => LEVELS.find((L) => L.id === id) || LEVELS[0];
// Progress lock: Area 51 and Quiet Farm are always open; later levels open when the one before is beaten.
export const LOCK_LEVELS = true;

// ------------------------------------------------------------------ Level 1: Area 51 Escape
// Same ground line and creature as the farm; a wider world. Left -> right: Hangar 18 (start, inside),
// apron + control tower, searchlight towers, the test-animal pen (first feed), the perimeter fence, open desert.
export const A51 = {
  W: 6400, // v13 bigger base (was 4700)
  hangar: { x0: 260, x1: 1060, roof: 236, door: 1060 }, // interior x0..x1, roof underside y
  start: { x: 640, y: 405 }, // craft held in the gantry inside the hangar
  checkpoint0: { x: 1330, y: 175 }, // after the breakout: inside the first cloud
  checkpoint1: { x: 2560, y: 200 }, // after the first feed: the cloud above the pen
  pen: { x0: 2700, x1: 3000 },
  cows: [2760, 2860, 2945],
  guard: { x: 3060 },
  // v13: soldiers on the ground. They look up and point when the craft is low or lit near them (no combat);
  // pointing radios it in, so nearby towers swing toward where they're pointing.
  soldiers: [{ x: 1700, dir: 1 }, { x: 2300, dir: -1 }, { x: 3380, dir: -1 }, { x: 4420, dir: 1 }, { x: 4700, dir: -1 }, { x: 5280, dir: 1 }, { x: 5600, dir: -1 }],
  soldierSee: 520, // horizontal range
  soldierLookY: 330, // craft below this (or in a beam) can be seen
  sign: { x: 1400 }, // the big AREA 51 sign on the apron
  // v13 EMP (Josh 5 Oct): blacks out power in a circle around the craft
  empRadius: 520,
  towers: [
    // x, top y, sweep centre angle, sweep half-range, sweep speed (rad/s base), phase
    { x: 1560, y: 372, c: -1.75, r: 0.78, sp: 0.42, ph: 0.0 },
    { x: 2420, y: 360, c: -1.35, r: 0.82, sp: 0.36, ph: 1.9 },
    { x: 3240, y: 360, c: -1.85, r: 0.8, sp: 0.4, ph: 3.7 },
    { x: 3980, y: 372, c: -1.5, r: 0.85, sp: 0.46, ph: 5.1 },
    // v13 bigger base: the barracks / motor pool stretch before the fence
    { x: 4720, y: 366, c: -1.65, r: 0.8, sp: 0.44, ph: 2.6 },
    { x: 5420, y: 372, c: -1.4, r: 0.82, sp: 0.5, ph: 4.4 },
  ],
  fence: 5760, // perimeter fence (v13: was 4230)
  exitX: 5860, // past the fence = off the base
  tower: { x: 1880 }, // control tower + radar
  // Searchlight fairness (Game King): a beam that brushes you hesitates first. Leave the beam (or reach thick
  // cloud) within the warning and it loses you. Stay in it and it locks on.
  beamHalf: 0.085, // cone half-angle (radians)
  beamLen: 1250,
  brushWarn: 1.5, // seconds in the beam before it locks (high / not feeding)
  brushWarnLow: 1.2, // seconds when you're low and feeding (the column gives you away)
  brushLose: 0.35, // out of the beam this long during the warning = lost you
  brushCool: 3.2, // after losing you, a light can't brush again for this long
  lockTrack: 0.55, // locked beam max turn rate (rad/s): a burst outruns it
  lockLose: 2.4, // out of a locked beam this long = lost
  lockHiddenLose: 1.4, // fully in cloud this long = lost
  failExposure: 2.8, // seconds of locked, visible exposure (weighted) before you're caught (v11: was 4.0, ~6.7 s real; now ~3 s)
  highSoften: 0.75, // exposure weight up high (v11: was 0.6)
  // v11 pen fix (Game King debug pass): the feed column is seen. Feeding low out of cloud builds "pen heat"
  // fast while a nearby beam is turned toward you, slowly while the lights are swung away. At 1.0 the nearby
  // towers dip their beams onto the pen and hunt you there (still the same brush warning before a lock).
  penHeatBase: 0.3, // v13: feeds are ~2.7 s now, so the slow build is faster (was 0.12) // per second of exposed feeding with every light swung away
  penHeatFacing: 1.0, // extra per second when a nearby beam is facing your side
  penHeatDecay: 0.35, // per second once you stop feeding / get into cloud
  penHuntRange: 0.16, // a hunting beam sweeps this tight (radians) around you
  penHuntTime: 7, // seconds the towers keep hunting the pen after they notice
  // Energy (0..1): feeding fills it, bursts and hard climbs spend a little
  energyStart: 0.12,
  energyMinExit: 0.15,
  feedGain: [0.42, 0.28, 0.22], // first, second, third cow
  burstCost: 0.06,
  climbCost: 0.016, // per second of hard climbing
  feedSeconds: 2.4, // v13: ~2.7 s real (was 5.0)
  winHidden: 2.5, // past the fence and hidden this long = escaped
};
export const A51_CLOUDS = [
  { x: 1330, y: 168, w: 560, h: 180, seed: 15, kind: "cumulus", drift: 50 }, // first cover after the breakout
  { x: 820, y: 112, w: 620, h: 110, seed: 33, kind: "flat", drift: 70 }, // high, over the hangar
  { x: 2050, y: 118, w: 720, h: 130, seed: 51, kind: "flat", drift: 80 }, // high shelf over the tower
  { x: 2560, y: 198, w: 540, h: 180, seed: 23, kind: "cumulus", drift: 45 }, // staging cloud beside the pen
  { x: 3330, y: 150, w: 600, h: 170, seed: 67, kind: "cumulus", drift: 60 },
  { x: 2950, y: 262, w: 360, h: 90, seed: 91, kind: "flat", drift: 40 }, // low ledge (risky cover)
  { x: 3880, y: 232, w: 440, h: 100, seed: 79, kind: "flat", drift: 55 },
  { x: 4420, y: 160, w: 560, h: 170, seed: 43, kind: "cumulus", drift: 55 }, // v13: cover over the barracks
  { x: 5150, y: 240, w: 420, h: 100, seed: 83, kind: "flat", drift: 50 },
  { x: 6080, y: 168, w: 760, h: 230, seed: 41, kind: "cumulus", count: 52, drift: 40 }, // the dark bank past the fence
];

// Storm Farm clouds: the same hide clouds as the quiet farm (they get shredded), plus two heavy storm
// banks (`tough`) that the gusts can't strip: one far left, one right above the house roofline.
export const STORM_LAYERS = [
  { x: CLOUD_A.x, y: CLOUD_A.y, w: 680, h: 210, seed: 11, kind: "cumulus" }, // hide A (strippable)
  { x: 1840, y: 176, w: 600, h: 190, seed: 29, kind: "cumulus" }, // hide B (strippable)
  { x: 1400, y: 118, w: 720, h: 140, seed: 47, kind: "flat" },
  { x: 2330, y: 140, w: 760, h: 280, seed: 61, kind: "cumulus", tough: true, count: 56, drift: 60 }, // storm bank (right, over the house)
  { x: 420, y: 150, w: 620, h: 260, seed: 73, kind: "cumulus", tough: true, count: 48, drift: 50 }, // storm bank (left)
  { x: 1650, y: 248, w: 420, h: 100, seed: 89, kind: "flat" },
  { x: 1120, y: 300, w: 380, h: 90, seed: 97, kind: "flat" }, // low scud
];

// Storm cycle: calm (cover regrows) -> warn (wind builds, rain curtain on the left) -> hush (music drops out)
// -> rip (gust front tears across the farm) -> hole (2.5 s dead calm, nothing can spot you: scramble for the
// storm banks) -> torn (thunder, howling wind back, bare sky with moonlight flooding in) -> calm.
export const STORM = {
  firstCalm: 13, // seconds before the first storm cycle starts
  calmMin: 13,
  calmMax: 19,
  warn: 4.5,
  hush: 1.2,
  hole: 2.5, // grace: detection is off from the gust until the end of this (storm_calm_hole is 2.5 s)
  frontSpeed: 1350, // world units per second
  frontWidth: 300,
  ripStrength: 5, // fade removed per second at the centre of the front
  torn: 7,
  regrowCalm: 0.13, // cloud recovery per second while calm (quiet farm: 0.22)
  regrowTorn: 0.02,
  gustPush: 520, // sideways shove on the craft as the front passes (less while feeding)
  tornLight: 0.14, // extra light on you while the sky is bare
};

// v13 EMP (Josh 5 Oct list): a pulse that blacks out power in a circle for 4-5 s, then a 25-30 s recharge.
export const EMP = { radius: 520, dark: 4.5, cooldown: 27 };
// v13 craft choice: "stalker" is the original; "raider" is faster, punchier and feeds quicker, but is louder in
// the light (more conspicuous) so it suits aggressive play.
export const CRAFTS = {
  stalker: { name: "Stalker", speed: 1, accel: 1, burst: 1, burstCool: 1, feed: 1, vis: 0 },
  raider: { name: "Raider", speed: 1.5, accel: 1.6, burst: 1.2, burstCool: 0.6, feed: 1.25, vis: 0.12 },
};

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
  burstImpulse: 700, // v28: 560 -> 700 so the burst still kicks well past the faster 1.8x cruise speed
  burstTear: 0.32,
  carSpawnBack: 900, // the car starts this far left of the screen, so you hear it first
  // Height-based danger: catches mainly while low/feeding; mid-height peeks are soft
  dangerLowY: 360, // below this, full exposure weight
  dangerHighY: 260, // above this (in / near cloud), exposure is heavily softened
  craftSpeed: 1.8, // v28 (Josh): top speed exactly 1.8x the original v26 speed (cruise 185 -> 333; v27 was 1.22)
  craftAccel: 1.75, // v28: snappier response x1.75 (v27 1.2); easing near a stop keeps touch precise (creature.js)
};

// ------------------------------------------------------------------ levels
// Josh's locked list (design/levels-10.md, Area 51 arc). Built: 1 Area 51 Escape, 2 Quiet Farm.
// 3 Storm Farm is the paused WIP (all storm code keys off `storm: true`); `wip: true` keeps it locked in the
// Levels menu until it's properly remounted. Add `?all` to the URL to open every built level for testing.
// v28: `par` = seconds for 3 stars (never caught and run time <= par); `hook` = the Get Ready card line.
// L1-4 pars = careful-bot median from a fresh start, rounded up to 5 s (L1 45.9, L2 33, L3 ~48, L4 ~23); L5-10 from Game King's spec.
export const LEVELS = [
  { id: 1, name: "Area 51 Escape", kind: "a51", par: 50, hook: "Hangar 18. They've kept you starving for weeks." },
  { id: 2, name: "Quiet Farm", kind: "farm", storm: false, par: 35, hook: "One farmhouse. One cow. Nobody awake. Probably." },
  { id: 3, name: "Storm Farm", kind: "farm", storm: true, wip: false, par: 50, hook: "The wind is coming. It will take your cloud with it." },
  // v18 level 4: the farm engine with rest-stop dressing, lightning every 6.5-9.5 s and an army truck patrol (js/highway.js)
  { id: 4, name: "Highway Rest Stop", kind: "farm", storm: false, highway: true, par: 25, hook: "Every flash of lightning shows them where you are." },
  { id: 5, name: "Small Town", kind: "town", par: 40, hook: "Two streets. Feed on one and the other wakes." },
  { id: 6, name: "Rodeo Fairground", kind: "rodeo", par: 45, hook: "The easiest meal here is the one they left out for you." },
  { id: 7, name: "Suburb Backyards", kind: "suburb", par: 50, hook: "The houses are dark. The phones aren't." },
  { id: 8, name: "Power Station", kind: "power", par: 35, hook: "The radios hear you before anyone sees you." },
  { id: 9, name: "Army Convoy", kind: "convoy", par: 55, hook: "They're hunting now. Feed twice, or you won't reach the coast." },
  { id: 10, name: "Coast at Dawn", kind: "coast", par: 50, hook: "Last night on Earth. The sun is coming up." },
];
export const levelById = (id) => LEVELS.find((L) => L.id === id) || LEVELS[0];
// Progress lock: Area 51 and Quiet Farm are always open; later levels open when the one before is beaten.
export const LOCK_LEVELS = true;

// ------------------------------------------------------------------ Level 1: Area 51 Escape
// Same ground line and creature as the farm; a wider world. Left -> right: Hangar 18 (start, inside),
// apron + control tower, searchlight towers, the test-animal pen (first feed), the perimeter fence, open desert.
export const A51 = {
  lockFeedMul: 0, brushFeedMul: 0.15, noticedFeedMul: 0.6, // v23 (was brush 0.3); v22 (level 1 only): a beam on you pins the cow, so careless open feeding is caught before the cow lands
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
  lateFeedAt: 1.9, // v26: a feed starting this long after every beam swung away is hunted at once (v27: careful dives start ~1.5 s in; was 2.2)
  seenFeedHunt: 0.2, // v26: s low in the open (feeding) with a beam still turned your way before the nearest beam is sent to the pen
  awayCheck: 3.3, // v27: was 3.6 (craft is ~22% faster, so feeds start ~0.3 s sooner) // v24: seconds of "every beam swung away" before low open feeding draws one back (closes the careless free cow)
  // Energy (0..1): feeding fills it, bursts and hard climbs spend a little
  energyStart: 0.12,
  energyMinExit: 0.15,
  feedGain: [0.42, 0.28, 0.22], // first, second, third cow
  burstCost: 0.06,
  climbCost: 0.016, // per second of hard climbing
  feedSeconds: 2.7, // v28 (Game King): level 1 cow feed ~0.3 s longer (was 2.4; other levels keep 2.4 below)
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

// ------------------------------------------------------------------ Level 5: Small Town (Game King sandbox)
// Two streets facing each other across the square. Feeding on one street WAKES THE OTHER: its windows all go
// dark together (listening, l5StingWindowsDark), then blaze on, dogs bark (l5StingDogsWake) and people come out
// and look up. Over an awake street, out of thick cloud and low (or feeding), they see you: gasps + pointing for
// ~1.4 s (the warning), then the nearest spotlight snaps on and locks. An awake street settles after ~18 s.
// Plan the order: feed on the far street first, or feed near and wait out the far street.
export const TOWN = {
  ...A51,
  lockFeedMul: 1, brushFeedMul: 1, noticedFeedMul: 1, awayCheck: null, seenFeedHunt: null, lateFeedAt: null, feedSeconds: 2.4, // level 1 only
  W: 5000,
  hangar: { x0: -3000, x1: -2900, roof: -1000, door: -2900 }, // no hangar
  start: { x: 320, y: 170 },
  checkpoint0: { x: 320, y: 170 },
  checkpoint1: { x: 1600, y: 180 },
  streets: [
    { name: "Elm St", x0: 1100, x1: 2100, cow: 1600, cloud: { x: 1600, y: 180 } },
    { name: "Main St", x0: 2800, x1: 3800, cow: 3300, cloud: { x: 3300, y: 180 } },
  ],
  pen: { x0: 1500, x1: 1700 }, // pen heat for Elm St's backyard
  cows: [1600, 3300],
  guard: { x: -5000 },
  soldiers: [],
  sign: { x: -5000 },
  tower: { x: -5000 },
  towers: [
    { x: 1250, y: 372, c: -1.5, r: 0.8, sp: 0.36, ph: 0.4 }, // Elm St water tower
    { x: 2450, y: 330, c: -1.6, r: 0.85, sp: 0.4, ph: 2.6 }, // church steeple on the square
    { x: 3650, y: 372, c: -1.6, r: 0.8, sp: 0.38, ph: 4.2 }, // Main St water tower
  ],
  fence: 4200,
  exitX: 4300,
  truckStops: [-900, -900],
  energyStart: 0.12,
  energyMinExit: 0.15,
  feedGain: [0.45, 0.3],
  failExposure: 2.2,
  wakeRate: 0.7, // per second of feeding on the other street (full wake ~1.5 s of feeding)
  wakeHold: 18, // seconds an awake street stays up
  wakeFade: 5,
  watchY: 230, // over an awake street, below this (lower on screen) you're seen ...
  watchWarn: 1.4, // ... this long (gasps + pointing) before a spotlight locks
};
export const TOWN_CLOUDS = [
  { x: 320, y: 165, w: 600, h: 190, seed: 315, kind: "cumulus", drift: 45 },
  { x: 1600, y: 180, w: 560, h: 190, seed: 323, kind: "cumulus", drift: 35 }, // over Elm St's backyard
  { x: 2450, y: 120, w: 700, h: 150, seed: 351, kind: "cumulus", drift: 50 }, // high over the square (waiting cloud)
  { x: 1000, y: 100, w: 700, h: 110, seed: 357, kind: "flat", drift: 70 },
  { x: 3300, y: 180, w: 560, h: 190, seed: 333, kind: "cumulus", drift: 35 }, // over Main St's backyard
  { x: 4000, y: 150, w: 520, h: 170, seed: 367, kind: "cumulus", drift: 50 },
  { x: 4800, y: 168, w: 760, h: 230, seed: 341, kind: "cumulus", count: 52, drift: 40 }, // the dark fields
];

// ------------------------------------------------------------------ Level 6: Rodeo Fairground (Game King sandbox)
// Fairground under bright bulbs in fog. Left -> right: car park, midway (ferris wheel, tents, bulb strings),
// the BAIT (a cow alone in a soft warm cone: too bright, too still), the rodeo arena (the real feed, under
// sweeping floodlights), the stock yards, the dark fields. Scout the bait (hover near it, high) and it shows as a
// decoy. Drop on it and the trap springs: relay clack + bulbs stutter (1.3 s warning), then the floodlights snap on.
export const RODEO = {
  ...A51,
  lockFeedMul: 1, brushFeedMul: 1, noticedFeedMul: 1, awayCheck: null, seenFeedHunt: null, lateFeedAt: null, feedSeconds: 2.4, // level 1 only
  W: 5200,
  hangar: { x0: -3000, x1: -2900, roof: -1000, door: -2900 }, // no hangar
  start: { x: 320, y: 170 },
  checkpoint0: { x: 320, y: 170 },
  checkpoint1: { x: 3250, y: 185 }, // staging cloud beside the arena
  pen: { x0: 3270, x1: 3540 }, // rodeo arena
  cows: [3330, 3470],
  guard: { x: 3720 },
  bait: { x: 2150 },
  baitScoutR: 300, // hover within this (horizontally) ...
  baitScoutY: 300, // ... above this line (higher on screen) ...
  baitScoutT: 1.5, // ... this long to see it's a decoy
  baitTrigR: 110, // low over it (or feeding on it) springs the trap
  baitTrigY: 300,
  baitWarn: 1.3, // relay clack + bulbs stutter, then the floodlights snap on
  baitFloodR: 1100, // towers this close swing straight onto the bait
  soldiers: [{ x: 1300, dir: 1 }, { x: 2600, dir: -1 }, { x: 3900, dir: 1 }, { x: 4300, dir: -1 }],
  soldierSee: 460,
  sign: { x: -5000 },
  tower: { x: -5000 },
  towers: [
    { x: 1500, y: 372, c: -1.6, r: 0.8, sp: 0.38, ph: 0.4 },
    { x: 2700, y: 366, c: -1.5, r: 0.8, sp: 0.4, ph: 2.6 },
    { x: 2950, y: 360, c: -1.8, r: 0.8, sp: 0.42, ph: 3.9 },
    { x: 3950, y: 362, c: -1.35, r: 0.82, sp: 0.44, ph: 5.0 },
    { x: 4400, y: 372, c: -1.6, r: 0.8, sp: 0.46, ph: 1.2 },
  ],
  fence: 4600,
  exitX: 4700,
  truckStops: [4100, 4500],
  energyStart: 0.12,
  energyMinExit: 0.15,
  feedGain: [0.42, 0.28],
  failExposure: 2.0,
};
export const RODEO_CLOUDS = [
  { x: 320, y: 165, w: 600, h: 190, seed: 215, kind: "cumulus", drift: 45 },
  { x: 1150, y: 150, w: 560, h: 170, seed: 233, kind: "cumulus", drift: 55 },
  { x: 2050, y: 115, w: 620, h: 140, seed: 251, kind: "cumulus", drift: 45 }, // over the bait (scouting perch)
  { x: 1700, y: 100, w: 700, h: 110, seed: 257, kind: "flat", drift: 70 },
  { x: 3250, y: 185, w: 560, h: 190, seed: 223, kind: "cumulus", drift: 40 }, // staging over the arena
  { x: 3550, y: 262, w: 360, h: 90, seed: 291, kind: "flat", drift: 40 },
  { x: 4150, y: 160, w: 560, h: 170, seed: 267, kind: "cumulus", drift: 50 },
  { x: 5000, y: 168, w: 760, h: 230, seed: 241, kind: "cumulus", count: 52, drift: 40 }, // dark fields
];

// ------------------------------------------------------------------ Level 7: Suburb Backyards (Game King sandbox)
// A row of dark houses and backyards. The houses LOOK asleep, but bedroom windows hide phones. A phone screen
// glows on (l7StingPhoneGlow) and tips up toward the sky for ~1.4 s (the warning), then films: a pale cone of
// view straight up. Inside that cone and out of thick cloud, exposure builds and you're caught in ~2 s.
// Phones also wake when you feed nearby (the cow's noise), ~1.6 s into the feed. After filming, a phone is
// dead for a while. Lesson: dark houses aren't safe; watch the windows, feed when the near phones are spent.
export const SUBURB = {
  ...A51,
  lockFeedMul: 1, brushFeedMul: 1, noticedFeedMul: 1, awayCheck: null, seenFeedHunt: null, lateFeedAt: null, feedSeconds: 2.4, // level 1 only
  W: 5000,
  hangar: { x0: -3000, x1: -2900, roof: -1000, door: -2900 },
  start: { x: 320, y: 170 },
  checkpoint0: { x: 320, y: 170 },
  checkpoint1: { x: 1500, y: 180 },
  pen: { x0: -4000, x1: -3900 }, // no searchlight pen heat here
  cows: [1500, 3400],
  yards: [1500, 3400],
  guard: { x: -5000 },
  soldiers: [],
  sign: { x: -5000 },
  tower: { x: -5000 },
  towers: [{ x: -4000, y: 372, c: -1.6, r: 0.5, sp: 0.3, ph: 0 }], // no searchlights on this street
  fence: 4300,
  exitX: 4400,
  truckStops: [-900, -900],
  energyStart: 0.12,
  energyMinExit: 0.15,
  feedGain: [0.45, 0.3],
  failExposure: 2.2,
  // phones: x of each bedroom window; first wake after `first` s, then every gapMin..gapMax
  phones: [
    { x: 900, first: 9 }, { x: 1350, first: 30 }, { x: 1650, first: 50 }, { x: 2300, first: 16 },
    { x: 2800, first: 24 }, { x: 3250, first: 40 }, { x: 3600, first: 60 }, { x: 4050, first: 20 },
  ],
  phoneGapMin: 14,
  phoneGapMax: 22,
  phoneWarn: 1.4, // screen glows + tips up: the warning
  phoneFilm: 4.0,
  phoneDead: 12, // after filming, spent this long
  phoneCone: 0.6, // half-angle (radians) of the view cone, pointing straight up (+120 px at the window)
  phoneFeedWake: 1.6, // feeding within phoneFeedR this long wakes the nearest live phone
  phoneFeedR: 420,
};
export const SUBURB_CLOUDS = [
  { x: 320, y: 165, w: 600, h: 190, seed: 415, kind: "cumulus", drift: 45 },
  { x: 1500, y: 180, w: 560, h: 190, seed: 423, kind: "cumulus", drift: 35 }, // over yard 1
  { x: 2450, y: 130, w: 640, h: 160, seed: 451, kind: "cumulus", drift: 45 }, // mid-street hide
  { x: 1000, y: 100, w: 700, h: 110, seed: 457, kind: "flat", drift: 70 },
  { x: 3400, y: 180, w: 560, h: 190, seed: 433, kind: "cumulus", drift: 35 }, // over yard 2
  { x: 4000, y: 150, w: 520, h: 170, seed: 467, kind: "cumulus", drift: 50 },
  { x: 4800, y: 168, w: 760, h: 230, seed: 441, kind: "cumulus", count: 52, drift: 40 },
];

// ------------------------------------------------------------------ Level 8: Power Station (Game King sandbox)
// Chain-link, transformers, yard lights. Your presence costs: within `interR` of a yard lamp the radios crackle
// (l8StingRadioScream) and the lamp stutters for `interWarn` s (the warning); stay and the lamp locks to full
// flood and the yard crew look up (alerted for `alertHold` s). Inside an alerted lamp's lit pool, out of thick
// cloud, you're caught in ~2 s. Brushing a transformer arcs (l8StingArcFlash) and alerts every lamp near it.
// Lesson: pick the dark path (high, through cloud, between the lamps).
export const POWER = {
  ...A51,
  lockFeedMul: 1, brushFeedMul: 1, noticedFeedMul: 1, awayCheck: null, seenFeedHunt: null, lateFeedAt: null, feedSeconds: 2.4, // level 1 only
  W: 5800,
  hangar: { x0: -3000, x1: -2900, roof: -1000, door: -2900 },
  start: { x: 320, y: 170 },
  checkpoint0: { x: 320, y: 170 },
  checkpoint1: { x: 1300, y: 180 },
  pen: { x0: -4000, x1: -3900 },
  cows: [1300, 3300],
  guard: { x: -5000 },
  soldiers: [],
  sign: { x: -5000 },
  tower: { x: -5000 },
  towers: [{ x: -4000, y: 372, c: -1.6, r: 0.5, sp: 0.3, ph: 0 }],
  yard: { x0: 1700, x1: 4150 },
  lamps: [1850, 2250, 2650, 3000, 3600, 3950],
  transformers: [2050, 2450, 2820, 3780],
  lampH: 130, // lamp head above the ground
  interR: 280, // presence radius around a lamp head
  interWarn: 0.75, // v28: was 1.05 (craft 1.8x v26 crossed the pool before it lit); crackle + stutter before it locks to full flood (v27: was 1.3; the faster craft crossed the pool before it lit)
  alertHold: 7,
  poolR: 220, // lit pool half-width ...
  poolY: 230, // ... and it reaches up to this height (y below this line is lit)
  arcR: 120, // this close to a transformer = arc flash
  fence: 4900,
  exitX: 5000,
  truckStops: [-900, -900],
  energyStart: 0.12,
  energyMinExit: 0.15,
  feedGain: [0.45, 0.3],
  failExposure: 1.5, // v28: was 1.8; v27: was 2.2 (the faster craft spends ~20% less time crossing a lit pool)
};
export const POWER_CLOUDS = [
  { x: 320, y: 165, w: 600, h: 190, seed: 515, kind: "cumulus", drift: 45 },
  { x: 1300, y: 180, w: 560, h: 190, seed: 523, kind: "cumulus", drift: 35 }, // over the outer field
  { x: 2300, y: 110, w: 700, h: 130, seed: 551, kind: "cumulus", drift: 45 }, // high over the yard
  { x: 3300, y: 180, w: 520, h: 180, seed: 533, kind: "cumulus", drift: 35 }, // the dark gap between lamps
  { x: 4500, y: 150, w: 600, h: 170, seed: 567, kind: "cumulus", drift: 50 },
  { x: 5500, y: 168, w: 760, h: 230, seed: 541, kind: "cumulus", count: 52, drift: 40 },
];

// ------------------------------------------------------------------ Level 9: Army Convoy (Game King sandbox)
// A ridge road. A convoy of trucks with roof searchlights patrols it; more trucks are parked with their lights
// sweeping; soldiers look up and point (no combat) and pointing makes the convoy TURN and hunt toward you
// (l9StingConvoyTurns). Three paddocks below the ridge. You need Energy >= exitEnergy to leave: bank 2 feeds.
export const CONVOY = {
  ...A51,
  lockFeedMul: 1, brushFeedMul: 1, noticedFeedMul: 1, awayCheck: null, seenFeedHunt: null, lateFeedAt: null, feedSeconds: 2.4, // level 1 only
  W: 6000,
  hangar: { x0: -3000, x1: -2900, roof: -1000, door: -2900 },
  start: { x: 320, y: 170 },
  checkpoint0: { x: 320, y: 170 },
  checkpoint1: { x: 1500, y: 180 },
  pen: { x0: 1350, x1: 1650 }, // moved to the nearest paddock every frame
  cows: [1500, 3000, 4500],
  guard: { x: -5000 },
  soldiers: [{ x: 1150, dir: 1 }, { x: 1950, dir: -1 }, { x: 2600, dir: 1 }, { x: 3450, dir: -1 }, { x: 3900, dir: 1 }, { x: 4900, dir: -1 }, { x: 5300, dir: 1 }],
  soldierSee: 480,
  sign: { x: -5000 },
  tower: { x: -5000 },
  towers: [ // parked trucks with roof lights (low mounts)
    { x: 1100, y: 470, c: -1.57, r: 1.2, sp: 0.3, ph: 0.4 },
    { x: 2250, y: 470, c: -1.57, r: 1.2, sp: 0.3, ph: 2.6 },
    { x: 3850, y: 470, c: -1.57, r: 1.2, sp: 0.32, ph: 4.0 }, // v22: was 3550 (stood over the 3000 paddock exit)
    { x: 5050, y: 470, c: -1.57, r: 1.2, sp: 0.34, ph: 1.3 },
  ],
  patrols: [[700, 2400], [2400, 4000], [3800, 5500]], // moving trucks shuttle along these stretches
  patrolSpeed: 110,
  huntSpeed: 200,
  fence: 5600,
  exitX: 5700,
  truckStops: [0, 0],
  energyStart: 0.12,
  energyMinExit: 0.6, // bank two feeds for the finale
  feedGain: [0.32, 0.3, 0.28],
  failExposure: 1.6, // v21 (was 2.0): the army hunts hard: once locked you have less time (A51 2.8)
  brushTrack: 2.0, // v21: a brushing beam follows a fast low flyer (rad/s; default 0.18)
  penHeatBase: 0.35, // paddocks are watched (A51 0.3)
  penHeatFacing: 1.0,
};
export const CONVOY_CLOUDS = [
  { x: 320, y: 165, w: 600, h: 190, seed: 615, kind: "cumulus", drift: 45 },
  { x: 1500, y: 180, w: 560, h: 190, seed: 623, kind: "cumulus", drift: 35 },
  { x: 2250, y: 135, w: 950, h: 190, seed: 651, kind: "cumulus", drift: 45 },
  { x: 3000, y: 180, w: 560, h: 190, seed: 633, kind: "cumulus", drift: 35 },
  { x: 3750, y: 135, w: 950, h: 190, seed: 657, kind: "cumulus", drift: 45 },
  { x: 4500, y: 180, w: 560, h: 190, seed: 643, kind: "cumulus", drift: 35 },
  { x: 5200, y: 130, w: 600, h: 150, seed: 667, kind: "cumulus", drift: 45 },
  { x: 900, y: 115, w: 620, h: 150, seed: 671, kind: "cumulus", drift: 40 }, // v22 high lane
  { x: 2650, y: 115, w: 620, h: 150, seed: 673, kind: "cumulus", drift: 40 },
  { x: 3350, y: 115, w: 560, h: 150, seed: 675, kind: "cumulus", drift: 40 },
  { x: 5500, y: 115, w: 560, h: 150, seed: 681, kind: "cumulus", drift: 40 },
  { x: 3650, y: 115, w: 560, h: 150, seed: 683, kind: "cumulus", drift: 40 }, // v23: one more high cloud between the 3000 and 4500 cows
  { x: 4150, y: 115, w: 620, h: 150, seed: 677, kind: "cumulus", drift: 40 },
  { x: 4850, y: 115, w: 620, h: 150, seed: 679, kind: "cumulus", drift: 40 },
  { x: 5900, y: 168, w: 760, h: 230, seed: 641, kind: "cumulus", count: 52, drift: 40 },
];

// ------------------------------------------------------------------ Level 10: Coast at Dawn (Game King sandbox)
// Last night on Earth. Clifftop farm road -> army camp -> the last paddock -> the shoreline. Dawn slowly
// brightens: cloud cover thins and soldiers see further. Feed under pressure, cross the shoreline, hide in the
// sea bank. Energy at the shore decides the ending: >= escapeEnergy = escape to space, less = captured.
export const COAST = {
  ...A51,
  lockFeedMul: 1, brushFeedMul: 1, noticedFeedMul: 1, awayCheck: null, seenFeedHunt: null, lateFeedAt: null, feedSeconds: 2.4, // level 1 only
  W: 5600,
  hangar: { x0: -3000, x1: -2900, roof: -1000, door: -2900 }, // no hangar on this level
  start: { x: 300, y: 170 },
  checkpoint0: { x: 300, y: 170 },
  checkpoint1: { x: 2760, y: 185 },
  pen: { x0: 2900, x1: 3250 },
  cows: [2960, 3070, 3180],
  guard: { x: 3320 },
  soldiers: [{ x: 700, dir: 1 }, { x: 1150, dir: -1 }, { x: 1500, dir: 1 }, { x: 1900, dir: -1 }, { x: 2300, dir: 1 }, { x: 2650, dir: -1 },
    { x: 3450, dir: 1 }, { x: 3800, dir: -1 }, { x: 4150, dir: 1 }, { x: 4500, dir: -1 }, { x: 4700, dir: 1 }],
  soldierSeeBase: 480,
  sign: { x: -5000 },
  tower: { x: -5000 },
  towers: [
    { x: 900, y: 372, c: -1.6, r: 0.8, sp: 0.4, ph: 0.4 },
    { x: 1750, y: 362, c: -1.4, r: 0.82, sp: 0.38, ph: 2.1 },
    { x: 2500, y: 366, c: -1.8, r: 0.8, sp: 0.42, ph: 3.9 },
    { x: 3450, y: 360, c: -1.5, r: 0.85, sp: 0.44, ph: 5.0 },
    { x: 4100, y: 368, c: -1.65, r: 0.8, sp: 0.46, ph: 1.2 },
    { x: 4700, y: 372, c: -1.45, r: 0.82, sp: 0.5, ph: 4.4 },
  ],
  fence: 4800, // the shoreline / cliff edge
  exitX: 4900,
  truckStops: [2350, 4350],
  energyStart: 0.2, // fallback when opened from the Levels menu
  carryCost: 0.35, carryMin: 0.2, carryMax: 0.45, // v20: start = level 9 Energy - 0.35, clamped (0.72 -> 0.37: one cow escapes)
  energyMinExit: 0, // you can always leave; the Energy check decides the ending
  escapeEnergy: 0.6, // two cows (0.2 + 0.3 + 0.25 = 0.75) = space; one cow (0.5) = captured
  feedGain: [0.3, 0.25, 0.2],
  burstCost: 0.02, climbCost: 0.004, // v21: a careful player who bails often must not bleed the Energy needed for space (A51 0.06 / 0.016)
  winHidden: 2.0,
  penHeatBase: 0.6, // same paddock heat as Area 51; dawn pressure comes from faster catches
  penHeatFacing: 1.0,
  failExposure: 1.6, // A51 2.8: once locked at dawn you are caught faster (warning before lock unchanged)
  dawnTime: 170, // seconds from first light to full dawn
  dawnThin: 0.3, // cloud cover lost at full dawn (thick cores still hide you)
  dawnSee: 0.5, // soldiers see this much further at full dawn
  feedSeconds: 1.4, // v24: 1.8 -> 1.4 so a careful feed finishes before the paddock sweep brushes it (v23: 5 of 8 careful runs stalled); v21 was 2.4 -> 1.8
};
export const COAST_CLOUDS = [
  { x: 300, y: 165, w: 600, h: 190, seed: 115, kind: "cumulus", drift: 45 }, // start cover
  { x: 1100, y: 140, w: 560, h: 170, seed: 133, kind: "cumulus", drift: 55 },
  { x: 1950, y: 160, w: 600, h: 180, seed: 151, kind: "cumulus", drift: 50 },
  { x: 1500, y: 100, w: 700, h: 110, seed: 157, kind: "flat", drift: 70 },
  { x: 2760, y: 185, w: 560, h: 190, seed: 123, kind: "cumulus", drift: 40 }, // staging over the paddock
  { x: 3150, y: 262, w: 360, h: 90, seed: 191, kind: "flat", drift: 40 }, // low risky ledge
  { x: 3700, y: 150, w: 600, h: 180, seed: 167, kind: "cumulus", drift: 55 },
  { x: 4400, y: 170, w: 520, h: 170, seed: 143, kind: "cumulus", drift: 50 },
  { x: 5250, y: 165, w: 800, h: 240, seed: 141, kind: "cumulus", count: 52, drift: 35 }, // the sea bank
];

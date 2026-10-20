// Boot, settings, menus, the frame loop and automatic quality scaling.
import { VH, LEVELS, LOCK_LEVELS, TUNE } from "./config.js?v=30";
import { loadImage, clamp } from "./util.js?v=30";
import { Game } from "./game.js?v=30";
import { Input } from "./input.js?v=30";
import { audio } from "./audio.js?v=30";
import { playInterlude } from "./interlude.js?v=30";

const $ = (id) => document.getElementById(id);
const KEY = "nh-settings-v1";
const DEFAULTS = { brightness: 1, music: 0.8, amb: 0.8, sfx: 0.9, quality: "auto", craft: "stalker", reducedFlash: false, reducedStings: false };

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const s = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof raw[k] === typeof DEFAULTS[k]) s[k] = raw[k];
    }
    s.brightness = clamp(Number(s.brightness) || 1, 0.7, 1.5);
    for (const k of ["music", "amb", "sfx"]) s[k] = clamp(Number(s[k]), 0, 1);
    if (!["auto", "lite", "low", "medium", "high"].includes(s.quality)) s.quality = "auto";
    if (!["stalker", "raider"].includes(s.craft)) s.craft = "stalker";
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}
const PKEY = "nh-progress-v1";
const TKEY = "nh-tut-v1"; // v28: "done" once the level 1 tutorial is finished or skipped
const tutDone = () => { try { return localStorage.getItem(TKEY) === "done"; } catch { return false; } };
const setTutDone = (on) => { try { on ? localStorage.setItem(TKEY, "done") : localStorage.removeItem(TKEY); } catch { /* private mode */ } };
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const starStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PKEY) || "{}");
    // v28: best stars per level ({ "1": 0..3 }); anything else is ignored
    const stars = {};
    if (p.stars && typeof p.stars === "object") for (const k of Object.keys(p.stars)) if (/^\d+$/.test(k) && [0, 1, 2, 3].includes(p.stars[k])) stars[k] = p.stars[k];
    return { beaten: Array.isArray(p.beaten) ? p.beaten.filter((n) => typeof n === "number") : [], stars };
  } catch {
    return { beaten: [], stars: {} };
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

const isTouch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0 || matchMedia("(pointer: coarse)").matches;
if (isTouch) document.body.classList.add("touch");

async function boot() {
  const settings = loadSettings();
  const trees = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((i) => loadImage(`img/tree${i}.png`)));
  const canvas = $("c");
  const game = new Game(canvas, trees, settings);
  const input = new Input($("wrap"));
  game.setCraft(settings.craft);
  audio.setLevels({ music: settings.music, amb: settings.amb, sfx: settings.sfx });
  audio.reducedStings = settings.reducedStings;
  audio.setMusic("calm");
  // Gamer Girl menu fear pack (MENU-FEAR-PASS.md)
  ["menu_open", "menu_piano", "menu_sting_1", "menu_sting_2", "heartbeat_loop"].forEach((n) => audio.warm(n));
  let menuScareDone = false;
  let menuHeartTimer = 0;
  const stopMenuHeart = () => { audio.menuHeart = 0; };
  const playMenuScare = () => {
    if (menuScareDone || game.mode !== "menu") return;
    menuScareDone = true;
    // Prefer the layered one-shot; otherwise stem sequence (piano → sting_1 @0.85 → sting_2 @1.55)
    if (audio.has("menuOpen")) {
      audio.fx("menuOpen", { gain: 0.95 });
    } else if (audio.has("menuPiano")) {
      audio.fx("menuPiano", { gain: 0.95 }); // one piano hit only
      if (audio.has("menuSting")) {
        // v11: only if still on the menu (tapping Start fast used to land these stings in the hangar)
        setTimeout(() => game.mode === "menu" && audio.fx("menuSting", { gain: 0.85 }), 850);
        setTimeout(() => game.mode === "menu" && audio.fx("menuSting", { gain: 0.8 }), 1550);
      }
    }
    // As the open dies (~2.3 s): start heartbeat_loop under the menu and keep it running
    clearTimeout(menuHeartTimer);
    menuHeartTimer = setTimeout(() => {
      if (game.mode === "menu" && audio.has("heartbeat")) audio.menuHeart = 1;
    }, 2300);
  };
  // First tap unlocks audio; if we're on the menu, install fear
  const armMenuScare = () => { if (game.mode === "menu") playMenuScare(); };
  ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
    window.addEventListener(ev, armMenuScare, { once: true, passive: true })
  );

  // ------------------------------------------------------------ quality and sizing
  const Q = { lite: -1, low: 0, medium: 1, high: 2 }; // v17: Lite tier for old iPhones/iPads
  // v24: effects tier (q) and resolution are separate. Auto starts at HIGH effects and full device sharpness, and a
  // phone that truly struggles gives up effects first, then resolution, and only reaches Lite at the very end.
  //   auto ladder: step 0 high fx @ full DPR (max 3) -> 1 medium fx @ full -> 2 medium @ 2x -> 3 low @ 1.5x
  //                -> 4 low @ 1x -> 5 Lite @ 0.7x (v25: same resolution as forced Lite)
  const LADDER = [[2, 3], [1, 3], [1, 2], [0, 1.5], [0, 1], [-1, 0.7]];
  // v25 (Mr Bug Fixit): likely-slow phones start auto at step 2 (medium @ 2x) so the first seconds aren't choppy.
  // iOS: judged by OS version only (older than iOS 16 = older hardware); Safari's core count isn't reliable.
  // Others: few cores or little memory. Newer phones still start at step 0 (High, full sharpness).
  const likelySlow = (() => {
    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios) {
      const m = ua.match(/OS (\d+)_/) || ua.match(/Version\/(\d+)/);
      return !!m && +m[1] < 16;
    }
    const hc = navigator.hardwareConcurrency || 8;
    const dm = navigator.deviceMemory || 8;
    return (window.devicePixelRatio || 1) >= 2 && isTouch && (hc <= 4 || dm <= 3);
  })();
  let step = settings.quality === "auto" && likelySlow ? 2 : 0;
  let firstCheck = true;
  let q = settings.quality === "auto" ? LADDER[step][0] : Q[settings.quality];
  let autoUps = 0;
  const pixelRatio = () => {
    const d = window.devicePixelRatio || 1;
    if (settings.quality === "auto") {
      const cap = LADDER[step][1];
      return cap < 1 ? Math.min(d, 1) * cap : Math.min(d, cap);
    }
    return q >= 2 ? Math.min(d, 3) : q >= 1 ? Math.min(d, 2) : q >= 0 ? Math.min(d, 1.5) : Math.min(d, 1) * 0.7;
  };
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = pixelRatio();
    const cw = Math.round(w * pr);
    const ch = Math.round(h * pr);
    // v13 perf: only touch the backing store when it really changes (setting width clears + reallocates)
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const s = canvas.height / VH;
    game.resize(canvas.width / s, s);
    $("rotate").classList.toggle("hidden", !(isTouch && h > w));
  };
  const applyQuality = (nq) => {
    q = clamp(nq, -1, 2);
    game.setQuality(q);
    resize();
  };
  const applyStep = (ns) => {
    step = clamp(ns, 0, LADDER.length - 1);
    applyQuality(LADDER[step][0]);
  };
  applyQuality(q);
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));

  // ------------------------------------------------------------ UI
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  let settingsFrom = "menu";
  let paused = false;
  const calib = () => {
    // the swatch gets roughly the same lift the game applies, so "just visible" means calibrated
    const b = settings.brightness;
    $("calibSym").style.filter = b >= 1 ? `brightness(${1 + (b - 1) * 4})` : `brightness(${Math.max(0.15, 1 - (1 - b) * 1.7)})`;
  };
  const syncSettingsUI = () => {
    setTimeout(calib, 0);
    $("sBright").value = settings.brightness;
    $("sMusic").value = settings.music;
    $("sAmb").value = settings.amb;
    $("sSfx").value = settings.sfx;
    $("sQuality").value = settings.quality;
    $("sCraft").value = settings.craft;
    $("sFlash").checked = settings.reducedFlash;
    $("sStings").checked = settings.reducedStings;
  };
  const onSetting = () => {
    settings.brightness = Number($("sBright").value);
    calib();
    settings.music = Number($("sMusic").value);
    settings.amb = Number($("sAmb").value);
    settings.sfx = Number($("sSfx").value);
    settings.reducedFlash = $("sFlash").checked;
    settings.reducedStings = $("sStings").checked;
    settings.craft = $("sCraft").value === "raider" ? "raider" : "stalker";
    game.setCraft(settings.craft);
    const nq = $("sQuality").value;
    if (nq !== settings.quality) {
      settings.quality = nq;
      if (nq !== "auto") applyQuality(Q[nq]);
      else (autoUps = 0), (firstCheck = true), applyStep(likelySlow ? 2 : 0);
    }
    audio.setLevels({ music: settings.music, amb: settings.amb, sfx: settings.sfx });
    audio.reducedStings = settings.reducedStings;
    saveSettings(settings);
  };
  for (const id of ["sBright", "sMusic", "sAmb", "sSfx", "sQuality", "sCraft", "sFlash", "sStings"]) {
    $(id).addEventListener("input", onSetting);
    $(id).addEventListener("change", onSetting);
  }
  const openSettings = (from) => {
    settingsFrom = from;
    syncSettingsUI();
    show("menu", false);
    show("pause", false);
    show("settings", true);
  };
  $("btnSettings").onclick = () => openSettings("menu");
  $("btnPSettings").onclick = () => openSettings("pause");
  $("btnBack").onclick = () => {
    show("settings", false);
    show(settingsFrom, true);
  };
  const progress = loadProgress();
  const ALL = /[?&]all\b/.test(location.search);
  // Area 51 and Quiet Farm are always open; Storm Farm stays locked while it's a work in progress (?all opens it)
  const unlocked = (n) => {
    const L = LEVELS.find((l) => l.id === n);
    if (!L) return false;
    if (ALL || !LOCK_LEVELS) return true;
    if (L.wip) return false;
    return n <= 2 || progress.beaten.includes(n - 1);
  };
  const syncLevels = () => {
    for (const L of LEVELS) {
      const b = document.querySelector(`#levels .lvl[data-level="${L.id}"]`);
      if (!b) continue;
      const open = unlocked(L.id);
      b.classList.toggle("locked", !open);
      $("lvlTag" + L.id).textContent = progress.beaten.includes(L.id) ? "taken" : !open ? (L.wip ? "soon" : "locked") : L.id === 1 ? "new" : "";
      const st = $("lvlStars" + L.id);
      if (st) st.textContent = open && progress.stars[L.id] ? starStr(progress.stars[L.id]) : ""; // v28
    }
  };
  const touchy = () => input.touchUsed || isTouch;
  game.touchy = touchy;
  let a51Hint = "";
  let a51HintT = 0;
  const setHint = () => {
    if (game.isMod) {
      a51Hint = game.mod.hint;
      a51HintT = 0;
      $("hint").textContent = a51Hint;
      return;
    }
    if (game.L.highway) {
      $("hint").textContent = touchy()
        ? "Lightning gives you away  ·  stay in cloud when the sky goes quiet  ·  trucks are hunting"
        : "Lightning gives you away  ·  stay in cloud when the sky goes quiet  ·  SPACE feed  ·  SHIFT burst";
      return;
    }
    if (game.L.storm) {
      $("hint").textContent = touchy()
        ? "Storm  ·  when the wind dies, get into the big dark cloud"
        : "Storm  ·  when the wind dies, get into the big dark cloud  ·  SPACE feed  ·  SHIFT burst";
      return;
    }
    $("hint").textContent = touchy()
      ? "Hide in cloud  ·  hold FEED over the cow  ·  BURST back to cover"
      : "WASD / arrows drift  ·  hold SPACE to feed  ·  SHIFT burst  ·  P pause";
  };
  let level = 1;
  const start = (lv, opts = {}) => {
    if (typeof lv === "number") level = lv;
    show("levels", false);
    show("menu", false);
    show("end", false);
    show("pause", false);
    show("hud", true);
    paused = false;
    input.enabled = true;
    input.releaseAll();
    setHint();
    $("hint").style.opacity = "1";
    stopMenuHeart();
    game.startPlay(level);
    setHint();
    // v26 (Mr Bug Fixit): likely-slow phones start the farm levels (2-4, heaviest scenery) at step 4 (low @ 1x);
    // leaving the farms puts back the usual step-2 start if the ladder is still where the farm put it
    if (settings.quality === "auto") {
      const L = LEVELS.find((l) => l.id === level) || {};
      if (likelySlow && L.kind === "farm" && step < 4) applyStep(4), (farmBump = true);
      else if (farmBump && L.kind !== "farm" && step === 4) applyStep(2), (farmBump = false);
      openN = -1; // the first frame after a start carries the level build time, so the opening check skips it
      openSlow = 0;
      acc = 0;
      accN = 0;
    }
    $("hud").classList.toggle("a51", game.isMod);
    show("energy", false);
    eVis = null; // v11: re-sync the Energy HUD from scratch on every start
    show("btnNext", false);
    // v28: per-attempt tracker (checkpoint restarts don't reset it), Get Ready card, level 1 tutorial
    run.t = 0;
    run.fails = 0;
    run.locks = 0;
    run.won = false;
    tutBegin();
    showReady(opts.short);
  };
  const toMenu = () => {
    endReady(true);
    tutHide();
    tut = null;
    menuScareDone = false;
    stopMenuHeart();
    // Re-arm first-tap scare for the next visit to the menu
    const rearm = () => { if (game.mode === "menu") playMenuScare(); };
    ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
      window.addEventListener(ev, rearm, { once: true, passive: true })
    );
    paused = false;
    input.enabled = false;
    input.releaseAll();
    show("pause", false);
    show("end", false);
    show("hud", false);
    show("levels", false);
    show("energy", false);
    eVis = null;
    show("menu", true);
    audio.setPaused(false);
    game.toMenu();
  };
  const setPaused = (p) => {
    if (game.mode !== "play" && p) return;
    paused = p;
    input.releaseAll();
    show("pause", p);
    show("settings", false);
    audio.setPaused(p);
  };
  $("btnStart").onclick = () => { game.carryFrom = null; start(1); };
  $("btnAgain").onclick = () => start(level, { short: true });
  $("btnNext").onclick = () => {
    if (!unlocked(level + 1)) return;
    const from = level;
    show("end", false);
    game.carryFrom = from; // v20: level 10 reads level 9 Energy only on this path
    playInterlude(from, () => start(from + 1)); // v19: short scene between levels (tap skips)
  };
  $("btnLevels").onclick = () => {
    syncLevels();
    show("menu", false);
    show("levels", true);
  };
  $("btnLvlBack").onclick = () => {
    show("levels", false);
    show("menu", true);
  };
  for (const b of document.querySelectorAll("#levels .lvl")) b.onclick = () => { game.carryFrom = null; unlocked(+b.dataset.level) && start(+b.dataset.level); };
  $("btnEndMenu").onclick = toMenu;
  $("btnMenu").onclick = toMenu;
  $("btnResume").onclick = () => setPaused(false);
  $("btnRestart").onclick = () => {
    setPaused(false);
    game.resetEncounter(false);
  };
  $("btnPause").onclick = () => setPaused(true);
  document.addEventListener("visibilitychange", () => document.hidden && game.mode === "play" && setPaused(true));

  const stats = { frames: 0, times: [], work: [], log: [], q: () => q };
  game.onEvent = (e) => {
    stats.log.push([Math.round(game.gt * 10) / 10, e]);
    if (e === "fail") run.fails++;
    if (e.startsWith("spotted")) run.locks++;
    tutEvent(e);
    if (e === "fail") {
      $("seen").textContent = game.isMod ? "Caught." : "Seen.";
      show("seen", true);
      input.releaseAll();
    }
    if (e === "restarted") show("seen", false);
    if (e === "storm-warn" && game.L.storm && game.st.n === 0) {
      // first storm: one reminder as the wind turns
      $("hint").textContent = "The wind is turning  ·  get to the big dark cloud";
      $("hint").style.opacity = "1";
      game.hintT = 6;
    }
    if (e === "win") {
      input.enabled = false;
      const lv = game.level;
      if (!progress.beaten.includes(lv)) progress.beaten.push(lv), saveProgress(progress);
      // v28 stars: 1 finished, 2 never caught, 3 never caught and within par; level 10's captured ending caps at 1
      const LL = LEVELS.find((l) => l.id === lv) || {};
      const captured = LL.kind === "coast" && game.coast && game.coast.ending === "captured";
      let stars = 1;
      if (!captured && run.fails === 0) stars = LL.par && run.t <= LL.par ? 3 : 2;
      const prevStars = progress.stars[lv] || 0;
      if (stars > prevStars) (progress.stars[lv] = stars), saveProgress(progress);
      const secs = Math.round(run.t);
      const nf = run.fails;
      let miss = captured
        ? "Taken. Space needs more Energy."
        : nf > 0
        ? `Caught ${nf === 1 ? "once" : nf === 2 ? "twice" : nf + " times"}.`
        : stars < 3
        ? `Too slow: ${secs} s / par ${LL.par} s.`
        : `${secs} s.${run.locks === 0 ? " Unseen." : ""}`;
      if (stars > prevStars && prevStars > 0) miss += "  Best.";
      run.won = true;
      run.result = { stars, secs, fails: nf, prev: prevStars }; // read by tests
      setTimeout(() => {
        if (game.mode !== "win" || game.level !== lv) return; // v28: left for the menu / another level in the meantime
        const L = LEVELS.find((l) => l.id === lv) || {};
        const end = L.kind === "coast" && game.coast ? game.coast.ending : null;
        const T = { a51: "Out.", town: "Quiet again.", rodeo: "Not fooled.", suburb: "No signal.", power: "Static.", convoy: "Through." };
        const TX = {
          town: "One by one the porch lights go out. By morning, the whole town will swear it was a dream.",
          rodeo: "Behind you the bulbs keep burning over a cow that was never there. Next time, they'll try something smarter.",
          suburb: "Somewhere a phone uploads eleven seconds of black sky. Nobody will believe it.",
          power: "The radios hiss for an hour after it's gone. The night shift logs it as a fault on line four.",
          convoy: "Behind you the convoy idles on the ridge, lights still sweeping empty cloud. Ahead, the first grey over the sea.",
        };
        $("endTitle").textContent = end === "space" ? "Free." : end === "captured" ? "Taken." : T[L.kind] || "Gone.";
        $("endText").textContent =
          end === "space"
            ? "The sun comes up over an empty sea. High above it, something dark slips out past the last cloud and keeps going."
            : end === "captured"
            ? "Too weak to climb. The lights close in from every side, and the sea goes quiet. They have you now."
            : TX[L.kind]
            ? TX[L.kind]
            : L.kind === "a51"
            ? "The base is still screaming behind you. Somewhere out there, a farm is asleep."
            : L.highway
              ? "The trucks roll on toward town. Nobody looked up."
              : L.storm
              ? "The storm closes over the farm. Nothing saw it leave."
              : "The night closes over the farm.";
        show("btnNext", !end && unlocked(lv + 1));
        const sEl = $("endStars").children;
        for (let i = 0; i < 3; i++) {
          sEl[i].classList.remove("on");
          if (i < stars) setTimeout(() => sEl[i].classList.add("on"), 400 + i * 300);
        }
        $("endMiss").textContent = miss;
        show("hud", false);
        show("end", true);
      }, 3200);
    }
    if (!game.isMod && (e === "harvested" || e.startsWith("spotted"))) $("hint").style.opacity = "0";
  };

  // ------------------------------------------------------------ Area 51 HUD: the hint follows the level's state, the Energy bar
  let eShown = -1;
  let eLow = null;
  let eVis = null;
  let eGainT = 0;
  let ePendW = "";
  const syncA51 = (dt) => {
    const a = game.mod;
    if (a.hint !== a51Hint) {
      a51Hint = a.hint;
      a51HintT = 0;
      $("hint").textContent = a51Hint;
    }
    a51HintT += dt;
    $("hint").style.opacity = a51Hint && game.mode === "play" && a51HintT < 9 ? "1" : "0";
    const vis = !!a.barVisible && game.mode !== "menu";
    if (vis !== eVis) show("energy", (eVis = vis));
    if (!vis) return;
    const e = clamp(a.energyShown, 0, 1);
    if (Math.abs(e - eShown) > 0.002) {
      if (e > eShown + 0.01 && eShown >= 0) eGainT = 0.5;
      eShown = e;
      $("efill").style.width = (e * 100).toFixed(1) + "%";
      $("epct").textContent = Math.round(e * 100) + "%";
    }
    // v11: faint preview of the Energy the animal you're drawing up will give (lands only when it's taken)
    const pend = clamp(a.energyPending || 0, 0, 1 - e);
    const pw = (pend * 100).toFixed(1) + "%";
    const pl = (e * 100).toFixed(1) + "%";
    if (pw + pl !== ePendW) {
      ePendW = pw + pl;
      $("epend").style.left = pl;
      $("epend").style.width = pw;
      $("epend").style.display = pend > 0.002 ? "block" : "none";
    }
    eGainT -= dt;
    $("energy").classList.toggle("gain", eGainT > 0);
    const low = a.energy < 0.2;
    if (low !== eLow) $("energy").classList.toggle("low", (eLow = low));
  };

  // ------------------------------------------------------------ v13 EMP readout
  let empTxt = "";
  const syncEmp = () => {
    const cd = Math.ceil(game.empCool || 0);
    const txt = cd > 0 ? String(cd) : "EMP";
    if (txt !== empTxt) {
      if (txt === "EMP" && empTxt && empTxt !== "EMP" && game.mode === "play") audio.fx("empReady", { gain: 0.6 });
      empTxt = txt;
      $("btnEmp").textContent = txt;
      $("btnEmp").classList.toggle("cool", cd > 0);
      $("empStat").textContent = cd > 0 ? `EMP ${cd}s` : "EMP ready · Q";
    }
  };

  // ------------------------------------------------------------ v28 Get Ready card
  let ready = null; // { t, min, changed, lastStep, stable, skip }
  const showReady = (short) => {
    const L = LEVELS.find((l) => l.id === level) || {};
    $("readyNum").textContent = ROMAN[level] || "";
    $("readyName").textContent = L.name || "";
    $("readyHook").textContent = short ? "" : L.hook || "";
    const el = $("ready");
    el.style.transition = "none"; // appear at full black at once (no fade-in from the last card's fade-out)
    el.classList.remove("fade");
    show("ready", true);
    void el.offsetWidth;
    el.style.transition = "";
    input.enabled = false;
    input.releaseAll();
    ready = { t: 0, t0: performance.now(), last: performance.now(), min: short ? 0.8 : 1.5, changed: false, lastStep: step, stable: 0, skip: false, win0: winCount };
  };
  const endReady = (instant) => {
    if (!ready && !instant) return;
    const was = !!ready;
    ready = null;
    const el = $("ready");
    if (instant) return show("ready", false);
    el.classList.add("fade");
    setTimeout(() => !ready && show("ready", false), 480);
    if (was && game.mode === "play" && !paused) (input.enabled = true), input.releaseAll();
  };
  const tickReady = () => {
    const R = ready;
    const now = performance.now(); // wall clock: slow frames must not shorten the card
    const rdt = (now - R.last) / 1000;
    R.last = now;
    R.t = (now - R.t0) / 1000;
    if (step !== R.lastStep) (R.lastStep = step), (R.changed = true), (R.stable = 0);
    else R.stable += rdt;
    // a quality change during the card holds it until the ladder has settled for 0.5 s (cap 2.5 s)
    // on auto, a device that looks slow during the card (avg frame > 24 ms) also waits for the first 2 s quality
    // window to be judged, so the choppy opening and any drop to Lite happen behind the card (same 2.5 s cap)
    const looksSlow = settings.quality === "auto" && accN >= 4 && acc / accN > 24;
    const judged = !looksSlow || winCount > R.win0;
    const settled = ((!R.changed || R.stable >= 0.5) && judged) || R.t >= 2.5;
    if ((R.t >= R.min && settled) || (R.skip && R.t >= 0.6)) endReady();
  };
  const readySkip = () => { if (ready && (performance.now() - ready.t0) / 1000 >= 0.6) endReady(); else if (ready) ready.skip = true; };
  $("ready").addEventListener("pointerdown", (e) => { e.preventDefault(); readySkip(); });
  window.addEventListener("keydown", (e) => { if (ready && !e.repeat) readySkip(); });

  // ------------------------------------------------------------ v28 level 1 tutorial (state-driven, never pauses)
  let tut = null; // { step, want, shown, hidT, harvT, brushed, t }
  const TUT = {
    1: () => "They're looking for you. Get into the cloud.",
    2: () => "The pen. Wait for the lights to turn away… then drop.",
    3: () => (touchy() ? "Hold FEED. Don't let go." : "Hold SPACE. Don't let go."),
    4: () => (touchy() ? "A light has you. EMP. Kill it." : "A light has you. EMP. Kill it. Press Q."),
    5: () => "Now run. Past the fence. Into the dark.",
  };
  const tutShow = (n) => {
    tut.shown = n;
    tut.t = 0;
    $("tutText").textContent = TUT[n]();
    $("tut").classList.toggle("flick", n === 4);
    $("tut").classList.remove("off");
  };
  const tutHide = () => $("tut").classList.add("off");
  const tutBegin = () => {
    tutHide();
    tut = level === 1 && !tutDone() ? { step: 1, shown: 0, armed: false, hidT: 0, harvT: -1, brushed: false, t: 0 } : null;
  };
  const tutNext = () => {
    tutHide();
    tut.shown = 0;
    tut.step++;
    if (tut.step > 5) tutFinish();
  };
  const tutFinish = () => {
    tutHide();
    tut = null;
    setTutDone(true);
  };
  const tutEvent = (e) => {
    if (!tut) return;
    if (e === "a51-out") tut.armed = true;
    if (e === "harvested") tut.harvT = 0;
    if (e === "a51-brush") tut.brushed = true;
    if (e === "emp" && tut.step === 4) tutNext();
    if (e === "win") tutFinish();
    if (e === "fail") tutHide(), (tut.shown = 0); // keep the step; it re-shows after the restart
  };
  const tutTick = (dt) => {
    if (!tut || game.mode !== "play" || !game.isMod || game.level !== 1) return;
    const a = game.mod;
    const c = game.creature;
    const C = a.C || {};
    if (tut.harvT >= 0) tut.harvT += dt;
    tut.t += dt;
    const hidden = (a.occ || 0) >= 0.62;
    const cow = a.feedTarget ? a.feedTarget() : null;
    const nearCow = !!cow && Math.abs(c.x - cow.x) < TUNE.feedRangeX + 80; // feedTarget() is just the nearest cow
    // skip ahead if the player is already past a step (e.g. drops straight onto the cow without hiding first)
    if (tut.step <= 2 && tut.armed && nearCow && c.y > TUNE.dangerLowY) (tut.step = 3), tutHide(), (tut.shown = 0);
    if (tut.step === 3 && !tut.shown && a.harvested) tut.step = 4;
    const s = tut.step;
    if (!tut.shown) {
      // when each prompt appears
      const pen = C.pen ? C.pen.x0 : 2700;
      const want =
        s === 1 ? tut.armed
        : s === 2 ? hidden && Math.abs(c.x - pen) < 500
        : s === 3 ? nearCow
        : s === 4 ? (tut.brushed || tut.harvT >= 3) && !(game.empCool > 0)
        : s === 5 ? !!a.harvested && a.energy >= (C.energyMinExit || 0)
        : false;
      if (want) tutShow(s);
    } else {
      // when it goes away
      if (s === 1) tut.hidT = hidden ? tut.hidT + dt : 0;
      const done =
        s === 1 ? tut.hidT >= 1
        : s === 2 ? c.y > TUNE.dangerLowY
        : s === 3 ? !!a.harvested
        : s === 4 ? tut.t >= 6
        : s === 5 ? c.x > (C.fence || 5760)
        : true;
      if (done) tutNext();
    }
    if (tut && tut.shown) $("hint").style.opacity = "0"; // never stack with the level hint
  };
  $("tutSkip").addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); if (tut) tutFinish(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tut && tut.shown) {
      input.pauseQueued = false; // Esc skips the tutorial instead of pausing while a prompt shows
      tutFinish();
    }
  });
  $("btnTutAgain").onclick = () => {
    setTutDone(false);
    $("btnTutAgain").textContent = "Tutorial will show on level 1";
  };
  const run = { t: 0, fails: 0, locks: 0, won: false, result: null };

  // ------------------------------------------------------------ loop
  let last = performance.now();
  let acc = 0;
  let accN = 0;
  let goodFor = 0;
  let badFor = 0;
  let openN = 3; // v26: opening frames seen this level (3 = check done)
  let openSlow = 0;
  let farmBump = false;
  let winCount = 0; // v28: auto-quality windows judged so far (the Get Ready card waits for one on slow devices)
  const frame = (now) => {
    const raw = now - last;
    last = now;
    const dt = Math.min(raw / 1000, 1 / 20);
    if (ready) {
      // v28 Get Ready card: the world is frozen (no update), but it renders and the quality checks below keep running
      input.takePause();
      input.takeRestart();
      tickReady();
    } else {
      if (input.takePause()) setPaused(!paused);
      if (input.takeRestart() && game.mode === "play") game.resetEncounter(false);
    }
    if (!paused && !ready) {
      game.update(dt, input);
      if (game.mode === "play" && !run.won) run.t += dt;
      if (game.isMod && game.mode !== "menu") syncA51(dt);
      else if (game.mode === "play" && game.hintT > 12) $("hint").style.opacity = "0";
      tutTick(dt);
    }
    syncEmp();
    const t0 = performance.now();
    game.render();
    const work = performance.now() - t0;
    stats.frames++;
    stats.times.push(raw);
    if (stats.times.length > 600) stats.times.shift();
    // automatic quality (v24): only step down on SUSTAINED slow frames (two slow 2 s windows in a row), one ladder
    // step at a time (effects go before resolution); step back up after ~8 s of clear headroom (at most 3 times)
    // v26: if the first 3 frames of a level each take over 150 ms, go straight to Lite instead of waiting for the windows
    if (settings.quality === "auto" && openN < 3 && game.mode === "play" && !paused) {
      if (openN >= 0 && raw > 150) openSlow++;
      openN++;
      if (openN === 3 && openSlow === 3 && step < LADDER.length - 1) {
        applyStep(LADDER.length - 1);
        acc = 0;
        accN = 0;
        badFor = 0;
        firstCheck = false;
      }
    }
    // v26: slow frames now count (was raw < 250, so a 3-4 fps phone took ~4 s to fill the 2 s window);
    // only gaps over 1 s (tab switch, resume from background) are left out
    if (settings.quality === "auto" && raw < 1000) {
      acc += raw;
      accN++;
      if (accN >= 120 || acc > 2000) {
        const avg = acc / accN;
        const wl = stats.work.slice(-accN);
        const wAvg = wl.reduce((a, b) => a + b, 0) / Math.max(1, wl.length);
        // v13 kept: a steady ~30 fps with light render work is iOS Low Power Mode's cap, not a slow device.
        // Real overload shows as heavy render work, or frames well under 30 fps (GPU-bound canvas hides work time).
        const slow = avg > 24 && (wAvg > 8 || avg > 40);
        if (slow) {
          badFor++;
          goodFor = 0;
          if ((badFor >= 2 || avg > 40) && step < LADDER.length - 1) {
            // a ~10 fps device skips a rung; v25: the very first check may skip two (choppy opening seconds)
            applyStep(step + (avg > 90 ? (firstCheck ? 3 : 2) : avg > 60 && firstCheck ? 2 : 1));
            badFor = 0;
          }
        } else if (avg < 15) {
          badFor = 0;
          goodFor++;
          if (goodFor >= 4 && step > 0 && autoUps < 3) {
            autoUps++;
            applyStep(step - 1);
            goodFor = 0;
          }
        } else (goodFor = 0), (badFor = 0);
        acc = 0;
        accN = 0;
        firstCheck = false;
        winCount++;
      }
    }
    stats.lastWork = work;
    stats.work = stats.work || [];
    stats.work.push(work);
    if (stats.work.length > 600) stats.work.shift();
  };
  // v16: one bad frame (an exception in update/render) used to stop the rAF loop for good, freezing the
  // game. Keep the loop alive, log once, and recover from a non-finite craft position by restarting.
  let frameErrs = 0;
  const safeFrame = (now) => {
    requestAnimationFrame(safeFrame);
    try {
      frame(now);
    } catch (e) {
      if (frameErrs++ < 3) console.error("frame error", e);
      const c = game.creature;
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(game.camX)) {
        try { game.resetEncounter(game.mode === "menu"); } catch { /* ignore */ }
      }
    }
  };
  requestAnimationFrame(safeFrame);
  window.__nh = { game, input, audio, stats, settings, start, toMenu, setPaused, applyQuality, applyStep, get qStep() { return step; }, likelySlow, progress, run, get ready() { return ready; }, get tut() { return tut; } };
}

boot();

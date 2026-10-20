// v30 (Gamer Girl): Music / Sound effects on-off switches. Self-contained: injects its own style and two small icon
// toggles into the main menu and the pause panel (top-right corner, never on the play HUD, so steering is untouched).
// The logic lives in audio.js (setMusicOn / setSfxOn, saved in localStorage); this only draws and taps.
const NOTE = '<path d="M9 17.5V5.2l10-2v11.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
  '<ellipse cx="6.6" cy="17.6" rx="2.6" ry="2" fill="currentColor"/><ellipse cx="16.6" cy="15" rx="2.6" ry="2" fill="currentColor"/>';
const SPEAKER = '<path d="M3.5 9h3.6L12 5v14l-4.9-4H3.5z" fill="currentColor"/>' +
  '<path class="w" d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
const SLASH = '<path class="x" d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
const CSS = `
.nh-snd { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right));
  display: flex; gap: 6px; z-index: 5; pointer-events: auto; }
#menu .nh-snd button.nh-snd-b, #pause .nh-snd button.nh-snd-b, .nh-snd button.nh-snd-b {
  width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0; margin: 0; letter-spacing: 0;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(8, 10, 12, 0.35); border: 1px solid rgba(190, 198, 208, 0.18);
  color: rgba(200, 208, 216, 0.82); text-shadow: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
  transition: color 0.2s, opacity 0.2s, border-color 0.2s; }
.nh-snd button.nh-snd-b svg { width: 22px; height: 22px; display: block; pointer-events: none; }
.nh-snd button.nh-snd-b .x { display: none; }
.nh-snd button.nh-snd-b.off { color: rgba(150, 156, 164, 0.5); border-color: rgba(190, 198, 208, 0.08); }
.nh-snd button.nh-snd-b.off .x { display: inline; }
.nh-snd button.nh-snd-b.off .w { display: none; }
.nh-snd button.nh-snd-b:active, .nh-snd button.nh-snd-b.down { background: rgba(60, 68, 76, 0.45); color: #fff; }
`;
function button(kind, audio) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "nh-snd-b";
  b.dataset.snd = kind;
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (kind === "music" ? NOTE : SPEAKER) + SLASH + "</svg>";
  const tap = (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {
      /* old event */
    }
    // a real tap also unlocks iOS audio (audio.js listens in the capture phase), so turning sound ON plays at once
    if (kind === "music") audio.setMusicOn(!audio.musicOn);
    else audio.setSfxOn(!audio.sfxOn);
    refreshAll(audio);
  };
  b.addEventListener("click", tap);
  return b;
}
function refreshAll(audio) {
  const list = document.querySelectorAll(".nh-snd-b");
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const on = b.dataset.snd === "music" ? audio.musicOn : audio.sfxOn;
    b.classList.toggle("off", !on);
    const label = (b.dataset.snd === "music" ? "Music " : "Sound effects ") + (on ? "on" : "off");
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.title = label;
  }
}
export function mountSoundUI(audio) {
  const go = () => {
    try {
      if (!document.getElementById("nhSndCss")) {
        const st = document.createElement("style");
        st.id = "nhSndCss";
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      ["menu", "pause"].forEach((id) => {
        const panel = document.getElementById(id);
        if (!panel || panel.querySelector(".nh-snd")) return;
        const box = document.createElement("div");
        box.className = "nh-snd";
        box.appendChild(button("music", audio));
        box.appendChild(button("sfx", audio));
        panel.appendChild(box);
      });
      refreshAll(audio);
      document.addEventListener("nh-sound", () => refreshAll(audio));
    } catch {
      /* never let the switches break the game */
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
}

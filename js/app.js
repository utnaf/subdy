import { clamp, buildNoteIcon, pickRandom, advanceBeatState } from "./logic.js";

(() => {
  "use strict";

  const SUBDIVISIONS = [
    { id: "quarters", label: "Quarti", perBeat: 1, notation: { count: 1, beams: 0, tuplet: null } },
    { id: "quarter-triplets", label: "Terzine di quarti", perBeat: 1.5, notation: { count: 3, beams: 0, tuplet: 3 } },
    { id: "eighths", label: "Ottavi", perBeat: 2, notation: { count: 2, beams: 1, tuplet: null } },
    { id: "eighth-triplets", label: "Terzine di ottavi", perBeat: 3, notation: { count: 3, beams: 1, tuplet: 3 } },
    { id: "sixteenths", label: "Sedicesimi", perBeat: 4, notation: { count: 4, beams: 2, tuplet: null } },
    { id: "quintuplets", label: "Quintine", perBeat: 5, notation: { count: 5, beams: 2, tuplet: 5 } },
    { id: "sextuplets", label: "Sestine", perBeat: 6, notation: { count: 6, beams: 2, tuplet: 6 } },
    { id: "septuplets", label: "Settimine", perBeat: 7, notation: { count: 7, beams: 2, tuplet: 7 } },
    { id: "thirtyseconds", label: "Trentaduesimi", perBeat: 8, notation: { count: 8, beams: 3, tuplet: null } },
  ];

  const DEFAULT_ENABLED = ["quarters", "eighths", "sixteenths"];

  SUBDIVISIONS.forEach(sub => {
    sub.icon = buildNoteIcon(sub.notation);
    // How many beats one full repeat of this subdivision spans — 1 for
    // everything except quarter-note triplets (3 notes over 2 beats).
    sub.cycleBeats = sub.notation.count / sub.perBeat;
  });

  const els = {
    playBtn: document.getElementById("playBtn"),
    playBtnLabel: document.getElementById("playBtnLabel"),
    tapBtn: document.getElementById("tapBtn"),
    bpmInput: document.getElementById("bpmInput"),
    bpmRange: document.getElementById("bpmRange"),
    bpmDown: document.getElementById("bpmDown"),
    bpmUp: document.getElementById("bpmUp"),
    beatsInput: document.getElementById("beatsInput"),
    barsInput: document.getElementById("barsInput"),
    display: document.getElementById("display"),
    barDots: document.getElementById("barDots"),
    nowIcon: document.getElementById("nowIcon"),
    nowName: document.getElementById("nowName"),
    nextBlock: document.getElementById("nextBlock"),
    nextIcon: document.getElementById("nextIcon"),
    nextName: document.getElementById("nextName"),
    subdivisionsList: document.getElementById("subdivisionsList"),
    subdivisionsMeta: document.getElementById("subdivisionsMeta"),
    subdivisionClickToggle: document.getElementById("subdivisionClickToggle"),
    hint: document.getElementById("hint"),
  };

  // ---- Settings persistence (localStorage) ----

  const STORAGE_KEY = "subdy:settings";

  function loadStoredSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        bpm,
        beatsPerBar,
        barsPerChange,
        subdivisions: [...enabled],
        subdivisionClickEnabled,
      }));
    } catch {
      // localStorage unavailable (private mode, quota, ...) — non-fatal
    }
  }

  const stored = loadStoredSettings();

  if (stored) {
    if (Number.isFinite(stored.bpm)) {
      els.bpmInput.value = stored.bpm;
      els.bpmRange.value = stored.bpm;
    }
    if (Number.isFinite(stored.beatsPerBar)) els.beatsInput.value = stored.beatsPerBar;
    if (Number.isFinite(stored.barsPerChange) && [1, 2, 4, 8].includes(stored.barsPerChange)) {
      els.barsInput.value = String(stored.barsPerChange);
    }
  }

  let subdivisionClickEnabled = !!(stored && stored.subdivisionClickEnabled);
  els.subdivisionClickToggle.checked = subdivisionClickEnabled;
  els.subdivisionClickToggle.addEventListener("change", () => {
    subdivisionClickEnabled = els.subdivisionClickToggle.checked;
    saveSettings();
  });

  const storedSubdivisions = stored && Array.isArray(stored.subdivisions)
    ? stored.subdivisions.filter(id => SUBDIVISIONS.some(s => s.id === id))
    : [];

  const enabled = new Set(storedSubdivisions.length ? storedSubdivisions : DEFAULT_ENABLED);

  function buildSubdivisionList() {
    SUBDIVISIONS.forEach(sub => {
      const tile = document.createElement("label");
      tile.className = "subdiv-tile";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "subdiv-tile__input";
      cb.checked = enabled.has(sub.id);
      cb.dataset.id = sub.id;
      cb.addEventListener("change", () => {
        if (cb.checked) enabled.add(sub.id);
        else enabled.delete(sub.id);
        updateSubdivisionsMeta();
        validateSelection();
        saveSettings();
      });

      const icon = document.createElement("span");
      icon.className = "subdiv-tile__icon";
      icon.innerHTML = sub.icon;

      const name = document.createElement("span");
      name.className = "subdiv-tile__name";
      name.textContent = sub.label;

      tile.appendChild(cb);
      tile.appendChild(icon);
      tile.appendChild(name);
      els.subdivisionsList.appendChild(tile);
    });
  }

  function updateSubdivisionsMeta() {
    els.subdivisionsMeta.textContent = `${enabled.size} selezionate`;
  }

  function validateSelection() {
    if (enabled.size === 0) {
      els.hint.textContent = "Seleziona almeno una suddivisione per iniziare.";
      return false;
    }
    els.hint.textContent = "";
    return true;
  }

  buildSubdivisionList();
  updateSubdivisionsMeta();
  validateSelection();

  // ---- Metronome engine ----

  let audioCtx = null;
  let masterGain = null;
  let isPlaying = false;
  let schedulerId = null;
  let nextNoteTime = 0;

  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.12;
  const DEFAULT_CLICK_VOLUME = 0.6;

  let bpm = clamp(parseInt(els.bpmInput.value, 10), 30, 300);
  let beatsPerBar = clamp(parseInt(els.beatsInput.value, 10), 1, 12);
  let barsPerChange = parseInt(els.barsInput.value, 10);

  let beatInBar = 0;
  let barInBlock = 0;
  let currentTarget = null;
  let nextTarget = null;
  let nextRevealed = false;

  const uiQueue = [];

  function pickNext(avoidId) {
    return pickRandom(SUBDIVISIONS.filter(s => enabled.has(s.id)), avoidId);
  }

  const CLICK_SOUNDS = {
    downbeat: { type: "square", freq: 1500, peak: 1 },
    quarter: { type: "square", freq: 1000, peak: 1 },
    subdivision: { type: "triangle", freq: 2200, peak: 0.6 },
  };

  function playClick(time, kind) {
    const { type, freq, peak } = CLICK_SOUNDS[kind];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  function scheduleBeat(time) {
    const result = advanceBeatState(
      { beatInBar, barInBlock, currentTarget, nextTarget, nextRevealed },
      { beatsPerBar, barsPerChange, pickNext }
    );

    const isDownbeat = result.isDownbeat;
    currentTarget = result.current;
    nextTarget = result.state.nextTarget;
    nextRevealed = result.state.nextRevealed;

    // The quarter pulse always plays, every beat.
    playClick(time, isDownbeat ? "downbeat" : "quarter");

    // On the first bar of a block, optionally layer the subdivision's own
    // notes on top as an audible reference — skipping the note that lands
    // on the beat itself, since the quarter click above already covers it.
    if (subdivisionClickEnabled && barInBlock === 0 && currentTarget) {
      const cycleBeats = currentTarget.cycleBeats;
      if (beatInBar % cycleBeats === 0 && beatInBar + cycleBeats <= beatsPerBar) {
        const secondsPerBeat = 60.0 / bpm;
        const notes = currentTarget.notation.count;
        const cycleDuration = cycleBeats * secondsPerBeat;
        for (let i = 1; i < notes; i++) {
          playClick(time + (i * cycleDuration) / notes, "subdivision");
        }
      }
    }

    uiQueue.push({
      time,
      beatInBar,
      beatsPerBar,
      isDownbeat,
      current: currentTarget,
      next: result.next,
    });

    beatInBar = result.state.beatInBar;
    barInBlock = result.state.barInBlock;
  }

  function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleBeat(nextNoteTime);
      nextNoteTime += 60.0 / bpm;
    }
    schedulerId = setTimeout(scheduler, LOOKAHEAD_MS);
  }

  let dotsBuilt = 0;
  function ensureDots(n) {
    if (dotsBuilt === n) return;
    els.barDots.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const dot = document.createElement("span");
      if (i === 0) dot.classList.add("downbeat");
      els.barDots.appendChild(dot);
    }
    dotsBuilt = n;
  }

  function renderFrame() {
    if (!audioCtx) {
      requestAnimationFrame(renderFrame);
      return;
    }
    const now = audioCtx.currentTime;
    let latest = null;
    while (uiQueue.length && uiQueue[0].time <= now) {
      latest = uiQueue.shift();
    }
    if (latest) {
      ensureDots(latest.beatsPerBar);
      [...els.barDots.children].forEach((dot, i) => {
        dot.classList.toggle("active", i === latest.beatInBar);
      });

      if (latest.current) {
        els.nowIcon.innerHTML = latest.current.icon;
        els.nowName.textContent = latest.current.label;
      }

      if (latest.next) {
        els.nextIcon.innerHTML = latest.next.icon;
        els.nextName.textContent = latest.next.label;
        els.nextBlock.classList.add("visible");
      } else {
        els.nextBlock.classList.remove("visible");
      }

      if (latest.isDownbeat) {
        els.display.classList.add("display--flash");
        setTimeout(() => els.display.classList.remove("display--flash"), 90);
      }
    }
    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);

  // ---- Screen Wake Lock (keep the screen on while playing) ----

  let wakeLock = null;

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    if (wakeLock) wakeLock.release();
    wakeLock = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isPlaying && !wakeLock) {
      requestWakeLock();
    }
  });

  // ---- One-time Buy Me a Coffee prompt after 30 min of actual practice ----

  const PRACTICE_KEY = "subdy:practice";
  const PRACTICE_THRESHOLD_MS = 30 * 60 * 1000;

  function loadPracticeData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRACTICE_KEY));
      return {
        ms: parsed && Number.isFinite(parsed.ms) ? parsed.ms : 0,
        shown: !!(parsed && parsed.shown),
      };
    } catch {
      return { ms: 0, shown: false };
    }
  }

  function savePracticeData() {
    try {
      localStorage.setItem(PRACTICE_KEY, JSON.stringify(practiceData));
    } catch {
      // localStorage unavailable — non-fatal, prompt just won't persist
    }
  }

  function showBmcPrompt() {
    const card = document.createElement("div");
    card.className = "bmc-prompt";
    card.innerHTML = `
      <button type="button" class="bmc-prompt__close" aria-label="Chiudi">×</button>
      <p>Ciao! Ti rubo 1 minuto del tuo studio: ho costruito questo metronomo in primis per me stesso, e ho deciso di condividerlo con tutti quanti gratuitamente. Ma se ti piace e hai voglia di offrirmi una birra <a href="https://buymeacoffee.com/utnaf" target="_blank" rel="noopener">clicca pure qui</a>. Grazie e buono studio ;)</p>
    `;
    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add("bmc-prompt--visible"));
    card.querySelector(".bmc-prompt__close").addEventListener("click", () => card.remove());
  }

  const practiceData = loadPracticeData();
  let sessionStartedAt = null;

  // Debug/testing only: ?bmc=1 shows the prompt immediately, bypassing the
  // 30-minute threshold and the "already shown" flag.
  if (new URLSearchParams(window.location.search).has("bmc")) {
    showBmcPrompt();
  }

  function start() {
    if (isPlaying) return;
    if (!validateSelection()) return;

    window.scrollTo({ top: 0, behavior: "smooth" });
    sessionStartedAt = Date.now();

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = DEFAULT_CLICK_VOLUME;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();

    beatInBar = 0;
    barInBlock = 0;
    currentTarget = null;
    nextTarget = null;
    nextRevealed = false;
    uiQueue.length = 0;

    nextNoteTime = audioCtx.currentTime + 0.05;
    isPlaying = true;
    els.playBtnLabel.textContent = "■ Stop";
    els.playBtn.classList.add("is-playing");
    scheduler();
    requestWakeLock();
  }

  function stop() {
    if (!isPlaying) return;
    isPlaying = false;
    clearTimeout(schedulerId);
    els.playBtnLabel.textContent = "▶ Start";
    els.playBtn.classList.remove("is-playing");
    els.nowIcon.innerHTML = "";
    els.nowName.textContent = "pronto";
    els.nextBlock.classList.remove("visible");
    [...els.barDots.children].forEach(dot => dot.classList.remove("active"));
    uiQueue.length = 0;
    releaseWakeLock();

    if (sessionStartedAt !== null) {
      practiceData.ms += Date.now() - sessionStartedAt;
      sessionStartedAt = null;
      savePracticeData();
      if (!practiceData.shown && practiceData.ms >= PRACTICE_THRESHOLD_MS) {
        practiceData.shown = true;
        savePracticeData();
        showBmcPrompt();
      }
    }
  }

  function toggle() {
    if (isPlaying) stop();
    else start();
  }

  els.playBtn.addEventListener("click", toggle);

  document.addEventListener("keydown", e => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
      e.preventDefault();
      toggle();
    }
  });

  // ---- BPM controls ----

  function setBpm(v) {
    bpm = clamp(v, 30, 300);
    els.bpmInput.value = bpm;
    els.bpmRange.value = bpm;
    saveSettings();
  }

  els.bpmInput.addEventListener("input", () => setBpm(parseInt(els.bpmInput.value, 10)));
  els.bpmRange.addEventListener("input", () => setBpm(parseInt(els.bpmRange.value, 10)));
  els.bpmDown.addEventListener("click", () => setBpm(bpm - 1));
  els.bpmUp.addEventListener("click", () => setBpm(bpm + 1));

  let tapTimes = [];
  els.tapBtn.addEventListener("click", () => {
    const now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) {
      tapTimes = [];
    }
    tapTimes.push(now);
    if (tapTimes.length > 6) tapTimes.shift();
    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.round(60000 / avg));
    }
  });

  // ---- Beats / bars-per-change controls ----

  function resetBlockState() {
    beatInBar = 0;
    barInBlock = 0;
    nextTarget = null;
    nextRevealed = false;
  }

  els.beatsInput.addEventListener("change", () => {
    beatsPerBar = clamp(parseInt(els.beatsInput.value, 10), 1, 12);
    els.beatsInput.value = beatsPerBar;
    dotsBuilt = -1;
    if (isPlaying) resetBlockState();
    saveSettings();
  });

  els.barsInput.addEventListener("change", () => {
    barsPerChange = parseInt(els.barsInput.value, 10);
    if (isPlaying) resetBlockState();
    saveSettings();
  });

})();

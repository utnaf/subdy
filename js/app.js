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

  // ---- Stylized rhythm-notation icons (inline SVG, currentColor) ----

  function buildNoteIcon({ count, beams, tuplet }) {
    const W = 120, H = 64;
    const marginX = 16;
    const noteY = 46;
    const beamTopY = 14;
    const beamGap = 5.5;
    const stemX = x => x + 5.5;

    const xs = count === 1
      ? [W / 2 - 5.5]
      : Array.from({ length: count }, (_, i) => marginX + (i * (W - marginX * 2)) / (count - 1));

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="note-icon" aria-hidden="true">`;

    xs.forEach(x => {
      svg += `<line x1="${stemX(x)}" y1="${noteY - 2}" x2="${stemX(x)}" y2="${beamTopY}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`;
    });

    if (beams > 0 && xs.length > 1) {
      const x1 = stemX(xs[0]);
      const x2 = stemX(xs[xs.length - 1]);
      for (let b = 0; b < beams; b++) {
        svg += `<rect x="${x1}" y="${beamTopY + b * beamGap}" width="${x2 - x1}" height="3.6" rx="1" fill="currentColor"/>`;
      }
    }

    xs.forEach(x => {
      svg += `<ellipse cx="${x}" cy="${noteY}" rx="6.4" ry="4.7" fill="currentColor" transform="rotate(-18 ${x} ${noteY})"/>`;
    });

    if (tuplet) {
      const midX = (stemX(xs[0]) + stemX(xs[xs.length - 1])) / 2;
      if (beams > 0) {
        svg += `<text x="${midX}" y="${beamTopY - 4}" font-size="14" text-anchor="middle" fill="currentColor" font-style="italic" font-family="Georgia, serif">${tuplet}</text>`;
      } else {
        const x1 = xs[0], x2 = xs[xs.length - 1];
        const y = beamTopY;
        svg += `<line x1="${x1}" y1="${y + 6}" x2="${x1}" y2="${y}" stroke="currentColor" stroke-width="1.6"/>`;
        svg += `<line x1="${x1}" y1="${y}" x2="${midX - 7}" y2="${y}" stroke="currentColor" stroke-width="1.6"/>`;
        svg += `<line x1="${midX + 7}" y1="${y}" x2="${x2}" y2="${y}" stroke="currentColor" stroke-width="1.6"/>`;
        svg += `<line x1="${x2}" y1="${y}" x2="${x2}" y2="${y + 6}" stroke="currentColor" stroke-width="1.6"/>`;
        svg += `<text x="${midX}" y="${y + 4}" font-size="12" text-anchor="middle" fill="currentColor" font-style="italic" font-family="Georgia, serif">${tuplet}</text>`;
      }
    }

    svg += `</svg>`;
    return svg;
  }

  SUBDIVISIONS.forEach(sub => { sub.icon = buildNoteIcon(sub.notation); });

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
      }));
    } catch {
      // localStorage unavailable (private mode, quota, ...) — non-fatal
    }
  }

  const stored = loadStoredSettings();

  if (stored) {
    if (Number.isFinite(stored.bpm)) els.bpmInput.value = stored.bpm;
    if (Number.isFinite(stored.beatsPerBar)) els.beatsInput.value = stored.beatsPerBar;
    if (Number.isFinite(stored.barsPerChange) && [1, 2, 4, 8].includes(stored.barsPerChange)) {
      els.barsInput.value = String(stored.barsPerChange);
    }
  }

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

  function clamp(v, min, max) {
    if (Number.isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  }

  function pickRandom(avoidId) {
    const pool = SUBDIVISIONS.filter(s => enabled.has(s.id));
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    const filtered = pool.filter(s => s.id !== avoidId);
    const src = filtered.length ? filtered : pool;
    return src[Math.floor(Math.random() * src.length)];
  }

  function playClick(time, isDownbeat) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = isDownbeat ? 1500 : 1000;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  function scheduleBeat(time) {
    const isDownbeat = beatInBar === 0;
    const isFirstBeatOfBlock = isDownbeat && barInBlock === 0;
    const isLastBarOfBlock = barInBlock === barsPerChange - 1;

    if (isFirstBeatOfBlock) {
      currentTarget = nextTarget || pickRandom(currentTarget ? currentTarget.id : null);
      nextTarget = null;
      nextRevealed = false;
    }

    if (isDownbeat && isLastBarOfBlock && !nextRevealed) {
      nextTarget = pickRandom(currentTarget ? currentTarget.id : null);
      nextRevealed = true;
    }

    playClick(time, isDownbeat);

    uiQueue.push({
      time,
      beatInBar,
      beatsPerBar,
      isDownbeat,
      current: currentTarget,
      next: nextRevealed ? nextTarget : null,
    });

    beatInBar++;
    if (beatInBar >= beatsPerBar) {
      beatInBar = 0;
      barInBlock++;
      if (barInBlock >= barsPerChange) barInBlock = 0;
    }
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
    } catch (err) {
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

  function start() {
    if (isPlaying) return;
    if (!validateSelection()) return;

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

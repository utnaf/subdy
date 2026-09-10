(() => {
  "use strict";

  const SUBDIVISIONS = [
    { id: "quarters", label: "Quarti", symbol: "♩", group: "base", perBeat: 1 },
    { id: "eighths", label: "Ottavi", symbol: "♪ ♪", group: "base", perBeat: 2 },
    { id: "triplets", label: "Terzine", symbol: "♪♪♪³", group: "base", perBeat: 3 },
    { id: "sixteenths", label: "Sedicesimi", symbol: "♬", group: "base", perBeat: 4 },
    { id: "dotted-ei-si", label: "Ottavo punt. + sedicesimo", symbol: "♩. ♬", group: "esteso", perBeat: 2 },
    { id: "si-dotted-ei", label: "Sedicesimo + ottavo punt.", symbol: "♬ ♩.", group: "esteso", perBeat: 2 },
    { id: "quintuplets", label: "Quintine", symbol: "♪⁵", group: "esteso", perBeat: 5 },
    { id: "sextuplets", label: "Sestine", symbol: "♪⁶", group: "esteso", perBeat: 6 },
    { id: "septuplets", label: "Settimine", symbol: "♪⁷", group: "esteso", perBeat: 7 },
    { id: "thirtyseconds", label: "Trentaduesimi", symbol: "♬♬", group: "esteso", perBeat: 8 },
  ];

  const els = {
    playBtn: document.getElementById("playBtn"),
    tapBtn: document.getElementById("tapBtn"),
    bpmInput: document.getElementById("bpmInput"),
    bpmRange: document.getElementById("bpmRange"),
    bpmDown: document.getElementById("bpmDown"),
    bpmUp: document.getElementById("bpmUp"),
    beatsInput: document.getElementById("beatsInput"),
    barsInput: document.getElementById("barsInput"),
    volumeInput: document.getElementById("volumeInput"),
    display: document.getElementById("display"),
    barDots: document.getElementById("barDots"),
    nowSymbol: document.getElementById("nowSymbol"),
    nowName: document.getElementById("nowName"),
    nextBlock: document.getElementById("nextBlock"),
    nextName: document.getElementById("nextName"),
    listBase: document.getElementById("listBase"),
    listEsteso: document.getElementById("listEsteso"),
    toggleBase: document.getElementById("toggleBase"),
    toggleEsteso: document.getElementById("toggleEsteso"),
    hint: document.getElementById("hint"),
  };

  const enabled = new Set(SUBDIVISIONS.filter(s => s.group === "base").map(s => s.id));

  function buildSubdivisionLists() {
    SUBDIVISIONS.forEach(sub => {
      const container = sub.group === "base" ? els.listBase : els.listEsteso;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = enabled.has(sub.id);
      cb.dataset.id = sub.id;
      cb.addEventListener("change", () => {
        if (cb.checked) enabled.add(sub.id);
        else enabled.delete(sub.id);
        syncGroupToggle(sub.group);
        validateSelection();
      });
      const span = document.createElement("span");
      span.textContent = `${sub.symbol} ${sub.label}`;
      label.appendChild(cb);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function syncGroupToggle(group) {
    const ids = SUBDIVISIONS.filter(s => s.group === group).map(s => s.id);
    const checkedCount = ids.filter(id => enabled.has(id)).length;
    const toggle = group === "base" ? els.toggleBase : els.toggleEsteso;
    toggle.checked = checkedCount === ids.length;
    toggle.indeterminate = checkedCount > 0 && checkedCount < ids.length;
  }

  function setGroup(group, checked) {
    SUBDIVISIONS.filter(s => s.group === group).forEach(s => {
      if (checked) enabled.add(s.id);
      else enabled.delete(s.id);
    });
    const container = group === "base" ? els.listBase : els.listEsteso;
    container.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = checked; });
    validateSelection();
  }

  els.toggleBase.addEventListener("change", () => setGroup("base", els.toggleBase.checked));
  els.toggleEsteso.addEventListener("change", () => setGroup("esteso", els.toggleEsteso.checked));

  function validateSelection() {
    if (enabled.size === 0) {
      els.hint.textContent = "Seleziona almeno una suddivisione per iniziare.";
      return false;
    }
    els.hint.textContent = "";
    return true;
  }

  buildSubdivisionLists();
  validateSelection();

  // ---- Metronome engine ----

  let audioCtx = null;
  let masterGain = null;
  let isPlaying = false;
  let schedulerId = null;
  let nextNoteTime = 0;

  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.12;

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
        els.nowSymbol.textContent = latest.current.symbol;
        els.nowName.textContent = latest.current.label;
      }

      if (latest.next) {
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

  function start() {
    if (isPlaying) return;
    if (!validateSelection()) return;

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = parseFloat(els.volumeInput.value);
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
    els.playBtn.textContent = "■ Stop";
    els.playBtn.classList.add("is-playing");
    scheduler();
  }

  function stop() {
    if (!isPlaying) return;
    isPlaying = false;
    clearTimeout(schedulerId);
    els.playBtn.textContent = "▶ Start";
    els.playBtn.classList.remove("is-playing");
    els.nowSymbol.textContent = "—";
    els.nowName.textContent = "pronto";
    els.nextBlock.classList.remove("visible");
    [...els.barDots.children].forEach(dot => dot.classList.remove("active"));
    uiQueue.length = 0;
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
  });

  els.barsInput.addEventListener("change", () => {
    barsPerChange = parseInt(els.barsInput.value, 10);
    if (isPlaying) resetBlockState();
  });

  els.volumeInput.addEventListener("input", () => {
    if (masterGain) masterGain.gain.value = parseFloat(els.volumeInput.value);
  });

})();

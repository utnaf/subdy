// Pure logic, no DOM / Web Audio / localStorage — kept separate so it can
// be unit tested directly (see test/logic.test.js).

export function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// ---- Stylized rhythm-notation icon (inline SVG, currentColor) ----

export function buildNoteIcon({ count, beams, tuplet }) {
  const W = 120, H = 64;
  const marginX = 16;
  const noteY = 46;
  const beamTopY = 18;
  const beamGap = 5.5;

  // Shrink noteheads (and their stem attachment point) for dense groups
  // so they don't overlap — the default size only fits up to ~6 notes.
  const spacing = count > 1 ? (W - marginX * 2) / (count - 1) : Infinity;
  const rx = Math.min(6.4, spacing / 2 - 0.8);
  const ry = rx * 0.73;
  const stemOffset = rx * 0.86;
  const stemX = x => x + stemOffset;

  const xs = count === 1
    ? [W / 2 - stemOffset]
    : Array.from({ length: count }, (_, i) => marginX + (i * (W - marginX * 2)) / (count - 1));

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="note-icon" aria-hidden="true">`;

  xs.forEach(x => {
    svg += `<line x1="${stemX(x)}" y1="${noteY - 2}" x2="${stemX(x)}" y2="${beamTopY}" stroke="currentColor" stroke-width="2.4" stroke-linecap="butt"/>`;
  });

  if (beams > 0 && xs.length > 1) {
    const x1 = stemX(xs[0]);
    const x2 = stemX(xs[xs.length - 1]);
    for (let b = 0; b < beams; b++) {
      svg += `<rect x="${x1}" y="${beamTopY + b * beamGap}" width="${x2 - x1}" height="3.6" rx="1" fill="currentColor"/>`;
    }
  }

  xs.forEach(x => {
    svg += `<ellipse cx="${x}" cy="${noteY}" rx="${rx}" ry="${ry}" fill="currentColor" transform="rotate(-18 ${x} ${noteY})"/>`;
  });

  if (tuplet) {
    const midX = (stemX(xs[0]) + stemX(xs[xs.length - 1])) / 2;
    if (beams > 0) {
      svg += `<text x="${midX}" y="${beamTopY - 5}" font-size="14" text-anchor="middle" fill="currentColor" font-style="italic" font-family="Georgia, serif">${tuplet}</text>`;
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

// ---- Random subdivision pick, avoiding immediate repeats when possible ----

export function pickRandom(pool, avoidId) {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const filtered = pool.filter(s => s.id !== avoidId);
  const src = filtered.length ? filtered : pool;
  return src[Math.floor(Math.random() * src.length)];
}

// ---- Beat / bar / block advance state machine ----
//
// Given the current position in the beat/bar/block cycle, works out:
//  - whether the target subdivision should be (re)picked this beat
//  - whether the "next" subdivision should be revealed this beat
//  - the state to carry into the following beat
//
// `config.pickNext(avoidId)` is injected so this stays pure/testable —
// the caller decides how "random" actually resolves.
export function advanceBeatState(state, config) {
  const { beatInBar, barInBlock, currentTarget, nextTarget, nextRevealed } = state;
  const { beatsPerBar, barsPerChange, pickNext } = config;

  const isDownbeat = beatInBar === 0;
  const isFirstBeatOfBlock = isDownbeat && barInBlock === 0;
  const isLastBarOfBlock = barInBlock === barsPerChange - 1;

  let newCurrent = currentTarget;
  let newNext = nextTarget;
  let newRevealed = nextRevealed;

  if (isFirstBeatOfBlock) {
    newCurrent = newNext || pickNext(newCurrent ? newCurrent.id : null);
    newNext = null;
    newRevealed = false;
  }

  if (isDownbeat && isLastBarOfBlock && !newRevealed) {
    newNext = pickNext(newCurrent ? newCurrent.id : null);
    newRevealed = true;
  }

  let nextBeatInBar = beatInBar + 1;
  let nextBarInBlock = barInBlock;
  if (nextBeatInBar >= beatsPerBar) {
    nextBeatInBar = 0;
    nextBarInBlock++;
    if (nextBarInBlock >= barsPerChange) nextBarInBlock = 0;
  }

  return {
    isDownbeat,
    current: newCurrent,
    next: newRevealed ? newNext : null,
    state: {
      beatInBar: nextBeatInBar,
      barInBlock: nextBarInBlock,
      currentTarget: newCurrent,
      nextTarget: newNext,
      nextRevealed: newRevealed,
    },
  };
}

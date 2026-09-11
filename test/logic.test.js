import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { clamp, buildNoteIcon, pickRandom, advanceBeatState } from "../js/logic.js";

describe("clamp", () => {
  test("passes values already in range through unchanged", () => {
    assert.equal(clamp(50, 30, 300), 50);
  });

  test("clamps below the minimum", () => {
    assert.equal(clamp(10, 30, 300), 30);
  });

  test("clamps above the maximum", () => {
    assert.equal(clamp(500, 30, 300), 300);
  });

  test("NaN falls back to the minimum", () => {
    assert.equal(clamp(NaN, 30, 300), 30);
  });
});

describe("buildNoteIcon", () => {
  // The exact notations used by the app's SUBDIVISIONS list.
  const cases = [
    { name: "quarters", notation: { count: 1, beams: 0, tuplet: null } },
    { name: "quarter-triplets", notation: { count: 3, beams: 0, tuplet: 3 } },
    { name: "eighths", notation: { count: 2, beams: 1, tuplet: null } },
    { name: "eighth-triplets", notation: { count: 3, beams: 1, tuplet: 3 } },
    { name: "sixteenths", notation: { count: 4, beams: 2, tuplet: null } },
    { name: "quintuplets", notation: { count: 5, beams: 2, tuplet: 5 } },
    { name: "sextuplets", notation: { count: 6, beams: 2, tuplet: 6 } },
    { name: "septuplets", notation: { count: 7, beams: 2, tuplet: 7 } },
    { name: "thirtyseconds", notation: { count: 8, beams: 3, tuplet: null } },
  ];

  for (const { name, notation } of cases) {
    test(`${name}: produces valid SVG with no NaN`, () => {
      const svg = buildNoteIcon(notation);
      assert.match(svg, /^<svg viewBox="0 0 120 64"/);
      assert.doesNotMatch(svg, /NaN/);
    });

    test(`${name}: has one notehead per note`, () => {
      const svg = buildNoteIcon(notation);
      const ellipseCount = (svg.match(/<ellipse/g) || []).length;
      assert.equal(ellipseCount, notation.count);
    });

    test(`${name}: has one beam rect per beam`, () => {
      const svg = buildNoteIcon(notation);
      const rectCount = (svg.match(/<rect/g) || []).length;
      const expected = notation.beams > 0 && notation.count > 1 ? notation.beams : 0;
      assert.equal(rectCount, expected);
    });

    test(`${name}: shows the tuplet number when present`, () => {
      const svg = buildNoteIcon(notation);
      if (notation.tuplet) {
        assert.match(svg, new RegExp(`>${notation.tuplet}<`));
      } else {
        assert.doesNotMatch(svg, /<text/);
      }
    });
  }

  test("stems end flush with the beam (butt cap, not round)", () => {
    const svg = buildNoteIcon({ count: 2, beams: 1, tuplet: null });
    assert.match(svg, /stroke-linecap="butt"/);
    assert.doesNotMatch(svg, /stroke-linecap="round"/);
  });

  test("dense groups (7-8 notes) don't overlap: spacing exceeds notehead width", () => {
    const svg = buildNoteIcon({ count: 8, beams: 3, tuplet: null });
    const cxs = [...svg.matchAll(/<ellipse cx="([\d.]+)"/g)].map(m => Number(m[1]));
    const rx = Number(svg.match(/<ellipse cx="[\d.]+" cy="[\d.]+" rx="([\d.]+)"/)[1]);
    for (let i = 1; i < cxs.length; i++) {
      assert.ok(cxs[i] - cxs[i - 1] > rx * 2, `notes ${i - 1} and ${i} overlap`);
    }
  });
});

describe("pickRandom", () => {
  test("returns null for an empty pool", () => {
    assert.equal(pickRandom([], "x"), null);
  });

  test("returns the only item even if it's the one to avoid", () => {
    const only = { id: "a" };
    assert.equal(pickRandom([only], "a"), only);
  });

  test("never returns the avoided id when alternatives exist", () => {
    const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
    for (let i = 0; i < 200; i++) {
      const picked = pickRandom(pool, "a");
      assert.notEqual(picked.id, "a");
    }
  });

  test("can return any item when nothing needs avoiding", () => {
    const pool = [{ id: "a" }, { id: "b" }];
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(pickRandom(pool, "z").id);
    assert.deepEqual([...seen].sort(), ["a", "b"]);
  });
});

describe("advanceBeatState", () => {
  // Deterministic stand-in for pickRandom: hands out A, B, C, A, B, C, ...
  function sequencePicker(ids) {
    let i = 0;
    return () => ({ id: ids[i++ % ids.length] });
  }

  test("first beat ever promotes a target via pickNext(null)", () => {
    const pickNext = sequencePicker(["A", "B", "C"]);
    const state = { beatInBar: 0, barInBlock: 0, currentTarget: null, nextTarget: null, nextRevealed: false };
    const result = advanceBeatState(state, { beatsPerBar: 4, barsPerChange: 2, pickNext });

    assert.equal(result.isDownbeat, true);
    assert.equal(result.current.id, "A");
    assert.equal(result.next, null);
    assert.deepEqual(result.state, {
      beatInBar: 1, barInBlock: 0, currentTarget: { id: "A" }, nextTarget: null, nextRevealed: false,
    });
  });

  test("reveals the next target on the downbeat of the block's last bar", () => {
    const pickNext = sequencePicker(["A", "B", "C"]);
    let state = { beatInBar: 0, barInBlock: 0, currentTarget: null, nextTarget: null, nextRevealed: false };
    const config = { beatsPerBar: 2, barsPerChange: 2, pickNext };

    // beat 0 of bar 0 (of 2): promotes current to A.
    let result = advanceBeatState(state, config);
    state = result.state;
    assert.equal(state.currentTarget.id, "A");
    assert.equal(result.next, null);

    // beat 1 of bar 0: nothing special.
    result = advanceBeatState(state, config);
    state = result.state;
    assert.equal(result.next, null);
    assert.equal(state.barInBlock, 1);

    // beat 0 of bar 1 (last bar of the block): reveals next = B.
    result = advanceBeatState(state, config);
    state = result.state;
    assert.equal(result.current.id, "A");
    assert.equal(result.next.id, "B");
    assert.equal(state.nextRevealed, true);
  });

  test("a bar boundary alone doesn't promote or reveal anything", () => {
    const pickNext = sequencePicker(["A", "B", "C"]);
    const state = {
      beatInBar: 3, barInBlock: 0, currentTarget: { id: "A" }, nextTarget: null, nextRevealed: false,
    };
    const result = advanceBeatState(state, { beatsPerBar: 4, barsPerChange: 4, pickNext });

    assert.equal(result.current.id, "A");
    assert.equal(result.next, null);
    assert.deepEqual(result.state, {
      beatInBar: 0, barInBlock: 1, currentTarget: { id: "A" }, nextTarget: null, nextRevealed: false,
    });
  });

  test("on the next block, promotes the already-revealed target instead of picking a new one", () => {
    const pickNext = sequencePicker(["Z"]); // would be wrong if called again
    const state = {
      beatInBar: 0, barInBlock: 0, currentTarget: { id: "A" }, nextTarget: { id: "B" }, nextRevealed: true,
    };
    const result = advanceBeatState(state, { beatsPerBar: 4, barsPerChange: 2, pickNext });

    assert.equal(result.current.id, "B");
    assert.equal(result.state.nextTarget, null);
    assert.equal(result.state.nextRevealed, false);
  });

  test("barsPerChange = 1: promotion and reveal happen on the same beat", () => {
    const pickNext = sequencePicker(["A", "B", "C"]);
    let state = { beatInBar: 0, barInBlock: 0, currentTarget: null, nextTarget: null, nextRevealed: false };
    const config = { beatsPerBar: 4, barsPerChange: 1, pickNext };

    const result = advanceBeatState(state, config);
    assert.equal(result.current.id, "A");
    assert.equal(result.next.id, "B");
    assert.equal(result.state.nextRevealed, true);
  });

  test("beatInBar wraps into a new bar at beatsPerBar", () => {
    const pickNext = sequencePicker(["A"]);
    const state = {
      beatInBar: 2, barInBlock: 0, currentTarget: { id: "A" }, nextTarget: null, nextRevealed: false,
    };
    const result = advanceBeatState(state, { beatsPerBar: 3, barsPerChange: 4, pickNext });
    assert.equal(result.state.beatInBar, 0);
    assert.equal(result.state.barInBlock, 1);
  });

  test("barInBlock wraps back to 0 after the last bar of a block", () => {
    const pickNext = sequencePicker(["A", "B"]);
    const state = {
      beatInBar: 3, barInBlock: 1, currentTarget: { id: "A" }, nextTarget: { id: "B" }, nextRevealed: true,
    };
    const result = advanceBeatState(state, { beatsPerBar: 4, barsPerChange: 2, pickNext });
    assert.equal(result.state.beatInBar, 0);
    assert.equal(result.state.barInBlock, 0);
  });
});

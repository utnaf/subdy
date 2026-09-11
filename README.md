# subdy

A metronome built specifically for practicing rhythmic subdivisions. It keeps a normal quarter-note click, and ahead of time tells you which subdivision to play over the next block of bars.

No build step, no runtime dependencies: plain HTML, CSS and JS, made to run on GitHub Pages.

## How it works

- Set the tempo (BPM), beats per bar, and how many bars make up a block (1, 2, 4 or 8) before the required subdivision changes.
- Pick which subdivisions can be requested — quarters, quarter-note triplets, eighths, eighth-note triplets, sixteenths, quintuplets, sextuplets, septuplets, thirty-seconds — each toggled individually in a collapsible list. Defaults to quarters, eighths and sixteenths.
- Press Start (or hit space): the metronome clicks only the quarter notes (accented on beat one), while the screen shows the subdivision required "now" for the current block and, one bar ahead, the "next" one.
- Each subdivision is shown as a small stylized rhythm-notation icon (stem, beam(s), tuplet number where relevant), rendered as inline SVG — no image assets to load.

## Local development

Requires Node (see `.nvmrc`; `nvm use` picks the right version).

```bash
npm install
npm run dev
```

Then open `http://localhost:8000`.

## Testing

The pure logic (SVG icon generation, the beat/bar/block advance state machine, subdivision picking) lives in `js/logic.js`, separate from `js/app.js` — which handles the DOM, Web Audio, localStorage and Wake Lock — specifically so it can be unit tested without a browser:

```bash
npm test
```

Uses Node's built-in test runner (`node:test`), no extra dependency.

## Deploying to GitHub Pages

Repo: https://github.com/utnaf/subdy

1. Push to `main`.
2. Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/(root)`.
3. The app will be live at `https://utnaf.github.io/subdy/`.

# V2X Sandbox

An interactive, **single-file, fully-offline** tool for learning how
Vehicle-to-Everything (V2X) systems work — traffic controllers, roadside units,
on-board units, and the SAE J2735 messages they exchange.

Open **`index.html`** in any modern browser. That's it — no server, no network,
no install. Everything (React, the compiled app, and the compiled Tailwind CSS)
is inlined into that one file.

## What's inside (tabs)

- **World Builder** — a drag-and-drop sandbox. Drop devices (TC, RSU, vehicles,
  emergency vehicle, bus, pedestrian, signal heads, roads, or a pre-wired 4-way
  intersection), wire them port-to-port, pick a real vendor model per device and
  read its spec sheet, then **Simulate**: packets flow along every link (choose
  direction/messages, MAP-storage tradeoff, per-RSU security & conversion), and
  drivable vehicles form/break links as they pass through RSU range. Click a
  flowing packet for its decoded payload. Save/load/export worlds; undo/redo.
- **Use Cases** — animated scenarios grouped by V2I / V2V / V2P / V2N
  (signal priority & preemption, RLVW, GLOSA, FCW/EEBL/IMA, platooning, work-zone
  worker safety, network hazard warnings, rail-crossing, …) with a scrub timeline.
  Closely-related scenarios share a tile and a variant toggle (e.g. **Signal
  Priority & Preemption** switches Emergency / Transit / Freight; **Network Hazard
  Warning** switches Work-zone / Black-ice / Stalled-vehicle).
- **Test Your Knowledge** — a shuffled, scored multiple-choice quiz.
- **Device Anatomy** — annotated cutaways: wire up a real traffic-controller
  cabinet (Controller → load switch → field terminal → conduit up the pole to the
  signal head, which energizes when wired correctly) and explore the **RSU** and
  **OBU** internals part by part (the two ends of the same over-the-air link).
- **Glossary** — a searchable dictionary with a Definition / **Format** toggle
  showing the real wire/message layouts, plus a **References & Further Reading**
  section linking to the authoritative standards bodies (USDOT ITS JPO, SAE, IEEE,
  NTCIP, FHWA, NHTSA).

A dismissible **intro tour** greets first-time visitors (re-openable via the `?`
in the header; shown once, tracked in `localStorage`).

### Deep links & sharing

The URL hash reflects where you are, so any view is shareable:

```
#cases/priority/transit     a specific Use Case scenario + variant
#anatomy/obu                a specific Device Anatomy cutaway
#glossary/BSM%20(...)       a specific glossary term
#world=<encoded>            a World Builder world (via its "🔗 Share" button)
```

Paste one of these onto the deployed URL and it opens straight to that view.

## Architecture

The app is authored as **one React source file** and compiled to **one static
HTML file** with zero runtime dependencies:

```
src/app.jsx      ── the entire app (React via UMD globals; see the TOC at top)
src/styles.css   ── Tailwind directives + custom keyframes/classes
tailwind.config.js
vendor/          ── inlined-at-build assets (React + ReactDOM UMD)
build.js         ── compiles + inlines everything → index.html
tests/run.js     ── render + logic test suite
index.html       ── GENERATED, self-contained artifact (do not hand-edit)
```

`build.js` does three things and concatenates the result into `index.html`:
1. compiles `src/styles.css` with Tailwind (scanning `src/app.jsx`) into a static CSS,
2. compiles `src/app.jsx` (JSX → JS) with Babel,
3. inlines the React/ReactDOM UMD bundles + the CSS + the compiled app.

> It's intentionally a single file rather than a bundled module tree: the whole
> point is a zero-dependency artifact you can email or drop on a USB stick and it
> just works offline. `src/app.jsx` is organized into clearly-numbered sections
> (see the table of contents at the top of the file).

Why offline matters: early versions relied on in-browser Babel + CDN Tailwind and
would show a blank page if a CDN was slow/blocked. Everything is now inlined.

## Develop

```bash
npm install       # one-time: babel-standalone, tailwindcss, react, react-dom (dev only)
node build.js     # or: npm run build   → regenerates index.html from src/
npm test          # compile + server-render every tab + assert the core logic
open index.html   # view it
```

Edit **`src/app.jsx`** (and `src/styles.css` for styling), then rebuild. Never
edit `index.html` by hand — it's generated. **Always commit the rebuilt
`index.html` alongside your `src/` changes** — CI rejects a stale artifact.

## CI & deploy

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm ci` → `npm run build`,
2. **fails if the committed `index.html` is out of sync** with `src/` (the
   "did you forget to rebuild?" guard — a `git diff --exit-code` on the artifact),
3. `npm test`.

On push to `main` it then publishes the self-contained `index.html` to **GitHub
Pages**. One-time setup after pushing to GitHub: **Settings → Pages → Source →
"GitHub Actions"**.

# V2X Sandbox

An interactive, **single-file, fully-offline** tool for learning how
Vehicle-to-Everything (V2X) systems work — traffic controllers, roadside units,
on-board units, and the SAE J2735 messages they exchange.

Open **`index.html`** in any modern browser. That's it — no server, no network,
no install. Everything (React, the compiled app, and the compiled Tailwind CSS)
is inlined into that one file.

## What's inside

- **World Builder** — a drag-and-drop sandbox. Drop devices (TC, RSU, **V2X Hub**,
  vehicles, emergency vehicle, bus, pedestrian, signal heads), **roadside sensors
  (LiDAR / radar / camera)**, the **V2N network path (cell tower + TMC/cloud)**,
  roads, a **pole + mast arm**, or a pre-wired 4-way intersection. Signals & sensors
  **snap onto the mast arm**, an **RSU attaches to the pole side**, and the arm
  **flips** left/right. Wire devices port-to-port, pick a real vendor model per
  device and read its spec sheet, then **Simulate**: the sim generates only the
  messages the world can justify — sensors emit a detected-**`objects`** feed that
  the V2X Hub fuses into an **`SDSM`** (SAE J3224) — but only once the sensor is
  actually **detecting** a road user (drag it onto a car/pedestrian to lock on;
  no detection, no SDSM); **SPaT/MAP/SSM** appear only
  with a signal controller; **SRM/SSM** switch on the moment an emergency vehicle
  or bus is added; and **V2N** rides the cellular **Uu** link to the tower then
  **backhaul** to the TMC/cloud (TIM down, probe data up) — with adjustable
  direction, **per-message toggles (hover one for exactly how to make it appear)**,
  a collapsible MAP-storage tradeoff, and per-RSU
  security & conversion. Drivable vehicles
  form/break links in RSU range; click a packet for its decoded payload.
  Save/load/export/share worlds; undo/redo.
- **Use Cases** — animated scenarios grouped by V2I / V2V / V2P / V2N plus a
  dedicated **Sensor** sub-folder (signal priority & preemption, RLVW, GLOSA,
  FCW/EEBL/IMA, platooning, work-zone worker safety, network hazard warnings, and
  the sensing family: **roadside sensor detection**, **V2X-Hub sensor fusion**,
  **radar-fed permissive left turn**, **LiDAR wrong-way-driver → SDSM alert**, …)
  with a scrub timeline. Closely-related scenarios share a tile and a variant
  toggle (e.g. **Signal Priority & Preemption** switches Emergency / Transit /
  Freight; **Roadside Sensor Detection** switches LiDAR / radar / camera;
  **Permissive Left Turn** switches gap-accepted / gap-rejected).
- **Test Your Knowledge** — a quiz launched from the **🎯 Quiz** button in the
  top-right (left of the `?`), not a main tab. Pick a **section** to be tested on
  (SAE J2735 messages, roadside infrastructure, roadside sensing & SDSM,
  applications, security & standards) or run all ~37 questions; answer options are
  shuffled. **Pass a section (≥ 70%) to earn 1–3 stars and log your best time**,
  both saved in `localStorage` — the button shows your running star total.
- **Device Anatomy** — annotated cutaways: wire up a real traffic-controller
  cabinet (Controller → load switch → field terminal → conduit up the pole to the
  signal head, which energizes when wired correctly) and explore the **RSU** and
  **OBU** internals part by part (the two ends of the same over-the-air link).
- **Glossary** — a searchable dictionary with a Definition / **Format** toggle
  showing the real wire/message layouts, plus a **References & Further Reading**
  section linking to the authoritative standards bodies (USDOT ITS JPO, SAE, IEEE,
  NTCIP, FHWA, NHTSA).

A dismissible **intro tour** greets first-time visitors (re-openable via the `?`
in the header; shown once, tracked in `localStorage`). The **🎯 Quiz** launcher
sits just to its left.

### Deep links & sharing

The URL hash reflects where you are, so any view is shareable:

```
#cases/priority/transit     a specific Use Case scenario + variant
#anatomy/obu                a specific Device Anatomy cutaway
#glossary/BSM%20(...)       a specific glossary term
#world=<encoded>            a World Builder world (via its "🔗 Share" button)
#quiz                       opens the quiz launcher directly
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

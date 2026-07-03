#!/usr/bin/env node
/**
 * Build step for the V2X Sandbox.
 *
 * Produces a single, FULLY OFFLINE, self-contained `index.html`:
 *   - React + ReactDOM UMD bundles are inlined from ./vendor.
 *   - src/app.jsx is compiled from JSX to plain JS (no in-browser Babel).
 *   - Tailwind is compiled to a static CSS (scanning src/app.jsx) and inlined
 *     — no CDN, no runtime JIT. There are now ZERO external dependencies.
 *
 * IMPORTANT: the file is assembled by string concatenation, NOT String.replace,
 * because React's minified source contains "$&" which String.replace would
 * expand as a special replacement pattern and corrupt the bundle.
 *
 * Usage:  node build.js       (needs devDependencies installed once: npm install)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Babel = require('@babel/standalone');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. Compile Tailwind → static CSS (scans src/app.jsx for the classes used).
const twBin = path.join(ROOT, 'node_modules', '.bin', 'tailwindcss');
const cssOut = path.join(ROOT, 'vendor', 'tailwind.build.css');
execSync(`"${twBin}" -c tailwind.config.js -i src/styles.css -o "${cssOut}" --minify`, { cwd: ROOT, stdio: 'pipe' });
const css = fs.readFileSync(cssOut, 'utf8');

// 2. Compile the app JSX → plain JS.
const compiled = Babel.transform(read('src/app.jsx'), { presets: ['react'] }).code;

const react = read('vendor/react.production.min.js');
const reactDom = read('vendor/react-dom.production.min.js');

// Favicon — matches the UI's vibe: the sandbox grid backdrop (UI black #09090b
// + #1e293b grid lines), with "V2X" where the V and X are UI-black (cut out of
// the grid, edged so they read at tiny sizes) and the 2 is the exact UI cyan
// (#22d3ee) with a neon glow. Inlined as a data URI so the app stays offline.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <pattern id="g" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#1e293b" stroke-width="1.4"/></pattern>
    <clipPath id="r"><rect x="2" y="2" width="60" height="60" rx="13"/></clipPath>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g clip-path="url(#r)">
    <rect x="2" y="2" width="60" height="60" fill="#09090b"/>
    <rect x="2" y="2" width="60" height="60" fill="url(#g)"/>
  </g>
  <rect x="2" y="2" width="60" height="60" rx="13" fill="none" stroke="#3f3f46" stroke-width="1.5"/>
  <text x="32" y="43" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-weight="700" font-size="28" letter-spacing="1.5"><tspan fill="#09090b" stroke="#e2e8f0" stroke-width="2" paint-order="stroke">V</tspan><tspan fill="#22d3ee" filter="url(#glow)">2</tspan><tspan fill="#09090b" stroke="#e2e8f0" stroke-width="2" paint-order="stroke">X</tspan></text>
</svg>`;
const favicon = 'data:image/svg+xml;base64,' + Buffer.from(faviconSvg).toString('base64');

const head = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#09090b" />
  <title>V2X Sandbox</title>
  <link rel="icon" type="image/svg+xml" href="${favicon}" />

  <!-- ============================================================
       Single-file, 100% OFFLINE build — zero external dependencies.
       React + ReactDOM inlined · JSX pre-compiled · Tailwind compiled to
       static CSS and inlined below.  Edit src/app.jsx and run: node build.js
  ============================================================ -->
  <style>
${css}
  </style>
</head>
<body class="text-slate-200 font-sans antialiased">
  <div id="root"></div>
`;

const out = [
  head,
  '  <script>' + react + '</script>\n',
  '  <script>' + reactDom + '</script>\n',
  '  <script>\n' + compiled + '\n  </script>\n',
  '</body>\n</html>\n',
].join('');

fs.writeFileSync(path.join(ROOT, 'index.html'), out);
console.log('Built index.html —', out.length, 'bytes (inlined CSS', css.length, 'bytes)');

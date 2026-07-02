#!/usr/bin/env node
/**
 * Build step for the V2X Playground.
 *
 * Produces a single, fully self-contained `index.html`:
 *   - React + ReactDOM UMD bundles are INLINED from ./vendor (no CDN needed),
 *     so the app renders even if the network/CDN is blocked or offline.
 *   - src/app.jsx is compiled from JSX to plain JS (no in-browser Babel).
 *   - Tailwind is the only external dependency (styling only; if it fails to
 *     load the app still renders, just unstyled — never a blank page).
 *
 * IMPORTANT: the file is assembled by string concatenation, NOT String.replace,
 * because React's minified source contains "$&" which String.replace would
 * expand as a special replacement pattern and corrupt the bundle.
 *
 * Usage:  node build.js
 */
const fs = require('fs');
const path = require('path');
const Babel = require('@babel/standalone');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const react = read('vendor/react.production.min.js');
const reactDom = read('vendor/react-dom.production.min.js');
const jsx = read('src/app.jsx');

const compiled = Babel.transform(jsx, { presets: ['react'] }).code;

const head = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>V2X Infrastructure Playground &amp; Testing Tool</title>

  <!-- ============================================================
       TECH STACK (single-file, self-contained prototype)
       - React 18 + ReactDOM 18 are INLINED below (no network needed).
       - JSX pre-compiled to plain JS (no in-browser Babel step).
       - Tailwind via Play CDN for styling only; app renders without it.
       Rendered by build.js from src/app.jsx  —  edit the source, not this file.
  ============================================================ -->
`;

const styleAndConfig = `  <script>
    if (window.tailwind) {
      tailwind.config = {
        darkMode: 'class',
        theme: { extend: {
          colors: { neon: { cyan:'#22d3ee', green:'#34d399', amber:'#fbbf24', red:'#f87171', violet:'#a78bfa' } },
          fontFamily: { mono: ['ui-monospace','SFMono-Regular','Menlo','monospace'] }
        } }
      };
    }
  </script>

  <style>
    body { background: #09090b; }
    .glow-cyan  { filter: drop-shadow(0 0 6px rgba(34,211,238,.9)); }
    .glow-green { filter: drop-shadow(0 0 6px rgba(52,211,153,.9)); }
    .glow-red   { filter: drop-shadow(0 0 8px rgba(248,113,113,.95)); }
    .glow-amber { filter: drop-shadow(0 0 6px rgba(251,191,36,.9)); }

    /* Scene parts: hover highlight + click affordance */
    .spart { transition: filter .15s ease; }
    .spart:hover { filter: drop-shadow(0 0 8px rgba(34,211,238,.85)); }
    .part-hi { filter: drop-shadow(0 0 10px rgba(34,211,238,.95)); }

    /* Build-mode "placement" pop-in */
    @keyframes placein { from { opacity: 0; transform: scale(.55); } to { opacity: 1; transform: scale(1); } }
    .placein { animation: placein .45s cubic-bezier(.2,.9,.3,1.2); transform-box: fill-box; transform-origin: center; }

    /* Highlight halo pulse */
    @keyframes halo { 0% { r: 22; opacity: .85; } 100% { r: 78; opacity: 0; } }
    .halo { animation: halo 1.6s ease-out infinite; }

    @keyframes dashflow { to { stroke-dashoffset: -24; } }
    .dashflow { stroke-dasharray: 6 6; animation: dashflow .6s linear infinite; }
    @keyframes radiowave { 0% { opacity: .9; } 100% { opacity: 0; } }
    .radiowave { animation: radiowave 1.8s ease-out infinite; }
    @keyframes crashflash { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
    .crashflash { animation: crashflash .35s steps(1) 3; }
    @keyframes slidein { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .slidein { animation: slidein .22s ease-out; }

    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
  </style>
</head>
<body class="text-slate-200 font-sans antialiased">
  <div id="root"></div>
`;

const out = [
  head,
  '  <script>' + react + '</script>\n',
  '  <script>' + reactDom + '</script>\n',
  '  <script src="https://cdn.tailwindcss.com"></script>\n',
  styleAndConfig,
  '  <script>\n' + compiled + '\n  </script>\n',
  '</body>\n</html>\n',
].join('');

fs.writeFileSync(path.join(ROOT, 'index.html'), out);
console.log('Built index.html —', out.length, 'bytes');

#!/usr/bin/env node
/**
 * Build step for the V2X Playground.
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

const head = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>V2X Infrastructure Playground &amp; Testing Tool</title>

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

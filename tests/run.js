#!/usr/bin/env node
/**
 * Test suite for the V2X Playground (run with `npm test`).
 *
 * There is no browser here, so we compile src/app.jsx the same way build.js
 * does, evaluate it in a sandbox, then (a) server-render every tab to prove it
 * mounts without throwing and (b) assert the core pure-logic functions and the
 * data (scenarios, quiz, glossary). Exits non-zero on any failure.
 */
const fs = require('fs');
const path = require('path');
const Babel = require('@babel/standalone');
const React = require('react');
const RS = require('react-dom/server');

const ROOT = path.join(__dirname, '..');

// ---- tiny assert harness ----
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const renders = (el, msg) => { try { RS.renderToStaticMarkup(el); pass++; } catch (e) { fail++; console.log('  \x1b[31m✗\x1b[0m ' + msg + ' — ' + (e.message || e)); } };

// ---- load the app in a sandbox (same compile path as build.js) ----
function loadApp() {
  const jsx = fs.readFileSync(path.join(ROOT, 'src/app.jsx'), 'utf8').replace(/ReactDOM\.createRoot[\s\S]*$/, '');
  const code = Babel.transform(jsx, { presets: ['react'] }).code;
  const names = 'App,WorldBuilderTab,UseCasesTab,GlossaryTab,AnatomyTab,CabinetDiagram,RsuDiagram,QuizTab,MiniScene,SCENARIOS,QUIZ,GLOSSARY,linkStreams,decodePacket,liveXY,connKind,isVehicle,canRequestPriority,backhaulKbps,glossaryTermFor,validCabPair';
  const factory = new Function('React', 'ReactDOM', 'window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', code + `\n;return {${names}};`);
  const win = { innerWidth: 1440, addEventListener() {}, removeEventListener() {}, location: { href: 'file:///x', hash: '' } };
  const ls = { getItem: () => null, setItem() {}, removeItem() {} };
  const doc = { getElementById: () => ({}), createElement: () => ({}), createElementNS: () => ({}) };
  return factory(React, { createRoot: () => ({ render() {} }) }, win, doc, { now: () => 0 }, () => 0, () => {}, ls);
}

const m = loadApp();
const el = (C, p) => React.createElement(C, p);

// ---------- 1. every tab server-renders ----------
console.log('• tabs render');
renders(el(m.App), 'App');
renders(el(m.WorldBuilderTab, { openGlossary() {} }), 'WorldBuilderTab');
renders(el(m.UseCasesTab, { openGlossary() {} }), 'UseCasesTab');
renders(el(m.QuizTab), 'QuizTab');
renders(el(m.AnatomyTab), 'AnatomyTab');
renders(el(m.CabinetDiagram), 'CabinetDiagram');
renders(el(m.RsuDiagram), 'RsuDiagram');
renders(el(m.GlossaryTab, { target: { term: 'SPaT (Signal Phase and Timing)', k: 1 } }), 'GlossaryTab(target)');

// ---------- 2. connKind ----------
console.log('• connKind');
eq(m.connKind('tc', 'rsu'), 'ethernet', 'tc-rsu');
eq(m.connKind('rsu', 'obu'), 'wireless', 'rsu-obu');
eq(m.connKind('rsu', 'ev'), 'wireless', 'rsu-ev');
eq(m.connKind('obu', 'obu'), 'v2v', 'obu-obu');
eq(m.connKind('ev', 'ev'), 'v2v', 'ev-ev');
eq(m.connKind('ped', 'rsu'), 'v2p', 'ped-rsu');
eq(m.connKind('tc', 'signal'), 'signal', 'tc-signal');

// ---------- 3. linkStreams (direction, roles, MAP storage) ----------
console.log('• linkStreams');
const rsu = { type: 'rsu', x: 0, y: 0 }, car = { type: 'obu', x: 100, y: 0 }, ev = { type: 'ev', x: 100, y: 0 }, bus = { type: 'bus', x: 100, y: 0 }, tc = { type: 'tc', x: 0, y: 0 }, ped = { type: 'ped', x: 50, y: 50 }, sig = { type: 'signal', x: 0, y: 80 };
const L = (arr) => arr.map((s) => s.label).sort();
eq(L(m.linkStreams(car, rsu, 'rev', {}, 'rsu')), ['BSM'], 'car up = BSM only (not authorized SRM)');
eq(L(m.linkStreams(ev, rsu, 'rev', {}, 'rsu')), ['BSM', 'SRM'], 'EV up = BSM + SRM');
eq(L(m.linkStreams(bus, rsu, 'rev', {}, 'rsu')), ['BSM', 'SRM'], 'bus up = BSM + SRM');
ok(!m.linkStreams(tc, rsu, 'fwd', {}, 'rsu').some((s) => s.label === 'MAP'), 'MAP@rsu: not on TC-RSU wire');
ok(m.linkStreams(tc, rsu, 'fwd', {}, 'tc').some((s) => s.label === 'MAP'), 'MAP@tc: on TC-RSU wire');
ok(m.linkStreams(rsu, car, 'fwd', {}, 'rsu').some((s) => s.label === 'MAP'), 'MAP always broadcast over the air');
eq(L(m.linkStreams(car, car, 'both', {}, 'rsu')), ['BSM', 'BSM'], 'v2v = BSM both ways');
eq(L(m.linkStreams(ped, rsu, 'both', {}, 'rsu')), ['PSM', 'SPaT'], 'v2p rsu = PSM up + SPaT down');
eq(L(m.linkStreams(ped, car, 'both', {}, 'rsu')), ['BSM', 'PSM'], 'v2p vehicle = PSM up + BSM down');
eq(L(m.linkStreams(tc, sig, 'fwd', {}, 'rsu')), ['phase'], 'signal = phase control');
ok(!m.linkStreams(rsu, car, 'both', { MAP: false }, 'rsu').some((s) => s.label === 'MAP'), 'disabling MAP removes it');

// ---------- 4. decodePacket ----------
console.log('• decodePacket');
eq(m.decodePacket('SPaT', { secure: true, formatOk: true }).security.verified, true, 'signed → verified');
eq(m.decodePacket('SPaT', { secure: false, formatOk: true }).security.verified, false, 'unsigned → not verified');
eq(m.decodePacket('SPaT', { secure: true, formatOk: false }).decodable, false, 'unformatted → not decodable');
ok(/preemption/.test(m.decodePacket('SRM', { secure: true, formatOk: true, vehType: 'ev' }).requestType), 'EV SRM = preemption');
ok(/priority/.test(m.decodePacket('SRM', { secure: true, formatOk: true, vehType: 'bus' }).requestType), 'bus SRM = priority');

// ---------- 5. liveXY (motion) ----------
console.log('• liveXY');
eq(m.liveXY({ x: 50, y: 60 }, 5), { x: 50, y: 60 }, 'static (no drive)');
eq(m.liveXY({ type: 'obu', x: 100, y: 300, drive: 'e' }, 2), { x: 290, y: 300 }, 'vehicle east 95px/s');
eq(m.liveXY({ type: 'ped', x: 100, y: 200, drive: 'e' }, 2), { x: 176, y: 200 }, 'pedestrian 38px/s');
ok(m.liveXY({ type: 'obu', x: 980, y: 300, drive: 'e' }, 5).x < 980, 'wraps at canvas edge');

// ---------- 6. bandwidth + glossary cross-link ----------
console.log('• backhaul + glossary link');
eq(m.backhaulKbps({}, 'rsu'), 9, 'MAP@rsu ≈ 9 kbps');
eq(m.backhaulKbps({}, 'tc'), 17, 'MAP@tc ≈ 17 kbps');
ok(m.backhaulKbps({ SPaT: false }, 'tc') < m.backhaulKbps({}, 'tc'), 'disabling SPaT lowers backhaul');
eq(m.glossaryTermFor('BSM'), 'BSM (Basic Safety Message)', 'BSM → glossary term');
eq(m.glossaryTermFor('FCW'), 'FCW', 'FCW → glossary term');
eq(m.glossaryTermFor('CACC'), 'CACC / Platooning', 'CACC → prefix match');
eq(m.glossaryTermFor('Maneuver'), null, 'unknown → null');

// ---------- 7. vehicle roles + cabinet wiring ----------
console.log('• roles + cabinet wiring');
ok(m.isVehicle('ev') && m.isVehicle('bus') && m.isVehicle('obu') && !m.isVehicle('rsu'), 'isVehicle');
ok(m.canRequestPriority('ev') && m.canRequestPriority('bus') && !m.canRequestPriority('obu'), 'only EV/bus authorized for SRM');
ok(m.validCabPair('ctrl', 'lsin') && m.validCabPair('lsout', 'field'), 'valid cabinet wires');
ok(!m.validCabPair('ctrl', 'field'), 'controller cannot wire straight to the head');

// ---------- 8. scenarios ----------
console.log('• use-case scenarios');
// some scenarios bundle several similar animations under a variant toggle, so
// count total simulations (a scenario contributes its variant count, else 1).
const simCount = m.SCENARIOS.reduce((n, s) => n + (s.variants ? s.variants.length : 1), 0);
ok(simCount >= 23, `total simulations (${simCount}) ≥ 23`);
let frameErrs = 0;
m.SCENARIOS.forEach((sc) => {
  const runs = sc.variants ? sc.variants : [sc];   // each variant carries its own frame + duration
  runs.forEach((r) => { const dur = r.duration || sc.duration; for (let t = 0; t <= dur; t += dur / 8) { try { RS.renderToStaticMarkup(el(m.MiniScene, { frame: r.frame(t) })); } catch (e) { frameErrs++; console.log('  \x1b[31m✗\x1b[0m scenario ' + sc.id + ' @' + t.toFixed(1) + ': ' + e.message); } } });
});
ok(frameErrs === 0, 'all scenario/variant frames render across their timeline');
ok(m.SCENARIOS.every((s) => ['V2I', 'V2V', 'V2P', 'V2N'].includes(s.category)), 'every scenario has a valid category');

// ---------- 9. quiz ----------
console.log('• quiz');
ok(m.QUIZ.length >= 10, `quiz question count (${m.QUIZ.length}) ≥ 10`);
ok(m.QUIZ.every((q) => Array.isArray(q.options) && q.options.length >= 2 && typeof q.answer === 'number' && q.answer >= 0 && q.answer < q.options.length && q.explain), 'every question has valid options/answer/explanation');

// ---------- 10. built artifact is offline & self-contained ----------
console.log('• built index.html');
const html = fs.existsSync(path.join(ROOT, 'index.html')) ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') : '';
ok(html.length > 0, 'index.html exists (run `node build.js`)');
if (html) {
  ok(!html.includes('cdn.tailwindcss.com'), 'no Tailwind CDN');
  ok(!html.includes('unpkg') && !html.includes('text/babel'), 'no unpkg / in-browser Babel');
  // the offline guarantee: nothing is *loaded* from the network (string URLs in
  // React's error messages are fine — they are never fetched).
  ok(!/(?:src|href)\s*=\s*["']https?:/i.test(html), 'no external <script>/<link>/<img> resources');
  ok(!/@import\s+url\(\s*["']?https?:/i.test(html), 'no external CSS @import');
  ok(html.includes("ReactDOM.createRoot(document.getElementById('root'))"), 'mounts React');
}

// ---- report ----
console.log(`\n${fail === 0 ? '\x1b[32m✓' : '\x1b[31m✗'} ${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);

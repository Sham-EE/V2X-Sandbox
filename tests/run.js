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
  const names = 'App,WorldBuilderTab,UseCasesTab,GlossaryTab,AnatomyTab,CabinetDiagram,RsuDiagram,ObuDiagram,FirstRun,QuizTab,MiniScene,DeviceArt,SCENARIOS,QUIZ,GLOSSARY,TYPES,MODELS,ALL_MSGS,MSG_COLOR,SENSOR_FEED_INFO,linkStreams,decodePacket,liveXY,connKind,isVehicle,isSensor,canRequestPriority,backhaulKbps,glossaryTermFor,validCabPair,findGlossaryItem';
  const factory = new Function('React', 'ReactDOM', 'window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', code + `\n;return {${names}};`);
  const win = { innerWidth: 1440, addEventListener() {}, removeEventListener() {}, location: { href: 'file:///x', hash: '' }, history: { replaceState() {} } };
  const ls = { getItem: () => null, setItem() {}, removeItem() {} };
  const doc = { getElementById: () => ({}), createElement: () => ({}), createElementNS: () => ({}) };
  return factory(React, { createRoot: () => ({ render() {} }) }, win, doc, { now: () => 0 }, () => 0, () => {}, ls);
}

const m = loadApp();
const el = (C, p) => React.createElement(C, p);

// ---------- 1. every tab server-renders ----------
console.log('• tabs render');
const noop = () => {};
renders(el(m.App), 'App');
renders(el(m.FirstRun, { onClose: noop }), 'FirstRun');
renders(el(m.WorldBuilderTab, { openGlossary: noop }), 'WorldBuilderTab');
renders(el(m.UseCasesTab, { openGlossary: noop, sub: '', navigate: noop }), 'UseCasesTab');
renders(el(m.UseCasesTab, { openGlossary: noop, sub: 'priority/transit', navigate: noop }), 'UseCasesTab(deep-link)');
renders(el(m.QuizTab), 'QuizTab');
renders(el(m.AnatomyTab, { sub: '', navigate: noop }), 'AnatomyTab');
renders(el(m.AnatomyTab, { sub: 'obu', navigate: noop }), 'AnatomyTab(obu)');
renders(el(m.CabinetDiagram), 'CabinetDiagram');
renders(el(m.RsuDiagram), 'RsuDiagram');
renders(el(m.ObuDiagram), 'ObuDiagram');
renders(el(m.GlossaryTab, { sub: '', navigate: noop }), 'GlossaryTab');
renders(el(m.GlossaryTab, { sub: encodeURIComponent('SPaT (Signal Phase and Timing)'), navigate: noop }), 'GlossaryTab(deep-link)');
// every device type's canvas art renders (incl. the new hub / sensors / mast)
Object.keys(m.TYPES).filter((t) => t !== 'intersection').forEach((t) => {
  const model = m.MODELS[t] && m.MODELS[t][0];
  renders(React.createElement('svg', null, el(m.DeviceArt, { type: t, model })), 'DeviceArt(' + t + ')');
});

// ---------- 2. connKind ----------
console.log('• connKind');
eq(m.connKind('tc', 'rsu'), 'ethernet', 'tc-rsu');
eq(m.connKind('rsu', 'obu'), 'wireless', 'rsu-obu');
eq(m.connKind('rsu', 'ev'), 'wireless', 'rsu-ev');
eq(m.connKind('obu', 'obu'), 'v2v', 'obu-obu');
eq(m.connKind('ev', 'ev'), 'v2v', 'ev-ev');
eq(m.connKind('ped', 'rsu'), 'v2p', 'ped-rsu');
eq(m.connKind('tc', 'signal'), 'signal', 'tc-signal');
eq(m.connKind('lidar', 'hub'), 'sensor', 'lidar-hub = sensor data feed');
eq(m.connKind('camera', 'tc'), 'sensor', 'camera-tc = sensor data feed');
eq(m.connKind('lidar', 'obu'), 'detect', 'sensor-car = detecting the target');
eq(m.connKind('ev', 'radar'), 'detect', 'sensor-EV = detecting the target');
eq(m.connKind('camera', 'ped'), 'detect', 'sensor-ped = detecting the target');
eq(m.connKind('hub', 'rsu'), 'ethernet', 'hub-rsu = backhaul');
eq(m.connKind('hub', 'tc'), 'ethernet', 'hub-tc = backhaul');
eq(m.connKind('obu', 'celltower'), 'cellular', 'vehicle-tower = cellular Uu');
eq(m.connKind('celltower', 'tmc'), 'backhaul', 'tower-TMC = network backhaul');
eq(m.connKind('tmc', 'rsu'), 'backhaul', 'TMC-RSU = network backhaul');

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
const cam = { type: 'camera', x: 0, y: 0 }, hub = { type: 'hub', x: 80, y: 0 };
eq(L(m.linkStreams(cam, hub, 'both', {}, 'rsu')), ['video'], 'camera → hub = video feed');
eq(L(m.linkStreams({ type: 'lidar', x: 0, y: 0 }, hub, 'both', {}, 'rsu')), ['point cloud'], 'LiDAR → hub = point-cloud feed');
eq(L(m.linkStreams({ type: 'radar', x: 0, y: 0 }, hub, 'both', {}, 'rsu')), ['tracks'], 'radar → hub = tracks feed');
eq(L(m.linkStreams(cam, hub, 'fwd', {}, 'rsu')), [], 'sensor feed is upstream-only (no fwd)');
// sensor → road user = a DETECTION (data flows target → sensor, not to the vehicle)
{
  const car2 = { type: 'obu', x: 200, y: 0 }, lidar2 = { type: 'lidar', x: 0, y: 0 };
  const det = m.linkStreams(lidar2, car2, 'both', {}, 'rsu');
  eq(L(det), ['detection'], 'sensor-car link = a detection');
  ok(det[0].from.x === car2.x && det[0].to.x === lidar2.x, 'detection flows target → sensor (into the sensor)');
}
// each message now has its own hue — no two share a color
ok(m.ALL_MSGS.every((k) => typeof m.MSG_COLOR[k] === 'string'), 'every message has a color');
eq(new Set(m.ALL_MSGS.map((k) => m.MSG_COLOR[k])).size, m.ALL_MSGS.length, 'every message has a UNIQUE color');
// sensor feeds decode to their specific data type
ok(/point cloud/i.test(JSON.stringify(m.decodePacket('point cloud', {}))), 'LiDAR feed decodes to a point cloud');
ok(/track/i.test(JSON.stringify(m.decodePacket('tracks', {}))), 'radar feed decodes to tracks');
ok(/video|frame/i.test(JSON.stringify(m.decodePacket('video', {}))), 'camera feed decodes to video/frames');
// each sensor feed has a full pipeline explainer (raw→…→transmitted) + where/setups
['point cloud', 'tracks', 'video'].forEach((k) => {
  const info = m.SENSOR_FEED_INFO[k];
  ok(info && info.what && info.stages.length >= 3 && info.where && info.setups.length === 2 && info.transmitted && info.nuance, `${k} explainer has what/stages(≥3)/where/setups/transmitted/nuance`);
});
ok(/ADC|analog-to-digital|data cube/i.test(JSON.stringify(m.SENSOR_FEED_INFO.tracks.stages)), 'radar names the ADC echo as the true raw data');
ok(/doppler/i.test(m.SENSOR_FEED_INFO.tracks.nuance), 'radar explains Doppler velocity');
ok(/no doppler|inferred/i.test(m.SENSOR_FEED_INFO['point cloud'].nuance), 'LiDAR explains it has no Doppler');
ok(/frame/i.test(m.SENSOR_FEED_INFO.video.what), 'camera explains frames vs video');
// the where/setups explain on-device chip vs external computer (older/newer)
['point cloud', 'tracks', 'video'].forEach((k) => {
  ok(/on.?chip|on the sensor|inside|embed|soc|npu|edge|separate|central/i.test(m.SENSOR_FEED_INFO[k].where + JSON.stringify(m.SENSOR_FEED_INFO[k].setups)), `${k} says where processing happens`);
});
// world-context gating: SPaT/MAP/SSM need a signal; SDSM needs a sensor; SRM needs signal+priority
const noSig = { signal: false, sensor: true, priority: false, network: false };
const full = { signal: true, sensor: true, priority: true, network: true };
eq(L(m.linkStreams(rsu, car, 'fwd', {}, 'rsu', noSig)), ['SDSM'], 'no TC → no SPaT/SSM; a sensor → SDSM');
ok(!m.linkStreams(rsu, car, 'fwd', {}, 'rsu', noSig).some((s) => s.label === 'SPaT'), 'no signal controller → no SPaT');
ok(m.linkStreams(rsu, car, 'fwd', {}, 'rsu', full).some((s) => s.label === 'SPaT'), 'signal present → SPaT broadcast');
ok(m.linkStreams(rsu, car, 'fwd', {}, 'rsu', full).some((s) => s.label === 'SDSM'), 'sensor present → SDSM broadcast');
eq(L(m.linkStreams(ev, rsu, 'rev', {}, 'rsu', { signal: false, sensor: false, priority: true, network: false })), ['BSM'], 'EV but no signal → no SRM (nothing to request from)');
ok(m.linkStreams(ev, rsu, 'rev', {}, 'rsu', full).some((s) => s.label === 'SRM'), 'EV + signal + priority → SRM');
ok(m.ALL_MSGS.includes('SDSM'), 'SDSM is a toggleable message');
ok(m.isSensor('lidar') && m.isSensor('radar') && m.isSensor('camera') && !m.isSensor('rsu'), 'isSensor');
ok(m.MODELS.hub && m.MODELS.lidar && m.MODELS.radar && m.MODELS.camera, 'new devices have vendor spec sheets');
ok(m.TYPES.hub && m.TYPES.mast && m.TYPES.lidar && m.TYPES.radar && m.TYPES.camera, 'new device types exist');
// V2N network path: cellular Uu (vehicle↔tower) + backhaul (tower↔TMC↔RSU)
const tower = { type: 'celltower', x: 0, y: 0 }, tmc = { type: 'tmc', x: 100, y: 0 };
eq(L(m.linkStreams(car, tower, 'both', {}, 'rsu')), ['BSM', 'TIM'], 'cellular = TIM down + BSM up');
eq(L(m.linkStreams(tower, tmc, 'both', {}, 'rsu')), ['BSM', 'TIM'], 'backhaul = TIM down + BSM up');
eq(L(m.linkStreams(tower, car, 'fwd', {}, 'rsu')), ['TIM'], 'cellular downlink = TIM advisory');
ok(m.TYPES.celltower && m.TYPES.tmc && m.MODELS.celltower && m.MODELS.tmc, 'V2N devices + models exist');
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
// deep-link lookup + sources section
ok(m.findGlossaryItem('BSM (Basic Safety Message)') != null, 'findGlossaryItem resolves a real term');
ok(m.findGlossaryItem('nope-not-a-term') == null, 'findGlossaryItem returns null for unknown');
const refGroup = m.GLOSSARY.find((g) => /References/i.test(g.group));
ok(refGroup && refGroup.items.length >= 4, 'glossary has a References & Further Reading group');
ok(refGroup && refGroup.items.every((it) => Array.isArray(it.links) && it.links.every((l) => l.label && /^https:\/\//.test(l.url))), 'every reference has https links with labels');

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
const scnIds = m.SCENARIOS.map((s) => s.id);
ok(scnIds.includes('sensordet') && scnIds.includes('hubfusion'), 'roadside-sensor use cases present');
ok(m.SCENARIOS.find((s) => s.id === 'sensordet').variants.length === 3, 'sensordet toggles LiDAR/radar/camera');

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
  // the offline guarantee: nothing is *loaded* from the network. Resource-loading
  // attributes (src=, <link href>, @import) must never point at http(s). Plain
  // <a href> navigation links (the glossary sources) are fine — a click opens a
  // new tab; nothing is fetched to render the page. String URLs inside React's
  // error messages are likewise never fetched.
  ok(!/\ssrc\s*=\s*["']https?:/i.test(html), 'no external src= resources (scripts/images/iframes)');
  ok(!/<link\b[^>]*\shref\s*=\s*["']https?:/i.test(html), 'no external stylesheet <link>');
  ok(!/@import\s+url\(\s*["']?https?:/i.test(html), 'no external CSS @import');
  // sanity: the glossary source links ARE bundled (as JS-form anchor hrefs —
  // React.createElement("a", { href: "https://…" }) — which never auto-load).
  ok(html.includes('https://www.its.dot.gov'), 'glossary source links are present in the bundle');
  ok(html.includes("ReactDOM.createRoot(document.getElementById('root'))"), 'mounts React');
}

// ---- report ----
console.log(`\n${fail === 0 ? '\x1b[32m✓' : '\x1b[31m✗'} ${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);

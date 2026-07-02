/* =====================================================================
   V2X Infrastructure Playground & Testing Tool
   ---------------------------------------------------------------------
   Source of truth. Edit this file, then run `node build.js` to regenerate
   the self-contained index.html.

   Tabs:
     1. World Builder  — creative drag-and-drop sandbox. Drag devices from
        the palette, move them, wire them together (port → port), pick a
        real-world model per device and read its spec sheet (can / can't do).
     2. Use Cases      — scripted, animated V2X simulations (SRM emergency
        preemption, Red-Light Violation Warning, V2X actuated detection,
        GLOSA green-wave advisory).
     3. Glossary       — hierarchical technical dictionary.
===================================================================== */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* small math helpers used by the Use Case animations */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const seg = (t, a, b) => clamp01((t - a) / (b - a));       // local 0..1 within [a,b]
const lerpPt = (p, q, t) => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const TONE = { cyan: '#22d3ee', green: '#34d399', amber: '#fbbf24', red: '#f87171', violet: '#a78bfa' };

/* =====================================================================
   1. DEVICE TYPES + REAL-WORLD MODEL CATALOG (with spec sheets)
      Models are illustrative but reflect real product capabilities so the
      "can / can't do" logic is educational.
===================================================================== */
const TYPES = {
  tc:    { label: 'Traffic Controller', cat: 'device', size: { w: 66, h: 96 }, glyph: '🗄️' },
  rsu:   { label: 'Roadside Unit (RSU)', cat: 'device', size: { w: 60, h: 44 }, glyph: '📡' },
  obu:   { label: 'Vehicle (OBU)',       cat: 'device', size: { w: 52, h: 90 }, glyph: '🚗' },
  signal:{ label: 'Signal Head',         cat: 'device', size: { w: 30, h: 78 }, glyph: '🚦' },
  ped:   { label: 'Pedestrian (VRU)',    cat: 'device', size: { w: 40, h: 60 }, glyph: '🚶' },
  roadH: { label: 'Road — Horizontal',   cat: 'road',   size: { w: 340, h: 108 }, glyph: '↔' },
  roadV: { label: 'Road — Vertical',     cat: 'road',   size: { w: 108, h: 340 }, glyph: '↕' },
  intersection: { label: '4-Way Intersection', cat: 'template', glyph: '🚦' },
};

const MODELS = {
  tc: [
    { id: 'siemens-m60', vendor: 'Siemens', name: 'm60 (ATC)', gen: 'Modern',
      tagline: 'Linux ATC 5201 controller with native SAE J2735 output.',
      specs: { Platform: 'ATC 5201 · Linux', Standards: 'NTCIP 1202 v3, ATC', 'Native J2735': 'Yes — SPaT & MAP', Detection: 'Loop, video, radar, V2X', Comms: '4× Ethernet, 2× SDLC' },
      can: ['Natively generate & locally sign SAE J2735 SPaT/MAP', 'Accept V2X signal priority/preemption (SRM) requests', 'Run adaptive + fully-actuated control'],
      cannot: ['Transmit over the air by itself — still needs an RSU radio'] },
    { id: 'econolite-cobalt', vendor: 'Econolite', name: 'Cobalt (ATC)', gen: 'Modern',
      tagline: 'ATC platform paired with Econolite’s connected-vehicle stack.',
      specs: { Platform: 'ATC · Linux', Standards: 'NTCIP 1202 v3, ATC', 'Native J2735': 'Yes (with CV app)', Detection: 'Loop, video, V2X', Comms: 'Ethernet, SDLC' },
      can: ['Generate SPaT/MAP for RSU broadcast', 'Support TSP (transit signal priority)', 'Integrate video + V2X detection'],
      cannot: ['Broadcast wirelessly without an RSU'] },
    { id: 'mccain-atc-ex', vendor: 'McCain', name: 'ATC eX', gen: 'Modern',
      tagline: 'Rugged ATC cabinet controller with connected-vehicle readiness.',
      specs: { Platform: 'ATC · Linux', Standards: 'NTCIP 1202, ATC 5201', 'Native J2735': 'Yes (module)', Detection: 'Loop, video, V2X', Comms: 'Ethernet, SDLC' },
      can: ['Serve SPaT/MAP to an RSU', 'Actuated & coordinated timing plans', 'Preemption inputs (EVP)'],
      cannot: ['Directly authenticate 1609.2 air messages (RSU role)'] },
    { id: 'siemens-m50', vendor: 'Siemens', name: 'm50 (NEMA TS2)', gen: 'Classic',
      tagline: 'Legacy NEMA controller — reliable signals, no native V2X.',
      specs: { Platform: 'NEMA TS2', Standards: 'NTCIP 1202 only', 'Native J2735': 'No', Detection: 'Loop only', Comms: 'Serial / SDLC' },
      can: ['Standard actuated & pre-timed signal control', 'Output NTCIP 1202 phase & timing over the wire'],
      cannot: ['Generate SAE J2735 — an RSU must convert the stream', 'Process V2X priority requests on its own'] },
  ],
  rsu: [
    { id: 'commsignia-rs4', vendor: 'Commsignia', name: 'ITS-RS4', gen: 'Modern',
      tagline: 'Dual-mode roadside radio with onboard security processing.',
      specs: { Radios: 'C-V2X PC5 + DSRC 802.11p', Security: 'IEEE 1609.2 · SCMS', Messages: 'SPaT, MAP, SRM/SSM, TIM, PSM', Interfaces: 'Ethernet, NTCIP', GNSS: 'Integrated' },
      can: ['Convert NTCIP 1202 → SAE J2735', 'Sign/verify frames per IEEE 1609.2 (SCMS)', 'Broadcast SPaT/MAP & receive SRM/BSM'],
      cannot: ['Decide signal timing — that is the controller’s job'] },
    { id: 'kapsch-ris9260', vendor: 'Kapsch', name: 'RIS-9260', gen: 'Modern',
      tagline: 'Carrier-grade RSU widely deployed in CV pilots.',
      specs: { Radios: 'DSRC + C-V2X', Security: 'IEEE 1609.2', Messages: 'SPaT, MAP, TIM, SRM/SSM', Interfaces: 'Ethernet, SNMP', GNSS: 'Integrated' },
      can: ['Message forwarding & protocol conversion', '1609.2 signing', 'Local message store (MAP)'],
      cannot: ['Operate without power/backhaul to the cabinet'] },
    { id: 'cohda-mk6', vendor: 'Cohda Wireless', name: 'MK6C', gen: 'Modern',
      tagline: 'High-performance C-V2X platform (also common as an OBU).',
      specs: { Radios: 'C-V2X PC5', Security: 'IEEE 1609.2', Messages: 'SPaT, MAP, BSM, SRM/SSM', Interfaces: 'Ethernet', GNSS: 'Dual-antenna, lane-level' },
      can: ['Sub-metre positioning aid', 'Low-latency PC5 sidelink broadcast', 'Signing & verification'],
      cannot: ['Convert proprietary vendor byte streams it doesn’t understand'] },
    { id: 'siemens-escos', vendor: 'Siemens', name: 'ESCoS RSU', gen: 'Modern',
      tagline: 'Siemens roadside unit pairing tightly with m60 controllers.',
      specs: { Radios: 'C-V2X / DSRC', Security: 'IEEE 1609.2', Messages: 'SPaT, MAP, SRM/SSM, TIM', Interfaces: 'Ethernet, NTCIP', GNSS: 'Integrated' },
      can: ['Pass-through broadcast of ATC-signed J2735', 'Protocol conversion for legacy TCs', 'Priority request relay to controller'],
      cannot: ['Guarantee delivery — V2X is broadcast, not connection-oriented'] },
  ],
  obu: [
    { id: 'commsignia-ob4', vendor: 'Commsignia', name: 'ITS-OB4', gen: 'Modern',
      tagline: 'Aftermarket/embedded on-board unit for connected vehicles.',
      specs: { Radios: 'C-V2X PC5 + DSRC', Security: 'IEEE 1609.2', 'BSM rate': '10 Hz', Receives: 'SPaT, MAP, TIM, PSM', GNSS: 'Lane-level' },
      can: ['Broadcast BSM (position/speed/heading/brake)', 'Receive & verify SPaT/MAP', 'Send SRM for priority (transit/EMS)'],
      cannot: ['Control the vehicle — it feeds the ADAS, which decides'] },
    { id: 'autotalks-craton2', vendor: 'Autotalks', name: 'CRATON2', gen: 'Modern',
      tagline: 'Automotive-grade V2X chipset for OEM integration.',
      specs: { Radios: 'C-V2X + DSRC (dual)', Security: 'Hardware secure element', 'BSM rate': '10 Hz', Receives: 'SPaT, MAP, BSM, PSM', GNSS: 'High-precision' },
      can: ['Hardware-accelerated 1609.2 verification', 'Simultaneous DSRC + C-V2X', 'Feed ADAS safety apps (FCW, RLVW)'],
      cannot: ['See non-equipped road users without a sensor/PSM source'] },
    { id: 'generic-adas', vendor: 'Generic', name: 'ADAS Vehicle', gen: 'Modern',
      tagline: 'A connected vehicle: OBU radio + ADAS decision brain.',
      specs: { Radios: 'C-V2X', Security: 'IEEE 1609.2', 'BSM rate': '10 Hz', Receives: 'SPaT, MAP, TIM', GNSS: 'Standard' },
      can: ['Compute time-to-stop-bar for RLVW', 'React to SPaT (GLOSA speed advisory)', 'Announce itself via BSM (acts as a detector)'],
      cannot: ['Trust unsigned messages (dropped per 1609.2)'] },
  ],
  signal: [
    { id: 'sig-3', vendor: 'Generic', name: '3-Section Head', gen: '—',
      tagline: 'Standard red / yellow / green ball head.', specs: { Sections: '3 (R,Y,G)', Control: 'One signal group' },
      can: ['Show through-movement phase state (mirrors SPaT)'], cannot: ['Convey protected-turn phases'] },
    { id: 'sig-5', vendor: 'Generic', name: '5-Section (protected turn)', gen: '—',
      tagline: 'Doghouse head with protected/permissive left turn.', specs: { Sections: '5', Control: 'Through + left-turn group' },
      can: ['Represent multiple SPaT signal groups'], cannot: ['Replace lane geometry — that is the MAP message'] },
  ],
};

// Which two device types form which link when wired together.
function connKind(a, b) {
  const s = new Set([a, b]);
  if (s.has('tc') && s.has('rsu')) return 'ethernet';
  if (s.has('ped')) return 'v2p';
  if (a === 'obu' && b === 'obu') return 'v2v';
  if (s.has('rsu') && s.has('obu')) return 'wireless';
  if (s.has('tc') && s.has('signal')) return 'signal';
  return 'generic';
}
const CONN_STYLE = {
  ethernet: { color: '#f472b6', dash: '0', label: 'Ethernet · NTCIP 1202' },
  wireless: { color: '#a78bfa', dash: '3 7', label: 'C-V2X · SAE J2735' },
  v2v:      { color: '#34d399', dash: '3 7', label: 'V2V · BSM' },
  v2p:      { color: '#fbbf24', dash: '3 7', label: 'V2P · PSM' },
  signal:   { color: '#64748b', dash: '0', label: 'Signal control' },
  generic:  { color: '#64748b', dash: '4 6', label: 'link' },
};

// SAE J2735 messages the user can fine-tune, and their packet colors.
const ALL_MSGS = ['SPaT', 'MAP', 'TIM', 'SSM', 'BSM', 'SRM', 'PSM'];
const MSG_COLOR = { SPaT: '#22d3ee', MAP: '#22d3ee', TIM: '#a78bfa', SSM: '#34d399', BSM: '#34d399', SRM: '#fbbf24', PSM: '#fbbf24', data: '#64748b' };

// Orient a wired link so packets flow upstream (TC) → RSU → downstream (OBU/VRU).
function orientLink(a, b) {
  const rank = (t) => (t === 'tc' ? 0 : t === 'rsu' ? 1 : 2);
  return rank(a.type) <= rank(b.type) ? [a, b] : [b, a];
}

// Packet streams for one link, honoring the direction mode and enabled messages.
// dir: 'fwd' = infrastructure→vehicle · 'rev' = vehicle→infrastructure · 'both'.
// Returns [{ from:{x,y}, to:{x,y}, label, color }].
function linkStreams(a, b, dir, enabled, mapStore) {
  const on = (m) => enabled[m] !== false;
  const showDown = dir === 'fwd' || dir === 'both';
  const showUp = dir === 'rev' || dir === 'both';
  const out = [];
  const push = (from, to, m, d) => { if (on(m)) out.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, label: m, color: MSG_COLOR[m], dir: d }); };
  const kind = connKind(a.type, b.type);

  if (kind === 'signal') {                        // the TC physically drives the light
    const tc = a.type === 'tc' ? a : b, sig = a.type === 'tc' ? b : a;
    if (showDown) out.push({ from: { x: tc.x, y: tc.y }, to: { x: sig.x, y: sig.y }, label: 'phase', color: '#fbbf24', dir: 'ctl' });
    return out;
  }
  if (kind === 'v2p') {                           // pedestrian ↔ vehicle / RSU (both ways)
    const ped = a.type === 'ped' ? a : b, other = a.type === 'ped' ? b : a;
    if (showUp) push(ped, other, 'PSM', 'up');                                   // VRU announces itself
    if (showDown) push(other, ped, other.type === 'rsu' ? 'SPaT' : 'BSM', 'down'); // RSU→ped: crossing timing · vehicle→ped: BSM to warn the phone
    return out;
  }
  if (kind === 'v2v') {                           // BSM exchanged both ways
    if (showUp) { push(a, b, 'BSM', 'up'); push(b, a, 'BSM', 'up'); }
    return out;
  }
  if (kind === 'generic') {
    if (showDown) out.push({ from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, label: 'data', color: MSG_COLOR.data, dir: 'down' });
    return out;
  }
  // ethernet / wireless — real bidirectional V2I traffic.
  // MAP rides the cabinet wire only when it is stored on the TC; the RSU always
  // broadcasts MAP over the air (whether held locally or relaying the TC's copy).
  const [s, d] = orientLink(a, b);
  const down = kind === 'wireless'
    ? ['SPaT', 'MAP', 'TIM', 'SSM']
    : (mapStore === 'tc' ? ['SPaT', 'MAP', 'SSM'] : ['SPaT', 'SSM']);
  if (showDown) down.forEach((m) => push(s, d, m, 'down'));
  if (showUp) ['BSM', 'SRM'].forEach((m) => push(d, s, m, 'up'));
  return out;
}

// Representative message sizes/rates — used for the backhaul bandwidth meter.
const MSG_SPEC = { SPaT: { bytes: 100, hz: 10 }, MAP: { bytes: 1000, hz: 1 }, TIM: { bytes: 300, hz: 1 }, SSM: { bytes: 60, hz: 2 }, BSM: { bytes: 300, hz: 10 }, SRM: { bytes: 80, hz: 2 }, PSM: { bytes: 200, hz: 5 } };
// Approx. downstream load the TC pushes onto the cabinet wire (kbps). MAP only
// rides the wire when it is stored on the TC — that's the tradeoff, quantified.
function backhaulKbps(enabled, mapStore) {
  const msgs = ['SPaT', 'SSM'].concat(mapStore === 'tc' ? ['MAP'] : []);
  let bps = 0;
  msgs.forEach((m) => { if (enabled[m] !== false) { const s = MSG_SPEC[m]; bps += s.bytes * s.hz * 8; } });
  return Math.round(bps / 1000);
}

// Cross-links from the sim to the Glossary.
const MSG_GLOSSARY = { SPaT: 'SPaT (Signal Phase and Timing)', MAP: 'MAP (Intersection Geometry)', BSM: 'BSM (Basic Safety Message)', PSM: 'PSM (Personal Safety Message)', SRM: 'SRM / SSM', SSM: 'SRM / SSM', TIM: 'TIM (Traveler Information Message)' };
const DEVICE_GLOSSARY = { tc: 'Traffic Controller (TC)', rsu: 'Roadside Unit (RSU)', obu: 'On-Board Unit (OBU)', ped: 'VRU (Vulnerable Road User)' };
// Resolve a use-case message/label to a matching Glossary term (or null).
function glossaryTermFor(label) {
  if (MSG_GLOSSARY[label]) return MSG_GLOSSARY[label];
  for (const g of GLOSSARY) { const it = g.items.find((i) => i.term === label || i.term.startsWith(label + ' ')); if (it) return it.term; }
  return null;
}

// Representative decoded payload for a clicked packet, reflecting the live
// security/format state so "what breaks" shows up in the decode too.
function decodePacket(msg, ctx) {
  const sec = ctx.secure
    ? { ieee1609dot2: 'signed · ECDSA-P256', certificate: 'PA5F…9C2E', verified: true }
    : { ieee1609dot2: 'UNSIGNED', verified: false, note: 'OBU drops this frame per IEEE 1609.2' };
  if (ctx.formatOk === false) return { messageId: msg, payload: '??? raw NTCIP 1202 bytes — never converted to J2735', decodable: false, security: sec };
  const base = {
    SPaT: { messageId: 'SPaT', intersectionId: 12109, signalGroup: 4, eventState: 'STOP_AND_REMAIN', minEndTime: '+9.0 s', maxEndTime: '+14.0 s' },
    MAP: { messageId: 'MAP', intersectionId: 12109, refPoint: { lat: 42.30931, lon: -83.06985 }, lanes: 8, laneWidth_cm: 366, revision: 3 },
    BSM: { messageId: 'BSM', tempId: '0x9F3A21', secMark: 34210, lat: 42.30925, lon: -83.06940, speed_mps: 13.4, heading_deg: 271.0, brakeApplied: false },
    PSM: { messageId: 'PSM', userType: 'pedestrian', tempId: '0x4C07', lat: 42.30902, lon: -83.06972, speed_mps: 1.3, heading_deg: 12.0 },
    SRM: { messageId: 'SRM', requestor: 'ambulance', requestedSignalGroup: 4, eta_s: 6.5, priorityLevel: 7 },
    SSM: { messageId: 'SSM', requestId: 41, status: 'granted', signalGroup: 4 },
    TIM: { messageId: 'TIM', advisory: 'reduced speed / work zone', advisorySpeed_kph: 45, appliesTo: 'lane 2, next 300 m' },
    phase: { control: 'NTCIP 1202 phase/timing (not a J2735 radio message)', phase: 2, state: 'GREEN', greenTime_s: 12 },
    data: { note: 'generic link payload' },
  }[msg] || { messageId: msg };
  return (msg === 'phase' || msg === 'data') ? base : { ...base, security: sec };
}

// Explanations shown in the connection detail panel.
const CONN_DESC = {
  ethernet: 'Wired in-cabinet backhaul (IEEE 802.3). Carries NTCIP 1202 phase/timing, and — if MAP is stored on the TC — the SAE J2735 SPaT/MAP down to the RSU.',
  wireless: 'The over-the-air C-V2X / DSRC link. SPaT / MAP / TIM are broadcast to vehicles; BSM / SRM come back from them.',
  v2v: 'Direct vehicle-to-vehicle exchange of BSMs (position, speed, heading, braking) — works with no infrastructure at all.',
  v2p: 'Vehicle-to-pedestrian. The VRU device broadcasts a PSM; in return an RSU can send pedestrian crossing timing (SPaT) and vehicles their BSM, so the phone can warn the pedestrian.',
  signal: 'The controller’s physical phase & timing control that energizes the signal head (red / yellow / green). It is NOT a radio link — but its live state is exactly what the SPaT message reports over the air.',
  generic: 'A generic link between two devices.',
};

// MAP storage tradeoffs, surfaced in the Simulation panel.
const MAP_INFO = {
  rsu: { title: 'MAP on the RSU (local)',
         benefit: 'Low backhaul load & latency; keeps broadcasting even if the TC link drops. Standard for static geometry.',
         draw: 'Provisioned per-RSU — changing lane geometry means re-flashing every unit (config-drift risk).' },
  tc:  { title: 'MAP on the TC (central)',
         benefit: 'Single source of truth — edit geometry once at the controller and it propagates to the RSU.',
         draw: 'Adds constant MAP traffic on the wire; needs a healthy TC link and a J2735-capable ATC.' },
};

/* =====================================================================
   2. UI PRIMITIVES
===================================================================== */
function Segmented({ value, onChange, options }) {
  return (
    <div className="flex rounded-lg border border-zinc-700 bg-zinc-900/70 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
            (value === o.value ? 'bg-neon-cyan text-zinc-950 shadow' : 'text-slate-300 hover:text-white')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Minimal syntax-colored JSON renderer for the packet inspector.
function JsonView({ data, depth }) {
  const d = depth || 1;
  const pad = { paddingLeft: d * 12 };
  if (data === null) return <span className="text-neon-red">null</span>;
  if (Array.isArray(data)) return <span>[{data.map((v, i) => <div key={i} style={pad}><JsonView data={v} depth={d + 1} />{i < data.length - 1 ? ',' : ''}</div>)}]</span>;
  if (typeof data === 'object') return (<span>{'{'}{Object.entries(data).map(([k, v], i, arr) => (<div key={k} style={pad}><span className="text-neon-cyan">{k}</span><span className="text-slate-500">: </span><JsonView data={v} depth={d + 1} />{i < arr.length - 1 ? ',' : ''}</div>))}{'}'}</span>);
  if (typeof data === 'string') return <span className="text-neon-green">"{data}"</span>;
  if (typeof data === 'boolean') return <span className="text-neon-amber">{String(data)}</span>;
  return <span className="text-neon-violet">{String(data)}</span>;
}

/* =====================================================================
   3. WORLD BUILDER
===================================================================== */
const WB = { w: 1000, h: 640 };
let _uid = 0;
// random suffix so ids never collide with those in a loaded saved world
const uid = (t) => `${t}-${++_uid}-${Math.random().toString(36).slice(2, 6)}`;

// Generic localStorage helpers (guarded for the SSR render check + private mode).
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// Persist saved worlds in localStorage.
const WORLDS_KEY = 'v2x_worlds_v1';
const loadWorlds = () => lsGet(WORLDS_KEY, []);
const saveWorlds = (list) => lsSet(WORLDS_KEY, list);

// A world is just { name, objects, conns }. These move it in/out of files & URLs.
const worldPayload = (name, objects, conns) => ({ _v: 1, name, objects, conns });
const encodeWorld = (w) => { try { return encodeURIComponent(JSON.stringify(w)); } catch (e) { return ''; } };
const decodeWorld = (s) => { try { const w = JSON.parse(decodeURIComponent(s)); return w && Array.isArray(w.objects) ? w : null; } catch (e) { return null; } };

// Trigger a browser download of a text file.
function downloadFile(name, text, mime) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  } catch (e) {}
}

// Serialize an SVG with Tailwind/class styles baked in (inline), so it renders
// standalone outside the app. Used for both SVG and PNG canvas export.
const SVG_STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor'];
function serializeStyledSvg(svg, bg) {
  const clone = svg.cloneNode(true);
  const inline = (src, dst) => {
    const cs = getComputedStyle(src);
    let s = '';
    SVG_STYLE_PROPS.forEach((p) => { const v = cs.getPropertyValue(p); if (v) s += p + ':' + v + ';'; });
    dst.setAttribute('style', s);
    for (let i = 0; i < src.children.length; i++) if (dst.children[i]) inline(src.children[i], dst.children[i]);
  };
  inline(svg, clone);
  const vb = (svg.getAttribute('viewBox') || '0 0 1000 640').split(/\s+/);
  const w = +vb[2], h = +vb[3];
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  if (bg) { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('fill', bg); clone.insertBefore(r, clone.firstChild); }
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}
function exportSvg(svg, bg, name) { const { text } = serializeStyledSvg(svg, bg); downloadFile(name, text, 'image/svg+xml'); }
function exportPng(svg, bg, scale, name) {
  const { text, w, h } = serializeStyledSvg(svg, bg);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (!b) return; const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 800); });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
}

// Convert a client (screen) point to SVG viewBox coordinates, handling any
// scaling/letterboxing via the SVG's own coordinate transform matrix.
function svgPoint(svg, cx, cy) {
  const pt = svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

// --- centered SVG artwork for each device/road type ---
function DeviceArt({ type, model, sig }) {
  const label = model ? `${model.vendor} ${model.name}` : TYPES[type].label;
  const tag = (t) => <text y={TYPES[type].size.h / 2 + 16} textAnchor="middle" className="fill-slate-400 text-[10px]">{t}</text>;
  switch (type) {
    case 'tc':
      return (
        <g>
          <rect x="-33" y="-48" width="66" height="96" rx="6" className="fill-zinc-700 stroke-zinc-500" strokeWidth="2" />
          <rect x="-26" y="-40" width="52" height="70" rx="4" className="fill-zinc-800 stroke-zinc-600" />
          <rect x="-22" y="-34" width="44" height="30" rx="4" className="fill-emerald-500/20 stroke-neon-green" />
          <text x="0" y="-14" textAnchor="middle" className="fill-neon-green text-[12px] font-bold">TC</text>
          <text x="0" y="18" textAnchor="middle" className="fill-slate-400 text-[8px]">{model?.gen === 'Classic' ? 'NTCIP 1202' : 'ATC · J2735'}</text>
          {tag(label)}
        </g>
      );
    case 'rsu':
      return (
        <g>
          <rect x="-30" y="-16" width="60" height="34" rx="7" className="fill-emerald-500/20 stroke-neon-green" strokeWidth="2" />
          <line x1="14" y1="-16" x2="22" y2="-30" className="stroke-neon-green" strokeWidth="2" />
          <circle cx="22" cy="-30" r="3" className="fill-neon-green" />
          <text x="0" y="6" textAnchor="middle" className="fill-neon-green text-[12px] font-bold">RSU</text>
          {tag(label)}
        </g>
      );
    case 'obu':
      return (
        <g>
          <rect x="-26" y="-44" width="52" height="88" rx="15" className="fill-blue-700 stroke-blue-300" strokeWidth="2" />
          <rect x="-19" y="-32" width="38" height="22" rx="6" className="fill-blue-200/80" />
          <rect x="-19" y="12" width="38" height="16" rx="5" className="fill-blue-400/70" />
          <rect x="-21" y="-6" width="19" height="12" rx="3" className="fill-emerald-500/25 stroke-neon-green" />
          <text x="-11" y="3" textAnchor="middle" className="fill-neon-green text-[8px] font-bold">OBU</text>
          <rect x="2" y="-6" width="19" height="12" rx="3" className="fill-cyan-500/20 stroke-neon-cyan" />
          <text x="12" y="3" textAnchor="middle" className="fill-neon-cyan text-[7px] font-bold">ADAS</text>
          {tag(label)}
        </g>
      );
    case 'signal': {
      const st = sig || 'red';   // when simulating & wired to a TC, cycles green→yellow→red
      return (
        <g>
          <rect x="-13" y="-38" width="26" height="76" rx="6" className="fill-zinc-950 stroke-zinc-600" strokeWidth="2" />
          <circle cx="0" cy="-22" r="8" className={st === 'red' ? 'fill-neon-red glow-red' : 'fill-zinc-800'} />
          <circle cx="0" cy="0" r="8" className={st === 'yellow' ? 'fill-neon-amber glow-amber' : 'fill-zinc-800'} />
          <circle cx="0" cy="22" r="8" className={st === 'green' ? 'fill-neon-green glow-green' : 'fill-zinc-800'} />
          {tag(model ? model.name : 'Signal Head')}
        </g>
      );
    }
    case 'ped':
      return (
        <g>
          <circle cx="0" cy="-20" r="7" className="fill-none stroke-amber-300" strokeWidth="2.5" />
          <line x1="0" y1="-13" x2="0" y2="8" className="stroke-amber-300" strokeWidth="2.5" />
          <line x1="0" y1="-6" x2="-9" y2="2" className="stroke-amber-300" strokeWidth="2.5" />
          <line x1="0" y1="-6" x2="9" y2="2" className="stroke-amber-300" strokeWidth="2.5" />
          <line x1="0" y1="8" x2="-8" y2="22" className="stroke-amber-300" strokeWidth="2.5" />
          <line x1="0" y1="8" x2="8" y2="22" className="stroke-amber-300" strokeWidth="2.5" />
          <text x="0" y="40" textAnchor="middle" className="fill-amber-300 text-[10px] font-semibold">PSM</text>
        </g>
      );
    case 'roadH':
      return (
        <g>
          <rect x="-170" y="-54" width="340" height="108" className="fill-zinc-800" />
          <line x1="-170" y1="0" x2="170" y2="0" strokeDasharray="22 16" className="stroke-yellow-500/70" strokeWidth="3" />
        </g>
      );
    case 'roadV':
      return (
        <g>
          <rect x="-54" y="-170" width="108" height="340" className="fill-zinc-800" />
          <line x1="0" y1="-170" x2="0" y2="170" strokeDasharray="22 16" className="stroke-yellow-500/70" strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

function SpecSheet({ type, model }) {
  if (!model) return null;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-slate-400 leading-relaxed">{model.tagline}</p>
      <div className="rounded-lg border border-zinc-800 bg-black/40 divide-y divide-zinc-800">
        {Object.entries(model.specs).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-3 py-1.5 text-[12px]">
            <span className="text-slate-500">{k}</span><span className="text-slate-200 text-right">{v}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">✔ Can do</div>
        <ul className="space-y-1">{model.can.map((c, i) => <li key={i} className="text-[12px] text-emerald-200/90 flex gap-1.5"><span>•</span>{c}</li>)}</ul>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-red-400 mb-1">✖ Can’t do</div>
        <ul className="space-y-1">{model.cannot.map((c, i) => <li key={i} className="text-[12px] text-red-200/80 flex gap-1.5"><span>•</span>{c}</li>)}</ul>
      </div>
    </div>
  );
}

function WorldBuilderTab({ openGlossary }) {
  const prefs = lsGet('v2x_wb_prefs', {});              // restore UI state across reloads
  const startWorld = loadWorlds().find((w) => w.id === prefs.activeId) || null;
  const [objects, setObjects] = useState(() => (startWorld ? startWorld.objects : []));
  const [conns, setConns] = useState(() => (startWorld ? startWorld.conns : []));
  const [sel, setSel] = useState(null);              // {kind:'obj'|'conn', id}
  const [snap, setSnap] = useState(prefs.snap !== undefined ? prefs.snap : true);
  const drag = useRef(null);                          // {id, ox, oy, pre, moved}
  const [wiring, setWiring] = useState(null);         // {from, x, y}
  const [sim, setSim] = useState(false);              // "Simulate this world" running?
  const [phase, setPhase] = useState(0);              // looping 0..1 clock for packet flow
  const [dirMode, setDirMode] = useState(prefs.dirMode || 'both'); // 'fwd' | 'rev' | 'both'
  const [enabled, setEnabled] = useState(prefs.enabled || {});     // per-message on/off (missing = on)
  const [mapStore, setMapStore] = useState(prefs.mapStore || 'rsu'); // MAP geometry: 'rsu' | 'tc'
  const [worlds, setWorlds] = useState(loadWorlds);   // saved worlds (localStorage)
  const [activeId, setActiveId] = useState(startWorld ? startWorld.id : null);
  const [worldName, setWorldName] = useState(startWorld ? startWorld.name : '');
  const [undoStack, setUndo] = useState([]);
  const [redoStack, setRedo] = useState([]);
  const [packetInspect, setPacketInspect] = useState(null); // clicked-packet drawer
  const simRaf = useRef(null);
  const svgRef = useRef(null);
  const fileRef = useRef(null);                        // hidden <input type=file> for import

  const byId = useMemo(() => Object.fromEntries(objects.map((o) => [o.id, o])), [objects]);
  const selObj = sel?.kind === 'obj' ? byId[sel.id] : null;
  const selConn = sel?.kind === 'conn' ? conns.find((c) => c.id === sel.id) : null;

  const snapV = (v) => (snap ? Math.round(v / 10) * 10 : Math.round(v));
  const clampC = (o) => ({ ...o, x: Math.max(20, Math.min(WB.w - 20, o.x)), y: Math.max(20, Math.min(WB.h - 20, o.y)) });

  // ----- undo / redo (snapshot current canvas before each discrete edit) -----
  const pushUndo = () => { setUndo((u) => [...u.slice(-49), { objects, conns }]); setRedo([]); };
  const undo = () => { if (!undoStack.length) return; const prev = undoStack[undoStack.length - 1]; setRedo((r) => [...r, { objects, conns }]); setUndo((u) => u.slice(0, -1)); setObjects(prev.objects); setConns(prev.conns); setSel(null); };
  const redo = () => { if (!redoStack.length) return; const nxt = redoStack[redoStack.length - 1]; setUndo((u) => [...u, { objects, conns }]); setRedo((r) => r.slice(0, -1)); setObjects(nxt.objects); setConns(nxt.conns); setSel(null); };

  const addObject = (type, pos) => {
    pushUndo();
    const modelId = MODELS[type]?.[0]?.id;
    const o = clampC({ id: uid(type), type, modelId, x: snapV(pos.x), y: snapV(pos.y) });
    setObjects((prev) => [...prev, o]);
    setSel({ kind: 'obj', id: o.id });
  };

  // Drop a whole pre-wired 4-way intersection: roads, TC, RSU, four signal
  // heads (each wired to the TC) and an approaching vehicle wired to the RSU.
  const addIntersection = (pos) => {
    pushUndo();
    const cx = pos.x, cy = pos.y;
    const mk = (type, dx, dy) => clampC({ id: uid(type), type, modelId: MODELS[type]?.[0]?.id, x: cx + dx, y: cy + dy });
    const roadH = mk('roadH', 0, 0), roadV = mk('roadV', 0, 0);
    const sN = mk('signal', -70, -74), sE = mk('signal', 74, -70), sS = mk('signal', 70, 74), sW = mk('signal', -74, 70);
    const tc = mk('tc', -232, 96), rsu = mk('rsu', 232, -96), obu = mk('obu', 60, 150);
    const c = (from, to) => ({ id: uid('c'), from: from.id, to: to.id });
    setObjects((prev) => [...prev, roadH, roadV, sN, sE, sS, sW, tc, rsu, obu]);
    setConns((prev) => [...prev, c(tc, rsu), c(tc, sN), c(tc, sE), c(tc, sS), c(tc, sW), c(rsu, obu)]);
    setSel(null);
  };
  const removeSelected = useCallback(() => {
    if (!sel) return;
    setUndo((u) => [...u.slice(-49), { objects, conns }]); setRedo([]);
    if (sel.kind === 'obj') {
      setObjects((prev) => prev.filter((o) => o.id !== sel.id));
      setConns((prev) => prev.filter((c) => c.from !== sel.id && c.to !== sel.id));
    } else {
      setConns((prev) => prev.filter((c) => c.id !== sel.id));
    }
    setSel(null);
  }, [sel, objects, conns]);

  // ----- world management (save / load / delete / new) -----
  const persistWorlds = (list) => { setWorlds(list); saveWorlds(list); };
  const newWorld = () => { pushUndo(); setObjects([]); setConns([]); setSel(null); setSim(false); setActiveId(null); setWorldName(''); };
  const saveWorld = () => {
    const name = (worldName.trim() || 'Untitled world');
    if (activeId && worlds.some((w) => w.id === activeId)) {
      persistWorlds(worlds.map((w) => w.id === activeId ? { ...w, name, objects, conns } : w));
    } else {
      const w = { id: 'w-' + Date.now().toString(36), name, objects, conns };
      persistWorlds([...worlds, w]); setActiveId(w.id);
    }
  };
  const loadWorld = (w) => { pushUndo(); setObjects(w.objects || []); setConns(w.conns || []); setSel(null); setSim(false); setActiveId(w.id); setWorldName(w.name); };
  const deleteWorld = (id) => {
    const w = worlds.find((x) => x.id === id);
    if (!window.confirm(`Delete world "${w ? w.name : ''}"? This cannot be undone.`)) return;
    persistWorlds(worlds.filter((x) => x.id !== id));
    if (activeId === id) newWorld();
  };
  const clearAll = () => {
    if (!objects.length && !conns.length) return;
    if (!window.confirm('Clear the whole canvas? (You can still Undo.)')) return;
    pushUndo(); setObjects([]); setConns([]); setSel(null); setSim(false);
  };

  // ----- portability: file export / import + shareable link -----
  const exportWorld = () => {
    const name = (worldName.trim() || 'v2x-world');
    downloadFile(name.replace(/\s+/g, '_') + '.v2xworld.json', JSON.stringify(worldPayload(name, objects, conns), null, 2), 'application/json');
  };
  const importWorld = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const w = (() => { try { const p = JSON.parse(r.result); return p && Array.isArray(p.objects) ? p : null; } catch (e) { return null; } })();
      if (!w) { window.alert('That file is not a valid V2X world (.v2xworld.json).'); return; }
      const nw = { id: 'w-' + Date.now().toString(36), name: w.name || 'Imported world', objects: w.objects, conns: w.conns || [] };
      persistWorlds([...worlds, nw]); loadWorld(nw);
    };
    r.readAsText(file);
  };
  const shareLink = () => {
    const encoded = encodeWorld(worldPayload(worldName.trim() || 'Shared world', objects, conns));
    const base = window.location.href.split('#')[0];
    const url = base + '#world=' + encoded;
    try { window.location.hash = 'world=' + encoded; } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => window.alert('Share link copied to clipboard.'), () => window.alert('Link is in the address bar — copy it to share.'));
    } else { window.alert('Link is in the address bar — copy it to share.'); }
  };
  const exportImage = (fmt) => { if (svgRef.current) (fmt === 'png' ? exportPng(svgRef.current, '#09090b', 2, 'v2x-world.png') : exportSvg(svgRef.current, '#09090b', 'v2x-world.svg')); };

  // persist UI state (snap / sim settings / last-open world) across reloads
  useEffect(() => { lsSet('v2x_wb_prefs', { snap, dirMode, enabled, mapStore, activeId, worldName }); }, [snap, dirMode, enabled, mapStore, activeId, worldName]);
  // load a world shared via URL hash on first mount
  useEffect(() => {
    const m = (window.location.hash || '').match(/world=([^&]+)/);
    if (m) { const w = decodeWorld(m[1]); if (w) { setObjects(w.objects); setConns(w.conns || []); setWorldName(w.name || 'Shared world'); setActiveId(null); setSel(null); } }
  }, []);

  // keyboard: delete + undo/redo
  useEffect(() => {
    const h = (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !typing) { e.preventDefault(); removeSelected(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [sel, removeSelected, undo, redo]);

  // "Simulate this world" — a looping clock that drives packets along every wired link.
  useEffect(() => {
    if (!sim) return;
    const start = performance.now();
    const loop = (now) => { setPhase(((now - start) / 2200) % 1); simRaf.current = requestAnimationFrame(loop); };
    simRaf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(simRaf.current);
  }, [sim]);
  // stop simulating if all links vanish
  useEffect(() => { if (sim && conns.length === 0) setSim(false); }, [sim, conns.length]);

  // palette drop
  const placeAt = (type, pos) => (type === 'intersection' ? addIntersection(pos) : addObject(type, pos));
  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('v2x/type');
    if (!type || !svgRef.current) return;
    placeAt(type, svgPoint(svgRef.current, e.clientX, e.clientY));
  };

  // pointer interactions on the canvas
  const onPointerMove = (e) => {
    if (!svgRef.current) return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    if (drag.current) {
      const { id, ox, oy } = drag.current;
      drag.current.moved = true;
      setObjects((prev) => prev.map((o) => o.id === id ? clampC({ ...o, x: snapV(p.x - ox), y: snapV(p.y - oy) }) : o));
    } else if (wiring) {
      setWiring({ ...wiring, x: p.x, y: p.y });
    }
  };
  const endInteraction = (e) => {
    // a drag that actually moved is one undo step
    if (drag.current && drag.current.moved) { const pre = drag.current.pre; setUndo((u) => [...u.slice(-49), pre]); setRedo([]); }
    if (wiring && svgRef.current) {
      const p = svgPoint(svgRef.current, e.clientX, e.clientY);
      // find nearest other device within grab radius
      let best = null, bestD = 70 * 70;
      objects.forEach((o) => {
        if (o.id === wiring.from || o.type === 'roadH' || o.type === 'roadV') return;
        const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = o; }
      });
      if (best) {
        const exists = conns.some((c) => (c.from === wiring.from && c.to === best.id) || (c.from === best.id && c.to === wiring.from));
        if (!exists) { setUndo((u) => [...u.slice(-49), { objects, conns }]); setRedo([]); setConns((prev) => [...prev, { id: uid('c'), from: wiring.from, to: best.id }]); }
      }
    }
    drag.current = null;
    setWiring(null);
  };

  const startDrag = (o, e) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    drag.current = { id: o.id, ox: p.x - o.x, oy: p.y - o.y, pre: { objects, conns }, moved: false };
    setSel({ kind: 'obj', id: o.id });
  };
  const startWire = (o, e) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    setWiring({ from: o.id, x: p.x, y: p.y });
    setSel({ kind: 'obj', id: o.id });
  };

  const roads = objects.filter((o) => TYPES[o.type].cat === 'road');
  const devices = objects.filter((o) => TYPES[o.type].cat === 'device');

  // ----- "what breaks": per-RSU security (1609.2) + protocol conversion -----
  const rsuSecure = (o) => o.secure !== false;      // default ON
  const rsuConvert = (o) => o.convert !== false;    // default ON
  // Is a Classic (NTCIP-only) TC feeding this RSU over the cabinet wire?
  const upstreamClassic = (rsuId) => {
    const link = conns.find((c) => (c.from === rsuId && byId[c.to]?.type === 'tc') || (c.to === rsuId && byId[c.from]?.type === 'tc'));
    if (!link) return false;
    const tc = byId[link.from]?.type === 'tc' ? byId[link.from] : byId[link.to];
    const model = MODELS.tc.find((m) => m.id === tc.modelId);
    return model?.gen === 'Classic';
  };
  // Fault applied to a stream on a wireless (RSU↔OBU) link, else null.
  const streamFault = (rsu, classic, st) => {
    if (!rsuSecure(rsu)) return 'security';                                   // unsigned → OBU rejects
    if (st.dir === 'down' && classic && !rsuConvert(rsu)) return 'format';    // raw NTCIP never converted
    return null;
  };

  const paletteGroups = [
    { title: 'Templates', items: ['intersection'] },
    { title: 'Devices', items: ['tc', 'rsu', 'obu', 'signal', 'ped'] },
    { title: 'Scenery', items: ['roadH', 'roadV'] },
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* palette */}
      <div className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950/60 p-3 overflow-auto">
        {/* Worlds: save / load / delete / switch */}
        <div className="mb-4 pb-3 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Worlds</h2>
            <button onClick={newWorld} className="text-[11px] text-neon-cyan hover:underline">+ New</button>
          </div>
          <div className="flex gap-1">
            <input value={worldName} onChange={(e) => setWorldName(e.target.value)} placeholder="Name this world"
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-neon-cyan focus:outline-none" />
            <button onClick={saveWorld} className="shrink-0 rounded bg-neon-cyan/20 text-neon-cyan px-2 py-1 text-[11px] font-semibold hover:bg-neon-cyan/30">
              {activeId && worlds.some((w) => w.id === activeId) ? 'Update' : 'Save'}
            </button>
          </div>
          {worlds.length > 0 ? (
            <div className="mt-2 space-y-1">
              {worlds.map((w) => (
                <div key={w.id} className={'flex items-center gap-1 rounded px-2 py-1 ' + (activeId === w.id ? 'bg-neon-cyan/10' : 'hover:bg-zinc-900')}>
                  <button onClick={() => loadWorld(w)} className={'min-w-0 flex-1 truncate text-left text-[12px] ' + (activeId === w.id ? 'text-neon-cyan' : 'text-slate-200')}>{w.name}</button>
                  <span className="shrink-0 text-[9px] text-slate-500">{(w.objects || []).length}d·{(w.conns || []).length}l</span>
                  <button onClick={() => deleteWorld(w.id)} title="Delete world" className="shrink-0 text-slate-500 hover:text-neon-red text-[12px]">✕</button>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-[11px] text-slate-500">No saved worlds yet — build one, name it, and Save.</p>}

          {/* portability */}
          <div className="mt-2 flex items-center gap-1 text-[11px]">
            <button onClick={exportWorld} title="Download this world as a .json file" className="rounded border border-zinc-700 px-2 py-1 text-slate-300 hover:border-zinc-500">⭳ Export</button>
            <button onClick={() => fileRef.current && fileRef.current.click()} title="Load a world from a .json file" className="rounded border border-zinc-700 px-2 py-1 text-slate-300 hover:border-zinc-500">⭱ Import</button>
            <button onClick={shareLink} title="Copy a shareable link" className="rounded border border-zinc-700 px-2 py-1 text-slate-300 hover:border-zinc-500">🔗 Share</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => { importWorld(e.target.files && e.target.files[0]); e.target.value = ''; }} />
          </div>
        </div>

        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Palette</h2>
        <p className="text-[11px] text-slate-500 mb-3">Drag onto the canvas (or click to drop at center).</p>
        {paletteGroups.map((g) => (
          <div key={g.title} className="mb-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">{g.title}</div>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((t) => (
                <div key={t} draggable
                  onDragStart={(e) => e.dataTransfer.setData('v2x/type', t)}
                  onClick={() => placeAt(t, { x: WB.w / 2, y: WB.h / 2 })}
                  className={'cursor-grab active:cursor-grabbing rounded-lg border bg-zinc-900/70 px-2 py-2 text-center transition ' +
                    (t === 'intersection' ? 'border-neon-violet/50 hover:border-neon-violet col-span-2' : 'border-zinc-700 hover:border-neon-cyan/60')}>
                  <div className="text-xl leading-none">{TYPES[t].glyph}</div>
                  <div className="mt-1 text-[10px] text-slate-300 leading-tight">{TYPES[t].label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-[11px] text-slate-400 leading-relaxed">
          <p className="font-semibold text-slate-300 mb-1">Wiring</p>
          Hover a device and drag from its <span className="text-neon-cyan">◦ port</span> to another device to lay a cable / radio link.
        </div>
      </div>

      {/* canvas */}
      <div className="relative flex-1 min-w-0 p-4">
        {/* toolbar */}
        <div className="absolute left-6 top-6 z-10 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-[11px]">
          <span className="text-slate-400">{devices.length} device{devices.length !== 1 ? 's' : ''} · {conns.length} link{conns.length !== 1 ? 's' : ''}</span>
          <span className="text-zinc-700">|</span>
          <button onClick={undo} disabled={!undoStack.length} title="Undo (⌘Z)" className={'rounded px-1.5 py-0.5 ' + (undoStack.length ? 'text-slate-300 hover:text-white' : 'text-slate-600 cursor-not-allowed')}>↶</button>
          <button onClick={redo} disabled={!redoStack.length} title="Redo (⌘⇧Z)" className={'rounded px-1.5 py-0.5 ' + (redoStack.length ? 'text-slate-300 hover:text-white' : 'text-slate-600 cursor-not-allowed')}>↷</button>
          <span className="text-zinc-700">|</span>
          <button onClick={() => setSnap((s) => !s)} className={'rounded px-2 py-0.5 ' + (snap ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-slate-400 hover:text-white')}>Snap {snap ? 'on' : 'off'}</button>
          <button onClick={() => exportImage('png')} title="Export canvas as PNG" className="rounded px-2 py-0.5 text-slate-400 hover:text-white">PNG</button>
          <button onClick={() => exportImage('svg')} title="Export canvas as SVG" className="rounded px-2 py-0.5 text-slate-400 hover:text-white">SVG</button>
          <button onClick={clearAll} className="rounded px-2 py-0.5 text-slate-400 hover:text-neon-red">Clear all</button>
          <span className="text-zinc-700">|</span>
          <button onClick={() => { if (conns.length) setSim((s) => !s); }} disabled={!conns.length}
            title={conns.length ? '' : 'Wire at least one link first'}
            className={'rounded px-2 py-0.5 font-semibold transition ' + (sim ? 'bg-neon-red/20 text-neon-red' : conns.length ? 'bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30' : 'text-slate-600 cursor-not-allowed')}>
            {sim ? '■ Stop simulation' : '▶ Simulate this world'}
          </button>
        </div>

        <div className="h-full rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden"
             onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <svg ref={svgRef} viewBox={`0 0 ${WB.w} ${WB.h}`} className="w-full h-full select-none"
            onPointerMove={onPointerMove} onPointerUp={endInteraction} onPointerLeave={endInteraction}
            onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.dataset.bg) setSel(null); }}>
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0V32" fill="none" stroke="#1e293b" strokeWidth="1" />
              </pattern>
            </defs>
            <rect data-bg="1" width={WB.w} height={WB.h} fill="url(#grid)" />

            {/* roads (behind) */}
            {roads.map((o) => (
              <g key={o.id} transform={`translate(${o.x},${o.y})`} style={{ cursor: 'move' }}
                 className={sel?.id === o.id ? 'part-hi' : ''}
                 onPointerDown={(e) => startDrag(o, e)}>
                <DeviceArt type={o.type} />
                <rect x={-TYPES[o.type].size.w / 2} y={-TYPES[o.type].size.h / 2} width={TYPES[o.type].size.w} height={TYPES[o.type].size.h}
                  fill="transparent" stroke={sel?.id === o.id ? '#22d3ee' : 'transparent'} strokeDasharray="6 5" strokeWidth="1.5" />
              </g>
            ))}

            {/* radio range hint for RSUs (non-interactive so it never blocks canvas clicks) */}
            {devices.filter((o) => o.type === 'rsu').map((o) => (
              <circle key={'r' + o.id} cx={o.x} cy={o.y} r="150" fill="#a78bfa10" stroke="#a78bfa" strokeOpacity="0.25" strokeDasharray="4 8" style={{ pointerEvents: 'none' }} />
            ))}

            {/* connections */}
            {conns.map((c) => {
              const a = byId[c.from], b = byId[c.to]; if (!a || !b) return null;
              const st = CONN_STYLE[connKind(a.type, b.type)];
              const isSel = sel?.kind === 'conn' && sel.id === c.id;
              return (
                <g key={c.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'conn', id: c.id }); }}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="14" />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={st.color} strokeWidth={isSel ? 4 : 2.5}
                    strokeDasharray={st.dash} className={isSel ? 'glow-cyan' : ''} />
                </g>
              );
            })}

            {/* temp wiring line */}
            {wiring && byId[wiring.from] && (
              <line x1={byId[wiring.from].x} y1={byId[wiring.from].y} x2={wiring.x} y2={wiring.y}
                stroke="#22d3ee" strokeWidth="2.5" strokeDasharray="4 5" className="glow-cyan" />
            )}

            {/* devices */}
            {devices.map((o) => {
              const sz = TYPES[o.type].size;
              const model = MODELS[o.type]?.find((m) => m.id === o.modelId);
              const isSel = sel?.kind === 'obj' && sel.id === o.id;
              // While simulating, a signal head wired to a TC visibly cycles — proof the TC drives it.
              let sig;
              if (o.type === 'signal' && sim) {
                const wiredToTC = conns.some((c) => { const oth = c.from === o.id ? byId[c.to] : c.to === o.id ? byId[c.from] : null; return oth && oth.type === 'tc'; });
                if (wiredToTC) sig = phase < 0.5 ? 'green' : phase < 0.62 ? 'yellow' : 'red';
              }
              return (
                <g key={o.id} transform={`translate(${o.x},${o.y})`} className={'spart ' + (isSel ? 'part-hi' : '')}
                   style={{ cursor: 'move' }} onPointerDown={(e) => startDrag(o, e)}>
                  {/* selection outline + hit padding */}
                  <rect x={-sz.w / 2 - 4} y={-sz.h / 2 - 4} width={sz.w + 8} height={sz.h + 8} rx="8"
                    fill="transparent" stroke={isSel ? '#22d3ee' : 'transparent'} strokeDasharray="6 5" />
                  <DeviceArt type={o.type} model={model} sig={sig} />
                  {/* wiring port (its own handler pre-empts the group drag) */}
                  <circle cx="0" cy={-sz.h / 2 - 14} r="6" className="fill-zinc-950 stroke-neon-cyan" strokeWidth="2"
                    style={{ cursor: 'crosshair' }} onPointerDown={(e) => startWire(o, e)} />
                </g>
              );
            })}

            {/* ---- "Simulate this world": packets flowing across every wired link ---- */}
            {sim && (
              <g>
                {devices.filter((o) => o.type === 'rsu').map((o) => (
                  <g key={o.id + 'rsu'} style={{ pointerEvents: 'none' }}>
                    {[0, 1].map((k) => <circle key={k} cx={o.x} cy={o.y} r={22 + k * 16} fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.5" className="radiowave" style={{ animationDelay: k * 0.4 + 's' }} />)}
                    {/* security / conversion status badges */}
                    <text x={o.x} y={o.y - 30} textAnchor="middle" className="text-[13px]">{rsuSecure(o) ? '🔒' : '🔓'}</text>
                    {upstreamClassic(o.id) && !rsuConvert(o) && <text x={o.x + 20} y={o.y - 30} textAnchor="middle" className="text-[13px]">⚠️</text>}
                  </g>
                ))}
                {conns.map((c) => {
                  const a = byId[c.from], b = byId[c.to]; if (!a || !b) return null;
                  const streams = linkStreams(a, b, dirMode, enabled, mapStore);
                  const kind = connKind(a.type, b.type);
                  const rsu = kind === 'wireless' ? (a.type === 'rsu' ? a : b) : null;
                  const classic = rsu ? upstreamClassic(rsu.id) : false;
                  return streams.map((st, idx) => {
                    const p = (phase + idx / streams.length) % 1;
                    const x = st.from.x + (st.to.x - st.from.x) * p, y = st.from.y + (st.to.y - st.from.y) * p;
                    const fault = rsu ? streamFault(rsu, classic, st) : null;
                    const col = fault ? '#f87171' : st.color;
                    const open = () => setPacketInspect({ msg: st.label, fromType: null, toType: null, secure: !(fault === 'security'), formatOk: fault !== 'format', fault, aType: a.type, bType: b.type });
                    return (
                      <g key={c.id + '-' + idx} transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); open(); }}>
                        <rect x="-10" y="-10" width="20" height="20" rx="4" fill={col + '55'} stroke={col} strokeWidth="2" className="glow-cyan" />
                        {fault === 'security' && <text x="0" y="5" textAnchor="middle" className="fill-neon-red text-[13px] font-bold">✖</text>}
                        {fault === 'format' && <text x="0" y="5" textAnchor="middle" className="fill-neon-red text-[14px] font-bold">?</text>}
                        <text x="0" y="-13" textAnchor="middle" fill={col} className="text-[8px] font-bold">{fault === 'security' ? 'rejected' : fault === 'format' ? 'unformatted' : st.label}</text>
                      </g>
                    );
                  });
                })}
              </g>
            )}
          </svg>
        </div>

        {objects.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-2">🛠️</div>
              <div className="text-sm">Drag devices from the palette to build your intersection</div>
              <div className="text-[12px] mt-1">then drag each device’s <span className="text-neon-cyan">◦ port</span> to another to wire them</div>
            </div>
          </div>
        )}

        {/* packet inspector drawer (click a flowing packet during simulation) */}
        {packetInspect && (() => {
          const pk = packetInspect;
          const term = MSG_GLOSSARY[pk.msg];
          const gi = term ? (() => { for (const g of GLOSSARY) { const it = g.items.find((i) => i.term === term); if (it) return it; } return null; })() : null;
          const faultText = pk.fault === 'security'
            ? 'Unsigned frame → the OBU rejects it (IEEE 1609.2). Turn Security signing ON at the RSU.'
            : pk.fault === 'format'
              ? 'A Classic (NTCIP-only) TC feeds this RSU, but Protocol conversion is OFF — the vehicle receives raw bytes it can’t decode.'
              : null;
          return (
            <div className="absolute inset-y-4 right-4 z-20 w-[360px] max-w-[85%] rounded-xl border border-zinc-700 bg-zinc-950/95 backdrop-blur flex flex-col shadow-2xl">
              <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={'h-2 w-2 rounded-full ' + (pk.fault ? 'bg-neon-red' : 'bg-neon-green') + ' animate-pulse'} />
                  <h3 className="text-sm font-semibold text-slate-100 font-mono">{pk.msg}</h3>
                  <span className="text-[11px] text-slate-500">{pk.aType} ↔ {pk.bType}</span>
                </div>
                <button onClick={() => setPacketInspect(null)} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
              </header>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {faultText && <div className="rounded-lg border border-red-700/60 bg-red-500/10 p-2.5 text-[12px] text-red-200">⚠ {faultText}</div>}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Decoded payload (representative)</div>
                  <div className="rounded-lg border border-zinc-800 bg-black/60 p-3"><pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words"><JsonView data={decodePacket(pk.msg, { secure: pk.secure, formatOk: pk.formatOk })} /></pre></div>
                </div>
                {gi && gi.format && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Wire format</div>
                    <pre className="rounded-lg border border-zinc-800 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-slate-200 overflow-auto whitespace-pre max-h-52">{gi.format}</pre>
                  </div>
                )}
                {term && openGlossary && (
                  <button onClick={() => openGlossary(term)} className="w-full rounded-lg border border-neon-cyan/50 bg-neon-cyan/10 px-3 py-2 text-sm text-neon-cyan hover:bg-neon-cyan/20">View “{pk.msg}” in Glossary ↗</button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* properties / spec + simulation panel */}
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto flex flex-col">
        {/* Simulation controls */}
        <div className="mb-4 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-2"><span className="text-lg">🎬</span><h3 className="text-sm font-semibold text-slate-100">Simulation</h3></div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Direction</div>
          <Segmented value={dirMode} onChange={setDirMode}
            options={[{ value: 'fwd', label: 'Forward' }, { value: 'rev', label: 'Reverse' }, { value: 'both', label: 'Both' }]} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            <span className="text-slate-300">Forward</span>: infrastructure → vehicle (SPaT/MAP/TIM). <span className="text-slate-300">Reverse</span>: vehicle/VRU → infrastructure (BSM/SRM/PSM).
          </p>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-3 mb-1.5">SAE J2735 messages</div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MSGS.map((mm) => {
              const isOn = enabled[mm] !== false;
              return (
                <button key={mm} onClick={() => setEnabled((e) => ({ ...e, [mm]: !isOn }))}
                  style={isOn ? { color: MSG_COLOR[mm], borderColor: MSG_COLOR[mm] } : {}}
                  className={'rounded-md border px-2 py-1 font-mono text-[11px] transition ' + (isOn ? 'bg-white/5' : 'border-zinc-700 text-slate-600 line-through')}>{mm}</button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Pick messages, then hit <span className="text-neon-cyan">▶ Simulate this world</span> in the toolbar.</p>

          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-3 mb-1.5">MAP geometry stored on</div>
          <Segmented value={mapStore} onChange={setMapStore}
            options={[{ value: 'rsu', label: 'RSU' }, { value: 'tc', label: 'TC' }]} />
          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
            <div className="text-[12px] font-semibold text-slate-200">{MAP_INFO[mapStore].title}</div>
            <div className="mt-1 text-[11px] text-emerald-300/90"><span className="font-semibold">✔ </span>{MAP_INFO[mapStore].benefit}</div>
            <div className="mt-1 text-[11px] text-amber-300/90"><span className="font-semibold">✖ </span>{MAP_INFO[mapStore].draw}</div>
            {/* quantified backhaul meter */}
            {(() => { const kb = backhaulKbps(enabled, mapStore); const max = 20; return (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px]"><span className="text-slate-400">Est. cabinet backhaul (downstream)</span><span className="font-mono text-slate-200">≈ {kb} kbps</span></div>
                <div className="mt-1 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: Math.min(100, (kb / max) * 100) + '%', background: mapStore === 'tc' ? '#fbbf24' : '#34d399' }} /></div>
                <div className="mt-1 text-[10px] text-slate-500">SPaT 100 B @ 10 Hz · SSM 60 B @ 2 Hz{mapStore === 'tc' ? ' · MAP 1 KB @ 1 Hz (+8 kbps)' : ' · MAP broadcast locally by RSU (0 on wire)'}</div>
              </div>
            ); })()}
          </div>
        </div>

        {!sel && <div className="text-sm text-slate-500">Select a device or link to see its properties &amp; spec sheet.</div>}

        {selConn && byId[selConn.from] && byId[selConn.to] && (() => {
          const a = byId[selConn.from], b = byId[selConn.to];
          const kind = connKind(a.type, b.type);
          return (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">Connection</h3>
              <div className="rounded-lg border border-zinc-800 bg-black/40 p-3 text-[12px] text-slate-300">
                <div>{TYPES[a.type].label} ↔ {TYPES[b.type].label}</div>
                <div className="mt-1" style={{ color: CONN_STYLE[kind].color }}>{CONN_STYLE[kind].label}</div>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-400">{CONN_DESC[kind]}</p>
              <button onClick={removeSelected} className="w-full rounded-lg border border-red-700/60 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20">Delete link</button>
            </div>
          );
        })()}

        {selObj && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{TYPES[selObj.type].glyph}</span>
              <h3 className="text-sm font-semibold text-slate-100">{TYPES[selObj.type].label}</h3>
            </div>

            {MODELS[selObj.type] && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Model</div>
                <div className="space-y-1.5">
                  {MODELS[selObj.type].map((m) => (
                    <button key={m.id}
                      onClick={() => { pushUndo(); setObjects((prev) => prev.map((o) => o.id === selObj.id ? { ...o, modelId: m.id } : o)); }}
                      className={'w-full rounded-lg border px-3 py-2 text-left transition ' +
                        (selObj.modelId === m.id ? 'border-neon-cyan bg-neon-cyan/10' : 'border-zinc-700 bg-zinc-900/60 hover:border-zinc-500')}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-slate-100">{m.vendor} {m.name}</span>
                        {m.gen !== '—' && <span className={'text-[9px] px-1.5 py-0.5 rounded ' + (m.gen === 'Classic' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300')}>{m.gen}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <SpecSheet type={selObj.type} model={MODELS[selObj.type]?.find((m) => m.id === selObj.modelId)} />

            {/* RSU behaviour toggles — the "what breaks" controls */}
            {selObj.type === 'rsu' && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">RSU behaviour</div>
                {[{ k: 'secure', on: rsuSecure(selObj), label: 'Security signing (1609.2)', sub: 'off → OBU rejects unsigned frames' },
                  { k: 'convert', on: rsuConvert(selObj), label: 'Protocol conversion', sub: 'NTCIP 1202 → J2735 (matters for a Classic TC)' }].map((t) => (
                  <button key={t.k} onClick={() => { pushUndo(); setObjects((prev) => prev.map((o) => o.id === selObj.id ? { ...o, [t.k]: !t.on } : o)); }}
                    className="w-full flex items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900/70 px-2.5 py-1.5 text-left hover:border-zinc-500">
                    <span className="min-w-0"><span className="block text-[12px] text-slate-100">{t.label}</span><span className="block text-[10px] text-slate-500 truncate">{t.sub}</span></span>
                    <span className={'relative h-5 w-9 shrink-0 rounded-full transition ' + (t.on ? 'bg-neon-green' : 'bg-zinc-700')}><span className={'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ' + (t.on ? 'left-4' : 'left-0.5')} /></span>
                  </button>
                ))}
                <p className="text-[10px] text-slate-500">Run the sim to watch packets get rejected/unformatted when these are off.</p>
              </div>
            )}

            {DEVICE_GLOSSARY[selObj.type] && openGlossary && (
              <button onClick={() => openGlossary(DEVICE_GLOSSARY[selObj.type])} className="w-full rounded-lg border border-neon-cyan/40 bg-neon-cyan/5 px-3 py-2 text-[13px] text-neon-cyan hover:bg-neon-cyan/15">View in Glossary ↗</button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { pushUndo(); const n = clampC({ ...selObj, id: uid(selObj.type), x: selObj.x + 40, y: selObj.y + 40 }); setObjects((p) => [...p, n]); setSel({ kind: 'obj', id: n.id }); }}
                className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-slate-300 hover:border-zinc-500">Duplicate</button>
              <button onClick={removeSelected} className="flex-1 rounded-lg border border-red-700/60 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20">Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   4. USE CASES — animated scenario simulations
===================================================================== */
const MS = { w: 900, h: 520 };
const G = {
  ewY0: 205, ewY1: 305, nsX0: 400, nsX1: 500,
  ewLaneY: 272, nsLaneX: 452,
  ewStop: 350, nsStop: 340,
  rsu: { x: 560, y: 150 }, tc: { x: 636, y: 150 },
  ewHead: { x: 356, y: 150 }, nsHead: { x: 520, y: 336 },
  tower: { x: 812, y: 118 }, cloud: { x: 700, y: 66 },
};

// Communication categories the Use Cases are grouped by (who talks to whom).
const CATEGORIES = [
  { id: 'V2I', label: 'V2I', name: 'Vehicle → Infrastructure', desc: 'Vehicles ↔ roadside signals & controllers' },
  { id: 'V2V', label: 'V2V', name: 'Vehicle → Vehicle', desc: 'Vehicles talk directly to each other' },
  { id: 'V2P', label: 'V2P', name: 'Vehicle → Pedestrian', desc: 'Vehicles ↔ vulnerable road users (VRUs)' },
  { id: 'V2N', label: 'V2N', name: 'Vehicle → Network', desc: 'Vehicles ↔ cloud / TMC over cellular' },
];

function lightColor(state) { return state === 'green' ? TONE.green : state === 'yellow' ? TONE.amber : TONE.red; }

function MiniScene({ frame }) {
  const f = frame;
  const layout = f.layout || 'cross';       // 'cross' | 'straightH'
  const infra = f.infra || 'signals';       // 'signals' | 'tower' | 'none'
  const ewMid = (G.ewY0 + G.ewY1) / 2;

  // Concentric fading rings used for any wireless broadcast (RSU, car, ped, tower).
  const broadcast = (cx, cy, color, animate) => [0, 1, 2].map((k) => (
    <circle key={cx + '-' + cy + '-' + k} cx={cx} cy={cy} r={15 + k * 11} fill="none" stroke={color} strokeWidth="2"
      opacity="0.5" className={animate ? 'radiowave' : ''} style={{ animationDelay: k * 0.35 + 's' }} />
  ));

  const head = (pos, color) => (
    <g transform={`translate(${pos.x},${pos.y})`}>
      <rect x="-12" y="-30" width="24" height="60" rx="5" className="fill-zinc-950 stroke-zinc-600" />
      <circle cx="0" cy="-16" r="6" fill={color === TONE.red ? TONE.red : '#3f1d1d'} className={color === TONE.red ? 'glow-red' : ''} />
      <circle cx="0" cy="0" r="6" fill={color === TONE.amber ? TONE.amber : '#3f3416'} />
      <circle cx="0" cy="16" r="6" fill={color === TONE.green ? TONE.green : '#173f2a'} className={color === TONE.green ? 'glow-green' : ''} />
    </g>
  );

  const vehicle = (c) => {
    const h = c.or === 'h';
    const kind = c.kind || 'car';
    let w, ht, body;
    if (kind === 'truck') { w = h ? 118 : 48; ht = h ? 46 : 118; body = '#3f3f46'; }
    else if (kind === 'bus') { w = h ? 104 : 46; ht = h ? 44 : 104; body = '#0d9488'; }
    else if (kind === 'train') { w = h ? 220 : 54; ht = h ? 54 : 220; body = '#111827'; }
    else { w = h ? 72 : 44; ht = h ? 42 : 78; body = kind === 'ambulance' ? '#f1f5f9' : '#1d4ed8'; }
    const stroke = c.alert ? TONE.red : (kind === 'ambulance' ? '#ef4444' : kind === 'truck' ? '#a1a1aa' : kind === 'bus' ? '#5eead4' : kind === 'train' ? '#9ca3af' : '#93c5fd');
    return (
      <g key={c.id} transform={`translate(${c.x},${c.y})`}>
        {c.broadcasting && broadcast(0, 0, '#34d399', f.waves)}
        {kind === 'bike' ? (
          <g className={c.alert ? 'crashflash' : ''}>
            {h ? <><circle cx="-11" cy="6" r="7" fill="none" stroke="#67e8f9" strokeWidth="2.5" /><circle cx="11" cy="6" r="7" fill="none" stroke="#67e8f9" strokeWidth="2.5" /><line x1="-11" y1="6" x2="4" y2="6" stroke="#0ea5e9" strokeWidth="2.5" /></>
               : <><circle cx="0" cy="-11" r="7" fill="none" stroke="#67e8f9" strokeWidth="2.5" /><circle cx="0" cy="11" r="7" fill="none" stroke="#67e8f9" strokeWidth="2.5" /><line x1="0" y1="-11" x2="0" y2="4" stroke="#0ea5e9" strokeWidth="2.5" /></>}
            <circle cx="0" cy={h ? -8 : -4} r="5" fill="#0ea5e9" />
          </g>
        ) : (
          <g className={c.alert ? 'crashflash' : ''}>
            <rect x={-w / 2} y={-ht / 2} width={w} height={ht} rx={kind === 'truck' || kind === 'train' ? 6 : 13} fill={body} stroke={stroke} strokeWidth="2.5" />
            {kind === 'ambulance' && <rect x={-w / 2} y="-4" width={w} height="8" fill="#ef4444" />}
            {kind === 'ambulance' && <><rect x="-9" y={-ht / 2 - 6} width="7" height="6" fill="#ef4444" /><rect x="2" y={-ht / 2 - 6} width="7" height="6" fill="#3b82f6" /></>}
            {kind === 'train' && <rect x={-w / 2} y={ht / 2 - 9} width={w} height="9" fill="#f59e0b" />}
            {kind === 'train' && [0, 1, 2, 3].map((k) => <rect key={k} x="-9" y={-ht / 2 + 22 + k * 44} width="18" height="24" rx="3" className="fill-cyan-200/60" />)}
            {kind !== 'train' && (h ? <rect x={w / 2 - 16} y={-ht / 2 + 6} width="12" height={ht - 12} rx="4" className="fill-cyan-200/70" />
               : <rect x={-w / 2 + 6} y={-ht / 2 + 6} width={w - 12} height="14" rx="4" className="fill-cyan-200/70" />)}
            {c.label && <text x="0" y="4" textAnchor="middle" className={(kind === 'ambulance' ? 'fill-zinc-900' : 'fill-white') + ' text-[10px] font-bold'}>{c.label}</text>}
          </g>
        )}
        {c.alert && <text x="0" y={-ht / 2 - 10} textAnchor="middle" className="text-[15px]">⚠️</text>}
      </g>
    );
  };

  const pedFig = (p) => (
    <g transform={`translate(${p.x},${p.y})`}>
      {p.broadcasting && broadcast(0, -8, '#fbbf24', f.waves)}
      <g className={p.alert ? 'crashflash' : ''}>
        <circle cx="0" cy="-16" r="6" className="fill-none stroke-amber-300" strokeWidth="2.5" />
        <line x1="0" y1="-10" x2="0" y2="6" className="stroke-amber-300" strokeWidth="2.5" />
        <line x1="0" y1="-4" x2="-8" y2="3" className="stroke-amber-300" strokeWidth="2.5" />
        <line x1="0" y1="-4" x2="8" y2="3" className="stroke-amber-300" strokeWidth="2.5" />
        <line x1="0" y1="6" x2="-7" y2="18" className="stroke-amber-300" strokeWidth="2.5" />
        <line x1="0" y1="6" x2="7" y2="18" className="stroke-amber-300" strokeWidth="2.5" />
      </g>
    </g>
  );

  const hazardMark = (hz) => (hz.kind === 'ice' ? (
    <g>
      <ellipse cx={hz.x} cy={G.ewLaneY + 6} rx="48" ry="26" fill="#7dd3fc44" stroke="#7dd3fc" strokeDasharray="4 4" />
      <text x={hz.x} y={G.ewY0 - 8} textAnchor="middle" className="fill-sky-200 text-[12px] font-bold">{hz.label}</text>
    </g>
  ) : (
    <g>
      {[0, 1, 2, 3].map((k) => <path key={k} d={`M ${hz.x - 30 + k * 20} ${G.ewLaneY + 16} l -5 15 l 10 0 z`} fill="#f59e0b" stroke="#fff" strokeWidth="1" />)}
      <rect x={hz.x - 28} y={G.ewY0 - 34} width="56" height="24" rx="4" fill="#f59e0b" />
      <text x={hz.x} y={G.ewY0 - 17} textAnchor="middle" className="fill-zinc-900 text-[9px] font-bold">{hz.label}</text>
    </g>
  ));

  return (
    <svg viewBox={`0 0 ${MS.w} ${MS.h}`} className="w-full h-full">
      <defs>
        <pattern id="grid2" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#1e293b" strokeWidth="1" /></pattern>
      </defs>
      <rect width={MS.w} height={MS.h} fill="url(#grid2)" />

      {/* ---------- roads ---------- */}
      <rect x="0" y={G.ewY0} width={MS.w} height={G.ewY1 - G.ewY0} className="fill-zinc-800" />
      <line x1="0" y1={ewMid} x2={MS.w} y2={ewMid} strokeDasharray="20 16" className="stroke-yellow-500/60" strokeWidth="2" />
      {layout === 'cross' && (
        <>
          {!f.rail && <rect x={G.nsX0} y="0" width={G.nsX1 - G.nsX0} height={MS.h} className="fill-zinc-800" />}
          {!f.rail && <line x1={(G.nsX0 + G.nsX1) / 2} y1="0" x2={(G.nsX0 + G.nsX1) / 2} y2={MS.h} strokeDasharray="20 16" className="stroke-yellow-500/60" strokeWidth="2" />}
          {f.rail && (
            <g>
              {Array.from({ length: 18 }).map((_, k) => <rect key={k} x="430" y={k * 30} width="40" height="9" className="fill-amber-900/70" />)}
              <line x1="439" y1="0" x2="439" y2={MS.h} className="stroke-zinc-400" strokeWidth="3" />
              <line x1="461" y1="0" x2="461" y2={MS.h} className="stroke-zinc-400" strokeWidth="3" />
            </g>
          )}
          <rect x={G.ewStop + 18} y={G.ewY0} width="6" height={(G.ewY1 - G.ewY0) / 2} className="fill-white/80" />
          {!f.rail && <rect x={(G.nsX0 + G.nsX1) / 2} y={G.nsStop - 24} width={(G.nsX1 - G.nsX0) / 2} height="6" className="fill-white/80" />}
        </>
      )}
      {layout !== 'cross' && f.crosswalk != null && [0, 1, 2, 3, 4].map((k) => (
        <rect key={k} x={f.crosswalk - 24 + k * 11} y={G.ewY0 + 4} width="7" height={G.ewY1 - G.ewY0 - 8} className="fill-white/30" />
      ))}

      {/* corner buildings (occlusion) */}
      {layout === 'cross' && f.buildings && [[248, 60], [560, 60], [248, 328], [560, 328]].map(([bx, by], i) => (
        <rect key={i} x={bx} y={by} width="118" height="118" rx="8" className="fill-zinc-800 stroke-zinc-700" />
      ))}

      {/* ---------- infrastructure ---------- */}
      {infra === 'signals' && (
        <g>
          <line x1={G.rsu.x} y1="200" x2={G.rsu.x} y2={G.ewY0 - 8} className="stroke-zinc-600" strokeWidth="6" />
          <rect x={G.tc.x - 22} y={G.tc.y - 26} width="44" height="64" rx="5" className="fill-zinc-700 stroke-zinc-500" />
          <text x={G.tc.x} y={G.tc.y + 4} textAnchor="middle" className="fill-neon-green text-[10px] font-bold">TC</text>
          <line x1={G.rsu.x + 26} y1={G.rsu.y} x2={G.tc.x - 22} y2={G.tc.y} className="stroke-pink-400" strokeWidth="2" />
          {f.waves && broadcast(G.rsu.x, G.rsu.y, '#a78bfa', true)}
          <rect x={G.rsu.x - 26} y={G.rsu.y - 15} width="52" height="30" rx="6" className="fill-emerald-500/20 stroke-neon-green" />
          <text x={G.rsu.x} y={G.rsu.y + 4} textAnchor="middle" className="fill-neon-green text-[10px] font-bold">RSU</text>
          {head(G.ewHead, lightColor(f.ew))}
          {head(G.nsHead, lightColor(f.ns))}
        </g>
      )}
      {infra === 'tower' && (
        <g>
          <line x1={G.cloud.x + 6} y1={G.cloud.y + 6} x2={G.tower.x} y2={G.tower.y - 14} className="stroke-violet-400/60" strokeDasharray="4 5" strokeWidth="2" />
          <g transform={`translate(${G.cloud.x},${G.cloud.y})`}>
            <ellipse cx="-16" cy="6" rx="18" ry="14" className="fill-zinc-700" />
            <ellipse cx="12" cy="6" rx="20" ry="16" className="fill-zinc-700" />
            <ellipse cx="-2" cy="-8" rx="18" ry="15" className="fill-zinc-700" />
            <text x="-2" y="10" textAnchor="middle" className="fill-slate-300 text-[9px] font-bold">TMC · Cloud</text>
          </g>
          <g transform={`translate(${G.tower.x},${G.tower.y})`}>
            <line x1="-16" y1="72" x2="0" y2="0" className="stroke-zinc-400" strokeWidth="3" />
            <line x1="16" y1="72" x2="0" y2="0" className="stroke-zinc-400" strokeWidth="3" />
            <line x1="-10" y1="46" x2="10" y2="46" className="stroke-zinc-400" strokeWidth="2" />
            <line x1="0" y1="0" x2="0" y2="-14" className="stroke-zinc-300" strokeWidth="2" />
          </g>
          {f.waves && broadcast(G.tower.x, G.tower.y - 8, '#a78bfa', true)}
        </g>
      )}

      {/* hazards */}
      {f.hazard && hazardMark(f.hazard)}

      {/* pedestrian / VRU */}
      {f.ped && pedFig(f.ped)}

      {/* vehicles */}
      {f.cars.map(vehicle)}

      {/* packets */}
      {f.packets.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          <rect x="-13" y="-13" width="26" height="26" rx="6" fill={p.tone + '33'} stroke={p.tone} strokeWidth="2" className="glow-cyan" />
          <text x="0" y="30" textAnchor="middle" fill={p.tone} className="text-[11px] font-bold">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

const SCENARIOS = [
  {
    id: 'srm', category: 'V2I', icon: '🚑', title: 'Emergency Vehicle Preemption', tagline: 'SRM → green for the ambulance',
    duration: 11,
    why: 'An emergency vehicle’s OBU asks the intersection for priority using a Signal Request Message (SRM). The RSU relays it to the controller, which preempts the signal to green and confirms with an SSM — the ambulance never has to stop or run a red.',
    messages: ['SRM', 'SSM', 'SPaT'],
    frame(t) {
      const green = t >= 5.2;
      let ax;
      if (t < 2.5) ax = lerp(-40, G.ewStop, seg(t, 0, 2.5));
      else if (t < 5.5) ax = G.ewStop;
      else ax = lerp(G.ewStop, 980, seg(t, 5.5, 11));
      const cars = [{ id: 'amb', x: ax, y: G.ewLaneY, or: 'h', kind: 'ambulance', label: 'EMS', alert: t >= 1 && t < 5.5 }];
      const packets = []; let banner;
      if (t < 2.5) banner = { text: 'Emergency vehicle approaches a RED light', tone: 'warn' };
      else if (t < 4) { packets.push({ ...lerpPt({ x: ax, y: G.ewLaneY }, G.rsu, seg(t, 2.5, 4)), label: 'SRM', tone: TONE.cyan }); banner = { text: 'OBU broadcasts an SRM (Signal Request Message)', tone: 'info' }; }
      else if (t < 5.2) { packets.push({ ...lerpPt(G.rsu, G.tc, seg(t, 4, 5.2)), label: 'SRM', tone: TONE.cyan }); banner = { text: 'RSU relays the SRM to the Traffic Controller', tone: 'info' }; }
      else if (t < 6.4) { packets.push({ ...lerpPt(G.tc, { x: ax, y: G.ewLaneY }, seg(t, 5.2, 6.4)), label: 'SSM ✔', tone: TONE.green }); banner = { text: 'TC grants priority · returns SSM · signal turns GREEN', tone: 'ok' }; }
      else banner = { text: 'Ambulance clears the intersection without stopping', tone: 'ok' };
      return { cars, packets, ew: green ? 'green' : 'red', ns: green ? 'red' : 'green', banner, rsuActive: true, waves: t > 2.5 && t < 6.4 };
    },
  },
  {
    id: 'rlvw', category: 'V2I', icon: '⚠️', title: 'Red-Light Violation Warning', tagline: 'ADAS predicts the driver can’t stop in time',
    duration: 9,
    why: 'Using SPaT (time-to-red) and MAP (distance to the stop bar), the vehicle’s ADAS computes whether it can stop. If it predicts the car would cross after the light turns red, it warns the driver — and here, auto-brakes to stop at the bar.',
    messages: ['SPaT', 'MAP', 'RLVW'],
    frame(t) {
      const ew = t < 3 ? 'green' : t < 4.5 ? 'yellow' : 'red';
      let x;
      if (t < 3.4) x = lerp(-40, 300, seg(t, 0, 3.4));
      else if (t < 5.4) x = lerp(300, G.ewStop, easeOut(seg(t, 3.4, 5.4)));
      else x = G.ewStop;
      const warn = t >= 3.2 && t < 5.6;
      const cars = [{ id: 'c', x, y: G.ewLaneY, or: 'h', kind: 'car', alert: warn }];
      const packets = []; let banner;
      if (t < 3.2) { packets.push({ ...lerpPt(G.rsu, { x, y: G.ewLaneY }, (t % 1)), label: 'SPaT+MAP', tone: TONE.cyan }); banner = { text: 'Receiving SPaT + MAP · ADAS computing time-to-stop-bar', tone: 'info', sub: 'v ≈ 15 m/s · 48 m to bar' }; }
      else if (t < 5.6) banner = { text: '⚠ RED-LIGHT VIOLATION PREDICTED — auto-brake engaged', tone: 'warn', sub: 't_arrive 3.2 s > t_red 2.0 s ⇒ would enter +1.2 s after red' };
      else banner = { text: 'Vehicle stopped safely at the stop bar', tone: 'ok' };
      return { cars, packets, ew, ns: ew === 'green' ? 'red' : 'green', banner, rsuActive: true, waves: t < 3.2 };
    },
  },
  {
    id: 'detect', category: 'V2I', icon: '🎯', title: 'V2X Actuated Detection', tagline: 'BSM replaces loops & cameras',
    duration: 9,
    why: 'A vehicle waiting on the side street would normally need an inductive loop or camera to be noticed. Instead its OBU’s BSM travels to the RSU and up to the controller, which detects the vehicle in the lane and serves it a green sooner.',
    messages: ['BSM', 'SPaT'],
    frame(t) {
      const nsGreen = t >= 5.5;
      let y;
      if (t < 2) y = lerp(560, G.nsStop, seg(t, 0, 2));
      else if (t < 5.8) y = G.nsStop;
      else y = lerp(G.nsStop, -40, seg(t, 5.8, 9));
      const cars = [{ id: 'c', x: G.nsLaneX, y, or: 'v', kind: 'car', alert: false }];
      const packets = []; let banner;
      if (t < 2) banner = { text: 'Vehicle arrives on the side street — no loop or camera present', tone: 'info' };
      else if (t < 3) { packets.push({ ...lerpPt({ x: G.nsLaneX, y }, G.rsu, seg(t, 2, 3)), label: 'BSM', tone: TONE.green }); banner = { text: 'OBU broadcasts a BSM (position / lane / speed)', tone: 'info' }; }
      else if (t < 4) { packets.push({ ...lerpPt(G.rsu, G.tc, seg(t, 3, 4)), label: 'BSM', tone: TONE.green }); banner = { text: 'RSU forwards the BSM to the controller', tone: 'info' }; }
      else if (t < 5.5) banner = { text: 'TC detects the vehicle in the NS lane → shortens EW green', tone: 'info' };
      else banner = { text: 'Served a green with no cameras or loops — pure V2X detection', tone: 'ok' };
      const ew = t < 4.5 ? 'green' : t < 5.5 ? 'yellow' : 'red';
      return { cars, packets, ew, ns: nsGreen ? 'green' : 'red', banner, rsuActive: true, waves: t >= 2 && t < 4 };
    },
  },
  {
    id: 'glosa', category: 'V2I', icon: '🌊', title: 'GLOSA — Green-Wave Advisory', tagline: 'Advised speed to catch the green',
    duration: 9,
    why: 'Green Light Optimal Speed Advisory uses SPaT to tell the driver the exact speed to arrive as the light turns green — eliminating a full stop, cutting idle time, emissions and fuel.',
    messages: ['SPaT', 'MAP'],
    frame(t) {
      const green = t >= 5.2;
      let x;
      if (t < 5.5) x = lerp(-40, G.ewStop, seg(t, 0, 5.5));
      else x = lerp(G.ewStop, 980, seg(t, 5.5, 9));
      const cars = [{ id: 'c', x, y: G.ewLaneY, or: 'h', kind: 'car' }];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'Light is RED — 5 s until green', tone: 'info' };
      else if (t < 3.5) { packets.push({ ...lerpPt(G.rsu, { x, y: G.ewLaneY }, seg(t, 1.5, 3.5)), label: 'SPaT', tone: TONE.cyan }); banner = { text: 'Advisory: hold ≈ 38 km/h to catch the green', tone: 'info', sub: 'no braking, no idling' }; }
      else if (t < 5.2) banner = { text: 'Cruising at the advised speed…', tone: 'info' };
      else banner = { text: 'Arrived exactly as it turned green — zero idle time', tone: 'ok' };
      return { cars, packets, ew: green ? 'green' : 'red', ns: green ? 'red' : 'green', banner, rsuActive: true, waves: t >= 1.5 && t < 3.5 };
    },
  },

  /* ---------------- V2V — Vehicle-to-Vehicle ---------------- */
  {
    id: 'fcw', category: 'V2V', icon: '🚗', title: 'Forward Collision Warning', tagline: 'The lead car brakes hard — you’re warned',
    duration: 8,
    why: 'The lead vehicle continuously broadcasts its state (BSM). When it brakes hard, the following vehicle’s ADAS sees the deceleration in that BSM and warns the driver — then auto-brakes to keep a safe gap. No forward camera or radar required.',
    messages: ['BSM', 'FCW'],
    frame(t) {
      const lx = t < 3 ? lerp(300, 540, seg(t, 0, 3)) : (t < 4.5 ? lerp(540, 600, easeOut(seg(t, 3, 4.5))) : 600);
      const ex = t < 3.5 ? lerp(90, 360, seg(t, 0, 3.5)) : (t < 5.5 ? lerp(360, 500, easeOut(seg(t, 3.5, 5.5))) : 500);
      const braking = t >= 3;
      const warn = t >= 3.4 && t < 5.6;
      const cars = [
        { id: 'lead', x: lx, y: G.ewLaneY, or: 'h', kind: 'car', label: 'LEAD', broadcasting: braking },
        { id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: warn },
      ];
      const packets = []; let banner;
      if (t < 3) banner = { text: 'Following a lead vehicle at speed', tone: 'info' };
      else if (t < 4) { packets.push({ ...lerpPt({ x: lx, y: G.ewLaneY }, { x: ex, y: G.ewLaneY }, seg(t, 3, 4)), label: 'BSM', tone: TONE.green }); banner = { text: 'Lead brakes hard → its BSM reports rapid deceleration', tone: 'warn' }; }
      else if (t < 5.6) banner = { text: '⚠ FORWARD COLLISION WARNING — ego auto-brakes', tone: 'warn' };
      else banner = { text: 'Safe following gap kept — rear-end collision avoided', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, banner, waves: braking && t < 5.6 };
    },
  },
  {
    id: 'eebl', category: 'V2V', icon: '🛑', title: 'Emergency Electronic Brake Light', tagline: 'Braking beyond your line of sight',
    duration: 8,
    why: 'A vehicle two cars ahead — hidden behind a truck — brakes hard. Its EEBL/BSM reaches you directly over V2V, so you are warned before you could ever see a brake light.',
    messages: ['BSM', 'EEBL'],
    frame(t) {
      const fx = t < 2.5 ? lerp(430, 560, seg(t, 0, 2.5)) : (t < 4 ? lerp(560, 610, easeOut(seg(t, 2.5, 4))) : 610);
      const tx = t < 3.5 ? lerp(240, 470, seg(t, 0, 3.5)) : (t < 5 ? lerp(470, 500, easeOut(seg(t, 3.5, 5))) : 500);
      const ex = t < 3.8 ? lerp(50, 300, seg(t, 0, 3.8)) : (t < 5.6 ? lerp(300, 400, easeOut(seg(t, 3.8, 5.6))) : 400);
      const braking = t >= 2.5;
      const warn = t >= 3.2 && t < 5.8;
      const cars = [
        { id: 'front', x: fx, y: G.ewLaneY, or: 'h', kind: 'car', broadcasting: braking },
        { id: 'truck', x: tx, y: G.ewLaneY, or: 'h', kind: 'truck', label: 'TRUCK' },
        { id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: warn },
      ];
      const packets = []; let banner;
      if (t < 2.5) banner = { text: 'A heavy truck ahead blocks your view of traffic', tone: 'info' };
      else if (t < 3.8) { packets.push({ ...lerpPt({ x: fx, y: G.ewLaneY - 30 }, { x: ex, y: G.ewLaneY - 30 }, seg(t, 2.5, 3.8)), label: 'EEBL', tone: TONE.green }); banner = { text: 'Hidden vehicle brakes hard → EEBL sent over V2V', tone: 'warn' }; }
      else if (t < 5.8) banner = { text: '⚠ EMERGENCY BRAKING AHEAD — slow down now', tone: 'warn' };
      else banner = { text: 'Warned beyond line of sight — unique to V2V', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, banner, waves: braking && t < 5.8 };
    },
  },
  {
    id: 'ima', category: 'V2V', icon: '✚', title: 'Intersection Movement Assist', tagline: 'Cross traffic you can’t see',
    duration: 8,
    why: 'Two vehicles approach an intersection on crossing paths, their view blocked by corner buildings. Exchanging BSMs, each computes the collision risk — the ego brakes before entering, avoiding a side impact.',
    messages: ['BSM', 'IMA'],
    frame(t) {
      const ex = t < 3.2 ? lerp(-40, 300, seg(t, 0, 3.2)) : (t < 5 ? lerp(300, G.ewStop, easeOut(seg(t, 3.2, 5))) : G.ewStop);
      const cy = lerp(-40, 560, seg(t, 2, 8));
      const warn = t >= 3 && t < 5.2;
      const cars = [
        { id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: warn, broadcasting: true },
        { id: 'cross', x: 428, y: cy, or: 'v', kind: 'car', broadcasting: true },
      ];
      const packets = []; let banner;
      if (t < 2) banner = { text: 'Approaching an intersection — corners blocked by buildings', tone: 'info' };
      else if (t < 3) { packets.push({ ...lerpPt({ x: 428, y: cy }, { x: ex, y: G.ewLaneY }, seg(t, 2, 3)), label: 'BSM', tone: TONE.green }); banner = { text: 'Vehicles exchange BSMs through the blind corner', tone: 'info' }; }
      else if (t < 5.2) banner = { text: '⚠ INTERSECTION MOVEMENT ASSIST — cross vehicle detected, braking', tone: 'warn' };
      else banner = { text: 'Ego stopped short — side collision avoided', tone: 'ok' };
      return { layout: 'cross', infra: 'none', buildings: true, cars, packets, banner, waves: t >= 2 && t < 5.2 };
    },
  },

  /* ---------------- V2P — Vehicle-to-Pedestrian ---------------- */
  {
    id: 'pcw', category: 'V2P', icon: '🚶', title: 'Pedestrian Crossing Warning', tagline: 'Toggle who gets the warning',
    duration: 8,
    variants: [
      {
        id: 'veh', label: 'Vehicle is warned', tagline: 'PSM → the car yields',
        why: 'A pedestrian steps into a mid-block crosswalk. Their smartphone / VRU device broadcasts a PSM. The approaching vehicle receives it and yields — even at night or around a visual obstruction.',
        messages: ['PSM'],
        frame(t) {
          const cx = 500;
          const ex = t < 3.4 ? lerp(-40, 300, seg(t, 0, 3.4)) : (t < 5.2 ? lerp(300, 420, easeOut(seg(t, 3.4, 5.2))) : 420);
          const py = t < 1.5 ? 360 : lerp(360, 188, seg(t, 1.5, 7));
          const warn = t >= 2.6 && t < 5.4;
          const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: warn }];
          const ped = { x: cx, y: py, broadcasting: true };
          const packets = []; let banner;
          if (t < 1.5) banner = { text: 'A vehicle approaches a crosswalk', tone: 'info' };
          else if (t < 2.6) { packets.push({ ...lerpPt({ x: cx, y: py }, { x: ex, y: G.ewLaneY }, seg(t, 1.5, 2.6)), label: 'PSM', tone: TONE.amber }); banner = { text: 'Pedestrian steps off the curb → their device broadcasts a PSM', tone: 'warn' }; }
          else if (t < 5.4) banner = { text: '⚠ PEDESTRIAN IN CROSSWALK — the vehicle yields', tone: 'warn' };
          else banner = { text: 'The vehicle stopped — pedestrian crosses safely', tone: 'ok' };
          return { layout: 'straightH', infra: 'none', crosswalk: cx, cars, packets, ped, banner, waves: t >= 1.5 && t < 5.4 };
        },
      },
      {
        id: 'ped', label: 'Pedestrian is warned', tagline: 'BSM → the pedestrian waits',
        why: 'Here the vehicle does not yield — instead the pedestrian is protected. The approaching car continuously broadcasts its BSM; the pedestrian’s phone / wearable receives it, works out that a vehicle is closing on the crosswalk, and warns them to wait at the curb. The person holds back while the car passes, then crosses safely behind it.',
        messages: ['BSM'],
        frame(t) {
          const cx = 500;
          const ex = lerp(-40, 980, seg(t, 0, 7));                       // car proceeds through — no braking
          const py = t < 2 ? lerp(360, 322, seg(t, 0, 2))                // walks up toward the curb
            : (t < 6 ? 322                                               // warned → waits at the curb
              : lerp(322, 188, seg(t, 6, 8)));                           // crosses after the car has passed
          const warn = t >= 2 && t < 6;
          const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', broadcasting: t < 4.2 }];
          const ped = { x: cx, y: py, alert: warn };
          const packets = []; let banner;
          if (t < 1.4) banner = { text: 'A pedestrian nears the curb as a vehicle approaches', tone: 'info' };
          else if (t < 2.6) { packets.push({ ...lerpPt({ x: ex, y: G.ewLaneY }, { x: cx, y: py }, seg(t, 1.4, 2.6)), label: 'BSM', tone: TONE.green }); banner = { text: 'The vehicle broadcasts its BSM → the pedestrian’s device receives it', tone: 'info', sub: 'closing vehicle detected' }; }
          else if (t < 6) banner = { text: '⚠ VEHICLE APPROACHING — the pedestrian waits at the curb', tone: 'warn' };
          else banner = { text: 'The car has passed — pedestrian crosses safely behind it', tone: 'ok' };
          return { layout: 'straightH', infra: 'none', crosswalk: cx, cars, packets, ped, banner, waves: t < 4.2 };
        },
      },
    ],
  },
  {
    id: 'bsw', category: 'V2P', icon: '🚲', title: 'Cyclist / VRU Awareness', tagline: 'A cyclist in your blind spot',
    duration: 8,
    why: 'A cyclist in the bike lane broadcasts a PSM. As the vehicle prepares to turn across the bike lane, the PSM warns the driver of the cyclist it cannot see — preventing a “right-hook” collision.',
    messages: ['PSM'],
    frame(t) {
      const ex = t < 4 ? lerp(20, 300, seg(t, 0, 4)) : (t < 5.6 ? lerp(300, 360, easeOut(seg(t, 4, 5.6))) : 360);
      const bx = lerp(120, 520, seg(t, 0, 8));
      const warn = t >= 3 && t < 5.6;
      const cars = [
        { id: 'ego', x: ex, y: 250, or: 'h', kind: 'car', label: 'EGO', alert: warn },
        { id: 'bike', x: bx, y: 292, or: 'h', kind: 'bike', broadcasting: true },
      ];
      const packets = []; let banner;
      if (t < 2) banner = { text: 'A cyclist rides in the bike lane ahead-right', tone: 'info' };
      else if (t < 3) { packets.push({ ...lerpPt({ x: bx, y: 292 }, { x: ex, y: 250 }, seg(t, 2, 3)), label: 'PSM', tone: TONE.amber }); banner = { text: 'The cyclist’s device broadcasts a PSM', tone: 'info' }; }
      else if (t < 5.6) banner = { text: '⚠ CYCLIST ALONGSIDE — hold your turn', tone: 'warn' };
      else banner = { text: 'Right-hook collision avoided', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, banner, waves: t >= 2 && t < 5.6 };
    },
  },

  /* ---------------- V2N — Vehicle-to-Network ---------------- */
  {
    id: 'rszw', category: 'V2N', icon: '🚧', title: 'Work-Zone Speed Warning', tagline: 'TIM pushed over the cellular network',
    duration: 8,
    why: 'A work zone out of sight is registered in the Traffic Management Center. It pushes a TIM (Traveler Information Message) over the cellular network to approaching vehicles, which slow to the advised speed before reaching the workers.',
    messages: ['TIM'],
    frame(t) {
      const ex = t < 3.5 ? lerp(-40, 330, seg(t, 0, 3.5)) : (t < 5.5 ? lerp(330, 470, easeOut(seg(t, 3.5, 5.5))) : lerp(470, 900, seg(t, 5.5, 8)));
      const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: t >= 3.4 && t < 5.5 }];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'A work zone lies ahead, still out of sight', tone: 'info' };
      else if (t < 3.2) { packets.push({ ...lerpPt({ x: G.tower.x, y: G.tower.y }, { x: ex, y: G.ewLaneY }, seg(t, 1.5, 3.2)), label: 'TIM', tone: TONE.violet }); banner = { text: 'Traffic Mgmt Center pushes a TIM over the cellular network', tone: 'info' }; }
      else if (t < 5.5) banner = { text: 'Advisory: reduce to 45 km/h through the zone', tone: 'warn', sub: 'work zone in ~300 m' };
      else banner = { text: 'Slowed safely before the workers', tone: 'ok' };
      return { layout: 'straightH', infra: 'tower', cars, packets, hazard: { x: 662, kind: 'workzone', label: 'WORK' }, banner, waves: t >= 1.5 && t < 3.2 };
    },
  },
  {
    id: 'weather', category: 'V2N', icon: '❄️', title: 'Road-Weather Hazard', tagline: 'Black-ice alert from the network',
    duration: 8,
    why: 'Connected vehicles and sensors report black ice; the network aggregates it and delivers a road-weather TIM to vehicles upstream, which reduce speed before hitting the slippery patch.',
    messages: ['TIM'],
    frame(t) {
      const ex = t < 3.5 ? lerp(-40, 320, seg(t, 0, 3.5)) : (t < 5.5 ? lerp(320, 470, easeOut(seg(t, 3.5, 5.5))) : lerp(470, 900, seg(t, 5.5, 8)));
      const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: t >= 3.4 && t < 5.5 }];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'Black ice reported ahead by connected vehicles', tone: 'info' };
      else if (t < 3.2) { packets.push({ ...lerpPt({ x: G.tower.x, y: G.tower.y }, { x: ex, y: G.ewLaneY }, seg(t, 1.5, 3.2)), label: 'TIM', tone: TONE.violet }); banner = { text: 'Network delivers a road-weather TIM', tone: 'info' }; }
      else if (t < 5.5) banner = { text: '⚠ REDUCE SPEED — slippery road ahead', tone: 'warn' };
      else banner = { text: 'Driver slowed before the hazard', tone: 'ok' };
      return { layout: 'straightH', infra: 'tower', cars, packets, hazard: { x: 662, kind: 'ice', label: '❄ ICE' }, banner, waves: t >= 1.5 && t < 3.2 };
    },
  },

  /* ---------------- more V2I ---------------- */
  {
    id: 'tsp', category: 'V2I', icon: '🚌', title: 'Transit Signal Priority', tagline: 'Late bus earns a green extension',
    duration: 10,
    why: 'A behind-schedule bus sends an SRM requesting priority. Unlike full emergency preemption, the controller simply EXTENDS the current green (or trims the red) so the bus clears without stopping — improving on-time performance without disrupting the whole cycle.',
    messages: ['SRM', 'SSM', 'SPaT'],
    frame(t) {
      const bx = lerp(-40, 980, seg(t, 0, 10));
      const cars = [{ id: 'bus', x: bx, y: G.ewLaneY, or: 'h', kind: 'bus', label: 'BUS' }];
      const packets = []; let banner;
      if (t < 2) banner = { text: 'A late transit bus approaches — the green is about to end', tone: 'info' };
      else if (t < 3.4) { packets.push({ ...lerpPt({ x: bx, y: G.ewLaneY }, G.rsu, seg(t, 2, 3.4)), label: 'SRM', tone: TONE.cyan }); banner = { text: 'Bus sends an SRM requesting priority', tone: 'info' }; }
      else if (t < 4.6) { packets.push({ ...lerpPt(G.rsu, G.tc, seg(t, 3.4, 4.6)), label: 'SRM', tone: TONE.cyan }); banner = { text: 'RSU relays the request → controller extends the green', tone: 'info' }; }
      else if (t < 5.8) { packets.push({ ...lerpPt(G.tc, { x: bx, y: G.ewLaneY }, seg(t, 4.6, 5.8)), label: 'SSM ✔', tone: TONE.green }); banner = { text: 'TC confirms via SSM · green held for the bus', tone: 'ok' }; }
      else banner = { text: 'Bus clears on an extended green — schedule kept', tone: 'ok' };
      return { layout: 'cross', infra: 'signals', ew: 'green', ns: 'red', cars, packets, banner, waves: t >= 2 && t < 5.8 };
    },
  },

  /* ---------------- more V2V ---------------- */
  {
    id: 'platoon', category: 'V2V', icon: '🚚', title: 'Truck Platooning (CACC)', tagline: 'Tight gaps held by V2V',
    duration: 9,
    why: 'Cooperative Adaptive Cruise Control links vehicles into a platoon. Each shares its BSM so followers react to the leader’s braking in milliseconds — far faster than a human — enabling safe, fuel-saving close following.',
    messages: ['BSM', 'CACC'],
    frame(t) {
      const base = t < 3 ? lerp(80, 320, seg(t, 0, 3)) : (t < 4.5 ? lerp(320, 390, easeOut(seg(t, 3, 4.5))) : (t < 6 ? 390 : lerp(390, 860, seg(t, 6, 9))));
      const gap = 150;
      const slowing = t >= 3 && t < 4.6;
      const cars = [
        { id: 'l', x: base + gap * 2, y: G.ewLaneY, or: 'h', kind: 'truck', label: '1', broadcasting: true },
        { id: 'm', x: base + gap, y: G.ewLaneY, or: 'h', kind: 'truck', label: '2', broadcasting: true },
        { id: 'f', x: base, y: G.ewLaneY, or: 'h', kind: 'truck', label: '3', broadcasting: true },
      ];
      const packets = []; let banner;
      if (t < 3) banner = { text: 'Three trucks travel as a single V2V platoon', tone: 'info' };
      else if (slowing) {
        packets.push({ ...lerpPt({ x: base + gap * 2, y: G.ewLaneY - 30 }, { x: base + gap, y: G.ewLaneY - 30 }, (t % 1)), label: 'BSM', tone: TONE.green });
        packets.push({ ...lerpPt({ x: base + gap, y: G.ewLaneY - 30 }, { x: base, y: G.ewLaneY - 30 }, (t % 1)), label: 'BSM', tone: TONE.green });
        banner = { text: 'Leader eases off → followers brake in sync via BSM', tone: 'info' };
      }
      else if (t < 6) banner = { text: 'Constant tight gap held — beyond human reaction time', tone: 'ok' };
      else banner = { text: 'Platoon accelerates together, saving fuel & road space', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, banner, waves: t >= 3 };
    },
  },
  {
    id: 'merge', category: 'V2V', icon: '🔀', title: 'Cooperative Lane Merge', tagline: 'V2V negotiates the gap',
    duration: 9,
    why: 'A merging vehicle broadcasts its intent; a mainline vehicle receives it and cooperatively opens a gap by easing off. The two coordinate the merge over V2V instead of the usual last-second guesswork.',
    messages: ['BSM', 'Maneuver'],
    frame(t) {
      const ax = t < 2 ? lerp(120, 300, seg(t, 0, 2)) : (t < 5 ? lerp(300, 430, seg(t, 2, 5)) : lerp(430, 780, seg(t, 5, 9)));
      const mx = t < 5 ? lerp(40, 360, seg(t, 0, 5)) : lerp(360, 720, seg(t, 5, 9));
      const my = t < 3.5 ? 292 : (t < 5 ? lerp(292, 250, seg(t, 3.5, 5)) : 250);
      const cars = [
        { id: 'a', x: ax, y: 250, or: 'h', kind: 'car', label: 'A', broadcasting: true },
        { id: 'm', x: mx, y: my, or: 'h', kind: 'car', label: 'MERGE', broadcasting: true },
      ];
      const packets = []; let banner;
      if (t < 2) banner = { text: 'A vehicle needs to merge from the ramp lane', tone: 'info' };
      else if (t < 3.5) { packets.push({ ...lerpPt({ x: mx, y: 292 }, { x: ax, y: 250 }, (t % 1)), label: 'BSM', tone: TONE.green }); banner = { text: 'Merger broadcasts intent → mainline car opens a gap', tone: 'info' }; }
      else if (t < 5) banner = { text: 'Gap opened — merger slots in cooperatively', tone: 'info' };
      else banner = { text: 'Merged safely with no abrupt braking', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, banner, waves: t >= 2 && t < 5 };
    },
  },
  {
    id: 'dnpw', category: 'V2V', icon: '⛔', title: 'Do Not Pass Warning', tagline: 'Hidden oncoming traffic',
    duration: 9,
    why: 'On a two-lane road the ego considers passing a slow truck, but an oncoming vehicle is hidden beyond it. Their BSMs reveal the closing conflict and warn the driver not to pull out.',
    messages: ['BSM', 'DNPW'],
    frame(t) {
      const ex = t < 4 ? lerp(20, 300, seg(t, 0, 4)) : (t < 5.5 ? lerp(300, 360, easeOut(seg(t, 4, 5.5))) : 360);
      const tx = lerp(200, 520, seg(t, 0, 9));
      const ox = lerp(940, 300, seg(t, 0, 9));
      const warn = t >= 3 && t < 6;
      const cars = [
        { id: 'truck', x: tx, y: 292, or: 'h', kind: 'truck' },
        { id: 'onc', x: ox, y: 250, or: 'h', kind: 'car', broadcasting: true },
        { id: 'ego', x: ex, y: 292, or: 'h', kind: 'car', label: 'EGO', alert: warn, broadcasting: true },
      ];
      const packets = []; let banner;
      if (t < 3) banner = { text: 'Stuck behind a slow truck — the driver wants to pass', tone: 'info' };
      else if (t < 4.2) { packets.push({ ...lerpPt({ x: ox, y: 250 }, { x: ex, y: 292 }, seg(t, 3, 4.2)), label: 'BSM', tone: TONE.green }); banner = { text: 'BSMs reveal an oncoming vehicle you cannot see', tone: 'warn' }; }
      else if (t < 6) banner = { text: '⛔ DO NOT PASS — oncoming traffic in the passing lane', tone: 'warn' };
      else banner = { text: 'Passing withheld — head-on collision avoided', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, banner, waves: t >= 3 && t < 6 };
    },
  },

  /* ---------------- more V2N ---------------- */
  {
    id: 'wrongway', category: 'V2N', icon: '🚫', title: 'Wrong-Way Driver Alert', tagline: 'Network flags a wrong-way vehicle',
    duration: 9,
    why: 'A vehicle travelling against traffic is detected from its BSM heading. The network broadcasts a wrong-way alert to vehicles in the area so they can slow and move over before a head-on.',
    messages: ['BSM', 'TIM'],
    frame(t) {
      const ex = t < 3.5 ? lerp(-40, 300, seg(t, 0, 3.5)) : (t < 5.5 ? lerp(300, 380, easeOut(seg(t, 3.5, 5.5))) : 380);
      const ey = t < 4 ? 292 : (t < 5.5 ? lerp(292, 250, seg(t, 4, 5.5)) : 250);
      const wx = lerp(940, 260, seg(t, 0, 9));
      const warn = t >= 3 && t < 6;
      const cars = [
        { id: 'ww', x: wx, y: 292, or: 'h', kind: 'car', label: 'WRONG-WAY', alert: true },
        { id: 'ego', x: ex, y: ey, or: 'h', kind: 'car', label: 'EGO', alert: warn },
      ];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'Normal driving on a divided highway', tone: 'info' };
      else if (t < 3.2) { packets.push({ ...lerpPt({ x: G.tower.x, y: G.tower.y }, { x: ex, y: 292 }, seg(t, 1.5, 3.2)), label: 'TIM', tone: TONE.violet }); banner = { text: 'Network detects a wrong-way vehicle from its BSM heading', tone: 'warn' }; }
      else if (t < 6) banner = { text: '🚫 WRONG-WAY DRIVER AHEAD — slow down & move over', tone: 'warn' };
      else banner = { text: 'Ego moved over early — head-on avoided', tone: 'ok' };
      return { layout: 'straightH', infra: 'tower', cars, packets, banner, waves: t >= 1.5 && t < 3.2 };
    },
  },
  {
    id: 'incident', category: 'V2N', icon: '🆘', title: 'Stalled-Vehicle / Incident Ahead', tagline: 'Network relays a downstream hazard',
    duration: 9,
    why: 'A stalled vehicle or crash downstream is reported by connected cars and cameras. The network pushes an incident TIM upstream so drivers slow and change lanes early — smoothing traffic and preventing secondary crashes.',
    messages: ['TIM'],
    frame(t) {
      const ex = t < 3.5 ? lerp(-40, 300, seg(t, 0, 3.5)) : lerp(300, 900, seg(t, 3.5, 9));
      const ey = t < 4 ? 292 : (t < 5.5 ? lerp(292, 250, seg(t, 4, 5.5)) : 250);
      const cars = [
        { id: 'stall', x: 672, y: 292, or: 'h', kind: 'car', alert: true },
        { id: 'ego', x: ex, y: ey, or: 'h', kind: 'car', label: 'EGO' },
      ];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'A vehicle is stalled downstream, out of sight', tone: 'info' };
      else if (t < 3.2) { packets.push({ ...lerpPt({ x: G.tower.x, y: G.tower.y }, { x: ex, y: 292 }, seg(t, 1.5, 3.2)), label: 'TIM', tone: TONE.violet }); banner = { text: 'Network pushes an incident TIM upstream', tone: 'info' }; }
      else if (t < 5.5) banner = { text: 'Advisory: lane blocked ahead — move over now', tone: 'warn' };
      else banner = { text: 'Passed the incident safely in the open lane', tone: 'ok' };
      return { layout: 'straightH', infra: 'tower', cars, packets, banner, waves: t >= 1.5 && t < 3.2 };
    },
  },

  /* ---------------- more V2P ---------------- */
  {
    id: 'dartout', category: 'V2P', icon: '🧒', title: 'School-Zone Dart-Out', tagline: 'Child emerges between parked cars',
    duration: 8,
    why: 'In a school zone a child darts into the street from between parked cars — invisible to the driver. A wearable / phone PSM (or school-zone beacon) announces the child, giving the ADAS time to emergency-brake.',
    messages: ['PSM'],
    frame(t) {
      const cx = 470;
      const ex = t < 3 ? lerp(-40, 300, seg(t, 0, 3)) : (t < 4.8 ? lerp(300, 395, easeOut(seg(t, 3, 4.8))) : 395);
      const py = t < 1.8 ? 226 : lerp(226, 292, seg(t, 1.8, 4));
      const warn = t >= 2.4 && t < 5;
      const cars = [
        { id: 'p1', x: 418, y: 246, or: 'h', kind: 'car' },
        { id: 'p2', x: 522, y: 246, or: 'h', kind: 'car' },
        { id: 'ego', x: ex, y: 292, or: 'h', kind: 'car', label: 'EGO', alert: warn },
      ];
      const ped = { x: cx, y: py, broadcasting: true };
      const packets = []; let banner;
      if (t < 1.8) banner = { text: 'School zone — parked cars block the driver’s view', tone: 'info' };
      else if (t < 2.4) { packets.push({ ...lerpPt({ x: cx, y: py }, { x: ex, y: 292 }, seg(t, 1.8, 2.4)), label: 'PSM', tone: TONE.amber }); banner = { text: 'A child darts out → wearable / phone broadcasts a PSM', tone: 'warn' }; }
      else if (t < 5) banner = { text: '⚠ CHILD IN ROADWAY — emergency braking', tone: 'warn' };
      else banner = { text: 'Stopped in time — child unharmed', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, ped, banner, waves: t >= 1.8 && t < 5 };
    },
  },
  {
    id: 'aps', category: 'V2P', icon: '🦽', title: 'Accessible Ped Signal · Extended Crossing', tagline: 'Slow pedestrian requests more time',
    duration: 11,
    why: 'A pedestrian using a mobility device sends a crossing request; the controller grants a longer walk phase so they can finish safely. Vehicles hold on red until the extended pedestrian phase completes.',
    messages: ['PSM', 'SRM', 'SPaT'],
    frame(t) {
      const py = t < 2 ? 330 : lerp(330, 150, seg(t, 2, 10));
      const cars = [{ id: 'wait', x: G.ewStop, y: G.ewLaneY, or: 'h', kind: 'car' }];
      const ped = { x: 450, y: py, broadcasting: true };
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'A pedestrian with a mobility device waits to cross', tone: 'info' };
      else if (t < 3) { packets.push({ ...lerpPt({ x: 450, y: py }, G.rsu, seg(t, 1.5, 3)), label: 'request', tone: TONE.amber }); banner = { text: 'Their device sends a crossing request', tone: 'info' }; }
      else if (t < 4.2) { packets.push({ ...lerpPt(G.rsu, G.tc, seg(t, 3, 4.2)), label: 'request', tone: TONE.amber }); banner = { text: 'RSU → TC: extend the pedestrian WALK phase', tone: 'info' }; }
      else if (t < 9.5) banner = { text: 'Extended WALK granted — vehicles hold', tone: 'ok', sub: 'more crossing time for the vulnerable road user' };
      else banner = { text: 'Pedestrian finished crossing safely', tone: 'ok' };
      return { layout: 'cross', infra: 'signals', ew: 'red', ns: 'green', cars, packets, ped, banner, waves: t >= 1.5 && t < 4.2 };
    },
  },

  /* ---------------- more V2I ---------------- */
  {
    id: 'rail', category: 'V2I', icon: '🚂', title: 'Rail Crossing Warning', tagline: 'Train approaching the level crossing',
    duration: 10,
    why: 'An RSU at a highway–rail grade crossing detects an approaching train and broadcasts a warning. Connected vehicles receive it and stop before the tracks — even if the driver is distracted or the gates fail.',
    messages: ['TIM', 'SPaT'],
    frame(t) {
      const ex = t < 3 ? lerp(-40, 300, seg(t, 0, 3)) : (t < 4.6 ? lerp(300, G.ewStop, easeOut(seg(t, 3, 4.6))) : G.ewStop);
      const trainY = lerp(-170, 660, seg(t, 3, 10));
      const warn = t >= 2.6 && t < 9;
      const cars = [
        { id: 'train', x: 450, y: trainY, or: 'v', kind: 'train' },
        { id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: warn },
      ];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'Vehicle approaches a highway–rail grade crossing', tone: 'info' };
      else if (t < 2.6) { packets.push({ ...lerpPt(G.rsu, { x: ex, y: G.ewLaneY }, seg(t, 1.5, 2.6)), label: 'TIM', tone: TONE.violet }); banner = { text: 'RSU broadcasts a train-approaching warning', tone: 'warn' }; }
      else if (t < 9) banner = { text: '⚠ TRAIN APPROACHING — stop before the tracks', tone: 'warn' };
      else banner = { text: 'Vehicle held safely as the train passes', tone: 'ok' };
      return { layout: 'cross', infra: 'signals', rail: true, ew: 'red', ns: 'green', cars, packets, banner, waves: t >= 1.5 && t < 2.6 };
    },
  },
];

function ScenarioPlayer({ scn }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const raf = useRef(null);
  const last = useRef(0);

  useEffect(() => { setT(0); setPlaying(true); }, [scn.id]);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const loop = (now) => {
      const dt = (now - last.current) / 1000; last.current = now;
      setT((prev) => { const nt = prev + dt; if (nt >= scn.duration) { setPlaying(false); return scn.duration; } return nt; });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, scn.id, scn.duration]);

  const frame = scn.frame(Math.min(t, scn.duration));
  const atEnd = t >= scn.duration;
  const toneCls = { info: 'border-cyan-600/50 bg-cyan-950/70 text-cyan-100', warn: 'border-amber-600/60 bg-amber-950/70 text-amber-100', ok: 'border-emerald-600/60 bg-emerald-950/70 text-emerald-100' }[frame.banner.tone];

  return (
    <div className="flex-1 min-w-0 flex flex-col p-4">
      <div className="relative flex-1 min-h-0 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
        <MiniScene frame={frame} />
        {/* banner */}
        <div className={'absolute left-4 right-4 bottom-4 rounded-lg border px-4 py-2.5 ' + toneCls}>
          <div className="text-[13px] font-medium">{frame.banner.text}</div>
          {frame.banner.sub && <div className="mt-0.5 font-mono text-[11px] opacity-80">{frame.banner.sub}</div>}
        </div>
      </div>

      {/* transport controls */}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => { if (atEnd) { setT(0); } setPlaying((p) => !p); }}
          className="rounded-lg bg-neon-cyan px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110 glow-cyan">
          {playing ? '❚❚ Pause' : atEnd ? '↻ Replay' : '▶ Play'}
        </button>
        <button onClick={() => { setT(0); setPlaying(true); }} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-slate-300 hover:border-zinc-500">Restart</button>
        <input type="range" min="0" max={scn.duration} step="0.05" value={Math.min(t, scn.duration)}
          onChange={(e) => { setPlaying(false); setT(parseFloat(e.target.value)); }}
          className="flex-1 accent-cyan-400" />
        <span className="w-16 text-right font-mono text-[12px] text-slate-400">{t.toFixed(1)} / {scn.duration}s</span>
      </div>
    </div>
  );
}

function UseCasesTab({ openGlossary }) {
  const [id, setId] = useState(SCENARIOS[0].id);
  const [open, setOpen] = useState({});   // all categories collapsed by default
  const [variantId, setVariantId] = useState(null);
  const scn = SCENARIOS.find((s) => s.id === id);
  const cat = CATEGORIES.find((c) => c.id === scn.category);
  // reset to the first variant whenever the scenario changes
  useEffect(() => { setVariantId(scn.variants ? scn.variants[0].id : null); }, [id]);
  const variant = scn.variants ? (scn.variants.find((v) => v.id === variantId) || scn.variants[0]) : null;
  // effective scenario: base scenario with the active variant's frame/why/messages/tagline
  const eff = variant ? { ...scn, ...variant } : scn;
  return (
    <div className="flex h-full min-h-0">
      {/* scenario list, grouped by communication category */}
      <div className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-950/60 p-3 overflow-auto">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1 px-1">V2X Use Cases</h2>
        <p className="text-[11px] text-slate-500 mb-3 px-1">Grouped by who is communicating with whom.</p>
        {CATEGORIES.map((c) => {
          const items = SCENARIOS.filter((s) => s.category === c.id);
          const isOpen = open[c.id];
          return (
            <div key={c.id} className="mb-2">
              <button onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
                className="w-full flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 hover:border-zinc-600">
                <span className="text-slate-500 w-3">{isOpen ? '▾' : '▸'}</span>
                <span className="rounded bg-neon-cyan/15 text-neon-cyan text-[10px] font-bold px-1.5 py-0.5">{c.label}</span>
                <span className="text-[12px] text-slate-200">{c.name}</span>
                <span className="ml-auto text-[10px] text-slate-500">{items.length}</span>
              </button>
              {isOpen && (
                <div className="mt-1.5 space-y-1.5 pl-1">
                  {items.map((s) => (
                    <button key={s.id} onClick={() => setId(s.id)}
                      className={'w-full rounded-lg border p-2.5 text-left transition ' +
                        (id === s.id ? 'border-neon-cyan bg-neon-cyan/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600')}>
                      <div className="flex items-center gap-2"><span className="text-base">{s.icon}</span><span className="text-[12px] font-semibold text-slate-100">{s.title}</span></div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{s.tagline}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* player (+ variant toggle when the scenario has alternate perspectives) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {scn.variants && (
          <div className="px-4 pt-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Perspective</div>
            <Segmented value={variant.id} onChange={setVariantId}
              options={scn.variants.map((v) => ({ value: v.id, label: v.label }))} />
          </div>
        )}
        <ScenarioPlayer key={id + '-' + (variantId || '')} scn={eff} />
      </div>

      {/* explainer */}
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto">
        <div className="flex items-center gap-2 mb-1"><span className="text-2xl">{eff.icon}</span><h3 className="text-base font-bold text-slate-100">{eff.title}</h3></div>
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded bg-neon-cyan/15 text-neon-cyan text-[10px] font-bold px-1.5 py-0.5">{cat.label}</span>
          <span className="text-[12px] text-neon-cyan">{eff.tagline}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-300">{eff.why}</p>
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Messages involved <span className="text-slate-600">· click to look up</span></div>
          <div className="flex flex-wrap gap-1.5">
            {eff.messages.map((m) => {
              const term = glossaryTermFor(m);
              return term && openGlossary
                ? <button key={m} onClick={() => openGlossary(term)} className="rounded-md border border-neon-violet/40 bg-neon-violet/10 px-2 py-1 font-mono text-[11px] text-neon-violet hover:bg-neon-violet/20">{m} ↗</button>
                : <span key={m} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-slate-300">{m}</span>;
            })}
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-[11px] text-slate-400 leading-relaxed">
          <span className="text-slate-300 font-semibold">{cat.label}</span> — {cat.desc}. More could be added per category (transit signal priority, curve-speed & wrong-way warnings, cooperative merge, platooning…).
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   5. GLOSSARY
===================================================================== */
// `format` (optional): the real-world wire/message layout, shown via a toggle.
// Byte layouts for IETF/IEEE protocols are public & accurate; SAE J2735 and
// NTCIP 1202 object text are copyrighted (paywalled), so those structures are
// accurate *representative* sketches from public documentation, labeled as such.
const GLOSSARY = [
  { group: 'Devices', icon: '🛰️', items: [
    { term: 'Traffic Controller (TC)', def: 'The roadside computer cabinet that physically controls the traffic signal lights and timing phases based on loops, cameras, or fixed pre-timed schedules.' },
    { term: 'Advanced Traffic Controller (ATC)', def: 'A modern Linux-based controller (per the ATC 5201 standard) that can natively generate and sign SAE J2735 SPaT/MAP, unlike legacy NEMA TS2 / Model 170 controllers that only speak NTCIP 1202 and need the RSU to convert.' },
    { term: 'Roadside Unit (RSU)', def: 'An ITS device mounted on roadside infrastructure (like a signal pole) that facilitates wireless communication between the traffic controller and nearby vehicles or pedestrians.' },
    { term: 'On-Board Unit (OBU)', def: "A hardware transceiver installed inside a vehicle that receives over-the-air messages from the RSU and broadcasts the vehicle's own real-time state." },
    { term: 'ADAS', def: 'Advanced Driver-Assistance System — the in-vehicle brain that fuses incoming V2X messages with onboard sensors (radar/camera/lidar) to warn the driver or actuate braking and steering.' },
    { term: 'Vehicle', def: 'The final node containing the central ADAS/CPU processing brain that pulls data from the OBU, coordinates sensor fusion with internal vehicle metrics, and acts on safety logic.' },
    { term: 'VRU (Vulnerable Road User)', def: 'A pedestrian, cyclist, or road worker — a road user with no protective vehicle shell — whose position and presence are shared over V2X via a PSM.' },
  ]},
  { group: 'Standards › Communication', icon: '📶', items: [
    { term: 'Ethernet (IEEE 802.3)', def: 'The physical, high-speed wired connection typically used within the intersection cabinet to link the Traffic Controller to the RSU.',
      format: `Ethernet II frame (IEEE 802.3)
+----------+----------+------+-------------------+-----+
| Dst MAC  | Src MAC  | Type | Payload 46–1500 B | FCS |
|  6 bytes |  6 bytes | 2 B  |  (e.g. IP packet) | 4 B |
+----------+----------+------+-------------------+-----+
Preamble (7B) + SFD (1B) precede the frame.
EtherType: 0x0800 = IPv4 · 0x86DD = IPv6 · 0x0806 = ARP` },
    { term: 'TCP/IP', def: 'The standard internet protocol suite providing reliable, connection-oriented data transmission over wired infrastructure networks.',
      format: `IPv4 header (20 bytes) then TCP/UDP payload — RFC 791
 0      4       8             16                      31
+------+-------+--------------+------------------------+
|Ver=4 | IHL   | DSCP / ECN   | Total Length           |
+------+-------+--------------+-----+------------------+
| Identification             |Flags| Fragment Offset  |
+--------------+-------------+-----+-------------------+
| TTL          | Protocol    | Header Checksum         |
|              | 6=TCP 17=UDP|                         |
+--------------+-------------+-------------------------+
| Source IPv4 Address (32 bits)                        |
| Destination IPv4 Address (32 bits)                   |
+------------------------------------------------------+` },
    { term: 'UDP', def: 'A lightweight, connectionless transport protocol often favored in time-critical V2X operations where speed is prioritized over packet-delivery verification.',
      format: `UDP datagram header (8 bytes) — RFC 768
 0                16               31
+-----------------+----------------+
| Source Port     | Dest Port      |
+-----------------+----------------+
| Length          | Checksum       |
+-----------------+----------------+
| Data … (e.g. WSMP / SAE J2735)   |
+----------------------------------+` },
    { term: 'DSRC (IEEE 802.11p)', def: 'Dedicated Short-Range Communications; an older Wi-Fi-derived wireless standard operating in the 5.9 GHz spectrum for localized vehicular communication.',
      format: `DSRC / WAVE stack (5.9 GHz, 10 MHz channels)
IEEE 802.11p MAC (OCB mode — no association)
  └─ LLC / SNAP
      └─ WSMP  (IEEE 1609.3 — WAVE Short Message)
           • Version • PSID (provider service id)
           • Channel • DataRate • TxPower
           • WSM Length
           └─ IEEE 1609.2 secured payload
                 └─ SAE J2735 MessageFrame` },
    { term: 'C-V2X (3GPP)', def: 'Cellular Vehicle-to-Everything; a modern cellular-based communication standard utilizing direct PC5 sidelink communication to allow low-latency V2X transmissions without requiring a cellular network tower.',
      format: `C-V2X PC5 sidelink (3GPP Rel-14+)
PHY: SC-FDMA @ 5.9 GHz, sub-channelized
  └─ MAC  (Mode 4 autonomous / Mode 3 scheduled)
      └─ RLC / PDCP
          └─ IEEE 1609.2 secured payload
                └─ SAE J2735 MessageFrame
Direct device-to-device — no cellular tower required.` },
  ]},
  { group: 'Standards › Messages', icon: '📨', items: [
    { term: 'NTCIP 1202', def: 'The National Transportation Communications for ITS Protocol standard regulating how traffic signal controllers store and transmit signal phase and timing data over wired networks.',
      format: `NTCIP 1202 — signal-controller objects (SNMP MIB)
Accessed via SNMP GET/SET on OIDs (BER-encoded).
Enterprise root: 1.3.6.1.4.1.1206  (NEMA / AASHTO / ITE)
Representative phase / SPaT objects:
  phaseNumber              …1206.4.2.1.1.2.1.1
  phaseStatusGroupGreens   …1206.4.2.1.1.4.x
  phaseStatusGroupYellows  …1206.4.2.1.1.4.x
  phaseStatusGroupReds     …1206.4.2.1.1.4.x
  phaseMinimumGreen · phaseYellowChange · phaseRedClear
v03 adds SPaT/MAP support for connected vehicles.
— Representative; authoritative text © NTCIP (paywalled).` },
    { term: 'SAE J2735', def: 'The foundational message set dictionary standard specifying the data payload formats used for over-the-air V2X safety applications.',
      format: `SAE J2735 MessageFrame (ASN.1, UPER-encoded over the air)
MessageFrame ::= SEQUENCE {
  messageId  DSRCmsgID,   -- 18=MAP 19=SPaT 20=BSM
                          -- 29=SRM 30=SSM 31=TIM 32=PSM
  value      ANY DEFINED BY messageId
}
Encoding: UPER (Unaligned Packed Encoding Rules).
— Representative sketch; the authoritative ASN.1 module
  is © SAE International (J2735), paywalled.` },
    { term: 'BSM (Basic Safety Message)', child: 'SAE J2735', def: 'Broadcasted continuously by vehicles containing high-frequency kinematic state data (position, speed, heading, braking state).',
      format: `BasicSafetyMessage — representative ASN.1
BasicSafetyMessage ::= SEQUENCE {
  coreData  BSMcoreData,
  partII    SEQUENCE OF PartIIcontent OPTIONAL
}
BSMcoreData ::= SEQUENCE {
  msgCnt, id (4-byte TemporaryID — rotates for privacy),
  secMark (ms), lat, long, elev, accuracy,
  transmission, speed (0.02 m/s), heading (0.0125°),
  angle, accelSet (long/lat/vert/yaw),
  brakes (BrakeSystemStatus), size (VehicleSize)
}
Broadcast at ~10 Hz.  — © SAE J2735, paywalled.` },
    { term: 'SPaT (Signal Phase and Timing)', child: 'SAE J2735', def: 'Broadcasted by RSUs to communicate the current color status of every intersection signal group and the countdown time remaining until the next phase change.',
      format: `SPAT — representative ASN.1
SPAT ::= SEQUENCE {
  timeStamp     MinuteOfTheYear OPTIONAL,
  intersections IntersectionStateList     -- 1..32
}
IntersectionState ::= SEQUENCE {
  id, revision, status, states MovementList
}
MovementState ::= SEQUENCE {
  signalGroup  SignalGroupID,             -- ties to MAP lanes
  state-time-speed MovementEventList {
    eventState (stop-and-remain / protected-movement …),
    timing { minEndTime, maxEndTime }     -- 1/10 s of the hour
  }
}
— © SAE J2735, paywalled.` },
    { term: 'MAP (Intersection Geometry)', child: 'SAE J2735', def: 'Broadcasted by RSUs to provide a centimeter-accurate digital layout of lane centerlines, lane attributes, allowed maneuvers, and stop bar boundaries.',
      format: `MapData — representative ASN.1
MapData ::= SEQUENCE {
  msgIssueRevision  MsgCount,
  intersections     IntersectionGeometryList OPTIONAL
}
IntersectionGeometry ::= SEQUENCE {
  id        IntersectionReferenceID,
  refPoint  Position3D,           -- anchor lat/long/elev
  laneWidth LaneWidth OPTIONAL,
  laneSet   LaneList              -- per lane: id, attributes,
                                  -- connections, node centerline
}
Static geometry — usually stored & broadcast by the RSU.
— © SAE J2735, paywalled.` },
    { term: 'PSM (Personal Safety Message)', child: 'SAE J2735', def: 'Broadcasted by or for Vulnerable Road Users (VRUs) like pedestrians, cyclists, or road workers to declare their position and presence to passing vehicles.',
      format: `PersonalSafetyMessage — representative ASN.1
PersonalSafetyMessage ::= SEQUENCE {
  basicType  PersonalDeviceUserType,  -- pedestrian/cyclist/…
  secMark    DSecond,
  id         TemporaryID,
  position   Position3D,
  accuracy   PositionalAccuracy,
  speed      Speed,
  heading    Heading,
  …          (path history, activity) OPTIONAL
}
— © SAE J2735, paywalled.` },
    { term: 'SRM / SSM', child: 'SAE J2735', def: 'Signal Request Message (a vehicle asking for priority/preemption) and Signal Status Message (the controller’s response confirming the request state).',
      format: `SignalRequestMessage / SignalStatusMessage — representative
SignalRequestMessage ::= SEQUENCE {
  second     DSecond,
  requests   SignalRequestList OPTIONAL,  -- desired group + ETA
  requestor  RequestorDescription         -- role: fire, police,
                                           -- ambulance, transit …
}
SignalStatusMessage ::= SEQUENCE {
  status  SignalStatusList   -- per request: requested,
                             -- processing, granted, rejected
}
— © SAE J2735, paywalled.` },
    { term: 'TIM (Traveler Information Message)', child: 'SAE J2735', def: 'Advisory content — work zones, reduced-speed zones, road-weather, and incident/hazard alerts — delivered to vehicles by roadside units or over the cellular network from a Traffic Management Center.',
      format: `TravelerInformation — representative ASN.1
TravelerInformation ::= SEQUENCE {
  packetID   UniqueMSGID OPTIONAL,
  dataFrames TravelerDataFrameList {       -- 1..8
    startYear / startTime, duration,
    regions  (applicable geometry / lanes),
    content  (ITIS codes | text | speed limit)
  }
}
Used for work-zone, speed, weather & incident alerts.
— © SAE J2735, paywalled.` },
  ]},
  { group: 'Security', icon: '🔒', items: [
    { term: 'IEEE 1609.2', def: 'The V2X message-security standard. Every over-the-air frame is signed (ECDSA) with a certificate so receivers can verify authenticity and integrity — and reject spoofed or tampered messages.',
      format: `IEEE 1609.2 secured data (ASN.1, COER-encoded)
Ieee1609Dot2Data ::= SEQUENCE {
  protocolVersion  Uint8 (3),
  content          Ieee1609Dot2Content
}
Ieee1609Dot2Content ::= CHOICE {
  signedData     SignedData,     -- typical for V2X safety msgs
  encryptedData  EncryptedData, …
}
SignedData ::= SEQUENCE {
  hashId    HashAlgorithm,        -- sha256
  tbsData   ToBeSignedData,       -- payload + PSID + genTime
  signer    SignerIdentifier,     -- certificate | digest
  signature Signature             -- ECDSA (NISTp256 / brainpool)
}
Public structure (IEEE); certificates issued by the SCMS.` },
    { term: 'SCMS', def: 'Security Credential Management System — the public-key infrastructure that issues and revokes the short-lived pseudonym certificates V2X devices use to sign messages, providing trust while protecting driver privacy.' },
  ]},
  { group: 'Applications (V2X apps)', icon: '🎬', items: [
    { term: 'GLOSA', def: 'Green Light Optimal Speed Advisory — uses SPaT to advise the speed that lets a vehicle arrive on green, cutting stops, idling and fuel.' },
    { term: 'RLVW', def: 'Red-Light Violation Warning — the ADAS combines SPaT (time-to-red) and MAP (distance to the stop bar) to predict, and warn of, a red-light running.' },
    { term: 'FCW', def: 'Forward Collision Warning — a following vehicle is warned when a lead vehicle’s BSM shows hard braking or a rapidly closing gap.' },
    { term: 'EEBL', def: 'Emergency Electronic Brake Light — a vehicle’s hard braking is broadcast via BSM so vehicles behind (even beyond line of sight) are warned.' },
    { term: 'IMA', def: 'Intersection Movement Assist — crossing vehicles exchange BSMs to warn of a collision when the view of cross-traffic is blocked.' },
    { term: 'DNPW', def: 'Do Not Pass Warning — warns a driver against passing when an oncoming vehicle (revealed by its BSM) makes the maneuver unsafe.' },
    { term: 'CACC / Platooning', def: 'Cooperative Adaptive Cruise Control — vehicles share BSMs to hold tight, synchronized following gaps and brake together far faster than human reaction.' },
    { term: 'TSP', def: 'Transit Signal Priority — a behind-schedule bus sends an SRM to extend the green (a softer form of preemption) and stay on schedule.' },
    { term: 'RSZW', def: 'Reduced-Speed / Work-Zone Warning — a TIM (often delivered over the cellular network) advises a lower speed ahead of a work zone.' },
    { term: 'HRI Warning', def: 'Highway-Rail Intersection Warning — an RSU at a level crossing warns approaching connected vehicles of an oncoming train.' },
  ]},
  { group: 'Architecture', icon: '🧭', items: [
    { term: 'TC → RSU', def: 'The local, wired data pipeline where signal controller telemetry is fed to the roadside radio, often requiring a conversion layer to shift from NTCIP 1202 streams to standardized J2735 messages.' },
    { term: 'RSU → Vehicle', def: 'The wireless over-the-air data pipeline where SPaT and MAP messages are packaged, cryptographically wrapped via IEEE 1609.2 security standards, and broadcasted over radio waves.' },
    { term: 'End-to-End Data Flow', def: "The complete loop where a traffic cabinet change is generated, encoded, cryptographically signed, wirelessly broadcasted, received by an OBU, and passed through a vehicle's sensor fusion algorithm to protect human life." },
  ]},
];

function GlossaryTab({ target }) {
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState(() => GLOSSARY.map((g) => g.group));
  const [selected, setSelected] = useState(GLOSSARY[0].items[0]);
  const [view, setView] = useState('def');   // 'def' | 'format'
  useEffect(() => { setView('def'); }, [selected]);   // reset toggle when the term changes
  // jump to a term when cross-linked from another tab
  useEffect(() => {
    if (!target) return;
    for (const g of GLOSSARY) { const it = g.items.find((i) => i.term === target.term); if (it) { setSelected(it); setQ(''); return; } }
  }, [target]);
  const ql = q.trim().toLowerCase();
  const match = (it) => !ql || it.term.toLowerCase().includes(ql) || it.def.toLowerCase().includes(ql);
  const toggleGroup = (g) => setOpenGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  return (
    <div className="flex h-full min-h-0">
      <div className="w-80 shrink-0 border-r border-zinc-800 bg-zinc-950/60 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm mb-3"><span className="text-lg">📚</span> V2X Definitions</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-neon-cyan focus:outline-none" />
        </div>
        <div className="flex-1 overflow-auto p-2">
          <div className="px-2 py-1 font-mono text-[12px] text-slate-500">V2X/</div>
          {GLOSSARY.map((g) => {
            const items = g.items.filter(match);
            if (ql && items.length === 0) return null;
            const open = ql ? true : openGroups.includes(g.group);
            return (
              <div key={g.group} className="mb-1">
                <button onClick={() => toggleGroup(g.group)} className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-zinc-900">
                  <span className="text-slate-500 w-3">{open ? '▾' : '▸'}</span><span>{g.icon}</span><span className="font-medium">{g.group}</span>
                </button>
                {open && (
                  <div className="ml-4 border-l border-zinc-800 pl-2">
                    {items.map((it) => (
                      <button key={it.term} onClick={() => setSelected(it)}
                        className={'w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] transition ' +
                          (selected?.term === it.term ? 'bg-neon-cyan/15 text-neon-cyan' : 'text-slate-300 hover:bg-zinc-900')}>
                        {it.child ? '└ ' : ''}{it.term}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-auto p-8">
        {selected && (
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-widest text-neon-cyan mb-2">{selected.child ? `${selected.child} › ${selected.term}` : 'Definition'}</div>
            <h1 className="text-2xl font-bold text-slate-100">{selected.term}</h1>

            {selected.format && (
              <div className="mt-4 inline-flex rounded-lg border border-zinc-700 bg-zinc-900/70 p-1">
                {[{ v: 'def', l: 'Definition' }, { v: 'format', l: 'Format' }].map((o) => (
                  <button key={o.v} onClick={() => setView(o.v)}
                    className={'rounded-md px-3 py-1 text-[13px] font-medium transition ' + (view === o.v ? 'bg-neon-cyan text-zinc-950' : 'text-slate-300 hover:text-white')}>{o.l}</button>
                ))}
              </div>
            )}

            {(!selected.format || view === 'def') && (
              <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{selected.def}</p>
            )}

            {selected.format && view === 'format' && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Standard wire / message format</div>
                <pre className="rounded-xl border border-zinc-800 bg-black/60 p-4 font-mono text-[12px] leading-relaxed text-slate-200 overflow-auto whitespace-pre">{selected.format}</pre>
                <p className="mt-2 text-[11px] text-slate-500">IETF/IEEE byte layouts are the real public formats. SAE J2735 &amp; NTCIP 1202 structures are accurate representative sketches — their authoritative text is copyrighted/paywalled.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   6. APP SHELL + TOP NAVIGATION
===================================================================== */
const TABS = [
  { id: 'builder', label: 'World Builder', icon: '🛠️' },
  { id: 'cases', label: 'Use Cases', icon: '🎬' },
  { id: 'glossary', label: 'V2X Definitions Glossary', icon: '📖' },
];

function App() {
  const [tab, setTab] = useState(() => lsGet('v2x_tab', 'builder'));
  const [glossaryTarget, setGlossaryTarget] = useState(null);
  useEffect(() => { lsSet('v2x_tab', tab); }, [tab]);
  const openGlossary = (term) => { setGlossaryTarget({ term, k: Date.now() }); setTab('glossary'); };
  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚦</span>
            <div>
              <div className="text-sm font-bold text-slate-100 leading-none">V2X Infrastructure Playground</div>
              <div className="text-[11px] text-slate-500">Vehicle-to-Everything · Build · Simulate · Learn</div>
            </div>
          </div>
          <nav className="ml-6 flex gap-1">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={'rounded-lg px-3.5 py-2 text-sm font-medium transition ' +
                  (tab === t.id ? 'bg-neon-cyan/15 text-neon-cyan' : 'text-slate-400 hover:text-white hover:bg-zinc-900')}>
                <span className="mr-1.5">{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 min-h-0">
        {tab === 'builder' && <WorldBuilderTab openGlossary={openGlossary} />}
        {tab === 'cases' && <UseCasesTab openGlossary={openGlossary} />}
        {tab === 'glossary' && <GlossaryTab target={glossaryTarget} />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

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
  if (s.has('rsu') && (s.has('obu') || s.has('ped'))) return 'wireless';
  if (s.has('tc') && s.has('signal')) return 'signal';
  return 'generic';
}
const CONN_STYLE = {
  ethernet: { color: '#f472b6', dash: '0', label: 'Ethernet · NTCIP 1202' },
  wireless: { color: '#a78bfa', dash: '3 7', label: 'C-V2X · SAE J2735' },
  signal:   { color: '#64748b', dash: '0', label: 'Signal control' },
  generic:  { color: '#64748b', dash: '4 6', label: 'link' },
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

/* =====================================================================
   3. WORLD BUILDER
===================================================================== */
const WB = { w: 1000, h: 640 };
let _uid = 0;
const uid = (t) => `${t}-${++_uid}`;

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
function DeviceArt({ type, model }) {
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
    case 'signal':
      return (
        <g>
          <rect x="-13" y="-38" width="26" height="76" rx="6" className="fill-zinc-950 stroke-zinc-600" strokeWidth="2" />
          <circle cx="0" cy="-22" r="8" className="fill-neon-red glow-red" />
          <circle cx="0" cy="0" r="8" className="fill-zinc-700" />
          <circle cx="0" cy="22" r="8" className="fill-zinc-700" />
          {tag(model ? model.name : 'Signal Head')}
        </g>
      );
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

function WorldBuilderTab() {
  const [objects, setObjects] = useState([]);
  const [conns, setConns] = useState([]);
  const [sel, setSel] = useState(null);              // {kind:'obj'|'conn', id}
  const [snap, setSnap] = useState(true);
  const drag = useRef(null);                          // {id, ox, oy}
  const [wiring, setWiring] = useState(null);         // {from, x, y}
  const svgRef = useRef(null);

  const byId = useMemo(() => Object.fromEntries(objects.map((o) => [o.id, o])), [objects]);
  const selObj = sel?.kind === 'obj' ? byId[sel.id] : null;
  const selConn = sel?.kind === 'conn' ? conns.find((c) => c.id === sel.id) : null;

  const snapV = (v) => (snap ? Math.round(v / 10) * 10 : Math.round(v));
  const clampC = (o) => ({ ...o, x: Math.max(20, Math.min(WB.w - 20, o.x)), y: Math.max(20, Math.min(WB.h - 20, o.y)) });

  const addObject = (type, pos) => {
    const modelId = MODELS[type]?.[0]?.id;
    const o = clampC({ id: uid(type), type, modelId, x: snapV(pos.x), y: snapV(pos.y) });
    setObjects((prev) => [...prev, o]);
    setSel({ kind: 'obj', id: o.id });
  };
  const removeSelected = useCallback(() => {
    if (!sel) return;
    if (sel.kind === 'obj') {
      setObjects((prev) => prev.filter((o) => o.id !== sel.id));
      setConns((prev) => prev.filter((c) => c.from !== sel.id && c.to !== sel.id));
    } else {
      setConns((prev) => prev.filter((c) => c.id !== sel.id));
    }
    setSel(null);
  }, [sel]);

  // keyboard delete
  useEffect(() => {
    const h = (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSelected(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [sel, removeSelected]);

  // palette drop
  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('v2x/type');
    if (!type || !svgRef.current) return;
    addObject(type, svgPoint(svgRef.current, e.clientX, e.clientY));
  };

  // pointer interactions on the canvas
  const onPointerMove = (e) => {
    if (!svgRef.current) return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    if (drag.current) {
      const { id, ox, oy } = drag.current;
      setObjects((prev) => prev.map((o) => o.id === id ? clampC({ ...o, x: snapV(p.x - ox), y: snapV(p.y - oy) }) : o));
    } else if (wiring) {
      setWiring({ ...wiring, x: p.x, y: p.y });
    }
  };
  const endInteraction = (e) => {
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
        if (!exists) setConns((prev) => [...prev, { id: uid('c'), from: wiring.from, to: best.id }]);
      }
    }
    drag.current = null;
    setWiring(null);
  };

  const startDrag = (o, e) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    drag.current = { id: o.id, ox: p.x - o.x, oy: p.y - o.y };
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

  const paletteGroups = [
    { title: 'Devices', items: ['tc', 'rsu', 'obu', 'signal', 'ped'] },
    { title: 'Scenery', items: ['roadH', 'roadV'] },
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* palette */}
      <div className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950/60 p-3 overflow-auto">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Palette</h2>
        <p className="text-[11px] text-slate-500 mb-3">Drag onto the canvas (or click to drop at center).</p>
        {paletteGroups.map((g) => (
          <div key={g.title} className="mb-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">{g.title}</div>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((t) => (
                <div key={t} draggable
                  onDragStart={(e) => e.dataTransfer.setData('v2x/type', t)}
                  onClick={() => addObject(t, { x: WB.w / 2, y: WB.h / 2 })}
                  className="cursor-grab active:cursor-grabbing rounded-lg border border-zinc-700 bg-zinc-900/70 px-2 py-2 text-center hover:border-neon-cyan/60 transition">
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
          <button onClick={() => setSnap((s) => !s)} className={'rounded px-2 py-0.5 ' + (snap ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-slate-400 hover:text-white')}>Snap {snap ? 'on' : 'off'}</button>
          <button onClick={() => { setObjects([]); setConns([]); setSel(null); }} className="rounded px-2 py-0.5 text-slate-400 hover:text-neon-red">Clear all</button>
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
              return (
                <g key={o.id} transform={`translate(${o.x},${o.y})`} className={'spart ' + (isSel ? 'part-hi' : '')}
                   style={{ cursor: 'move' }} onPointerDown={(e) => startDrag(o, e)}>
                  {/* selection outline + hit padding */}
                  <rect x={-sz.w / 2 - 4} y={-sz.h / 2 - 4} width={sz.w + 8} height={sz.h + 8} rx="8"
                    fill="transparent" stroke={isSel ? '#22d3ee' : 'transparent'} strokeDasharray="6 5" />
                  <DeviceArt type={o.type} model={model} />
                  {/* wiring port (its own handler pre-empts the group drag) */}
                  <circle cx="0" cy={-sz.h / 2 - 14} r="6" className="fill-zinc-950 stroke-neon-cyan" strokeWidth="2"
                    style={{ cursor: 'crosshair' }} onPointerDown={(e) => startWire(o, e)} />
                </g>
              );
            })}
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
      </div>

      {/* properties / spec panel */}
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto">
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
                      onClick={() => setObjects((prev) => prev.map((o) => o.id === selObj.id ? { ...o, modelId: m.id } : o))}
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

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { const n = clampC({ ...selObj, id: uid(selObj.type), x: selObj.x + 40, y: selObj.y + 40 }); setObjects((p) => [...p, n]); setSel({ kind: 'obj', id: n.id }); }}
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
};

function lightColor(state) { return state === 'green' ? TONE.green : state === 'yellow' ? TONE.amber : TONE.red; }

function MiniScene({ frame }) {
  const f = frame;
  const head = (pos, color, vertical) => (
    <g transform={`translate(${pos.x},${pos.y})`}>
      <rect x="-12" y="-30" width="24" height="60" rx="5" className="fill-zinc-950 stroke-zinc-600" />
      <circle cx="0" cy="-16" r="6" fill={color === TONE.red ? TONE.red : '#3f1d1d'} className={color === TONE.red ? 'glow-red' : ''} />
      <circle cx="0" cy="0" r="6" fill={color === TONE.amber ? TONE.amber : '#3f3416'} />
      <circle cx="0" cy="16" r="6" fill={color === TONE.green ? TONE.green : '#173f2a'} className={color === TONE.green ? 'glow-green' : ''} />
    </g>
  );
  const vehicle = (c) => {
    const h = c.or === 'h';
    const w = h ? 72 : 44, ht = h ? 42 : 78;
    const body = c.kind === 'ambulance' ? '#f1f5f9' : '#1d4ed8';
    const stroke = c.alert ? TONE.red : (c.kind === 'ambulance' ? '#ef4444' : '#93c5fd');
    return (
      <g key={c.id} transform={`translate(${c.x},${c.y})`} className={c.alert ? 'crashflash' : ''}>
        <rect x={-w / 2} y={-ht / 2} width={w} height={ht} rx="13" fill={body} stroke={stroke} strokeWidth="2.5" />
        {c.kind === 'ambulance' && <rect x={-w / 2} y="-4" width={w} height="8" fill="#ef4444" />}
        {c.kind === 'ambulance' && <><rect x="-9" y={-ht / 2 - 6} width="7" height="6" fill="#ef4444" /><rect x="2" y={-ht / 2 - 6} width="7" height="6" fill="#3b82f6" /></>}
        {h ? <rect x={w / 2 - 16} y={-ht / 2 + 6} width="12" height={ht - 12} rx="4" className="fill-cyan-200/70" />
           : <rect x={-w / 2 + 6} y={-ht / 2 + 6} width={w - 12} height="14" rx="4" className="fill-cyan-200/70" />}
        {c.label && <text x="0" y="4" textAnchor="middle" className="fill-zinc-900 text-[10px] font-bold">{c.label}</text>}
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${MS.w} ${MS.h}`} className="w-full h-full">
      <defs>
        <pattern id="grid2" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#1e293b" strokeWidth="1" /></pattern>
      </defs>
      <rect width={MS.w} height={MS.h} fill="url(#grid2)" />
      {/* roads */}
      <rect x="0" y={G.ewY0} width={MS.w} height={G.ewY1 - G.ewY0} className="fill-zinc-800" />
      <rect x={G.nsX0} y="0" width={G.nsX1 - G.nsX0} height={MS.h} className="fill-zinc-800" />
      <line x1="0" y1={(G.ewY0 + G.ewY1) / 2} x2={MS.w} y2={(G.ewY0 + G.ewY1) / 2} strokeDasharray="20 16" className="stroke-yellow-500/60" strokeWidth="2" />
      <line x1={(G.nsX0 + G.nsX1) / 2} y1="0" x2={(G.nsX0 + G.nsX1) / 2} y2={MS.h} strokeDasharray="20 16" className="stroke-yellow-500/60" strokeWidth="2" />
      {/* stop bars */}
      <rect x={G.ewStop + 18} y={G.ewY0} width="6" height={(G.ewY1 - G.ewY0) / 2} className="fill-white/80" />
      <rect x={(G.nsX0 + G.nsX1) / 2} y={G.nsStop - 24} width={(G.nsX1 - G.nsX0) / 2} height="6" className="fill-white/80" />

      {/* pole + RSU + TC cabinet */}
      <line x1={G.rsu.x} y1="200" x2={G.rsu.x} y2={G.ewY0 - 8} className="stroke-zinc-600" strokeWidth="6" />
      <rect x={G.tc.x - 22} y={G.tc.y - 26} width="44" height="64" rx="5" className="fill-zinc-700 stroke-zinc-500" />
      <text x={G.tc.x} y={G.tc.y + 4} textAnchor="middle" className="fill-neon-green text-[10px] font-bold">TC</text>
      <line x1={G.rsu.x + 26} y1={G.rsu.y} x2={G.tc.x - 22} y2={G.tc.y} className="stroke-pink-400" strokeWidth="2" />
      {/* radio waves */}
      {f.rsuActive && [0, 1, 2].map((k) => (
        <path key={k} d={`M ${G.rsu.x - 6} ${G.rsu.y + 14} A ${30 + k * 18} ${30 + k * 18} 0 0 0 ${G.rsu.x - 36 - k * 12} ${G.rsu.y + 40 + k * 14}`}
          fill="none" stroke="#a78bfa" strokeWidth="2.5" className={f.waves ? 'radiowave' : ''} style={{ animationDelay: k * 0.4 + 's' }} opacity="0.8" />
      ))}
      <rect x={G.rsu.x - 26} y={G.rsu.y - 15} width="52" height="30" rx="6" className="fill-emerald-500/20 stroke-neon-green" />
      <text x={G.rsu.x} y={G.rsu.y + 4} textAnchor="middle" className="fill-neon-green text-[10px] font-bold">RSU</text>

      {/* signal heads */}
      {head(G.ewHead, lightColor(f.ew), false)}
      {head(G.nsHead, lightColor(f.ns), true)}

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
    id: 'srm', icon: '🚑', title: 'Emergency Vehicle Preemption', tagline: 'SRM → green for the ambulance',
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
    id: 'rlvw', icon: '⚠️', title: 'Red-Light Violation Warning', tagline: 'ADAS predicts the driver can’t stop in time',
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
    id: 'detect', icon: '🎯', title: 'V2X Actuated Detection', tagline: 'BSM replaces loops & cameras',
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
    id: 'glosa', icon: '🌊', title: 'GLOSA — Green-Wave Advisory', tagline: 'Advised speed to catch the green',
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

function UseCasesTab() {
  const [id, setId] = useState(SCENARIOS[0].id);
  const scn = SCENARIOS.find((s) => s.id === id);
  return (
    <div className="flex h-full min-h-0">
      {/* scenario list */}
      <div className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-950/60 p-3 overflow-auto">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1 px-1">V2X Use Cases</h2>
        <p className="text-[11px] text-slate-500 mb-3 px-1">Real problems this technology solves. Pick one to watch it play out.</p>
        {SCENARIOS.map((s) => (
          <button key={s.id} onClick={() => setId(s.id)}
            className={'w-full mb-2 rounded-xl border p-3 text-left transition ' +
              (id === s.id ? 'border-neon-cyan bg-neon-cyan/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600')}>
            <div className="flex items-center gap-2"><span className="text-lg">{s.icon}</span><span className="text-[13px] font-semibold text-slate-100">{s.title}</span></div>
            <div className="mt-1 text-[11px] text-slate-400">{s.tagline}</div>
          </button>
        ))}
      </div>

      {/* player */}
      <ScenarioPlayer scn={scn} />

      {/* explainer */}
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto">
        <div className="flex items-center gap-2 mb-1"><span className="text-2xl">{scn.icon}</span><h3 className="text-base font-bold text-slate-100">{scn.title}</h3></div>
        <div className="text-[12px] text-neon-cyan mb-3">{scn.tagline}</div>
        <p className="text-[13px] leading-relaxed text-slate-300">{scn.why}</p>
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Messages involved</div>
          <div className="flex flex-wrap gap-1.5">
            {scn.messages.map((m) => <span key={m} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-neon-violet">{m}</span>)}
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-[11px] text-slate-400 leading-relaxed">
          These are a few high-value examples — V2X also enables curve-speed warnings, work-zone alerts, transit signal priority, wrong-way detection, and cooperative merging.
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   5. GLOSSARY
===================================================================== */
const GLOSSARY = [
  { group: 'Devices', icon: '🛰️', items: [
    { term: 'Traffic Controller (TC)', def: 'The roadside computer cabinet that physically controls the traffic signal lights and timing phases based on loops, cameras, or fixed pre-timed schedules.' },
    { term: 'Roadside Unit (RSU)', def: 'An ITS device mounted on roadside infrastructure (like a signal pole) that facilitates wireless communication between the traffic controller and nearby vehicles or pedestrians.' },
    { term: 'On-Board Unit (OBU)', def: "A hardware transceiver installed inside a vehicle that receives over-the-air messages from the RSU and broadcasts the vehicle's own real-time state." },
    { term: 'Vehicle', def: 'The final node containing the central ADAS/CPU processing brain that pulls data from the OBU, coordinates sensor fusion with internal vehicle metrics, and acts on safety logic.' },
  ]},
  { group: 'Standards › Communication', icon: '📶', items: [
    { term: 'Ethernet (IEEE 802.3)', def: 'The physical, high-speed wired connection typically used within the intersection cabinet to link the Traffic Controller to the RSU.' },
    { term: 'TCP/IP', def: 'The standard internet protocol suite providing reliable, connection-oriented data transmission over wired infrastructure networks.' },
    { term: 'UDP', def: 'A lightweight, connectionless transport protocol often favored in time-critical V2X operations where speed is prioritized over packet-delivery verification.' },
    { term: 'DSRC (IEEE 802.11p)', def: 'Dedicated Short-Range Communications; an older Wi-Fi-derived wireless standard operating in the 5.9 GHz spectrum for localized vehicular communication.' },
    { term: 'C-V2X (3GPP)', def: 'Cellular Vehicle-to-Everything; a modern cellular-based communication standard utilizing direct PC5 sidelink communication to allow low-latency V2X transmissions without requiring a cellular network tower.' },
  ]},
  { group: 'Standards › Messages', icon: '📨', items: [
    { term: 'NTCIP 1202', def: 'The National Transportation Communications for ITS Protocol standard regulating how traffic signal controllers store and transmit signal phase and timing data over wired networks.' },
    { term: 'SAE J2735', def: 'The foundational message set dictionary standard specifying the data payload formats used for over-the-air V2X safety applications.' },
    { term: 'BSM (Basic Safety Message)', def: 'Broadcasted continuously by vehicles containing high-frequency kinematic state data (position, speed, heading, braking state).', child: 'SAE J2735' },
    { term: 'SPaT (Signal Phase and Timing)', def: 'Broadcasted by RSUs to communicate the current color status of every intersection signal group and the countdown time remaining until the next phase change.', child: 'SAE J2735' },
    { term: 'MAP (Intersection Geometry)', def: 'Broadcasted by RSUs to provide a centimeter-accurate digital layout of lane centerlines, lane attributes, allowed maneuvers, and stop bar boundaries.', child: 'SAE J2735' },
    { term: 'PSM (Personal Safety Message)', def: 'Broadcasted by or for Vulnerable Road Users (VRUs) like pedestrians, cyclists, or road workers to declare their position and presence to passing vehicles.', child: 'SAE J2735' },
    { term: 'SRM / SSM', def: 'Signal Request Message (a vehicle asking for priority/preemption) and Signal Status Message (the controller’s response confirming the request state).', child: 'SAE J2735' },
  ]},
  { group: 'Architecture', icon: '🧭', items: [
    { term: 'TC → RSU', def: 'The local, wired data pipeline where signal controller telemetry is fed to the roadside radio, often requiring a conversion layer to shift from NTCIP 1202 streams to standardized J2735 messages.' },
    { term: 'RSU → Vehicle', def: 'The wireless over-the-air data pipeline where SPaT and MAP messages are packaged, cryptographically wrapped via IEEE 1609.2 security standards, and broadcasted over radio waves.' },
    { term: 'End-to-End Data Flow', def: "The complete loop where a traffic cabinet change is generated, encoded, cryptographically signed, wirelessly broadcasted, received by an OBU, and passed through a vehicle's sensor fusion algorithm to protect human life." },
  ]},
];

function GlossaryTab() {
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState(() => GLOSSARY.map((g) => g.group));
  const [selected, setSelected] = useState(GLOSSARY[0].items[0]);
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
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{selected.def}</p>
            <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Where it lives in the pipeline</div>
              <div className="flex items-center gap-2 text-sm text-slate-400 font-mono flex-wrap">
                <span className="rounded bg-zinc-800 px-2 py-1">TC</span>→<span className="rounded bg-zinc-800 px-2 py-1">RSU</span>→<span className="rounded bg-zinc-800 px-2 py-1">OBU</span>→<span className="rounded bg-zinc-800 px-2 py-1">Vehicle</span>
              </div>
            </div>
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
  const [tab, setTab] = useState('builder');
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
        {tab === 'builder' && <WorldBuilderTab />}
        {tab === 'cases' && <UseCasesTab />}
        {tab === 'glossary' && <GlossaryTab />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

/* =====================================================================
   V2X Sandbox
   ---------------------------------------------------------------------
   Source of truth. Edit this file, then run `node build.js` to regenerate
   the self-contained (fully offline) index.html.  Tests: `npm test`.

   TABLE OF CONTENTS  (search for the marked "N." section headers)
     1.  Device types + real-world model catalog (spec sheets)
     1b. Connections, message model + linkStreams (packet flow logic)
     2.  UI primitives (Segmented, JsonView)
     3.  World Builder tab  (drag-drop sandbox · wiring · live simulation)
     4.  Use Cases tab      (MiniScene + animated scenario timelines)
     5.  Glossary tab       (definitions + real wire/message formats)
     5b. Device Anatomy tab (cabinet cutaway you wire up + RSU internals)
     5c. Test Your Knowledge (quiz)
     6.  App shell + top navigation

   Tabs the user sees: World Builder · Use Cases · Test Your Knowledge ·
   Device Anatomy · Glossary.
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
  hub:   { label: 'V2X Hub (edge compute)', cat: 'device', size: { w: 66, h: 52 }, glyph: '🖥️' },
  obu:   { label: 'Vehicle (OBU)',       cat: 'device', size: { w: 52, h: 90 }, glyph: '🚗' },
  ev:    { label: 'Emergency Vehicle',   cat: 'device', size: { w: 52, h: 92 }, glyph: '🚑' },
  bus:   { label: 'Bus / Transit',       cat: 'device', size: { w: 54, h: 100 }, glyph: '🚌' },
  signal:{ label: 'Signal Head',         cat: 'device', size: { w: 30, h: 78 }, glyph: '🚦' },
  ped:   { label: 'Pedestrian (VRU)',    cat: 'device', size: { w: 40, h: 60 }, glyph: '🚶' },
  lidar: { label: 'LiDAR Sensor',        cat: 'device', size: { w: 38, h: 34 }, glyph: '🛰️' },
  radar: { label: 'Radar Sensor',        cat: 'device', size: { w: 38, h: 34 }, glyph: '📶' },
  camera:{ label: 'Camera / Video',      cat: 'device', size: { w: 38, h: 34 }, glyph: '📷' },
  celltower: { label: 'Cell Tower (gNB/eNB)', cat: 'device', size: { w: 56, h: 108 }, glyph: '🗼' },
  tmc:   { label: 'TMC / Cloud',         cat: 'device', size: { w: 84, h: 58 }, glyph: '☁️' },
  roadH: { label: 'Road — Horizontal',   cat: 'road',   size: { w: 340, h: 108 }, glyph: '↔' },
  roadV: { label: 'Road — Vertical',     cat: 'road',   size: { w: 108, h: 340 }, glyph: '↕' },
  mast:  { label: 'Pole + Mast Arm',     cat: 'road',   size: { w: 250, h: 210 }, glyph: '🏗️' },
  intersection: { label: '4-Way Intersection', cat: 'template', glyph: '🚦' },
};
// Roadside detection sensors — they see the road (incl. UNEQUIPPED users with no
// OBU/phone) and feed the infrastructure, which then speaks V2X on their behalf.
const isSensor = (t) => t === 'lidar' || t === 'radar' || t === 'camera';
// V2N network infrastructure: the cellular tower + the TMC/cloud backend.
const isNetwork = (t) => t === 'celltower' || t === 'tmc';

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
      can: ['Broadcast BSM (position/speed/heading/brake)', 'Receive & verify SPaT/MAP', 'Feed driver-warning apps (FCW, RLVW, EEBL)'],
      cannot: ['Control the vehicle — it feeds the ADAS, which decides', 'Be granted signal priority — a passenger car is not an authorized SRM role'] },
    { id: 'autotalks-craton2', vendor: 'Autotalks', name: 'CRATON2', gen: 'Modern',
      tagline: 'Automotive-grade V2X chipset for OEM integration.',
      specs: { Radios: 'C-V2X + DSRC (dual)', Security: 'Hardware secure element', 'BSM rate': '10 Hz', Receives: 'SPaT, MAP, BSM, PSM', GNSS: 'High-precision' },
      can: ['Hardware-accelerated 1609.2 verification', 'Simultaneous DSRC + C-V2X', 'Feed ADAS safety apps (FCW, RLVW)'],
      cannot: ['See non-equipped road users without a sensor/PSM source'] },
    { id: 'generic-adas', vendor: 'Generic', name: 'ADAS Vehicle', gen: 'Modern',
      tagline: 'A connected passenger vehicle: OBU radio + ADAS decision brain.',
      specs: { Radios: 'C-V2X', Security: 'IEEE 1609.2', Role: 'basicVehicle', 'BSM rate': '10 Hz', Receives: 'SPaT, MAP, TIM' },
      can: ['Compute time-to-stop-bar for RLVW', 'React to SPaT (GLOSA speed advisory)', 'Announce itself via BSM (acts as a detector)'],
      cannot: ['Trust unsigned messages (dropped per 1609.2)', 'Get signal priority/preemption — no authorized SRM role'] },
  ],
  ev: [
    { id: 'ev-generic', vendor: 'Generic', name: 'Emergency Vehicle', gen: 'Modern',
      tagline: 'Fire / ambulance / police OBU authorized for signal PREEMPTION.',
      specs: { Role: 'emergency (fire/EMS/police)', Priority: 'Preemption — interrupts the cycle', Radios: 'C-V2X', Security: 'SCMS role certificate', 'BSM rate': '10 Hz' },
      can: ['Send an SRM the controller GRANTS as preemption', 'Get an immediate authorized green', 'Broadcast BSM like any vehicle'],
      cannot: ['Be impersonated by ordinary cars — the role is in the signed 1609.2 certificate'] },
  ],
  bus: [
    { id: 'bus-transit', vendor: 'Generic', name: 'Transit Bus', gen: 'Modern',
      tagline: 'Transit OBU authorized for signal PRIORITY (softer than preemption).',
      specs: { Role: 'publicTransport', Priority: 'Priority — extend green / trim red', Radios: 'C-V2X', Security: 'SCMS role certificate', 'BSM rate': '10 Hz' },
      can: ['Send an SRM granted as priority when behind schedule (TSP)', 'Broadcast BSM like any vehicle'],
      cannot: ['Preempt / interrupt the cycle the way an emergency vehicle can'] },
  ],
  hub: [
    { id: 'usdot-v2xhub', vendor: 'USDOT (FHWA)', name: 'V2X Hub', gen: 'Open-source',
      tagline: 'Open-source roadside software platform that runs plugins to fuse sensors, the controller and the RSU.',
      specs: { Platform: 'Linux edge server', Role: 'Message broker + plugins', Inputs: 'NTCIP 1202, sensor detections', Outputs: 'SAE J2735 to the RSU', Security: 'IEEE 1609.2 (via RSU/plugin)' },
      can: ['Fuse LiDAR / radar / camera detections into V2X messages', 'Bridge the controller (NTCIP 1202) to SAE J2735', 'Generate PSM/BSM for detected, UNEQUIPPED road users', 'Host application plugins (PedSafety, SPaT, MAP…)'],
      cannot: ['Transmit over the air itself — it hands frames to the RSU radio', 'Physically control the signal (that is the TC)'] },
    { id: 'generic-edge', vendor: 'Generic', name: 'Edge Compute Node', gen: 'Modern',
      tagline: 'A roadside industrial PC hosting a V2X-Hub-style processing stack.',
      specs: { Platform: 'Rugged x86 / ARM', Role: 'Sensor fusion + messaging', Inputs: 'Ethernet, camera, LiDAR, radar', Outputs: 'J2735 to RSU', GPU: 'Optional (AI detection)' },
      can: ['Run AI perception on camera/LiDAR feeds', 'Aggregate multiple sensors into one scene', 'Feed the RSU a fused, signed message set'],
      cannot: ['Replace the RSU radio or the controller'] },
  ],
  lidar: [
    { id: 'ouster-os', vendor: 'Ouster', name: 'OSx digital LiDAR', gen: 'Modern',
      tagline: 'Roadside 3-D LiDAR — precise position/shape of every road user, day or night.',
      specs: { Type: 'Spinning digital LiDAR', Range: '~100–200 m', Output: '3-D point cloud', Detects: 'Pedestrians, cyclists, vehicles', Lighting: 'Works in total darkness' },
      can: ['Detect UNEQUIPPED VRUs (no phone/OBU needed)', 'Give centimetre position & classification', 'Feed the V2X Hub to generate a PSM/BSM'],
      cannot: ['Read license plates or colour (that’s a camera)', 'Talk V2X itself — it feeds the hub/RSU'] },
    { id: 'hesai-at', vendor: 'Hesai', name: 'AT-series LiDAR', gen: 'Modern',
      tagline: 'Long-range automotive/ITS LiDAR used for intersection perception.',
      specs: { Type: 'Semi-solid-state', Range: '~200 m', Output: '3-D point cloud + velocity', Detects: 'All road users', Lighting: 'Independent of light' },
      can: ['Track object trajectories through the intersection', 'Provide occlusion-resistant detection', 'Feed fusion for a full intersection scene'],
      cannot: ['See through solid buildings', 'Broadcast messages on its own'] },
  ],
  radar: [
    { id: 'smartmicro-traffic', vendor: 'Smartmicro', name: 'Traffic Radar', gen: 'Modern',
      tagline: 'Roadside traffic radar — speed & range of approaching vehicles in any weather.',
      specs: { Type: 'mmWave Doppler radar', Range: '~250 m', Measures: 'Speed, range, lane', Detects: 'Vehicles (some VRUs)', Weather: 'Fog / rain / snow OK' },
      can: ['Replace inductive loops for actuated detection', 'Measure approach speed for dilemma-zone protection', 'Work where cameras are blinded (fog, glare, night)'],
      cannot: ['Classify finely or read a scene like a camera', 'Send V2X — it feeds the controller/hub'] },
    { id: 'wavetronix-matrix', vendor: 'Wavetronix', name: 'SmartSensor Matrix', gen: 'Modern',
      tagline: 'Radar detection array used for stop-bar and advance vehicle detection.',
      specs: { Type: 'FMCW radar', Coverage: 'Multi-lane', Measures: 'Presence, count, speed', Detects: 'Vehicles', Weather: 'All-weather' },
      can: ['Stop-bar + advance detection without loops', 'Provide actuation calls to the controller'],
      cannot: ['Detect small VRUs reliably', 'Produce imagery'] },
  ],
  camera: [
    { id: 'flir-trafisense', vendor: 'Teledyne FLIR', name: 'TrafiSense AI', gen: 'Modern',
      tagline: 'AI video/thermal detection camera — classifies and counts road users.',
      specs: { Type: 'Video + thermal + AI', Detects: 'Vehicles, peds, cyclists', Output: 'Detections / classifications', Extras: 'Red-light & wrong-way events', Lighting: 'Thermal works at night' },
      can: ['Classify road users and read the scene', 'Detect red-light-running & wrong-way events', 'Feed detections to the controller / V2X Hub'],
      cannot: ['Give exact 3-D position like LiDAR', 'See well in heavy fog / glare (thermal helps)'] },
    { id: 'miovision-camera', vendor: 'Miovision', name: 'Smart Camera', gen: 'Modern',
      tagline: 'Intersection camera with onboard analytics for detection and counts.',
      specs: { Type: 'Video + edge AI', Detects: 'Multimodal road users', Output: 'Actuation + analytics', Comms: 'Ethernet to cabinet' },
      can: ['Actuated detection + turning-movement counts', 'Feed a V2X Hub for pedestrian safety apps'],
      cannot: ['Operate blind (needs a usable image)'] },
  ],
  celltower: [
    { id: 'gnb-5g', vendor: 'Generic', name: '5G Base Station (gNodeB)', gen: 'Modern',
      tagline: 'A cellular base station — the on-ramp from the vehicle to the mobile network.',
      specs: { Interface: 'Uu (network air link)', Radio: '4G LTE / 5G NR · C-V2X Uu', Backhaul: 'Fiber / IP to the core', Coverage: 'Kilometres (wide area)', Latency: 'Higher than direct 5.9 GHz' },
      can: ['Carry V2N traffic between vehicles and the cloud/TMC', 'Reach far beyond line-of-sight (wide-area)', 'Deliver TIM advisories pushed by the TMC'],
      cannot: ['Replace direct V2V/V2I 5.9 GHz for split-second safety', 'Work if there is no cellular coverage / the network is congested'] },
    { id: 'enb-lte', vendor: 'Generic', name: 'LTE eNodeB', gen: 'Modern',
      tagline: '4G LTE base station used for cellular V2N connectivity.',
      specs: { Interface: 'Uu (network air link)', Radio: '4G LTE', Backhaul: 'Fiber / microwave', Coverage: 'Wide area', Role: 'Vehicle ↔ mobile core' },
      can: ['Backhaul probe data (BSM/telematics) to the cloud', 'Relay network-sourced advisories to vehicles'],
      cannot: ['Guarantee low latency under load'] },
  ],
  tmc: [
    { id: 'tmc-atms', vendor: 'Generic', name: 'Traffic Management Center', gen: 'Cloud',
      tagline: 'The agency backend (ATMS/cloud) that aggregates data and pushes advisories.',
      specs: { Role: 'Aggregate + advise', Inputs: 'Probe data, sensors, CAD/511 feeds', Outputs: 'TIM (work-zone/weather/incident)', Reach: 'Region-wide', Path: 'Internet ↔ cell tower ↔ vehicle' },
      can: ['Fuse data from many vehicles & sources region-wide', 'Publish TIM advisories over the cellular network', 'Feed RSUs and hubs over the backhaul network'],
      cannot: ['Talk to a vehicle without a network path (cell tower / RSU)', 'React in milliseconds — it is wide-area, not split-second'] },
    { id: 'cloud-v2x', vendor: 'Generic', name: 'Cloud V2X Platform', gen: 'Cloud',
      tagline: 'A cloud service that ingests connected-vehicle data and serves advisories.',
      specs: { Role: 'Ingest + serve', Inputs: 'C-V2X Uu, telematics APIs', Outputs: 'TIM / advisories', Hosting: 'Cloud / data center' },
      can: ['Scale to many vehicles & jurisdictions', 'Host analytics on aggregated probe data'],
      cannot: ['Provide local, low-latency safety alerts on its own'] },
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

// Vehicle-type roles: car (obu), emergency (ev), transit bus (bus).
const isVehicle = (t) => t === 'obu' || t === 'ev' || t === 'bus';
const isMobile = (t) => isVehicle(t) || t === 'ped';           // can be given a travel direction
const canRequestPriority = (t) => t === 'ev' || t === 'bus';   // authorized to send a granted SRM

// Which two device types form which link when wired together.
function connKind(a, b) {
  const s = new Set([a, b]);
  if (isSensor(a) || isSensor(b)) {
    const other = isSensor(a) ? b : a;
    // a sensor wired to a road user = it is DETECTING that specific target;
    // a sensor wired to infrastructure = it is feeding it raw data.
    return (isVehicle(other) || other === 'ped') ? 'detect' : 'sensor';
  }
  // V2N — the cellular / cloud path
  if (s.has('celltower') && (isVehicle(a) || isVehicle(b))) return 'cellular';  // Uu air interface (vehicle ↔ tower)
  if (isNetwork(a) || isNetwork(b)) return 'backhaul';            // tower ↔ TMC/cloud, TMC ↔ RSU/hub (fiber/IP)
  if (s.has('tc') && s.has('rsu')) return 'ethernet';
  if (s.has('hub') && (s.has('tc') || s.has('rsu'))) return 'ethernet';  // V2X Hub backhaul
  if (s.has('ped')) return 'v2p';
  if (isVehicle(a) && isVehicle(b)) return 'v2v';
  if (s.has('rsu') && (isVehicle(a) || isVehicle(b))) return 'wireless';
  if (s.has('tc') && s.has('signal')) return 'signal';
  return 'generic';
}
const CONN_STYLE = {
  ethernet: { color: '#f472b6', dash: '0', label: 'Ethernet · NTCIP 1202' },
  wireless: { color: '#a78bfa', dash: '3 7', label: 'C-V2X · SAE J2735' },
  v2v:      { color: '#34d399', dash: '3 7', label: 'V2V · BSM' },
  v2p:      { color: '#fbbf24', dash: '3 7', label: 'V2P · PSM' },
  signal:   { color: '#64748b', dash: '0', label: 'Signal control' },
  sensor:   { color: '#38bdf8', dash: '2 5', label: 'Sensor · data feed' },
  detect:   { color: '#7dd3fc', dash: '1 5', label: 'Sensor · detecting target' },
  cellular: { color: '#fb923c', dash: '3 7', label: 'Cellular Uu · C-V2X/5G' },
  backhaul: { color: '#94a3b8', dash: '0', label: 'Network backhaul · fiber/IP' },
  generic:  { color: '#64748b', dash: '4 6', label: 'link' },
};

// SAE J2735 messages the user can fine-tune, and their packet colors.
const ALL_MSGS = ['SPaT', 'MAP', 'TIM', 'SSM', 'BSM', 'SRM', 'PSM', 'SDSM'];
// Every message gets its own hue (validated for colorblind separation on the
// dark surface; the labeled toggle chips are the key). Anchors kept from the old
// grouping — SPaT cyan, BSM green, SRM amber, TIM violet — the former duplicates
// (MAP, SSM, PSM, SDSM) now have distinct hues. Sensor feeds are a cool family.
const MSG_COLOR = {
  SPaT: '#22d3ee', MAP: '#3b82f6', BSM: '#34d399', SSM: '#a3e635',
  SRM: '#fbbf24', PSM: '#f472b6', TIM: '#a78bfa', SDSM: '#fb923c',
  'point cloud': '#38bdf8', tracks: '#2dd4bf', video: '#818cf8', objects: '#7dd3fc',
  detection: '#7dd3fc', data: '#64748b',
};

// Orient a wired link so packets flow upstream (sensors/TC/hub) → RSU → downstream (OBU/VRU).
function orientLink(a, b) {
  const rank = (t) => (isSensor(t) ? 0 : t === 'tc' ? 1 : t === 'hub' ? 2 : t === 'rsu' ? 3 : 4);
  return rank(a.type) <= rank(b.type) ? [a, b] : [b, a];
}

// Packet streams for one link, honoring the direction mode and enabled messages.
// dir: 'fwd' = infrastructure→vehicle · 'rev' = vehicle→infrastructure · 'both'.
// Returns [{ from:{x,y}, to:{x,y}, label, color }].
// `ctx` describes what the world provides, so only messages that make sense are
// generated: { signal, sensor, priority, network }. SPaT/MAP/SSM need a signal
// controller; SDSM needs a sensor feed; SRM/SSM need an authorized (EV/bus)
// requester; TIM needs a network (TMC/cell) source. Defaults to a full
// signalized intersection so callers that don't pass ctx keep old behavior.
function linkStreams(a, b, dir, enabled, mapStore, ctx) {
  const c = ctx || { signal: true, sensor: false, priority: true, network: true };
  const on = (m) => enabled[m] !== false;
  const showDown = dir === 'fwd' || dir === 'both';
  const showUp = dir === 'rev' || dir === 'both';
  const out = [];
  const push = (from, to, m, d) => { if (on(m)) out.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, label: m, color: MSG_COLOR[m], dir: d }); };
  const kind = connKind(a.type, b.type);

  if (kind === 'detect') {                        // a sensor observing a specific road user
    // NOT a message on a wire — the vehicle transmits nothing. The sensor senses
    // the target with its own tech (radar/LiDAR emit-and-listen, camera sees).
    // Rendered as a scanning lock-on reticle on the target, not a packet.
    return out;   // no stream
  }
  if (kind === 'sensor') {                        // LiDAR/radar/camera → infrastructure
    const [sen, infra] = isSensor(a.type) ? [a, b] : [b, a];
    // each sensor streams its own kind of raw data (proprietary, not OTA J2735);
    // the Hub/TC fuses these and generates an SDSM for the RSU to broadcast.
    const feed = sen.type === 'lidar' ? 'point cloud' : sen.type === 'radar' ? 'tracks' : 'video';
    if (showUp) out.push({ from: { x: sen.x, y: sen.y }, to: { x: infra.x, y: infra.y }, label: feed, color: MSG_COLOR[feed], dir: 'up' });
    return out;
  }
  if (kind === 'cellular') {                       // V2N Uu air interface: vehicle ↔ cell tower
    const veh = isVehicle(a.type) ? a : b, tower = isVehicle(a.type) ? b : a;
    if (showDown) push(tower, veh, 'TIM', 'down');   // network pushes advisories down
    if (showUp) push(veh, tower, 'BSM', 'up');       // vehicle sends probe/telematics up
    return out;
  }
  if (kind === 'backhaul') {                        // V2N wired/fiber: TMC ↔ tower ↔ RSU/hub
    const rank = (t) => (t === 'tmc' ? 0 : t === 'celltower' ? 1 : 2);   // TMC/cloud is most upstream
    const [s, d] = rank(a.type) <= rank(b.type) ? [a, b] : [b, a];
    if (showDown) push(s, d, 'TIM', 'down');         // advisories flow out toward the edge
    if (showUp) push(d, s, 'BSM', 'up');             // aggregated probe data flows back to the cloud
    return out;
  }
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
  // ethernet / wireless — real bidirectional V2I traffic, but only the messages
  // the world can actually justify (see ctx). SPaT/MAP/SSM require a signal;
  // SDSM requires a sensor feed; TIM requires a network source.
  const wireless = kind === 'wireless';
  const [s, d] = orientLink(a, b);
  const down = [];
  if (c.signal) down.push('SPaT');   // live phase — needs the controller (immediate-forward from the TC)
  // MAP (intersection geometry) is STATIC. The RSU broadcasts it over the air
  // whenever it can source it: stored locally (mapStore 'rsu') it store-and-
  // repeats with no TC at all; stored on the TC it needs the TC present. On the
  // cabinet wire MAP only rides when it's stored on (and streamed from) the TC.
  const mapOta = mapStore === 'rsu' || c.signal;
  if (wireless ? mapOta : (mapStore === 'tc' && c.signal)) down.push('MAP');
  // SDSM is produced by the fusion node — the V2X Hub over the wire, or the RSU
  // over the air — NOT the TC, which only does signal control.
  if (c.sensor && (wireless || s.type === 'hub')) down.push('SDSM');
  if (c.network) down.push('TIM');                 // network-sourced advisories
  if (c.signal && c.priority) down.push('SSM');     // signal-status reply (only if priority can be requested)
  // Upstream: every vehicle sends BSM. An SRM only exists when there's a signal
  // to request priority from AND an authorized (EV/bus) requester.
  const veh = d;   // downstream endpoint = the vehicle on a wireless link
  const up = ['BSM'];
  if (c.signal && c.priority && (!wireless || canRequestPriority(veh.type))) up.push('SRM');
  if (showDown) down.forEach((m) => push(s, d, m, 'down'));
  if (showUp) up.forEach((m) => push(d, s, m, 'up'));
  return out;
}

// Representative message sizes/rates — used for the backhaul bandwidth meter.
const MSG_SPEC = { SPaT: { bytes: 100, hz: 10 }, MAP: { bytes: 1000, hz: 1 }, TIM: { bytes: 300, hz: 1 }, SSM: { bytes: 60, hz: 2 }, BSM: { bytes: 300, hz: 10 }, SRM: { bytes: 80, hz: 2 }, PSM: { bytes: 200, hz: 5 }, SDSM: { bytes: 900, hz: 10 } };
// Approx. downstream load the TC pushes onto the cabinet wire (kbps). MAP only
// rides the wire when it is stored on the TC — that's the tradeoff, quantified.
function backhaulKbps(enabled, mapStore) {
  const msgs = ['SPaT', 'SSM'].concat(mapStore === 'tc' ? ['MAP'] : []);
  let bps = 0;
  msgs.forEach((m) => { if (enabled[m] !== false) { const s = MSG_SPEC[m]; bps += s.bytes * s.hz * 8; } });
  return Math.round(bps / 1000);
}

// Cross-links from the sim to the Glossary.
const MSG_GLOSSARY = { SPaT: 'SPaT (Signal Phase and Timing)', MAP: 'MAP (Intersection Geometry)', BSM: 'BSM (Basic Safety Message)', PSM: 'PSM (Personal Safety Message)', SRM: 'SRM / SSM', SSM: 'SRM / SSM', TIM: 'TIM (Traveler Information Message)', SDSM: 'SDSM (Sensor Data Sharing Message)' };
const DEVICE_GLOSSARY = { tc: 'Traffic Controller (TC)', rsu: 'Roadside Unit (RSU)', obu: 'On-Board Unit (OBU)', ev: 'On-Board Unit (OBU)', bus: 'On-Board Unit (OBU)', ped: 'VRU (Vulnerable Road User)' };
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
    SRM: { messageId: 'SRM', requestor: ctx.vehType === 'bus' ? 'publicTransport (transit)' : 'emergency (fire/EMS/police)', requestType: ctx.vehType === 'bus' ? 'priority (extend green)' : 'preemption (immediate green)', requestedSignalGroup: 4, eta_s: 6.5 },
    SSM: { messageId: 'SSM', requestId: 41, status: 'granted', signalGroup: 4 },
    TIM: { messageId: 'TIM', advisory: 'reduced speed / work zone', advisorySpeed_kph: 45, appliesTo: 'lane 2, next 300 m' },
    SDSM: { messageId: 'SDSM', standard: 'SAE J3224', source: 'RSU / V2X Hub', objectCount: 3, objects: [{ id: 17, type: 'pedestrian', lat: 42.30902, lon: -83.06972, speed_mps: 1.3 }, { id: 21, type: 'vehicle', speed_mps: 12.8, heading_deg: 271 }], note: 'shares infrastructure-detected objects with vehicles' },
    'point cloud': { messageId: 'LiDAR point cloud', kind: 'proprietary sensor feed (not OTA)', sensor: 'LiDAR', stage: 'RAW sensor output', pointsPerScan: '~131,072', scanRate_hz: 10, perPoint: { x_m: 2.41, y_m: -8.13, z_m: 0.92, intensity: 0.37 }, rangeAccuracy_cm: '±2', velocity: 'inferred across frames (LiDAR has no Doppler)', semantics: 'none — pure geometry until a perception layer classifies it' },
    tracks: { messageId: 'radar tracks', kind: 'proprietary sensor feed (not OTA)', sensor: 'radar (mmWave)', stage: 'PROCESSED object layer (built on the radar point cloud)', tracker: 'GTRACK / Kalman clusterer', trackList: [{ id: 3, range_m: 82, speed_mps: 25.6, azimuth_deg: -4, class: 'vehicle' }, { id: 5, range_m: 140, speed_mps: 13.1, azimuth_deg: 2, class: 'vehicle' }], velocity: 'measured DIRECTLY from Doppler', weather: 'all-weather' },
    video: { messageId: 'camera video / detections', kind: 'proprietary sensor feed (not OTA)', sensor: 'AI video / thermal', capture: 'frames (images) @ 30 fps', frame: '1920×1080', encoding: 'H.264/H.265 when streamed', perFrameAI: { boxes: [{ class: 'pedestrian', conf: 0.94 }, { class: 'vehicle', conf: 0.98 }], events: ['red-light-running'] }, transmitted: 'detection metadata per frame (raw video → TMC for humans, not the safety msg)' },
    objects: { messageId: 'detected objects', kind: 'proprietary sensor feed (not OTA)', from: 'LiDAR / radar / camera', list: [{ id: 17, class: 'pedestrian', x_m: 2.4, y_m: -8.1, v_mps: 1.3 }, { id: 21, class: 'vehicle', v_mps: 12.8 }], note: 'fused by the V2X Hub → broadcast as an SDSM' },
    detection: { messageId: 'sensor detection (single object)', kind: 'what the sensor computed about THIS road user', acquisition: 'the sensor senses it with its OWN tech (radar/LiDAR emit-and-listen, or a camera’s pixels) — the vehicle transmits nothing', object: { class: 'vehicle', x_m: 3.1, y_m: -12.4, speed_mps: 12.8, heading_deg: 271, confidence: 0.97 }, note: 'equipped or not, the sensor sees it; wire the sensor to a Hub and this becomes one object in the fused SDSM' },
    phase: { control: 'NTCIP 1202 phase/timing (not a J2735 radio message)', phase: 2, state: 'GREEN', greenTime_s: 12 },
    data: { note: 'generic link payload' },
  }[msg] || { messageId: msg };
  const rawFeed = msg === 'phase' || msg === 'data' || msg === 'objects' || msg === 'point cloud' || msg === 'tracks' || msg === 'video' || msg === 'detection';
  return rawFeed ? base : { ...base, security: sec };
}

// Plain-language explainer for a raw sensor feed, shown in the packet inspector.
// `stages` walks the full pipeline (true raw → … → the transmitted layer);
// `where` says which chip/computer does the raw→processed step; `setups`
// contrasts the typical on-sensor edge build with the newer centralized one.
const SENSOR_FEED_INFO = {
  'point cloud': {
    what: 'A LiDAR maps geometry by timing laser pulses. Its native output is a dense 3-D point cloud — each point an (x, y, z) position with intensity. Exact shape, but no identity until something classifies it.',
    stages: [
      ['1 · Returns → digitized (raw)', 'Each fired pulse’s reflected photons are detected and time-stamped; the true raw output is the digitized time-of-flight returns (some sensors expose an even rawer per-detector waveform/histogram).'],
      ['2 · Point cloud', 'The returns are assembled into the 3-D (x, y, z + intensity) cloud — hundreds of thousands of points per scan, cm-accurate, works in the dark. Still pure geometry, no labels.'],
      ['3 · Perception → objects', 'Clustering + classification + frame-to-frame tracking turn the cloud into an object list (class, position, size, velocity).'],
    ],
    where: 'The point cloud itself is computed ON the sensor. PERCEPTION (clustering/classification) is compute-heavy and has traditionally run on a SEPARATE edge computer — a domain controller or the V2X Hub. Newer “smart LiDAR” embeds a perception SoC to output the object list directly.',
    setups: [
      ['Typical · sensor + edge computer', 'The LiDAR streams its point cloud to an external edge box (or the V2X Hub), which runs perception.'],
      ['Newer · smart LiDAR', 'An on-board perception SoC classifies inside the device and outputs objects; some high-end rigs instead stream the raw cloud to central compute for low-level fusion.'],
    ],
    transmitted: 'What crosses THIS link depends on the sensor: a dumb LiDAR streams the raw point cloud to the Hub — fine over a short wired link, even at 100s of Mbps — and the Hub runs perception (this is the case the “point cloud” packet shows); a smart LiDAR forwards just the object list. Either way the raw cloud is never broadcast over the air — the Hub fuses objects into an SDSM for that.',
    nuanceLabel: 'Velocity',
    nuance: 'LiDAR has no Doppler, so speed is inferred by following an object across frames — unlike radar, which measures it directly.',
  },
  tracks: {
    what: 'A radar’s highest-level output: discrete tracked objects (ID, position, velocity, heading, size). Tracks are NOT the raw radar data — the raw data sits two stages below them.',
    stages: [
      ['1 · Echo → ADC (true raw)', 'The received echo is mixed to a beat signal and digitized by an Analog-to-Digital Converter into raw samples — the “radar data cube”. This is the true RAW radar data: an unprocessed digitized echo, high-bandwidth and unusable as-is.'],
      ['2 · Point cloud (semi-processed)', 'DSP runs range + Doppler + angle FFTs, then CFAR detection, to extract reflections: range, azimuth (elevation on 4-D radar), radial velocity (Doppler) and SNR. Already processed — this is NOT the raw echo.'],
      ['3 · Tracks', 'A tracker (e.g. TI’s GTRACK, or a Kalman clusterer) groups the point cloud into localized objects and follows each over time → ID, position, velocity, direction, dimensions.'],
    ],
    where: 'Most ITS/automotive radars are a “radar-on-chip” SoC (e.g. TI AWR/IWR, NXP): RF front-end, ADC, DSP and an MCU are integrated, so the FFT/CFAR (point cloud) and even the tracker run INSIDE the sensor. It outputs a point cloud or tracks over a low-bandwidth link (CAN/Ethernet).',
    setups: [
      ['Typical · edge on-chip', 'The chip in the sensor does everything and emits tracks (or a point cloud). Low bandwidth out, self-contained.'],
      ['Newer · centralized raw fusion', 'High-res / 4-D imaging radar & software-defined vehicles make the sensor a “satellite” that streams RAW ADC over automotive Ethernet to a central compute unit doing low-level (raw-data) fusion — more accurate/flexible, but needs big bandwidth + a central processor.'],
    ],
    transmitted: 'Configurable — the on-chip radar can emit the raw point cloud, the processed tracks, or both. For infrastructure detection it forwards the tracks (the case the “tracks” packet shows), which the V2X Hub fuses into an SDSM; a raw-fusion build would instead stream the ADC cube to central compute.',
    nuanceLabel: 'Velocity',
    nuance: 'Radar measures radial velocity DIRECTLY from the Doppler shift — its signature strength, ideal for speed / dilemma-zone detection in any weather.',
  },
  video: {
    what: 'A camera captures FRAMES — individual images — at a frame rate (e.g. 30 fps). “Video” is just that sequence of frames, usually H.264/H.265-compressed when it’s streamed.',
    stages: [
      ['1 · Sensor readout (raw)', 'The CMOS imager’s raw (Bayer) readout is turned by an ISP into a viewable frame. The true raw is that uncompressed sensor readout.'],
      ['2 · Frames / video', 'A sequence of 2-D images (e.g. 1920×1080), compressed to H.264/H.265 when transmitted. Rich colour/appearance/text — but no native depth.'],
      ['3 · Detection (edge AI)', 'Per-frame inference → bounding boxes → classified, tracked objects, plus events (red-light-running, wrong-way).'],
    ],
    where: 'Traditional cameras are “dumb” — they stream video/frames to a SEPARATE processor (an edge box or the V2X Hub) that runs the CV/AI. Newer “AI cameras” embed an NPU/AI SoC INSIDE the camera that runs inference and outputs detection metadata directly.',
    setups: [
      ['Typical · camera + edge computer', 'The camera streams frames/video; an external processor detects and classifies.'],
      ['Newer · smart / AI camera', 'An on-board NPU does the detection in the device; only metadata leaves it (raw video may still go to a TMC for humans).'],
    ],
    transmitted: 'What crosses THIS link depends on the camera: a traditional camera streams frames/video to the Hub — the edge computer that runs the AI (this is the case the “video” packet shows); a smart AI-camera runs inference on-board and forwards only detection metadata. Raw/compressed video, if kept, goes to a TMC for operators. The Hub fuses the detections into an SDSM.',
    nuanceLabel: 'Depth',
    nuance: 'A single camera has no true depth; distance is estimated from scene geometry (or a stereo/second camera). LiDAR and radar give the metric position.',
  },
};

// Explanations shown in the connection detail panel.
const CONN_DESC = {
  ethernet: 'Wired in-cabinet backhaul (IEEE 802.3). Carries NTCIP 1202 phase/timing, and — if MAP is stored on the TC — the SAE J2735 SPaT/MAP down to the RSU.',
  wireless: 'The over-the-air C-V2X / DSRC link. SPaT / MAP / TIM are broadcast to vehicles; BSM / SRM come back from them.',
  v2v: 'Direct vehicle-to-vehicle exchange of BSMs (position, speed, heading, braking) — works with no infrastructure at all.',
  v2p: 'Vehicle-to-pedestrian. The VRU device broadcasts a PSM; in return an RSU can send pedestrian crossing timing (SPaT) and vehicles their BSM, so the phone can warn the pedestrian.',
  sensor: 'A roadside detection sensor (LiDAR / radar / camera) feeding the infrastructure. It sees the road directly — including UNEQUIPPED users with no OBU or phone — and hands detections to the V2X Hub / controller, which can then generate a V2X message (e.g. a PSM for a detected pedestrian) for the RSU to broadcast.',
  detect: 'This sensor is DETECTING this road user with its OWN technology (radar/LiDAR emit a signal and listen for the return; a camera just sees pixels). Nothing is transmitted by the vehicle — it can be completely un-equipped. The sensor computes the target’s position, speed and class on its own. On its own it just senses (shown as a scanning lock-on); wire the sensor onward to a V2X Hub / controller and this detection becomes one object in the fused scene the Hub broadcasts as an SDSM to OTHER vehicles.',
  cellular: 'V2N over the cellular network (the “Uu” air interface). The vehicle’s cellular modem talks to a cell tower (4G eNodeB / 5G gNodeB) — not the 5.9 GHz safety radio. The vehicle sends probe data up; the network pushes advisories (TIM) down. Wide-area reach, but higher latency than direct V2V/V2I, so it’s used for information, not split-second safety.',
  backhaul: 'The wired/fiber network path behind the air interface: cell tower ↔ mobile core ↔ internet ↔ the Traffic Management Center (TMC) / cloud (and the TMC can also reach RSUs and hubs this way). This is how vehicle data reaches the cloud and how region-wide advisories get published back out.',
  signal: 'Not a direct wire. The controller sends low-voltage logic to a LOAD SWITCH (a solid-state relay) in the cabinet — watched by the conflict monitor (MMU) — which switches field power out through the cabinet terminals, into underground conduit, up the pole/mast arm, to the signal head’s LED modules. It is NOT a radio link, but this indicated state is exactly what the SPaT message reports over the air.',
  generic: 'A generic link between two devices.',
};

// For links whose real path isn't a simple A↔B (shown as a chain in the panel).
const CONN_PIPELINE = {
  signal: ['Traffic Controller', 'Load Switch', 'Conduit ↑ pole', 'Signal Head'],
};

// MAP storage tradeoffs, surfaced in the Simulation panel.
const MAP_INFO = {
  rsu: { title: 'MAP on the RSU (local)',
         mode: 'Store-and-repeat',
         modeDesc: 'The RSU holds the static geometry and re-broadcasts it on a timer (~1 Hz) all on its own — no TC needed, so it keeps going even if the cabinet link drops. It never rides the backhaul wire.',
         benefit: 'Low backhaul load & latency; broadcasts with or without a TC. Standard for static geometry.',
         draw: 'Provisioned per-RSU — changing lane geometry means re-flashing every unit (config-drift risk).' },
  tc:  { title: 'MAP on the TC (central)',
         mode: 'Immediate-forward',
         modeDesc: 'The TC streams MAP down the cabinet wire and the RSU forwards it out over the air — one source of truth, but MAP now rides the backhaul constantly and needs a healthy TC link.',
         benefit: 'Single source of truth — edit geometry once at the controller and it propagates to the RSU.',
         draw: 'Adds constant MAP traffic on the wire; needs a healthy TC link and a J2735-capable ATC.' },
};
// The two RSU broadcast modes — the concept underneath the MAP-storage choice.
const RSU_MODE_NOTE = 'RSUs broadcast in two modes. STORE-AND-REPEAT: the RSU is loaded with a static message (MAP geometry, a TIM) and repeats it locally on a timer — no upstream feed needed. IMMEDIATE-FORWARD: a live stream from the TC (SPaT, which changes every second) is passed straight through and re-broadcast as it arrives. So SPaT is always immediate-forward (it needs the live controller); MAP can be either — store-and-repeat on the RSU, or immediate-forward from the TC.';

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
const RANGE = 150;          // RSU wireless range (matches the drawn range circle)
const SIM_LOOP = 20;        // seconds — the scrub timeline spans one loop
const DRIVE_V = 95;         // px/sec base vehicle speed
const DRIVE_DIR = { e: { dx: 1, dy: 0 }, w: { dx: -1, dy: 0 }, n: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 } };
const DRIVE_ARROW = { e: '→', w: '←', n: '↑', s: '↓' };
const DRIVE_ROT = { n: 0, e: 90, s: 180, w: 270 };   // vehicle art points north by default
// Deterministic live position of an object at sim-time t (seconds). Mobile objects
// (vehicles / pedestrians) advance along their direction and wrap around the canvas;
// everything else is static. Being a pure function of t makes scrubbing consistent.
function liveXY(o, t) {
  if (!o.drive || !DRIVE_DIR[o.drive]) return { x: o.x, y: o.y };
  const d = DRIVE_DIR[o.drive], V = o.type === 'ped' ? 38 : DRIVE_V, W = WB.w - 40, H = WB.h - 40;
  const wrap = (v, lo, span) => ((v - lo) % span + span) % span + lo;
  return { x: wrap(o.x + d.dx * V * t, 20, W), y: wrap(o.y + d.dy * V * t, 20, H) };
}
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
function DeviceArt({ type, model, sig, rot, flip }) {
  const label = model ? `${model.vendor} ${model.name}` : TYPES[type].label;
  const spin = (body) => <g transform={`rotate(${rot || 0})`}>{body}</g>;   // rotate the body, keep the label upright
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
          {spin(<g>
            <rect x="-26" y="-44" width="52" height="88" rx="15" className="fill-blue-700 stroke-blue-300" strokeWidth="2" />
            <rect x="-19" y="-32" width="38" height="22" rx="6" className="fill-blue-200/80" />
            <rect x="-19" y="12" width="38" height="16" rx="5" className="fill-blue-400/70" />
            <rect x="-2" y="-42" width="4" height="8" rx="2" className="fill-neon-cyan" />{/* nose marker */}
          </g>)}
          <rect x="-21" y="-6" width="19" height="12" rx="3" className="fill-emerald-500/25 stroke-neon-green" />
          <text x="-11" y="3" textAnchor="middle" className="fill-neon-green text-[8px] font-bold">OBU</text>
          <rect x="2" y="-6" width="19" height="12" rx="3" className="fill-cyan-500/20 stroke-neon-cyan" />
          <text x="12" y="3" textAnchor="middle" className="fill-neon-cyan text-[7px] font-bold">ADAS</text>
          {tag(label)}
        </g>
      );
    case 'ev':
      return (
        <g>
          {spin(<g>
            <rect x="-26" y="-46" width="52" height="92" rx="14" className="fill-slate-100 stroke-red-500" strokeWidth="2.5" />
            <rect x="-26" y="-4" width="52" height="9" fill="#ef4444" />
            <rect x="-9" y="-52" width="7" height="7" fill="#ef4444" /><rect x="2" y="-52" width="7" height="7" fill="#3b82f6" />
            <rect x="-19" y="-34" width="38" height="20" rx="6" className="fill-sky-200/80" />
            <text x="0" y="26" textAnchor="middle" className="fill-red-600 text-[10px] font-black">EMS</text>
          </g>)}
          {tag(label)}
        </g>
      );
    case 'bus':
      return (
        <g>
          {spin(<g>
            <rect x="-27" y="-50" width="54" height="100" rx="10" className="fill-teal-600 stroke-teal-300" strokeWidth="2.5" />
            <rect x="-20" y="-40" width="40" height="16" rx="4" className="fill-cyan-100/80" />
            <rect x="-20" y="-18" width="40" height="12" rx="3" className="fill-cyan-100/50" />
            <rect x="-20" y="0" width="40" height="12" rx="3" className="fill-cyan-100/50" />
            <text x="0" y="34" textAnchor="middle" className="fill-white text-[10px] font-black">BUS</text>
          </g>)}
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
    case 'hub':
      return (
        <g>
          <rect x="-33" y="-26" width="66" height="52" rx="6" className="fill-zinc-800 stroke-neon-cyan" strokeWidth="2" />
          <rect x="-27" y="-20" width="54" height="9" rx="2" className="fill-cyan-500/20" />
          <text x="0" y="-13" textAnchor="middle" className="fill-neon-cyan text-[9px] font-bold">V2X HUB</text>
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={-21 + i * 14} cy={8} r="3.5" className="fill-neon-cyan" />)}
          <text x="0" y="22" textAnchor="middle" className="fill-slate-500 text-[7px]">edge compute · fusion</text>
          {tag(label)}
        </g>
      );
    case 'lidar':
    case 'radar':
    case 'camera': {
      const col = type === 'lidar' ? '#38bdf8' : type === 'radar' ? '#a78bfa' : '#34d399';
      const short = type === 'lidar' ? 'LiDAR' : type === 'radar' ? 'RADAR' : 'CAM';
      return (
        <g>
          <rect x="-19" y="-15" width="38" height="28" rx="5" className="fill-zinc-800" stroke={col} strokeWidth="2" />
          {type === 'camera'
            ? <g><rect x="-7" y="-10" width="14" height="16" rx="3" fill="#0b0f17" stroke={col} strokeWidth="1.4" /><circle cx="0" cy="-2" r="4" fill={col} /></g>
            : type === 'radar'
              ? [0, 1, 2].map((i) => <path key={i} d={`M -11 6 q 11 ${-(9 + i * 5)} 22 0`} fill="none" stroke={col} strokeWidth="1.6" opacity={0.9 - i * 0.22} />)
              : [0, 1, 2, 3, 4].map((i) => <line key={i} x1={-13 + i * 6.5} y1="-10" x2={-13 + i * 6.5} y2="7" stroke={col} strokeWidth="1.3" opacity="0.85" />)}
          <text x="0" y={22} textAnchor="middle" fill={col} className="text-[8px] font-bold">{short}</text>
          {tag(model ? `${model.vendor} ${model.name}` : short)}
        </g>
      );
    }
    case 'mast': {
      const s = flip ? -1 : 1;    // flip mirrors the arm to the other side of the pole
      const poleX = 114 * s;      // arm & signal heads are on the -s side; the RSU mounts on the +s (outside) side
      const mountX = 158 * s, mountY = -66;
      return (
        <g>
          <rect x={s > 0 ? 98 : -130} y="94" width="32" height="12" rx="2" className="fill-zinc-700 stroke-zinc-600" />
          <line x1={poleX} y1="100" x2={poleX} y2="-96" className="stroke-zinc-500" strokeWidth="10" strokeLinecap="round" />
          <line x1={poleX} y1="-92" x2={-122 * s} y2="-92" className="stroke-zinc-500" strokeWidth="9" strokeLinecap="round" />
          {/* signal / sensor mounting nubs along the arm */}
          {[-104, -52, 8, 64].map((mx, i) => <rect key={i} x={mx * s - 4} y="-101" width="8" height="16" rx="2" className="fill-zinc-600 stroke-zinc-400" strokeWidth="1" />)}
          {/* RSU mounting slot — a bracket + ghost footprint on the OUTSIDE of the pole */}
          <line x1={poleX} y1={mountY} x2={mountX - 30 * s} y2={mountY} className="stroke-zinc-500" strokeWidth="5" strokeLinecap="round" />
          <rect x={mountX - 30} y={mountY - 16} width="60" height="32" rx="6" fill="none" className="stroke-zinc-500" strokeWidth="1.5" strokeDasharray="4 4" />
          <text x={mountX} y={mountY + 4} textAnchor="middle" className="fill-slate-500 text-[9px] font-semibold">RSU</text>
          <text x={-8 * s} y="-108" textAnchor="middle" className="fill-slate-500 text-[10px]">mast arm — mount signals &amp; sensors</text>
        </g>
      );
    }
    case 'celltower':
      return (
        <g>
          {/* lattice tower */}
          <line x1="-16" y1="52" x2="0" y2="-40" className="stroke-zinc-400" strokeWidth="3" />
          <line x1="16" y1="52" x2="0" y2="-40" className="stroke-zinc-400" strokeWidth="3" />
          {[0, 1, 2, 3].map((k) => <line key={k} x1={-13 + k * 3} y1={40 - k * 22} x2={13 - k * 3} y2={40 - k * 22} className="stroke-zinc-500" strokeWidth="2" />)}
          <line x1="0" y1="-40" x2="0" y2="-54" className="stroke-zinc-300" strokeWidth="2" />
          {/* antenna panels */}
          <rect x="-13" y="-42" width="6" height="14" rx="1" className="fill-neon-amber" />
          <rect x="7" y="-42" width="6" height="14" rx="1" className="fill-neon-amber" />
          {/* radiating signal */}
          {[0, 1, 2].map((k) => <path key={k} d={`M ${-8 - k * 5} -50 a ${8 + k * 5} ${8 + k * 5} 0 0 1 ${16 + k * 10} 0`} fill="none" stroke="#fb923c" strokeWidth="1.6" opacity={0.85 - k * 0.22} />)}
          <text x="0" y="30" textAnchor="middle" className="fill-orange-300 text-[9px] font-bold">CELL</text>
          <text y={TYPES.celltower.size.h / 2 + 16} textAnchor="middle" className="fill-slate-400 text-[10px]">{model ? `${model.vendor} ${model.name}` : 'Cell Tower'}</text>
        </g>
      );
    case 'tmc':
      return (
        <g>
          {/* cloud */}
          <g className="fill-zinc-700 stroke-zinc-500" strokeWidth="1.5">
            <ellipse cx="-20" cy="4" rx="20" ry="15" />
            <ellipse cx="14" cy="4" rx="22" ry="17" />
            <ellipse cx="-2" cy="-10" rx="20" ry="16" />
            <rect x="-38" y="2" width="74" height="18" rx="9" />
          </g>
          <text x="-2" y="2" textAnchor="middle" className="fill-neon-cyan text-[10px] font-bold">TMC · Cloud</text>
          <text y={TYPES.tmc.size.h / 2 + 16} textAnchor="middle" className="fill-slate-400 text-[10px]">{model ? `${model.vendor} ${model.name}` : 'TMC / Cloud'}</text>
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
  const [paused, setPaused] = useState(false);        // freeze the frame (packets stay clickable)
  const [simT, setSimT] = useState(0);                // sim-time in seconds (0..SIM_LOOP), scrubbable
  const [speed, setSpeed] = useState(1);              // playback speed multiplier
  const [dirMode, setDirMode] = useState(prefs.dirMode || 'both'); // 'fwd' | 'rev' | 'both'
  const [enabled, setEnabled] = useState(prefs.enabled || { SRM: false, SSM: false }); // per-message on/off (missing = on); SRM/SSM off until an EV/bus appears
  const [mapStore, setMapStore] = useState(prefs.mapStore || 'rsu'); // MAP geometry: 'rsu' | 'tc'
  const [mapOpen, setMapOpen] = useState(false);                     // MAP-storage detail: collapsed by default
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

  // "Simulate this world" — advance a deterministic sim-clock that drives both the
  // packet flow and the moving vehicles. Pausing simply stops advancing simT (frozen
  // frame); resuming continues; scrubbing sets simT directly. Speed scales the rate.
  useEffect(() => {
    if (!sim || paused) return;
    let last = performance.now();
    const loop = (now) => { const dt = (now - last) / 1000; last = now; setSimT((t) => (t + dt * speed) % SIM_LOOP); simRaf.current = requestAnimationFrame(loop); };
    simRaf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(simRaf.current);
  }, [sim, paused, speed]);
  // stop simulating if there is nothing left to animate
  useEffect(() => { if (sim && conns.length === 0 && !devices.some((o) => isMobile(o.type) && o.drive)) { setSim(false); setPaused(false); } }, [sim, conns.length]);

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
  // Mast geometry (world coords), honoring the arm's flip. The arm (with the
  // signal heads) extends to one side of the pole; the RSU slot is on the OTHER
  // (outside) side — matching the visible ghost slot drawn on the mast.
  const mastGeo = (mst) => {
    const s = mst.flip ? -1 : 1;
    const armY = mst.y - 92;
    const poleX = mst.x + 114 * s;
    const ends = [mst.x + 114 * s, mst.x - 122 * s];
    return { s, armY, poleX, x0: Math.min(...ends), x1: Math.max(...ends), rsuX: mst.x + 158 * s, rsuY: mst.y - 66 };
  };
  // Signals & sensors "click into" the arm; an RSU drops into the pole-side slot.
  // Picks the nearest compatible mast slot within a generous capture radius.
  const snapToMast = (o) => {
    const onArm = o.type === 'signal' || isSensor(o.type);
    if (!onArm && o.type !== 'rsu') return null;
    let best = null, bestD = Infinity;
    for (const mst of objects) {
      if (mst.type !== 'mast' || mst.id === o.id) continue;
      const g = mastGeo(mst);
      if (onArm) {
        // anywhere along the arm span (generous vertical + horizontal margin)
        if (o.x >= g.x0 - 40 && o.x <= g.x1 + 40 && Math.abs(o.y - g.armY) < 96) {
          const x = Math.min(g.x1, Math.max(g.x0, o.x));
          const d = Math.abs(o.y - g.armY) + Math.max(0, g.x0 - o.x) + Math.max(0, o.x - g.x1);
          if (d < bestD) { bestD = d; best = { x, y: g.armY + TYPES[o.type].size.h / 2 - 4 }; }
        }
      } else {   // rsu → the outside slot
        const d = Math.hypot(o.x - g.rsuX, o.y - g.rsuY);
        const nearPole = Math.abs(o.x - g.poleX) < 84 && o.y > mst.y - 120 && o.y < mst.y + 60;
        if (d < 130 || nearPole) { if (d < bestD) { bestD = d; best = { x: g.rsuX, y: g.rsuY }; } }
      }
    }
    return best;
  };
  const endInteraction = (e) => {
    // a drag that actually moved is one undo step
    if (drag.current && drag.current.moved) {
      const pre = drag.current.pre; setUndo((u) => [...u.slice(-49), pre]); setRedo([]);
      // snap a dragged signal/sensor/RSU onto its mast slot ("click into"),
      // using the pointer-derived final centre for accuracy
      const { id, ox, oy } = drag.current;
      const base = objects.find((o) => o.id === id);
      let dragged = base;
      if (base && svgRef.current) { const p = svgPoint(svgRef.current, e.clientX, e.clientY); dragged = { ...base, x: p.x - ox, y: p.y - oy }; }
      const snap = dragged && snapToMast(dragged);
      if (snap) setObjects((prev) => prev.map((o) => o.id === id ? { ...o, x: snap.x, y: snap.y } : o));
    }
    if (wiring && svgRef.current) {
      const p = svgPoint(svgRef.current, e.clientX, e.clientY);
      // find nearest other device within grab radius
      let best = null, bestD = 70 * 70;
      objects.forEach((o) => {
        if (o.id === wiring.from || TYPES[o.type].cat !== 'device') return;   // only wire to real devices
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

  // What the built world can justify — so the sim only generates messages that
  // make sense: SPaT/MAP/SSM need a signal; SDSM a sensor; SRM/SSM an authorized
  // (EV/bus) requester; TIM a network source. Generalises to any canvas.
  const worldCtx = useMemo(() => {
    const ds = objects.filter((o) => TYPES[o.type].cat === 'device');
    return {
      signal: ds.some((o) => o.type === 'tc' || o.type === 'signal'),
      sensor: ds.some((o) => isSensor(o.type)),
      priority: ds.some((o) => canRequestPriority(o.type)),
      network: ds.some((o) => o.type === 'tmc' || o.type === 'celltower'),
    };
  }, [objects]);
  // Auto-enable SRM/SSM the moment an EV/bus is introduced (and clear them when
  // the last one leaves). Fires only on the transition, so manual toggles in
  // between are respected.
  const prevPriority = useRef();
  useEffect(() => {
    if (worldCtx.priority !== prevPriority.current) {
      prevPriority.current = worldCtx.priority;
      setEnabled((e) => ({ ...e, SRM: worldCtx.priority, SSM: worldCtx.priority }));
    }
  }, [worldCtx.priority]);

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

  // ----- live sim state derived from simT -----
  const phase = (simT / 2.2) % 1;                       // 0..1 packet-flow clock
  const lp = (o) => (o && sim ? liveXY(o, simT) : o ? { x: o.x, y: o.y } : { x: 0, y: 0 });
  const anyDriving = devices.some((o) => isMobile(o.type) && o.drive);
  // Range-based connectivity: ephemeral wireless links to every OBU inside an RSU's
  // range circle (unless already manually wired). They form/break as vehicles drive.
  const autoLinks = useMemo(() => {
    if (!sim) return [];
    const out = [];
    const rsus = devices.filter((o) => o.type === 'rsu');
    const obus = devices.filter((o) => isMobile(o.type));   // vehicles + pedestrians
    obus.forEach((ob) => { const op = lp(ob); rsus.forEach((r) => {
      if ((r.x - op.x) ** 2 + (r.y - op.y) ** 2 > RANGE * RANGE) return;
      if (conns.some((c) => (c.from === r.id && c.to === ob.id) || (c.from === ob.id && c.to === r.id))) return;
      out.push({ id: 'auto-' + r.id + '-' + ob.id, from: r.id, to: ob.id, auto: true });
    }); });
    return out;
  }, [sim, simT, objects, conns]);
  const inRange = (rsuId) => sim && (conns.some((c) => { const other = c.from === rsuId ? byId[c.to] : c.to === rsuId ? byId[c.from] : null; return other && isVehicle(other.type); }) || autoLinks.some((l) => l.from === rsuId));

  const paletteGroups = [
    { title: 'Templates', items: ['intersection'] },
    { title: 'Devices', items: ['tc', 'rsu', 'hub', 'obu', 'ev', 'bus', 'signal', 'ped'] },
    { title: 'Sensors', items: ['lidar', 'radar', 'camera'] },
    { title: 'Network (V2N)', items: ['celltower', 'tmc'] },
    { title: 'Structures', items: ['roadH', 'roadV', 'mast'] },
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
          <button onClick={() => { const can = conns.length || anyDriving; if (can) { if (!sim) { setSimT(0); setPaused(false); } setSim((s) => !s); } }}
            disabled={!conns.length && !anyDriving}
            title={(conns.length || anyDriving) ? '' : 'Wire a link or set a vehicle to Drive first'}
            className={'rounded px-2 py-0.5 font-semibold transition ' + (sim ? 'bg-neon-red/20 text-neon-red' : (conns.length || anyDriving) ? 'bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30' : 'text-slate-600 cursor-not-allowed')}>
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
                <DeviceArt type={o.type} flip={o.flip} />
                <rect x={-TYPES[o.type].size.w / 2} y={-TYPES[o.type].size.h / 2} width={TYPES[o.type].size.w} height={TYPES[o.type].size.h}
                  fill="transparent" stroke={sel?.id === o.id ? '#22d3ee' : 'transparent'} strokeDasharray="6 5" strokeWidth="1.5" />
              </g>
            ))}

            {/* radio range hint for RSUs (brightens when a vehicle is in range) */}
            {devices.filter((o) => o.type === 'rsu').map((o) => { const hot = inRange(o.id); return (
              <circle key={'r' + o.id} cx={o.x} cy={o.y} r={RANGE} fill={hot ? '#a78bfa22' : '#a78bfa10'} stroke="#a78bfa"
                strokeOpacity={hot ? 0.6 : 0.25} strokeDasharray="4 8" style={{ pointerEvents: 'none' }} />
            ); })}

            {/* auto range-based links (ephemeral, dashed) */}
            {autoLinks.map((l) => { const a = lp(byId[l.from]), b = lp(byId[l.to]); return (
              <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a78bfa" strokeWidth="2" strokeDasharray="2 6" opacity="0.7" />
            ); })}

            {/* connections (endpoints follow moving vehicles during sim) */}
            {conns.map((c) => {
              const a = byId[c.from], b = byId[c.to]; if (!a || !b) return null;
              const la = lp(a), lb = lp(b);
              const st = CONN_STYLE[connKind(a.type, b.type)];
              const isSel = sel?.kind === 'conn' && sel.id === c.id;
              return (
                <g key={c.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'conn', id: c.id }); }}>
                  <line x1={la.x} y1={la.y} x2={lb.x} y2={lb.y} stroke="transparent" strokeWidth="14" />
                  <line x1={la.x} y1={la.y} x2={lb.x} y2={lb.y} stroke={st.color} strokeWidth={isSel ? 4 : 2.5}
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
              const moving = isMobile(o.type) && o.drive;
              const rot = isVehicle(o.type) && o.drive ? DRIVE_ROT[o.drive] : 0;
              const pos = lp(o);                       // live position while simulating
              const lockDrag = sim && moving;          // a moving object can't be dragged mid-sim
              return (
                <g key={o.id} transform={`translate(${pos.x},${pos.y})`} className={'spart ' + (isSel ? 'part-hi' : '')}
                   style={{ cursor: lockDrag ? 'pointer' : 'move' }}
                   onPointerDown={(e) => { if (lockDrag) { e.stopPropagation(); setSel({ kind: 'obj', id: o.id }); } else startDrag(o, e); }}>
                  {/* selection outline + hit padding */}
                  <rect x={-sz.w / 2 - 4} y={-sz.h / 2 - 4} width={sz.w + 8} height={sz.h + 8} rx="8"
                    fill="transparent" stroke={isSel ? '#22d3ee' : 'transparent'} strokeDasharray="6 5" />
                  <DeviceArt type={o.type} model={model} sig={sig} rot={rot} />
                  {/* travel-direction badge on moving vehicles / pedestrians */}
                  {moving && <text x={sz.w / 2 + 6} y={-sz.h / 2 + 2} className="fill-neon-cyan text-[14px] font-bold">{DRIVE_ARROW[o.drive]}</text>}
                  {/* wiring port (its own handler pre-empts the group drag) */}
                  {!lockDrag && <circle cx="0" cy={-sz.h / 2 - 14} r="6" className="fill-zinc-950 stroke-neon-cyan" strokeWidth="2"
                    style={{ cursor: 'crosshair' }} onPointerDown={(e) => startWire(o, e)} />}
                </g>
              );
            })}

            {/* live snap preview — ghost footprint + pulse where the dragged part will click in */}
            {drag.current && (() => {
              const o = byId[drag.current.id]; if (!o) return null;
              const snap = snapToMast(o); if (!snap) return null;
              const sz = TYPES[o.type].size;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={snap.x - sz.w / 2} y={snap.y - sz.h / 2} width={sz.w} height={sz.h} rx="8" fill="#22d3ee1f" stroke="#22d3ee" strokeWidth="2" strokeDasharray="5 4" />
                  <circle cx={snap.x} cy={snap.y} r="10" fill="none" stroke="#22d3ee" strokeWidth="2" className="halo" />
                </g>
              );
            })()}

            {/* ---- "Simulate this world": packets flowing across every wired link ---- */}
            {sim && (
              <g>
                {/* sensor→target = DETECTION: a scanning lock-on reticle on the target
                    (the sensor senses it; the vehicle transmits nothing). Clickable. */}
                {conns.map((c) => {
                  const A = byId[c.from], B = byId[c.to];
                  if (!A || !B || connKind(A.type, B.type) !== 'detect') return null;
                  const sen = isSensor(A.type) ? A : B, target = isSensor(A.type) ? B : A;
                  const tp = lp(target), sz = TYPES[target.type].size;
                  const open = () => setPacketInspect({ msg: 'detection', secure: true, formatOk: true, fault: null, aType: sen.type, bType: target.type, vehType: isVehicle(target.type) ? target.type : null });
                  return (
                    <g key={'det' + c.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); open(); }}>
                      <rect x={tp.x - sz.w / 2 - 7} y={tp.y - sz.h / 2 - 7} width={sz.w + 14} height={sz.h + 14} rx="7"
                        fill="none" stroke="#7dd3fc" strokeWidth="2" strokeDasharray="7 5" className={paused ? '' : 'dashflow'} />
                      <text x={tp.x} y={tp.y - sz.h / 2 - 13} textAnchor="middle" className="fill-sky-300 text-[10px] font-semibold">{sen.type} · detecting</text>
                    </g>
                  );
                })}
                {devices.filter((o) => o.type === 'rsu').map((o) => (
                  <g key={o.id + 'rsu'} style={{ pointerEvents: 'none' }}>
                    {[0, 1].map((k) => <circle key={k} cx={o.x} cy={o.y} r={22 + k * 16} fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.5" className={paused ? '' : 'radiowave'} style={{ animationDelay: k * 0.4 + 's' }} />)}
                    {/* security / conversion status badges */}
                    <text x={o.x} y={o.y - 30} textAnchor="middle" className="text-[13px]">{rsuSecure(o) ? '🔒' : '🔓'}</text>
                    {upstreamClassic(o.id) && !rsuConvert(o) && <text x={o.x + 20} y={o.y - 30} textAnchor="middle" className="text-[13px]">⚠️</text>}
                  </g>
                ))}
                {conns.concat(autoLinks).map((c) => {
                  const A = byId[c.from], B = byId[c.to]; if (!A || !B) return null;
                  const a = { ...A, ...lp(A) }, b = { ...B, ...lp(B) };   // live-positioned endpoints
                  const streams = linkStreams(a, b, dirMode, enabled, mapStore, worldCtx);
                  const kind = connKind(a.type, b.type);
                  const rsu = kind === 'wireless' ? (a.type === 'rsu' ? a : b) : null;
                  const classic = rsu ? upstreamClassic(rsu.id) : false;
                  return streams.map((st, idx) => {
                    const p = (phase + idx / streams.length) % 1;
                    const x = st.from.x + (st.to.x - st.from.x) * p, y = st.from.y + (st.to.y - st.from.y) * p;
                    const fault = rsu ? streamFault(rsu, classic, st) : null;
                    const col = fault ? '#f87171' : st.color;
                    const vehType = isVehicle(a.type) ? a.type : isVehicle(b.type) ? b.type : null;
                    const open = () => setPacketInspect({ msg: st.label, secure: !(fault === 'security'), formatOk: fault !== 'format', fault, aType: a.type, bType: b.type, vehType });
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

        {/* transport bar — pause · speed · scrub timeline (during simulation) */}
        {sim && (
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-[11px]"
            style={{ right: packetInspect ? 388 : 16 }}>
            <button onClick={() => setPaused((p) => !p)}
              className={'rounded px-2 py-1 font-semibold ' + (paused ? 'bg-neon-green/20 text-neon-green' : 'bg-neon-amber/20 text-neon-amber')}>
              {paused ? '▶ Resume' : '❚❚ Pause'}
            </button>
            <div className="flex items-center gap-1 text-slate-400">
              <span>Speed</span>
              {[0.5, 1, 2, 4].map((s) => (
                <button key={s} onClick={() => setSpeed(s)} className={'rounded px-1.5 py-0.5 font-mono ' + (speed === s ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-slate-400 hover:text-white')}>{s}×</button>
              ))}
            </div>
            <input type="range" min="0" max={SIM_LOOP} step="0.05" value={simT}
              onChange={(e) => { setPaused(true); setSimT(parseFloat(e.target.value)); }}
              className="flex-1 min-w-[120px] accent-cyan-400" />
            <span className="w-16 shrink-0 text-right font-mono text-slate-400">{simT.toFixed(1)} / {SIM_LOOP}s</span>
            {paused && <span className="shrink-0 text-neon-amber/80">⏸ click a packet</span>}
          </div>
        )}

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
                {SENSOR_FEED_INFO[pk.msg] && (() => { const info = SENSOR_FEED_INFO[pk.msg]; return (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">What this data is</div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2.5">
                      <p className="text-[12px] leading-relaxed text-slate-300">{info.what}</p>
                      <div className="text-[9px] uppercase tracking-widest text-slate-500 pt-0.5">Pipeline · raw → transmitted</div>
                      <div className="space-y-2">
                        {info.stages.map(([label, text], i) => (
                          <div key={i} className="border-l-2 border-neon-cyan/40 pl-2.5">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-neon-cyan">{label}</div>
                            <div className="text-[11px] leading-relaxed text-slate-400">{text}</div>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-md border border-neon-violet/30 bg-neon-violet/5 p-2">
                        <div className="text-[9px] uppercase tracking-widest text-neon-violet mb-0.5">Where it’s processed</div>
                        <p className="text-[11px] leading-relaxed text-slate-300">{info.where}</p>
                      </div>
                      <div className="space-y-2">
                        {info.setups.map(([label, text], i) => (
                          <div key={i} className={'border-l-2 pl-2.5 ' + (i === 0 ? 'border-zinc-600' : 'border-neon-green/50')}>
                            <div className={'text-[10px] font-bold uppercase tracking-wide ' + (i === 0 ? 'text-slate-300' : 'text-neon-green')}>{label}</div>
                            <div className="text-[11px] leading-relaxed text-slate-400">{text}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-400"><span className="text-slate-300 font-semibold">Transmitted: </span>{info.transmitted}</p>
                      <p className="text-[11px] leading-relaxed text-slate-400"><span className="text-slate-300 font-semibold">{info.nuanceLabel}: </span>{info.nuance}</p>
                    </div>
                  </div>
                ); })()}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Decoded payload (representative)</div>
                  <div className="rounded-lg border border-zinc-800 bg-black/60 p-3"><pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words"><JsonView data={decodePacket(pk.msg, { secure: pk.secure, formatOk: pk.formatOk, vehType: pk.vehType })} /></pre></div>
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

          {/* MAP geometry storage — compact, collapsed by default, tucked under Direction */}
          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/40">
            <button onClick={() => setMapOpen((v) => !v)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
              <span className="text-slate-500 w-3 text-[11px]">{mapOpen ? '▾' : '▸'}</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">MAP geometry stored on</span>
              <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-neon-cyan">{mapStore.toUpperCase()}</span>
            </button>
            {mapOpen && (
              <div className="px-2.5 pb-2.5">
                <Segmented value={mapStore} onChange={setMapStore}
                  options={[{ value: 'rsu', label: 'RSU' }, { value: 'tc', label: 'TC' }]} />
                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] font-semibold text-slate-200">{MAP_INFO[mapStore].title}</div>
                    <span className="ml-auto rounded bg-neon-cyan/15 text-neon-cyan text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5">{MAP_INFO[mapStore].mode}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400 leading-relaxed">{MAP_INFO[mapStore].modeDesc}</div>
                  <div className="mt-1.5 text-[11px] text-emerald-300/90"><span className="font-semibold">✔ </span>{MAP_INFO[mapStore].benefit}</div>
                  <div className="mt-1 text-[11px] text-amber-300/90"><span className="font-semibold">✖ </span>{MAP_INFO[mapStore].draw}</div>
                  <div className="mt-2 rounded-md border border-zinc-800 bg-black/30 p-2 text-[10px] leading-relaxed text-slate-500">{RSU_MODE_NOTE}</div>
                  {(() => { const kb = backhaulKbps(enabled, mapStore); const max = 20; return (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px]"><span className="text-slate-400">Est. cabinet backhaul (downstream)</span><span className="font-mono text-slate-200">≈ {kb} kbps</span></div>
                      <div className="mt-1 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: Math.min(100, (kb / max) * 100) + '%', background: mapStore === 'tc' ? '#fbbf24' : '#34d399' }} /></div>
                      <div className="mt-1 text-[10px] text-slate-500">SPaT 100 B @ 10 Hz · SSM 60 B @ 2 Hz{mapStore === 'tc' ? ' · MAP 1 KB @ 1 Hz (+8 kbps)' : ' · MAP broadcast locally by RSU (0 on wire)'}</div>
                    </div>
                  ); })()}
                </div>
              </div>
            )}
          </div>

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
        </div>

        {!sel && <div className="text-sm text-slate-500">Select a device or link to see its properties &amp; spec sheet.</div>}

        {selConn && byId[selConn.from] && byId[selConn.to] && (() => {
          const a = byId[selConn.from], b = byId[selConn.to];
          const kind = connKind(a.type, b.type);
          return (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">Connection</h3>
              <div className="rounded-lg border border-zinc-800 bg-black/40 p-3 text-[12px] text-slate-300">
                {CONN_PIPELINE[kind] ? (
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[11px]">
                    {CONN_PIPELINE[kind].map((s, i, arr) => (
                      <React.Fragment key={s}>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-slate-200">{s}</span>
                        {i < arr.length - 1 && <span className="text-slate-500">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div>{TYPES[a.type].label} ↔ {TYPES[b.type].label}</div>
                )}
                <div className="mt-1.5" style={{ color: CONN_STYLE[kind].color }}>{CONN_STYLE[kind].label}</div>
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

            {/* Drive / Walk control — turns a static vehicle or pedestrian into a moving one */}
            {isMobile(selObj.type) && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">{selObj.type === 'ped' ? 'Walk' : 'Drive'}</div>
                <div className="flex gap-1">
                  {[{ v: null, l: 'Off' }, { v: 'e', l: '→' }, { v: 'w', l: '←' }, { v: 'n', l: '↑' }, { v: 's', l: '↓' }].map((d) => {
                    const on = (selObj.drive || null) === d.v;
                    return <button key={d.l} onClick={() => { pushUndo(); setObjects((prev) => prev.map((o) => o.id === selObj.id ? { ...o, drive: d.v } : o)); }}
                      className={'flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition ' + (on ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan' : 'border-zinc-700 text-slate-300 hover:border-zinc-500')}>{d.l}</button>;
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">{selObj.type === 'ped' ? 'A walking pedestrian broadcasts a PSM; links to any RSU form/break as they pass through range.' : 'A driving vehicle loops across the canvas during simulation — links to any RSU form/break as it passes through range.'}</p>
              </div>
            )}

            {/* Mast arm — flip which side the arm extends, and where the RSU mounts */}
            {selObj.type === 'mast' && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Mast arm</div>
                <button onClick={() => { pushUndo(); setObjects((prev) => prev.map((o) => o.id === selObj.id ? { ...o, flip: !o.flip } : o)); }}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-[13px] text-slate-200 hover:border-zinc-500">
                  ⟲ Flip arm — currently extends {selObj.flip ? 'right ▶' : '◀ left'}
                </button>
                <p className="mt-1.5 text-[11px] text-slate-500">Drag a signal or sensor onto the arm to mount it; drag an RSU near the pole to attach it to the side (where they usually go).</p>
              </div>
            )}

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
  rsu: { x: 560, y: 150 }, tc: { x: 636, y: 150 }, hub: { x: 660, y: 118 },
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
  ) : hz.kind === 'curve' ? (
    <g>
      <polygon points={`${hz.x},${G.ewY0 - 54} ${hz.x + 22},${G.ewY0 - 32} ${hz.x},${G.ewY0 - 10} ${hz.x - 22},${G.ewY0 - 32}`} fill="#f59e0b" stroke="#111" strokeWidth="1.5" />
      <path d={`M ${hz.x - 7} ${G.ewY0 - 22} q 0 -16 14 -16`} fill="none" stroke="#111" strokeWidth="2.5" />
      <text x={hz.x} y={G.ewY0 - 62} textAnchor="middle" className="fill-amber-300 text-[10px] font-bold">{hz.label}</text>
    </g>
  ) : (
    <g>
      {[0, 1, 2, 3].map((k) => <path key={k} d={`M ${hz.x - 30 + k * 20} ${G.ewLaneY + 16} l -5 15 l 10 0 z`} fill="#f59e0b" stroke="#fff" strokeWidth="1" />)}
      <rect x={hz.x - 28} y={G.ewY0 - 34} width="56" height="24" rx="4" fill="#f59e0b" />
      <text x={hz.x} y={G.ewY0 - 17} textAnchor="middle" className="fill-zinc-900 text-[9px] font-bold">{hz.label}</text>
    </g>
  ));

  // Roadside detection sensor on a pole, with a detection cone aimed at the road.
  const sensorMark = (s) => {
    const col = s.kind === 'lidar' ? '#38bdf8' : s.kind === 'radar' ? '#a78bfa' : '#34d399';
    const name = s.kind === 'lidar' ? 'LiDAR' : s.kind === 'radar' ? 'RADAR' : 'CAMERA';
    const y = s.y != null ? s.y : 118;
    const tx = s.tx != null ? s.tx : s.x;   // point on the road the cone is aimed at
    return (
      <g>
        <line x1={s.x} y1={y + 10} x2={s.x} y2={G.ewY0 - 6} className="stroke-zinc-600" strokeWidth="5" />
        {s.active && <polygon points={`${s.x},${y + 8} ${tx - 66},${G.ewLaneY + 6} ${tx + 66},${G.ewLaneY + 6}`} fill={col + '22'} stroke={col} strokeWidth="1.5" strokeDasharray="6 4" className={f.waves ? 'dashflow' : ''} />}
        <rect x={s.x - 21} y={y - 12} width="42" height="24" rx="5" className="fill-zinc-800" stroke={col} strokeWidth="2" />
        <text x={s.x} y={y + 4} textAnchor="middle" fill={col} className="text-[9px] font-bold">{name}</text>
        {s.label && <text x={s.x} y={y - 18} textAnchor="middle" fill={col} className="text-[9px]">{s.label}</text>}
      </g>
    );
  };

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
      {infra === 'rsu' && (
        <g>
          <line x1={G.rsu.x} y1={G.rsu.y + 14} x2={G.rsu.x} y2={G.ewY0} className="stroke-zinc-600" strokeWidth="6" />
          {f.waves && broadcast(G.rsu.x, G.rsu.y, '#a78bfa', true)}
          <rect x={G.rsu.x - 26} y={G.rsu.y - 15} width="52" height="30" rx="6" className="fill-emerald-500/20 stroke-neon-green" />
          <text x={G.rsu.x} y={G.rsu.y + 4} textAnchor="middle" className="fill-neon-green text-[10px] font-bold">RSU</text>
        </g>
      )}

      {/* V2X Hub (edge compute) — fuses sensor detections, feeds the RSU */}
      {f.hub && (
        <g>
          <line x1={G.hub.x} y1={G.hub.y} x2={G.rsu.x + 26} y2={G.rsu.y} className="stroke-pink-400" strokeWidth="2" />
          <rect x={G.hub.x - 26} y={G.hub.y - 15} width="52" height="30" rx="6" className="fill-cyan-500/15 stroke-neon-cyan" />
          <text x={G.hub.x} y={G.hub.y - 1} textAnchor="middle" className="fill-neon-cyan text-[9px] font-bold">V2X HUB</text>
          <text x={G.hub.x} y={G.hub.y + 9} textAnchor="middle" className="fill-slate-400 text-[7px]">fusion</text>
        </g>
      )}

      {/* roadside detection sensors */}
      {f.sensors && f.sensors.map((s, i) => <g key={'sen' + i}>{sensorMark(s)}</g>)}

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
    // The same SRM, three RequestorDescription roles — toggle to see how the
    // controller grants each: emergency = preemption, transit/freight = priority.
    id: 'priority', category: 'V2I', icon: '🚦', title: 'Signal Priority & Preemption', tagline: 'One SRM — three roles, three grants',
    duration: 11,
    variants: [
      {
        id: 'emergency', label: 'Emergency · preemption', tagline: 'SRM → light preempted to green',
        duration: 11,
        why: 'An emergency vehicle’s OBU asks the intersection for priority using a Signal Request Message (SRM). The RSU relays it to the controller, which PREEMPTS the signal — interrupting the whole cycle to give the ambulance a green — and confirms with an SSM. The ambulance never has to stop or run a red.',
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
          else if (t < 6.4) { packets.push({ ...lerpPt(G.tc, { x: ax, y: G.ewLaneY }, seg(t, 5.2, 6.4)), label: 'SSM ✔', tone: TONE.green }); banner = { text: 'TC grants preemption · returns SSM · signal turns GREEN', tone: 'ok' }; }
          else banner = { text: 'Ambulance clears the intersection without stopping', tone: 'ok' };
          return { cars, packets, ew: green ? 'green' : 'red', ns: green ? 'red' : 'green', banner, rsuActive: true, waves: t > 2.5 && t < 6.4 };
        },
      },
      {
        id: 'transit', label: 'Transit · priority', tagline: 'SRM → green extended for the bus',
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
      {
        id: 'freight', label: 'Freight · priority', tagline: 'SRM → green held for the truck',
        duration: 10,
        why: 'A heavy truck is costly and slow to stop and restart. With an authorized freight role it sends an SRM; the controller extends the green (priority, not preemption) so the loaded truck clears without stopping — cutting fuel burn, emissions and brake wear.',
        messages: ['SRM', 'SSM', 'SPaT'],
        frame(t) {
          const tx = lerp(-40, 1000, seg(t, 0, 10));
          const cars = [{ id: 'frt', x: tx, y: G.ewLaneY, or: 'h', kind: 'truck', label: 'FREIGHT' }];
          const packets = []; let banner;
          if (t < 2) banner = { text: 'A loaded truck approaches — the green is about to end', tone: 'info' };
          else if (t < 3.4) { packets.push({ ...lerpPt({ x: tx, y: G.ewLaneY }, G.rsu, seg(t, 2, 3.4)), label: 'SRM', tone: TONE.cyan }); banner = { text: 'Truck sends an SRM requesting freight priority', tone: 'info' }; }
          else if (t < 4.6) { packets.push({ ...lerpPt(G.rsu, G.tc, seg(t, 3.4, 4.6)), label: 'SRM', tone: TONE.cyan }); banner = { text: 'RSU relays it → controller extends the green', tone: 'info' }; }
          else if (t < 5.8) { packets.push({ ...lerpPt(G.tc, { x: tx, y: G.ewLaneY }, seg(t, 4.6, 5.8)), label: 'SSM ✔', tone: TONE.green }); banner = { text: 'TC confirms via SSM · green held for the truck', tone: 'ok' }; }
          else banner = { text: 'Truck clears without stopping — fuel, emissions & brakes saved', tone: 'ok' };
          return { layout: 'cross', infra: 'signals', ew: 'green', ns: 'red', cars, packets, banner, waves: t >= 2 && t < 5.8 };
        },
      },
    ],
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
    // Same delivery path (TMC → cellular TIM → upstream vehicle), three hazards.
    // Toggle to see the identical network mechanism carry each advisory.
    id: 'hazard', category: 'V2N', icon: '📡', title: 'Network Hazard Warning (TIM)', tagline: 'A TMC pushes a downstream-hazard TIM',
    duration: 9,
    variants: [
      {
        id: 'workzone', label: 'Work zone', tagline: 'Reduce speed through the zone',
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
        id: 'ice', label: 'Black ice', tagline: 'Slippery road ahead',
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
      {
        id: 'stalled', label: 'Stalled vehicle', tagline: 'Lane blocked — move over',
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
    ],
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
  {
    id: 'csw', category: 'V2I', icon: '🛞', title: 'Curve Speed Warning', tagline: 'Roadside RSU advises a safe speed',
    duration: 8,
    why: 'A roadside RSU on the approach to a sharp curve broadcasts a curve-speed advisory. The vehicle receives it and slows to a safe speed before entering the bend — valuable at night, in fog, or for a heavy vehicle that could roll over if it enters too fast.',
    messages: ['TIM'],
    frame(t) {
      const ex = t < 3.5 ? lerp(-40, 330, seg(t, 0, 3.5)) : (t < 5.5 ? lerp(330, 470, easeOut(seg(t, 3.5, 5.5))) : lerp(470, 900, seg(t, 5.5, 8)));
      const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: t >= 3.4 && t < 5.5 }];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'A sharp curve lies ahead, out of sight', tone: 'info' };
      else if (t < 3.2) { packets.push({ ...lerpPt(G.rsu, { x: ex, y: G.ewLaneY }, seg(t, 1.5, 3.2)), label: 'TIM', tone: TONE.violet }); banner = { text: 'A roadside RSU broadcasts a curve-speed advisory', tone: 'info' }; }
      else if (t < 5.5) banner = { text: 'Advisory: slow to 40 km/h for the curve', tone: 'warn', sub: 'reduce before the bend, not in it' };
      else banner = { text: 'Took the curve safely at the advised speed', tone: 'ok' };
      return { layout: 'straightH', infra: 'rsu', cars, packets, hazard: { x: 662, kind: 'curve', label: 'CURVE' }, banner, waves: t >= 1.5 && t < 3.2 };
    },
  },

  /* ---------------- roadside sensors (LiDAR / radar / camera) ---------------- */
  {
    // Roadside sensors see UNEQUIPPED road users (no OBU/phone). Toggle the
    // sensor type — each has different strengths and feeds the infrastructure,
    // which then speaks V2X on the road user's behalf.
    id: 'sensordet', category: 'V2I', icon: '🛰️', title: 'Roadside Sensor Detection', tagline: 'LiDAR · radar · camera — detecting the unequipped',
    duration: 9,
    variants: [
      {
        id: 'lidar', label: 'LiDAR · pedestrian', tagline: 'Detects a pedestrian with no device',
        duration: 9,
        why: 'A pedestrian with no phone or beacon steps toward the crosswalk — invisible to V2X. A roadside LiDAR detects them in 3-D and feeds the V2X Hub / RSU, which broadcasts a PSM on their behalf. An approaching connected vehicle receives it and yields. This is how infrastructure protects UNEQUIPPED road users.',
        messages: ['point cloud', 'PSM'],
        frame(t) {
          const cx = 470;
          const ex = t < 3.6 ? lerp(-40, 300, seg(t, 0, 3.6)) : (t < 5.4 ? lerp(300, 398, easeOut(seg(t, 3.6, 5.4))) : 398);
          const py = t < 1.6 ? 360 : lerp(360, 250, seg(t, 1.6, 7));
          const detect = t >= 1.6 && t < 6.4;
          const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: t >= 3 && t < 5.6 }];
          const ped = { x: cx, y: py };   // note: no `broadcasting` — the pedestrian has no device
          const sensors = [{ x: cx, y: 118, kind: 'lidar', tx: cx, active: detect, label: detect ? 'ped detected' : '' }];
          const packets = []; let banner;
          if (t < 1.6) banner = { text: 'A pedestrian with NO phone/beacon nears the crosswalk', tone: 'info', sub: 'invisible to V2X on their own' };
          else if (t < 3) { packets.push({ ...lerpPt({ x: cx, y: 132 }, G.rsu, seg(t, 1.6, 3)), label: 'point cloud', tone: TONE.cyan }); banner = { text: 'Roadside LiDAR detects them in 3-D → sends a point cloud to the RSU', tone: 'warn' }; }
          else if (t < 5.6) { packets.push({ ...lerpPt(G.rsu, { x: ex, y: G.ewLaneY }, ((t - 3) % 1.3) / 1.3), label: 'PSM', tone: TONE.amber }); banner = { text: '⚠ Infrastructure broadcasts a PSM on the pedestrian’s behalf — the car yields', tone: 'warn' }; }
          else banner = { text: 'The car stopped for a pedestrian neither of them could have announced', tone: 'ok' };
          return { layout: 'straightH', infra: 'rsu', crosswalk: cx, cars, ped, sensors, packets, banner, waves: detect };
        },
      },
      {
        id: 'radar', label: 'Radar · speed', tagline: 'Measures approach speed (no loops)',
        duration: 9,
        why: 'A roadside radar measures the speed and range of approaching vehicles in any weather — replacing inductive loops. Here it detects a fast vehicle in the “dilemma zone” and feeds the controller, which briefly holds the green so the vehicle clears safely instead of being caught by the yellow.',
        messages: ['tracks'],
        frame(t) {
          const vx = lerp(-40, 980, seg(t, 0, 9));
          const detect = t >= 1.4 && t < 5;
          const green = t < 6.2;
          const cars = [{ id: 'v', x: vx, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO' }];
          const sensors = [{ x: 250, y: 118, kind: 'radar', tx: 250, active: detect, label: detect ? '92 km/h' : '' }];
          const packets = []; let banner;
          if (t < 1.4) banner = { text: 'A vehicle approaches fast — and there are no inductive loops here', tone: 'info' };
          else if (t < 3) { packets.push({ ...lerpPt({ x: 250, y: 132 }, G.tc, seg(t, 1.4, 3)), label: 'tracks', tone: TONE.cyan }); banner = { text: 'Roadside radar measures its speed & range → feeds the controller', tone: 'info', sub: '≈ 92 km/h · in the dilemma zone' }; }
          else if (t < 5) banner = { text: 'Controller holds the green a beat — the vehicle clears, not caught by the yellow', tone: 'ok' };
          else banner = { text: 'Radar-actuated detection — loops replaced, works in fog / rain / night', tone: 'ok' };
          return { layout: 'cross', infra: 'signals', ew: green ? 'green' : 'red', ns: green ? 'red' : 'green', cars, sensors, packets, banner, waves: detect };
        },
      },
      {
        id: 'camera', label: 'Camera · video', tagline: 'Classifies & flags violations',
        duration: 8,
        why: 'An AI video/thermal camera watches the approach, classifies every road user, and reads events a radar or loop cannot — like red-light running or wrong-way driving. Detections feed the controller and V2X Hub for actuation, counts and safety applications.',
        messages: ['video'],
        frame(t) {
          const ew = t < 3 ? 'green' : t < 4.2 ? 'yellow' : 'red';
          const vx = lerp(-40, 900, seg(t, 0, 8));
          const detect = t >= 3.6;
          const cars = [{ id: 'r', x: vx, y: G.ewLaneY, or: 'h', kind: 'car', label: 'RLR', alert: t >= 4.2 && t < 6.5 }];
          const sensors = [{ x: 356, y: 112, kind: 'camera', tx: 356, active: detect, label: detect ? 'violation' : '' }];
          const packets = []; let banner;
          if (t < 3.6) banner = { text: 'An AI camera watches the approach & classifies every road user', tone: 'info' };
          else if (t < 5) { packets.push({ ...lerpPt({ x: 356, y: 128 }, G.tc, seg(t, 3.6, 5)), label: 'video', tone: TONE.cyan }); banner = { text: '⚠ Camera flags a red-light violation → feeds video + detections to the system', tone: 'warn' }; }
          else banner = { text: 'Video detection: actuation, turning counts, red-light & wrong-way events', tone: 'ok' };
          return { layout: 'cross', infra: 'signals', ew, ns: ew === 'green' ? 'red' : 'green', cars, sensors, packets, banner, waves: detect };
        },
      },
    ],
  },
  {
    id: 'hubfusion', category: 'V2I', icon: '🖥️', title: 'Sensor Fusion via V2X Hub', tagline: 'LiDAR + radar + camera → one fused scene',
    duration: 9,
    why: 'A V2X Hub (an open-source roadside computing platform) collects detected objects from every sensor — radar, LiDAR and camera — and fuses them into one consistent picture of the intersection. It then generates an SDSM (Sensor Data Sharing Message, SAE J3224) for the RSU to broadcast. The payoff: even unequipped road users get a “voice” over V2X, from redundant, all-weather sensing.',
    messages: ['point cloud', 'SDSM'],
    frame(t) {
      const ex = t < 4 ? lerp(-40, 300, seg(t, 0, 4)) : (t < 5.5 ? lerp(300, 398, easeOut(seg(t, 4, 5.5))) : 398);
      const py = t < 2 ? 360 : lerp(360, 250, seg(t, 2, 7.5));
      const detect = t >= 1.5 && t < 6.6;
      const cars = [{ id: 'ego', x: ex, y: G.ewLaneY, or: 'h', kind: 'car', label: 'EGO', alert: t >= 3.4 && t < 6 }];
      const ped = { x: 470, y: py };
      const sensors = [
        { x: 250, y: 118, kind: 'radar', tx: 250, active: detect },
        { x: 470, y: 112, kind: 'lidar', tx: 470, active: detect, label: detect ? 'ped' : '' },
        { x: 356, y: 122, kind: 'camera', tx: 356, active: detect },
      ];
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'Three sensors watch the intersection — radar, LiDAR and a camera', tone: 'info' };
      else if (t < 3.4) { [[250, 'tracks'], [356, 'video'], [470, 'point cloud']].forEach(([sx, lbl]) => packets.push({ ...lerpPt({ x: sx, y: 132 }, G.hub, seg(t, 1.5, 3.4)), label: lbl, tone: TONE.cyan })); banner = { text: 'Each sensor streams its own data (tracks · video · point cloud) into the V2X Hub, which fuses them', tone: 'info' }; }
      else if (t < 6) { packets.push({ ...lerpPt(G.rsu, { x: ex, y: G.ewLaneY }, ((t - 3.4) % 1.3) / 1.3), label: 'SDSM', tone: TONE.cyan }); banner = { text: '⚠ The Hub broadcasts an SDSM (fused detections) — the car is warned of the pedestrian', tone: 'warn' }; }
      else banner = { text: 'Sensor fusion via the V2X Hub — even unequipped road users get a voice', tone: 'ok' };
      return { layout: 'straightH', infra: 'rsu', hub: true, crosswalk: 470, cars, ped, sensors, packets, banner, waves: detect };
    },
  },
  {
    id: 'wzws', category: 'V2P', icon: '🦺', title: 'Work-Zone Worker Safety', tagline: 'A road worker’s PSM warns drivers',
    duration: 9,
    why: 'A road worker in an active work zone carries a device that broadcasts a PSM. Approaching vehicles are warned to slow and move over, giving workers a protected buffer — even before the driver can see them around equipment.',
    messages: ['PSM'],
    frame(t) {
      const wx = 640;
      const ex = t < 3.4 ? lerp(-40, 300, seg(t, 0, 3.4)) : lerp(300, 900, seg(t, 3.4, 9));
      const ey = t < 4 ? G.ewLaneY : (t < 5.5 ? lerp(G.ewLaneY, 250, seg(t, 4, 5.5)) : 250);
      const warn = t >= 2.6 && t < 6;
      const cars = [{ id: 'ego', x: ex, y: ey, or: 'h', kind: 'car', label: 'EGO', alert: warn }];
      const ped = { x: wx, y: 320, broadcasting: true, alert: warn };
      const packets = []; let banner;
      if (t < 1.5) banner = { text: 'A vehicle approaches an active work zone', tone: 'info' };
      else if (t < 2.6) { packets.push({ ...lerpPt({ x: wx, y: 320 }, { x: ex, y: G.ewLaneY }, seg(t, 1.5, 2.6)), label: 'PSM', tone: TONE.amber }); banner = { text: 'A road worker’s device broadcasts a PSM', tone: 'warn' }; }
      else if (t < 6) banner = { text: '⚠ WORKER NEAR THE ROADWAY — slow down & move over', tone: 'warn' };
      else banner = { text: 'Passed the work zone safely, giving the worker room', tone: 'ok' };
      return { layout: 'straightH', infra: 'none', cars, packets, ped, hazard: { x: wx, kind: 'workzone', label: 'WORK' }, banner, waves: t >= 1.5 && t < 6 };
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

function UseCasesTab({ openGlossary, sub, navigate }) {
  const [open, setOpen] = useState({});   // all categories collapsed by default
  // scenario + variant are driven by the deep-link route ('cases/<id>/<variant>')
  const parts = (sub || '').split('/');
  const id = SCENARIOS.some((s) => s.id === parts[0]) ? parts[0] : SCENARIOS[0].id;
  const scn = SCENARIOS.find((s) => s.id === id);
  const cat = CATEGORIES.find((c) => c.id === scn.category);
  const variantId = scn.variants ? (scn.variants.some((v) => v.id === parts[1]) ? parts[1] : scn.variants[0].id) : null;
  const variant = scn.variants ? scn.variants.find((v) => v.id === variantId) : null;
  // effective scenario: base scenario with the active variant's frame/why/messages/tagline
  const eff = variant ? { ...scn, ...variant } : scn;
  const selectScn = (nid) => { const s = SCENARIOS.find((x) => x.id === nid); navigate('cases/' + nid + (s.variants ? '/' + s.variants[0].id : '')); };
  const selectVar = (vid) => navigate('cases/' + id + '/' + vid);
  // reveal a deep-linked scenario by opening its category
  useEffect(() => { if (sub) setOpen((o) => ({ ...o, [scn.category]: true })); }, [id]);   // eslint-disable-line
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
                    <button key={s.id} onClick={() => selectScn(s.id)}
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
            <Segmented value={variant.id} onChange={selectVar}
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
          <span className="text-slate-300 font-semibold">{cat.label}</span> — {cat.desc}. Tip: every scenario (and variant) is deep-linkable — the URL updates as you browse, so you can share a link straight to this animation.
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
    { term: 'Load Switch', def: 'A solid-state relay in the signal cabinet. The controller only emits low-voltage logic; the load switch takes that command and switches the actual field power (LED driver / 120 VAC) out to one signal channel. Power then runs through the cabinet terminals, underground conduit, and up the pole to the signal head — the TC never drives the LEDs directly.' },
    { term: 'Conflict Monitor (MMU)', def: 'The Malfunction Management Unit — an independent safety device in the cabinet that continuously watches the load-switch outputs. If it ever detects conflicting greens (or other faults), it overrides the controller and drops the intersection to flashing red.' },
    { term: 'Roadside Unit (RSU)', def: 'An ITS device mounted on roadside infrastructure (like a signal pole) that facilitates wireless communication between the traffic controller and nearby vehicles or pedestrians.' },
    { term: 'RSU modes (store-and-repeat / immediate-forward)', def: 'How an RSU handles a message it broadcasts. STORE-AND-REPEAT: the RSU is loaded with a STATIC message — MAP intersection geometry, or a TIM — and re-broadcasts it locally on a timer (MAP ~1 Hz) with no upstream feed; it keeps going even if the controller link drops, and nothing rides the backhaul. IMMEDIATE-FORWARD: a LIVE stream from the TC — SPaT, which changes every second — is passed straight through and re-broadcast as it arrives. So SPaT is always immediate-forward (it needs the live controller); MAP can be either — store-and-repeat when the geometry lives on the RSU, or immediate-forward when it is streamed from the TC. This is exactly the trade-off behind the “MAP stored on RSU vs TC” control.' },
    { term: 'On-Board Unit (OBU)', def: "A hardware transceiver installed inside a vehicle that receives over-the-air messages from the RSU and broadcasts the vehicle's own real-time state." },
    { term: 'ADAS', def: 'Advanced Driver-Assistance System — the in-vehicle brain that fuses incoming V2X messages with onboard sensors (radar/camera/lidar) to warn the driver or actuate braking and steering.' },
    { term: 'Vehicle', def: 'The final node containing the central ADAS/CPU processing brain that pulls data from the OBU, coordinates sensor fusion with internal vehicle metrics, and acts on safety logic.' },
    { term: 'VRU (Vulnerable Road User)', def: 'A pedestrian, cyclist, or road worker — a road user with no protective vehicle shell — whose position and presence are shared over V2X via a PSM.' },
    { term: 'V2X Hub', def: 'A roadside computing platform (the USDOT reference implementation is open-source) that sits between the field devices and the RSU. It runs application plugins that fuse sensor detections (LiDAR/radar/camera), bridge the controller’s NTCIP 1202 to SAE J2735, and generate messages — even a PSM for a pedestrian who has no device — for the RSU to broadcast. It does not transmit over the air itself or control the signal.' },
    { term: 'Roadside Sensors (LiDAR / Radar / Camera)', def: 'Infrastructure detection sensors mounted on poles/mast arms. Unlike V2X, they see UNEQUIPPED road users (no OBU or phone). LiDAR gives centimetre 3-D position day or night; radar measures speed/range in any weather and replaces inductive loops; AI cameras classify road users and read events like red-light running. Their detections feed the controller / V2X Hub, which can then speak V2X on a road user’s behalf.' },
    { term: 'Cell Tower (gNodeB / eNodeB)', def: 'The cellular base station that carries V2N (Vehicle-to-Network) traffic. A vehicle’s cellular modem reaches it over the “Uu” network air interface (4G LTE eNodeB / 5G gNodeB) — this is the mobile network, NOT the 5.9 GHz safety radio used for direct V2V/V2I. The tower backhauls over fiber/IP to the mobile core and out to the internet. Wide-area reach, but higher latency, so V2N carries information (advisories), not split-second safety.' },
    { term: 'TMC / Cloud (V2N backend)', def: 'The Traffic Management Center or cloud platform — the agency backend that connected vehicles reach over the cellular network. It aggregates probe data and feeds from many sources (511, incident/CAD systems, sensors) and publishes advisories back out as TIM messages (work zones, weather, incidents), region-wide. It reaches vehicles via the path: TMC ↔ internet ↔ cell tower ↔ vehicle (and can also feed RSUs/hubs over the backhaul).' },
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
    { term: 'Cellular Uu (V2N)', def: 'The “Uu” interface is the normal cellular network link between a device and a base station — as opposed to PC5, which is the direct device-to-device sidelink. V2N uses Uu: the vehicle talks through a cell tower (eNodeB/gNodeB) to the mobile core and the cloud/TMC. It reaches far beyond line of sight but has higher, variable latency, so it carries advisories (TIM) and probe data, not split-second safety warnings.',
      format: `V2N over cellular — the Uu path
Vehicle (cellular modem)
  └─ Uu air interface (4G LTE / 5G NR)
       └─ Cell tower (eNodeB / gNodeB)
            └─ Mobile core (EPC / 5GC)
                 └─ Internet / IP backhaul
                      └─ TMC / Cloud (application server)
Downlink: TIM advisories · Uplink: BSM/probe data
Contrast: PC5 sidelink = direct, no tower (V2V/V2I).` },
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
    { term: 'SRM / SSM', child: 'SAE J2735', def: 'Signal Request Message (a vehicle asking for priority/preemption) and Signal Status Message (the controller’s response). Any OBU can technically transmit an SRM, but the controller only GRANTS it based on the RequestorDescription role plus SCMS credentials: emergency vehicles get preemption (interrupt the cycle), transit buses (and sometimes freight) get priority (extend green / trim red), and ordinary passenger cars are not authorized — their request is ignored.',
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
    { term: 'SDSM (Sensor Data Sharing Message)', child: 'SAE J3224', def: 'The message that lets infrastructure (or a vehicle) share OBJECTS it has DETECTED with its sensors — LiDAR, radar, cameras. A V2X Hub fuses roadside sensor detections and broadcasts an SDSM so connected vehicles learn about road users those vehicles can’t see themselves, including UNEQUIPPED pedestrians and cars with no OBU. Distinct from a BSM (a vehicle describing ITSELF) — an SDSM describes OTHERS the sensor sees. The raw sensor→hub feed is a proprietary detected-object list, not this over-the-air message.',
      format: `SensorDataSharingMessage — representative (SAE J3224)
SensorDataSharingMessage ::= SEQUENCE {
  msgCnt, sourceID,
  equipmentType (rsu / obu / vru),
  sDSMTimeStamp,
  refPos      Position3D,          -- sensor reference point
  objects     DetectedObjectList { -- 1..255
    objectID, type (vehicle/vru/obstacle),
    position (offset from refPos), speed, heading,
    accuracy, classification confidence
  }
}
Carried in an IEEE 1609.2 signed frame, like other V2X msgs.
— Representative; © SAE J3224, paywalled.` },
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
  // Links point to authoritative homepages (stable), not deep paths that rot.
  // The exact standards text (SAE J2735, NTCIP 1202) is copyrighted/paywalled —
  // these are where to obtain or read about it, consistent with the app's
  // "representative, not verbatim" stance on those message layouts.
  { group: 'References & Further Reading', icon: '🔗', items: [
    { term: 'USDOT ITS JPO', def: 'The U.S. DOT Intelligent Transportation Systems Joint Program Office — connected-vehicle research, deployment guidance and the CV Pilot program. A good starting point for V2X in the U.S.',
      links: [{ label: 'its.dot.gov', url: 'https://www.its.dot.gov/' }] },
    { term: 'SAE J2735 (message set)', def: 'SAE International’s DSRC Message Set Dictionary — the authoritative definition of BSM, SPaT, MAP, SRM/SSM, TIM and PSM. The standard itself is paywalled; search “J2735” on the SAE site.',
      links: [{ label: 'sae.org — standards', url: 'https://www.sae.org/standards/' }] },
    { term: 'IEEE 1609 (WAVE & security)', def: 'The IEEE 1609 family defines the WAVE protocol stack; 1609.2 specifies the message security (certificates, ECDSA signing) that underpins trust in every V2X frame.',
      links: [{ label: 'standards.ieee.org', url: 'https://standards.ieee.org/' }] },
    { term: 'NTCIP 1202 (signal controllers)', def: 'The NTCIP object definitions for actuated signal controllers — how the cabinet stores and streams phase & timing data. Published jointly by NEMA, AASHTO and ITE.',
      links: [{ label: 'ntcip.org', url: 'https://www.ntcip.org/' }] },
    { term: 'FHWA — signals & CV', def: 'U.S. Federal Highway Administration resources on traffic-signal operations and connected-vehicle applications at intersections.',
      links: [{ label: 'highways.dot.gov', url: 'https://highways.dot.gov/' }] },
    { term: 'NHTSA — V2X safety', def: 'The U.S. National Highway Traffic Safety Administration’s work on vehicle-to-everything communications and their crash-avoidance safety benefits.',
      links: [{ label: 'nhtsa.gov', url: 'https://www.nhtsa.gov/' }] },
  ]},
];

function findGlossaryItem(term) { for (const g of GLOSSARY) { const it = g.items.find((i) => i.term === term); if (it) return it; } return null; }
function GlossaryTab({ sub, navigate }) {
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState(() => GLOSSARY.map((g) => g.group));
  const [selected, setSelected] = useState(() => (sub && findGlossaryItem(decodeURIComponent(sub))) || GLOSSARY[0].items[0]);
  const [view, setView] = useState('def');   // 'def' | 'format'
  useEffect(() => { setView('def'); }, [selected]);   // reset toggle when the term changes
  // follow deep links / cross-links from other tabs ('glossary/<term>')
  useEffect(() => {
    if (!sub) return;
    const it = findGlossaryItem(decodeURIComponent(sub));
    if (it) { setSelected(it); setQ(''); }
  }, [sub]);
  const choose = (it) => { setSelected(it); if (navigate) navigate('glossary/' + encodeURIComponent(it.term)); };
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
                      <button key={it.term} onClick={() => choose(it)}
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

            {selected.links && (
              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Sources &amp; further reading</div>
                <ul className="space-y-1.5">
                  {selected.links.map((l) => (
                    <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-neon-cyan hover:underline">{l.label} ↗</a></li>
                  ))}
                </ul>
              </div>
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
   5b. DEVICE ANATOMY — annotated cutaways of the real hardware.
       Flagship: a traffic-controller cabinet you wire up (Controller →
       Load Switch → Field terminal → conduit up the pole → signal head).
===================================================================== */

// Clickable, annotated blocks inside the cabinet (front view).
const CAB_PARTS = [
  { id: 'power', x: 52, y: 56, w: 300, h: 40, name: 'Main Panel & Power Supply', blurb: 'Brings in AC service with a main breaker and surge/transient protection, and powers the whole cabinet. Field power for the signals is switched downstream by the load switches — not here.' },
  { id: 'mmu', x: 52, y: 104, w: 300, h: 40, name: 'Conflict Monitor (MMU / CMU)', blurb: 'An independent safety watchdog. It constantly checks the load-switch outputs for conflicting greens or other faults; if it sees one it overrides the controller and drops the intersection to flashing red.' },
  { id: 'controller', x: 52, y: 156, w: 146, h: 116, name: 'Traffic Controller', blurb: 'The brain. It runs the phase & timing logic and outputs LOW-VOLTAGE logic commands — one per channel — telling each load switch when to energize red, yellow or green. It never switches field power itself.' },
  { id: 'detector', x: 52, y: 284, w: 146, h: 44, name: 'Detector Rack (BIU)', blurb: 'Houses detector cards / Bus Interface Units that bring in vehicle-detection inputs (loops, video, radar) so the controller knows who is waiting at each approach.' },
  { id: 'field', x: 52, y: 344, w: 300, h: 64, name: 'Field Terminal Facility', blurb: 'The terminal block where every field circuit lands. The switched load-switch outputs connect here and continue through underground conduit, up the pole, to the signal heads.' },
];
// Interactive terminals for the channel-2 wiring example.
const CAB_TERM = { ctrl: { x: 198, y: 214 }, lsin: { x: 214, y: 210 }, lsout: { x: 330, y: 236 }, field: { x: 214, y: 344 } };
const CAB_VALID = [['ctrl', 'lsin'], ['lsout', 'field']];
const pairKey = (a, b) => [a, b].sort().join('|');
const validCabPair = (a, b) => CAB_VALID.some((p) => pairKey(p[0], p[1]) === pairKey(a, b));

function CabinetDiagram() {
  const [selPart, setSelPart] = useState(null);
  const [wires, setWires] = useState([]);       // list of pairKeys
  const [armed, setArmed] = useState(null);      // terminal id awaiting a partner
  const [err, setErr] = useState(null);
  const [phase, setPhase] = useState(0);
  const raf = useRef(null);
  const has = (a, b) => wires.includes(pairKey(a, b));
  const energized = has('ctrl', 'lsin') && has('lsout', 'field');

  useEffect(() => {
    if (!energized) { setPhase(0); return; }
    const start = performance.now();
    const loop = (now) => { setPhase(((now - start) / 1800) % 1); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [energized]);

  const clickTerm = (id) => {
    setSelPart(null);
    if (armed == null) { setArmed(id); setErr(null); return; }
    if (armed === id) { setArmed(null); return; }
    if (validCabPair(armed, id) && !wires.includes(pairKey(armed, id))) { setWires((w) => [...w, pairKey(armed, id)]); setErr(null); }
    else if (pairKey(armed, id) === pairKey('ctrl', 'field')) setErr('The controller can’t drive the head directly — its low-voltage command must pass through a load switch first.');
    else if (!validCabPair(armed, id)) setErr('Those two terminals don’t connect. Follow the path: Controller → Load Switch in, then Load Switch out → Field terminal.');
    setArmed(null);
  };

  const sig = energized ? (phase < 0.5 ? 'green' : phase < 0.62 ? 'yellow' : 'red') : null;
  const litColor = (c) => (sig === c ? { red: '#f87171', yellow: '#fbbf24', green: '#34d399' }[c] : '#27272a');
  const glow = (c) => (sig === c ? 'glow-' + (c === 'yellow' ? 'amber' : c) : '');

  const Term = ({ id }) => { const t = CAB_TERM[id]; const wired = wires.some((w) => w.split('|').includes(id)); return (
    <circle cx={t.x} cy={t.y} r="6" className={'cursor-pointer ' + (armed === id ? 'fill-neon-amber' : wired ? 'fill-neon-green' : 'fill-zinc-900')}
      stroke={armed === id ? '#fbbf24' : '#22d3ee'} strokeWidth="2" onClick={(e) => { e.stopPropagation(); clickTerm(id); }} />
  ); };

  return (
    <div className="flex-1 min-w-0 flex">
      <div className="flex-1 min-w-0 p-4">
        <div className="h-full rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
          <svg viewBox="0 0 1000 660" className="w-full h-full" onClick={() => setSelPart(null)}>
            <defs><pattern id="agrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#1e293b" strokeWidth="1" /></pattern></defs>
            <rect width="1000" height="660" fill="url(#agrid)" />
            {/* ground + underground */}
            <rect x="0" y="600" width="1000" height="60" className="fill-zinc-900/70" />
            <line x1="0" y1="600" x2="1000" y2="600" className="stroke-zinc-700" strokeWidth="2" />
            <text x="470" y="626" className="fill-slate-500 text-[11px]">underground conduit</text>

            {/* pole + mast arm + signal head (field side) */}
            <line x1="740" y1="600" x2="740" y2="150" className="stroke-zinc-500" strokeWidth="9" strokeLinecap="round" />
            <line x1="740" y1="152" x2="600" y2="152" className="stroke-zinc-500" strokeWidth="9" strokeLinecap="round" />
            <g>
              <rect x="586" y="158" width="28" height="74" rx="6" className="fill-zinc-950 stroke-zinc-600" strokeWidth="2" />
              <circle cx="600" cy="176" r="8" fill={litColor('red')} className={glow('red')} />
              <circle cx="600" cy="196" r="8" fill={litColor('yellow')} className={glow('yellow')} />
              <circle cx="600" cy="216" r="8" fill={litColor('green')} className={glow('green')} />
            </g>
            <text x="760" y="150" className="fill-slate-500 text-[11px]">pole / mast arm → signal head</text>

            {/* conduit run: field terminal → down → underground → up pole → mast arm → head */}
            <path d="M214 408 V600 H740 V152" fill="none" stroke={energized ? '#34d399' : '#3f3f46'} strokeWidth="3.5"
              strokeDasharray={energized ? '7 7' : '0'} className={energized ? 'dashflow glow-green' : ''} />

            {/* ---------- cabinet ---------- */}
            <text x="52" y="34" className="fill-slate-200 text-[13px] font-semibold">Traffic Controller Cabinet (NEMA)</text>
            <rect x="40" y="42" width="330" height="540" rx="8" className="fill-zinc-900 stroke-zinc-600" strokeWidth="3" />
            {/* clickable component blocks */}
            {CAB_PARTS.map((p) => { const on = selPart === p.id; return (
              <g key={p.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelPart(p.id); }}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="5" className={(on ? 'stroke-neon-cyan ' : 'stroke-zinc-600 ') + (p.id === 'controller' ? 'fill-emerald-500/10' : 'fill-zinc-800')} strokeWidth={on ? 2.5 : 1.5} />
                <text x={p.x + 8} y={p.y + p.h / 2 + 4} className="fill-slate-200 text-[11px] font-medium">{p.name}</text>
              </g>
            ); })}
            {/* load switch bay */}
            <text x="216" y="150" className="fill-slate-400 text-[10px]">Load Switch Bay</text>
            {[0, 1, 2].map((i) => { const y = 156 + i * 40; const active = i === 1; return (
              <g key={i}>
                <rect x={212} y={y} width={140} height={34} rx="4" className={(active ? 'stroke-neon-cyan fill-amber-500/10' : 'stroke-zinc-600 fill-zinc-800')} strokeWidth={active ? 2 : 1.2} onClick={(e) => { e.stopPropagation(); setSelPart('ls'); }} style={{ cursor: 'pointer' }} />
                <text x={220} y={y + 21} className="fill-slate-200 text-[10px] font-medium">Load Switch {i + 1}{active ? ' · CH2' : ''}</text>
              </g>
            ); })}

            {/* wires the user draws */}
            {wires.map((k) => { const [a, b] = k.split('|'); const A = CAB_TERM[a], B = CAB_TERM[b]; return (
              <line key={k} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={energized ? '#34d399' : '#22d3ee'} strokeWidth="3" className="glow-cyan" />
            ); })}
            {/* live wire preview from the armed terminal */}
            {armed && <circle cx={CAB_TERM[armed].x} cy={CAB_TERM[armed].y} r="11" fill="none" stroke="#fbbf24" strokeWidth="1.5" className="halo" />}
            {/* interactive terminals + labels */}
            <text x={CAB_TERM.ctrl.x - 6} y={CAB_TERM.ctrl.y - 10} textAnchor="end" className="fill-slate-400 text-[9px]">CH2 out</text>
            <text x={CAB_TERM.lsin.x + 10} y={CAB_TERM.lsin.y - 6} className="fill-slate-400 text-[9px]">in</text>
            <text x={CAB_TERM.lsout.x + 10} y={CAB_TERM.lsout.y + 4} className="fill-slate-400 text-[9px]">out</text>
            <text x={CAB_TERM.field.x + 10} y={CAB_TERM.field.y - 6} className="fill-slate-400 text-[9px]">CH2 field</text>
            <Term id="ctrl" /><Term id="lsin" /><Term id="lsout" /><Term id="field" />
          </svg>
        </div>
      </div>

      {/* right info / wiring panel */}
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto">
        {selPart ? (() => { const p = selPart === 'ls' ? { name: 'Load Switch', blurb: 'A solid-state relay. It takes the controller’s low-voltage command for one channel and switches the actual field power (LED driver / line voltage) out to that signal’s red, yellow and green circuits. One load switch per channel.' } : CAB_PARTS.find((x) => x.id === selPart); return (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neon-cyan mb-1">Component</div>
            <h3 className="text-base font-bold text-slate-100">{p.name}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{p.blurb}</p>
            <button onClick={() => setSelPart(null)} className="mt-4 text-[12px] text-neon-cyan hover:underline">← Back to wiring</button>
          </div>
        ); })() : (
          <div>
            <div className="flex items-center gap-2 mb-1"><span className="text-lg">🗄️</span><h3 className="text-sm font-semibold text-slate-100">Wire the signal path</h3></div>
            <p className="text-[12px] text-slate-400 leading-relaxed">Click a <span className="text-neon-cyan">◦ terminal</span>, then a valid partner, to lay a wire. Click any labeled block to learn what it does.</p>
            <div className="mt-3 space-y-2">
              {[{ ok: has('ctrl', 'lsin'), t: '1 · Controller CH2 out → Load Switch in' }, { ok: has('lsout', 'field'), t: '2 · Load Switch out → Field terminal' }].map((s) => (
                <div key={s.t} className={'flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ' + (s.ok ? 'border-emerald-700/60 bg-emerald-500/10 text-emerald-200' : 'border-zinc-700 bg-zinc-900/60 text-slate-300')}>
                  <span>{s.ok ? '✔' : '○'}</span><span>{s.t}</span>
                </div>
              ))}
            </div>
            {err && <div className="mt-3 rounded-lg border border-red-700/60 bg-red-500/10 p-2.5 text-[12px] text-red-200">⚠ {err}</div>}
            <div className={'mt-3 rounded-lg border p-3 text-[12px] ' + (energized ? 'border-emerald-600/60 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 bg-zinc-900/50 text-slate-400')}>
              {energized ? '✔ Signal head energized. The controller’s command now runs through the load switch, out the field terminals, into underground conduit, up the pole and along the mast arm to the head — which cycles green → yellow → red.' : 'Head is dark — complete both wires to energize it. Notice the controller never touches field power directly.'}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setWires([pairKey('ctrl', 'lsin'), pairKey('lsout', 'field')]); setErr(null); setArmed(null); }} className="flex-1 rounded-lg bg-neon-cyan/20 text-neon-cyan px-3 py-2 text-[13px] font-semibold hover:bg-neon-cyan/30">Auto-wire</button>
              <button onClick={() => { setWires([]); setErr(null); setArmed(null); }} className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-[13px] text-slate-300 hover:border-zinc-500">Reset</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Annotated (non-wiring) internals of a Roadside Unit.
const RSU_PARTS = [
  { id: 'host', x: 70, y: 120, w: 150, h: 60, name: 'Host processor', blurb: 'The RSU’s computer — runs the ITS application stack, message forwarding, protocol conversion (NTCIP 1202 → SAE J2735) and the security pipeline.' },
  { id: 'cv2x', x: 240, y: 96, w: 150, h: 42, name: 'C-V2X PC5 radio', blurb: 'The 5.9 GHz cellular sidelink radio that broadcasts SPaT/MAP and receives BSM/SRM directly from vehicles — no cell tower needed.' },
  { id: 'dsrc', x: 240, y: 146, w: 150, h: 42, name: 'DSRC 802.11p radio', blurb: 'The Wi-Fi-derived 5.9 GHz radio, used where DSRC (rather than or alongside C-V2X) is deployed.' },
  { id: 'hsm', x: 70, y: 196, w: 150, h: 44, name: 'Security module (HSM)', blurb: 'A hardware secure element that signs every outgoing frame and verifies incoming ones per IEEE 1609.2, using certificates from the SCMS.' },
  { id: 'gnss', x: 240, y: 196, w: 150, h: 44, name: 'GNSS receiver', blurb: 'Provides precise time and position so broadcast geometry (MAP) and timestamps line up with reality.' },
  { id: 'eth', x: 70, y: 256, w: 320, h: 40, name: 'Ethernet / NTCIP backhaul', blurb: 'The wired link to the traffic-controller cabinet — carries NTCIP 1202 from the TC (and SPaT/MAP if the TC generates them).' },
];
function RsuDiagram() {
  const [sel, setSel] = useState(null);
  const p = sel ? RSU_PARTS.find((x) => x.id === sel) : null;
  return (
    <div className="flex-1 min-w-0 flex">
      <div className="flex-1 min-w-0 p-4">
        <div className="h-full rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
          <svg viewBox="0 0 480 360" className="w-full h-full" onClick={() => setSel(null)}>
            <text x="60" y="40" className="fill-slate-200 text-[14px] font-semibold">Roadside Unit — inside</text>
            {/* antennas */}
            <line x1="150" y1="96" x2="130" y2="56" className="stroke-neon-green" strokeWidth="2" /><circle cx="130" cy="54" r="3" className="fill-neon-green" />
            <line x1="330" y1="96" x2="350" y2="56" className="stroke-neon-green" strokeWidth="2" /><circle cx="350" cy="54" r="3" className="fill-neon-green" />
            <text x="120" y="48" className="fill-slate-500 text-[10px]">antennas</text>
            <rect x="52" y="64" width="376" height="248" rx="10" className="fill-zinc-900 stroke-neon-green" strokeWidth="2" />
            {RSU_PARTS.map((r) => { const on = sel === r.id; return (
              <g key={r.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSel(r.id); }}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="5" className={(on ? 'stroke-neon-cyan ' : 'stroke-zinc-600 ') + 'fill-zinc-800'} strokeWidth={on ? 2.5 : 1.4} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 4} textAnchor="middle" className="fill-slate-200 text-[10px] font-medium">{r.name}</text>
              </g>
            ); })}
          </svg>
        </div>
      </div>
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto">
        {p ? (
          <div><div className="text-[10px] uppercase tracking-widest text-neon-cyan mb-1">Component</div><h3 className="text-base font-bold text-slate-100">{p.name}</h3><p className="mt-2 text-[13px] leading-relaxed text-slate-300">{p.blurb}</p></div>
        ) : <div className="text-sm text-slate-500">Click any block inside the RSU to see what it does.</div>}
      </div>
    </div>
  );
}

// Annotated (non-wiring) internals of an On-Board Unit — the vehicle's V2X brain.
const OBU_PARTS = [
  { id: 'ant', x: 70, y: 118, w: 150, h: 42, name: 'V2X antenna (5.9 GHz)', blurb: 'Usually roof- or mirror-mounted. Feeds the C-V2X / DSRC radio so the vehicle can broadcast its BSM and hear SPaT, MAP, TIM and PSM from the RSU and nearby vehicles.' },
  { id: 'radio', x: 240, y: 96, w: 150, h: 42, name: 'C-V2X / DSRC radio', blurb: 'The 5.9 GHz modem — the OBU’s link to the outside world. Broadcasts the Basic Safety Message ~10×/second and continuously receives everything in range.' },
  { id: 'gnss', x: 240, y: 146, w: 150, h: 42, name: 'GNSS receiver', blurb: 'High-precision position and time. Every BSM is stamped with where/when the vehicle is, and it lets the ADAS place received vehicles correctly on the map.' },
  { id: 'hsm', x: 70, y: 196, w: 150, h: 44, name: 'Security module (HSM)', blurb: 'Signs every outgoing BSM and verifies incoming frames per IEEE 1609.2 using short-lived SCMS pseudonym certificates — trust without revealing the driver’s identity.' },
  { id: 'cpu', x: 240, y: 196, w: 150, h: 44, name: 'Processor / ADAS', blurb: 'Fuses received V2X messages with onboard radar/camera/lidar, runs the safety apps (FCW, EEBL, IMA, GLOSA…) and decides when to warn the driver or actuate the brakes.' },
  { id: 'can', x: 70, y: 256, w: 320, h: 40, name: 'Vehicle bus (CAN) interface', blurb: 'Ties into the in-vehicle network: reads speed / brake / steering state to build the BSM, and pushes warnings or braking commands back out to the vehicle.' },
];
function ObuDiagram() {
  const [sel, setSel] = useState(null);
  const p = sel ? OBU_PARTS.find((x) => x.id === sel) : null;
  return (
    <div className="flex-1 min-w-0 flex">
      <div className="flex-1 min-w-0 p-4">
        <div className="h-full rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
          <svg viewBox="0 0 480 360" className="w-full h-full" onClick={() => setSel(null)}>
            <text x="60" y="40" className="fill-slate-200 text-[14px] font-semibold">On-Board Unit — inside the vehicle</text>
            {/* roof antenna */}
            <line x1="150" y1="96" x2="140" y2="52" className="stroke-neon-cyan" strokeWidth="2" /><circle cx="140" cy="50" r="3" className="fill-neon-cyan" />
            <text x="120" y="44" className="fill-slate-500 text-[10px]">roof antenna</text>
            <rect x="52" y="64" width="376" height="248" rx="10" className="fill-zinc-900 stroke-neon-cyan" strokeWidth="2" />
            {OBU_PARTS.map((r) => { const on = sel === r.id; return (
              <g key={r.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSel(r.id); }}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="5" className={(on ? 'stroke-neon-cyan ' : 'stroke-zinc-600 ') + 'fill-zinc-800'} strokeWidth={on ? 2.5 : 1.4} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 4} textAnchor="middle" className="fill-slate-200 text-[10px] font-medium">{r.name}</text>
              </g>
            ); })}
          </svg>
        </div>
      </div>
      <div className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-950/60 p-4 overflow-auto">
        {p ? (
          <div><div className="text-[10px] uppercase tracking-widest text-neon-cyan mb-1">Component</div><h3 className="text-base font-bold text-slate-100">{p.name}</h3><p className="mt-2 text-[13px] leading-relaxed text-slate-300">{p.blurb}</p></div>
        ) : <div className="text-sm text-slate-500">Click any block inside the OBU to see what it does. The OBU is the vehicle end of the same link the RSU serves from the roadside.</div>}
      </div>
    </div>
  );
}

function AnatomyTab({ sub, navigate }) {
  const DEVICES = [
    { id: 'cabinet', icon: '🗄️', name: 'Traffic Controller Cabinet', sub: 'Wire it up · Controller → Load Switch → head' },
    { id: 'rsu', icon: '📡', name: 'Roadside Unit (RSU)', sub: 'Annotated internals' },
    { id: 'obu', icon: '🚗', name: 'On-Board Unit (OBU)', sub: 'Annotated internals · the vehicle end' },
  ];
  const device = DEVICES.some((d) => d.id === sub) ? sub : 'cabinet';
  const setDevice = (id) => navigate('anatomy/' + id);
  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950/60 p-3 overflow-auto">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1 px-1">Device Anatomy</h2>
        <p className="text-[11px] text-slate-500 mb-3 px-1">Cutaways of the real hardware. Pick a device, click parts to learn them.</p>
        {DEVICES.map((d) => (
          <button key={d.id} onClick={() => setDevice(d.id)}
            className={'w-full mb-2 rounded-xl border p-3 text-left transition ' + (device === d.id ? 'border-neon-cyan bg-neon-cyan/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600')}>
            <div className="flex items-center gap-2"><span className="text-lg">{d.icon}</span><span className="text-[13px] font-semibold text-slate-100">{d.name}</span></div>
            <div className="mt-1 text-[11px] text-slate-400">{d.sub}</div>
          </button>
        ))}
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-[11px] text-slate-400 leading-relaxed">The RSU (roadside) and OBU (vehicle) are the two ends of the same over-the-air link — compare their internals side by side.</div>
      </div>
      {device === 'cabinet' ? <CabinetDiagram /> : device === 'rsu' ? <RsuDiagram /> : <ObuDiagram />}
    </div>
  );
}

/* =====================================================================
   5c. TEST YOUR KNOWLEDGE — a gamified quiz over everything.
===================================================================== */
const QUIZ = [
  { q: 'A connected car needs the current colour and countdown of the light ahead to avoid running the red. Which message carries that?', options: ['SPaT', 'MAP', 'BSM', 'PSM'], answer: 0, explain: 'SPaT (Signal Phase and Timing) broadcasts each signal group’s current state and time-to-change.' },
  { q: 'To know exactly where the stop bar and lane centerlines are, a vehicle needs…', options: ['MAP', 'SPaT', 'TIM', 'SSM'], answer: 0, explain: 'MAP carries the centimetre-accurate intersection geometry — lanes, allowed maneuvers and the stop bar.' },
  { q: 'An ambulance needs the signal to turn green immediately. What does its OBU send?', options: ['SRM', 'BSM', 'SPaT', 'TIM'], answer: 0, explain: 'A Signal Request Message asks the controller for priority/preemption; an emergency role is granted preemption.' },
  { q: 'A pedestrian’s phone announces their presence to nearby vehicles using…', options: ['PSM', 'BSM', 'MAP', 'SSM'], answer: 0, explain: 'The Personal Safety Message is broadcast by/for vulnerable road users.' },
  { q: 'An OBU drops an incoming frame because it can’t verify the signature. Which standard is being enforced?', options: ['IEEE 1609.2', 'NTCIP 1202', 'IEEE 802.3', 'SAE J2735'], answer: 0, explain: 'IEEE 1609.2 requires every over-the-air frame to be signed; unverifiable frames are rejected as possible spoofing.' },
  { q: 'A Classic (NTCIP-only) controller’s data reaches the vehicle as undecodable bytes. What was skipped at the RSU?', options: ['Protocol conversion (NTCIP 1202 → SAE J2735)', 'Security signing', 'MAP broadcast', 'A GNSS fix'], answer: 0, explain: 'A legacy TC emits NTCIP 1202; the RSU must convert it to standardized SAE J2735 before broadcast.' },
  { q: 'A vehicle broadcasts its position, speed, heading and brake status ~10× per second. That is a…', options: ['BSM', 'SPaT', 'SRM', 'TIM'], answer: 0, explain: 'The Basic Safety Message is the high-rate vehicle-state broadcast that underpins most V2V safety apps.' },
  { q: 'A late transit bus wants to EXTEND the green without interrupting the cycle. This is called…', options: ['Signal priority', 'Signal preemption', 'Actuated detection', 'GLOSA'], answer: 0, explain: 'Priority softly extends green (transit/freight). Preemption interrupts the cycle and is for emergency vehicles.' },
  { q: 'Which vehicle is NOT authorized to be granted a signal-priority SRM?', options: ['Passenger car', 'Transit bus', 'Fire truck', 'Ambulance'], answer: 0, explain: 'A passenger car has no authorized priority role — its request is ignored. Transit gets priority; emergency gets preemption.' },
  { q: 'Storing the MAP locally on the RSU (instead of the TC) mainly improves…', options: ['Backhaul load & resilience', 'Message security', 'GNSS accuracy', 'The number of lanes'], answer: 0, explain: 'Static geometry broadcast locally cuts constant traffic on the cabinet wire and keeps working if the TC link drops.' },
  { q: 'Inside the cabinet, which component actually switches field power to the signal head’s R/Y/G?', options: ['Load switch', 'Conflict monitor', 'Detector rack', 'The controller'], answer: 0, explain: 'The load switch (a solid-state relay) switches field power on the controller’s low-voltage command — the controller never drives the LEDs directly.' },
  { q: 'Which cabinet device drops the intersection to flashing red if it detects conflicting greens?', options: ['Conflict monitor (MMU)', 'Load switch', 'BIU', 'Flasher'], answer: 0, explain: 'The Malfunction Management Unit is the independent watchdog over the load-switch outputs.' },
  { q: 'A work-zone advisory is delivered to vehicles over the cellular network from a TMC. Which message?', options: ['TIM', 'BSM', 'SPaT', 'PSM'], answer: 0, explain: 'The Traveler Information Message carries work-zone, speed, weather and incident advisories.' },
  { q: 'GLOSA advises the driver of the ideal speed to…', options: ['Arrive as the light turns green (no stop)', 'Avoid a pedestrian', 'Detect a curve', 'Sign the message'], answer: 0, explain: 'Green Light Optimal Speed Advisory uses SPaT to smooth arrivals, cutting stops, idling and fuel.' },
];

function QuizTab() {
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const [order, setOrder] = useState(() => shuffle(QUIZ.map((_, i) => i)));
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const total = QUIZ.length;
  const q = QUIZ[order[idx]];
  const answered = sel !== null;
  const restart = () => { setOrder(shuffle(QUIZ.map((_, i) => i))); setIdx(0); setSel(null); setScore(0); setDone(false); };
  const choose = (i) => { if (answered) return; setSel(i); if (i === q.answer) setScore((s) => s + 1); };
  const next = () => { if (idx + 1 >= total) setDone(true); else { setIdx(idx + 1); setSel(null); } };

  if (done) {
    const pct = Math.round((score / total) * 100);
    const msg = pct >= 85 ? 'V2X pro! 🏆' : pct >= 60 ? 'Solid understanding 👍' : 'Keep exploring the tabs and try again.';
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/60 p-8 text-center">
          <div className="text-[11px] uppercase tracking-widest text-neon-cyan">Results</div>
          <div className="mt-3 text-5xl font-black text-slate-100">{score}<span className="text-slate-500 text-2xl"> / {total}</span></div>
          <div className="mt-1 text-lg font-semibold" style={{ color: pct >= 85 ? '#34d399' : pct >= 60 ? '#22d3ee' : '#fbbf24' }}>{pct}%</div>
          <p className="mt-3 text-[14px] text-slate-300">{msg}</p>
          <button onClick={restart} className="mt-6 w-full rounded-lg bg-neon-cyan px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:brightness-110 glow-cyan">↺ Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between text-[12px] mb-2">
          <span className="text-slate-400">Question <span className="text-slate-100 font-semibold">{idx + 1}</span> / {total}</span>
          <span className="rounded-md bg-zinc-900 border border-zinc-700 px-2 py-0.5 font-mono text-neon-green">Score {score}</span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-4"><div className="h-full bg-neon-cyan transition-all" style={{ width: ((idx + (answered ? 1 : 0)) / total) * 100 + '%' }} /></div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6">
          <h3 className="text-[17px] font-semibold text-slate-100 leading-snug">{q.q}</h3>
          <div className="mt-4 space-y-2">
            {q.options.map((o, i) => {
              const correct = i === q.answer;
              const cls = !answered ? 'border-zinc-700 bg-zinc-900/60 hover:border-neon-cyan/60 text-slate-200'
                : correct ? 'border-emerald-600 bg-emerald-500/15 text-emerald-100'
                  : i === sel ? 'border-red-600 bg-red-500/15 text-red-100' : 'border-zinc-800 bg-zinc-900/40 text-slate-500';
              return (
                <button key={i} onClick={() => choose(i)} disabled={answered}
                  className={'w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-[14px] transition ' + cls}>
                  <span>{o}</span>
                  {answered && (correct ? <span className="text-emerald-300">✔</span> : i === sel ? <span className="text-red-300">✗</span> : null)}
                </button>
              );
            })}
          </div>
          {answered && (
            <div className="mt-4">
              <div className={'rounded-lg border p-3 text-[13px] ' + (sel === q.answer ? 'border-emerald-700/60 bg-emerald-500/10 text-emerald-200' : 'border-amber-700/60 bg-amber-500/10 text-amber-200')}>
                <span className="font-semibold">{sel === q.answer ? 'Correct. ' : 'Not quite. '}</span>{q.explain}
              </div>
              <button onClick={next} className="mt-3 w-full rounded-lg bg-neon-cyan px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:brightness-110 glow-cyan">{idx + 1 >= total ? 'See results →' : 'Next question →'}</button>
            </div>
          )}
        </div>
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
  { id: 'quiz', label: 'Test Your Knowledge', icon: '🎯' },
  { id: 'anatomy', label: 'Device Anatomy', icon: '🔩' },
  { id: 'glossary', label: 'V2X Definitions Glossary', icon: '📖' },
];

// A one-time orientation shown on the first visit (dismissible; re-openable via
// the "?" in the header). Stored in localStorage so it appears only once.
const INTRO_STEPS = [
  { icon: '🛠️', title: 'World Builder', body: 'Drag devices onto the canvas, wire them port-to-port, pick real vendor models, then press Simulate to watch SAE J2735 packets flow. Save, share a link, or export the world.' },
  { icon: '🎬', title: 'Use Cases', body: 'Animated V2X scenarios grouped by V2I / V2V / V2P / V2N with a scrub timeline. Related ones share a variant toggle. Every scenario is deep-linkable.' },
  { icon: '🎯', title: 'Test Your Knowledge', body: 'A shuffled, scored quiz spanning messages, roles, security and cabinet anatomy.' },
  { icon: '🔩', title: 'Device Anatomy', body: 'Wire up a real traffic-controller cabinet, and explore the RSU and OBU internals part by part.' },
  { icon: '📖', title: 'Glossary', body: 'Every term with a Definition / Format toggle showing the real wire layouts — plus sources for further reading.' },
];
function FirstRun({ onClose }) {
  const [i, setI] = useState(0);
  const step = INTRO_STEPS[i];
  const last = i === INTRO_STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[11px] uppercase tracking-widest text-neon-cyan">Welcome to V2X Sandbox</div>
        <h2 className="mt-1 text-xl font-bold text-slate-100">Build · Simulate · Learn how vehicles talk to everything</h2>
        <p className="mt-2 text-[13px] text-slate-400">A hands-on, fully-offline tool for connected-vehicle infrastructure. Five tabs — here’s the tour:</p>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <span className="text-3xl">{step.icon}</span>
          <div><div className="text-sm font-semibold text-slate-100">{step.title}</div><div className="mt-1 text-[13px] leading-relaxed text-slate-300">{step.body}</div></div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5">{INTRO_STEPS.map((_, k) => (<span key={k} className={'h-1.5 rounded-full transition-all ' + (k === i ? 'w-5 bg-neon-cyan' : 'w-1.5 bg-zinc-700')} />))}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] text-slate-400 hover:text-white">Skip</button>
            <button onClick={() => (last ? onClose() : setI(i + 1))} className="rounded-lg bg-neon-cyan px-4 py-2 text-[13px] font-semibold text-zinc-950 hover:brightness-110 glow-cyan">{last ? 'Start exploring →' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const readHash = () => (window.location.hash || '').replace(/^#/, '');
  // The route IS the URL hash (path-style, e.g. 'cases/priority/transit'). The
  // World Builder keeps its own '#world=<encoded>' share hash, which we treat as
  // the builder tab. This makes tabs, scenarios, variants, anatomy devices and
  // glossary terms all deep-linkable / shareable.
  const [route, setRoute] = useState(() => readHash() || lsGet('v2x_tab', 'builder'));
  const [showIntro, setShowIntro] = useState(() => !lsGet('v2x_seen_intro', false) && !readHash());

  const firstSeg = route.split('/')[0];
  const tabId = firstSeg.indexOf('world=') === 0 ? 'builder' : firstSeg;
  const tab = TABS.some((t) => t.id === tabId) ? tabId : 'builder';
  const sub = route.indexOf('/') < 0 ? '' : route.slice(route.indexOf('/') + 1);
  const navigate = (r) => setRoute(r);
  const setTab = (id) => setRoute(id);
  const openGlossary = (term) => setRoute('glossary/' + encodeURIComponent(term));

  // route → URL hash (replaceState so scenario clicks don't spam history) + persist tab
  useEffect(() => {
    const target = '#' + route;
    if (window.location.hash !== target) {
      try { window.history.replaceState(null, '', target); } catch (e) { window.location.hash = route; }
    }
    lsSet('v2x_tab', tab);
  }, [route, tab]);
  // respond to back/forward + manually pasted URLs
  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const closeIntro = () => { setShowIntro(false); lsSet('v2x_seen_intro', true); };

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {showIntro && <FirstRun onClose={closeIntro} />}
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚦</span>
            <div>
              <div className="text-sm font-bold text-slate-100 leading-none">V2X Sandbox</div>
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
          <button onClick={() => setShowIntro(true)} title="Show the intro tour"
            className="ml-auto shrink-0 rounded-full border border-zinc-700 h-8 w-8 text-slate-400 hover:text-white hover:border-zinc-500">?</button>
        </div>
      </header>
      <main className="flex-1 min-h-0">
        {tab === 'builder' && <WorldBuilderTab openGlossary={openGlossary} />}
        {tab === 'cases' && <UseCasesTab openGlossary={openGlossary} sub={sub} navigate={navigate} />}
        {tab === 'quiz' && <QuizTab />}
        {tab === 'anatomy' && <AnatomyTab sub={sub} navigate={navigate} />}
        {tab === 'glossary' && <GlossaryTab sub={sub} navigate={navigate} />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

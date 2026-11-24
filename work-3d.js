/* Work page, Featured: real 3D objects on a turntable.
   One WebGL canvas is shared: when a slide that has a model (data-model on its .page) settles on screen, the canvas moves into that slide's
   tile and takes the illustration's place; it turns slowly on its own and can be dragged round (with a little momentum).
   Swipes anywhere else on the slide still change projects. Everything is built from primitives here, so nothing heavy is downloaded. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const still = matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('has-3d');   // from here on the illustrations step aside on slides with a model (removed again if WebGL isn't available)

/* ── materials: the set's finish ── */
const M = {
  paint:  new THREE.MeshPhysicalMaterial({ color: 0xe9dcc2, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.14, metalness: 1, envMapIntensity: 1.8 }),
  satin:  new THREE.MeshStandardMaterial({ color: 0xc9cdd3, roughness: 0.3, metalness: 1, envMapIntensity: 1.6 }),
  cream:  new THREE.MeshPhysicalMaterial({ color: 0xf3ead8, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  glassClear: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false }),
  drink:  new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.98, ior: 1.05, thickness: 0.15, attenuationColor: new THREE.Color(0xfdf5d6), attenuationDistance: 8.0, roughness: 0.0, envMapIntensity: 0.3, side: THREE.DoubleSide }),
  olive:  new THREE.MeshPhysicalMaterial({ color: 0x8c9a2a, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 }),
  grille: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7, metalness: 0.3 }),
  glass:  new THREE.MeshPhysicalMaterial({ color: 0x10151b, roughness: 0.04, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.85, metalness: 0 }),
  dark:   new THREE.MeshStandardMaterial({ color: 0x202023, roughness: 0.55, metalness: 0.2 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xff7a3d, emissive: 0xff5a1a, emissiveIntensity: 0.45, roughness: 0.3 }),
  lamp:   new THREE.MeshPhysicalMaterial({ color: 0xf4f7fb, emissive: 0xdfe8ff, emissiveIntensity: 0.25, roughness: 0.05, metalness: 0.1, clearcoat: 1 }),
};

const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };


/* ── Fleeting: a Freightliner Cascadia-style sleeper tractor. The whole body is modelled in Blender (images/work/fleeting-cab.glb):
   one skin lofted through cross-sections with the wheel wells built in, the raked nose with its black grille and drooping bars,
   swept LED headlights, wraparound bumper, glass, hood vents and seams, side skirts with steps, mirrors, roof markers and cab extenders.
   Built here: the wheels and the chassis behind the cab (rails, deck plate, fifth wheel, tandem axles, mud flaps) ── */
function buildTruck() {
  const truck = new THREE.Group();
  const paint = M.paint.clone(); paint.color.set(0xeef0f2); paint.roughness = 0.24; paint.clearcoatRoughness = 0.06;   // white, glossy
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const bars = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.3, metalness: 0.6 });
  const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe9f1ff, emissiveIntensity: 0.9, roughness: 0.2 });

  // the body arrives a moment after the rest; Blender's material names map onto the set's materials by prefix
  CAB.then(scene => { if (!scene) return; const body = scene.clone(true);
    const byName = { paint, glass: M.glass, black, bars, led, chrome: M.chrome, amber: M.orange, matte: M.dark };
    body.traverse(o => { if (o.isMesh) { const k = Object.keys(byName).find(n => (o.material.name || '').startsWith(n)); if (k) o.material = byName[k]; o.castShadow = true; o.receiveShadow = true; } });
    truck.add(body); });

  // chassis: rails the full length, deck plate behind the cab, fifth wheel between the drive axles, rear bar and mud flaps
  for (const sx of [-1, 1]) truck.add(mesh(new THREE.BoxGeometry(0.16, 0.24, 6.8), M.dark, sx * 0.45, 0.68, -1.9));
  truck.add(mesh(new RoundedBoxGeometry(1.7, 0.05, 0.42, 2, 0.02), M.satin, 0, 0.98, -3.62));
  truck.add(mesh(new THREE.BoxGeometry(0.9, 0.16, 0.8), M.dark, 0, 0.88, -4.15));
  truck.add(mesh(new RoundedBoxGeometry(1.25, 0.08, 1.1, 3, 0.03), M.dark, 0, 1.0, -4.15));
  truck.add(mesh(new THREE.BoxGeometry(0.16, 0.02, 0.5), M.rubber, 0, 1.045, -4.45));
  for (const sx of [-1, 1]) for (const az of [-3.55, -4.75]) truck.add(mesh(new RoundedBoxGeometry(0.62, 0.04, 0.72, 2, 0.02), M.dark, sx * 1.0, 1.06, az));
  truck.add(mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), M.dark, 0, 0.78, -5.3));
  for (const sx of [-1, 1]) { truck.add(mesh(new THREE.BoxGeometry(0.62, 0.55, 0.02), M.rubber, sx * 1.0, 0.47, -5.32)); truck.add(mesh(new RoundedBoxGeometry(0.16, 0.06, 0.04, 2, 0.02), M.orange, sx * 1.22, 0.78, -5.34)); }

  // wheels: tyre, polished alloy rim, hub
  const wheel = (x, z, dual) => {
    const g = new THREE.Group();
    const w = dual ? 0.56 : 0.32, side = Math.sign(x);
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, w, 44).rotateZ(Math.PI / 2), M.rubber));
    g.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 40).rotateZ(Math.PI / 2), M.chrome, side * (w / 2 + 0.005), 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 40).rotateY(Math.PI / 2), M.satin, side * (w / 2 + 0.02), 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 24).rotateZ(Math.PI / 2), M.chrome, side * (w / 2 + 0.05), 0, 0));
    g.position.set(x, 0.5, z); return g;
  };
  for (const sx of [-1, 1]) { truck.add(wheel(sx * 1.06, 0.92, false)); truck.add(wheel(sx * 1.0, -3.55, true)); truck.add(wheel(sx * 1.0, -4.75, true)); }

  truck.position.z = 1.65;                                 // centre the tractor's length (bumper at 2.02 to mud flaps at -5.32) on the turntable
  const yawed = new THREE.Group(); yawed.add(truck);
  yawed.userData.frame = { radius: 3.95, lookY: 1.75 };   // framed a little closer than the other objects, so the truck reads larger
  return yawed;
}

/* ── K Health: a bedside patient monitor — a slim warm-white housing with crisp edges and two front-to-back handles on top, a big screen
   of live readings (two green ECG leads, the cyan SpO₂ pleth, the yellow respiration trace, swept across the screen like a real monitor;
   HR, NIBP, SpO₂, RR and temperature boxed down the right), a pale control strip below with oval keys (alarm silence in yellow) and a
   large trim knob, connector ports down the right side ── */
function buildMonitor() {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xeeede8, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const panel = new THREE.MeshPhysicalMaterial({ color: 0xd9dde2, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const keyMat = new THREE.MeshPhysicalMaterial({ color: 0xc7ced8, roughness: 0.35, clearcoat: 0.8 });
  const keyYellow = new THREE.MeshPhysicalMaterial({ color: 0xf2d35c, roughness: 0.35, clearcoat: 0.8 });

  // ── the screen: redrawn as the turntable runs (a sweep line wipes and redraws the traces; the heart rhythm varies beat to beat,
  //    so the traces never simply repeat; the numbers refresh every couple of seconds and a heart flashes with each beat)
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 720; const x = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // the display only glows (it reflects nothing, so its black stays black); a faint glass over it keeps a little gloss
  const screen = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0, envMapIntensity: 0, emissive: 0xffffff, emissiveIntensity: 0.95, emissiveMap: tex });
  const screenGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.06, clearcoat: 1, envMapIntensity: 0.7, depthWrite: false });
  const X0 = 16, X1 = 650, SPAN = X1 - X0, SPEED = 160, GAP = 18;            // px of trace per second, like a 25 mm/s sweep
  const beats = [0];                                                          // beat start times (s), about 60 bpm with natural variation
  const beatAt = T => { while (beats[beats.length - 1] <= T + 1) beats.push(beats[beats.length - 1] + 1.0 * (1 + (Math.random() - 0.5) * 0.08));
    let i = beats.length - 2; while (i > 0 && beats[i] > T) i--; if (beats.length > 40) { beats.splice(0, 10); i -= 10; } return [beats[Math.max(i, 0)], beats[Math.max(i, 0) + 1]]; };
  const ecg = p => p < .1 ? 0 : p < .18 ? 9 * Math.sin((p - .1) / .08 * Math.PI) : p < .26 ? 0 : p < .29 ? -10 * (p - .26) / .03 : p < .32 ? -10 + 100 * (p - .29) / .03 : p < .35 ? 90 - 118 * (p - .32) / .03 : p < .38 ? -28 + 28 * (p - .35) / .03 : p < .5 ? 0 : p < .66 ? 20 * Math.sin((p - .5) / .16 * Math.PI) : 0;
  const pleth = p => p < .16 ? 62 * Math.sin(p / .16 * Math.PI / 2) : 62 * Math.exp(-(p - .16) * 3.2) + (p > .42 && p < .58 ? 9 * Math.sin((p - .42) / .16 * Math.PI) : 0) - 6;
  const phase = T => { const [a, b] = beatAt(T); return Math.min(1, Math.max(0, (T - a) / (b - a))); };
  const signals = [['#4cf08c', 160, T => ecg(phase(T))], ['#4cf08c', 300, T => 0.75 * ecg(phase(T))],
                   ['#46d3ff', 470, T => pleth(phase(T - 0.22))], ['#ffd84a', 610, T => 34 * Math.sin(T * Math.PI * 2 / 3)]];
  let vals = { hr: 60, spo2: 98, rr: 20 }, valsAt = -1, drawnAt = -1;
  function draw(t) {
    x.fillStyle = '#010203'; x.fillRect(0, 0, 1024, 720);
    x.fillStyle = '#1b2a3a'; x.fillRect(0, 0, 1024, 34);
    x.fillStyle = 'rgba(220,230,240,.75)'; x.font = UI.replace('{s}', 18); x.textAlign = 'left'; x.fillText('BED 04   ADULT', 14, 23);
    x.textAlign = 'right'; x.fillText('09:41', 1010, 23);
    x.strokeStyle = 'rgba(255,255,255,.045)'; x.lineWidth = 1;
    for (let gx = 0; gx < 660; gx += 32) { x.beginPath(); x.moveTo(gx, 34); x.lineTo(gx, 720); x.stroke(); }
    // the traces: left of the sweep line is this pass, right of it the last one, with the erase gap ahead of the line
    const sweep = X0 + (t * SPEED) % SPAN;
    for (const [col, base, f] of signals) {
      x.strokeStyle = col; x.lineWidth = 3.5; x.shadowColor = col; x.shadowBlur = 8; x.beginPath(); let pen = false;
      for (let X = X0; X <= X1; X += 2) {
        if (X > sweep && X < sweep + GAP) { pen = false; continue; }
        const T = t - (X <= sweep ? sweep - X : sweep - X + SPAN) / SPEED, y = base - f(T);
        pen ? x.lineTo(X, y) : x.moveTo(X, y); pen = true;
      }
      x.stroke(); x.shadowBlur = 0;
    }
    // the readings refresh every couple of seconds
    const tick = Math.floor(t / 2.2);
    if (tick !== valsAt) { valsAt = tick; const rr = beats.length > 3 ? (beats[beats.length - 2] - beats[beats.length - 4]) / 2 : 1;
      vals = { hr: Math.round(60 / rr), spo2: 97 + Math.round(Math.random() * 2), rr: 19 + Math.round(Math.random() * 2) }; }
    x.strokeStyle = 'rgba(160,180,200,.35)'; x.lineWidth = 2; x.strokeRect(668, 40, 348, 674);
    for (const y of [210, 360, 500, 610]) { x.beginPath(); x.moveTo(668, y); x.lineTo(1016, y); x.stroke(); }
    const read = (label, val, col, y0, y1, size) => {
      x.fillStyle = col; x.textAlign = 'left'; x.font = UI.replace('{s}', 20); x.fillText(label, 682, y0 + 30);
      x.textAlign = 'right'; x.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`; x.fillText(val, 1004, y1 - 16);
    };
    read('HR  bpm', String(vals.hr), '#4cf08c', 40, 210, 132);
    const [b0] = beatAt(t); if (t - b0 < 0.16) { x.fillStyle = '#4cf08c'; x.font = UI.replace('{s}', 26); x.textAlign = 'left'; x.fillText('♥', 800, 72); }   // flashes with each beat
    read('NIBP  mmHg', '108/70', '#f2f4f7', 210, 360, 78); x.fillStyle = '#c9d0d8'; x.font = UI.replace('{s}', 30); x.textAlign = 'left'; x.fillText('(84)', 684, 340);
    read('SpO₂  %', String(vals.spo2), '#46d3ff', 360, 500, 104);
    read('RR  rpm', String(vals.rr), '#ffd84a', 500, 610, 84);
    read('TEMP  °F', '99.8', '#f2f4f7', 610, 714, 64);
    tex.needsUpdate = true;
  }
  draw(3.1);

  // housing: slim, with crisp edges; rubber feet
  const D = 1.3, F = D / 2;
  g.add(mesh(new RoundedBoxGeometry(3.4, 3.0, D, 3, 0.07), shell, 0, 1.62, 0));
  for (const sx of [-1, 1]) for (const fz of [-0.42, 0.42]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.12, 20), M.rubber, sx * 1.38, 0.06, fz));
  // screen: a dark bezel, the glowing display, glass over it
  g.add(mesh(new RoundedBoxGeometry(3.04, 2.22, 0.04, 2, 0.04), M.dark, 0, 2.02, F));
  g.add(mesh(new THREE.PlaneGeometry(2.86, 2.01), screen, 0, 2.02, F + 0.023));
  g.add(mesh(new RoundedBoxGeometry(2.92, 2.07, 0.02, 2, 0.03), screenGlass, 0, 2.02, F + 0.035));
  // control strip below the screen: pale panel, two status LEDs, a row of oval keys (alarm silence in yellow), the big trim knob
  g.add(mesh(new RoundedBoxGeometry(2.6, 0.5, 0.05, 2, 0.2), panel, -0.22, 0.56, F));
  for (const [ly, col] of [[0.66, 0x4cf08c], [0.48, 0xffb347]]) g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9 }), -1.38, ly, F + 0.03));
  [-0.92, -0.5, -0.08, 0.34].forEach((kx, i) => { const k = mesh(new THREE.SphereGeometry(0.15, 24, 12), i === 3 ? keyYellow : keyMat, kx, 0.56, F + 0.025); k.scale.set(1.25, 0.6, 0.22); g.add(k); });
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 40).rotateX(Math.PI / 2), M.dark, 1.28, 0.56, F));
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.14, 40).rotateX(Math.PI / 2), M.satin, 1.28, 0.56, F + 0.06));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), M.chrome, 1.28, 0.56, F + 0.135));
  // two handles on top, near the left and right edges, each a loop running front to back
  for (const sx of [-1, 1]) {
    const hx = sx * 1.16, V = (y, z) => new THREE.Vector3(hx, y, z);
    const loop = new THREE.CatmullRomCurve3([V(3.08, 0.44), V(3.36, 0.38), V(3.46, 0.16), V(3.46, -0.16), V(3.36, -0.38), V(3.08, -0.44)], false, 'catmullrom', 0.3);
    g.add(mesh(new THREE.TubeGeometry(loop, 80, 0.1, 18, false), shell));
  }
  // connector ports down the right side, in a pale recessed panel
  g.add(mesh(new RoundedBoxGeometry(0.04, 1.6, 0.9, 2, 0.08), panel, 1.705, 1.6, 0));
  [[2.15, 0.22], [2.15, -0.22], [1.6, 0], [1.05, 0.22], [1.05, -0.22]].forEach(([py, pz]) => {
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 24).rotateZ(Math.PI / 2), M.satin, 1.73, py, pz));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20).rotateZ(Math.PI / 2), M.dark, 1.745, py, pz));
  });
  // vents on the back
  for (let i = 0; i < 6; i++) g.add(mesh(new RoundedBoxGeometry(2.2, 0.06, 0.03, 2, 0.02), M.dark, 0, 1.1 + i * 0.2, -F - 0.005));
  const turn = new THREE.Group(); turn.add(g); turn.userData.frame = { radius: 2.5, lookY: 1.75 };
  // redraw the screen as the turntable runs, about 30 times a second (left still when motion is reduced)
  turn.userData.tick = t => { if (still.matches || t - drawnAt < 1 / 30) return; drawnAt = t; draw(t); };
  return turn;
}

/* printed details (dial, tape, grille, badge) are drawn onto small canvases and used as textures */
function paint(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const UI = '600 {s}px "Helvetica Neue", Helvetica, Arial, sans-serif';

/* ── Blackradio: an '80s boombox — cream body, brushed-aluminium faceplate, perforated grilles, a printed FM dial, a real tape behind the window ── */
function buildRadio() {
  const g = new THREE.Group();
  const brushed = new THREE.MeshStandardMaterial({ color: 0xe4e6e9, metalness: 0.55, roughness: 0.38, envMapIntensity: 1.5,
    map: paint(512, 256, (x, w, h) => { x.fillStyle = '#cfd2d6'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '90,95,100'},${(Math.random() * .12).toFixed(3)})`; x.fillRect(0, Math.random() * h, w, Math.random() * 1.4 + .3); } }) });
  const grille = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.55,
    map: paint(512, 512, (x, w, h) => { x.fillStyle = '#26272a'; x.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 11) for (let i = ((y / 11) % 2) * 5.5 + 6; i < w; i += 11) { x.fillStyle = '#060607'; x.beginPath(); x.arc(i, y, 3.4, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.1)'; x.beginPath(); x.arc(i - 1, y - 1.2, 1.4, 0, 7); x.fill(); } }) });
  const dialTex = paint(1024, 96, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b1e22'); gr.addColorStop(1, '#0d0f11'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(236,232,220,.8)'; x.lineWidth = 3; for (let i = 0; i <= 40; i++) { const X = 60 + i * 23; x.beginPath(); x.moveTo(X, 60); x.lineTo(X, i % 5 ? 74 : 86); x.stroke(); }
    x.fillStyle = 'rgba(240,236,226,.95)'; x.font = UI.replace('{s}', 34); x.textAlign = 'center'; [88, 92, 96, 100, 104, 108].forEach((f, i) => x.fillText(f, 60 + i * 184, 48));
    x.fillStyle = '#ff7a3d'; x.font = UI.replace('{s}', 20); x.textAlign = 'left'; x.fillText('FM', 8, 82); x.font = UI.replace('{s}', 17); x.textAlign = 'right'; x.fillText('MHz', w - 4, 82); });   // in the margins either side of the ticks
  const dial = new THREE.MeshStandardMaterial({ roughness: 0.5, map: dialTex, emissive: 0xffffff, emissiveMap: dialTex, emissiveIntensity: 0.55 });   // a softly backlit dial
  const tape = new THREE.MeshStandardMaterial({ roughness: 0.5, map: paint(400, 300, (x, w, h) => {
    x.fillStyle = '#101214'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ece5d4'; x.beginPath(); x.roundRect(30, 40, 340, 210, 14); x.fill();
    x.fillStyle = '#e8592c'; x.fillRect(30, 70, 340, 16);
    x.fillStyle = '#3a2f26'; x.font = UI.replace('{s}', 22); x.fillText('C-90', 48, 66); x.font = UI.replace('{s}', 18); x.textAlign = 'right'; x.fillText('blackradio', 352, 66);
    x.fillStyle = '#1a1a1c'; x.beginPath(); x.roundRect(95, 120, 210, 70, 35); x.fill();
    for (const cx of [140, 260]) { x.fillStyle = '#5a4636'; x.beginPath(); x.arc(cx, 155, cx === 140 ? 30 : 22, 0, 7); x.fill(); x.fillStyle = '#f4efe4'; x.beginPath(); x.arc(cx, 155, 14, 0, 7); x.fill();
      x.strokeStyle = '#1a1a1c'; x.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; x.beginPath(); x.moveTo(cx, 155); x.lineTo(cx + Math.cos(a) * 12, 155 + Math.sin(a) * 12); x.stroke(); } }
    x.fillStyle = '#cfc6b3'; x.fillRect(150, 225, 100, 25); }) });
  const badge = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.3, metalness: 0.4, map: paint(512, 96, (x, w, h) => { x.fillStyle = '#2a2a2d'; x.font = '700 54px "Helvetica Neue", Helvetica, Arial, sans-serif'; x.textAlign = 'right'; x.fillText('blackradio', w - 8, 66); }) });

  // body: cream shell with tight corners, a slim charcoal base, the faceplate set into the front
  g.add(mesh(new RoundedBoxGeometry(4.6, 2.36, 1.0, 4, 0.08), M.cream, 0, 1.4, 0));
  g.add(mesh(new RoundedBoxGeometry(4.62, 0.2, 1.02, 3, 0.06), M.dark, 0, 0.3, 0));
  g.add(mesh(new RoundedBoxGeometry(4.34, 1.98, 0.04, 3, 0.04), brushed, 0, 1.36, 0.5));
  // speakers: charcoal surround, chrome trim, perforated grille, small centre badge
  for (const sx of [-1, 1]) {
    const spk = new THREE.Group(); spk.position.set(sx * 1.36, 1.28, 0.52);
    spk.add(mesh(new THREE.TorusGeometry(0.7, 0.045, 14, 72), M.dark));
    spk.add(mesh(new THREE.TorusGeometry(0.645, 0.014, 8, 72), M.chrome, 0, 0, 0.03));
    spk.add(mesh(new THREE.CircleGeometry(0.64, 72), grille, 0, 0, 0.004));
    spk.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 32).rotateX(Math.PI / 2), M.chrome, 0, 0, 0.02));
    g.add(spk);
    for (const fz of [-0.3, 0.3]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 20), M.rubber, sx * 1.9, 0.16, fz));   // feet
  }
  // FM dial under glass, with its needle
  // stacked front to back so each layer clears the one behind it: dark surround, the dial face, the needle, the glass
  g.add(mesh(new RoundedBoxGeometry(3.58, 0.48, 0.02, 2, 0.05), M.dark, 0, 2.15, 0.514));   // its face sits just proud of the faceplate (0.52)
  g.add(mesh(new THREE.PlaneGeometry(3.4, 0.32), dial, 0, 2.15, 0.527));
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.26, 0.008), M.orange, 0.42, 2.15, 0.533));
  g.add(mesh(new RoundedBoxGeometry(3.5, 0.4, 0.02, 2, 0.04), M.glassClear, 0, 2.15, 0.548));
  // cassette window with the tape behind it
  g.add(mesh(new RoundedBoxGeometry(0.96, 0.76, 0.02, 2, 0.05), M.dark, 0, 1.24, 0.515));
  g.add(mesh(new THREE.PlaneGeometry(0.84, 0.63), tape, 0, 1.24, 0.527));
  g.add(mesh(new RoundedBoxGeometry(0.88, 0.68, 0.025, 2, 0.04), M.glassClear, 0, 1.24, 0.54));
  // badge
  g.add(mesh(new THREE.PlaneGeometry(1.0, 0.19), badge, 1.48, 0.52, 0.524));
  // top: slim piano keys with silver caps (the last one is the orange record key), knurled chrome knobs
  for (let i = 0; i < 6; i++) {
    const x = -1.05 + i * 0.3;
    g.add(mesh(new RoundedBoxGeometry(0.26, 0.09, 0.42, 2, 0.025), M.dark, x, 2.61, 0.12));
    g.add(mesh(new RoundedBoxGeometry(0.24, 0.025, 0.4, 2, 0.01), i === 5 ? M.orange : M.satin, x, 2.665, 0.12));
  }
  for (const kx of [1.25, 1.62]) { g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 48), M.satin, kx, 2.64, 0.1)); g.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 32), M.chrome, kx, 2.71, 0.1)); }
  // slim handle on chrome mounts
  const handle = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.7, 2.72, -0.18), new THREE.Vector3(-1.66, 3.2, -0.18), new THREE.Vector3(-1.4, 3.36, -0.18), new THREE.Vector3(1.4, 3.36, -0.18), new THREE.Vector3(1.66, 3.2, -0.18), new THREE.Vector3(1.7, 2.72, -0.18)]);
  g.add(mesh(new THREE.TubeGeometry(handle, 140, 0.06, 18, false), M.rubber));
  for (const sx of [-1, 1]) g.add(mesh(new RoundedBoxGeometry(0.2, 0.16, 0.2, 2, 0.04), M.chrome, sx * 1.7, 2.64, -0.18));
  // the back: a battery door with a finger grip, and a row of vent slots
  const cream2 = M.cream.clone(); cream2.color.offsetHSL(0, 0, -0.04);
  g.add(mesh(new RoundedBoxGeometry(2.4, 1.1, 0.03, 2, 0.06), cream2, 0, 1.15, -0.505));
  g.add(mesh(new RoundedBoxGeometry(0.5, 0.08, 0.03, 2, 0.03), M.dark, 0, 1.6, -0.52));
  for (let i = 0; i < 12; i++) g.add(mesh(new RoundedBoxGeometry(0.06, 0.42, 0.02, 1, 0.02), M.dark, -1.65 + i * 0.3 + (i > 5 ? 0.0 : 0), 2.15, -0.505));
  // telescoping antenna, three sections
  const ant = new THREE.Group(); ant.position.set(2.05, 2.6, -0.32); ant.rotation.z = -0.42;
  [[0.04, 0.9], [0.03, 0.8], [0.021, 0.75]].reduce((y, [r, l]) => { ant.add(mesh(new THREE.CylinderGeometry(r, r, l, 14), M.chrome, 0, y + l / 2, 0)); return y + l - 0.04; }, 0);
  ant.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), M.chrome, 0, 2.42, 0));
  g.add(ant);
  const turn = new THREE.Group(); turn.add(g); turn.userData.frame = { radius: 2.75, lookY: 1.8 }; return turn;
}

/* ── The Hush: a martini — clear glass, a pale drink, an olive with an orange pimento on a charcoal pick ── */
function buildMartini() {
  const g = new THREE.Group(), P = (x, y) => new THREE.Vector2(x, y);
  const martiniGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.5, side: THREE.DoubleSide, depthWrite: false });
  g.add(mesh(new THREE.LatheGeometry([P(0, 0.03), P(1.05, 0.03), P(1.1, 0.07), P(0.95, 0.12), P(0.1, 0.18), P(0.07, 0.3)], 64), martiniGlass));   // foot
  g.add(mesh(new THREE.CylinderGeometry(0.065, 0.075, 1.75, 24), martiniGlass, 0, 1.15, 0));                                              // stem
  g.add(mesh(new THREE.LatheGeometry([P(0.07, 2.0), P(0.12, 2.06), P(1.85, 3.52), P(1.88, 3.56)], 72), martiniGlass));                    // bowl
  g.add(mesh(new THREE.TorusGeometry(1.865, 0.022, 10, 96).rotateX(Math.PI / 2), martiniGlass, 0, 3.55, 0));                              // rim
  const LY = 2.64, maxR = 1.35, bMinY = 2.08 - LY, bRange = 3.2 - 2.08;
  const bGeom = new THREE.LatheGeometry([P(0, bMinY), P(0.12, 2.1 - LY), P(maxR, 3.2 - LY)], 64);
  const cGeom = new THREE.CircleGeometry(maxR, 64); cGeom.rotateX(-Math.PI / 2);
  g.add(mesh(bGeom, M.drink, 0, LY, 0)); g.add(mesh(cGeom, M.drink, 0, 3.2, 0));
  const bP = bGeom.attributes.position, cP = cGeom.attributes.position;
  const bOY = new Float32Array(bP.count), cOY = new Float32Array(cP.count);
  for (let i = 0; i < bP.count; i++) bOY[i] = bP.getY(i);
  for (let i = 0; i < cP.count; i++) cOY[i] = cP.getY(i);
  // the garnish: the olive sits submerged near the middle of the drink (well inside the bowl at that height), the pick rising through the surface to lean on the rim
  const pick = new THREE.Group(); pick.position.set(0.08, 2.8, 0.06); pick.rotation.set(0.18, 0, 0.5);
  pick.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.4, 10), M.dark, 0, 0.75, 0));
  pick.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), M.dark, 0, 1.97, 0));
  const olive = mesh(new THREE.SphereGeometry(0.32, 32, 24), M.olive); olive.scale.set(1, 1.22, 1); pick.add(olive);
  pick.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), M.orange, 0, -0.36, 0));
  g.add(pick);
  // its shadow is drawn, not cast (see shade()): the glass in profile, foot, stem and the V of the bowl, lying on the table out to the right
  // and a little back, the way the other objects' shadows fall; soft-edged and light, since light comes through glass
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const K = 0.95, SW = 256, SH = 160, X0 = -0.6, X1 = 3.9, Z = 2.2;               // the shadow's length runs along x (height x K), its width along z
  const sc2 = document.createElement('canvas'); sc2.width = SW; sc2.height = SH; const c = sc2.getContext('2d');
  const u = x => (x - X0) / (X1 - X0) * SW, v = z => (z + Z) / (2 * Z) * SH;
  c.translate(-1000, 0); c.shadowOffsetX = 1000; c.shadowColor = '#000'; c.shadowBlur = 7; c.fillStyle = '#000';   // only the blurred copy lands
  c.beginPath(); c.ellipse(u(0), v(0), (u(1.1) - u(0)), (v(1.1) - v(0)), 0, 0, Math.PI * 2); c.fill();             // the foot, on the table
  c.fillRect(u(0.25 * K), v(-0.075), u(2.05 * K) - u(0.25 * K), v(0.075) - v(-0.075));                              // the stem
  c.beginPath(); c.moveTo(u(2.0 * K), v(-0.12)); c.lineTo(u(3.56 * K), v(-1.88)); c.lineTo(u(3.56 * K), v(1.88)); c.lineTo(u(2.0 * K), v(0.12)); c.fill();   // the bowl
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, 2 * Z).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0.004, 0),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc2), transparent: true, opacity: 0.17, depthWrite: false, toneMapped: false }));
  flat.rotation.y = 0.32; flat.renderOrder = -1;                                    // out to the right and a little back
  let prevY = 0, prevT = 0, amp = 0, svel = 0;
  const turn = new THREE.Group(); turn.add(g);
  turn.userData.tick = t => {
    const dt = prevT ? t - prevT : 0; prevT = t;
    const curY = turn.rotation.y;
    if (dt > 0.1 || !dt) { prevY = curY; amp = 0; svel = 0;
      for (let i = 0; i < bP.count; i++) bP.setY(i, bOY[i]); bP.needsUpdate = true;
      for (let i = 0; i < cP.count; i++) cP.setY(i, cOY[i]); cP.needsUpdate = true; return; }
    const dY = Math.atan2(Math.sin(curY - prevY), Math.cos(curY - prevY)); prevY = curY;
    const target = THREE.MathUtils.clamp(-dY / Math.min(dt, 0.05) * 0.08, -0.12, 0.12);
    svel += ((target - amp) * 60 - svel * 5) * dt; amp += svel * dt;
    const cY = Math.cos(curY), sY = Math.sin(curY);
    for (let i = 0; i < bP.count; i++) { const x = bP.getX(i), z = bP.getZ(i), hf = Math.max(0, (bOY[i] - bMinY) / bRange);
      bP.setY(i, bOY[i] + amp * (x * cY - z * sY) / maxR * hf); } bP.needsUpdate = true;
    for (let i = 0; i < cP.count; i++) { const x = cP.getX(i), z = cP.getZ(i);
      cP.setY(i, cOY[i] + amp * (x * cY - z * sY) / maxR); } cP.needsUpdate = true;
  };
  Object.assign(turn.userData, { frame: { radius: 2.7, lookY: 1.9 }, flatShadow: flat }); return turn;
}

// the cab is meshopt-compressed (about 200 KB instead of 1 MB); the decoder is a small module from the same three.js release
const CAB = new Promise(res => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('images/work/fleeting-cab.glb?v=16', g => res(g.scene), undefined, () => res(null)));

const BUILDERS = { truck: buildTruck, monitor: buildMonitor, radio: buildRadio, martini: buildMartini };

/* An object's shadow: the key light's, cast on the floor, unless the object brings its own drawn one (the martini). Clear glass can't cast a
   true shadow here: a shadow map treats it as solid, and the bowl's wide rim swallows the V, so it read as a dark floating oval. The drawn
   shadow lies on the floor, outside the object, so it stays put while the object turns, as a real shadow would. */
function shade(sc, root) {
  if (sc.userData.flat) { sc.remove(sc.userData.flat); sc.userData.flat = null; }
  const flat = root.userData.flatShadow; if (flat) { sc.add(flat); sc.userData.flat = flat; }
}

/* ── Work: the orbit. Each project's object gets its own small transparent canvas, straight on the page (so the page can outline its
   exact silhouette); work.html moves the canvases round the ellipse. Each object turns with the orbit, as if it stood on a turntable, so
   whichever comes to the front shows its resting angle. Only the one under the pointer also turns slowly on its own, and eases back after;
   the front one keeps its screen live (the monitor). Each sits on the same soft floor shadow as on its Featured slide. ── */
function collage() {
  const items = [...document.querySelectorAll('.cl-item[data-model]')];
  const views = items.map((item, i) => {
    const kind = item.dataset.model, host = item.querySelector('.cl-obj');
    if (!BUILDERS[kind] || !host) return null;
    let r; try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { if (item.dataset.img) host.innerHTML = '<img src="' + item.dataset.img + '" alt="">'; return null; }   // no 3D: the illustration instead
    r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const sc = new THREE.Scene(); sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    // the same light and floor as the Featured slides, so each object casts the same shadow there and here
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 9, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sc.add(key, new THREE.HemisphereLight(0xffffff, 0x444444, 0.35));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.ShadowMaterial({ opacity: 0.28 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
    const rest = 0, root = BUILDERS[kind](); root.rotation.y = rest; sc.add(root);      // at the front, each faces the camera dead on
    shade(sc, root);                                                                    // the martini brings its own shadow
    // the canvas is 1.6x the object's spot (it overhangs, so the shadow fits); the lens widens to match, so the object is the size it was in a 1.14x canvas
    const cam = new THREE.PerspectiveCamera(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(13)) * 1.6 / 1.14)), 1, 0.1, 100), f = root.userData.frame;
    const fit = f.radius / Math.sin(THREE.MathUtils.degToRad(13));
    // a low camera: just above the object's middle, looking down at it a touch (Featured keeps its higher view)
    cam.position.set(0, f.lookY + fit * 0.1, fit); cam.lookAt(0, f.lookY, 0);
    host.appendChild(r.domElement);
    const v = { root, rest, host, idx: Number(item.dataset.i) || 0, orb: 0, spin: 0, w: 0, ready: kind !== 'truck', shown: false, dir: i % 2 ? -1 : 1,   // neighbours turn opposite ways
                draw: () => { if (!v.w) return; r.render(sc, cam); if (v.ready && !v.shown) { v.shown = true; reveal(); } } };   // whole and drawn: ready to fade in
    new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;                       // its layout size (the orbit's scale is a transform, so it doesn't count)
      v.w = w && h ? w : 0; if (!v.w) return;                                   // hidden (the Featured view is showing): nothing to draw
      r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); v.draw();
    }).observe(host);
    if (kind === 'truck') CAB.then(() => requestAnimationFrame(() => { v.ready = true; v.draw(); }));   // the cab's body arrives a moment later
    return v;
  });
  // they all fade in together, once every one is whole and drawn (the truck waits on its cab model); if one is still loading after a few
  // seconds, the rest come in without it and it follows when it's ready, so a slow download can't keep the orbit empty
  // the card under the orbit fades in with them (work.html shows it anyway after a few seconds, in case this script never runs)
  let together = false;
  function reveal(force) {
    if (!together && (force || views.every(x => !x || x.shown))) { together = true; document.getElementById('view-recent')?.classList.add('orbit-in'); }
    if (together) for (const x of views) if (x && x.shown) x.host.classList.add('drawn');
  }
  setTimeout(() => reveal(true), 4000);
  if (!views.some(Boolean)) reveal(true);                                     // no 3D at all (the illustrations show): nothing to wait for
  // each object's angle: its rest, plus where it is on the orbit, plus its own spin (only the hovered one spins; the others ease their spin away)
  const aim = v => { v.root.rotation.y = v.rest + v.orb + v.spin; };
  let on = null, live = null, raf = 0, last = 0;                            // on: under the pointer (spins); live: the picked one (its screen runs)
  const loop = t => {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; let busy = false;
    for (const v of views) {
      if (!v) continue;
      let dirty = false;
      if (v === on) { if (!still.matches) { v.spin += 0.5 * dt * v.dir; dirty = busy = true; } }
      else if (v.spin) {
        const d = Math.atan2(Math.sin(-v.spin), Math.cos(-v.spin));          // the shortest way back
        if (Math.abs(d) > 0.002) { v.spin += d * (still.matches ? 1 : 1 - Math.exp(-dt * 5)); busy = true; } else v.spin = 0;
        dirty = true;
      }
      if (v === live && v.root.userData.tick) { v.root.userData.tick(t / 1000); dirty = busy = true; }
      if (dirty) { aim(v); v.draw(); }
    }
    raf = busy ? requestAnimationFrame(loop) : 0;
  };
  const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  // work.html says where the orbit is: every object turns with it
  document.addEventListener('work:orbit', e => {
    for (const v of views) { if (!v) continue; v.orb = e.detail.phase + v.idx * e.detail.step; aim(v); v.draw(); }
  });
  document.dispatchEvent(new Event('work:hello'));                          // ask work.html where the orbit is and which is picked
  // work.html says which project is picked (its screen runs), and which one the pointer is over (it spins); either can be null
  document.addEventListener('work:collage', e => { live = e.detail.i == null ? null : views[e.detail.i] || null; wake(); });
  document.addEventListener('work:spin', e => { on = e.detail.i == null ? null : views[e.detail.i] || null; wake(); });
}
collage();

/* ── one renderer, moved into whichever slide is showing ── */
let renderer, scene, camera, root = null, slideEl = null, raf = 0, last = 0;
let yaw = 0.62, vel = 0, dragging = false, lastX = 0, lastT = 0;
const canvas = document.createElement('canvas'); canvas.className = 'turntable'; canvas.setAttribute('aria-hidden', 'true');

function ensure() {
  if (renderer) return true;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { document.documentElement.classList.remove('has-3d'); return false; }   // no WebGL: keep the illustrations
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 9, 6); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x444444, 0.35));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.ShadowMaterial({ opacity: 0.28 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  scene.userData.floor = floor;
  camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

  // drag to turn; the canvas keeps the gesture so it doesn't also swipe the slider
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastT = performance.now(); vel = 0; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; const now = performance.now(), dx = e.clientX - lastX; yaw += dx * 0.008; vel = dx * 0.008 / Math.max(1, now - lastT) * 1000; lastX = e.clientX; lastT = now; });
  const end = () => { dragging = false; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (slideEl) start(); });
  addEventListener('resize', () => { if (slideEl) size(); });
  return true;
}

function size() {
  const img = slideEl.querySelector('.tile img'), h = img ? img.getBoundingClientRect().height : 240;
  const W = Math.round(Math.min(innerWidth * 0.92, h * 3.2)), H = Math.round(h * 1.9);   // a wide stage, so the object has room as it turns
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const f = root.userData.frame, fit = f.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
  camera.position.set(0, f.lookY + fit * (f.elev || 0.26), fit); camera.lookAt(0, f.lookY, 0); camera.updateProjectionMatrix();
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (!dragging) {
    vel *= Math.pow(0.04, dt);                              // momentum dies away in about a second
    yaw += (vel + (still.matches ? 0 : 0.22)) * dt;         // plus the turntable's own slow turn
  }
  root.rotation.y = yaw;
  if (root.userData.tick) root.userData.tick(t / 1000);       // objects with moving parts (the monitor's screen) update themselves
  renderer.render(scene, camera);
}
function start() { if (!raf && slideEl && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
function stop() { cancelAnimationFrame(raf); raf = 0; }

function mount(slide) {
  const kind = slide && slide.dataset.model;
  if (!kind || !BUILDERS[kind]) return unmount();
  if (!ensure()) return;
  if (!root || root.userData.kind !== kind) { if (root) scene.remove(root); root = BUILDERS[kind](); root.userData.kind = kind; scene.add(root);
    shade(scene, root); }   // the martini brings its own shadow
  if (slideEl !== slide) {
    if (slideEl) slideEl.querySelector('.tile').classList.remove('live');
    slideEl = slide; const tile = slide.querySelector('.tile'); tile.appendChild(canvas); tile.classList.add('live');
  }
  size(); renderer.render(scene, camera); start();
}
function unmount() { stop(); if (slideEl) slideEl.querySelector('.tile').classList.remove('live'); slideEl = null; canvas.remove(); }

// work.html tells us which slide has settled on screen (or null when Featured isn't showing)
document.addEventListener('work:slide', e => mount(e.detail.slide));
if (window.__workSlide) mount(window.__workSlide());


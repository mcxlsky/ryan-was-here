import * as THREE from 'three';

// --- State and Constants ---
const bgMount = document.getElementById('webgl-background');
const orbContainer = document.getElementById('orb-container');
const carouselItems = document.querySelectorAll('.carousel-item[data-index]');
const menuToggle = document.getElementById('menu-toggle');
const menuOverlay = document.getElementById('menu-overlay');

const scrollState = {
  /** Start on About (0); Featured orbs is 1, Blog is 2. */
  current: 0,
  /** Index units / frame — wheel & touch release add momentum; spring pulls toward snap goal */
  velocity: 0,
  isDragging: false,
  /** Menu jump: spring toward this index until settled; cleared on user wheel */
  snapOverride: null,
};

const mouseState = {
  target: { x: 0, y: 0 },
  boundaryRadius: 0.1,
};
const orbSettings = {
  baseSize: 0.55,
  wiggleIntensity: 0.65,
  wanderIntensity: 0.19,
  rollIntensity: 0.21,
  /** 0 = off, 1 = default, 2 = stronger collision squash */
  pairSquishIntensity: 1,
};

function lerp(a, b, n) { return (1 - n) * a + n * b; }
function smoothstep(edge0, edge1, x) {
  if (x <= edge0) return 0;
  if (x >= edge1) return 1;
  const t = (x - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

// --- WebGL2: AnimatedMesh background shader ---
const bgCanvas = document.createElement('canvas');
bgMount.appendChild(bgCanvas);
const bgGl = bgCanvas.getContext('webgl2');

function parseColorToVec4(hex) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0]/255, d[1]/255, d[2]/255, d[3]/255];
}

const BG_VERT = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;
const BG_FRAG = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_seed;
uniform float u_tilt;
uniform float u_zoom;
uniform float u_cameraHeight;
uniform float u_amplitude;
uniform float u_lineWidth;
uniform float u_lineBlur;
uniform float u_lightIntensity;
uniform vec4 u_lineColor;
uniform vec4 u_backgroundColor;
uniform float u_pixelRatio;
out vec4 fragColor;
uvec3 hash3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 seedRandom(float seedVal) {
  uvec3 s = uvec3(floatBitsToUint(seedVal), floatBitsToUint(seedVal * 1.5 + 7.31), floatBitsToUint(seedVal * 2.7 + 13.37));
  s = hash3(s);
  return vec3(s) / float(0xFFFFFFFFu);
}
void main() {
  vec2 r = u_resolution;
  vec2 I = gl_FragCoord.xy;
  float t = u_time * u_speed;
  vec3 w, p;
  vec4 o = vec4(0.0);
  vec3 seedA = seedRandom(u_seed);
  vec3 seedB = seedRandom(u_seed + 100.0);
  float seedAngle = seedA.x * 6.2831;
  mat2 seedRot = mat2(cos(seedAngle), -sin(seedAngle), sin(seedAngle), cos(seedAngle));
  vec3 seedPhase = seedB * 6.2831;
  float a = radians(u_tilt);
  mat3 rot = mat3(1.0, 0.0, 0.0, 0.0, cos(a), sin(a), 0.0, -sin(a), cos(a));
  float z = 0.0;
  float d = 0.1;
  vec4 offset = vec4(0.0);
  for (float i = 0.0; i < 30.0; i++) {
    vec3 rd = (vec3(I, 0.0) * 2.0 - r.xyy) / r.y * u_zoom;
    p = z * (rot * rd) + vec3(1.0, u_cameraHeight, 1.0);
    w = p;
    vec3 nw = w;
    nw.xz = seedRot * nw.xz;
    float f;
    for (f = 2.0; f <= 3.0; f++)
      nw += sin(nw.zxy * f + t + seedPhase) / f;
    w = mix(p, nw, 1.0);
    d = 0.1 * (p.y + 3.0);
    z += d;
    vec4 surface = vec4(mix(p, w, u_amplitude).y) + offset;
    vec4 fw = max(fwidth(surface), 0.0001);
    vec4 pixelDist = abs(surface) / fw;
    float lw = u_lineWidth * u_pixelRatio;
    vec4 acc = smoothstep(lw + u_lineBlur, lw, pixelDist) * u_lightIntensity * d;
    o += acc;
  }
  vec4 raw = tanh(o);
  if (u_backgroundColor.a > 0.0) {
    float lineAlpha = raw.a * u_lineColor.a;
    fragColor = vec4(mix(u_backgroundColor.rgb, u_lineColor.rgb, lineAlpha), u_backgroundColor.a);
  } else {
    fragColor = vec4(raw.rgb * u_lineColor.rgb, raw.a * u_lineColor.a);
  }
}
`;

(function initBgShader() {
  const compile = (type, src) => {
    const s = bgGl.createShader(type);
    bgGl.shaderSource(s, src);
    bgGl.compileShader(s);
    return s;
  };
  const prog = bgGl.createProgram();
  bgGl.attachShader(prog, compile(bgGl.VERTEX_SHADER, BG_VERT));
  bgGl.attachShader(prog, compile(bgGl.FRAGMENT_SHADER, BG_FRAG));
  bgGl.linkProgram(prog);
  bgGl.useProgram(prog);
  const buf = bgGl.createBuffer();
  bgGl.bindBuffer(bgGl.ARRAY_BUFFER, buf);
  bgGl.bufferData(bgGl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), bgGl.STATIC_DRAW);
  const pos = bgGl.getAttribLocation(prog, 'a_position');
  bgGl.enableVertexAttribArray(pos);
  bgGl.vertexAttribPointer(pos, 2, bgGl.FLOAT, false, 0, 0);
  window._bgUniforms = Object.fromEntries(
    ['u_resolution','u_time','u_speed','u_seed','u_tilt','u_zoom',
     'u_cameraHeight','u_amplitude','u_lineWidth','u_lineBlur',
     'u_lightIntensity','u_lineColor','u_backgroundColor','u_pixelRatio']
    .map(n => [n, bgGl.getUniformLocation(prog, n)])
  );
})();

const bgSettings = {
  speed: 0.5, seed: 200, tilt: -32, zoom: 0.35, cameraHeight: 2.0,
  amplitude: 0.2, lineWidth: 0.1, lineBlur: 2.0, lightIntensity: 3.0,
  lineColor: parseColorToVec4('#00FF2A'),
  backgroundColor: parseColorToVec4('#000000'),
};

function renderBgShader(t) {
  const u = window._bgUniforms;
  bgGl.uniform2f(u.u_resolution, bgCanvas.width, bgCanvas.height);
  bgGl.uniform1f(u.u_time, t);
  bgGl.uniform1f(u.u_speed, bgSettings.speed);
  bgGl.uniform1f(u.u_seed, bgSettings.seed);
  bgGl.uniform1f(u.u_tilt, bgSettings.tilt);
  bgGl.uniform1f(u.u_zoom, bgSettings.zoom);
  bgGl.uniform1f(u.u_cameraHeight, bgSettings.cameraHeight);
  bgGl.uniform1f(u.u_amplitude, bgSettings.amplitude);
  bgGl.uniform1f(u.u_lineWidth, bgSettings.lineWidth);
  bgGl.uniform1f(u.u_lineBlur, bgSettings.lineBlur);
  bgGl.uniform1f(u.u_lightIntensity, bgSettings.lightIntensity);
  bgGl.uniform1f(u.u_pixelRatio, window.devicePixelRatio || 1);
  bgGl.uniform4fv(u.u_lineColor, bgSettings.lineColor);
  bgGl.uniform4fv(u.u_backgroundColor, bgSettings.backgroundColor);
  bgGl.drawArrays(bgGl.TRIANGLE_STRIP, 0, 4);
}

function sizeBgCanvas(w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  bgCanvas.width = Math.max(1, w * dpr);
  bgCanvas.height = Math.max(1, h * dpr);
  bgGl.viewport(0, 0, bgCanvas.width, bgCanvas.height);
}
{ const { w, h } = bgDrawBufferSize(); sizeBgCanvas(w, h); }

// --- Three.js: separate orb canvas in carousel ---
/** True WebKit Safari (excludes Chrome, Edge, Firefox, iOS Chrome “CriOS”, etc.) */
function isSafariBrowser() {
  const ua = navigator.userAgent;
  if (/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua)) return false;
  return /Safari/i.test(ua) && /Apple/i.test(navigator.vendor || '');
}
const safariBrowser = isSafariBrowser();
if (safariBrowser) document.documentElement.classList.add('safari-viewport-fix');

function bgDrawBufferSize() {
  let w = Math.max(1, Math.ceil(window.innerWidth));
  let h = Math.max(
    window.innerHeight,
    document.documentElement?.clientHeight || 0
  );
  const vv = window.visualViewport;
  if (vv) {
    w = Math.max(w, Math.ceil(vv.width + vv.offsetLeft));
    h = Math.max(h, Math.ceil(vv.height + vv.offsetTop));
  }
  h = Math.ceil(h);
  w = Math.ceil(w);
  /* WebKit: inner/visual sizes can be a pixel short of the painted rect; extra rows hide the hairline. */
  if (safariBrowser) h += 3;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

const orbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
orbRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
orbRenderer.outputColorSpace = THREE.SRGBColorSpace;
orbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
orbRenderer.setClearColor(0x000000, 0);
orbContainer.appendChild(orbRenderer.domElement);


const sceneOrb = new THREE.Scene();
sceneOrb.background = null;
const cameraOrb = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
cameraOrb.position.z = 5;

function sizeOrbRenderer() {
  const w = Math.max(1, orbContainer.clientWidth);
  const h = Math.max(1, orbContainer.clientHeight);
  orbRenderer.setSize(w, h);
  cameraOrb.aspect = w / h;
  cameraOrb.updateProjectionMatrix();
}
sizeOrbRenderer();
new ResizeObserver(() => sizeOrbRenderer()).observe(orbContainer);

// --- One directional light only (no ambient, no env map = one dominant highlight) ---
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(-2, 15, 5);
sceneOrb.add(keyLight);

const orbGroup = new THREE.Group();
sceneOrb.add(orbGroup);

// Disc behind the glass sphere: radius matches SphereGeometry(1.2). Uniform scale only (sibling to squish) so pair-squish deforms the sphere, not the disc — otherwise the rim stays glued to the sphere silhouette and squish disappears.
const orbBackdropMat = new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: true, depthTest: true });
const orbBackdropMesh = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64), orbBackdropMat);
orbBackdropMesh.position.set(0, 0, -1.95);
orbBackdropMesh.renderOrder = -2;

const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.35,
  transmission: 1.0, 
  thickness: 1.2,
  ior: 1.5,
  specularIntensity: 1.0,
  envMapIntensity: 0,
  clearcoat: 0,
  clearcoatRoughness: 0.15,
  attenuationColor: 0xffffff,
  attenuationDistance: 1.0,
  transparent: true,
});
const baseGeometry = new THREE.SphereGeometry(1.2, 64, 64);
const originalPositions = baseGeometry.attributes.position.clone();
const baseGeometryB = baseGeometry.clone();
const originalPositionsB = baseGeometryB.attributes.position.clone();
const glassOrb = new THREE.Mesh(baseGeometry, glassMaterial);
glassOrb.renderOrder = 0;

// depthTest false: curved glass + transmission wins depth at the center and was painting over the logo (“blue dot”).
// Higher renderOrder draws after the sphere; nudge Z so the plane sits clearly in front of the surface.
const orbLogoMatA = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 1,
  depthWrite: false,
  depthTest: false,
});
const orbLogoMatB = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 1,
  depthWrite: false,
  depthTest: false,
});
const orbLogoMatC = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 1,
  depthWrite: false,
  depthTest: false,
});
const orbLogoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), orbLogoMatA);
orbLogoMesh.position.set(0, 0, 1.28);
orbLogoMesh.renderOrder = 2;
orbLogoMesh.visible = false;

/** Squish is child of roll → T·R·S·v applies scale before roll (world contact axis → local via inverse roll in applyOrbSquishScale). */
const orbRollGroup = new THREE.Group();
const orbBackdropUniformGroup = new THREE.Group();
const orbSquishGroup = new THREE.Group();
orbBackdropUniformGroup.add(orbBackdropMesh);
orbSquishGroup.add(glassOrb, orbLogoMesh);
orbRollGroup.add(orbBackdropUniformGroup, orbSquishGroup);
orbGroup.add(orbRollGroup);

const ORB_ROW_SPACING = 0.88;
const orbGroupB = new THREE.Group();
const orbBackdropMeshB = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64), orbBackdropMat);
orbBackdropMeshB.position.copy(orbBackdropMesh.position);
orbBackdropMeshB.renderOrder = -2;
const glassOrbB = new THREE.Mesh(baseGeometryB, glassMaterial);
glassOrbB.renderOrder = 0;
const orbLogoMeshB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), orbLogoMatB);
orbLogoMeshB.position.copy(orbLogoMesh.position);
orbLogoMeshB.renderOrder = 2;
orbLogoMeshB.visible = false;
const orbRollGroupB = new THREE.Group();
const orbBackdropUniformGroupB = new THREE.Group();
const orbSquishGroupB = new THREE.Group();
orbBackdropUniformGroupB.add(orbBackdropMeshB);
orbSquishGroupB.add(glassOrbB, orbLogoMeshB);
orbRollGroupB.add(orbBackdropUniformGroupB, orbSquishGroupB);
orbGroupB.add(orbRollGroupB);
sceneOrb.add(orbGroupB);

const baseGeometryC = baseGeometry.clone();
const originalPositionsC = baseGeometryC.attributes.position.clone();
const orbGroupC = new THREE.Group();
const orbBackdropMeshC = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64), orbBackdropMat);
orbBackdropMeshC.position.copy(orbBackdropMesh.position);
orbBackdropMeshC.renderOrder = -2;
const glassOrbC = new THREE.Mesh(baseGeometryC, glassMaterial);
glassOrbC.renderOrder = 0;
const orbLogoMeshC = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), orbLogoMatC);
orbLogoMeshC.position.copy(orbLogoMesh.position);
orbLogoMeshC.renderOrder = 2;
orbLogoMeshC.visible = false;
const orbRollGroupC = new THREE.Group();
const orbBackdropUniformGroupC = new THREE.Group();
const orbSquishGroupC = new THREE.Group();
orbBackdropUniformGroupC.add(orbBackdropMeshC);
orbSquishGroupC.add(glassOrbC, orbLogoMeshC);
orbRollGroupC.add(orbBackdropUniformGroupC, orbSquishGroupC);
orbGroupC.add(orbRollGroupC);
sceneOrb.add(orbGroupC);

/** Left (A), center (C), right (B) — keeps logo slots a=left, b=right, c=center. */
const orbGroupXBase = -ORB_ROW_SPACING;
const orbGroupCXBase = 0;
const orbGroupBXBase = ORB_ROW_SPACING;

/** 2D physics for orb centers (world units). Springs follow pointer + wander; walls + pair collisions bounce. */
const ORB_PHYS = {
  /** Wider X for three orbs (centers ≈ −0.88 / 0 / +0.88) vs two at ±0.44. */
  bounds: { xMin: -1.75, xMax: 1.75, yMin: -0.94, yMax: 0.94 },
  /** Base pull toward cursor — reduced automatically when |v| is high so bounces aren’t erased. */
  spring: 2.05,
  /** Velocity damping (per second, linear) — absorbs collision/spring oscillation; too high kills wander. */
  drag: 0.125,
  /** Soft bounce off box (lower = less jitter vs springs). */
  wallRest: 0.52,
  /** Soft bounce orb–orb. */
  pairRest: 0.55,
  substeps: 8,
  /** Fraction of overlap resolved per pair pass (lower = gentler; multiple pairs still converge). */
  overlapPosFrac: 0.38,
  /** spring *= max(springFloor, 1 - k * min(|v|, cap) / cap) */
  springVelAtten: 0.72,
  springVelCap: 2.8,
  springFloor: 0.14,
  /** When resting in contact, blend normal velocity toward zero (reduces micro-bounce). */
  pairRestRelax: 0.62,
};
const orbPhysA = { px: orbGroupXBase, py: 0, vx: 0, vy: 0 };
const orbPhysB = { px: orbGroupBXBase, py: 0, vx: 0, vy: 0 };
const orbPhysC = { px: orbGroupCXBase, py: 0, vx: 0, vy: 0 };
let lastOrbPhysMs = performance.now();

/** Pair-contact squash: mag 0–1, (nx,ny) world unit vector toward the other orb (compress along this axis). */
const orbDeformA = { mag: 0, nx: 1, ny: 0 };
const orbDeformB = { mag: 0, nx: 1, ny: 0 };
const orbDeformC = { mag: 0, nx: 1, ny: 0 };
const ORB_PAIR_SQUISH = {
  along: 0.11,
  perp: 0.055,
  zBulge: 0.035,
  decay: 11,
  closingMul: 0.2,
  overlapMul: 0.42,
  restOverlapMul: 0.36,
};

function getOrbDeformForPhys(phys) {
  if (phys === orbPhysA) return orbDeformA;
  if (phys === orbPhysB) return orbDeformB;
  return orbDeformC;
}

function blendOrbDeform(d, nx, ny, hit) {
  if (hit < 1e-7) return;
  if (d.mag < 0.02) {
    d.nx = nx;
    d.ny = ny;
  } else {
    const w = 0.45;
    d.nx = d.nx * (1 - w) + nx * w;
    d.ny = d.ny * (1 - w) + ny * w;
    const len = Math.hypot(d.nx, d.ny) || 1;
    d.nx /= len;
    d.ny /= len;
  }
  d.mag = Math.min(1, d.mag + hit);
}

function applyOrbSquishScale(rollGroup, squishGroup, deform, bs, breath) {
  const S = ORB_PAIR_SQUISH;
  const m = deform.mag;
  const nx = deform.nx;
  const ny = deform.ny;
  const rz = rollGroup.rotation.z;
  const c = Math.cos(-rz);
  const s = Math.sin(-rz);
  const nxL = c * nx + s * ny;
  const nyL = -s * nx + c * ny;
  const al = 1 - S.along * m;
  const pe = 1 + S.perp * m;
  const sx = al * nxL * nxL + pe * nyL * nyL;
  const sy = al * nyL * nyL + pe * nxL * nxL;
  const sz = 1 + S.zBulge * m;
  squishGroup.scale.set(bs * breath * sx, bs * breath * sy, bs * breath * sz);
}

function orbCollisionRadius() {
  return 1.2 * orbSettings.baseSize * 1.1;
}

function bounceOrbWall(o, R) {
  const b = ORB_PHYS.bounds;
  const e = ORB_PHYS.wallRest;
  const wallSlop = 0.018;
  if (o.px - R < b.xMin) {
    o.px = b.xMin + R;
    if (o.vx < -wallSlop) o.vx = -o.vx * e;
    else if (o.vx < 0) o.vx *= 0.12;
  } else if (o.px + R > b.xMax) {
    o.px = b.xMax - R;
    if (o.vx > wallSlop) o.vx = -o.vx * e;
    else if (o.vx > 0) o.vx *= 0.12;
  }
  if (o.py - R < b.yMin) {
    o.py = b.yMin + R;
    if (o.vy < -wallSlop) o.vy = -o.vy * e;
    else if (o.vy < 0) o.vy *= 0.12;
  } else if (o.py + R > b.yMax) {
    o.py = b.yMax - R;
    if (o.vy > wallSlop) o.vy = -o.vy * e;
    else if (o.vy > 0) o.vy *= 0.12;
  }
}

function bounceOrbsPairOnce(a, b, R) {
  const dx = b.px - a.px;
  const dy = b.py - a.py;
  const dist = Math.hypot(dx, dy);
  const minD = 2 * R;
  if (dist < 1e-8) {
    const push = R * 0.02;
    a.px -= push;
    b.px += push;
    return;
  }
  if (dist >= minD) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minD - dist;
  const sep = overlap * ORB_PHYS.overlapPosFrac;
  a.px -= nx * sep;
  a.py -= ny * sep;
  b.px += nx * sep;
  b.py += ny * sep;
  const v1n = a.vx * nx + a.vy * ny;
  const v2n = b.vx * nx + b.vy * ny;
  const v1t = -a.vx * ny + a.vy * nx;
  const v2t = -b.vx * ny + b.vy * nx;
  const e = ORB_PHYS.pairRest;
  /** Closing speed along A→B: A toward B when (va−vb)·n̂ > 0 → v1n − v2n > 0. */
  const closing = v1n - v2n;
  let hit = 0;
  const closingSlop = 0.012;
  if (closing > closingSlop) {
    const v1nNew = v1n - (1 + e) * 0.5 * closing;
    const v2nNew = v2n + (1 + e) * 0.5 * closing;
    a.vx = v1nNew * nx - v1t * ny;
    a.vy = v1nNew * ny + v1t * nx;
    b.vx = v2nNew * nx - v2t * ny;
    b.vy = v2nNew * ny + v2t * nx;
    hit = Math.min(
      1,
      closing * ORB_PAIR_SQUISH.closingMul + overlap * ORB_PAIR_SQUISH.overlapMul
    );
  } else if (overlap > 1e-5) {
    /** Resting contact: relax toward zero relative normal speed (no big bump impulses). */
    const reln = v1n - v2n;
    if (reln > -0.025) {
      const relax = ORB_PHYS.pairRestRelax;
      const half = reln * relax * 0.5;
      a.vx -= nx * half;
      a.vy -= ny * half;
      b.vx += nx * half;
      b.vy += ny * half;
    }
    hit = Math.min(0.14, overlap * ORB_PAIR_SQUISH.restOverlapMul * 0.45);
  }
  if (hit > 0) {
    const w = orbSettings.pairSquishIntensity;
    if (w > 0) {
      const hw = hit * w;
      blendOrbDeform(getOrbDeformForPhys(a), nx, ny, hw);
      blendOrbDeform(getOrbDeformForPhys(b), -nx, -ny, hw);
    }
  }
}

function bounceOrbsPair(a, b, R) {
  bounceOrbsPairOnce(a, b, R);
}

function resolveThreeOrbs(R) {
  bounceOrbsPair(orbPhysA, orbPhysB, R);
  bounceOrbsPair(orbPhysA, orbPhysC, R);
  bounceOrbsPair(orbPhysB, orbPhysC, R);
}

function stepOrbPhysics(dt, t) {
  const wnd = orbSettings.wanderIntensity;
  /** Stronger than 0.05×wnd so idle drift stays visible after higher drag / soft collisions (still scaled by Wander slider). */
  const wa = 0.078 * wnd;
  const idleAx = Math.sin(t * 1.6 + 0.3) * wa;
  const idleAy = Math.cos(t * 1.4 + 0.9) * wa;
  const idleBx = Math.sin(t * 1.78 + 2.1) * wa;
  const idleBy = Math.cos(t * 1.55 + 3.4) * wa;
  const idleCx = Math.sin(t * 1.92 + 1.15) * wa;
  const idleCy = Math.cos(t * 1.68 + 2.75) * wa;
  const targetAx = orbGroupXBase + (mouseState.target.x + idleAx) * 2.5;
  const targetAy = (mouseState.target.y + idleAy) * 2.5;
  const targetBx = orbGroupBXBase + (mouseState.target.x + idleBx) * 2.5;
  const targetBy = (mouseState.target.y + idleBy) * 2.5;
  const targetCx = orbGroupCXBase + (mouseState.target.x + idleCx) * 2.5;
  const targetCy = (mouseState.target.y + idleCy) * 2.5;
  const sp0 = ORB_PHYS.spring;
  const dg = ORB_PHYS.drag;
  const R = orbCollisionRadius();
  const n = ORB_PHYS.substeps;
  const h = dt / n;
  const att = ORB_PHYS.springVelAtten;
  const cap = ORB_PHYS.springVelCap;
  const floor = ORB_PHYS.springFloor;
  for (let s = 0; s < n; s++) {
    const speedA = Math.hypot(orbPhysA.vx, orbPhysA.vy);
    const speedB = Math.hypot(orbPhysB.vx, orbPhysB.vy);
    const speedC = Math.hypot(orbPhysC.vx, orbPhysC.vy);
    const mulA = Math.max(floor, 1 - att * Math.min(speedA, cap) / cap);
    const mulB = Math.max(floor, 1 - att * Math.min(speedB, cap) / cap);
    const mulC = Math.max(floor, 1 - att * Math.min(speedC, cap) / cap);
    const spA = sp0 * mulA;
    const spB = sp0 * mulB;
    const spC = sp0 * mulC;
    orbPhysA.vx += ((targetAx - orbPhysA.px) * spA - orbPhysA.vx * dg) * h;
    orbPhysA.vy += ((targetAy - orbPhysA.py) * spA - orbPhysA.vy * dg) * h;
    orbPhysA.px += orbPhysA.vx * h;
    orbPhysA.py += orbPhysA.vy * h;
    orbPhysB.vx += ((targetBx - orbPhysB.px) * spB - orbPhysB.vx * dg) * h;
    orbPhysB.vy += ((targetBy - orbPhysB.py) * spB - orbPhysB.vy * dg) * h;
    orbPhysB.px += orbPhysB.vx * h;
    orbPhysB.py += orbPhysB.vy * h;
    orbPhysC.vx += ((targetCx - orbPhysC.px) * spC - orbPhysC.vx * dg) * h;
    orbPhysC.vy += ((targetCy - orbPhysC.py) * spC - orbPhysC.vy * dg) * h;
    orbPhysC.px += orbPhysC.vx * h;
    orbPhysC.py += orbPhysC.vy * h;
    bounceOrbWall(orbPhysA, R);
    bounceOrbWall(orbPhysB, R);
    bounceOrbWall(orbPhysC, R);
    resolveThreeOrbs(R);
  }
}

const ORB_LOGO_STORAGE_KEY_A = 'ryan-orb-logo-a';
const ORB_LOGO_STORAGE_KEY_B = 'ryan-orb-logo-b';
const ORB_LOGO_STORAGE_KEY_C = 'ryan-orb-logo-c';
let orbLogoDataUrlA = null;
let orbLogoDataUrlB = null;
let orbLogoDataUrlC = null;

try {
  const legacy = localStorage.getItem('ryan-orb-logo');
  if (legacy && !localStorage.getItem(ORB_LOGO_STORAGE_KEY_A)) {
    localStorage.setItem(ORB_LOGO_STORAGE_KEY_A, legacy);
    localStorage.removeItem('ryan-orb-logo');
  }
} catch (_) {}
function syncOrbLogoScale() {
  const elA = document.getElementById('s-logo-scale-a');
  const elB = document.getElementById('s-logo-scale-b');
  const elC = document.getElementById('s-logo-scale-c');
  const sA = Number.isFinite(parseFloat(elA?.value)) ? parseFloat(elA.value) : 0.42;
  const sB = Number.isFinite(parseFloat(elB?.value)) ? parseFloat(elB.value) : 0.42;
  const sC = Number.isFinite(parseFloat(elC?.value)) ? parseFloat(elC.value) : 0.42;
  orbLogoMesh.scale.setScalar(sA);
  orbLogoMeshB.scale.setScalar(sB);
  orbLogoMeshC.scale.setScalar(sC);
}

function loadOrbLogoFromDataUrl(dataUrl, slot) {
  if (!dataUrl) return;
  const mat =
    slot === 'a' ? orbLogoMatA : slot === 'b' ? orbLogoMatB : orbLogoMatC;
  const mesh =
    slot === 'a' ? orbLogoMesh : slot === 'b' ? orbLogoMeshB : orbLogoMeshC;
  const loader = new THREE.TextureLoader();
  loader.load(
    dataUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      if (mat.map) mat.map.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
      mesh.visible = true;
      syncOrbLogoScale();
    },
    undefined,
    () => {
      mesh.visible = false;
    }
  );
}

function clearOrbLogo(slot) {
  const key =
    slot === 'a'
      ? ORB_LOGO_STORAGE_KEY_A
      : slot === 'b'
        ? ORB_LOGO_STORAGE_KEY_B
        : ORB_LOGO_STORAGE_KEY_C;
  const mat =
    slot === 'a' ? orbLogoMatA : slot === 'b' ? orbLogoMatB : orbLogoMatC;
  const mesh =
    slot === 'a' ? orbLogoMesh : slot === 'b' ? orbLogoMeshB : orbLogoMeshC;
  if (slot === 'a') orbLogoDataUrlA = null;
  else if (slot === 'b') orbLogoDataUrlB = null;
  else orbLogoDataUrlC = null;
  try {
    localStorage.removeItem(key);
  } catch (_) {}
  if (mat.map) {
    mat.map.dispose();
    mat.map = null;
  }
  mesh.visible = false;
}
// --- Input Handling ---
/** Wheel: clamped + shaped so trackpads don’t dump huge velocity on the first flick. */
const CAROUSEL_WHEEL_MULT = 0.178;
const CAROUSEL_WHEEL_DELTA_MAX = 0.22;
/** When nearly at rest, scale wheel impulse (stops “inheriting” a big kick on scroll start). */
const CAROUSEL_WHEEL_REST_VEL = 0.032;
const CAROUSEL_WHEEL_REST_MULT = 0.7;
/** >1 softens mid-range deltas vs linear (gentler initial motion). */
const CAROUSEL_WHEEL_SHAPE_EXP = 1.38;
/** Soft snap — a stiff spring made users pile wheel input until it broke free at hyperspeed. */
const CAROUSEL_SPRING = 0.048;
const CAROUSEL_SPRING_MENU = 0.14;
const CAROUSEL_DAMPING = 0.775;
/** Extra damping ∝ v² so one strong flick can’t blast through multiple slides. */
const CAROUSEL_DRAG_QUAD = 3.1;
const CAROUSEL_VEL_MAX = 0.1;
const CAROUSEL_SPRING_ERR_MAX = 0.42;
/** When spring pulls opposite scroll direction (leaving a slide), ease off so wheel isn’t fighting snap. */
const CAROUSEL_SPRING_OPPOSE_MULT = 0.1;
const CAROUSEL_SPRING_OPPOSE_VEL = 0.0025;

/** Nearest slide only — velocity-biased goals amplified spring error and runaway. */
function carouselSnapGoal(current) {
  return Math.round(current);
}

function clampScrollVelocity(v) {
  const m = CAROUSEL_VEL_MAX;
  return Math.max(-m, Math.min(m, v));
}

window.addEventListener('wheel', (e) => {
  e.preventDefault();
  let raw = e.deltaY * 0.001 || e.deltaX * 0.001;
  const cap = CAROUSEL_WHEEL_DELTA_MAX;
  raw = Math.max(-cap, Math.min(cap, raw));
  const n = raw / cap;
  const shaped =
    Math.sign(n) * Math.pow(Math.abs(n), CAROUSEL_WHEEL_SHAPE_EXP) * cap;
  const rest =
    Math.abs(scrollState.velocity) < CAROUSEL_WHEEL_REST_VEL
      ? CAROUSEL_WHEEL_REST_MULT
      : 1;
  const dv = shaped * CAROUSEL_WHEEL_MULT * rest;
  scrollState.velocity = clampScrollVelocity(scrollState.velocity + dv);
  scrollState.snapOverride = null;
}, { passive: false });

let touchStartX = 0;
let touchStartCurrent = 0;
let lastTouchX = 0;
let lastTouchT = 0;
let touchReleaseVel = 0;
window.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartCurrent = scrollState.current;
  lastTouchX = touchStartX;
  lastTouchT = performance.now();
  touchReleaseVel = 0;
  scrollState.isDragging = true;
  scrollState.snapOverride = null;
});
window.addEventListener('touchmove', (e) => {
  if (!scrollState.isDragging) return;
  const x = e.touches[0].clientX;
  const delta = (touchStartX - x) / window.innerWidth;
  scrollState.current = touchStartCurrent + delta;
  const now = performance.now();
  const dt = Math.max(0.001, (now - lastTouchT) / 1000);
  touchReleaseVel = (lastTouchX - x) / window.innerWidth / dt * 0.018;
  lastTouchX = x;
  lastTouchT = now;
});
function endTouch() {
  if (!scrollState.isDragging) return;
  scrollState.isDragging = false;
  scrollState.velocity = clampScrollVelocity(scrollState.velocity + touchReleaseVel);
}
window.addEventListener('touchend', endTouch);
window.addEventListener('touchcancel', endTouch);

window.addEventListener('mousemove', (e) => {
  mouseState.target.x = ((e.clientX / window.innerWidth) * 2 - 1);
  mouseState.target.y = -((e.clientY / window.innerHeight) * 2 - 1);
  const dist = Math.sqrt(mouseState.target.x**2 + mouseState.target.y**2);
  if (dist > mouseState.boundaryRadius) {
    mouseState.target.x = (mouseState.target.x / dist) * mouseState.boundaryRadius;
    mouseState.target.y = (mouseState.target.y / dist) * mouseState.boundaryRadius;
  }
});
function syncPageBackgroundCss() {
  document.documentElement.style.setProperty('--bg-base', '#000000');
  document.documentElement.style.setProperty('--bg-spot1', '#00ff2acc');
  document.documentElement.style.setProperty('--bg-spot2', '#00ff2acc');
}
function syncOrbSceneBackdrop() {
  sceneOrb.background = null;
  orbRenderer.setClearColor(0x000000, 0);
}
function applyBaseToClear() {
  syncOrbSceneBackdrop();
  syncPageBackgroundCss();
}
applyBaseToClear();

// --- Appearance state (for loading published appearance.json) ---
let _pendingAppearance = null;

function _applyDitherFromAppearance(state) {
  if (!aboutDitherUniforms || !state?.inputs) return;
  const map = {
    's-dither-depth': 'uDepthStrength',
    's-dither-scale': 'uDotScale',
    's-dither-fill': 'uDotRadius',
  };
  for (const [id, uniform] of Object.entries(map)) {
    if (state.inputs[id] != null && aboutDitherUniforms[uniform]) {
      aboutDitherUniforms[uniform].value = parseFloat(state.inputs[id]);
    }
  }
  if (state.inputs['s-dither-tilt'] != null) {
    aboutDitherTiltMax = parseFloat(state.inputs['s-dither-tilt']);
  }
}

function applyAppearanceStateDirect(state) {
  if (!state || !state.inputs) return;

  const inputMap = {
    'c-line': (v) => { bgSettings.lineColor = parseColorToVec4(v); },
    'c-bg': (v) => { bgSettings.backgroundColor = parseColorToVec4(v); },
    's-speed': (v) => { bgSettings.speed = parseFloat(v); },
    's-amp': (v) => { bgSettings.amplitude = parseFloat(v); },
    's-tilt': (v) => { bgSettings.tilt = parseFloat(v); },
    's-zoom': (v) => { bgSettings.zoom = parseFloat(v); },
    's-height': (v) => { bgSettings.cameraHeight = parseFloat(v); },
    's-bright': (v) => { bgSettings.lightIntensity = parseFloat(v); },
    'c-glass': (v) => { glassMaterial.color.set(v); glassMaterial.attenuationColor.set(v); },
    's-g-trans': (v) => { glassMaterial.transmission = parseFloat(v); },
    's-g-shine': (v) => { glassMaterial.specularIntensity = parseFloat(v); },
    's-g-edge': (v) => { glassMaterial.thickness = parseFloat(v); },
    's-g-blur': (v) => { glassMaterial.roughness = parseFloat(v); },
    's-g-ior': (v) => { glassMaterial.ior = parseFloat(v); },
    's-g-vol': (v) => { glassMaterial.attenuationDistance = parseFloat(v); },
    's-size': (v) => { orbSettings.baseSize = parseFloat(v); },
    's-wiggle': (v) => { orbSettings.wiggleIntensity = parseFloat(v); },
    's-wander': (v) => { orbSettings.wanderIntensity = parseFloat(v); },
    's-roll': (v) => { orbSettings.rollIntensity = parseFloat(v); },
    's-squish': (v) => { orbSettings.pairSquishIntensity = parseFloat(v); },
    's-bound': (v) => { mouseState.boundaryRadius = parseFloat(v); },
    's-lx': (v) => { keyLight.position.x = parseFloat(v); },
    's-ly': (v) => { keyLight.position.y = parseFloat(v); },
    's-lz': (v) => { keyLight.position.z = parseFloat(v); },
    's-li': (v) => { keyLight.intensity = parseFloat(v); },
    's-logo-scale-a': (v) => { orbLogoMesh.scale.setScalar(parseFloat(v)); },
    's-logo-scale-b': (v) => { orbLogoMeshB.scale.setScalar(parseFloat(v)); },
    's-logo-scale-c': (v) => { orbLogoMeshC.scale.setScalar(parseFloat(v)); },
  };

  for (const [id, val] of Object.entries(state.inputs)) {
    const fn = inputMap[id];
    if (fn) fn(val);
  }

  // Re-sync background after color changes
  applyBaseToClear();

  if (state.glass) {
    const g = state.glass;
    if (g.attenuationColor) glassMaterial.attenuationColor.set(g.attenuationColor);
    if (g.envMapIntensity != null) glassMaterial.envMapIntensity = g.envMapIntensity;
    if (g.clearcoat != null) glassMaterial.clearcoat = g.clearcoat;
    if (g.clearcoatRoughness != null) glassMaterial.clearcoatRoughness = g.clearcoatRoughness;
  }

  if (state.orbLogos) {
    ['a', 'b', 'c'].forEach((slot) => {
      const entry = state.orbLogos[slot];
      if (entry && entry.dataUrl) {
        if (slot === 'a') orbLogoDataUrlA = entry.dataUrl;
        else if (slot === 'b') orbLogoDataUrlB = entry.dataUrl;
        else orbLogoDataUrlC = entry.dataUrl;
        loadOrbLogoFromDataUrl(entry.dataUrl, slot);
        if (entry.scale != null) {
          const mesh = slot === 'a' ? orbLogoMesh : slot === 'b' ? orbLogoMeshB : orbLogoMeshC;
          mesh.scale.setScalar(entry.scale);
        }
      } else {
        clearOrbLogo(slot);
      }
    });
  }

  // Dither — may need to defer if uniforms aren't ready yet (async texture load)
  _applyDitherFromAppearance(state);
  if (!aboutDitherUniforms) _pendingAppearance = state;
}

// Expose shared state for admin.js
window.APP = {
  bgSettings, orbSettings, mouseState, keyLight, glassMaterial,
  orbRenderer, sceneOrb,
  orbLogoMesh, orbLogoMeshB, orbLogoMeshC,
  orbLogoMatA, orbLogoMatB, orbLogoMatC,
  loadOrbLogoFromDataUrl, clearOrbLogo, syncOrbLogoScale,
  applyBaseToClear, syncPageBackgroundCss, syncOrbSceneBackdrop,
  applyAppearanceStateDirect,
  get aboutDitherUniforms() { return aboutDitherUniforms; },
  get aboutDitherTiltMax() { return aboutDitherTiltMax; },
  set aboutDitherTiltMax(v) { aboutDitherTiltMax = v; },
  get orbLogoDataUrlA() { return orbLogoDataUrlA; },
  set orbLogoDataUrlA(v) { orbLogoDataUrlA = v; },
  get orbLogoDataUrlB() { return orbLogoDataUrlB; },
  set orbLogoDataUrlB(v) { orbLogoDataUrlB = v; },
  get orbLogoDataUrlC() { return orbLogoDataUrlC; },
  set orbLogoDataUrlC(v) { orbLogoDataUrlC = v; },
  ORB_LOGO_STORAGE_KEY_A, ORB_LOGO_STORAGE_KEY_B, ORB_LOGO_STORAGE_KEY_C,
};

const CAROUSEL_N = 3;
/** Scale multiplier at full focus (depth → 1). Ramped smoothly via depth, not a hard switch. */
const CAROUSEL_FRONT_SCALE = 1.68;
/** Scale when depth is low; ramps up between CAROUSEL_FOCUS_DEPTH_LO and CAROUSEL_FOCUS_DEPTH_HI. */
const CAROUSEL_BACK_SCALE = 0.88;
const CAROUSEL_FOCUS_DEPTH_LO = 0.34;
const CAROUSEL_FOCUS_DEPTH_HI = 0.995;
/** Non-front slides (side / “background” carousel items). */
const CAROUSEL_NONFRONT_OPACITY = 0;
/** Uniform scale for all carousel slide content (~75%). */
const CAROUSEL_VISUAL_SCALE = 0.75;

function getCarouselFrontIndex(phi) {
  let bestIdx = 0;
  let bestDepth = -2;
  carouselItems.forEach((el) => {
    const i = parseInt(el.dataset.index, 10);
    const alpha = Math.PI / 2 + i * (2 * Math.PI / CAROUSEL_N) - phi;
    const depth = Math.sin(alpha);
    if (depth > bestDepth) {
      bestDepth = depth;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/** Swaps background marquee phrases when the front carousel slide changes (set by initBgPhraseCycle). */
let syncBgPhraseCarousel = () => {};
/** Clears phrase-cycle timers while scrolling (assigned in initBgPhraseCycle). */
let pauseBgPhraseCycleOnScroll = () => {};

/** Fade background marquee while the carousel is moving between slides. */
const BG_MARQUEE_SCROLL_VEL_EPS = 0.0018;
const BG_MARQUEE_SCROLL_POS_EPS = 0.014;
let lastBgMarqueeMoving = undefined;
function updateBgMarqueeScrollFade(moving) {
  const wrap = document.getElementById('bg-marquee-opacity-wrap');
  if (!wrap) return;
  if (moving === lastBgMarqueeMoving) return;
  lastBgMarqueeMoving = moving;
  if (moving) {
    wrap.classList.remove('bg-marquee-opacity-wrap--fade-in');
    wrap.style.opacity = '0';
  } else {
    wrap.classList.add('bg-marquee-opacity-wrap--fade-in');
    void wrap.offsetWidth;
    wrap.style.opacity = '1';
  }
}

function updateOrbBackdropSampleUv() {
  const rect = orbContainer.getBoundingClientRect();
  const cx = (rect.left + rect.width * 0.5) / window.innerWidth;
  const cy = 1.0 - (rect.top + rect.height * 0.5) / window.innerHeight;
  orbBackdropUniforms.uBackdropSampleUv.value.set(cx, cy);
  const orbW = rect.width / window.innerWidth;
  const orbH = rect.height / window.innerHeight;
  // Fullscreen-UV patch for 3×3 taps — ~½ orb minor axis so averaged gradient matches the visible sphere.
  orbBackdropUniforms.uBackdropSampleRadius.value = Math.min(orbW, orbH) * 0.5;
}
function updateEllipseLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = vw * 0.5;
  const cy = vh * 0.5;
  const rx = Math.min(vw * 0.44, 520);
  // Shorter vertical semi-axis (depth of the ellipse in screen Y) — keeps side cards from flying too high/low.
  const ry = Math.min(vh * 0.13, 150);
  const phi = scrollState.current * (2 * Math.PI / CAROUSEL_N);
  const bestIdx = getCarouselFrontIndex(phi);

  carouselItems.forEach((el) => {
    const i = parseInt(el.dataset.index, 10);
    const alpha = Math.PI / 2 + i * (2 * Math.PI / CAROUSEL_N) - phi;
    const depth = Math.sin(alpha);
    const x = cx + rx * Math.cos(alpha);
    // Front item (sin α = 1) sits at cy; shallower ry keeps the orbit nearer mid-screen.
    const y = cy + ry * Math.sin(alpha) - ry;
    let scale = 0.38 + 0.62 * Math.max(0, Math.min(1, 0.5 + 0.5 * depth));
    const focusT = smoothstep(CAROUSEL_FOCUS_DEPTH_LO, CAROUSEL_FOCUS_DEPTH_HI, depth);
    const focusMult = CAROUSEL_BACK_SCALE + (CAROUSEL_FRONT_SCALE - CAROUSEL_BACK_SCALE) * focusT;
    scale *= focusMult;
    let opacity = 0.45 + 0.55 * Math.max(0, Math.min(1, 0.42 + 0.58 * depth));
    if (i !== bestIdx) opacity = CAROUSEL_NONFRONT_OPACITY;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = `translate(-50%, -50%) scale(${scale * CAROUSEL_VISUAL_SCALE})`;
    el.style.opacity = String(opacity);
    el.style.zIndex = String(Math.round(40 + 120 * Math.max(0, depth)));
    el.classList.toggle('is-front', i === bestIdx);
  });
  syncCarouselPagination(bestIdx);
  const snapGoal =
    scrollState.snapOverride != null
      ? scrollState.snapOverride
      : Math.round(scrollState.current);
  const posErr = Math.abs(scrollState.current - snapGoal);
  const carouselMoving =
    scrollState.isDragging ||
    scrollState.snapOverride != null ||
    Math.abs(scrollState.velocity) > BG_MARQUEE_SCROLL_VEL_EPS ||
    posErr > BG_MARQUEE_SCROLL_POS_EPS;
  if (carouselMoving) {
    pauseBgPhraseCycleOnScroll();
  } else {
    syncBgPhraseCarousel(bestIdx);
  }
  updateBgMarqueeScrollFade(carouselMoving);
  updateOrbBackdropSampleUv();
}

function syncCarouselPagination(activeIdx) {
  const root = document.getElementById('carousel-pagination');
  if (!root) return;
  root.querySelectorAll('.carousel-dot').forEach((btn) => {
    const idx = parseInt(btn.getAttribute('data-slide'), 10);
    const on = idx === activeIdx;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
  });
}

/** About slide: depth-displaced plane + halftone fragment (Codrops-style). Color + depth maps live in Dither Mapping Experiment/ */
let aboutDitherRender = null;
let aboutDitherUniforms = null;
let aboutDitherTiltMax = 0.38;

function applyDitherPanelToUniforms() {
  if (!aboutDitherUniforms) return;
  const depthEl = document.getElementById('s-dither-depth');
  const scaleEl = document.getElementById('s-dither-scale');
  const fillEl = document.getElementById('s-dither-fill');
  const tiltEl = document.getElementById('s-dither-tilt');
  if (depthEl) aboutDitherUniforms.uDepthStrength.value = parseFloat(depthEl.value);
  if (scaleEl) aboutDitherUniforms.uDotScale.value = parseFloat(scaleEl.value);
  if (fillEl) aboutDitherUniforms.uDotRadius.value = parseFloat(fillEl.value);
  if (tiltEl) aboutDitherTiltMax = parseFloat(tiltEl.value);
}
function initAboutDitherPortrait() {
  const mount = document.getElementById('about-dither-mount');
  if (!mount) return;
  const loader = new THREE.TextureLoader();
  const SEG = 160;
  const DITHER_DIR = 'Dither%20Mapping%20Experiment';
  /* TextureLoader accepts PNG, JPEG, WebP, etc. */
  const PHOTO_URL = `${DITHER_DIR}/about-photo.png`;
  const DEPTH_URL = `${DITHER_DIR}/about-depth.png`;

  function makeFallbackTextures() {
    const w = 256;
    const h = 256;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#7a9fd4');
    g.addColorStop(0.45, '#3d6aa8');
    g.addColorStop(1, '#1a3a62');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.38, w * 0.14, 0, Math.PI * 2);
    ctx.fill();
    const colorTex = new THREE.CanvasTexture(c);
    colorTex.colorSpace = THREE.SRGBColorSpace;

    const dc = document.createElement('canvas');
    dc.width = w;
    dc.height = h;
    const dx = dc.getContext('2d');
    const rg = dx.createRadialGradient(w * 0.48, h * 0.38, 2, w * 0.48, h * 0.38, w * 0.6);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.55, '#555555');
    rg.addColorStop(1, '#101010');
    dx.fillStyle = rg;
    dx.fillRect(0, 0, w, h);
    const depthTex = new THREE.CanvasTexture(dc);
    depthTex.colorSpace = THREE.LinearSRGBColorSpace;
    return { colorTex, depthTex };
  }

  function buildMesh(colorTex, depthTex) {
    const iw = colorTex.image?.width || 3;
    const ih = colorTex.image?.height || 4;
    const aspect = iw / Math.max(1, ih);
    const ph = 2.2;
    const pw = ph * aspect;
    const geom = new THREE.PlaneGeometry(pw, ph, SEG, SEG);
    const uniforms = {
      uTexture: { value: colorTex },
      uDepth: { value: depthTex },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uDepthStrength: { value: 0.55 },
      uTime: { value: 0 },
      /** Higher = finer / smaller dots; lower = coarser / larger dots. */
      uDotScale: { value: 56 },
      uDotRadius: { value: 0.48 },
      uAspect: { value: 1 },
    };
    const vs = `
      uniform sampler2D uDepth;
      uniform float uDepthStrength;
      uniform vec2 uMouse;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        float dz = texture2D(uDepth, uv).r;
        vec3 pos = position;
        pos.z += dz * uDepthStrength;
        float m = distance(uv, uMouse);
        float ripple = smoothstep(0.42, 0.0, m) * 0.38;
        pos.z += ripple * sin(uTime * 2.8 + uv.x * 12.0 + uv.y * 9.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;
    const fs = `
      uniform sampler2D uTexture;
      uniform float uDotScale;
      uniform float uDotRadius;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(uTexture, vUv);
        float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
        vec2 grid = vec2(uDotScale, uDotScale / max(uAspect, 0.2));
        vec2 coord = vUv * grid;
        vec2 fr = fract(coord);
        float dist = distance(fr, vec2(0.5));
        float rad = lum * uDotRadius;
        float inside = step(dist, rad);
        gl_FragColor = vec4(vec3(1.0), tex.a * inside);
      }
    `;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vs,
      fragmentShader: fs,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const tiltGroup = new THREE.Group();
    tiltGroup.add(mesh);
    const scene = new THREE.Scene();
    scene.add(tiltGroup);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    cam.position.z = 3.15;

    /** Hover: rotate the [PlaneGeometry](https://threejs.org/docs/#api/en/geometries/PlaneGeometry) toward the pointer (screen-space card tilt). */
    let targetTiltX = 0;
    let targetTiltY = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    function resize() {
      const rw = Math.max(1, mount.clientWidth);
      const rh = Math.max(1, mount.clientHeight);
      renderer.setSize(rw, rh);
      cam.aspect = rw / rh;
      cam.updateProjectionMatrix();
      uniforms.uAspect.value = rw / Math.max(1, rh);
    }
    resize();
    new ResizeObserver(resize).observe(mount);

    mount.addEventListener('pointermove', (e) => {
      const r = mount.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      uniforms.uMouse.value.x = nx;
      uniforms.uMouse.value.y = 1.0 - ny;
      targetTiltY = (nx - 0.5) * 2 * aboutDitherTiltMax;
      targetTiltX = -(ny - 0.5) * 2 * aboutDitherTiltMax;
    });
    mount.addEventListener('pointerleave', () => {
      uniforms.uMouse.value.set(0.5, 0.5);
      targetTiltX = 0;
      targetTiltY = 0;
    });

    const tiltEase = 0.13;
    aboutDitherUniforms = uniforms;
    applyDitherPanelToUniforms();
    if (_pendingAppearance) {
      _applyDitherFromAppearance(_pendingAppearance);
      _pendingAppearance = null;
    }

    aboutDitherRender = (timeT) => {
      mat.uniforms.uTime.value = timeT;
      tiltGroup.rotation.x += (targetTiltX - tiltGroup.rotation.x) * tiltEase;
      tiltGroup.rotation.y += (targetTiltY - tiltGroup.rotation.y) * tiltEase;
      renderer.render(scene, cam);
    };
  }

  function loadTex(url) {
    return new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
  }
  Promise.all([loadTex(PHOTO_URL), loadTex(DEPTH_URL)])
    .then(([c, d]) => {
      c.colorSpace = THREE.SRGBColorSpace;
      d.colorSpace = THREE.LinearSRGBColorSpace;
      d.wrapS = THREE.ClampToEdgeWrapping;
      d.wrapT = THREE.ClampToEdgeWrapping;
      buildMesh(c, d);
    })
    .catch(() => {
      const fb = makeFallbackTextures();
      buildMesh(fb.colorTex, fb.depthTex);
    });
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  const time = performance.now();
  const t = time * 0.001;

  if (!scrollState.isDragging) {
    if (
      scrollState.snapOverride != null &&
      Math.abs(scrollState.current - scrollState.snapOverride) < 0.018 &&
      Math.abs(scrollState.velocity) < 0.007
    ) {
      scrollState.current = scrollState.snapOverride;
      scrollState.velocity = 0;
      scrollState.snapOverride = null;
    } else {
      const snapGoal =
        scrollState.snapOverride != null
          ? scrollState.snapOverride
          : carouselSnapGoal(scrollState.current);
      const spring =
        scrollState.snapOverride != null ? CAROUSEL_SPRING_MENU : CAROUSEL_SPRING;
      let err = snapGoal - scrollState.current;
      err = Math.max(-CAROUSEL_SPRING_ERR_MAX, Math.min(CAROUSEL_SPRING_ERR_MAX, err));
      let springK = spring;
      if (
        scrollState.snapOverride == null &&
        Math.abs(scrollState.velocity) > CAROUSEL_SPRING_OPPOSE_VEL &&
        err * scrollState.velocity < 0
      ) {
        springK *= CAROUSEL_SPRING_OPPOSE_MULT;
      }
      scrollState.velocity += err * springK;
      scrollState.velocity *= CAROUSEL_DAMPING;
      const v = scrollState.velocity;
      if (Math.abs(v) > 1e-6) {
        scrollState.velocity -= Math.sign(v) * CAROUSEL_DRAG_QUAD * v * v;
      }
      scrollState.velocity = clampScrollVelocity(scrollState.velocity);
    }
    scrollState.current += scrollState.velocity;
  }

  // Fold by whole rotations so scroll stays small (layout repeats every CAROUSEL_N) without capping travel.
  if (
    !scrollState.isDragging &&
    Math.abs(scrollState.velocity) < 0.0008 &&
    scrollState.snapOverride == null
  ) {
    const ti = Math.round(scrollState.current);
    if (
      Math.abs(scrollState.current - ti) < 1e-4
    ) {
      const k = Math.floor(ti / CAROUSEL_N) * CAROUSEL_N;
      if (k !== 0) scrollState.current -= k;
    }
  }

  updateEllipseLayout();

  const nowMs = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastOrbPhysMs) / 1000));
  lastOrbPhysMs = nowMs;
  const squishDecay = Math.exp(-dt * ORB_PAIR_SQUISH.decay);
  orbDeformA.mag *= squishDecay;
  orbDeformB.mag *= squishDecay;
  orbDeformC.mag *= squishDecay;
  stepOrbPhysics(dt, t);

  orbGroup.position.x = orbPhysA.px;
  orbGroup.position.y = orbPhysA.py;
  orbGroupB.position.x = orbPhysB.px;
  orbGroupB.position.y = orbPhysB.py;
  orbGroupC.position.x = orbPhysC.px;
  orbGroupC.position.y = orbPhysC.py;

  const velAx = orbPhysA.vx;
  const velAy = orbPhysA.vy;
  const velBx = orbPhysB.vx;
  const velBy = orbPhysB.vy;
  const velCx = orbPhysC.vx;
  const velCy = orbPhysC.vy;

  const speedA = Math.sqrt(velAx ** 2 + velAy ** 2);
  const speedB = Math.sqrt(velBx ** 2 + velBy ** 2);
  const speedC = Math.sqrt(velCx ** 2 + velCy ** 2);
  const breathA = 1 + 0.035 * Math.sin(t * 1.15 + 0.2);
  const breathB = 1 + 0.035 * Math.sin(t * 1.28 + 1.8);
  const breathC = 1 + 0.035 * Math.sin(t * 1.21 + 0.95);
  const bs = orbSettings.baseSize;
  if (speedA > 0.001) {
    orbRollGroup.rotation.z = Math.atan2(velAy, velAx) * orbSettings.rollIntensity;
  }
  if (speedB > 0.001) {
    orbRollGroupB.rotation.z = Math.atan2(velBy, velBx) * orbSettings.rollIntensity;
  }
  if (speedC > 0.001) {
    orbRollGroupC.rotation.z = Math.atan2(velCy, velCx) * orbSettings.rollIntensity;
  }
  applyOrbSquishScale(orbRollGroup, orbSquishGroup, orbDeformA, bs, breathA);
  applyOrbSquishScale(orbRollGroupB, orbSquishGroupB, orbDeformB, bs, breathB);
  applyOrbSquishScale(orbRollGroupC, orbSquishGroupC, orbDeformC, bs, breathC);
  orbBackdropUniformGroup.scale.setScalar(bs * breathA);
  orbBackdropUniformGroupB.scale.setScalar(bs * breathB);
  orbBackdropUniformGroupC.scale.setScalar(bs * breathC);

  const wig = orbSettings.wiggleIntensity;
  const posA = glassOrb.geometry.attributes.position;
  for (let i = 0; i < posA.count; i++) {
    const x = originalPositions.getX(i),
      y = originalPositions.getY(i),
      z = originalPositions.getZ(i);
    const wobble = Math.sin(y * 3.0 + t * 3.0 + 0.7) * 0.05 * wig;
    posA.setXYZ(i, x + wobble, y + wobble, z + wobble);
  }
  posA.needsUpdate = true;
  const posB = glassOrbB.geometry.attributes.position;
  for (let i = 0; i < posB.count; i++) {
    const x = originalPositionsB.getX(i),
      y = originalPositionsB.getY(i),
      z = originalPositionsB.getZ(i);
    const wobble = Math.sin(y * 3.15 + t * 3.45 + 2.15) * 0.05 * wig;
    posB.setXYZ(i, x + wobble, y + wobble, z + wobble);
  }
  posB.needsUpdate = true;
  const posC = glassOrbC.geometry.attributes.position;
  for (let i = 0; i < posC.count; i++) {
    const x = originalPositionsC.getX(i),
      y = originalPositionsC.getY(i),
      z = originalPositionsC.getZ(i);
    const wobble = Math.sin(y * 3.08 + t * 3.22 + 1.4) * 0.05 * wig;
    posC.setXYZ(i, x + wobble, y + wobble, z + wobble);
  }
  posC.needsUpdate = true;
  renderBgShader(t);
  orbRenderer.render(sceneOrb, cameraOrb);
  if (aboutDitherRender) aboutDitherRender(t);
}
animate();
initAboutDitherPortrait();

(function initBgPhraseCycle() {
  const el = document.getElementById('bg-marquee-phrase');
  if (!el) return;

  /** Featured / orbs slide (index 1): single background label. */
  const phrasesFeatured = ['Featured'];
  /** Blog slide (index 2): single background label. */
  const phrasesBlog = ['Blog'];
  /** About slide (index 0): cycle “Hello!” in each language — matches the Hello! card. */
  const phrasesHello = [
    { lang: 'en', text: 'Hello!' },
    { lang: 'es', text: '¡Hola!' },
    { lang: 'fr', text: 'Bonjour !' },
    { lang: 'zh-Hans', text: '你好！' },
    { lang: 'ja', text: 'こんにちは！' },
    { lang: 'it', text: 'Ciao!' },
    { lang: 'de', text: 'Hallo!' },
    { lang: 'jam', text: 'Wah gwaan!' },
    { lang: 'nl', text: 'Hallo!' },
    { lang: 'ru', text: 'Привет!' },
    { lang: 'pt', text: 'Olá!' },
    { lang: 'hi', text: 'नमस्ते!' },
  ];

  const targetOpacity = 0.1;
  /** Must match --bg-marquee-settle-duration */
  const SETTLE_MS = 4000;
  /** Must match --bg-marquee-phrase-opacity-duration */
  const fadeMs = 1950;
  const holdMs = 4000;
  const slideInPx = 26;
  const slideOutPx = 16;

  let phrases = phrasesHello;
  let idx = 0;
  let timer = null;
  let lastSlideForPhrases = -999;

  function phraseText(p) {
    return typeof p === 'string' ? p : p.text;
  }
  function phraseLang(p) {
    return typeof p === 'string' ? 'en' : p.lang;
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function showPhrase(fromSlideChange = false) {
    clearTimer();
    if (!fromSlideChange) {
      el.classList.remove('bg-marquee__line--settle-in');
    }
    const p = phrases[idx];
    el.lang = phraseLang(p);
    el.textContent = phraseText(p);

    if (phrases.length === 1) {
      if (fromSlideChange) {
        el.classList.add('bg-marquee__line--settle-in');
        el.style.opacity = '0';
        el.style.transform = 'translate3d(0, 0, 0)';
        void el.offsetWidth;
        requestAnimationFrame(() => {
          el.style.opacity = String(targetOpacity);
        });
      } else {
        el.style.opacity = String(targetOpacity);
        el.style.transform = 'translate3d(0, 0, 0)';
      }
      return;
    }

    if (fromSlideChange) {
      el.classList.add('bg-marquee__line--settle-in');
      el.style.opacity = '0';
      el.style.transform = 'translate3d(0, 0, 0)';
      void el.offsetWidth;
      requestAnimationFrame(() => {
        el.style.opacity = String(targetOpacity);
        el.style.transform = 'translate3d(0, 0, 0)';
      });
      timer = window.setTimeout(() => {
        el.classList.remove('bg-marquee__line--settle-in');
        el.style.opacity = '0';
        el.style.transform = `translate3d(0, ${-slideOutPx}px, 0)`;
        timer = window.setTimeout(() => {
          idx = (idx + 1) % phrases.length;
          showPhrase(false);
        }, fadeMs);
      }, SETTLE_MS + holdMs);
      return;
    }

    el.style.opacity = '0';
    el.style.transform = `translate3d(0, ${slideInPx}px, 0)`;
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.opacity = String(targetOpacity);
      el.style.transform = 'translate3d(0, 0, 0)';
    });
    timer = window.setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = `translate3d(0, ${-slideOutPx}px, 0)`;
      timer = window.setTimeout(() => {
        idx = (idx + 1) % phrases.length;
        showPhrase(false);
      }, fadeMs);
    }, fadeMs + holdMs);
  }

  function applyReducedMotionStatic() {
    el.textContent = phrases.map(phraseText).join(' ');
    el.lang = 'en';
    el.style.opacity = String(targetOpacity);
    el.style.transform = 'none';
    el.style.transition = 'none';
  }

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

  syncBgPhraseCarousel = function syncBgPhraseCarouselFn(bestIdx) {
    if (bestIdx === lastSlideForPhrases) return;
    lastSlideForPhrases = bestIdx;
    if (bestIdx === 0) phrases = phrasesHello;
    else if (bestIdx === 1) phrases = phrasesFeatured;
    else phrases = phrasesBlog;
    idx = 0;
    clearTimer();
    if (mq.matches) {
      applyReducedMotionStatic();
      return;
    }
    showPhrase(true);
  };

  pauseBgPhraseCycleOnScroll = clearTimer;

  if (mq.matches) {
    const phi = scrollState.current * (2 * Math.PI / CAROUSEL_N);
    const fr = getCarouselFrontIndex(phi);
    if (fr === 0) phrases = phrasesHello;
    else if (fr === 1) phrases = phrasesFeatured;
    else phrases = phrasesBlog;
    applyReducedMotionStatic();
    return;
  }

  const phi = scrollState.current * (2 * Math.PI / CAROUSEL_N);
  syncBgPhraseCarousel(getCarouselFrontIndex(phi));
})();

function syncBgViewport() {
  const { w, h } = bgDrawBufferSize();
  sizeBgCanvas(w, h);
}
window.addEventListener('resize', () => {
  syncBgViewport();
  updateEllipseLayout();
});
window.addEventListener('load', () => {
  syncBgViewport();
  updateEllipseLayout();
});
if (safariBrowser && window.visualViewport) {
  const vvSync = () => {
    syncBgViewport();
    updateEllipseLayout();
  };
  window.visualViewport.addEventListener('resize', vvSync);
  window.visualViewport.addEventListener('scroll', vvSync);
}

function syncMenuAria() {
  const open = menuOverlay.classList.contains('is-open');
  menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('is-active');
  menuOverlay.classList.toggle('is-open');
  syncMenuAria();
});
menuToggle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    menuToggle.click();
  }
});
document.querySelectorAll('.menu-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const idx = parseInt(link.getAttribute('data-slide'), 10);
    if (!Number.isNaN(idx)) {
      scrollState.snapOverride = idx;
      scrollState.velocity = clampScrollVelocity(
        scrollState.velocity + (idx - scrollState.current) * 0.055
      );
    }
    menuToggle.classList.remove('is-active');
    menuOverlay.classList.remove('is-open');
    syncMenuAria();
  });
});

const carouselPagination = document.getElementById('carousel-pagination');
if (carouselPagination) {
  carouselPagination.addEventListener('click', (e) => {
    const dot = e.target.closest('.carousel-dot');
    if (!dot) return;
    const idx = parseInt(dot.getAttribute('data-slide'), 10);
    if (Number.isNaN(idx)) return;
    scrollState.snapOverride = idx;
    scrollState.velocity = clampScrollVelocity(
      scrollState.velocity + (idx - scrollState.current) * 0.055
    );
  });
}

// --- Featured project modal (orb tap / click when that slide is in front) ---
const featuredProjects = [
  {
    title: 'Case study',
    sections: [
      {
        id: 'context',
        label: 'Context',
        text:
          'I worked as a Senior Product Designer, leading design for onboarding, AI-chat triage, design system governance, and accessibility initiatives across the product org.',
      },
      {
        id: 'contributions',
        label: 'Contributions',
        text:
          'Shipped flows that reduced time-to-value for new teams, partnered with engineering on the design system, and ran accessibility audits on core journeys.',
      },
      {
        id: 'outcomes',
        label: 'Outcomes',
        text:
          'Measurable lifts in activation and task completion; stronger alignment between design and engineering through shared tokens and documentation.',
      },
      {
        id: 'next',
        label: 'What’s next',
        text:
          'Exploring assistant-first patterns and continuing to harden the system for scale across markets.',
      },
    ],
  },
];

let featuredProjectIndex = 0;
const projectModalEl = document.getElementById('project-modal');
const carouselViewportEl = document.getElementById('projects');

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

let projectModalScrollSpyCleanup = null;
let projectModalContentRevealTimer = null;

function teardownProjectModalScrollSpy() {
  if (projectModalScrollSpyCleanup) {
    projectModalScrollSpyCleanup();
    projectModalScrollSpyCleanup = null;
  }
}

function setupProjectModalScrollSpy() {
  const scroll = document.getElementById('project-modal-scroll');
  const toc = document.getElementById('project-modal-toc');
  if (!scroll || !toc) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sectionScrollInto = (sec) => {
    const st = scroll.scrollTop;
    const contentTop = st + sec.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    return st - contentTop;
  };

  const updateSectionScales = () => {
    const viewH = scroll.clientHeight;
    scroll.querySelectorAll('.project-modal__section').forEach((sec) => {
      const pin = sec.querySelector('.project-modal__section-pin');
      if (!pin) return;
      if (reduceMotion || sec.offsetHeight <= viewH * 1.12) {
        pin.style.removeProperty('transform');
        return;
      }
      const scrollInto = sectionScrollInto(sec);
      if (scrollInto < 0) {
        pin.style.transform = 'scale(1)';
      } else if (scrollInto < viewH) {
        const t = scrollInto / viewH;
        const scale = 1 - Math.min(1, t) * 0.14;
        pin.style.transform = `scale(${scale})`;
      } else {
        pin.style.removeProperty('transform');
      }
    });
  };

  const updateActiveFromScroll = () => {
    const sections = scroll.querySelectorAll('.project-modal__section');
    if (!sections.length) return;
    const st = scroll.scrollTop;
    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    let activeId = null;
    if (st <= 2) {
      activeId = sections[0].dataset.section;
    } else if (maxScroll > 0 && st >= maxScroll - 2) {
      activeId = sections[sections.length - 1].dataset.section;
    } else {
      const viewMid = st + scroll.clientHeight * 0.5;
      let bestDist = Infinity;
      sections.forEach((sec) => {
        const top = st + sec.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
        const center = top + sec.offsetHeight / 2;
        const d = Math.abs(center - viewMid);
        if (d < bestDist) {
          bestDist = d;
          activeId = sec.dataset.section;
        }
      });
    }
    if (!activeId) activeId = sections[0].dataset.section;
    toc.querySelectorAll('.project-modal__toc-link').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.panel === activeId);
    });
    sections.forEach((sec) => {
      sec.classList.toggle('is-section-active', sec.dataset.section === activeId);
    });
  };

  const onScroll = () => {
    window.requestAnimationFrame(() => {
      updateActiveFromScroll();
      updateSectionScales();
    });
  };
  scroll.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateActiveFromScroll();
  updateSectionScales();

  projectModalScrollSpyCleanup = () => {
    scroll.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    scroll.querySelectorAll('.project-modal__section-pin').forEach((pin) => {
      pin.style.removeProperty('transform');
    });
  };
}

function renderProjectModalContent() {
  const p = featuredProjects[featuredProjectIndex];
  const toc = document.getElementById('project-modal-toc');
  const panels = document.getElementById('project-modal-panels');
  if (!p || !toc || !panels) return;
  toc.innerHTML = '';
  panels.innerHTML = '';
  const firstId = p.sections[0]?.id || 'context';

  p.sections.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'project-modal__toc-link' + (s.id === firstId ? ' is-active' : '');
    btn.dataset.panel = s.id;
    btn.textContent = s.label;
    toc.appendChild(btn);

    const section = document.createElement('section');
    section.className =
      'project-modal__section' + (s.id === firstId ? ' is-section-active' : '');
    section.id = `section-${s.id}`;
    section.dataset.section = s.id;
    const hId = s.id === firstId ? 'project-modal-heading' : '';
    section.innerHTML = `
      <div class="project-modal__section-pin">
        <div class="project-modal__row">
          <div class="project-modal__media" aria-hidden="true"></div>
          <div class="project-modal__section-copy">
            <h2 class="project-modal__section-title"${hId ? ` id="${hId}"` : ''}>${escapeHtml(s.label)}</h2>
            <p class="project-modal__body-text">${escapeHtml(s.text)}</p>
          </div>
        </div>
      </div>`;
    panels.appendChild(section);
  });

  toc.querySelectorAll('.project-modal__toc-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.panel;
      const sec = document.getElementById(`section-${id}`);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const prevBtn = document.getElementById('project-modal-prev');
  const nextBtn = document.getElementById('project-modal-next');
  if (prevBtn) prevBtn.disabled = featuredProjectIndex <= 0;
  if (nextBtn) nextBtn.disabled = featuredProjectIndex >= featuredProjects.length - 1;
  const footerPrev = document.getElementById('footer-modal-prev');
  const footerNext = document.getElementById('footer-modal-next');
  if (footerPrev) footerPrev.disabled = prevBtn?.disabled ?? true;
  if (footerNext) footerNext.disabled = nextBtn?.disabled ?? true;

  teardownProjectModalScrollSpy();
  resetProjectModalScroll();
  setupProjectModalScrollSpy();
  requestAnimationFrame(() => {
    resetProjectModalScroll();
    const s = document.getElementById('project-modal-scroll');
    if (s) s.dispatchEvent(new Event('scroll'));
  });
}

let isProjectModalClosing = false;
const projectModalDialogEl = document.getElementById('project-modal-dialog');

function resetProjectModalScroll() {
  const el = document.getElementById('project-modal-scroll');
  if (!el) return;
  el.scrollTop = 0;
  el.scrollLeft = 0;
}

function showProjectModalContent() {
  if (projectModalDialogEl.classList.contains('is-content-visible')) return;
  resetProjectModalScroll();
  projectModalDialogEl.classList.add('is-content-visible');
  document.getElementById('nav-modal-close')?.focus();
  requestAnimationFrame(() => {
    resetProjectModalScroll();
    document.getElementById('project-modal-scroll')?.dispatchEvent(new Event('scroll'));
  });
}

function onOpenScaleAnimationEnd(e) {
  if (e.target !== projectModalDialogEl) return;
  const name = e.animationName || '';
  if (!name.includes('project-modal-in')) return;
  projectModalDialogEl.removeEventListener('animationend', onOpenScaleAnimationEnd);
  clearTimeout(projectModalContentRevealTimer);
  projectModalContentRevealTimer = null;
  showProjectModalContent();
}

function syncModalChromeInteractionState() {
  const isActive = document.body.classList.contains('project-modal-active');
  const menu = document.getElementById('menu-toggle');
  const navClose = document.getElementById('nav-modal-close');
  if (menu) menu.tabIndex = isActive ? -1 : 0;
  if (navClose) navClose.tabIndex = isActive ? 0 : -1;
}

function openProjectModal() {
  isProjectModalClosing = false;
  menuToggle.classList.remove('is-active');
  menuOverlay.classList.remove('is-open');
  syncMenuAria();
  renderProjectModalContent();
  projectModalEl.hidden = true;
  projectModalEl.setAttribute('aria-hidden', 'true');

  const runModalReveal = () => {
    clearTimeout(projectModalContentRevealTimer);
    projectModalContentRevealTimer = null;
    projectModalDialogEl.removeEventListener('animationend', onOpenScaleAnimationEnd);
    projectModalEl.hidden = false;
    projectModalEl.setAttribute('aria-hidden', 'false');
    projectModalDialogEl.classList.remove('is-closing', 'is-content-visible');
    projectModalEl.classList.remove('is-open');
    projectModalDialogEl.style.animation = 'none';
    void projectModalDialogEl.offsetWidth;
    projectModalEl.classList.add('is-open');
    const SCALE_MS = 860;
    requestAnimationFrame(() => {
      resetProjectModalScroll();
      document.getElementById('project-modal-scroll')?.dispatchEvent(new Event('scroll'));
      projectModalDialogEl.style.removeProperty('animation');
      projectModalDialogEl.addEventListener('animationend', onOpenScaleAnimationEnd);
      projectModalContentRevealTimer = setTimeout(() => {
        projectModalContentRevealTimer = null;
        showProjectModalContent();
      }, Math.round(SCALE_MS * 0.48));
    });
  };

  const skipCarouselWait =
    !carouselViewportEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (skipCarouselWait) {
    document.body.classList.add('project-modal-active');
    syncModalChromeInteractionState();
    runModalReveal();
    return;
  }

  let carouselFadeDone = false;
  const finishCarouselFade = () => {
    if (carouselFadeDone) return;
    carouselFadeDone = true;
    carouselViewportEl.removeEventListener('transitionend', onCarouselOpacityEnd);
    clearTimeout(carouselFadeWatchdog);
    runModalReveal();
  };

  const onCarouselOpacityEnd = (e) => {
    if (e.target !== carouselViewportEl || e.propertyName !== 'opacity') return;
    finishCarouselFade();
  };

  carouselViewportEl.addEventListener('transitionend', onCarouselOpacityEnd);
  const carouselFadeWatchdog = setTimeout(finishCarouselFade, 700);
  void carouselViewportEl.offsetWidth;
  document.body.classList.add('project-modal-active');
  syncModalChromeInteractionState();
}

function closeProjectModal() {
  if (projectModalEl.hasAttribute('hidden')) return;
  if (!projectModalEl.classList.contains('is-open')) return;
  if (isProjectModalClosing) return;
  isProjectModalClosing = true;

  projectModalDialogEl.removeEventListener('animationend', onOpenScaleAnimationEnd);
  clearTimeout(projectModalContentRevealTimer);
  projectModalContentRevealTimer = null;
  teardownProjectModalScrollSpy();
  projectModalDialogEl.classList.remove('is-content-visible');

  let fallbackTimer;
  const finish = () => {
    if (!isProjectModalClosing) return;
    isProjectModalClosing = false;
    projectModalEl.classList.remove('is-open');
    projectModalDialogEl.classList.remove('is-closing');
    projectModalEl.hidden = true;
    projectModalEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('project-modal-active');
    syncModalChromeInteractionState();
    projectModalDialogEl.removeEventListener('animationend', onAnimationEndClose);
    if (fallbackTimer) clearTimeout(fallbackTimer);
    resetProjectModalScroll();
  };

  const onAnimationEndClose = (e) => {
    if (e.target !== projectModalDialogEl) return;
    const name = e.animationName || '';
    if (!name.includes('project-modal-out')) return;
    finish();
  };

  projectModalDialogEl.addEventListener('animationend', onAnimationEndClose);
  fallbackTimer = setTimeout(finish, 900);
  projectModalDialogEl.classList.add('is-closing');
}

orbContainer.addEventListener('click', () => {
  const front = document.querySelector('.carousel-item.is-front');
  if (!front?.classList.contains('carousel-item--orb')) return;
  const raw = front.getAttribute('data-featured-project');
  const pIdx = raw !== null ? parseInt(raw, 10) : 0;
  if (!Number.isNaN(pIdx) && featuredProjects[pIdx]) featuredProjectIndex = pIdx;
  openProjectModal();
});

document.getElementById('project-modal-close').addEventListener('click', closeProjectModal);
document.getElementById('nav-modal-close').addEventListener('click', closeProjectModal);
document.getElementById('project-modal-backdrop').addEventListener('click', closeProjectModal);
projectModalEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && projectModalEl.classList.contains('is-open')) {
    e.preventDefault();
    closeProjectModal();
  }
});

function navigateProjectModal(newIndex) {
  if (newIndex < 0 || newIndex >= featuredProjects.length) return;
  projectModalDialogEl.classList.add('is-paging');
  projectModalDialogEl.classList.remove('is-content-visible');
  setTimeout(() => {
    featuredProjectIndex = newIndex;
    renderProjectModalContent();
    requestAnimationFrame(() => {
      projectModalDialogEl.classList.remove('is-paging');
      projectModalDialogEl.classList.add('is-content-visible');
    });
  }, 200);
}

document.getElementById('project-modal-prev').addEventListener('click', () => {
  if (featuredProjectIndex > 0) navigateProjectModal(featuredProjectIndex - 1);
});
document.getElementById('project-modal-next').addEventListener('click', () => {
  if (featuredProjectIndex < featuredProjects.length - 1) navigateProjectModal(featuredProjectIndex + 1);
});
document.getElementById('footer-modal-prev').addEventListener('click', () => {
  const b = document.getElementById('project-modal-prev');
  if (b && !b.disabled) b.click();
});
document.getElementById('footer-modal-next').addEventListener('click', () => {
  const b = document.getElementById('project-modal-next');
  if (b && !b.disabled) b.click();
});

// --- Substack RSS feed ---
(async function loadSubstackPosts() {
  const SUBSTACK_FEED = 'https://ryanwashere.substack.com/feed';
  const CARD_COLORS = [
    { card: 'rgba(0, 180, 160, 0.88)',  thumb: '#008f7a' },
    { card: 'rgba(120, 90, 220, 0.9)',  thumb: '#5b3fd4' },
    { card: 'rgba(220, 140, 40, 0.9)',  thumb: '#b86e12' },
    { card: 'rgba(38, 99, 223, 0.92)',  thumb: '#1849af' },
  ];

  let xml;
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(SUBSTACK_FEED)}`);
    xml = await res.text();
  } catch {
    return; // silently keep placeholder cards on network failure
  }

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item')).slice(0, 4);
  if (!items.length) return;

  const grid = document.getElementById('blog-grid');
  if (!grid) return;

  grid.innerHTML = items.map((item, i) => {
    const colors = CARD_COLORS[i % CARD_COLORS.length];
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.nextSibling?.nodeValue?.trim()
      || item.querySelector('guid')?.textContent || '';
    const enclosureUrl = item.querySelector('enclosure')?.getAttribute('url') || '';
    const rawDesc = item.querySelector('description')?.textContent || '';
    const excerpt = rawDesc.replace(/<[^>]+>/g, '').trim().slice(0, 120) + '…';
    const thumbStyle = enclosureUrl
      ? `background-image: url('${enclosureUrl}'); background-size: cover; background-position: center top;`
      : '';
    return `<article class="blog-grid__card" style="--card-color: ${colors.card}; --thumb-color: ${colors.thumb};" role="link" tabindex="0" data-href="${link}">
      <div class="blog-card__meta">
        <h3 class="blog-card__title">${title}</h3>
        <p class="blog-card__excerpt">${excerpt}</p>
      </div>
      <div class="featured-card__arrow" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    </article>`;
  }).join('');

  grid.querySelectorAll('.blog-grid__card[data-href]').forEach(card => {
    const url = card.dataset.href;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') window.open(url, '_blank', 'noopener');
    });
  });
})();

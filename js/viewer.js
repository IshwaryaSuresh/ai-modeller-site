// The hero model: a house exported from Idam as glTF, shown as a white model or
// with its materials, with the floors lifted apart on request. Pointing at any
// part names the element, as it is named in Idam.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MODELS = {
  // Farnsworth's bands: the main floor's plane and the roof's (m above the lower terrace)
  h: { url: 'models/farnsworth.glb', caption: 'Farnsworth House · study model from the HABS survey drawings', levels: [0.33, 3.7], view: [-0.85, 0.55, 1.15] },
  // Fallingwater's floors are cantilevered trays, not named slabs: its bands start at the trays' undersides (m)
  // A practising studio's three-storey family house (client and place kept anonymous)
  t: { url: 'models/residence.glb', caption: 'A family house · built in Idam from the studio’s DWG', view: [-0.55, 0.5, -1.2] },
  f: { url: 'models/fallingwater.glb', caption: 'Fallingwater · study model from the HABS survey drawings', levels: [2.3, 4.75, 7.25], view: [-0.8, 0.42, 1.25] },
};
const canvas = document.getElementById('three');
const stage = canvas.parentElement;
const tip = document.getElementById('tip');
const loading = document.getElementById('loading');
const cap = document.getElementById('stagecap');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const bg = () => getComputedStyle(stage).backgroundColor;
scene.background = new THREE.Color(bg());
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.addEventListener('start', () => { controls.autoRotate = false; });

scene.add(new THREE.HemisphereLight(0xffffff, 0xd6cfc0, 1.25));
const sun = new THREE.DirectionalLight(0xfff1e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
scene.add(fill);
// Depth: ambient occlusion darkens corners, reveals and the undersides of overhangs as daylight does
// (on screens big enough to afford it; phones render plainly)
const rich = matchMedia('(min-width: 760px)').matches;
let composer = null, gtao = null;
if (rich) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, 800, 600);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 1.0;
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.2, thickness: 1.5, scale: 1.0, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.26 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const clay = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.88, metalness: 0 });
const clayDark = new THREE.MeshStandardMaterial({ color: 0xe2ddd2, roughness: 0.95 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfd6dc, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35, depthWrite: false });
const hover = new THREE.MeshStandardMaterial({ color: 0xe08a55, roughness: 0.6, emissive: 0x6b2a08, emissiveIntensity: 0.25 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x2a2f2b, transparent: true, opacity: 0.42 });

// Surfaces as Idam draws them: each material's pattern (coursed stone, flagstone, board-marked concrete,
// grain, travertine...) at true size, mapped by world position as in Idam, and the ground's contours
// (a fine line every 0.5 m, a strong one every 2.5 m). The patterns are Idam's own, baked to images.
const texLoader = new THREE.TextureLoader();
const patterns = fetch('textures/patterns.json').then((r) => r.json()).catch(() => null);
const patternTex = {};
async function patternTexture(name) {
  const man = await patterns;
  if (!man?.patterns?.[name]) return null;
  if (!patternTex[name]) {
    patternTex[name] = texLoader.loadAsync(man.patterns[name].file).then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  }
  return { tex: await patternTex[name], tileMm: man.patterns[name].tileMm };
}
const dressed = new Map();
async function dress(m) {
  if (!m?.userData?.pattern && !m?.userData?.contours) return m;
  if (dressed.has(m)) return dressed.get(m);
  const p = m.userData.pattern ? await patternTexture(m.userData.pattern) : null;
  const d = m.clone();
  if (p) { d.map = p.tex; d.color.multiplyScalar(1 / Number(m.userData.mean || 1)); }
  const tile = (p?.tileMm ?? 1000) / 1000;
  const contours = m.userData.contours ? `
    float hm = vWPos.y / 0.5, hM = vWPos.y / 2.5;
    float fine = 1.0 - min(abs(fract(hm - 0.5) - 0.5) / max(fwidth(hm), 1e-4), 1.0);
    float major = 1.0 - min(abs(fract(hM - 0.5) - 0.5) / max(fwidth(hM) * 1.6, 1e-4), 1.0);
    float steep = 1.0 - smoothstep(0.15, 0.45, abs(vWNormal.y));
    diffuseColor.rgb *= 1.0 - (0.16 * fine + 0.3 * major) * (1.0 - steep);` : '';
  d.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = { value: tile };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform float uTile;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec3 an = abs(vWNormal);
          vec2 puv = an.y > 0.7 ? vWPos.xz : (an.x > an.z ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y));
          diffuseColor *= texture2D(map, puv / uTile);
        #endif
        ${contours}`);
  };
  d.customProgramCacheKey = () => `idam-${m.userData.pattern || 'plain'}-${m.userData.contours ? 'c' : ''}`;
  dressed.set(m, d);
  return d;
}

let root = null, parts = [], look = 'mat', exploded = false, lift = 0, liftTarget = 0, bands = 1, gap = 3, current = 'f';
const loader = new GLTFLoader();
const cache = {};

// The loader writes spaces as underscores and numbers repeated names (South_wall_3); undo both
let names = new Set();
function nameOf(o) {
  while (o && !o.name) o = o.parent;
  let n = o?.name || 'Element';
  const base = n.replace(/_\d+$/, '');
  if (base !== n && names.has(base)) n = base;
  return n.replace(/_/g, ' ').trim();
}
function kindOf(n) {
  const s = n.toLowerCase();
  if (/window|ventilator|clerestory/.test(s)) return 'Window';
  if (/door/.test(s)) return 'Door';
  if (/glass partition/.test(s)) return 'Glass partition';
  if (/partition|wall/.test(s)) return 'Wall';
  if (/column/.test(s)) return 'Column';
  if (/slab|roof/.test(s)) return 'Slab';
  if (/plinth/.test(s)) return 'Plinth';
  if (/band/.test(s)) return 'Band';
  if (/stair|steps|ramp/.test(s)) return 'Stair';
  if (/pond|pool/.test(s)) return 'Water';
  if (/sofa|table|bed|chair|counter|wardrobe|unit|console|shelves|basin|sink|hob|wc|shower|fridge|cupboard|seat|sculpture/.test(s)) return 'Furniture and fittings';
  if (/site/.test(s)) return 'Site';
  return 'Room';
}

async function load(key) {
  current = key;
  loading.style.display = 'grid';
  const gltf = cache[key] ?? (cache[key] = await loader.loadAsync(MODELS[key].url));
  if (current !== key) return;
  if (root) scene.remove(root);
  root = gltf.scene;
  parts = [];
  names = new Set();
  root.traverse((o) => { if (o.name) names.add(o.name); });
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (!o.userData.orig) {
      o.userData.orig = o.material;
      o.userData.dressing = (Array.isArray(o.material) ? Promise.all(o.material.map(dress)) : dress(o.material)).then((m) => { o.userData.orig = m; if (look === 'mat' && hovered !== o) o.material = m; });
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const n = nameOf(o).toLowerCase();
      o.userData.glass = (m.transparent && m.opacity < 0.9) || /glass/.test(n);
      o.userData.site = /^site\b|lawn|terrain|bear run|meadow/.test(n);
      if (!o.userData.glass && !o.userData.site && o.geometry.attributes.position.count < 60000) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat);
        e.raycast = () => {};
        e.userData.edge = true;
        o.add(e);
      }
    }
    parts.push(o);
  });
  scene.add(root);
  root.updateMatrixWorld(true);

  // Floors: each slab named "... floor slab" starts a band; everything at or above it rides with it
  // Framed on the building, not the site round it
  const box = new THREE.Box3();
  for (const p of parts) if (!p.userData.site) box.expandByObject(p);
  if (box.isEmpty()) box.setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const slabs = [];
  root.traverse((o) => { if (o.isMesh && /(first|second|third) floor slab|^roof slab$/i.test(nameOf(o))) slabs.push(new THREE.Box3().setFromObject(o).min.y); });
  const levels = MODELS[key].levels ?? [...new Set(slabs.map((y) => Math.round(y * 100) / 100))].sort((a, b) => a - b);
  bands = levels.length + 1;
  for (const p of parts) {
    const y = new THREE.Box3().setFromObject(p).min.y;
    let b = 0;
    if (p.userData.site) { p.userData.band = 0; p.userData.baseY = p.position.y; continue; }
    levels.forEach((l, i) => { if (y >= l - 0.03) b = i + 1; });
    p.userData.band = b;
    p.userData.baseY = p.position.y;
  }
  gap = Math.max(2.2, size.y / Math.max(1, bands) * 0.75);

  // Frame it
  const span = Math.max(size.x, size.z);
  controls.target.copy(centre).setY(box.min.y + size.y * 0.35);
  // Further back when the stage is narrow
  const k = Math.max(1, 1.22 / Math.max(0.5, camera.aspect));
  const [vx, vy, vz] = MODELS[key].view ?? [-0.95, 0.72, 1.05];
  camera.position.set(centre.x + span * vx * k, box.min.y + span * vy * k, centre.z + span * vz * k);
  camera.near = span / 200; camera.far = span * 30; camera.updateProjectionMatrix();
  controls.minDistance = span * 0.25; controls.maxDistance = span * 4;
  // The shadow catcher sits under everything, the site included
  ground.position.set(centre.x, new THREE.Box3().setFromObject(root).min.y - 0.005, centre.z);
  ground.scale.set(span * 8, span * 8, 1);
  sun.position.set(centre.x - span * 0.6, box.min.y + span * 1.1, centre.z + span * 0.35);
  sun.target.position.copy(centre);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -span * 0.95; sc.right = sc.top = span * 0.95; sc.near = 0.5; sc.far = span * 4;
  sc.updateProjectionMatrix();
  fill.position.set(centre.x + span, box.min.y + span * 0.5, centre.z - span);
  await Promise.all(parts.map((p) => p.userData.dressing));
  setLook(look);
  setExplode(exploded, true);
  cap.textContent = MODELS[key].caption;
  loading.style.display = 'none';
}

function setLook(l) {
  look = l;
  for (const p of parts) {
    p.material = l === 'mat' ? p.userData.orig : p.userData.glass ? glass : p.userData.site ? clayDark : clay;
    for (const c of p.children) if (c.userData.edge) c.visible = l === 'clay';
  }
}

function setExplode(on, instant = false) {
  exploded = on;
  liftTarget = on ? 1 : 0;
  if (instant) lift = liftTarget;
  const b = document.querySelector('[data-explode]');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? 'Put the floors back' : bands > 2 ? 'Lift the floors' : 'Lift the roof';
}

// Controls
document.querySelectorAll('[data-model]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-model]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  hovered = null;
  load(b.dataset.model);
}));
document.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-look]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  setLook(b.dataset.look);
}));
document.querySelector('[data-explode]').addEventListener('click', () => { controls.autoRotate = false; setExplode(!exploded); });

// Pointing at a part names it
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = null, pending = null;
canvas.addEventListener('pointermove', (e) => { pending = e; });
canvas.addEventListener('pointerleave', () => { pending = null; clearHover(); });
function clearHover() {
  if (hovered) { setLook(look); hovered = null; }
  tip.style.opacity = '0';
}
function pick(e) {
  if (!root || e.buttons) { clearHover(); return; }
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(parts, false).find((h) => !h.object.userData.site && h.object.visible);
  if (!hit) { clearHover(); return; }
  if (hovered !== hit.object) {
    if (hovered) setLook(look);
    hovered = hit.object;
    hovered.material = hover;
  }
  const n = nameOf(hovered);
  const kind = kindOf(n);
  tip.innerHTML = kind.toLowerCase() === n.toLowerCase() ? n : `${n}<small>${kind}</small>`;
  tip.style.left = `${e.clientX - r.left}px`;
  tip.style.top = `${e.clientY - r.top}px`;
  tip.style.opacity = '1';
}

// Size, render only while on screen
let visible = true;
new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(stage);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => scene.background.set(bg()));
if (matchMedia('(prefers-reduced-motion: reduce)').matches) controls.autoRotate = false;

renderer.setAnimationLoop(() => {
  if (!visible) return;
  if (Math.abs(lift - liftTarget) > 0.001) {
    const prev = lift;
    lift += (liftTarget - lift) * 0.08;
    if (Math.abs(lift - liftTarget) <= 0.001) lift = liftTarget;
    for (const p of parts) p.position.y = p.userData.baseY + p.userData.band * gap * lift;
    // Follow the lift: raise the view by half of it and step back a little
    const dl = lift - prev;
    const up = dl * (bands - 1) * gap * 0.5;
    controls.target.y += up;
    camera.position.y += up;
    camera.position.sub(controls.target).multiplyScalar(1 + dl * 0.4).add(controls.target);
  }
  if (pending) { pick(pending); pending = null; }
  controls.update();
  if (composer) composer.render(); else renderer.render(scene, camera);
});

resize();
load(document.querySelector('[data-model][aria-pressed="true"]')?.dataset.model ?? 't').catch((err) => { loading.textContent = 'The model could not load here.'; console.error(err); });
window.__idam = { renderer, scene, camera, controls, setLook, setExplode, load };

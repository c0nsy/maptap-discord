// 3D globe: a three.js sphere textured with NASA Blue Marble imagery (bundled under /textures).
// Drag to spin, wheel/pinch to zoom, tap to guess. The reveal copies maptap.gg: an orange line
// grows from the tap to the answer while the camera follows, then rods mark both points, the
// answer's country lights up and a ring of the miss distance is drawn around it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOverlay } from './overlay.js';

const R = 1;
const MIN_DIST = 1.04;
const HOME = { lat: 25, lon: -20 };
let maxDist = 3.2;

// Matches SphereGeometry's UV layout for an equirectangular texture:
// lon 0 → +x, lon 90°E → −z, lon 90°W → +z, north pole → +y.
function toVec({ lat, lon }, r = R) {
  const phi = (90 - lat) * Math.PI / 180, th = lon * Math.PI / 180;
  return new THREE.Vector3(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), -r * Math.sin(phi) * Math.sin(th));
}
function toLatLon(v) {
  const r = v.length();
  const lat = 90 - Math.acos(v.y / r) * 180 / Math.PI;
  const lon = Math.atan2(-v.z, v.x) * 180 / Math.PI;
  return { lat, lon };
}
// Point on the great circle between unit vectors a and b at fraction t.
function slerp(a, b, t) {
  const angle = a.angleTo(b);
  if (angle < 1e-6) return a.clone();
  const s = Math.sin(angle);
  return a.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).add(b.clone().multiplyScalar(Math.sin(t * angle) / s));
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export function createMap(canvas, { onTap }) {
  const wrap = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.copy(toVec(HOME, maxDist));

  const loader = new THREE.TextureLoader();
  const map = loader.load('/textures/earth-blue-marble.jpg');
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const bump = loader.load('/textures/earth-topology.png');
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 96),
    new THREE.MeshPhongMaterial({ map, bumpMap: bump, bumpScale: 0.01, shininess: 6, specular: new THREE.Color(0x222233) }),
  );
  scene.add(globe);

  const overlay = createOverlay(R);
  scene.add(overlay.mesh);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.02, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x4a90ff, transparent: true, opacity: 0.12, side: THREE.BackSide }),
  );
  scene.add(atmo);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  scene.add(sun);

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = MIN_DIST;
  controls.maxDistance = maxDist;
  controls.zoomToCursor = true;
  controls.zoomSpeed = 0.8;

  // ---------- markers ----------
  const marks = new THREE.Group();
  const history = new THREE.Group(); // small dots left at previous answers
  scene.add(marks, history);
  const UP = new THREE.Vector3(0, 1, 0);

  function rod(hex) {
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 4, 6, 14),
      new THREE.MeshPhongMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.35, shininess: 70 }),
    );
    // lean the rod so it reads as a rod even when viewed from straight above (like maptap)
    const tilt = new THREE.Group();
    m.position.y = 2.6;
    tilt.add(m);
    tilt.rotation.z = -0.65;
    const g = new THREE.Group(); g.add(tilt); return g;
  }
  const guessDot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 14), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  const guessDotGroup = new THREE.Group(); guessDotGroup.add(guessDot);
  const guessRod = rod(0x2fe36b);
  const targetRod = rod(0xf4f4f4);

  const LINE_N = 128;
  const linePts = new Float32Array((LINE_N + 1) * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePts, 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.95 }));
  line.visible = false;

  function place(group, ll) {
    const v = toVec(ll, R);
    group.position.copy(v);
    group.quaternion.setFromUnitVectors(UP, v.clone().normalize());
    if (!group.parent) marks.add(group);
  }

  // HTML labels that track points on the globe
  const guessLabel = document.createElement('div');
  guessLabel.className = 'globe-guess hidden';
  guessLabel.textContent = '...your guess';
  const resultText = document.createElement('div');
  resultText.className = 'globe-result hidden';
  wrap.append(guessLabel, resultText);

  let pin = null, target = null, locked = false;

  // ---------- tap vs drag ----------
  const ray = new THREE.Raycaster();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (dist > 4) return;
    if (locked) { onTap?.(null); return; } // a tap during the reveal skips ahead
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(globe)[0];
    if (!hit) return;
    pin = toLatLon(hit.point);
    place(guessDotGroup, pin);
    onTap?.([pin.lon, pin.lat]);
  });

  // ---------- camera animation ----------
  let anim = null; // { t0, ms, step(e), done }
  function animate(ms, step, done) { anim = { t0: performance.now(), ms, step, done }; }
  function flyTo(ll, dist = camera.position.length(), ms = 1000) {
    const from = camera.position.clone().normalize(), to = toVec(ll, 1), d0 = camera.position.length();
    animate(ms, (e) => camera.position.copy(slerp(from, to, e).multiplyScalar(d0 + (dist - d0) * e)));
  }

  function fitDistance() {
    const vHalf = (camera.fov / 2) * Math.PI / 180;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    return (R / Math.sin(Math.min(vHalf, hHalf))) * 1.06;
  }
  function resize() {
    const { width, height } = wrap.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    maxDist = Math.max(MIN_DIST + 0.2, fitDistance());
    controls.maxDistance = maxDist;
    if (!anim && camera.position.length() > maxDist) camera.position.setLength(maxDist);
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  function placeLabel(el, ll, dx, dy) {
    const v = toVec(ll, R * 1.005);
    const facing = v.clone().normalize().dot(camera.position.clone().normalize()) > 0.12;
    v.project(camera);
    const rect = canvas.getBoundingClientRect();
    const x = (v.x + 1) / 2 * rect.width, y = (1 - v.y) / 2 * rect.height;
    const w = el.offsetWidth || 160, h = el.offsetHeight || 60;
    el.style.left = `${Math.max(6, Math.min(rect.width - w - 6, x + dx))}px`;
    el.style.top = `${Math.max(6, Math.min(rect.height - h - 6, y + dy))}px`;
    el.style.visibility = facing ? 'visible' : 'hidden';
  }

  const tmp = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.ms);
      anim.step(easeInOut(t), t);
      if (t >= 1) { const d = anim.done; anim = null; d?.(); }
    } else {
      controls.update();
    }
    camera.lookAt(0, 0, 0);
    const d = camera.position.length();
    controls.rotateSpeed = Math.max(0.08, (d - R) / (maxDist - R));
    sun.position.copy(camera.position).add(tmp.set(-2, 2, 0)).normalize().multiplyScalar(5);

    const s = Math.max(0.0008, 0.0055 * (d - R));
    guessDotGroup.scale.setScalar(s); guessRod.scale.setScalar(s); targetRod.scale.setScalar(s);
    history.children.forEach((c) => c.scale.setScalar(s));

    if (pin && !guessLabel.classList.contains('hidden')) placeLabel(guessLabel, pin, 14, -22);
    if (target && !resultText.classList.contains('hidden')) placeLabel(resultText, target, -24, 26);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // ---------- reveal ----------
  function reveal(t, guess, km, onArrive) {
    locked = true;
    target = { lat: t.lat, lon: t.lon };
    pin = { lon: guess[0], lat: guess[1] };
    place(guessDotGroup, pin);
    guessLabel.classList.remove('hidden');

    const a = toVec(pin).normalize(), b = toVec(target).normalize();
    const sep = a.angleTo(b);
    for (let i = 0; i <= LINE_N; i++) slerp(a, b, i / LINE_N).multiplyScalar(R * 1.004).toArray(linePts, i * 3);
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.setDrawRange(0, 0);
    line.visible = true;
    if (!line.parent) marks.add(line);

    const d0 = camera.position.length();
    // distance at which a patch of the sphere spanning `theta` radians fits the narrower screen axis
    const theta = Math.min(2.5, Math.max(0.12, sep * 0.9 + 0.12));
    const vHalf = (camera.fov / 2) * Math.PI / 180;
    const halfFov = Math.min(vHalf, Math.atan(Math.tan(vHalf) * camera.aspect));
    const dEnd = Math.min(maxDist, Math.max(1.12, R * Math.cos(theta / 2) + (R * Math.sin(theta / 2)) / Math.tan(halfFov)));
    const camFrom = camera.position.clone().normalize();
    const ms = 900 + sep * 700;

    // small pause so the tap registers, then the line grows and the camera chases its head
    setTimeout(() => {
      animate(ms, (e, raw) => {
        lineGeo.setDrawRange(0, Math.floor(e * LINE_N) + 1);
        const head = slerp(a, b, e);
        const look = raw < 0.25 ? slerp(camFrom, head, raw / 0.25) : head;
        camera.position.copy(look.normalize().multiplyScalar(d0 + (dEnd - d0) * e));
      }, () => {
        guessLabel.classList.add('hidden');
        marks.remove(guessDotGroup);
        place(guessRod, pin);
        place(targetRod, target);
        overlay.show([target.lon, target.lat], km);
        resultText.classList.remove('hidden');
        onArrive?.(resultText);
      });
    }, 350);
  }

  function clear() {
    if (target) {
      const dot = new THREE.Group();
      dot.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      dot.position.copy(toVec(target, R * 1.001));
      history.add(dot);
    }
    marks.clear();
    line.visible = false;
    overlay.clear();
    guessLabel.classList.add('hidden');
    resultText.classList.add('hidden');
    resultText.innerHTML = '';
    pin = null; target = null; locked = false;
  }

  function zoomBy(f) {
    camera.position.setLength(Math.min(maxDist, Math.max(MIN_DIST, camera.position.length() * f)));
  }

  return {
    reveal, clear,
    reset: () => flyTo(HOME, maxDist, 800),
    zoomIn: () => zoomBy(1 / 1.4),
    zoomOut: () => zoomBy(1.4),
    setLocked: (v) => { locked = v; },
    clearHistory: () => history.clear(),
  };
}

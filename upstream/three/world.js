// The 3D stage: renderer, camera rig, picking and the per-frame animation loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildHouse } from './house.js';
import { buildFurniture } from './furniture.js';
import { LightUnit } from './lights.js';
import { ACUnit } from './ac.js';
import { floorView, floorOfRoom, defaultFloor } from '../../src/ha/floors.js'; // ha3d: floors
import { createLightPool, QUALITY, DEFAULT_QUALITY, NO_SHADOW_TYPES } from '../../src/ha/light-pool.js'; // ha3d: light budget

export const STAGE_BG = '#0a0e1a';

const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const ORBIT_AZ = 40;       // degrees of freedom either side of the plan's default view
const EL_MIN = 26;
const EL_MAX = 70;
const ZOOM_MIN = 0.55;     // closest
const ZOOM_MAX = 1.2;
const STACK_GAP = 2.6;     // ha3d: metres between floors in the stacked view
const STACK_EL = 26;       // ha3d: a lower camera there, so the floors read as layers
const DIM_OPACITY = 0.2;   // ha3d: floors that are not selected, in the stacked view

// ha3d: `entities` is a Map of extra units (src/ha/markers.js) drawn and picked like the lamps:
// each has { group, hit, anchor(v), update(dt) } and its hit mesh carries { kind: 'entity', id }.
// ha3d: `quality` (low | medium | high) sizes the light pool, bloom, multisampling and pixel ratio.
// ha3d: `live` (src/ha/live.js) are more units { id, room | floor, group, hit?, update(dt) } drawn on
// their floor; their hit meshes carry { kind: 'live', id }.
export function createWorld(canvas, config, store, { onHover, onPick, background = STAGE_BG, entities = new Map(), quality = DEFAULT_QUALITY, live = [] }) {
  const q = QUALITY[quality] || QUALITY[DEFAULT_QUALITY]; // ha3d
  // ha3d: prefers-reduced-motion: no intro fly-in, no pulses, the camera jumps instead of gliding
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const still = () => Boolean(motion?.matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio)); // ha3d
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the model is static: shadow maps are rendered once

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 120);

  const { minX, minZ, maxX, maxZ } = config.bounds;
  // ha3d: the wall height is per floor now (levels below)
  const center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const span = Math.max(maxX - minX, maxZ - minZ);

  const baseAz = config.camera.azimuth;
  const camDir = new THREE.Vector3(Math.sin(rad(baseAz)), 0, Math.cos(rad(baseAz)));

  /* ---------- content ---------- */

  // ha3d: one group per floor (src/ha/floors.js), each drawn as its own house. A plan without
  // "floors" has a single one, so it renders exactly as upstream's.
  const floorOf = floorOfRoom(config);
  const levels = new Map(); // floor id -> { cfg, group, house, H, y, goalY, hits, dimmed }
  for (const f of config.floors) {
    const view = floorView(config, f.id);
    const group = new THREE.Group();
    const house = buildHouse(view, camDir);
    group.add(house.group, buildFurniture(view.furniture));
    scene.add(group);
    levels.set(f.id, { cfg: f, group, house, H: f.height, y: 0, goalY: 0, hits: [...house.floors], dimmed: false });
  }
  const levelOf = (roomId) => levels.get(floorOf.get(roomId)) || levels.values().next().value;
  let current = defaultFloor(config);
  let stacked = false;

  const lights = new Map();
  for (const cfg of config.lights) {
    const level = levelOf(cfg.room);
    const unit = new LightUnit(cfg, level.H);
    lights.set(cfg.id, unit);
    level.group.add(unit.group);
    level.hits.push(unit.hit);
  }
  const acs = new Map();
  for (const cfg of config.acs) {
    const level = levelOf(cfg.room);
    const unit = new ACUnit(cfg);
    acs.set(cfg.id, unit);
    level.group.add(unit.group);
    level.hits.push(unit.hit);
  }
  for (const unit of entities.values()) {
    const level = levelOf(unit.cfg.room);
    level.group.add(unit.group);
    level.hits.push(unit.hit);
  }
  for (const unit of live) { // ha3d
    const level = unit.floor ? levels.get(unit.floor) : levelOf(unit.room);
    if (!level) continue;
    level.group.add(unit.group);
    if (unit.hit) level.hits.push(unit.hit);
  }
  // What a tap can reach: the shown floor, and in the stacked view the rooms of the others.
  let hitTargets = [];

  // Night-time ambience: enough to read the model with every lamp off.
  const hemi = new THREE.HemisphereLight(0x8ea6ff, 0x0b0e17, 0.42); // ha3d: named, for daylight
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa9c0ff, 0.6);
  // Steep and coming from the viewer's side, so the faces we look at stay readable.
  moon.position.copy(center).add(new THREE.Vector3(camDir.x * 3.2 + 1.5, 10, camDir.z * 3.2 - 1.5));
  moon.target.position.copy(center);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = sc.bottom = -span * 0.85;
  sc.right = sc.top = span * 0.85;
  sc.near = 1;
  sc.far = 30;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.04;
  moon.shadow.radius = 4;
  scene.add(moon, moon.target);

  // ha3d: fixtures (and entity markers) only describe their lights; a fixed pool of real ones
  // lights the ones that matter (src/ha/light-pool.js).
  const sources = [];
  for (const unit of lights.values()) {
    unit.lights.forEach((light, index) => sources.push({
      id: unit.id, index, unit, light, floor: floorOf.get(unit.cfg.room), decal: true,
      shadow: light.castShadow && !NO_SHADOW_TYPES.has(unit.cfg.type),
    }));
  }
  for (const unit of entities.values()) {
    if (unit.light) sources.push({ id: unit.id, index: 0, unit, light: unit.light, floor: floorOf.get(unit.cfg.room), shadow: false, decal: false, weight: 0.35 });
  }
  let shownFloors = new Map(); // floor id -> weight, set by layout()
  const pool = createLightPool(scene, renderer, {
    quality, sources,
    getFocus: () => ({ target: rig.goal.target, floors: shownFloors, key: `${rig.focus?.kind}:${rig.focus?.id}` }),
  });

  /* ---------- post-processing ---------- */

  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.samples }); // ha3d: quality
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // ha3d: low quality skips bloom, the most expensive pass on a phone
  if (q.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.34, 0.5, 1.0));
  composer.addPass(new OutputPass());

  /* ---------- camera rig ---------- */

  const rig = {
    az: baseAz, el: config.camera.elevation, dist: 30, target: center.clone(),
    goal: { az: baseAz, el: config.camera.elevation, dist: 30, target: center.clone() },
    zoom: 1, focus: null,
  };
  let width = 1;
  let height = 1;
  let topInset = 0;    // pixels at the top covered by the header
  let bottomInset = 0; // pixels at the bottom covered by the panel

  const v = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function basis(az, el) {
    const a = rad(az);
    const e = rad(el);
    fwd.set(-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e));
    right.set(Math.cos(a), 0, -Math.sin(a));
    up.crossVectors(right, fwd);
  }

  // Smallest distance at which `box` fits the usable part of the viewport.
  function fitDistance(box, az, el, fill) {
    basis(az, el);
    const c = box.getCenter(new THREE.Vector3());
    const usableH = Math.max(0.3, (height - topInset - bottomInset) / height);
    const tanV = Math.tan(rad(camera.fov / 2)) * fill * usableH;
    const tanH = Math.tan(rad(camera.fov / 2)) * camera.aspect * fill;
    let dist = 0;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const depth = v.dot(fwd);
      dist = Math.max(dist, Math.abs(v.dot(right)) / tanH - depth, Math.abs(v.dot(up)) / tanV - depth);
    }
    return { dist, center: c };
  }

  // ha3d: floors. Boxes are lifted to the floor's height in the stacked view.
  function floorBox(level, top = 0.8) {
    const { minX: x0, minZ: z0, maxX: x1, maxZ: z1 } = level.cfg.bounds;
    return new THREE.Box3(new THREE.Vector3(x0, level.goalY, z0), new THREE.Vector3(x1, level.goalY + level.H * top, z1));
  }

  function frameGoal() {
    const f = rig.focus;
    let box;
    let fill = 0.96;
    if (f?.kind === 'room') {
      const r = config.rooms.find((x) => x.id === f.id);
      const level = levelOf(r.id); // ha3d
      box = new THREE.Box3(new THREE.Vector3(r.x, level.goalY, r.z), new THREE.Vector3(r.x + r.w, level.goalY + level.H * 0.75, r.z + r.d));
      fill = 0.84;
    } else if (f?.kind === 'ac') {
      const unit = acs.get(f.id);
      const p = unit.group.position;
      const y = levelOf(unit.cfg.room).goalY; // ha3d
      const out = new THREE.Vector3(0, 0, 1).applyQuaternion(unit.group.quaternion);
      box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(p.x + out.x * 1.3, y + 1.25, p.z + out.z * 1.3), new THREE.Vector3(3.6, 2.6, 3.6));
      fill = 0.92;
    } else if (stacked && f?.kind !== 'floor') { // ha3d: the whole stack
      box = new THREE.Box3();
      for (const level of levels.values()) box.union(floorBox(level));
      fill = 0.9;
    } else { // ha3d: the selected floor
      box = floorBox(levels.get(f?.kind === 'floor' ? f.id : current));
    }
    const { dist, center: c } = fitDistance(box, rig.goal.az, rig.goal.el, fill);
    rig.goal.dist = dist * rig.zoom;
    rig.goal.target.copy(c);
  }

  function updateRig(dt, instant = false) {
    const k = instant || still() ? 1 : 1 - Math.exp(-dt * 5.5); // ha3d: reduced motion
    const g = rig.goal;
    const delta = Math.abs(g.az - rig.az) + Math.abs(g.el - rig.el) + Math.abs(g.dist - rig.dist) * 2
      + rig.target.distanceTo(g.target) * 4;
    rig.az += (g.az - rig.az) * k;
    rig.el += (g.el - rig.el) * k;
    rig.dist += (g.dist - rig.dist) * k;
    rig.target.lerp(g.target, k);
    let lifting = false; // ha3d: floors sliding apart or together
    for (const level of levels.values()) {
      if (Math.abs(level.goalY - level.y) < 0.002) level.y = level.goalY;
      else { level.y += (level.goalY - level.y) * k; lifting = true; }
      level.group.position.y = level.y;
    }
    basis(rig.az, rig.el);
    camera.position.copy(rig.target).addScaledVector(fwd, -rig.dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(rig.target);
    return delta > 0.002 || lifting;
  }

  /* ---------- state sync ---------- */

  function syncAll(opts = {}) {
    let i = 0;
    for (const [id, unit] of lights) {
      unit.apply(store.state.lights[id], { ...opts, delay: opts.stagger ? 0.25 + i++ * 0.06 : 0 });
    }
    for (const [id, unit] of acs) unit.apply(store.state.acs[id], opts);
    wake();
  }

  const unsubscribe = store.on((change) => {
    if (change.type === 'tick') return;
    if (change.type === 'light') lights.get(change.id).apply(store.state.lights[change.id]);
    else if (change.type === 'ac') acs.get(change.id).apply(store.state.acs[change.id]);
    else syncAll();
    wake();
  });

  /* ---------- picking ---------- */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  let drag = null;

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    if (!hits.length) return null;
    // Devices win over the floor they stand on.
    const device = hits.find((h) => h.object.userData.kind !== 'room');
    return (device || hits[0]).object.userData;
  }

  function unitOf(t) {
    return t?.kind === 'light' ? lights.get(t.id) : t?.kind === 'ac' ? acs.get(t.id) : t?.kind === 'entity' ? entities.get(t.id) : null;
  }

  function screenAnchor(t) {
    const unit = unitOf(t);
    if (!unit) return null;
    unit.anchor(v).project(camera);
    return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height };
  }

  function setHover(t) {
    const same = hovered?.kind === t?.kind && hovered?.id === t?.id;
    if (same) return;
    const prev = unitOf(hovered);
    if (prev) prev.hoverGoal = 0;
    hovered = t && t.kind !== 'room' ? t : null;
    const next = unitOf(hovered);
    if (next) next.hoverGoal = 1;
    canvas.style.cursor = hovered ? 'pointer' : drag?.moved ? 'grabbing' : 'grab';
    onHover(hovered ? { ...hovered, ...screenAnchor(hovered) } : null);
    wake();
  }

  // Two fingers pinch to zoom, the way the scroll wheel does with a mouse.
  const fingers = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  };

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (fingers.size === 2) {
      pinch = { spread: spread(), zoom: rig.zoom };
      drag = null;
      setHover(null);
      return;
    }
    if (fingers.size > 2) return;
    drag = { x: ev.clientX, y: ev.clientY, az: rig.goal.az, el: rig.goal.el, moved: false };
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (fingers.has(ev.pointerId)) fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch) {
      if (fingers.size >= 2) {
        rig.zoom = clamp(pinch.zoom * pinch.spread / spread(), ZOOM_MIN, ZOOM_MAX);
        frameGoal();
        wake();
      }
      return;
    }
    if (drag) {
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; setHover(null); canvas.style.cursor = 'grabbing'; }
      if (drag.moved) {
        rig.goal.az = clamp(drag.az - dx * 0.35, baseAz - ORBIT_AZ, baseAz + ORBIT_AZ);
        rig.goal.el = clamp(drag.el + dy * 0.3, EL_MIN, EL_MAX);
        frameGoal();
        wake();
      }
      return;
    }
    setHover(pick(ev));
  });
  const release = (ev) => {
    fingers.delete(ev.pointerId);
    if (pinch) { if (!fingers.size) pinch = null; return; } // lifting after a pinch picks nothing
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    canvas.style.cursor = 'grab';
    if (wasDrag) return;
    const t = pick(ev);
    if (!t) { onPick(null); return; }
    if (t.kind === 'light') lights.get(t.id).bump();
    onPick(t);
    wake();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (ev) => {
    fingers.delete(ev.pointerId);
    if (!fingers.size) pinch = null;
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    rig.zoom = clamp(rig.zoom * Math.exp(ev.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
    frameGoal();
    wake();
  }, { passive: false });
  canvas.style.cursor = 'grab';

  /* ---------- loop ---------- */

  let raf = 0;
  let last = 0;
  let awake = 0;       // frames still owed after the last change
  let running = false;
  let shadowFrames = 3;

  function wake(frames = 2) {
    awake = Math.max(awake, frames);
    if (running && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (still()) for (const unit of [...lights.values(), ...entities.values()]) unit.pulse = 0; // ha3d
    let active = updateRig(dt);
    for (const unit of lights.values()) active = unit.update(dt) || active;
    for (const unit of acs.values()) active = unit.update(dt) || active;
    for (const unit of entities.values()) active = unit.update(dt) || active; // ha3d
    for (const unit of live) active = unit.update(dt) || active; // ha3d
    if (active || awake > 0) {
      if (pool.sync()) shadowFrames = Math.max(shadowFrames, 2); // ha3d: new lights, new shadow maps
    }
    if (shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; active = true; }
    if (active || awake > 0) {
      composer.render(dt);
      awake = Math.max(0, awake - 1);
      if (hovered && active) onHover({ ...hovered, ...screenAnchor(hovered) });
    }
    if (running && (active || awake > 0)) raf = requestAnimationFrame(frame);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    width = r.width;
    height = r.height;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio); // ha3d: quality
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    // Centre the model between header and panel by shifting the projection window.
    camera.setViewOffset(width, height, 0, -(topInset - bottomInset) / 2, width, height);
    camera.updateProjectionMatrix();
    frameGoal();
    wake(3);
  }

  let daylight = 0; // ha3d: setDaylight()

  /* ---------- ha3d: floors ---------- */

  const dimmed = new Map(); // original material -> its see-through copy
  const dimMaterial = (m) => {
    if (!dimmed.has(m)) {
      const c = m.clone();
      c.transparent = true;
      c.opacity = m.opacity * DIM_OPACITY;
      c.depthWrite = false;
      dimmed.set(m, c);
    }
    return dimmed.get(m);
  };

  function dim(level, on) {
    if (level.dimmed === on) return;
    level.dimmed = on;
    level.group.traverse((o) => {
      if (!(o.isMesh || o.isSprite) || o.userData.kind === 'light' || o.userData.kind === 'ac' || o.userData.kind === 'entity') return; // hit boxes
      if (on) {
        o.userData.ha3dLook = { material: o.material, cast: o.castShadow };
        o.material = Array.isArray(o.material) ? o.material.map(dimMaterial) : dimMaterial(o.material);
        o.castShadow = false;
      } else if (o.userData.ha3dLook) {
        o.material = o.userData.ha3dLook.material;
        o.castShadow = o.userData.ha3dLook.cast;
        delete o.userData.ha3dLook;
      }
    });
  }

  function layout() {
    // Lowest floor at 0, each next one above the previous, pulled apart a little.
    let y = 0;
    for (const f of config.floors) {
      const level = levels.get(f.id);
      level.goalY = stacked ? y : 0;
      y += level.H + STACK_GAP;
      const shown = stacked || f.id === current;
      // A floor that appears or disappears jumps; the shown ones slide.
      if (!shown || !level.group.visible) { level.y = level.goalY; level.group.position.y = level.y; }
      level.group.visible = shown;
      dim(level, stacked && f.id !== current);
    }
    shownFloors = new Map(config.floors
      .filter((f) => stacked || f.id === current)
      .map((f) => [f.id, f.id === current ? 1 : 0.3])); // ha3d: dimmed floors rank lower in the light pool
    const top = stacked ? y : 0;
    moon.position.y = 10 + top;
    moon.shadow.camera.far = 30 + top;
    moon.shadow.camera.updateProjectionMatrix();
    hitTargets = [];
    for (const [id, level] of levels) {
      if (id === current) hitTargets.push(...level.hits);
      else if (stacked) hitTargets.push(...level.house.floors);
    }
    shadowFrames = 3;
    frameGoal();
    wake(4);
  }

  const world = {
    lights,
    acs,
    entities, // ha3d
    wake, // ha3d: something outside the store (Home Assistant state of an entity) changed

    setInsets(top, bottom) { topInset = top; bottomInset = bottom; resize(); },

    // ha3d: floors. `setFloor` shows one floor (and flies to it in the stacked view);
    // `setStacked` draws every floor one above the other, the others dimmed.
    get floor() { return current; },
    get stacked() { return stacked; },
    floorOfRoom: (roomId) => floorOf.get(roomId),
    floorsShown: () => [...levels].map(([id, l]) => ({ id, visible: l.group.visible, dimmed: l.dimmed })), // for tests
    lightPool: () => pool.debug(), // ha3d: which fixture each real light shows
    floorGroup: (id) => levels.get(id)?.group ?? null, // ha3d: people move between floors
    // ha3d: the furniture items drawn from the plan, with their models: [{ item, group, floor }]
    findFurniture(test) {
      const out = [];
      for (const [floor, level] of levels) {
        level.group.traverse((o) => { if (o.userData.item && test(o.userData.item)) out.push({ item: o.userData.item, group: o, floor }); });
      }
      return out;
    },
    // ha3d: 0 = upstream's night, 1 = daylight: sky, ambient light and the outdoor (moon / sun) light
    get daylight() { return daylight; }, // ha3d
    // ha3d: where an object is on the canvas, in CSS pixels (tests tap 3D things through it)
    screenOf(object) {
      object.getWorldPosition(v).project(camera);
      return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, visible: v.z < 1 };
    },
    setDaylight(t) {
      const k = clamp(t, 0, 1);
      daylight = k;
      scene.background.set(background).lerp(DAY.sky, k);
      hemi.color.set(0x8ea6ff).lerp(DAY.hemiSky, k);
      hemi.groundColor.set(0x0b0e17).lerp(DAY.hemiGround, k);
      hemi.intensity = 0.42 + (1.2 - 0.42) * k;
      moon.color.set(0xa9c0ff).lerp(DAY.sun, k);
      moon.intensity = 0.6 + (2.3 - 0.6) * k;
      shadowFrames = Math.max(shadowFrames, 1);
      wake();
    },
    rigDelta: () => Math.abs(rig.goal.az - rig.az) + Math.abs(rig.goal.el - rig.el) + Math.abs(rig.goal.dist - rig.dist) + rig.target.distanceTo(rig.goal.target), // ha3d: for tests
    setFloor(id) {
      if (!levels.has(id) || id === current) return;
      current = id;
      rig.focus = stacked ? { kind: 'floor', id } : null;
      rig.zoom = 1;
      layout();
    },
    setStacked(on) {
      if (stacked === Boolean(on)) return;
      stacked = Boolean(on);
      rig.focus = null;
      rig.zoom = 1;
      rig.goal.az = baseAz;
      rig.goal.el = stacked ? STACK_EL : config.camera.elevation;
      layout();
    },
    resize,

    focus(next) {
      rig.focus = next || (stacked ? { kind: 'floor', id: current } : null); // ha3d
      rig.zoom = 1;
      rig.goal.az = baseAz + (next?.kind === 'ac' ? (WALL_SIDE[acs.get(next.id).cfg.wall] ?? 0) : 0);
      rig.goal.el = next?.kind === 'ac' ? 30 : stacked ? STACK_EL : config.camera.elevation; // ha3d: stacked
      frameGoal();
      wake();
    },

    // Camera sweep + staggered light-up, played whenever the panel appears.
    intro() {
      if (still()) { syncAll({ instant: true }); frameGoal(); updateRig(0, true); wake(4); return; } // ha3d
      syncAll({ instant: true });
      for (const unit of lights.values()) { unit.level = 0; unit.write(); }
      for (const unit of acs.values()) unit.power = 0;
      syncAll({ stagger: true });
      frameGoal();
      rig.az = rig.goal.az - 16;
      rig.el = rig.goal.el + 9;
      rig.dist = rig.goal.dist * 1.28;
      rig.target.copy(rig.goal.target);
      wake(4);
    },

    setRunning(on) {
      running = on;
      if (on) wake(4);
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },

    dispose() {
      unsubscribe();
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      composer.dispose();
      target.dispose();
      // ha3d: the card comes and goes with every dashboard re-render: free the GPU memory too.
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
        o.shadow?.map?.dispose();
      });
      for (const m of dimmed.values()) m.dispose(); // ha3d
      pool.dispose(); // ha3d
      renderer.dispose();
      renderer.forceContextLoss();
    },

    // Jump every running animation to its end state (used by tests and screenshots).
    settle(seconds = 6) {
      for (let t = 0; t < seconds; t += 0.05) {
        updateRig(0.05);
        for (const unit of lights.values()) unit.update(0.05);
        for (const unit of acs.values()) unit.update(0.05);
        for (const unit of entities.values()) unit.update(0.05); // ha3d
        for (const unit of live) unit.update(0.05); // ha3d
      }
      pool.sync(true); // ha3d
      renderer.shadowMap.needsUpdate = true;
      composer.render(0);
    },
  };

  syncAll({ instant: true });
  layout(); // ha3d: floors
  resize();
  updateRig(0, true);
  return world;
}

// ha3d: the daylight end of setDaylight()
const DAY = {
  sky: new THREE.Color('#9cbfe2'), hemiSky: new THREE.Color('#e4f0ff'), hemiGround: new THREE.Color('#5d5246'), sun: new THREE.Color('#fff0d8'),
};

// Looking at an AC slightly from the side shows its airflow better.
const WALL_SIDE = { north: -14, west: 14, south: 0, east: 0 };

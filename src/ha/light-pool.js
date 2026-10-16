// A fixed pool of real three.js lights shared by every fixture (brief: light and shadow budget).
//
// Fixtures still build their lights as upstream does, but those stay invisible ("virtual"): they
// only describe a light (type, place, colour, intensity, cone). The pool owns a fixed number of
// SpotLights and PointLights and copies into them the lit fixtures that matter most: on a shown
// floor, near what the camera looks at, brighter first. The number of lights and shadow casters
// never changes, so materials never recompile. Lit fixtures without a real light keep their
// emissive glow and get a soft additive "light pool" on the floor below them.
import * as THREE from 'three';

export const QUALITY = {
  low: { spots: 3, points: 1, shadows: 1, pixelRatio: 1.5, bloom: false, samples: 0, shadowScale: 0.5 },
  medium: { spots: 5, points: 3, shadows: 4, pixelRatio: 2, bloom: true, samples: 4, shadowScale: 1 },
  high: { spots: 8, points: 4, shadows: 8, pixelRatio: 2, bloom: true, samples: 4, shadowScale: 1 },
};
export const QUALITIES = Object.keys(QUALITY);
export const DEFAULT_QUALITY = 'medium';

/** Fixture types whose light never casts a shadow (they sit low or along a wall). */
export const NO_SHADOW_TYPES = new Set(['table', 'floor', 'strip']);
export const SHADOW_MARGIN = 2;

const LIT_TEXTURES = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap', 'displacementMap'];

/** The most textures any lit material of `root` samples (shadow maps come on top of these). */
export function materialSamplers(root) {
  let most = 0;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (!(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) continue;
      most = Math.max(most, LIT_TEXTURES.filter((k) => m[k]).length);
    }
  });
  return most;
}

/**
 * How many shadow-casting pool lights fit: never more than the quality asks for, and never more
 * than the fragment texture units left after the materials' own textures, `reserved` other shadow
 * maps (the moon) and a safety margin.
 */
export function shadowBudget({ maxTextures, samplers, wanted, reserved = 1 }) {
  return Math.max(0, Math.min(wanted, maxTextures - samplers - SHADOW_MARGIN - reserved));
}

/**
 * Chooses which lit candidates get a real light. `candidates`:
 *   [{ key, type: 'spot' | 'point', power, shadow, dist2, weight }]
 * power: how bright it is meant to be (0 = off: never a real light); shadow: may cast one;
 * dist2: squared distance to the camera target; weight: 1, or less for a dimmed floor.
 * Spot slots 0 .. shadows-1 cast shadows. Returns { spot: [key|null], point: [key|null], glowOnly: [key] }.
 */
export function assignLights(candidates, { spots, points, shadows }) {
  const shadowSlots = Math.min(shadows, spots);
  const ranked = candidates
    .filter((c) => c.power > 0)
    .map((c) => ({ c, score: (c.power * (c.weight ?? 1)) / (1 + (c.dist2 || 0) / 16) }))
    .sort((a, b) => b.score - a.score || (a.c.key < b.c.key ? -1 : 1))
    .map(({ c }) => c);
  const spot = Array(spots).fill(null);
  const point = Array(points).fill(null);
  const glowOnly = [];
  let nextShadow = 0;
  let nextPlain = shadowSlots;
  let nextPoint = 0;
  for (const c of ranked) {
    if (c.type === 'spot') {
      if (c.shadow && nextShadow < shadowSlots) spot[nextShadow++] = c.key;
      else if (nextPlain < spots) spot[nextPlain++] = c.key;
      else if (nextShadow < shadowSlots) spot[nextShadow++] = c.key; // only shadow slots are left
      else glowOnly.push(c.key);
    } else if (nextPoint < points) point[nextPoint++] = c.key;
    else glowOnly.push(c.key);
  }
  return { spot, point, glowOnly };
}

let poolTexture = null;
function glowTexture() {
  if (poolTexture) return poolTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  poolTexture = new THREE.CanvasTexture(c);
  poolTexture.colorSpace = THREE.SRGBColorSpace;
  return poolTexture;
}

/**
 * The runtime pool. `sources`: [{ id, unit, light, floor, shadow, weight, decal }], one per
 * virtual light. `getFocus()` returns { target: Vector3, floors: Map(floorId -> weight), key } with
 * the floors that are shown (others get no light at all); a new `key` (what the camera frames) re-ranks.
 */
export function createLightPool(scene, renderer, { quality = DEFAULT_QUALITY, sources, getFocus }) {
  const q = QUALITY[quality] || QUALITY[DEFAULT_QUALITY];
  const maxTextures = renderer.capabilities.maxTextures || 16;
  const samplers = materialSamplers(scene);
  const shadows = shadowBudget({ maxTextures, samplers, wanted: q.shadows });
  const budget = { spots: q.spots, points: q.points, shadows };

  for (const s of sources) {
    s.key = `${s.id}#${s.index}`;
    s.type = s.light.isSpotLight ? 'spot' : 'point';
    s.light.visible = false; // virtual: described, never rendered
    s.light.castShadow = false;
  }
  const byKey = new Map(sources.map((s) => [s.key, s]));

  const spots = Array.from({ length: q.spots }, (_, i) => {
    const l = new THREE.SpotLight(0xffffff, 0, 0, 1.2, 0.75, 2);
    if (i < shadows) {
      l.castShadow = true;
      const size = Math.round(1024 * q.shadowScale);
      l.shadow.mapSize.set(size, size);
      l.shadow.camera.near = 0.15;
      l.shadow.camera.far = 9;
      l.shadow.bias = -0.0006;
      l.shadow.normalBias = 0.03;
      l.shadow.radius = 5;
    }
    scene.add(l, l.target);
    return l;
  });
  const points = Array.from({ length: q.points }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 0, 2);
    scene.add(l);
    return l;
  });

  // The soft light pools on the floor, one per virtual light of a fixture (not for markers).
  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const s of sources) {
    if (!s.decal) continue;
    const m = new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(decalGeo, m);
    const size = s.type === 'spot' ? 2.4 : 1.8;
    mesh.scale.set(size, 1, size);
    mesh.position.set(s.light.position.x, 0.015, s.light.position.z);
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.userData.poolDecal = true;
    s.unit.group.add(mesh);
    s.decalMesh = mesh;
  }

  let assigned = { spot: Array(q.spots).fill(null), point: Array(q.points).fill(null), glowOnly: [] };
  let signature = '';
  const pooled = new Set();
  const v = new THREE.Vector3();

  const powerOf = (s) => (s.light.userData.max ?? 1) * Math.pow(Math.max(0, s.unit.goal ?? 0), 1.5) * (s.scale ?? 1);

  function reassign() {
    const { target, floors } = getFocus();
    const candidates = [];
    for (const s of sources) {
      const w = floors.get(s.floor);
      if (!w) continue;
      s.light.getWorldPosition(v);
      candidates.push({ key: s.key, type: s.type, power: powerOf(s), shadow: s.shadow, dist2: v.distanceToSquared(target), weight: w * (s.weight ?? 1) });
    }
    assigned = assignLights(candidates, budget);
    pooled.clear();
    for (const k of [...assigned.spot, ...assigned.point]) if (k) pooled.add(k);
    return true;
  }

  // What decides the assignment: which sources are lit, and the shown floors. Checked each frame.
  function currentSignature() {
    const { floors, key } = getFocus();
    let out = `${key}/${[...floors].map(([f, w]) => `${f}:${w}`).join(',')}`;
    for (const s of sources) if (floors.has(s.floor) && (s.unit.goal ?? 0) > 0.001) out += `|${s.key}`;
    return out;
  }

  /** Copies the assigned fixtures into the real lights. Returns true when the assignment changed. */
  function sync(force = false) {
    const sig = currentSignature();
    const changed = force || sig !== signature;
    if (changed) { signature = sig; reassign(); }
    assigned.spot.forEach((key, i) => copy(spots[i], key && byKey.get(key)));
    assigned.point.forEach((key, i) => copy(points[i], key && byKey.get(key)));
    const { floors } = getFocus();
    for (const s of sources) {
      if (!s.decalMesh) continue;
      const level = s.unit.level ?? 0;
      const show = level > 0.01 && !pooled.has(s.key) && floors.has(s.floor);
      s.decalMesh.visible = show;
      if (show) {
        s.decalMesh.material.color.copy(s.light.color);
        s.decalMesh.material.opacity = Math.min(0.55, 0.12 + 0.4 * Math.pow(level, 1.2)) * (floors.get(s.floor) ?? 1);
      }
    }
    return changed;
  }

  function copy(real, s) {
    if (!s) { real.intensity = 0; return; }
    s.light.getWorldPosition(real.position);
    real.color.copy(s.light.color);
    real.intensity = s.light.intensity * (s.scale ?? 1);
    real.distance = s.light.distance;
    real.decay = s.light.decay;
    if (real.isSpotLight) {
      real.angle = s.light.angle;
      real.penumbra = s.light.penumbra;
      s.light.target.getWorldPosition(real.target.position);
      real.target.updateMatrixWorld();
    }
  }

  return {
    sync,
    budget,
    debug() {
      const slots = [
        ...assigned.spot.map((key, i) => ({ type: 'spot', shadow: i < shadows, fixture: key && byKey.get(key).id, key })),
        ...assigned.point.map((key) => ({ type: 'point', shadow: false, fixture: key && byKey.get(key).id, key })),
      ];
      let casters = 0;
      let lights = 0;
      scene.traverse((o) => { if (o.isLight && o.visible) { lights++; if (o.castShadow) casters++; } });
      return {
        quality, maxTextures, samplers, budget, slots,
        glowOnly: assigned.glowOnly.map((k) => byKey.get(k).id),
        sceneLights: lights, shadowCasters: casters,
      };
    },
    dispose() { decalGeo.dispose(); },
  };
}

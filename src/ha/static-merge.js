// Fewer draw calls: once a floor's house and furniture are built, every mesh that never moves or
// changes is merged into one mesh per material (per floor). What does change stays separate:
// TV screens (src/ha/live.js lights them), and everything added later (light fixtures, fan
// blades, doors, markers, people, glows). Room floors are merged too, but their own meshes stay
// in the scene, invisible, as the hit targets for taps. Every static object's matrix is frozen.
// Plain standard materials that differ only in colour share one material, the colours baked into
// the vertices, so a room full of differently coloured furniture is still a handful of draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ATTRIBUTES = ['position', 'normal', 'uv'];

const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap', 'displacementMap'];

// What a material looks like apart from its colour: materials with the same look can share one.
// Anything other than a plain MeshStandardMaterial keeps its own (keyed by its uuid).
function lookOf(m) {
  if (m.type !== 'MeshStandardMaterial' || m.vertexColors || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return m.uuid;
  return [
    m.roughness, m.metalness, m.emissive.getHexString(), m.emissiveIntensity, m.transparent, m.opacity,
    m.side, m.depthWrite, m.depthTest, m.flatShading, m.wireframe, m.alphaTest, m.toneMapped,
    m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits,
    ...MAPS.map((k) => m[k]?.uuid ?? ''),
  ].join('|');
}

// Each vertex gets its material's colour (linear, as three.js stores it).
function bakeColor(geometry, color) {
  const n = geometry.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

/** Meshes that must stay as they are: TV screens, and anything marked `userData.dynamic`. */
const isDynamic = (o) => o.name === 'screen' || o.userData.dynamic === true;

// One non-indexed geometry per material of a mesh, in the coordinates of `root`.
function pieces(mesh, toRoot) {
  const geo = mesh.geometry;
  const groups = Array.isArray(mesh.material)
    ? (geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }])
    : [{ start: 0, count: Infinity, materialIndex: null }];
  const out = [];
  for (const g of groups) {
    const material = g.materialIndex == null ? mesh.material : mesh.material[g.materialIndex];
    if (!material) continue;
    let part;
    if (g.materialIndex == null) {
      part = geo.index ? geo.toNonIndexed() : geo.clone();
    } else {
      const sub = new THREE.BufferGeometry();
      for (const name of ATTRIBUTES) if (geo.attributes[name]) sub.setAttribute(name, geo.attributes[name]);
      const total = geo.index ? geo.index.count : geo.attributes.position.count;
      const end = Math.min(total, g.start + g.count);
      const idx = new Uint32Array(end - g.start);
      for (let i = 0; i < idx.length; i++) idx[i] = geo.index ? geo.index.getX(g.start + i) : g.start + i;
      sub.setIndex(new THREE.BufferAttribute(idx, 1));
      part = sub.toNonIndexed();
    }
    for (const name of Object.keys(part.attributes)) if (!ATTRIBUTES.includes(name)) part.deleteAttribute(name);
    if (!part.attributes.normal) part.computeVertexNormals();
    if (!part.attributes.uv) part.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(part.attributes.position.count * 2), 2));
    part.clearGroups();
    part.morphAttributes = {};
    part.applyMatrix4(toRoot);
    out.push({ material, geometry: part });
  }
  return out;
}

/**
 * Merges the static meshes under `parts` (the floor's house and furniture groups) into meshes
 * added to `root` (the floor's group, at the origin). `hitTargets` are meshes that are picked
 * (room floors): merged for drawing, kept invisible for picking. Returns { merged, before }.
 */
export function mergeStatic(root, parts, { hitTargets = [] } = {}) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4();
  const rootInverse = root.matrixWorld.clone().invert();
  const hits = new Set(hitTargets);
  const buckets = new Map(); // look + shadow flags -> { cast, receive, pieces: [{ material, geometry }] }
  const merged = [];
  let before = 0;
  for (const part of parts) {
    part.traverse((o) => {
      if (!o.isMesh || !o.visible || isDynamic(o)) return;
      if (o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences?.length) return;
      if (o.geometry.attributes.position?.itemSize !== 3) return;
      toRoot.multiplyMatrices(rootInverse, o.matrixWorld);
      for (const piece of pieces(o, toRoot)) {
        const key = `${lookOf(piece.material)}|${o.castShadow}|${o.receiveShadow}`;
        if (!buckets.has(key)) buckets.set(key, { cast: o.castShadow, receive: o.receiveShadow, pieces: [] });
        buckets.get(key).pieces.push(piece);
      }
      merged.push(o);
      before += Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    });
  }
  for (const o of merged) {
    if (hits.has(o)) o.visible = false; // still picked (raycasting ignores visibility), never drawn
    else o.removeFromParent();
  }
  const meshes = build(buckets, root);
  for (const part of parts) freeze(part);
  for (const m of meshes) freeze(m);
  return { meshes, before, after: meshes.length };
}

// One mesh per bucket, added to `parent`.
function build(buckets, parent, material = null) {
  const meshes = [];
  for (const { cast, receive, pieces: list } of buckets.values()) {
    const materials = [...new Set(list.map((x) => x.material))];
    let shared = material || materials[0];
    if (!material && materials.length > 1) {
      // one material for every colour of this look: the colours go into the vertices
      shared = materials[0].clone();
      shared.color.set('#ffffff');
      shared.vertexColors = true;
      for (const x of list) bakeColor(x.geometry, x.material.color);
    }
    const geometries = list.map((x) => x.geometry);
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, shared);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.userData.merged = true;
    parent.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Merges `meshes`, direct children of `parent`, into as few meshes as their looks allow, in the
 * parent's own coordinates (a light fixture's body, a fan's blades). With `material`, every piece
 * is drawn with that one material instead (a fixture's glow, which always changes as a whole).
 * The parent may keep moving: only its children are merged. Returns the new meshes.
 */
export function mergeChildren(parent, meshes, { material = null } = {}) {
  const list = meshes.filter((o) => o.isMesh && o.parent === parent && !isDynamic(o));
  if (list.length < 2) return list;
  const buckets = new Map();
  for (const o of list) {
    o.updateMatrix();
    for (const piece of pieces(o, o.matrix)) {
      const key = material ? `one|${o.castShadow}|${o.receiveShadow}` : `${lookOf(piece.material)}|${o.castShadow}|${o.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, { cast: o.castShadow, receive: o.receiveShadow, pieces: [] });
      buckets.get(key).pieces.push(piece);
    }
  }
  for (const o of list) o.removeFromParent();
  const out = build(buckets, parent, material);
  for (const m of out) freeze(m);
  return out;
}

/** Computes an object's matrices once and stops three.js from recomputing them every frame. */
export function freeze(object) {
  object.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}

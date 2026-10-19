import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeStatic, mergeChildren, freeze } from '../../src/ha/static-merge.js';
import { box, cyl, mat } from '../../upstream/three/kit.js';
import { buildHouse } from '../../upstream/three/house.js';
import { buildFurniture } from '../../upstream/three/furniture.js';
import { validatePlan } from '../../src/ha/validate.js';
import { floorView } from '../../src/ha/floors.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
// The floor textures are drawn on a canvas: a stand-in that draws nothing is enough here.
const noop = new Proxy({}, { get: () => () => {}, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
const meshes = (root) => { const out = []; root.traverse((o) => { if (o.isMesh && o.visible) out.push(o); }); return out; };
const bounds = (root) => { root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(root, true); };

test('kit.js shares one geometry between identical boxes and cylinders', () => {
  const m = mat('#123456');
  assert.equal(box(1, 2, 3, m).geometry, box(1, 2, 3, m).geometry);
  assert.notEqual(box(1, 2, 3, m).geometry, box(1, 2, 3.1, m).geometry);
  assert.equal(cyl(0.1, 0.1, 1, m, 12).geometry, cyl(0.1, 0.1, 1, m, 12).geometry);
  assert.equal(mat('#123456'), m, 'materials were already shared by colour');
});

test('static meshes merge into one per look: different colours share one, in the same place', () => {
  const root = new THREE.Group();
  const part = new THREE.Group();
  part.position.set(5, 0, 2);
  part.rotation.y = 0.7;
  const a = box(1, 1, 1, mat('#ff0000'));
  const b = box(1, 1, 1, mat('#00ff00'));
  b.position.set(2, 0, 0);
  const shiny = box(1, 1, 1, mat('#0000ff', { rough: 0.1, metal: 0.9 }));
  shiny.position.set(0, 2, 0);
  const screen = Object.assign(box(1, 0.6, 0.02, new THREE.MeshStandardMaterial()), { name: 'screen' });
  part.add(a, b, shiny, screen);
  root.add(part);
  const where = bounds(root);
  const { meshes: out, before, after } = mergeStatic(root, [part]);
  assert.deepEqual([before, after], [3, 2], 'two looks: matte (red and green) and shiny');
  const matte = out.find((m) => m.material.vertexColors);
  assert.ok(matte, 'the two matte colours share one material with vertex colours');
  assert.equal(matte.geometry.attributes.color.count, matte.geometry.attributes.position.count);
  const now = bounds(root);
  assert.ok(now.min.distanceTo(where.min) < 1e-5 && now.max.distanceTo(where.max) < 1e-5, 'nothing moved');
  assert.equal(screen.parent, part, 'a TV screen stays a mesh of its own');
  assert.deepEqual(meshes(root).length, 3);
  // frozen: three.js no longer recomputes their matrices every frame
  assert.equal(part.matrixAutoUpdate, false);
  assert.ok(out.every((m) => m.matrixAutoUpdate === false));
});

test('multi-material meshes (walls) are split per material; room floors stay as invisible hit targets', () => {
  const { config } = validatePlan(demo);
  const view = floorView(config, 'main');
  const root = new THREE.Group();
  const house = buildHouse(view, new THREE.Vector3(0.5, 0, 0.8));
  const furniture = buildFurniture(view.furniture);
  root.add(house.group, furniture);
  const shown = meshes(root).length;
  const { after } = mergeStatic(root, [house.group, furniture], { hitTargets: house.floors });
  assert.ok(after * 10 < shown, `${shown} meshes became ${after}`);
  for (const f of house.floors) {
    assert.equal(f.visible, false);
    assert.ok(f.parent, 'still in the scene, so taps can pick the room');
    assert.equal(f.userData.kind, 'room');
  }
  // a ray still hits a room floor
  const ray = new THREE.Raycaster(new THREE.Vector3(8, 5, 2), new THREE.Vector3(0, -1, 0));
  root.updateMatrixWorld(true);
  const hit = ray.intersectObjects(house.floors, false)[0];
  assert.equal(hit?.object.userData.id, 'kitchen');
});

test('mergeChildren merges a fixture\'s pieces in place; with a material, all of them share it', () => {
  const model = new THREE.Group();
  model.scale.setScalar(1.2); // the model keeps moving: only its children merge
  const glowA = new THREE.MeshStandardMaterial();
  const glowB = new THREE.MeshStandardMaterial();
  const g1 = box(0.1, 0.1, 0.1, glowA);
  const g2 = box(0.1, 0.1, 0.1, glowB);
  g2.position.x = 1;
  const p1 = cyl(0.01, 0.01, 1, mat('#222'));
  model.add(g1, g2, p1);
  const glow = mergeChildren(model, [g1, g2], { material: glowA });
  assert.equal(glow.length, 1);
  assert.equal(glow[0].material, glowA);
  assert.equal(model.children.length, 2);
  assert.equal(model.matrixAutoUpdate, true);
  assert.deepEqual(mergeChildren(model, [p1]), [p1], 'a single piece is left as it is');
});

test('freeze computes the matrix once', () => {
  const g = new THREE.Group();
  g.position.set(1, 2, 3);
  freeze(g);
  assert.equal(g.matrixAutoUpdate, false);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(g.matrix).toArray(), [1, 2, 3]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FURNITURE_TYPES, footprint, buildFurniture } from '../../upstream/three/furniture.js';

const NEW = ['washerDryer', 'showerStall', 'daybed', 'walkInCloset'];
const meshes = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
// [width, height, depth] of everything a model draws
const size = (g) => {
  g.updateMatrixWorld(true);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    ['x', 'y', 'z'].forEach((k, i) => { min[i] = Math.min(min[i], b.min[k]); max[i] = Math.max(max[i], b.max[k]); });
  });
  return max.map((v, i) => v - min[i]);
};
const build = (item) => buildFurniture([{ pos: [0, 0], ...item }]).children[0];

test('the new models are in the editor’s furniture picker', () => {
  for (const t of NEW) assert.ok(FURNITURE_TYPES.includes(t), t);
});

test('footprints follow the options and their defaults', () => {
  assert.deepEqual(footprint({ type: 'washerDryer' }), [1.4, 0.7]);
  assert.deepEqual(footprint({ type: 'washerDryer', stacked: true }), [0.7, 0.7]);
  assert.deepEqual(footprint({ type: 'washerDryer', width: 1.2, depth: 0.65 }), [1.2, 0.65]);
  assert.deepEqual(footprint({ type: 'showerStall' }), [1, 1]);
  assert.deepEqual(footprint({ type: 'showerStall', width: 0.9, depth: 1.2 }), [0.9, 1.2]);
  assert.deepEqual(footprint({ type: 'daybed' }), [2, 1]);
  assert.deepEqual(footprint({ type: 'walkInCloset' }), [2, 0.6]);
  assert.deepEqual(footprint({ type: 'walkInCloset', width: 3, depth: 2 }), [3, 2]);
});

test('every variant builds and fits its footprint', () => {
  const variants = [
    { type: 'washerDryer' }, { type: 'washerDryer', stacked: true }, { type: 'washerDryer', lid: 'top', color: '#dfe3e8' },
    { type: 'showerStall' }, { type: 'showerStall', glass: false }, { type: 'showerStall', door: 'side', tile: '#a7b6c2' },
    { type: 'daybed' }, { type: 'daybed', trundle: true, frame: '#ffffff', bedding: '#334455' },
    { type: 'walkInCloset' }, { type: 'walkInCloset', width: 2.4, depth: 2.2, sides: true },
  ];
  for (const item of variants) {
    const g = build(item);
    assert.ok(g && meshes(g) > 3, JSON.stringify(item));
    const [w, , d] = size(g);
    const [fw, fd] = footprint(item);
    assert.ok(w <= fw + 0.06 && d <= fd + 0.06, `${JSON.stringify(item)}: ${w.toFixed(2)} x ${d.toFixed(2)} in ${fw} x ${fd}`);
  }
});

test('options change the model', () => {
  // stacked is one tall unit; top-loaders have no round doors
  assert.ok(size(build({ type: 'washerDryer', stacked: true }))[1] > size(build({ type: 'washerDryer' }))[1] * 1.6);
  assert.ok(meshes(build({ type: 'washerDryer', lid: 'top' })) < meshes(build({ type: 'washerDryer' })));
  // side rods only where the depth leaves room for them
  assert.ok(meshes(build({ type: 'walkInCloset', depth: 2, sides: true })) > meshes(build({ type: 'walkInCloset', depth: 2 })));
  assert.equal(meshes(build({ type: 'walkInCloset', sides: true })), meshes(build({ type: 'walkInCloset' })));
  // a trundle is a second deck and mattress
  assert.equal(meshes(build({ type: 'daybed', trundle: true })), meshes(build({ type: 'daybed' })) + 2);
  assert.ok(size(build({ type: 'showerStall', height: 2.3 }))[1] >= 2.29);
});

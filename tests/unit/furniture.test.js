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

/* ---------- kitchen, living and storage pieces ---------- */

const MORE = ['wallOven', 'fireplace', 'shelving'];
const colours = (g) => { const out = new Set(); g.traverse((o) => { if (o.isMesh) out.add(`#${o.material.color.getHexString()}`); }); return out; };
const named = (g, name) => g.getObjectByName(name);

test('wallOven, fireplace and shelving are in the picker, with footprints from their options', () => {
  for (const t of MORE) assert.ok(FURNITURE_TYPES.includes(t), t);
  assert.deepEqual(footprint({ type: 'wallOven' }), [0.76, 0.65]);
  assert.deepEqual(footprint({ type: 'shelving', width: 0.9, depth: 0.3 }), [0.9, 0.3]);
  assert.deepEqual(footprint({ type: 'fireplace' }).map((v) => +v.toFixed(2)), [1.8, 0.65]);
  assert.deepEqual(footprint({ type: 'fireplace', width: 1, tv: true, screen: 1.6 }).map((v) => +v.toFixed(2)), [1.64, 0.65]);
  assert.deepEqual(footprint({ type: 'endTable', round: true, width: 0.6 }), [0.6, 0.6]);
  assert.deepEqual(footprint({ type: 'coffeeTable', round: true, diameter: 0.9 }), [0.9, 0.9]);
  assert.deepEqual(footprint({ type: 'coffeeTable' }), [1.1, 0.58], 'square as before');
});

test('every new variant builds and fits its footprint', () => {
  const variants = [
    { type: 'wallOven' }, { type: 'wallOven', stack: 'double-oven' }, { type: 'wallOven', stack: 'oven', height: 2.0, cabinet: '#334455' },
    { type: 'fireplace' }, { type: 'fireplace', fire: true, tv: true }, { type: 'fireplace', width: 1.2, height: 1.1, tv: true, screen: 1.6 },
    { type: 'shelving' }, { type: 'shelving', shelves: 6, height: 2.1 },
    { type: 'endTable', round: true }, { type: 'endTable', round: true, legs: 4, width: 0.7 },
    { type: 'coffeeTable', round: true }, { type: 'coffeeTable', round: true, legs: 4, diameter: 1.0 },
    { type: 'kitchen', sink: false }, { type: 'kitchen', cooktop: false, upper: false },
  ];
  // (the island's footprint is upstream's and leaves its stools out, so it is not checked here)
  for (const item of variants) {
    const g = build(item);
    assert.ok(g && meshes(g) > 1, JSON.stringify(item));
    const [w, , d] = size(g);
    const [fw, fd] = footprint(item);
    assert.ok(w <= fw + 0.06 && d <= fd + 0.06, `${JSON.stringify(item)}: ${w.toFixed(2)} x ${d.toFixed(2)} in ${fw} x ${fd}`);
  }
});

test('wallOven: the stack decides the appliances', () => {
  const windows = (stack) => {
    let n = 0;
    build({ type: 'wallOven', stack }).traverse((o) => { if (o.isMesh && o.material.transparent) n++; });
    return n;
  };
  assert.equal(windows('microwave+oven'), 2);
  assert.equal(windows('double-oven'), 2);
  assert.equal(windows('oven'), 1);
  assert.ok(Math.abs(size(build({ type: 'wallOven', height: 2.4 }))[1] - 2.4) < 0.01);
  assert.ok(colours(build({ type: 'wallOven', cabinet: '#334455' })).has('#334455'));
});

test('kitchen: sink and cooktop can be left out, so runs join without duplicates', () => {
  const full = meshes(build({ type: 'kitchen' }));
  assert.equal(meshes(build({ type: 'kitchen', sink: false })), full - 2, 'no basin, no tap');
  assert.equal(meshes(build({ type: 'kitchen', cooktop: false })), full - 2, 'no hob, no hood');
  // base, 4 door lines, counter, basin and tap: nothing above
  assert.equal(meshes(build({ type: 'kitchen', cooktop: false, upper: false })), 1 + 4 + 1 + 2);
  const c = colours(build({ type: 'kitchen', front: '#112233', top: '#445566' }));
  assert.ok(c.has('#112233') && c.has('#445566'));
});

test('island: colours, a gas cooktop on top, drawer lines by default', () => {
  const plain = build({ type: 'island', drawers: false });
  assert.ok(meshes(build({ type: 'island' })) > meshes(plain), 'drawer and door lines');
  const hob = build({ type: 'island', drawers: false, cooktop: true });
  assert.ok(meshes(hob) >= meshes(plain) + 1 + 5 * 2 + 12, 'a plate, five burners and two grates');
  assert.ok(size(hob)[1] > size(plain)[1], 'the grates stand on the counter');
  const c = colours(build({ type: 'island', base: '#123456', top: '#abcdef' }));
  assert.ok(c.has('#123456') && c.has('#abcdef'));
  assert.equal(build({ type: 'island', stools: 2 }).children.length - build({ type: 'island', stools: 0 }).children.length, 2);
});

test('fireplace: a dark firebox, a flickering fire and a TV screen only when asked', () => {
  const plain = build({ type: 'fireplace' });
  assert.equal(named(plain, 'fire'), undefined);
  assert.equal(named(plain, 'screen'), undefined);
  const both = build({ type: 'fireplace', fire: true, tv: true });
  assert.equal(named(both, 'fire').userData.dynamic, true, 'kept out of the static merge: it flickers');
  assert.ok(named(both, 'fire').material.emissiveIntensity > 0);
  assert.equal(named(both, 'screen').name, 'screen', 'a media player lights it, like a mediaWall');
  // the TV hangs above the mantel
  const [, h] = size(plain);
  assert.ok(size(both)[1] > h + 0.6);
  assert.ok(colours(build({ type: 'fireplace', color: '#c0ffee' })).has('#c0ffee'));
});

test('round tables: a disc on a pedestal, or on four legs', () => {
  const pedestal = build({ type: 'endTable', round: true, width: 0.6 });
  const four = build({ type: 'endTable', round: true, width: 0.6, legs: 4 });
  assert.equal(meshes(pedestal), 3);
  assert.equal(meshes(four), 5);
  const [w, , d] = size(pedestal);
  assert.ok(Math.abs(w - 0.6) < 0.01 && Math.abs(d - 0.6) < 0.01, 'diameter from width');
  assert.ok(Math.abs(size(build({ type: 'coffeeTable', round: true, diameter: 0.9 }))[0] - 0.9) < 0.01);
});

test('shelving: as many shelves as asked, black by default', () => {
  const lips = (n) => {
    let count = 0;
    build({ type: 'shelving', shelves: n }).traverse((o) => { if (o.isMesh && Math.abs(o.geometry.parameters?.depth - 0.45) < 1e-6) count++; });
    return count;
  };
  assert.equal(lips(4), 4);
  assert.equal(lips(6), 6);
  assert.ok(colours(build({ type: 'shelving' })).has('#222222'));
  assert.ok(Math.abs(size(build({ type: 'shelving', height: 2 }))[1] - 2) < 0.01);
});

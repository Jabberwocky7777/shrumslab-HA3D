import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignLights, shadowBudget, QUALITY, SHADOW_MARGIN } from '../../src/ha/light-pool.js';

const spot = (key, power, extra = {}) => ({ key, type: 'spot', power, shadow: true, dist2: 0, weight: 1, ...extra });
const point = (key, power, extra = {}) => ({ key, type: 'point', power, shadow: false, dist2: 0, weight: 1, ...extra });

test('lights that are off never get a real light', () => {
  const out = assignLights([spot('a', 0), point('b', 0), spot('c', 5)], { spots: 3, points: 2, shadows: 1 });
  assert.deepEqual(out.spot, ['c', null, null]);
  assert.deepEqual(out.point, [null, null]);
  assert.deepEqual(out.glowOnly, []);
});

test('brighter first; the rest only glow', () => {
  const cands = [spot('dim', 1), spot('bright', 20), spot('mid', 8), point('lamp', 3), point('strip', 1)];
  const out = assignLights(cands, { spots: 2, points: 1, shadows: 1 });
  assert.deepEqual(out.spot, ['bright', 'mid']);
  assert.deepEqual(out.point, ['lamp']);
  assert.deepEqual(out.glowOnly.sort(), ['dim', 'strip']);
});

test('nearer the camera target wins over a slightly brighter far one', () => {
  const near = spot('near', 10, { dist2: 1 });
  const far = spot('far', 12, { dist2: 100 });
  assert.deepEqual(assignLights([far, near], { spots: 1, points: 0, shadows: 0 }).spot, ['near']);
});

test('a dimmed floor (stacked view) ranks below the selected one', () => {
  const out = assignLights([spot('other', 20, { weight: 0.3 }), spot('mine', 10)], { spots: 1, points: 0, shadows: 1 });
  assert.deepEqual(out.spot, ['mine']);
});

test('shadow slots go to lights that may cast one; the others take plain slots', () => {
  const cands = [spot('noShadow', 30, { shadow: false }), spot('s1', 20), spot('s2', 10)];
  const out = assignLights(cands, { spots: 3, points: 0, shadows: 1 });
  assert.equal(out.spot[0], 's1', 'slot 0 casts shadows');
  assert.deepEqual(out.spot.slice(1).sort(), ['noShadow', 's2']);
});

test('the number of shadow casters never exceeds the shadow slots', () => {
  const many = Array.from({ length: 40 }, (_, i) => spot(`s${i}`, 40 - i));
  for (const [name, q] of Object.entries(QUALITY)) {
    const out = assignLights(many, q);
    const shadowed = out.spot.slice(0, q.shadows).filter(Boolean);
    assert.ok(shadowed.length <= q.shadows, name);
    assert.equal(out.spot.filter(Boolean).length, q.spots, name);
    assert.equal(out.glowOnly.length, 40 - q.spots, name);
  }
});

test('the assignment is stable for equal scores', () => {
  const a = assignLights([spot('b', 5), spot('a', 5)], { spots: 1, points: 0, shadows: 0 });
  const b = assignLights([spot('a', 5), spot('b', 5)], { spots: 1, points: 0, shadows: 0 });
  assert.deepEqual(a, b);
});

test('the shadow budget leaves room for the materials, the moon and a margin', () => {
  // an iPhone: 16 fragment texture units
  assert.equal(shadowBudget({ maxTextures: 16, samplers: 2, wanted: 20 }), 16 - 2 - SHADOW_MARGIN - 1);
  assert.equal(shadowBudget({ maxTextures: 16, samplers: 2, wanted: 4 }), 4);
  assert.equal(shadowBudget({ maxTextures: 8, samplers: 3, wanted: 4 }), 2);
  assert.equal(shadowBudget({ maxTextures: 4, samplers: 3, wanted: 4 }), 0, 'never negative');
  assert.ok(QUALITY.low.spots + QUALITY.low.points <= 4);
  assert.ok(QUALITY.medium.spots + QUALITY.medium.points <= 8);
  assert.ok(QUALITY.high.spots + QUALITY.high.points <= 12);
});

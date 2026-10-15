import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grab, moveBy, relativePoints, pointsOf } from '../../upstream/editor/points.js';
import { validatePlan } from '../../src/ha/validate.js';
import { readFileSync } from 'node:fs';

const cans = () => ({ id: 'rec.cans', type: 'cans', pos: [6, 11], points: [[5.2, 10.4], [6.8, 10.4], [5.2, 11.6], [6.8, 11.6]] });

test('dragging a multi-point light moves its pos and every point together', () => {
  const item = cans();
  const from = grab(item);
  moveBy(item, from, 0.5, -0.25);
  assert.deepEqual(item.pos, [6.5, 10.75]);
  assert.deepEqual(item.points, [[5.7, 10.15], [7.3, 10.15], [5.7, 11.35], [7.3, 11.35]]);
  // a drag is measured from where it started, not added up move by move
  moveBy(item, from, 1, 0);
  assert.deepEqual(item.pos, [7, 11]);
  assert.deepEqual(item.points[0], [6.2, 10.4]);
});

test('a point keeps its rotation (sconces)', () => {
  const sconce = { pos: [0.05, 10], points: [[0.05, 9, 90], [0.05, 11, 90]] };
  moveBy(sconce, grab(sconce), 0.1, 0.2);
  assert.deepEqual(sconce.points, [[0.15, 9.2, 90], [0.15, 11.2, 90]]);
});

test('grab copies: moving does not change the starting point', () => {
  const item = cans();
  const from = grab(item);
  moveBy(item, from, 1, 1);
  assert.deepEqual(from.points[0], [5.2, 10.4]);
});

test('a light without points only moves its pos', () => {
  const lamp = { pos: [1, 2] };
  moveBy(lamp, grab(lamp), 0.05, 0);
  assert.deepEqual(lamp, { pos: [1.05, 2] });
  assert.deepEqual(pointsOf(lamp), []);
});

test('points are drawn relative to pos', () => {
  assert.deepEqual(relativePoints(cans()), [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]);
});

test('validation refuses malformed points', () => {
  const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
  const withPoints = (points) => {
    const plan = structuredClone(demo);
    plan.lights[0] = { ...plan.lights[0], type: 'cans', points };
    return plan;
  };
  assert.doesNotThrow(() => validatePlan(withPoints([[1, 4], [2, 4]])));
  assert.doesNotThrow(() => validatePlan(withPoints([[0.05, 4, 90]])));
  assert.throws(() => validatePlan(withPoints([])), /points/);
  assert.throws(() => validatePlan(withPoints([[1]])), /point #1/);
  assert.throws(() => validatePlan(withPoints([[1, 'a']])), /point #1/);
  assert.throws(() => validatePlan(withPoints('1,2')), /points/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFloor, removeFloor, moveRoom, moveFloor, itemFloor } from '../../src/ha/editor-floors.js';
import { validatePlan } from '../../src/ha/validate.js';

const flat = () => ({
  name: 'Flat',
  rooms: [{ id: 'a', rect: [0, 0, 4, 4] }, { id: 'b', rect: [4, 0, 3, 4] }],
  furniture: [{ type: 'sofa', pos: [2, 2] }],
  openings: [{ type: 'door', from: [4, 1], to: [4, 2] }],
  lights: [{ id: 'a.main', room: 'a', type: 'ceiling', pos: [2, 2] }],
});

test('adding the first floor puts everything on "Main" and adds a second floor above it', () => {
  const doc = flat();
  const f = addFloor(doc);
  assert.deepEqual(doc.floors.map((x) => [x.id, x.level]), [['main', 0], [f.id, 1]]);
  assert.ok(doc.rooms.every((r) => r.storey === 'main'));
  assert.doesNotThrow(() => validatePlan(doc), 'an empty new floor is valid');
  assert.equal(itemFloor(doc, 'furniture', doc.furniture[0]), 'main');
  assert.equal(itemFloor(doc, 'light', doc.lights[0]), 'main');
});

test('only an empty floor can be removed; removing the last one removes floors altogether', () => {
  const doc = flat();
  const upper = addFloor(doc);
  assert.match(removeFloor(doc, 0), /Move or remove its 2 rooms first/);
  assert.equal(removeFloor(doc, doc.floors.indexOf(upper)), null);
  assert.deepEqual(doc.floors.map((x) => x.id), ['main']);
  assert.equal(removeFloor(doc, 0), null);
  assert.equal(doc.floors, undefined);
  assert.ok(doc.rooms.every((r) => !('storey' in r)));
  assert.doesNotThrow(() => validatePlan(doc), 'back to a plan without floors');
});

test('a room moved to another floor takes its furniture and the openings on its walls along', () => {
  const doc = flat();
  const upper = addFloor(doc);
  moveRoom(doc, doc.rooms[0], upper.id);
  assert.equal(doc.rooms[0].storey, upper.id);
  assert.equal(doc.furniture[0].storey, upper.id);
  assert.equal(doc.openings[0].storey, upper.id, 'the door on the shared wall');
  assert.equal(itemFloor(doc, 'light', doc.lights[0]), upper.id, 'lights follow their room');
  assert.doesNotThrow(() => validatePlan(doc));
});

test('floors reorder within the list', () => {
  const doc = flat();
  addFloor(doc);
  assert.equal(moveFloor(doc, 0, -1), false);
  assert.equal(moveFloor(doc, 0, 1), true);
  assert.equal(doc.floors[1].id, 'main');
});

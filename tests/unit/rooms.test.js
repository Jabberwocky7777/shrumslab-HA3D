import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/ha/validate.js';
import { roomGroups, largestRect, areaAliases, roomOfArea } from '../../src/ha/rooms.js';
import { personRoom } from '../../src/ha/live.js';
import { buildFromRegistry, hasArea } from '../../src/ha/registry-import.js';
import { wallSegments } from '../../upstream/three/house.js';
import { demoRegistry } from '../harness/mock-hass.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));

// An L-shaped lounge (two rectangles) next to a kitchen, and a bar below on another floor.
const plan = (patch = {}) => ({
  name: 'Parts',
  floors: [{ id: 'main', level: 0 }, { id: 'down', level: -1 }],
  rooms: [
    { id: 'lounge', name: 'Lounge', rect: [0, 0, 4, 3], storey: 'main', occupancy: 'binary_sensor.demo_lounge_motion', temperature: 'sensor.demo_lounge_temperature' },
    { id: 'lounge_l', name: 'Lounge (L)', rect: [0, 3, 2, 2], storey: 'main', part_of: 'lounge' },
    { id: 'kitchen', name: 'Kitchen', rect: [4, 0, 3, 3], storey: 'main' },
    { id: 'bar', name: 'Bar', rect: [0, 0, 7, 5], storey: 'down' },
  ],
  lights: [{ id: 'lounge_l.lamp', room: 'lounge_l', type: 'floor', pos: [1, 4] }],
  ...patch,
});
const withRoom = (i, extra) => {
  const p = plan();
  Object.assign(p.rooms[i], extra);
  return p;
};

test('part_of: a room in several rectangles', () => {
  const { config } = validatePlan(plan());
  assert.equal(config.rooms.find((r) => r.id === 'lounge_l').partOf, 'lounge');
  assert.equal(config.rooms.find((r) => r.id === 'lounge').partOf, null);
  const group = roomGroups(config.rooms);
  assert.equal(group('lounge_l'), 'lounge');
  assert.equal(group('kitchen'), 'kitchen');
  assert.equal(largestRect(config.rooms, 'lounge').id, 'lounge');
});

test('part_of: unknown room, a part of a part, another floor and itself are refused', () => {
  assert.throws(() => validatePlan(withRoom(1, { part_of: 'nowhere' })), /"part_of" unknown room "nowhere"/);
  assert.throws(() => validatePlan(withRoom(1, { part_of: 'lounge_l' })), /cannot be "part_of" itself/);
  assert.throws(() => validatePlan(withRoom(1, { part_of: 'bar' })), /on floor "main" but its main room "bar" is on "down"/);
  const p = plan();
  p.rooms.push({ id: 'lounge_ll', rect: [0, 5, 1, 1], storey: 'main', part_of: 'lounge_l' });
  assert.throws(() => validatePlan(p), /itself a part of "lounge"/);
  assert.throws(() => validatePlan(withRoom(1, { part_of: 3 })), /"part_of" that is not a room id/);
});

test('no wall between a part and its main room; a wall to any other room', () => {
  const { config } = validatePlan(plan());
  const main = { ...config, rooms: config.rooms.filter((r) => r.storey === 'main') };
  const segs = wallSegments(main);
  // the line z = 3 from x 0..2 is between the lounge and its L: joined, no wall
  const joint = segs.find((s) => s.axis === 'x' && s.c === 3 && s.a === 0);
  assert.equal(joint.kind, 'joined');
  assert.equal(joint.b, 2);
  // the lounge and the kitchen still get their inner wall
  assert.ok(segs.some((s) => s.axis === 'z' && s.c === 4 && s.kind === 'interior'));
  // without part_of the same line is an ordinary inner wall
  const plain = validatePlan(withRoom(1, { part_of: undefined })).config;
  const before = wallSegments({ ...plain, rooms: plain.rooms.filter((r) => r.storey === 'main') });
  assert.equal(before.find((s) => s.axis === 'x' && s.c === 3 && s.a === 0).kind, 'interior');
});

test('the demo: the rec nook is part of the rec room', () => {
  const { config } = validatePlan(demo);
  assert.equal(config.rooms.find((r) => r.id === 'rec_nook').partOf, 'rec');
});

test('area: a string or a list of area ids or names', () => {
  const { config } = validatePlan(withRoom(0, { area: ['demo_lounge', 'Family room'] }));
  const lounge = config.rooms.find((r) => r.id === 'lounge');
  assert.deepEqual(lounge.areas, ['demo_lounge', 'Family room']);
  assert.equal(lounge.area, 'demo_lounge');
  assert.deepEqual(validatePlan(withRoom(0, { area: 'demo_lounge' })).config.rooms[0].areas, ['demo_lounge']);
  assert.throws(() => validatePlan(withRoom(0, { area: [] })), /empty "area" list/);
  assert.throws(() => validatePlan(withRoom(0, { area: ['demo_lounge', 4] })), /not an area id or name/);
  assert.throws(() => validatePlan(withRoom(0, { area: '' })), /not an area id or name/);
});

test('a person matches any area entry, any case, or the room name or id', () => {
  const { config } = validatePlan(withRoom(0, { area: ['demo_lounge', 'Family room'] }));
  const rooms = config.rooms;
  assert.equal(personRoom(rooms, 'demo_lounge').id, 'lounge');
  assert.equal(personRoom(rooms, 'FAMILY ROOM').id, 'lounge');
  assert.equal(personRoom(rooms, 'Kitchen').id, 'kitchen');
  assert.equal(personRoom(rooms, 'kitchen').id, 'kitchen');
  // a part's name (or id) counts as its main room
  assert.equal(personRoom(rooms, 'lounge_l').id, 'lounge');
  assert.equal(personRoom(rooms, 'somewhere'), null);
});

test('with the area registry, area ids and names match each other', () => {
  const areas = {
    demo_lounge: { area_id: 'demo_lounge', name: 'Living room' },
    demo_cook: { area_id: 'demo_cook', name: 'Cooking' },
  };
  const { config } = validatePlan(plan({
    rooms: plan().rooms.map((r) => (r.id === 'lounge' ? { ...r, area: 'Living room' } : r.id === 'kitchen' ? { ...r, area: ['demo_cook'] } : r)),
  }));
  const rooms = config.rooms;
  // the plan names the area, the person's state is its id, and the other way round
  assert.equal(personRoom(rooms, 'demo_lounge', areas).id, 'lounge');
  assert.equal(personRoom(rooms, 'cooking', areas).id, 'kitchen');
  // without the registry only the literal entry matches
  assert.equal(personRoom(rooms, 'demo_lounge'), null);
  assert.equal(personRoom(rooms, 'Living room').id, 'lounge');
  assert.deepEqual([...areaAliases(['Living room'], areas)].sort(), ['demo_lounge', 'living room']);
  assert.equal(roomOfArea(rooms, '', areas), null);
});

test('Import from Home Assistant: a room with a list of areas already has each of them', () => {
  const r = demoRegistry();
  const reg = { floors: Object.values(r.floors), areas: Object.values(r.areas), devices: Object.values(r.devices), entities: Object.values(r.entities) };
  const den = r.areas.demo_den;
  assert.ok(hasArea({ area: ['demo_x', 'demo_den'] }, den));
  assert.ok(hasArea({ area: 'DEN' }, den), 'by name, any case');
  assert.ok(!hasArea({ area: ['demo_x'] }, den));
  assert.ok(!hasArea({}, den));
  const p = structuredClone(demo);
  p.rooms.find((x) => x.id === 'bar').area = ['demo_bar', 'Den'];
  const proposal = buildFromRegistry(reg, { plan: p });
  assert.ok(!proposal.rooms.some((x) => x.area === 'demo_den'), 'the bar stands for the den already');
  // the den's lamp goes into the bar
  assert.equal(proposal.lights.find((l) => l.link.id === 'light.demo_den_lamp').room, 'bar');
  // the demo kitchen lists two areas; Kitchen is one of them
  assert.ok(!buildFromRegistry(reg, { plan: demo }).rooms.some((x) => x.area === 'demo_kitchen'));
});

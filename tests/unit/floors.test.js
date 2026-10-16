import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/ha/validate.js';
import { floorView, defaultFloor, IMPLICIT_FLOOR, DEFAULT_ACTIONS } from '../../src/ha/floors.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
// The demo as a plan from before floors: its main floor only, no "floors", no "storey".
const flatDemo = () => {
  const p = structuredClone(demo);
  const main = new Set(p.rooms.filter((r) => r.storey === 'main').map((r) => r.id));
  delete p.floors;
  p.rooms = p.rooms.filter((r) => main.has(r.id)).map(({ storey, ...r }) => r);
  p.lights = p.lights.filter((l) => main.has(l.room));
  p.openings = p.openings.filter((o) => !o.storey);
  p.furniture = p.furniture.filter((f) => !f.storey);
  return p;
};

// A small two-floor house; the basement lies right under the main floor (same x/z).
const twoFloors = (patch = {}) => ({
  name: 'Two floors',
  floors: [
    { id: 'main', name: 'Main', level: 0, actions: [
      { id: 'on', name: 'Lights on', icon: 'sun', run: 'script.demo_main_lights_main' },
      { id: 'off', name: 'All off', icon: 'moon', builtin: 'all_off' },
    ] },
    { id: 'basement', name: 'Basement', level: -1, height: 2.3 },
  ],
  rooms: [
    { id: 'living', rect: [0, 0, 5, 4], storey: 'main' },
    { id: 'kitchen', rect: [5, 0, 3, 4], storey: 'main' },
    { id: 'bar', rect: [0, 0, 8, 4], storey: 'basement' },
  ],
  openings: [{ type: 'door', from: [5, 1], to: [5, 2] }],
  furniture: [{ type: 'sofa', pos: [6, 2], storey: 'main' }],
  lights: [
    { id: 'living.main', room: 'living', type: 'ceiling', pos: [2, 2] },
    { id: 'bar.main', room: 'bar', type: 'ceiling', pos: [2, 2] },
  ],
  ...patch,
});

test('the demo has a main floor and a basement', () => {
  const { config } = validatePlan(demo);
  assert.deepEqual(config.floors.map((f) => f.id), ['basement', 'main']);
  assert.equal(config.furniture.filter((f) => f.storey === 'basement').length, 6);
});

test('a plan without floors has one implicit floor and is unchanged otherwise', () => {
  const { config } = validatePlan(flatDemo());
  assert.equal(config.multiFloor, false);
  assert.deepEqual(config.floors.map((f) => f.id), [IMPLICIT_FLOOR]);
  assert.ok(config.rooms.every((r) => r.storey === IMPLICIT_FLOOR));
  assert.deepEqual(config.floors[0].actions, DEFAULT_ACTIONS);
  assert.equal(floorView(config, IMPLICIT_FLOOR).rooms.length, config.rooms.length);
});

test('floors are sorted by level and get defaults', () => {
  const { config } = validatePlan(twoFloors());
  assert.equal(config.multiFloor, true);
  assert.deepEqual(config.floors.map((f) => f.id), ['basement', 'main']);
  const [basement, main] = config.floors;
  assert.equal(basement.height, 2.3);
  assert.equal(main.height, 2.6, 'the plan wallHeight');
  assert.deepEqual(basement.actions, DEFAULT_ACTIONS, 'no actions: built-in All on / All off');
  assert.equal(main.actions[0].run, 'script.demo_main_lights_main');
  assert.equal(main.actions[1].builtin, 'all_off');
  assert.equal(defaultFloor(config), 'main', 'level 0 first');
  assert.deepEqual(floorView(config, 'basement').rooms.map((r) => r.id), ['bar']);
  assert.deepEqual(floorView(config, 'basement').bounds, { minX: 0, minZ: 0, maxX: 8, maxZ: 4 });
});

test('levels default to the plan order', () => {
  const p = twoFloors();
  for (const f of p.floors) delete f.level;
  assert.deepEqual(validatePlan(p).config.floors.map((f) => [f.id, f.level]), [['main', 0], ['basement', 1]]);
});

test('with floors, every room needs a known storey; without, none may have one', () => {
  const p = twoFloors();
  delete p.rooms[0].storey;
  assert.throws(() => validatePlan(p), /Room "living" needs a "storey"/);
  p.rooms[0].storey = 'attic';
  assert.throws(() => validatePlan(p), /unknown floor "attic"/);
  const flat = flatDemo();
  flat.rooms[0].storey = 'main';
  assert.throws(() => validatePlan(flat), /has a "storey" but the plan has no "floors"/);
});

test('floor ids are unique, levels and heights are numbers', () => {
  const dup = twoFloors();
  dup.floors[1].id = 'main';
  assert.throws(() => validatePlan(dup), /Duplicate floor id "main"/);
  assert.throws(() => validatePlan(twoFloors({ floors: [] })), /at least one floor/);
  const bad = twoFloors();
  bad.floors[0].level = 'ground';
  assert.throws(() => validatePlan(bad), /"level" that is not a number/);
  bad.floors[0].level = 0;
  bad.floors[1].height = -1;
  assert.throws(() => validatePlan(bad), /"height"/);
});

test('openings and furniture find their floor; where floors overlap, the first listed one', () => {
  const { config } = validatePlan(twoFloors());
  assert.equal(config.openings[0].storey, 'main', 'the wall between living and kitchen is only on main');
  assert.equal(config.furniture[0].storey, 'main');
  const overlap = twoFloors({ furniture: [{ type: 'sofa', pos: [2, 2] }], openings: [{ type: 'window', from: [0, 1], to: [0, 2] }] });
  assert.equal(validatePlan(overlap).config.furniture[0].storey, 'main', 'main is listed first');
  assert.equal(validatePlan(overlap).config.openings[0].storey, 'main');
  overlap.furniture[0].storey = 'basement';
  overlap.openings[0].storey = 'basement';
  assert.equal(validatePlan(overlap).config.furniture[0].storey, 'basement');
  assert.equal(validatePlan(overlap).config.openings[0].storey, 'basement');
  overlap.furniture[0].storey = 'attic';
  assert.throws(() => validatePlan(overlap), /Furniture #1 \(sofa\) is on unknown floor "attic"/);
});

test('floor actions: run may only start a script or scene', () => {
  const withAction = (a) => {
    const p = twoFloors();
    p.floors[0].actions = [a];
    return p;
  };
  assert.doesNotThrow(() => validatePlan(withAction({ id: 'a', run: 'script.demo_x' })));
  assert.doesNotThrow(() => validatePlan(withAction({ id: 'a', run: 'scene.demo_x' })));
  for (const run of ['light.demo_x', 'switch.demo_x', 'lock.demo_front_door', 'cover.demo_garage_door', 'automation.demo_x', 'Script.Bad']) {
    assert.throws(() => validatePlan(withAction({ id: 'a', run })), /may only be a script\.\* or scene\.\*/, run);
  }
});

test('floor actions: exactly one of run or builtin, a known builtin, unique ids, known icons', () => {
  const withActions = (actions) => {
    const p = twoFloors();
    p.floors[0].actions = actions;
    return p;
  };
  assert.throws(() => validatePlan(withActions([{ id: 'a' }])), /not neither/);
  assert.throws(() => validatePlan(withActions([{ id: 'a', run: 'script.demo_x', builtin: 'all_on' }])), /not both/);
  assert.throws(() => validatePlan(withActions([{ id: 'a', builtin: 'everything_off' }])), /unknown "builtin"/);
  assert.throws(() => validatePlan(withActions([{ id: 'a', builtin: 'all_on' }, { id: 'a', builtin: 'all_off' }])), /two actions with id "a"/);
  assert.throws(() => validatePlan(withActions([{ id: 'a', builtin: 'all_on', icon: 'nope' }])), /unknown icon/);
  assert.throws(() => validatePlan(withActions([{ builtin: 'all_on' }])), /missing an "id"/);
});

test('a floor action script missing from Home Assistant is only a warning', () => {
  const { warnings } = validatePlan(twoFloors(), { states: {} });
  assert.ok(warnings.some((w) => /script\.demo_main_lights_main/.test(w)));
});

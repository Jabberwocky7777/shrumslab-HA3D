import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFromRegistry, applyImport, readRegistry } from '../../src/ha/registry-import.js';
import { validatePlan } from '../../src/ha/validate.js';
import { demoRegistry, demoStates, createMockHass } from '../harness/mock-hass.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
const lists = (r) => ({ floors: Object.values(r.floors), areas: Object.values(r.areas), devices: Object.values(r.devices), entities: Object.values(r.entities) });
const registry = () => lists(demoRegistry());

test('a new plan: a floor per Home Assistant floor by level, a room per area, lights ticked, the rest not', () => {
  const p = buildFromRegistry(registry(), { states: demoStates() });
  assert.deepEqual(p.floors.map((f) => [f.id, f.name, f.level]), [
    ['demo_lower', 'Lower level', -1], ['demo_ground', 'Ground floor', 0], ['other_areas', 'Other areas', 1],
  ]);
  assert.deepEqual(p.rooms.map((r) => [r.name, r.area, r.storey]), [
    ['Den', 'demo_den', 'demo_lower'], ['Kitchen', 'demo_kitchen', 'demo_ground'],
    ['Living room', 'demo_living', 'demo_ground'], ['Porch', 'demo_porch', 'other_areas'],
  ]);
  assert.deepEqual(p.lights.map((l) => [l.link.id, l.include]).sort(), [
    ['light.demo_den_lamp', true], ['light.demo_import_floor_lamp', true], ['light.demo_kitchen_spots', true], ['light.demo_living_ceiling', true],
  ]);
  // a switch whose device is a "lamp" is offered, unticked; the coffee plug is not offered at all
  assert.deepEqual(p.switches.map((s) => [s.link.id, s.include]), [['switch.demo_reading_lamp', false]]);
  assert.deepEqual(p.devices.map((d) => [d.entity, d.include]).sort(), [
    ['climate.demo_den_heater', false], ['cover.demo_den_blinds', false], ['lock.demo_porch_lock', false], ['media_player.demo_tv', false],
  ]);
  assert.equal(p.devices.find((d) => d.entity === 'lock.demo_porch_lock').sensitive, true);
  // hidden and diagnostic entities are left out
  const all = [...p.lights, ...p.switches, ...p.devices].map((x) => x.link?.id || x.entity);
  assert.ok(!all.includes('light.demo_hidden_light'));
  assert.ok(!all.includes('sensor.demo_den_signal'));
});

test('rooms are laid out in a grid on their floor, lights inside their room', () => {
  const p = buildFromRegistry(registry());
  const ground = p.rooms.filter((r) => r.storey === 'demo_ground');
  assert.equal(ground.length, 2);
  const [a, b] = ground.map((r) => r.rect);
  assert.ok(a[0] + a[2] <= b[0] || a[1] + a[3] <= b[1], 'side by side, not on top of each other');
  for (const l of p.lights) {
    const [x, z, w, d] = p.rooms.find((r) => r.id === l.room).rect;
    assert.ok(l.pos[0] > x && l.pos[0] < x + w && l.pos[1] > z && l.pos[1] < z + d, l.id);
  }
});

test('a new plan from the import is a valid plan', () => {
  const p = buildFromRegistry(registry(), { states: demoStates() });
  for (const x of [...p.switches, ...p.devices]) x.include = true;
  const plan = applyImport(null, p, { mode: 'new', name: 'Imported' });
  const { config } = validatePlan(plan);
  assert.equal(config.rooms.length, 4);
  assert.equal(config.floors.length, 3);
  assert.equal(config.lights.length, 5);
  assert.equal(config.entities.length, 4);
  assert.ok(config.entities.every((e) => e.tap_action.action === 'more-info'));
  assert.equal(config.rooms.find((r) => r.id === 'demo_den').area, 'demo_den');
});

test('merging only adds what is missing, matched by entity id and area', () => {
  const p = buildFromRegistry(registry(), { states: demoStates(), plan: demo });
  // the demo already has light.demo_living_ceiling, light.demo_kitchen_spots and media_player.demo_tv
  assert.deepEqual(p.lights.map((l) => l.link.id).sort(), ['light.demo_den_lamp', 'light.demo_import_floor_lamp']);
  assert.ok(!p.devices.some((d) => d.entity === 'media_player.demo_tv'));
  // Living and Kitchen carry their area in the demo: no second living room or kitchen
  assert.deepEqual(p.rooms.map((r) => r.name), ['Den', 'Porch']);
  // the floor lamp (its device is in the living room) goes into the plan's own Living
  assert.equal(p.lights.find((l) => l.link.id === 'light.demo_import_floor_lamp').room, 'living');
  const merged = applyImport(demo, p);
  const { config } = validatePlan(merged);
  assert.equal(config.rooms.length, demo.rooms.length + 2);
  assert.equal(config.lights.length, demo.lights.length + 2);
  assert.deepEqual(config.floors.map((f) => f.id).sort(), ['basement', 'demo_lower', 'main', 'other_areas']);
  // a second import of the merged plan finds nothing new
  const again = buildFromRegistry(registry(), { states: demoStates(), plan: merged });
  assert.deepEqual([again.rooms.length, again.lights.length], [0, 0]);
});

test('unticked rooms take their lights with them; unticked items stay out', () => {
  const p = buildFromRegistry(registry());
  p.rooms.find((r) => r.area === 'demo_den').include = false;
  const plan = applyImport(null, p, { mode: 'new' });
  assert.ok(!plan.rooms.some((r) => r.area === 'demo_den'));
  assert.ok(!plan.lights.some((l) => l.link.id === 'light.demo_den_lamp'));
  assert.ok(!plan.entities.length, 'devices are unticked by default');
  assert.ok(!plan.floors.some((f) => f.id === 'demo_lower'), 'a floor with no room left is not added');
  assert.doesNotThrow(() => validatePlan(plan));
});

test('a plan without floors keeps its rooms on a "Main" floor when floors come in', () => {
  const flat = { name: 'Flat', rooms: [{ id: 'hall', name: 'Hall', rect: [0, 0, 3, 3] }], lights: [] };
  const merged = applyImport(flat, buildFromRegistry(registry(), { plan: flat }));
  assert.equal(merged.rooms.find((r) => r.id === 'hall').storey, 'main');
  assert.doesNotThrow(() => validatePlan(merged));
});

test('without floors in Home Assistant, rooms get no storey', () => {
  const r = registry();
  r.floors = [];
  const p = buildFromRegistry(r);
  assert.deepEqual(p.floors, []);
  assert.ok(p.rooms.every((x) => !x.storey));
  assert.doesNotThrow(() => validatePlan(applyImport(null, p, { mode: 'new' })));
});

test('the registry is read from hass, or from the websocket commands when hass lacks it', async () => {
  const direct = await readRegistry(createMockHass());
  const ws = createMockHass({ registry: 'ws' });
  const viaWs = await readRegistry(ws);
  assert.deepEqual(ws.ws.map((m) => m.type).sort(), ['config/area_registry/list', 'config/device_registry/list', 'config/entity_registry/list_for_display', 'config/floor_registry/list']);
  const strip = (r) => ({ ...r, entities: r.entities.map((e) => ({ entity_id: e.entity_id, device_id: e.device_id, area_id: e.area_id, name: e.name, hidden: e.hidden, entity_category: e.entity_category })) });
  assert.deepEqual(strip(viaWs), strip(direct));
  assert.deepEqual(buildFromRegistry(viaWs), buildFromRegistry(direct));
});

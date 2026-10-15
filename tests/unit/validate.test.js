import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/ha/validate.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
const plan = (patch) => ({ ...structuredClone(demo), ...patch });
const room = demo.rooms[0].id;

test('the demo plan is valid', () => {
  const { config, warnings } = validatePlan(demo);
  assert.equal(config.rooms.length, 7);
  assert.equal(config.entities.length, 7);
  assert.deepEqual(warnings, []);
});

test('upstream rules still apply', () => {
  assert.throws(() => validatePlan(plan({ rooms: [] })), /at least one room/);
  assert.throws(() => validatePlan(plan({ openings: [{ from: [0, 0], to: [1, 1] }] })), /axis-aligned/);
  assert.throws(() => validatePlan(plan({ lights: [...demo.lights, { ...demo.lights[0] }] })), /Duplicate id/);
});

test('entity ids must look like entity ids', () => {
  const lights = structuredClone(demo.lights);
  lights[0].link.id = 'Light.Demo Kitchen';
  assert.throws(() => validatePlan(plan({ lights })), /not a valid entity id/);
  const entities = [{ id: 'e1', room, entity: 'tv', pos: [1, 1] }];
  assert.throws(() => validatePlan(plan({ entities })), /needs "entity"/);
});

test('entities need a known room, a position and a unique id', () => {
  assert.throws(() => validatePlan(plan({ entities: [{ id: 'e1', room: 'nowhere', entity: 'fan.demo_f', pos: [1, 1] }] })), /unknown room/);
  assert.throws(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity: 'fan.demo_f' }] })), /"pos"/);
  assert.throws(() => validatePlan(plan({ entities: [{ id: room, room, entity: 'fan.demo_f', pos: [1, 1] }] })), /Duplicate id/);
});

test('a toggle tap on a sensitive entity is rejected', () => {
  for (const entity of ['lock.demo_front_door', 'cover.demo_garage_door', 'alarm_control_panel.demo_alarm', 'valve.demo_water', 'siren.demo_siren', 'camera.demo_porch']) {
    assert.throws(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity, pos: [1, 1], tap: 'toggle' }] })), /sensitive/, entity);
    assert.throws(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity, pos: [1, 1], hold: 'toggle' }] })), /sensitive/, entity);
  }
  assert.doesNotThrow(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity: 'lock.demo_front_door', pos: [1, 1], tap: 'more-info' }] })));
});

test('toggle is only for light, switch, fan and media_player', () => {
  assert.throws(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity: 'climate.demo_t', pos: [1, 1], tap: 'toggle' }] })), /only works/);
  assert.doesNotThrow(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity: 'fan.demo_f', pos: [1, 1], tap: 'toggle' }] })));
  assert.throws(() => validatePlan(plan({ entities: [{ id: 'e1', room, entity: 'fan.demo_f', pos: [1, 1], tap: 'navigate' }] })), /path/);
});

test('sensitive devices cannot be plan lights, nor reached by scenes', () => {
  const lights = structuredClone(demo.lights);
  lights[0].link.id = 'lock.demo_front_door';
  assert.throws(() => validatePlan(plan({ lights })), /sensitive/);
  lights[0].link.id = 'media_player.demo_tv';
  assert.throws(() => validatePlan(plan({ lights })), /light\.\* or switch\.\*/);
  const scenes = [{ id: 'bad', lights: { 'lock.demo_front_door': { on: false } } }];
  assert.throws(() => validatePlan(plan({ scenes })), /cannot change/);
  const viaEntity = [{ id: 'bad', lights: { 'hall.front_door': { on: false } } }];
  assert.doesNotThrow(() => validatePlan(plan({ scenes: viaEntity })), 'an unknown plain id only warns');
  assert.throws(() => validatePlan(plan({ scenes: [{ id: 'bad', lights: { 'cover.demo_garage_door': { on: true } } }] })), /cannot change/);
});

test('run may only be script.* or scene.*', () => {
  assert.doesNotThrow(() => validatePlan(plan({ scenes: [{ id: 's', run: 'script.demo_x' }] })));
  assert.doesNotThrow(() => validatePlan(plan({ scenes: [{ id: 's', run: 'scene.demo_x' }] })));
  assert.throws(() => validatePlan(plan({ scenes: [{ id: 's', run: 'lock.demo_front_door' }] })), /script/);
  assert.throws(() => validatePlan(plan({ scenes: [{ id: 's', run: 'light.demo_x' }] })), /script/);
});

test('a linked entity missing from hass.states is a warning, not an error', () => {
  const { warnings } = validatePlan(demo, { states: {} });
  assert.ok(warnings.length > 10);
  assert.ok(warnings.every((w) => /not found/.test(w)));
});

test('lights without capabilities are flagged for capabilities from Home Assistant', () => {
  const { config } = validatePlan(demo);
  assert.equal(config.lights.find((l) => l.id === 'kitchen.spots').autoCapabilities, false);
  assert.equal(config.lights.find((l) => l.id === 'living.main').autoCapabilities, true);
});

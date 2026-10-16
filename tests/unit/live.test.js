import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/ha/validate.js';
import { liveEntities } from '../../src/ha/live-fields.js';
import { heatColor, personRoom, sameOriginPicture, coverOpen, fanSpeed, wattsLabel, daylightOf } from '../../src/ha/live.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
const clone = () => structuredClone(demo);

test('the demo shows every live field and is valid', () => {
  const { config, warnings } = validatePlan(demo);
  assert.deepEqual(warnings, []);
  const front = config.openings.find((o) => o.lock);
  assert.deepEqual([front.contact, front.lock], ['binary_sensor.demo_front_door', 'lock.demo_front_door']);
  assert.equal(config.openings.find((o) => o.type === 'garage').cover, 'cover.demo_garage_door');
  assert.deepEqual(config.rooms.find((r) => r.id === 'living').occupancy, ['binary_sensor.demo_living_motion']);
  assert.equal(config.rooms.find((r) => r.id === 'living').temperature, 'sensor.demo_living_temperature');
  assert.equal(config.people.length, 2);
  assert.equal(config.lights.find((l) => l.id === 'rec.fan').fan, 'fan.demo_rec_fan');
  assert.equal(config.lights.find((l) => l.id === 'kitchen.spots').power, 'sensor.demo_kitchen_spots_power');
  assert.equal(config.entities.find((e) => e.id === 'bedroom.fan').fan, 'fan.demo_bedroom_fan', 'a fan entity spins by itself');
  assert.equal(config.furniture.find((f) => f.type === 'tv').entity, 'media_player.demo_tv');
  assert.ok(liveEntities(config).includes('sensor.demo_guest_area'));
});

test('openings: contact, lock and garage covers have the right domains and types', () => {
  const withOpening = (o) => { const p = clone(); p.openings.push(o); return p; };
  const door = { type: 'door', from: [3.1, 3.6], to: [4.0, 3.6] };
  assert.throws(() => validatePlan(withOpening({ ...door, contact: 'switch.demo_x' })), /binary_sensor\.\*/);
  assert.throws(() => validatePlan(withOpening({ ...door, lock: 'switch.demo_x' })), /lock\.\*/);
  assert.throws(() => validatePlan(withOpening({ ...door, type: 'window', lock: 'lock.demo_x' })), /only for doors/);
  assert.throws(() => validatePlan(withOpening({ ...door, type: 'garage' })), /needs "cover"/);
  assert.throws(() => validatePlan(withOpening({ ...door, cover: 'cover.demo_x' })), /only for "type": "garage"/);
  assert.throws(() => validatePlan(withOpening({ ...door, type: 'garage', cover: 'lock.demo_x' })), /cover\.\*/);
  assert.throws(() => validatePlan(withOpening({ ...door, type: 'portal' })), /unknown type "portal"/);
  assert.doesNotThrow(() => validatePlan(withOpening({ ...door, contact: 'binary_sensor.demo_x', lock: 'lock.demo_x' })));
});

test('rooms, lights, entities, furniture and people check their fields', () => {
  const p = clone();
  p.rooms[0].occupancy = 'sensor.demo_x';
  assert.throws(() => validatePlan(p), /occupancy.*binary_sensor/);
  p.rooms[0].occupancy = [];
  assert.throws(() => validatePlan(p), /empty "occupancy"/);
  p.rooms[0].occupancy = 'binary_sensor.demo_x';
  assert.deepEqual(validatePlan(p).config.rooms[0].occupancy, ['binary_sensor.demo_x'], 'one sensor without a list');
  p.rooms[0].temperature = 'climate.demo_x';
  assert.throws(() => validatePlan(p), /temperature.*sensor\.\*/);

  const l = clone();
  l.lights.find((x) => x.id === 'living.main').fan = 'fan.demo_x';
  assert.throws(() => validatePlan(l), /only for lights of type "fan"/);
  const pw = clone();
  pw.lights[0].power = 'switch.demo_x';
  assert.throws(() => validatePlan(pw), /power.*sensor\.\*/);

  const f = clone();
  f.furniture.find((x) => x.type === 'sofa').entity = 'media_player.demo_tv';
  assert.throws(() => validatePlan(f), /only for tv and mediaWall/);
  f.furniture.find((x) => x.type === 'sofa').entity = undefined;
  f.furniture.find((x) => x.type === 'tv').entity = 'light.demo_x';
  assert.throws(() => validatePlan(f), /media_player\.\*/);

  const ppl = clone();
  ppl.people.push({ name: 'Demo Person', entity: 'sensor.demo_x' });
  assert.throws(() => validatePlan(ppl), /Two people are called/);
  ppl.people = [{ name: 'X', entity: 'nope' }];
  assert.throws(() => validatePlan(ppl), /needs "entity"/);
  ppl.people = [{ name: 'X', entity: 'sensor.demo_x', color: 'blue' }];
  assert.throws(() => validatePlan(ppl), /"#rrggbb"/);
  ppl.people = [{ entity: 'sensor.demo_x' }];
  assert.throws(() => validatePlan(ppl), /needs a "name"/);
});

test('a plan from before keeps working without any live field', () => {
  const p = clone();
  delete p.people;
  for (const r of p.rooms) { delete r.occupancy; delete r.temperature; }
  for (const o of p.openings) { delete o.contact; delete o.lock; }
  p.openings = p.openings.filter((o) => o.type !== 'garage');
  const { config } = validatePlan(p);
  assert.deepEqual(config.people, []);
  assert.ok(config.rooms.every((r) => r.occupancy.length === 0 && r.temperature === null));
});

test('heat colours go from cool to warm, in either unit', () => {
  const blue = heatColor(16).b;
  const red = heatColor(27).r;
  assert.ok(blue > heatColor(16).r, '16 °C is blue');
  assert.ok(red > heatColor(27).b, '27 °C is red');
  assert.equal(heatColor(71.6, '°F').getHexString(), heatColor(22).getHexString());
  assert.equal(heatColor(-10).getHexString(), heatColor(16).getHexString(), 'clamped');
});

test('a person is in the room whose area (or name) their state names', () => {
  const rooms = validatePlan(demo).config.rooms;
  assert.equal(personRoom(rooms, 'demo_living').id, 'living');
  assert.equal(personRoom(rooms, 'Bar').id, 'bar');
  assert.equal(personRoom(rooms, 'not_home'), null);
  assert.equal(personRoom(rooms, 'the_moon'), null);
});

test('a TV picture is only ever loaded from this origin', () => {
  const base = 'https://ha.example.org:8443/lovelace/0';
  assert.equal(sameOriginPicture('/api/media_player_proxy/media_player.demo_tv?token=abc', base), 'https://ha.example.org:8443/api/media_player_proxy/media_player.demo_tv?token=abc');
  for (const bad of ['https://example.com/poster.jpg', '//example.com/poster.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'poster.jpg', null, 42]) {
    assert.equal(sameOriginPicture(bad, base), null, String(bad));
  }
});

test('cover, fan, power and sun readings', () => {
  assert.equal(coverOpen({ state: 'open', attributes: { current_position: 40 } }), 0.4);
  assert.equal(coverOpen({ state: 'opening', attributes: {} }), 1);
  assert.equal(coverOpen({ state: 'closed', attributes: {} }), 0);
  assert.equal(coverOpen({ state: 'unavailable', attributes: {} }), 0);
  assert.ok(fanSpeed({ state: 'on', attributes: { percentage: 100 } }) > fanSpeed({ state: 'on', attributes: { percentage: 25 } }));
  assert.equal(fanSpeed({ state: 'off', attributes: { percentage: 100 } }), 0);
  assert.equal(wattsLabel({ state: '18.4', attributes: { unit_of_measurement: 'W' } }), '18 W');
  assert.equal(wattsLabel({ state: '1234', attributes: { unit_of_measurement: 'W' } }), '1.23 kW');
  assert.equal(wattsLabel({ state: '2.5', attributes: { unit_of_measurement: 'kW' } }), '2.50 kW');
  assert.equal(wattsLabel({ state: 'unknown', attributes: {} }), null);
  assert.equal(daylightOf({ state: 'below_horizon', attributes: { elevation: -12 } }), 0);
  assert.equal(daylightOf({ state: 'above_horizon', attributes: { elevation: 35 } }), 1);
  assert.equal(daylightOf({ state: 'above_horizon', attributes: { elevation: 2 } }), 0.5);
});

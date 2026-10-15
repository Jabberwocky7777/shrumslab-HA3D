import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lightCall, lightFromHa, capabilitiesFrom, rgbToHex, hexToRgb, availabilityOf, acCalls, acFromHa, acFeaturesFromHa,
} from '../../src/ha/mapping.js';

const on = (attributes) => ({ state: 'on', attributes });

test('brightness 0–1 becomes 0–255, rounded, never 0 while on', () => {
  assert.deepEqual(lightCall('light.demo_a', { on: true, brightness: 0.5 }), { domain: 'light', service: 'turn_on', data: { entity_id: 'light.demo_a', brightness: 128 } });
  assert.equal(lightCall('light.demo_a', { brightness: 1 }, { on: true }).data.brightness, 255);
  assert.equal(lightCall('light.demo_a', { brightness: 0.001 }, { on: true }).data.brightness, 1);
  assert.equal(lightCall('light.demo_a', { brightness: 0.333 }, { on: true }).data.brightness, 85);
});

test('on/off become turn_on/turn_off', () => {
  assert.deepEqual(lightCall('light.demo_a', { on: false }), { domain: 'light', service: 'turn_off', data: { entity_id: 'light.demo_a' } });
  assert.deepEqual(lightCall('light.demo_a', { on: true }), { domain: 'light', service: 'turn_on', data: { entity_id: 'light.demo_a' } });
  // a change while the light is off (state.on false) is a turn_off, not a surprise turn_on
  assert.equal(lightCall('light.demo_a', { brightness: 0.4 }, { on: false }).service, 'turn_off');
});

test('kelvin and colour', () => {
  assert.equal(lightCall('light.demo_a', { temp: 2700 }, { on: true }).data.color_temp_kelvin, 2700);
  assert.deepEqual(lightCall('light.demo_a', { color: '#ff7a3c' }, { on: true }).data.rgb_color, [255, 122, 60]);
  assert.equal(lightCall('light.demo_a', { color: null }, { on: true }), null, 'a colour reset alone sends nothing');
});

test('switch.* is on/off only', () => {
  assert.deepEqual(lightCall('switch.demo_plug', { on: true, brightness: 0.5, color: '#ffffff' }), { domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.demo_plug' } });
  assert.deepEqual(lightCall('switch.demo_plug', { on: false }).service, 'turn_off');
  assert.deepEqual(capabilitiesFrom('switch.demo_plug', { attributes: { supported_color_modes: ['hs'] } }), []);
});

test('lightCall refuses anything but light and switch', () => {
  assert.throws(() => lightCall('lock.demo_front_door', { on: true }));
  assert.throws(() => lightCall('cover.demo_garage', { on: false }));
});

test('HA state to house-control state', () => {
  assert.deepEqual(lightFromHa({ state: 'off', attributes: { brightness: null } }), { on: false });
  assert.deepEqual(lightFromHa(on({ brightness: 255, color_mode: 'brightness' })), { on: true, brightness: 1 });
  assert.deepEqual(lightFromHa(on({ brightness: 51, color_mode: 'color_temp', color_temp_kelvin: 3000 })), { on: true, brightness: 0.2, temp: 3000, color: null });
  assert.deepEqual(lightFromHa(on({ brightness: 128, color_mode: 'hs', rgb_color: [255, 0, 16] })), { on: true, brightness: 128 / 255, color: '#ff0010' });
  assert.deepEqual(lightFromHa({ state: 'on', attributes: {} }), { on: true });
});

test('unavailable and unknown states', () => {
  assert.equal(lightFromHa({ state: 'unavailable', attributes: {} }), null);
  assert.equal(lightFromHa({ state: 'unknown', attributes: {} }), null);
  assert.equal(availabilityOf({ state: 'unavailable' }), 'Unavailable');
  assert.equal(availabilityOf({ state: 'unknown' }), 'Unavailable');
  assert.equal(availabilityOf(undefined), 'Not found');
  assert.equal(availabilityOf({ state: 'off' }), null);
});

test('rgb <-> hex', () => {
  assert.equal(rgbToHex([255, 122, 60]), '#ff7a3c');
  assert.equal(rgbToHex([300, -4, 0.4]), '#ff0000');
  assert.equal(rgbToHex(null), null);
  assert.deepEqual(hexToRgb('#7B5CFF'), [123, 92, 255]);
  assert.equal(hexToRgb('nope'), null);
});

test('capabilities from supported_color_modes', () => {
  const caps = (modes) => capabilitiesFrom('light.demo_a', { attributes: { supported_color_modes: modes } });
  assert.deepEqual(caps(['onoff']), []);
  assert.deepEqual(caps(['brightness']), ['brightness']);
  assert.deepEqual(caps(['color_temp']), ['brightness', 'temp']);
  assert.deepEqual(caps(['color_temp', 'hs']), ['brightness', 'temp', 'color']);
  assert.deepEqual(caps(['xy']), ['brightness', 'color']);
  assert.deepEqual(caps(['rgbww']), ['brightness', 'color']);
});

test('climate mapping', () => {
  const st = { state: 'cool', attributes: { hvac_modes: ['off', 'cool', 'heat_cool', 'fan_only'], fan_modes: ['auto', 'low', 'quiet'], temperature: 22.6, current_temperature: 24.1, fan_mode: 'low' } };
  assert.deepEqual(acFromHa(st), { on: true, mode: 'cool', target: 23, roomTemp: 24.1, fan: 'low' });
  assert.deepEqual(acFromHa({ state: 'off', attributes: {} }), { on: false });
  assert.deepEqual(acFeaturesFromHa(st), { modes: ['cool', 'auto', 'fan'], fans: ['auto', 'low'], sleep: false, eco: false, swing: false });
  assert.deepEqual(acCalls('climate.demo_ac', { on: false }, st), [{ domain: 'climate', service: 'turn_off', data: { entity_id: 'climate.demo_ac' } }]);
  assert.deepEqual(acCalls('climate.demo_ac', { on: true, mode: 'auto' }, st).map((c) => c.data.hvac_mode), ['heat_cool']);
  assert.deepEqual(acCalls('climate.demo_ac', { target: 21 }, st), [{ domain: 'climate', service: 'set_temperature', data: { entity_id: 'climate.demo_ac', temperature: 21 } }]);
  assert.throws(() => acCalls('lock.demo_front_door', { on: true }, st));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockHass, demoStates, toFahrenheit } from '../harness/mock-hass.js';

test('fahrenheit works with any states, even none', () => {
  const empty = createMockHass({ fahrenheit: true, states: {} });
  assert.equal(empty.config.unit_system.temperature, '°F');
  assert.deepEqual(empty.states, {});
  const own = createMockHass({
    fahrenheit: true,
    states: { 'climate.x': { entity_id: 'climate.x', state: 'heat', attributes: { temperature: 20, current_temperature: 19.5, min_temp: 7, max_temp: 35 } } },
  });
  assert.equal(own.config.unit_system.temperature, '°F');
  assert.deepEqual(own.states['climate.x'].attributes, { temperature: 68, current_temperature: 67.1, min_temp: 44, max_temp: 95 });
});

test('every climate entity is converted; °F ones and other domains are left alone', () => {
  const states = toFahrenheit({
    'climate.demo_a': { attributes: { target_temp_low: 18, target_temp_high: 24 } },
    'climate.demo_f': { attributes: { temperature: 72, current_temperature: 70 } },
    'climate.demo_none': { attributes: { hvac_modes: ['off'] } },
    'climate.demo_nothing': {},
    'sensor.demo_t': { state: '21', attributes: { temperature: 21 } },
  });
  assert.deepEqual(states['climate.demo_a'].attributes, { target_temp_low: 64, target_temp_high: 75 });
  assert.deepEqual(states['climate.demo_f'].attributes, { temperature: 72, current_temperature: 70 });
  assert.deepEqual(states['climate.demo_none'].attributes, { hvac_modes: ['off'] });
  assert.deepEqual(states['sensor.demo_t'].attributes, { temperature: 21 });
});

test('the demo climate entities read as before in °F', () => {
  const hass = createMockHass({ fahrenheit: true });
  const ac = hass.states['climate.demo_bedroom_ac'].attributes;
  assert.deepEqual([ac.temperature, ac.current_temperature, ac.min_temp, ac.max_temp], [73, 77.9, 60, 86]);
  const t = hass.states['climate.demo_thermostat'].attributes;
  assert.deepEqual([t.temperature, t.current_temperature], [72, 70.5]);
  assert.equal(createMockHass({ fahrenheit: false }).config.unit_system.temperature, '°C');
  assert.equal(demoStates()['climate.demo_bedroom_ac'].attributes.temperature, 23, 'the demo states themselves stay in °C');
});

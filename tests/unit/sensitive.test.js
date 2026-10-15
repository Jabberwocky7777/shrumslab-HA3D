import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveAction, isSensitive, canBulk } from '../../src/ha/sensitive.js';
import { createHaBridge } from '../../src/ha/bridge.js';

test('sensitive domains', () => {
  for (const id of ['lock.demo_a', 'alarm_control_panel.demo_a', 'cover.demo_a', 'valve.demo_a', 'siren.demo_a', 'camera.demo_a']) {
    assert.equal(isSensitive(id), true, id);
    assert.equal(canBulk(id), false, id);
  }
  for (const id of ['light.demo_a', 'switch.demo_a', 'fan.demo_a', 'climate.demo_a', 'media_player.demo_a']) {
    assert.equal(isSensitive(id), false, id);
    assert.equal(canBulk(id), true, id);
  }
});

test('a tap on a sensitive device is always more-info', () => {
  assert.equal(effectiveAction('lock.demo_front_door', 'toggle'), 'more-info');
  assert.equal(effectiveAction('cover.demo_garage_door', 'toggle'), 'more-info');
  assert.equal(effectiveAction('cover.demo_garage_door', 'navigate'), 'more-info');
  assert.equal(effectiveAction('alarm_control_panel.demo_a', 'toggle'), 'more-info');
  assert.equal(effectiveAction('fan.demo_fan', 'toggle'), 'toggle');
  assert.equal(effectiveAction('climate.demo_a', 'toggle'), 'more-info', 'toggle only works for light, switch, fan, media_player');
  assert.equal(effectiveAction('media_player.demo_tv', 'navigate'), 'navigate');
  assert.equal(effectiveAction('media_player.demo_tv', 'something'), 'more-info');
});

test('the bridge never sends a bulk change to a sensitive device', async () => {
  // A plan that slipped a lock in as a "light" (validation refuses this; the bridge refuses it too).
  const config = { lights: [{ id: 'x', link: { service: 'homeassistant', id: 'lock.demo_front_door' }, capabilities: [] }], acs: [] };
  const calls = [];
  const hass = { states: { 'lock.demo_front_door': { state: 'locked', attributes: {} } }, callService: async (...a) => { calls.push(a); } };
  const bridge = createHaBridge(config, { getHass: () => hass });
  await assert.rejects(bridge.transmit('light', 'x', { on: false }, { on: false }));
  assert.equal(calls.length, 0);
  bridge.dispose();
});

test('a rejected service call rejects transmit (so the store rolls back)', async () => {
  const config = { lights: [{ id: 'k', link: { service: 'homeassistant', id: 'light.demo_k' }, capabilities: ['brightness'] }], acs: [] };
  const hass = { states: { 'light.demo_k': { state: 'off', attributes: {} } }, callService: async () => { throw new Error('refused'); } };
  const bridge = createHaBridge(config, { getHass: () => hass });
  await assert.rejects(bridge.transmit('light', 'k', { on: true }, { on: true }), /refused/);
  bridge.dispose();
});

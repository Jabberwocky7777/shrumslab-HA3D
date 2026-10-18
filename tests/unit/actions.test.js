import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/ha/validate.js';
import { actionProblem, effectiveActionConfig } from '../../src/ha/sensitive.js';
import { normalizeActiveWhen, isActive } from '../../src/ha/conditions.js';
import { checkOptions, planSummary, OPTION_NAMES } from '../../src/ha/options.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
const room = 'living';
const withEntity = (e) => ({ ...structuredClone(demo), entities: [{ id: 'e1', room, pos: [1, 5], ...e }] });

test('the old tap / hold strings become Home Assistant action objects', () => {
  const { config } = validatePlan(withEntity({ entity: 'fan.demo_f', tap: 'toggle', hold: 'navigate', path: '/lovelace/fans' }));
  const e = config.entities[0];
  assert.deepEqual(e.tap_action, { action: 'toggle' });
  assert.deepEqual(e.hold_action, { action: 'navigate', navigation_path: '/lovelace/fans' });
  assert.equal(e.double_tap_action, null);
  const plain = validatePlan(withEntity({ entity: 'fan.demo_f' })).config.entities[0];
  assert.deepEqual([plain.tap_action, plain.hold_action], [{ action: 'more-info' }, { action: 'more-info' }]);
});

test('action objects win over the strings and support perform-action with confirmation and none', () => {
  const { config } = validatePlan(withEntity({
    entity: 'media_player.demo_tv', tap: 'toggle',
    tap_action: { action: 'perform-action', perform_action: 'media_player.media_play_pause', target: { entity_id: 'media_player.demo_tv' }, confirmation: { text: 'Sure?' } },
    double_tap_action: { action: 'none' },
    hold_action: { action: 'call-service', service: 'light.turn_off', data: { entity_id: ['light.demo_a', 'light.demo_b'] } },
  }));
  const e = config.entities[0];
  assert.equal(e.tap_action.action, 'perform-action');
  assert.equal(e.hold_action.action, 'perform-action', 'call-service is the old name');
  assert.deepEqual(e.double_tap_action, { action: 'none' });
});

test('nothing reaches a sensitive device through an action, not even through target', () => {
  const bad = [
    [{ entity: 'lock.demo_front_door', tap_action: { action: 'toggle' } }, /sensitive/],
    [{ entity: 'cover.demo_garage_door', hold_action: { action: 'perform-action', perform_action: 'cover.open_cover' } }, /sensitive/],
    [{ entity: 'switch.demo_x', tap_action: { action: 'perform-action', perform_action: 'lock.unlock', target: { entity_id: 'lock.demo_front_door' } } }, /sensitive/],
    [{ entity: 'switch.demo_x', tap_action: { action: 'perform-action', perform_action: 'switch.turn_on', target: { entity_id: ['switch.demo_x', 'lock.demo_front_door'] } } }, /sensitive device "lock\.demo_front_door"/],
    [{ entity: 'switch.demo_x', tap_action: { action: 'perform-action', perform_action: 'homeassistant.turn_on', data: { entity_id: 'cover.demo_garage_door' } } }, /sensitive device "cover/],
    [{ entity: 'switch.demo_x', tap_action: { action: 'perform-action', perform_action: 'homeassistant.toggle', target: { area_id: 'demo_garage' } } }, /area, device, floor or label/],
    [{ entity: 'switch.demo_x', tap_action: { action: 'perform-action', perform_action: 'siren.turn_on' } }, /sensitive/],
    [{ entity: 'switch.demo_x', double_tap_action: { action: 'perform-action', perform_action: 'alarm_control_panel.alarm_disarm', target: { entity_id: 'alarm_control_panel.demo_alarm' } } }, /sensitive/],
    [{ entity: 'camera.demo_porch', tap_action: { action: 'perform-action', perform_action: 'script.turn_on', target: { entity_id: 'script.demo_x' } } }, /always opens more-info/],
  ];
  for (const [e, re] of bad) assert.throws(() => validatePlan(withEntity(e)), re, JSON.stringify(e));
  // an area target is fine for a single-domain service: it only reaches that domain
  assert.doesNotThrow(() => validatePlan(withEntity({ entity: 'switch.demo_x', tap_action: { action: 'perform-action', perform_action: 'light.turn_off', target: { area_id: 'demo_living' } } })));
});

test('unknown actions, bad paths and malformed services are refused', () => {
  assert.throws(() => validatePlan(withEntity({ entity: 'fan.demo_f', tap_action: { action: 'url', url_path: 'https://example.com' } })), /unknown action "url"/);
  assert.throws(() => validatePlan(withEntity({ entity: 'fan.demo_f', tap_action: { action: 'navigate', navigation_path: 'lovelace' } })), /navigation_path/);
  assert.throws(() => validatePlan(withEntity({ entity: 'fan.demo_f', tap_action: { action: 'perform-action', perform_action: 'turn on' } })), /perform_action/);
  assert.throws(() => validatePlan(withEntity({ entity: 'fan.demo_f', tap_action: 'toggle' })), /must be an object/);
});

test('lights take tap_action / hold_action / double_tap_action as an override, with the same rules', () => {
  const p = structuredClone(demo);
  const l = p.lights.find((x) => x.id === 'living.main');
  l.hold_action = { action: 'more-info' };
  l.double_tap_action = { action: 'perform-action', perform_action: 'script.turn_on', target: { entity_id: 'script.demo_movie_mode' } };
  const out = validatePlan(p).config.lights.find((x) => x.id === 'living.main');
  assert.deepEqual(out.hold_action, { action: 'more-info' });
  l.tap_action = { action: 'perform-action', perform_action: 'lock.lock', target: { entity_id: 'lock.demo_front_door' } };
  assert.throws(() => validatePlan(p), /Light "living\.main" tap_action/);
});

test('at run time a sensitive device only ever gets more-info', () => {
  for (const cfg of [{ action: 'toggle' }, { action: 'perform-action', perform_action: 'lock.unlock' }, { action: 'navigate', navigation_path: '/x' }, { action: 'none' }]) {
    assert.deepEqual(effectiveActionConfig('lock.demo_front_door', cfg), { action: 'more-info' });
  }
  assert.deepEqual(effectiveActionConfig('switch.demo_x', { action: 'url' }), { action: 'more-info' });
  assert.deepEqual(effectiveActionConfig('switch.demo_x', { action: 'call-service', service: 'switch.turn_on' }), { action: 'perform-action', service: 'switch.turn_on' });
  assert.equal(actionProblem('fan.demo_f', { action: 'toggle' }), null);
});

test('active_when: only with run, every condition must match', () => {
  const conds = normalizeActiveWhen('Scene "s"', [{ entity: 'input_boolean.demo_a', state: 'on' }, { entity: 'media_player.demo_tv', state: 'playing' }], { hasRun: true });
  assert.equal(isActive(conds, { 'input_boolean.demo_a': { state: 'on' }, 'media_player.demo_tv': { state: 'playing' } }), true);
  assert.equal(isActive(conds, { 'input_boolean.demo_a': { state: 'on' }, 'media_player.demo_tv': { state: 'paused' } }), false);
  assert.equal(isActive(null, {}), false);
  assert.deepEqual(normalizeActiveWhen('x', { entity: 'input_number.demo_n', state: 3 }, { hasRun: true }), [{ entity: 'input_number.demo_n', state: '3' }]);
  assert.throws(() => normalizeActiveWhen('x', { entity: 'input_boolean.demo_a', state: 'on' }, { hasRun: false }), /only works with "run"/);
  assert.throws(() => normalizeActiveWhen('x', { entity: 'nope', state: 'on' }, { hasRun: true }), /needs "entity"/);
  assert.throws(() => normalizeActiveWhen('x', { entity: 'input_boolean.demo_a' }, { hasRun: true }), /needs "state"/);
  assert.throws(() => normalizeActiveWhen('x', [], { hasRun: true }), /empty list/);
});

test('scenes and floor buttons in the demo carry active_when', () => {
  const { config } = validatePlan(demo);
  assert.ok(config.scenes.find((s) => s.id === 'night').activeWhen.length === 1);
  assert.ok(config.floors.find((f) => f.id === 'main').actions.find((a) => a.id === 'movie').activeWhen.length === 2);
  const p = structuredClone(demo);
  p.scenes.find((s) => s.id === 'cozy').active_when = { entity: 'input_boolean.demo_a', state: 'on' };
  assert.throws(() => validatePlan(p), /Scene "cozy": "active_when" only works with "run"/);
});

test('card options are checked', () => {
  assert.doesNotThrow(() => checkOptions({ quality: 'low', safe_area: true, full_bleed: true, temperature_unit: 'F', sun: false, power: 'sensor.demo_house_power', stacked_view_default: true }));
  assert.throws(() => checkOptions({ quality: 'ultra' }), /"quality"/);
  assert.throws(() => checkOptions({ sun: 'yes' }), /"sun" must be true or false/);
  assert.throws(() => checkOptions({ power: 'switch.demo_x' }), /sensor\.\*/);
  assert.throws(() => checkOptions({ temperature_unit: 'K' }), /C or F/);
});

test('the card editor summarises the plan and never edits it as a form', () => {
  assert.equal(planSummary(demo), '2 floors · 12 rooms · 24 lights · 7 devices');
  assert.equal(planSummary({ rooms: [{}], lights: [] }), '1 room · 0 lights · 0 devices');
  assert.ok(!OPTION_NAMES.includes('plan'));
  assert.deepEqual(OPTION_NAMES.sort(), ['full_bleed', 'height', 'power', 'quality', 'safe_area', 'stacked_view_default', 'sun', 'temperature_unit']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/ha/validate.js';
import { liveEntities } from '../../src/ha/live-fields.js';
import { createHaBridge } from '../../src/ha/bridge.js';
import { createStore } from '../../upstream/store.js';
import { extraFixtures } from '../../upstream/three/extras.js';
import { LIGHT_FAN_SPEED } from '../../src/ha/live.js';
import { demoStates } from '../harness/mock-hass.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
const link = (id) => ({ service: 'homeassistant', id });
const plan = (lights) => ({ name: 'Lights', rooms: [{ id: 'den', rect: [0, 0, 4, 4] }], lights });
const fan = (extra = {}) => ({ id: 'den.fan', room: 'den', type: 'fan', pos: [2, 2], ...extra });
const one = (light) => validatePlan(plan([light])).config.lights[0];

test('fans: "bowl" defaults to true and must be a boolean on a fan', () => {
  assert.equal(one(fan()).bowl, true);
  assert.equal(one(fan({ bowl: false })).bowl, false);
  assert.equal(one(fan({ bowl: false })).tileIcon, 'fan', 'a fan without a light kit shows a fan on its tile');
  assert.equal(one(fan()).tileIcon, undefined);
  assert.throws(() => validatePlan(plan([fan({ bowl: 'no' })])), /"bowl" that is not true or false/);
  assert.throws(() => validatePlan(plan([{ ...fan({ bowl: false }), type: 'ceiling' }])), /"bowl" is only for lights of type "fan"/);
});

test('fans: "spin" is "light" or a fan.* entity, "fan" stays as its alias', () => {
  assert.equal(one(fan({ spin: 'light' })).spin, 'light');
  assert.equal(one(fan({ spin: 'light' })).fan, null);
  assert.equal(one(fan({ spin: 'fan.demo_den' })).spin, 'fan.demo_den');
  assert.equal(one(fan({ spin: 'fan.demo_den' })).fan, 'fan.demo_den');
  assert.equal(one(fan({ fan: 'fan.demo_den' })).spin, 'fan.demo_den', 'the older "fan" field');
  assert.equal(one(fan()).spin, null);
  for (const spin of ['lights', 'switch.demo_den', 'light.demo_den', 'Fan.Bad', 7]) {
    assert.throws(() => validatePlan(plan([fan({ spin })])), /"spin" to be "light" or a fan\.\* entity/, String(spin));
  }
  assert.throws(() => validatePlan(plan([{ ...fan({ spin: 'light' }), type: 'pendant' }])), /"spin" is only for lights of type "fan"/);
  assert.throws(() => validatePlan(plan([fan({ spin: 'fan.demo_a', fan: 'fan.demo_b' })])), /both "spin" and "fan"/);
  assert.doesNotThrow(() => validatePlan(plan([fan({ spin: 'fan.demo_a', fan: 'fan.demo_a' })])));
  // a spin entity makes the card listen to it; "light" needs nothing more than the light itself
  assert.ok(liveEntities(validatePlan(plan([fan({ spin: 'fan.demo_den' })])).config).includes('fan.demo_den'));
  assert.deepEqual(liveEntities(validatePlan(plan([fan({ spin: 'light' })])).config), []);
  assert.ok(LIGHT_FAN_SPEED > 0);
});

test('a fan without a bowl has no glow and no light (so no pool light)', () => {
  const H = 2.6;
  const withBowl = extraFixtures.fan({ ...fan() }, H);
  assert.equal(withBowl.glow.length, 1);
  assert.equal(withBowl.lights.length, 1);
  const bare = extraFixtures.fan({ ...fan(), bowl: false }, H);
  assert.deepEqual([bare.glow.length, bare.lights.length], [0, 0]);
  assert.ok(bare.parts.some((p) => p.name === 'fan-blades'), 'the blades are still there');
});

test('placeholder lights: only true or false, never with a link', () => {
  const ph = { id: 'den.todo', room: 'den', type: 'ceiling', pos: [1, 1], placeholder: true };
  assert.equal(one(ph).placeholder, true);
  assert.equal(one({ ...ph, placeholder: undefined }).placeholder, false);
  assert.throws(() => validatePlan(plan([{ ...ph, placeholder: 'yes' }])), /"placeholder" that is not true or false/);
  assert.throws(() => validatePlan(plan([{ ...ph, link: link('light.demo_den') }])), /"placeholder" and linked/);
  assert.doesNotThrow(() => validatePlan(plan([{ ...ph, placeholder: false, link: link('light.demo_den') }])));
});

test('placeholders are "Not connected", never written, and stay out of All on and scenes', () => {
  const p = plan([
    { id: 'den.todo', room: 'den', type: 'ceiling', pos: [1, 1], placeholder: true },
    { id: 'den.lamp', room: 'den', type: 'floor', pos: [3, 3] },
  ]);
  p.scenes = [{ id: 'bright', name: 'Bright', lights: { '*': { on: true } } }];
  const { config } = validatePlan(p);
  const bridge = createHaBridge(config, { getHass: () => ({ states: {} }) });
  assert.equal(bridge.availability('light', 'den.todo'), 'Not connected');
  assert.equal(bridge.availability('light', 'den.lamp'), null);
  const store = createStore(config, { transmit: bridge.transmit, canWrite: bridge.canWrite });
  try {
    store.setAllLights(true);
    assert.deepEqual([store.state.lights['den.todo'].on, store.state.lights['den.lamp'].on], [false, true]);
    store.setAllLights(false);
    store.applyScene('bright');
    assert.deepEqual([store.state.lights['den.todo'].on, store.state.lights['den.lamp'].on], [false, true]);
    store.toggleLight('den.todo');
    assert.equal(store.state.lights['den.todo'].on, false);
  } finally { store.dispose(); }
});

test('the demo has a bowl-less fan run by its light, and a placeholder', () => {
  const { config, warnings } = validatePlan(demo, { states: demoStates() });
  assert.deepEqual(warnings, []);
  const officeFan = config.lights.find((l) => l.id === 'office.fan');
  assert.deepEqual([officeFan.bowl, officeFan.spin], [false, 'light']);
  assert.equal(config.lights.find((l) => l.id === 'rec.fan').spin, 'fan.demo_rec_fan');
  assert.equal(config.lights.find((l) => l.id === 'rec.nook').placeholder, true);
});

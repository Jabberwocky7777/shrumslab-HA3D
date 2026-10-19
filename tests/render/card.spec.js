// Headless render test (brief section 5): the built card in a page with a mock hass.
import { test, expect } from '@playwright/test';

const PAGE = '/tests/harness/';

// Every request the page makes; checked against the page's own origin at the end of each test.
function recordRequests(page) {
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

function expectSameOrigin(urls, base) {
  const origin = new URL(base).origin;
  const outside = urls.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
  expect(outside, 'requests that left the page origin').toEqual([]);
}

async function open(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE + query);
  await page.waitForFunction(() => window.__test?.card?._ui);
  // let the intro animation and the first frames run
  await page.waitForTimeout(2500);
  return errors;
}

const calls = (page) => page.evaluate(() => window.__test.hass.calls);
const resetCalls = (page) => page.evaluate(() => { window.__test.hass.calls.length = 0; });

// Fraction of distinct colours in the 3D stage: a blank canvas has (nearly) one.
async function stageVariety(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 7) seen.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3));
    return seen.size;
  }, png.toString('base64'));
}

test('renders the demo house', async ({ page }, info) => {
  const urls = recordRequests(page);
  const errors = await open(page);
  const shot = await page.screenshot({ path: info.outputPath('demo-house.png') });
  await info.attach('demo-house', { body: shot, contentType: 'image/png' });
  const stage = await page.screenshot({ clip: { x: 0, y: 90, width: 390, height: 280 } });
  expect(await stageVariety(page, stage)).toBeGreaterThan(80);
  await expect(page.locator('house-control-card .home-name')).toHaveText('Demo House');
  // the main floor's three buttons, then the plan's five scenes
  await expect(page.locator('house-control-card .scene')).toHaveCount(8);
  expect(errors).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('tapping a light tile calls light.turn_on / light.turn_off', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  const spots = page.locator('house-control-card .tile[aria-label="Spots"]');
  await spots.click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.demo_kitchen_spots' } });
  await expect(spots).toHaveClass(/\bon\b/);
  await page.waitForTimeout(400); // upstream's cool-down between two commands to one lamp
  await resetCalls(page);
  await spots.click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'light', service: 'turn_off', data: { entity_id: 'light.demo_kitchen_spots' } });
  // a switch.* lamp is switched with switch.*
  await page.locator('house-control-card .room', { hasText: 'Office' }).click();
  await resetCalls(page);
  await page.locator('house-control-card .tile[aria-label="Desk lamp"]').click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'switch', service: 'turn_off', data: { entity_id: 'switch.demo_desk_lamp' } });
  expectSameOrigin(urls, page.url());
});

test('a state change in Home Assistant updates the tile and the 3D glow', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  const goal = () => page.evaluate(() => window.__test.card._ui.debug.world.lights.get('kitchen.spots').goal);
  expect(await goal()).toBe(0);
  await page.evaluate(() => {
    const { hass } = window.__test;
    const cur = hass.states['light.demo_kitchen_spots'];
    hass.set('light.demo_kitchen_spots', { ...cur, state: 'on', attributes: { ...cur.attributes, brightness: 128, color_mode: 'brightness' } });
  });
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  const spots = page.locator('house-control-card .tile[aria-label="Spots"]');
  await expect(spots).toHaveClass(/\bon\b/);
  await expect(spots.locator('.tile-sub')).toHaveText('50% · 18 W'); // with its power sensor
  expect(await goal()).toBeCloseTo(128 / 255, 3);
  // ...and going unavailable greys the tile out
  await page.evaluate(() => {
    const { hass } = window.__test;
    hass.set('light.demo_kitchen_spots', { ...hass.states['light.demo_kitchen_spots'], state: 'unavailable' });
  });
  await expect(spots).toHaveClass(/unavailable/);
  await expect(spots.locator('.tile-sub')).toHaveText('Unavailable');
  await resetCalls(page);
  await spots.click();
  await page.waitForTimeout(300);
  expect(await calls(page)).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('tapping a lock opens more-info and never calls a service', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  await page.locator('house-control-card .room', { hasText: 'Hall' }).click();
  await resetCalls(page);
  await page.locator('house-control-card .tile[aria-label="Front door"]').click();
  await page.locator('house-control-card .tile[aria-label="Garage door"]').click();
  // the card asks Home Assistant's own action handling (hass-action) for more-info, nothing else
  await expect.poll(() => page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-more-info'))).toEqual([
    { type: 'hass-more-info', entityId: 'lock.demo_front_door' },
    { type: 'hass-more-info', entityId: 'cover.demo_garage_door' },
  ]);
  const sent = await page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-action'));
  expect(sent.map((e) => e.config)).toEqual([
    { entity: 'lock.demo_front_door', tap_action: { action: 'more-info' } },
    { entity: 'cover.demo_garage_door', tap_action: { action: 'more-info' } },
  ]);
  await page.waitForTimeout(300);
  expect(await calls(page)).toEqual([]);
  // an entity with tap: toggle does toggle
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  await page.locator('house-control-card .tile[aria-label="Coffee maker"]').click();
  // Home Assistant's toggle turns an entity that is off on
  await expect.poll(() => calls(page)).toEqual([{ domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.demo_coffee_maker' } }]);
  expectSameOrigin(urls, page.url());
});

test('All off, the power button and scenes never touch sensitive domains', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  await page.evaluate(() => {
    const { hass } = window.__test;
    hass.set('light.demo_hall_ceiling', { ...hass.states['light.demo_hall_ceiling'], state: 'on', attributes: { ...hass.states['light.demo_hall_ceiling'].attributes, brightness: 200 } });
    hass.set('climate.demo_bedroom_ac', { ...hass.states['climate.demo_bedroom_ac'], state: 'cool' });
  });
  await page.waitForTimeout(300);
  await resetCalls(page);
  await page.locator('house-control-card .pill', { hasText: 'All off' }).click();
  await page.locator('house-control-card .scene', { hasText: 'Bright' }).click();
  await page.waitForTimeout(600);
  await page.locator('house-control-card .power').click(); // everything off, ACs included
  await page.waitForTimeout(1200);
  const made = await calls(page);
  expect(made.length).toBeGreaterThan(5);
  const domains = new Set(made.map((c) => c.domain));
  for (const d of domains) expect(['light', 'switch', 'fan', 'climate', 'media_player']).toContain(d);
  for (const c of made) expect(c.data.entity_id).not.toMatch(/^(lock|cover|alarm_control_panel|valve|siren|camera)\./);
  expect(made).toContainEqual({ domain: 'climate', service: 'turn_off', data: { entity_id: 'climate.demo_bedroom_ac' } });
  // a scene with `run` starts the script and nothing else
  await resetCalls(page);
  await page.locator('house-control-card .scene:not(.floor-action)', { hasText: 'Movie' }).click();
  await expect.poll(() => calls(page)).toEqual([{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.demo_movie_mode' } }]);
  expectSameOrigin(urls, page.url());
});

test('the editor saves the plan into this card in the dashboard', async ({ page }, info) => {
  const urls = recordRequests(page);
  await open(page);
  await page.locator('house-control-card .top .round:not(.power)').click();
  await page.locator('house-control-card .menu button', { hasText: 'Edit home' }).click();
  const title = page.locator('house-control-card .hc-editor-layer .title-input');
  await expect(title).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('editor.png') });
  await title.fill('Demo House 2');
  await title.blur();
  await page.locator('house-control-card .p-save').click();
  await expect.poll(() => page.evaluate(() => window.__test.hass.dashboard.views[0].cards[0].plan.name)).toBe('Demo House 2');
  const ws = await page.evaluate(() => window.__test.hass.ws.map((m) => m.type));
  expect(ws).toEqual(['lovelace/config', 'lovelace/config/save']);
  await page.locator('house-control-card .p-save').click(); // "Done" closes it
  await expect(page.locator('house-control-card .hc-editor-layer')).toHaveCount(0);
  await expect(page.locator('house-control-card .home-name')).toHaveText('Demo House 2');
  expectSameOrigin(urls, page.url());
});

test('only administrators get plan editing', async ({ page }) => {
  await open(page, '?admin=0');
  await page.locator('house-control-card .top .round:not(.power)').click();
  await expect(page.locator('house-control-card .menu button')).toHaveText(['Only an administrator can change this home']);
});

test('the AC sheet follows Home Assistant\'s temperature unit', async ({ page }, info) => {
  await open(page, '?unit=F');
  await page.locator('house-control-card .tile.ac .tile-name').click();
  await expect(page.locator('house-control-card .sheet .big small')).toHaveText('°F');
  await expect(page.locator('house-control-card .sheet .sheet-sub')).toContainText('77.9°F');
  await expect(page.locator('house-control-card .sheet .big .num')).toHaveText('73');
  await page.screenshot({ path: info.outputPath('ac-fahrenheit.png') });
  // the slider steps in whole degrees within the entity's range
  await resetCalls(page);
  await page.locator('house-control-card .sheet button[aria-label="Warmer"]').click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'climate', service: 'set_temperature', data: { entity_id: 'climate.demo_bedroom_ac', temperature: 74 } });
});

test('the Rec room loads the extra furniture and light types without console errors', async ({ page }, info) => {
  const urls = recordRequests(page);
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text()); });
  const errors = await open(page);
  const loaded = await page.evaluate(() => {
    const { world, config } = window.__test.card._ui.debug;
    const unit = (id) => world.lights.get(id);
    return {
      furniture: config.furniture.map((f) => f.type),
      fixtures: Object.fromEntries(['rec.cans', 'rec.pool', 'rec.sconces', 'rec.fan', 'rec.dome']
        .map((id) => [id, unit(id) ? unit(id).lights.length : 0])),
    };
  });
  for (const type of ['poolTable', 'sectional', 'treadmill', 'glassCabinet']) expect(loaded.furniture).toContain(type);
  // one three.js light per fixture: four cans, two sconces, the bar's two shades
  expect(loaded.fixtures).toEqual({ 'rec.cans': 4, 'rec.pool': 2, 'rec.sconces': 2, 'rec.fan': 1, 'rec.dome': 1 });

  await page.locator('house-control-card .room', { hasText: 'Rec room' }).click();
  await expect(page.locator('house-control-card .tile[aria-label="Cans"]')).toBeVisible();
  await resetCalls(page);
  await page.locator('house-control-card .tile[aria-label="Cans"]').click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.demo_rec_cans' } });
  await page.evaluate(() => {
    const { hass } = window.__test;
    for (const id of ['light.demo_rec_pool_table', 'light.demo_rec_sconces', 'light.demo_rec_fan_light']) {
      hass.set(id, { ...hass.states[id], state: 'on', attributes: { ...hass.states[id].attributes, brightness: 230 } });
    }
  });
  await expect.poll(() => page.evaluate(() => window.__test.card._ui.debug.world.lights.get('rec.pool').goal)).toBeGreaterThan(0.8);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('rec-room.png') });
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('the editor shows every point of a multi-point light and moves them together', async ({ page }, info) => {
  await open(page);
  await page.locator('house-control-card .top .round:not(.power)').click();
  await page.locator('house-control-card .menu button', { hasText: 'Edit home' }).click();
  const layer = page.locator('house-control-card .hc-editor-layer');
  await expect(layer.locator('.p-light.cans .p-point')).toHaveCount(4);
  await expect(layer.locator('.p-light.sconce .p-point')).toHaveCount(2);
  await layer.locator('.p-light.cans .p-point').first().click();
  await expect(layer.locator('.p-light.cans.sel')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.screenshot({ path: info.outputPath('editor-points.png') });
  await page.locator('house-control-card .p-save').click();
  // exact: also proves selecting a light did not write "capabilities": [] (that would make it on/off only)
  await expect.poll(() => page.evaluate(() => window.__test.hass.dashboard.views[0].cards[0].plan.lights.find((l) => l.id === 'rec.cans')))
    .toEqual({
      id: 'rec.cans', name: 'Cans', room: 'rec', type: 'cans', pos: [6.25, 11.65],
      points: [[5.35, 10.95], [7.15, 10.95], [5.35, 12.35], [7.15, 12.35]],
      link: { service: 'homeassistant', id: 'light.demo_rec_cans' },
    });
});

test('only rooms with devices get a tab, unless the plan says "tab"', async ({ page }) => {
  const errors = await open(page);
  // the room's name only (not its count, its temperature or the heat map button)
  const tabs = () => page.locator('house-control-card .rooms .room:not([hidden]):not(.heat-toggle)')
    .evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim()));
  // Storage has furniture but no light, AC or entity: no tab, but it is still part of the model
  expect(await tabs()).toEqual(['All', 'Bedroom', 'Bathroom', 'Kitchen', 'Office', 'Living', 'Dining', 'Hall', 'Rec room']);
  expect(await page.evaluate(() => window.__test.card._ui.debug.config.rooms.map((r) => r.id))).toContain('storage');

  // "tab": true forces one on, "tab": false takes one away
  await page.evaluate(() => {
    const { card, config } = window.__test;
    const plan = structuredClone(config.plan);
    plan.rooms.find((r) => r.id === 'storage').tab = true;
    plan.rooms.find((r) => r.id === 'bath').tab = false;
    card.setConfig({ ...config, plan });
  });
  await expect.poll(tabs).toEqual(['All', 'Bedroom', 'Kitchen', 'Office', 'Living', 'Dining', 'Hall', 'Rec room', 'Storage']);
  // the bathroom's devices are still listed under All and still switch
  await expect(page.locator('house-control-card .tile[aria-label="Mirror light"]')).toHaveCount(1);
  await resetCalls(page);
  await page.locator('house-control-card .tile[aria-label="Mirror light"]').click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.demo_bath_mirror' } });
  // a forced tab on an empty room shows the empty state, not an error
  await page.locator('house-control-card .room', { hasText: 'Storage' }).click();
  await expect(page.locator('house-control-card .group-label')).toHaveText('No devices in this room yet');
  expect(errors).toEqual([]);
});

/* ---------- floors ---------- */

const tileNames = (page) => page.locator('house-control-card .grid .tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const turnOn = (page, ids) => page.evaluate((list) => {
  const { hass } = window.__test;
  for (const id of list) hass.set(id, { ...hass.states[id], state: 'on', attributes: { ...hass.states[id].attributes, brightness: 200 } });
}, ids);

test('the floor switcher changes the tiles, room tabs, buttons and header count', async ({ page }, info) => {
  const urls = recordRequests(page);
  const errors = await open(page);
  const chips = page.locator('house-control-card .floors .floor-chip');
  await expect(chips).toHaveText(['Main', 'Basement']); // highest floor first
  await expect(chips.first()).toHaveClass(/active/);
  expect(await tileNames(page)).toContain('Bedroom AC');
  expect(await tileNames(page)).not.toContain('Poker table');
  await expect(page.locator('house-control-card .home-sub')).toContainText('in house');

  await chips.filter({ hasText: 'Basement' }).click();
  await expect(chips.filter({ hasText: 'Basement' })).toHaveClass(/active/);
  const names = await tileNames(page);
  expect(names).toEqual(expect.arrayContaining(['Poker table', 'Cans', 'Ceiling', 'Light']));
  expect(names).not.toContain('Bedroom AC');
  expect(names).toHaveLength(4);
  const tabs = await page.locator('house-control-card .rooms .room:not([hidden]):not(.heat-toggle)').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim()));
  expect(tabs).toEqual(['All', 'Bar', 'Gym', 'Utility']);
  // the basement's own buttons
  await expect(page.locator('house-control-card .scene.floor-action')).toHaveText(['All on', 'All off', 'Game night', 'Guests']);
  await expect(page.locator('house-control-card .list-head .title')).toContainText('Basement');
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.floor)).toBe('basement');

  // the stacked view shows both floors, the other one dimmed
  await page.locator('house-control-card .floor-stack').click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.floorsShown())).toEqual([
    { id: 'basement', visible: true, dimmed: false },
    { id: 'main', visible: true, dimmed: true },
  ]);
  const stage = await page.screenshot({ clip: { x: 0, y: 90, width: 390, height: 280 }, path: info.outputPath('stacked.png') });
  expect(await stageVariety(page, stage)).toBeGreaterThan(60);
  await page.locator('house-control-card .floor-stack').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.floorsShown())).toEqual([
    { id: 'basement', visible: true, dimmed: false },
    { id: 'main', visible: false, dimmed: false },
  ]);
  expect(errors).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('a floor button with run calls script.turn_on or scene.turn_on with its entity', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  await resetCalls(page);
  await page.locator('house-control-card .scene.floor-action', { hasText: 'Lights on' }).click();
  await expect.poll(() => calls(page)).toEqual([{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.demo_main_lights_on' } }]);
  await resetCalls(page);
  await page.locator('house-control-card .scene.floor-action', { hasText: 'Movie' }).click();
  await expect.poll(() => calls(page)).toEqual([{ domain: 'scene', service: 'turn_on', data: { entity_id: 'scene.demo_movie' } }]);
  expectSameOrigin(urls, page.url());
});

test('a built-in floor All off only switches lights on that floor, never a sensitive device', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  await turnOn(page, ['light.demo_hall_ceiling', 'switch.demo_floor_lamp', 'light.demo_bar_cans', 'light.demo_gym_ceiling']);
  await page.waitForTimeout(300);
  await resetCalls(page);
  await page.locator('house-control-card .scene.floor-action', { hasText: 'All off' }).click();
  await expect.poll(() => calls(page)).toEqual(expect.arrayContaining([
    { domain: 'light', service: 'turn_off', data: { entity_id: 'light.demo_hall_ceiling' } },
    { domain: 'switch', service: 'turn_off', data: { entity_id: 'switch.demo_floor_lamp' } },
  ]));
  await page.waitForTimeout(500);
  for (const c of await calls(page)) {
    expect(c.service).toBe('turn_off');
    expect(['light', 'switch']).toContain(c.domain);
    expect(c.data.entity_id).not.toMatch(/demo_(bar|gym|utility)_/);
  }
  // the basement's own All off: its lights only
  await page.locator('house-control-card .floors .floor-chip', { hasText: 'Basement' }).click();
  await resetCalls(page);
  await page.locator('house-control-card .scene.floor-action', { hasText: 'All off' }).click();
  await expect.poll(() => calls(page)).toEqual(expect.arrayContaining([
    { domain: 'light', service: 'turn_off', data: { entity_id: 'light.demo_bar_cans' } },
    { domain: 'light', service: 'turn_off', data: { entity_id: 'light.demo_gym_ceiling' } },
  ]));
  await page.waitForTimeout(500);
  for (const c of await calls(page)) expect(c.data.entity_id).toMatch(/demo_(bar|gym|utility)_/);
  expectSameOrigin(urls, page.url());
});

test('the editor shows one floor at a time and moves a room to another floor', async ({ page }) => {
  await open(page);
  await page.locator('house-control-card .top .round:not(.power)').click();
  await page.locator('house-control-card .menu button', { hasText: 'Edit home' }).click();
  const layer = page.locator('house-control-card .hc-editor-layer');
  const roomsShown = () => layer.locator('.p-room .p-label').allTextContents();
  expect(await roomsShown()).toContain('Living');
  expect(await roomsShown()).not.toContain('Bar');
  await layer.locator('.e-floor', { hasText: 'Basement' }).click();
  expect(await roomsShown()).toEqual(['Bar', 'Gym', 'Utility']);
  // pick the Gym and move it to the main floor; the treadmill in it goes along
  await layer.locator('.p-room', { hasText: 'Gym' }).locator('rect').click({ position: { x: 8, y: 8 } }); // clear of its lamp
  await layer.locator('label.field').filter({ has: page.locator('span', { hasText: /^Floor$/ }) }).locator('select').selectOption('main');
  await expect.poll(roomsShown).toEqual(['Bar', 'Utility']);
  await layer.locator('.e-floor', { hasText: 'Main' }).click();
  expect(await roomsShown()).toContain('Gym');
  await page.locator('house-control-card .p-save').click();
  const saved = () => page.evaluate(() => window.__test.hass.dashboard.views[0].cards[0].plan);
  await expect.poll(async () => (await saved()).rooms.find((r) => r.id === 'gym').storey).toBe('main');
  expect((await saved()).furniture.find((f) => f.type === 'treadmill' && f.pos[0] === 7.6).storey).toBe('main');
});

/* ---------- light and shadow budget ---------- */

for (const quality of ['medium', 'low', 'high']) {
  test(`50 lights, 20 on (${quality}): a lit stage within the light and shadow budget`, async ({ page }, info) => {
    const urls = recordRequests(page);
    const errors = await open(page, `?plan=many&quality=${quality}`);
    await page.evaluate(() => window.__test.card._ui.debug.world.settle());
    const stage = await page.screenshot({ clip: { x: 0, y: 90, width: 390, height: 280 }, path: info.outputPath(`many-${quality}.png`) });
    expect(await stageVariety(page, stage)).toBeGreaterThan(40);
    const pool = await page.evaluate(() => window.__test.card._ui.debug.lightPool);
    const { budget } = pool;
    expect(pool.quality).toBe(quality);
    // pool shadow casters + the moon, never more than the texture units allow
    expect(pool.shadowCasters).toBeLessThanOrEqual(budget.shadows + 1);
    expect(pool.shadowCasters + pool.samplers + 2).toBeLessThanOrEqual(pool.maxTextures);
    // the pool, the two ambient lights, no light per fixture
    expect(pool.sceneLights).toBeLessThanOrEqual(budget.spots + budget.points + 2);
    const used = pool.slots.filter((s) => s.fixture);
    expect(used.length).toBe(budget.spots + budget.points); // 20 lit fixtures: every slot is taken
    // every lit fixture is either in the pool or shown by its glow; none that is off is lit
    const lit = new Set([...used.map((s) => s.fixture), ...pool.glowOnly]);
    const linked = await page.evaluate(() => window.__test.card._ui.debug.config.lights.map((l) => [l.id, l.link.id]));
    const onIds = linked.filter(([, e]) => Number(e.split('_').pop()) < 20).map(([id]) => id);
    for (const id of lit) expect(onIds).toContain(id);
    for (const id of onIds) expect(lit.has(id)).toBe(true);
    // table, floor and strip lights never take a shadow slot
    const types = await page.evaluate(() => Object.fromEntries(window.__test.card._ui.debug.config.lights.map((l) => [l.id, l.type])));
    for (const s of pool.slots) if (s.shadow && s.fixture) expect(['table', 'floor', 'strip']).not.toContain(types[s.fixture]);
    expect(errors).toEqual([]);
    expectSameOrigin(urls, page.url());
  });
}

/* ---------- behaving like a Home Assistant card ---------- */

const setState = (page, id, state) => page.evaluate(([e, st]) => {
  const { hass } = window.__test;
  hass.set(e, { ...hass.states[e], state: st });
}, [id, state]);

test('hold and double tap run the plan entity\'s Home Assistant actions, confirmation included', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  page.on('dialog', (d) => d.accept()); // the frontend's confirmation dialog, in the harness a confirm()
  await page.locator('house-control-card .room', { hasText: 'Living' }).click();
  const tv = page.locator('house-control-card .tile[aria-label="TV"]');
  await resetCalls(page);
  // hold: perform-action with a confirmation
  const box = await tv.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect.poll(() => calls(page)).toEqual([{
    domain: 'media_player', service: 'media_play_pause', data: {}, target: { entity_id: 'media_player.demo_tv' },
  }]);
  // double tap: toggle (the TV is playing, so it turns off)
  await resetCalls(page);
  await tv.dblclick();
  await expect.poll(() => calls(page)).toEqual([{ domain: 'media_player', service: 'turn_off', data: { entity_id: 'media_player.demo_tv' } }]);
  // a single tap still waits for a possible second one, then opens more-info
  await page.evaluate(() => { window.__test.events.length = 0; });
  await tv.click();
  await expect.poll(() => page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-more-info'))).toEqual([{ type: 'hass-more-info', entityId: 'media_player.demo_tv' }]);
  expectSameOrigin(urls, page.url());
});

test('a light with a hold_action runs it instead of opening its sheet', async ({ page }) => {
  await open(page);
  await page.locator('house-control-card .room', { hasText: 'Dining' }).click();
  const pendant = page.locator('house-control-card .tile[aria-label="Pendant"]');
  const box = await pendant.boundingBox();
  await page.evaluate(() => { window.__test.events.length = 0; });
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-more-info'))).toEqual([{ type: 'hass-more-info', entityId: 'light.demo_dining_pendant' }]);
  await expect(page.locator('house-control-card .sheet')).toHaveClass(/hidden/);
});

test('active_when lights up a scene and a floor button only while every state matches', async ({ page }) => {
  await open(page);
  const night = page.locator('house-control-card .scene:not(.floor-action)', { hasText: 'Night' });
  const movie = page.locator('house-control-card .scene.floor-action', { hasText: 'Movie' });
  await expect(night).not.toHaveClass(/active/);
  await setState(page, 'input_boolean.demo_night_mode', 'on');
  await expect(night).toHaveClass(/active/);
  await setState(page, 'input_boolean.demo_night_mode', 'off');
  await expect(night).not.toHaveClass(/active/);
  // two conditions: the TV playing (it is) and movie mode on
  await expect(movie).not.toHaveClass(/active/);
  await setState(page, 'input_boolean.demo_movie_mode', 'on');
  await expect(movie).toHaveClass(/active/);
  await setState(page, 'media_player.demo_tv', 'paused');
  await expect(movie).not.toHaveClass(/active/);
});

async function makeEditor(page, { haForm = false, admin = true } = {}) {
  return page.evaluate(async ({ fake, isAdmin }) => {
    if (fake && !customElements.get('ha-form')) {
      // a stand-in for Home Assistant's ha-form: keeps what it is given, reports changes
      customElements.define('ha-form', class extends HTMLElement {});
    }
    const { hass, config } = window.__test;
    const editor = await customElements.get('house-control-card').getConfigElement();
    window.__test.editorEvents = [];
    editor.addEventListener('config-changed', (e) => window.__test.editorEvents.push(e.detail.config));
    editor.hass = { ...hass, user: { ...hass.user, is_admin: isAdmin } };
    editor.setConfig(structuredClone(config));
    document.body.append(editor);
    window.__test.editor = editor;
    await new Promise((r) => { setTimeout(r, 1800); }); // ha-form, or the plain fallback
    return editor.shadowRoot.querySelector('.summary span').textContent;
  }, { fake: haForm, isAdmin: admin });
}

test('the card editor: ha-form for the options, a summary of the plan, never the plan as a form', async ({ page }) => {
  await open(page);
  expect(await makeEditor(page, { haForm: true })).toBe('2 floors · 12 rooms · 24 lights · 7 devices');
  const form = await page.evaluate(() => {
    const f = window.__test.editor.shadowRoot.querySelector('ha-form');
    return { schema: f.schema.map((s) => s.name), data: f.data, hasHass: Boolean(f.hass) };
  });
  expect(form.schema).toEqual(['height', 'quality', 'temperature_unit', 'safe_area', 'full_bleed', 'stacked_view_default', 'sun', 'power', 'animation_fps', 'idle_pause', 'debug_stats']);
  expect(form.data).toEqual({ height: '100vh', power: 'sensor.demo_house_power' });
  expect(form.hasHass).toBe(true);
  // a change from ha-form comes back as config-changed, with the plan untouched
  const changed = await page.evaluate(() => {
    const f = window.__test.editor.shadowRoot.querySelector('ha-form');
    f.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { ...f.data, quality: 'low', height: '' } } }));
    const c = window.__test.editorEvents.at(-1);
    return { quality: c.quality, height: c.height ?? null, samePlan: JSON.stringify(c.plan) === JSON.stringify(window.__test.config.plan) };
  });
  expect(changed).toEqual({ quality: 'low', height: null, samePlan: true });
});

test('the card editor works without ha-form, and Edit home… hands the plan back through config-changed', async ({ page }) => {
  await open(page);
  await makeEditor(page);
  const root = page.locator('house-control-card-editor');
  await root.locator('select[name="quality"]').selectOption('high');
  expect(await page.evaluate(() => window.__test.editorEvents.at(-1).quality)).toBe('high');
  // Edit home…: the full-screen plan editor; its Save goes into the card editor's config, not the dashboard
  await root.locator('.edit-home').click();
  const layer = page.locator('.hc-editor-layer');
  await expect(layer).toHaveCount(1);
  await layer.locator('.title-input').fill('Renamed House');
  await layer.locator('.p-save').click();
  await expect.poll(() => page.evaluate(() => window.__test.editorEvents.at(-1).plan.name)).toBe('Renamed House');
  expect(await page.evaluate(() => window.__test.editorEvents.at(-1).quality)).toBe('high');
  expect(await page.evaluate(() => window.__test.hass.ws.filter((m) => m.type === 'lovelace/config/save'))).toEqual([]);
});

test('the card editor hides Edit home… from non-administrators', async ({ page }) => {
  await open(page);
  await makeEditor(page, { admin: false });
  await expect(page.locator('house-control-card-editor .edit-home')).toBeHidden();
  await expect(page.locator('house-control-card-editor .note')).toContainText('Only an administrator');
});

test('a light Home Assistant theme gives the panel the theme\'s card colour', async ({ page }) => {
  await open(page);
  const bg = () => page.evaluate(() => getComputedStyle(window.__test.card.shadowRoot.querySelector('.panel')).backgroundColor);
  expect(await bg()).toBe('rgba(0, 0, 0, 0)');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--card-background-color', '#fafafa');
    document.documentElement.style.setProperty('--primary-text-color', '#212121');
    const { card, hass } = window.__test;
    card.hass = { ...hass, states: hass.states, themes: { darkMode: false } };
  });
  await expect(page.locator('house-control-card')).toHaveAttribute('light-theme', '');
  expect(await bg()).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => getComputedStyle(window.__test.card.shadowRoot.querySelector('.tile-name')).color)).toBe('rgb(33, 33, 33)');
});

test('full_bleed pulls the card up under the status bar and keeps its header clear of the notch', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await open(page, '?full_bleed=1');
  const card = page.locator('house-control-card');
  await expect(card).toHaveAttribute('full-bleed', '');
  // desktop Chromium has no notch: stand in for env(safe-area-inset-top) with the override
  await page.evaluate(() => window.__test.card.style.setProperty('--hc-safe-top', '59px'));
  const top = await card.evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(0);
  expect(top).toBe(-59);
  expect(await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--safe-top-preview').trim())).toBe('59px');
});

test('with reduced motion the camera jumps instead of gliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const rig = () => page.evaluate(() => window.__test.card._ui.debug.world.rigDelta());
  const frames = () => page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); }));
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  // the camera is there by the first frame drawn after the tap (software WebGL makes that frame slow)
  await expect.poll(rig, { intervals: [50] }).toBeLessThan(0.01);
  // tapping a lamp gives it no pulse
  await page.locator('house-control-card .tile[aria-label="Spots"]').click();
  await frames();
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.lights.get('kitchen.spots').pulse)).toBe(0);
});

/* ---------- Import from Home Assistant ---------- */

async function openImport(page) {
  await page.locator('house-control-card .top .round:not(.power)').click();
  await page.locator('house-control-card .menu button', { hasText: 'Edit home' }).click();
  const layer = page.locator('house-control-card .hc-editor-layer');
  await layer.locator('.p-tool', { hasText: 'Add' }).click();
  await layer.locator('.p-add-item[data-tool="ha-import"]').click();
  const dialog = layer.locator('.e-import');
  await expect(dialog.locator('.e-import-section').first()).toBeVisible();
  return { layer, dialog };
}

for (const registry of ['hass', 'ws']) {
  test(`Import from Home Assistant previews, merges what is missing and saves only with Save (${registry})`, async ({ page }, info) => {
    const urls = recordRequests(page);
    const errors = await open(page, registry === 'ws' ? '?registry=ws' : '');
    const { layer, dialog } = await openImport(page);
    await expect(dialog.locator('.e-mode.active')).toHaveText('Add what’s missing');
    const rows = (section) => dialog.locator(`[data-section="${section}"] .e-import-row`);
    // already in the demo: light.demo_living_ceiling, light.demo_kitchen_spots, the TV, the Kitchen
    await expect(rows('lights')).toHaveCount(2);
    // Living and Kitchen already stand for their areas in the demo
    await expect(rows('rooms').locator('.e-import-name')).toHaveText(['Den', 'Porch']);
    // devices start unticked, lights ticked
    for (const box of await rows('devices').locator('input').all()) await expect(box).not.toBeChecked();
    for (const box of await rows('lights').locator('input').all()) await expect(box).toBeChecked();
    await page.screenshot({ path: info.outputPath(`import-${registry}.png`) });
    // tick the den heater; untick the porch
    await rows('devices').filter({ hasText: 'climate.demo_den_heater' }).locator('input').check();
    await rows('rooms').filter({ hasText: 'Porch' }).locator('input').uncheck();
    await dialog.locator('.e-import-foot .btn.primary').click();
    await expect(dialog).toHaveCount(0);
    // in the editor now, not saved
    await expect(layer.locator('.e-floor', { hasText: 'Lower level' })).toHaveCount(1);
    expect(await page.evaluate(() => window.__test.hass.ws.filter((m) => m.type === 'lovelace/config/save'))).toEqual([]);
    await page.locator('house-control-card .p-save').click();
    const saved = () => page.evaluate(() => window.__test.hass.dashboard.views[0].cards[0].plan);
    await expect.poll(async () => (await saved()).rooms.find((r) => r.area === 'demo_den')?.name).toBe('Den');
    const plan = await saved();
    expect(plan.rooms.some((r) => r.area === 'demo_porch')).toBe(false);
    expect(plan.entities.find((e) => e.entity === 'climate.demo_den_heater')).toBeTruthy();
    expect(plan.entities.some((e) => e.entity === 'lock.demo_porch_lock')).toBe(false);
    expect(plan.lights.filter((l) => l.link?.id === 'light.demo_living_ceiling')).toHaveLength(1);
    if (registry === 'ws') {
      expect(await page.evaluate(() => window.__test.hass.ws.map((m) => m.type).filter((t) => t.includes('registry')).sort())).toEqual([
        'config/area_registry/list', 'config/device_registry/list', 'config/entity_registry/list_for_display', 'config/floor_registry/list',
      ]);
    }
    expect(errors).toEqual([]);
    expectSameOrigin(urls, page.url());
  });
}

test('Import from Home Assistant can start a new plan', async ({ page }) => {
  await open(page);
  const { layer, dialog } = await openImport(page);
  await dialog.locator('.e-mode[data-mode="new"]').click();
  await expect(dialog.locator('[data-section="rooms"] .e-import-row')).toHaveCount(4);
  await dialog.locator('.e-import-foot .btn.primary').click();
  await expect(layer.locator('.e-floor')).toHaveText(['Other areas', 'Ground floor', 'Lower level']);
  await page.locator('house-control-card .p-save').click();
  await expect.poll(() => page.evaluate(() => window.__test.hass.dashboard.views[0].cards[0].plan.rooms.map((r) => r.area).sort()))
    .toEqual(['demo_den', 'demo_kitchen', 'demo_living', 'demo_porch']);
});

/* ---------- the model shows what the house is doing ---------- */

const liveState = (page) => page.evaluate(() => window.__test.card._ui.debug.live.debug());
const setLive = (page, id, state, attributes = {}) => page.evaluate(([e, st, a]) => {
  const { hass } = window.__test;
  hass.set(e, { ...hass.states[e], state: st, attributes: { ...hass.states[e].attributes, ...a } });
}, [id, state, attributes]);

// Taps a 3D thing of the live layer where it is drawn (its hit box), like a finger would.
async function tapLive(page, id) {
  const pt = await page.evaluate((hitId) => {
    const { world, live } = window.__test.card._ui.debug;
    const hit = live.hitOf(hitId);
    const p = world.screenOf(hit);
    const r = window.__test.card.shadowRoot.querySelector('canvas').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, id);
  await page.mouse.click(pt.x, pt.y);
}

test('doors swing with their contact, locks show on doors, the garage door rolls; taps only open more-info', async ({ page }) => {
  const urls = recordRequests(page);
  const errors = await open(page);
  let s = await liveState(page);
  const front = s.doors.find((d) => d.lock);
  expect(front).toMatchObject({ open: 0, lock: 'locked' });
  expect(s.garages[0].open).toBe(0);
  await setLive(page, 'binary_sensor.demo_front_door', 'on');
  await setLive(page, 'lock.demo_front_door', 'unlocked');
  await setLive(page, 'cover.demo_garage_door', 'open', { current_position: 60 });
  await setLive(page, 'binary_sensor.demo_living_window', 'on');
  s = await liveState(page);
  expect(s.doors.find((d) => d.id === front.id)).toMatchObject({ open: 1, lock: 'alert' });
  expect(s.doors.find((d) => !d.lock).open).toBe(1);
  expect(s.garages[0].open).toBeCloseTo(0.6);
  await setLive(page, 'lock.demo_front_door', 'jammed');
  expect((await liveState(page)).doors.find((d) => d.id === front.id).lock).toBe('alert');

  // tapping the lock and the garage door: Home Assistant's dialog, never a service call
  await page.locator('house-control-card .room', { hasText: 'Hall' }).click();
  await page.waitForTimeout(1500);
  await resetCalls(page);
  await page.evaluate(() => { window.__test.events.length = 0; });
  await tapLive(page, `${front.id}:lock`);
  await page.locator('house-control-card .room').filter({ hasText: /^All/ }).click();
  await page.waitForTimeout(1500);
  await tapLive(page, `${s.garages[0].id}:garage`);
  await expect.poll(() => page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-more-info').map((e) => e.entityId)))
    .toEqual(expect.arrayContaining(['lock.demo_front_door', 'cover.demo_garage_door']));
  const sent = await page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-action'));
  for (const e of sent) expect(Object.values(e.config).find((v) => v?.action)?.action).toBe('more-info');
  await page.waitForTimeout(300);
  expect(await calls(page)).toEqual([]);
  expect(errors).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('an occupied room glows and the glow fades out after the motion stops', async ({ page }) => {
  await open(page);
  const glow = async (room) => (await liveState(page)).glows.find((g) => g.room === room);
  expect(await glow('living')).toMatchObject({ on: 1 });
  expect(await glow('kitchen')).toMatchObject({ on: 0 });
  await setLive(page, 'binary_sensor.demo_living_motion', 'off');
  await page.waitForTimeout(400);
  const fading = await glow('living');
  expect(fading.on).toBe(0);
  expect(fading.level).toBeGreaterThan(0.2); // still fading
  expect(fading.level).toBeLessThanOrEqual(1); // and only towards off, however slow the frames
  // a few seconds later (simulated: software WebGL draws few frames) it is gone
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(4));
  expect((await glow('living')).level).toBeLessThan(0.05);
});

test('people stand in their room, on its floor; away shows in the header', async ({ page }) => {
  await open(page);
  let people = (await liveState(page)).people;
  expect(people).toEqual([
    { name: 'Demo Person', room: 'living', floor: 'main' },
    { name: 'Demo Guest', room: null, floor: null },
  ]);
  await expect(page.locator('house-control-card .home-sub .away')).toHaveText(' · Demo Guest away');
  await setLive(page, 'sensor.demo_person_area', 'Bar'); // a room name works too
  await setLive(page, 'sensor.demo_guest_area', 'demo_kitchen');
  people = (await liveState(page)).people;
  expect(people).toEqual([
    { name: 'Demo Person', room: 'bar', floor: 'basement' },
    { name: 'Demo Guest', room: 'kitchen', floor: 'main' },
  ]);
  await expect(page.locator('house-control-card .home-sub .away')).toHaveCount(0);
  await setLive(page, 'sensor.demo_person_area', 'somewhere');
  expect((await liveState(page)).people[0].room).toBe(null);
});

test('the heat map tints rooms by temperature and the room tabs show the reading', async ({ page }, info) => {
  await open(page);
  await expect(page.locator('house-control-card .room', { hasText: 'Living' }).locator('.reading')).toHaveText('21.5°');
  await expect(page.locator('house-control-card .room', { hasText: 'Kitchen' }).locator('.reading')).toHaveText('24.6°');
  expect((await liveState(page)).heat.every((x) => x.on === 0)).toBe(true);
  const toggle = page.locator('house-control-card .heat-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const heat = Object.fromEntries((await liveState(page)).heat.map((x) => [x.room, x]));
  expect(Object.values(heat).every((x) => x.on === 1)).toBe(true);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  expect(rgb(heat.bedroom.color)[2]).toBeGreaterThan(rgb(heat.bedroom.color)[0]); // 18.2 °C: blue
  expect(rgb(heat.kitchen.color)[0]).toBeGreaterThan(rgb(heat.kitchen.color)[2]); // 24.6 °C: warm
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('heat-map.png') });
  await toggle.click();
  expect((await liveState(page)).heat.every((x) => x.on === 0)).toBe(true);
});

test('fans spin with their percentage and stop when off', async ({ page }) => {
  await open(page);
  const blades = () => page.evaluate(() => window.__test.card._ui.debug.world.lights.get('rec.fan').model.getObjectByName('fan-blades').rotation.y);
  const a = await blades();
  // turning: wait for frames rather than a fixed time (fans draw at animation_fps; CI draws few frames)
  await expect.poll(async () => Math.abs((await blades()) - a), { timeout: 20000 }).toBeGreaterThan(0.1);
  expect((await liveState(page)).fans.find((f) => f.entity === 'fan.demo_rec_fan').speed).toBeGreaterThan(0);
  await setLive(page, 'fan.demo_rec_fan', 'off');
  await page.waitForTimeout(100);
  const b = await blades();
  await page.waitForTimeout(500);
  expect(await blades()).toBe(b);
});

test('a TV glows with its picture from Home Assistant only; tapping it opens more-info', async ({ page }) => {
  const urls = recordRequests(page);
  await open(page);
  await expect.poll(async () => (await liveState(page)).tvs[0]).toEqual({
    entity: 'media_player.demo_tv', on: true, picture: expect.stringMatching(/^http:\/\/127\.0\.0\.1:4178\/tests\/harness\/demo-screen\.svg$/),
  });
  // a picture on another origin is never loaded
  await setLive(page, 'media_player.demo_tv', 'playing', { entity_picture: 'https://example.com/poster.jpg' });
  expect((await liveState(page)).tvs[0]).toMatchObject({ on: true, picture: null });
  await setLive(page, 'media_player.demo_tv', 'off');
  expect((await liveState(page)).tvs[0].on).toBe(false);
  // the screen is a tap target for the media player's dialog
  await page.locator('house-control-card .room', { hasText: 'Living' }).click();
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(6)); // the camera is there before the tap
  await page.evaluate(() => { window.__test.events.length = 0; });
  await tapLive(page, 'tv0');
  await expect.poll(() => page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-more-info').map((e) => e.entityId)))
    .toEqual(['media_player.demo_tv']);
  expectSameOrigin(urls, page.url());
});

test('sun: true blends to daylight with the sun\'s elevation', async ({ page }) => {
  await open(page, '?sun=1');
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.daylight)).toBe(0);
  await setLive(page, 'sun.sun', 'above_horizon', { elevation: 2 });
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.daylight)).toBeCloseTo(0.5);
  await setLive(page, 'sun.sun', 'above_horizon', { elevation: 40 });
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.daylight)).toBe(1);
});

test('without sun: true the night look stays, whatever the sun does', async ({ page }) => {
  await open(page);
  await setLive(page, 'sun.sun', 'above_horizon', { elevation: 40 });
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.daylight)).toBe(0);
});

test('power: watts on a light that is on, the house total in the header', async ({ page }) => {
  await open(page);
  await expect(page.locator('house-control-card .home-sub .house-power')).toHaveText(' · 1.23 kW');
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  const spots = page.locator('house-control-card .tile[aria-label="Spots"] .tile-sub');
  await expect(spots).toHaveText('Off');
  await setLive(page, 'light.demo_kitchen_spots', 'on', { brightness: 255, color_mode: 'brightness' });
  await expect(spots).toHaveText('100% · 18 W');
  await setLive(page, 'sensor.demo_house_power', '640');
  await expect(page.locator('house-control-card .home-sub .house-power')).toHaveText(' · 640 W');
});

/* ---------- floor-button confirmation, helper toggles ---------- */

// window.confirm / alert must never be used: any call is recorded and refused.
const trapDialogs = (page) => page.addInitScript(() => {
  window.__dialogs = [];
  window.confirm = (t) => { window.__dialogs.push(['confirm', t]); return false; };
  window.alert = (t) => { window.__dialogs.push(['alert', t]); };
});
const confirmSheet = (page) => page.locator('house-control-card .hc-confirm');
const confirmLayer = (page) => page.locator('house-control-card .hc-confirm-layer');
const toBasement = (page) => page.locator('house-control-card .floors .floor-chip', { hasText: 'Basement' }).click();

test('a floor button with confirmation asks in the card\'s own sheet: Cancel runs nothing, Confirm runs it once', async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await trapDialogs(page);
  const urls = recordRequests(page);
  const browserDialogs = [];
  page.on('dialog', (d) => { browserDialogs.push(d.message()); d.dismiss(); });
  const errors = await open(page);
  await toBasement(page);
  await resetCalls(page);
  const game = page.locator('house-control-card .scene.floor-action', { hasText: 'Game night' });

  await game.click();
  const sheet = confirmSheet(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toHaveClass(/hidden/);
  await expect(sheet.locator('.sheet-name')).toHaveText('Game night');
  await expect(sheet.locator('.sheet-sub')).toHaveText('Dim the bar and start game night?');
  await expect(sheet.locator('.sheet-head .bubble svg')).toHaveCount(1);
  await expect(sheet.locator('.hc-confirm-actions button')).toHaveText(['Cancel', 'Confirm']);
  // the card's own sheet slides up to the bottom of the card, with full-width buttons
  await expect.poll(async () => { const b = await sheet.boundingBox(); return Math.round(b.y + b.height); }).toBe(932);
  const box = await sheet.boundingBox();
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(430);
  for (const t of ['Cancel', 'Confirm']) expect((await sheet.locator('button', { hasText: t }).boundingBox()).width).toBeGreaterThan(380);
  expect(await sheet.locator('.hc-confirm-ok').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient'); // the power button's blue
  await page.screenshot({ path: info.outputPath('confirm-sheet.png') });

  await sheet.locator('button', { hasText: 'Cancel' }).click();
  await expect(confirmLayer(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await calls(page)).toEqual([]);

  // the scrim and Esc close it too, without running anything
  await game.click();
  await expect(confirmSheet(page)).toBeVisible();
  await page.locator('house-control-card .hc-confirm-scrim').click({ position: { x: 20, y: 20 } });
  await expect(confirmLayer(page)).toHaveCount(0);
  await game.click();
  await expect(confirmSheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmLayer(page)).toHaveCount(0);
  expect(await calls(page)).toEqual([]);

  await game.click();
  await confirmSheet(page).locator('button', { hasText: 'Confirm' }).click();
  await expect(confirmLayer(page)).toHaveCount(0);
  await expect.poll(() => calls(page)).toEqual([{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.demo_movie_mode' } }]);
  await page.waitForTimeout(400);
  expect(await calls(page)).toHaveLength(1);
  expect(await page.evaluate(() => window.__dialogs)).toEqual([]);
  expect(browserDialogs).toEqual([]);
  expect(await page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-action'))).toEqual([]);
  expect(errors).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('the confirmation sheet keeps clear of the bottom safe area and follows reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.evaluate(() => window.__test.card.style.setProperty('--safe-bottom-preview', '34px'));
  await toBasement(page);
  await page.locator('house-control-card .scene.floor-action', { hasText: 'Game night' }).click();
  const sheet = confirmSheet(page);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))).toBe(34 + 16);
  const confirm = await sheet.locator('.hc-confirm-ok').boundingBox();
  expect(confirm.y + confirm.height).toBeLessThanOrEqual(932 - 34);
  // no slide: the sheet is in place at once
  expect(await sheet.evaluate((el) => getComputedStyle(el).transitionDuration.split(',').every((d) => parseFloat(d) <= 0.001))).toBe(true);
  await sheet.locator('button', { hasText: 'Cancel' }).click();
  await expect(confirmLayer(page)).toHaveCount(0);
});

test('a floor button with toggle switches its input_boolean and shows as active while it is on', async ({ page }) => {
  await open(page);
  await toBasement(page);
  await resetCalls(page);
  const guests = page.locator('house-control-card .scene.floor-action', { hasText: 'Guests' });
  await expect(guests).not.toHaveClass(/active/);
  await guests.click();
  await expect(confirmSheet(page).locator('.sheet-sub')).toHaveText('Run Guests?'); // confirmation: true
  await confirmSheet(page).locator('button', { hasText: 'Confirm' }).click();
  await expect.poll(() => calls(page)).toEqual([{ domain: 'input_boolean', service: 'toggle', data: { entity_id: 'input_boolean.demo_guest_mode' } }]);
  await expect(guests).toHaveClass(/active/);
  await setState(page, 'input_boolean.demo_guest_mode', 'off');
  await expect(guests).not.toHaveClass(/active/);
});

/* ---------- rooms in several parts, placeholders, fans without a bowl, new furniture ---------- */

test('a room in two parts: one tab, its part\'s lights under it, a shared glow', async ({ page }) => {
  await open(page);
  const tabs = await page.locator('house-control-card .rooms .room:not([hidden]):not(.heat-toggle)').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim()));
  expect(tabs).not.toContain('Rec nook');
  expect(tabs).toContain('Rec room');
  await page.locator('house-control-card .room', { hasText: 'Rec room' }).click();
  expect(await tileNames(page)).toContain('Nook light');
  // the nook's floor glows with the rec room's motion sensor
  const glows = async () => Object.fromEntries((await liveState(page)).glows.map((g) => [g.room, g.on]));
  expect(await glows()).toMatchObject({ rec: 0, rec_nook: 0 });
  await setLive(page, 'binary_sensor.demo_rec_motion', 'on');
  expect(await glows()).toMatchObject({ rec: 1, rec_nook: 1 });
  // the nook's name means the rec room; the person stands in its biggest rectangle
  await setLive(page, 'sensor.demo_person_area', 'Rec nook');
  expect((await liveState(page)).people[0]).toEqual({ name: 'Demo Person', room: 'rec', floor: 'main' });
});

test('a placeholder light: unlit, "Not connected", not tappable, not counted', async ({ page }) => {
  await open(page);
  await page.locator('house-control-card .room', { hasText: 'Rec room' }).click();
  const tile = page.locator('house-control-card .tile[aria-label="Nook light"]');
  await expect(tile).toHaveClass(/unavailable/);
  await expect(tile.locator('.tile-sub')).toHaveText('Not connected');
  const on = () => page.evaluate(() => window.__test.card._ui.debug.store.state.lights['rec.nook'].on);
  await tile.click();
  await page.locator('house-control-card .list-head .pill', { hasText: 'All on' }).click();
  await page.waitForTimeout(400);
  expect(await on()).toBe(false);
  // "x of N on" for the rec room counts its real lights only
  const real = await page.evaluate(() => window.__test.card._ui.debug.config.lights.filter((l) => ['rec', 'rec_nook'].includes(l.room) && !l.placeholder).length);
  await expect(page.locator('house-control-card .list-head .title')).toHaveText(`Rec room · ${real} of ${real} on`);
  await page.locator('house-control-card .scene:not(.floor-action)', { hasText: 'Bright' }).click();
  await page.waitForTimeout(300);
  expect(await on()).toBe(false);
  expect(await page.evaluate(() => window.__test.card._ui.debug.world.lights.get('rec.nook').goal)).toBe(0);
});

test('a fan without a bowl: a fan on its tile, no light, blades turning while its switch is on', async ({ page }) => {
  await open(page);
  await page.locator('house-control-card .room', { hasText: 'Office' }).click();
  const tile = page.locator('house-control-card .tile[aria-label="Office fan"]');
  // the same fan icon as the fan light's (type "fan"), though its entity is a switch (a plug otherwise)
  const drawing = (label) => page.locator(`house-control-card .tile[aria-label="${label}"] .bubble svg`).evaluate((el) => el.innerHTML);
  const plug = await page.locator('house-control-card .tile[aria-label="Desk lamp"] .bubble svg').evaluate((el) => el.innerHTML);
  await page.locator('house-control-card .room', { hasText: 'Rec room' }).click();
  const fanIcon = await drawing('Fan light');
  await page.locator('house-control-card .room', { hasText: 'Office' }).click();
  expect(await drawing('Office fan')).toBe(fanIcon);
  expect(fanIcon).not.toBe(plug);
  const unit = () => page.evaluate(() => {
    const u = window.__test.card._ui.debug.world.lights.get('office.fan');
    return { lights: u.lights.length, glow: u.glow.length, angle: u.model.getObjectByName('fan-blades').rotation.y };
  });
  const before = await unit();
  expect([before.lights, before.glow]).toEqual([0, 0]);
  await page.waitForTimeout(400);
  expect((await unit()).angle).toBe(before.angle);
  await resetCalls(page);
  await tile.click();
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.demo_office_fan' } });
  // turning: wait for frames rather than a fixed time (software WebGL on CI draws few of them)
  const a = (await unit()).angle;
  await expect.poll(async () => Math.abs((await unit()).angle - a), { timeout: 10000 }).toBeGreaterThan(0.1);
  expect((await liveState(page)).fans).toContainEqual({ light: 'office.fan', speed: expect.any(Number) });
  const pool = await page.evaluate(() => window.__test.card._ui.debug.lightPool);
  expect([...pool.slots.map((s) => s.fixture), ...pool.glowOnly]).not.toContain('office.fan');
});

test('the new furniture models load without console errors', async ({ page }, info) => {
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text()); });
  const errors = await open(page);
  await page.evaluate(() => {
    const { card, config } = window.__test;
    const plan = structuredClone(config.plan);
    plan.furniture.push(
      { type: 'washerDryer', pos: [9.6, 9.6], stacked: true, lid: 'top', storey: 'main' },
      { type: 'showerStall', pos: [5.5, 1.0], glass: false, storey: 'main' },
      { type: 'walkInCloset', pos: [12.0, 6.5], width: 2.4, depth: 2.2, sides: true, storey: 'main' },
    );
    card.setConfig({ ...config, plan });
  });
  await page.waitForFunction(() => window.__test.card._ui);
  const types = await page.evaluate(() => window.__test.card._ui.debug.world.findFurniture(() => true).map(({ item }) => item.type));
  for (const t of ['washerDryer', 'showerStall', 'daybed', 'walkInCloset']) expect(types).toContain(t);
  expect(types.filter((t) => t === 'washerDryer')).toHaveLength(2);
  await toBasement(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('utility.png') });
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

/* ---------- the render loop: spinning fans, idle rest, draw calls ---------- */

const loopStats = (page) => page.evaluate(() => window.__test.card._ui.debug.loop);
const recBlades = (page) => page.evaluate(() => window.__test.card._ui.debug.world.lights.get('rec.fan').model.getObjectByName('fan-blades').rotation.y);
// rAF callbacks and renders during `ms`, measured in the page
const countDuring = (page, ms) => page.evaluate(async (wait) => {
  const { world } = window.__test.card._ui.debug;
  const a = world.loopStats();
  await new Promise((r) => { setTimeout(r, wait); });
  const b = world.loopStats();
  return { frames: b.frames - a.frames, renders: b.renders - a.renders };
}, ms);
// Ends the intro, fades and camera moves at once (software WebGL draws few frames): then only the
// rec room's fan (on in the demo) moves.
const settleLoop = async (page) => {
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(10));
  await page.waitForTimeout(600);
};
// Waits until the loop has nothing scheduled at all (no frame, no capped-rate timer): from then on
// it draws nothing until something wakes it. Exact, whatever the frame rate (CI draws ~1 a second).
const quiet = (page) => expect.poll(async () => (await loopStats(page)).sleeping, { timeout: 60000 }).toBe(true);
// The renderer's numbers after a frame drawn now.
const freshInfo = (page) => page.evaluate(async () => {
  const { world } = window.__test.card._ui.debug;
  const before = world.loopStats().renders;
  world.wake(1);
  const until = performance.now() + 15000;
  while (world.loopStats().renders === before && performance.now() < until) await new Promise((r) => { setTimeout(r, 50); });
  return world.renderInfo();
});

test('while only fans move, the frame rate is capped at animation_fps', async ({ page }) => {
  await open(page, '?animation_fps=10');
  await settleLoop(page);
  expect((await loopStats(page)).fps).toBe(10);
  const { frames, renders } = await countDuring(page, 2000);
  expect(renders).toBeGreaterThan(0); // the fan keeps turning
  expect(renders).toBeLessThanOrEqual(10 * 2 + 3);
  // no requestAnimationFrame at the display's rate in between: about one per render
  expect(frames).toBeLessThanOrEqual(renders + 3);
});

test('after idle_pause the loop rests (no frames), the fans freeze, and a tap wakes it', async ({ page }) => {
  test.setTimeout(180000); // software WebGL on CI: about a frame a second
  await open(page, '?idle_pause=2');
  await settleLoop(page);
  await expect.poll(async () => (await loopStats(page)).resting, { timeout: 10000 }).toBe(true);
  await quiet(page);
  const angle = await recBlades(page);
  expect((await countDuring(page, 1200)).frames).toBe(0);
  expect(await recBlades(page)).toBe(angle);
  // Home Assistant state still updates the model while resting, with a few frames only
  await setLive(page, 'light.demo_rec_cans', 'on', { brightness: 200 });
  await expect.poll(() => page.evaluate(() => window.__test.card._ui.debug.world.lights.get('rec.cans').level), { timeout: 20000 }).toBeGreaterThan(0.5);
  await quiet(page); // the fade ends, and the loop sleeps again
  expect((await countDuring(page, 1000)).frames).toBe(0);
  expect(await recBlades(page)).toBe(angle);
  // a tap on the 3D view: the fan turns again
  const box = await page.locator('house-control-card canvas').boundingBox();
  await page.mouse.click(box.x + 20, box.y + box.height - 60);
  expect((await loopStats(page)).resting).toBe(false);
  await expect.poll(async () => Math.abs((await recBlades(page)) - angle), { timeout: 10000 }).toBeGreaterThan(0.1);
  await expect.poll(async () => (await countDuring(page, 1500)).frames, { timeout: 20000 }).toBeGreaterThan(0);
});

test('a spinning fan on a floor that is not shown (or dimmed) does not keep the loop awake', async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await settleLoop(page);
  await expect.poll(async () => (await countDuring(page, 1500)).renders, { timeout: 20000 }).toBeGreaterThan(0); // the rec fan, on the main floor
  await page.locator('house-control-card .floors .floor-chip', { hasText: 'Basement' }).click();
  await settleLoop(page);
  await quiet(page); // with the fan still counted this would never happen
  const angle = await recBlades(page);
  expect(await countDuring(page, 1200)).toEqual({ frames: 0, renders: 0 });
  expect(await recBlades(page)).toBe(angle);
  // the stacked view with the basement selected: the main floor is dimmed, its fan stays still
  await page.locator('house-control-card .floor-stack').click();
  await settleLoop(page);
  await quiet(page);
  expect(await countDuring(page, 1200)).toEqual({ frames: 0, renders: 0 });
  expect(await recBlades(page)).toBe(angle);
});

test('an entity with "fan": false keeps its icon still', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { card, config, hass } = window.__test;
    const plan = structuredClone(config.plan);
    plan.entities.find((e) => e.entity === 'fan.demo_bedroom_fan').fan = false;
    card.setConfig({ ...config, plan });
    hass.set('fan.demo_bedroom_fan', { ...hass.states['fan.demo_bedroom_fan'], state: 'on' });
  });
  await page.waitForFunction(() => window.__test.card._ui);
  const fans = (await page.evaluate(() => window.__test.card._ui.debug.live.debug().fans)).map((f) => f.entity);
  expect(fans).not.toContain('fan.demo_bedroom_fan');
  expect(fans).toContain('fan.demo_rec_fan'); // a fan light's blades are not affected
});

test('draw calls stay within budget, and switching floors leaks no geometry or texture', async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await settleLoop(page);
  const info = () => freshInfo(page);
  const main = await info();
  expect(Object.keys(main)).toEqual(expect.arrayContaining(['calls', 'triangles', 'geometries', 'textures', 'programs']));
  expect(main.calls).toBeLessThan(150);
  // static meshes are merged: far fewer meshes than pieces
  expect(main.merged.main.after * 5).toBeLessThan(main.merged.main.before);
  const chip = (name) => page.locator('house-control-card .floors .floor-chip', { hasText: name });
  await chip('Basement').click();
  await settleLoop(page);
  expect((await info()).calls).toBeLessThan(150);
  await page.locator('house-control-card .floor-stack').click();
  await settleLoop(page);
  expect((await info()).calls).toBeLessThan(400);
  // one full round first (the dimmed look is made once), then 20 more, each one drawn: nothing grows
  await page.locator('house-control-card .floor-stack').click();
  await chip('Main').click();
  await settleLoop(page);
  const before = await info();
  await page.evaluate(() => {
    const { world } = window.__test.card._ui.debug;
    for (let i = 0; i < 20; i++) {
      world.setFloor(i % 2 ? 'main' : 'basement');
      world.settle(0.05);
      world.setStacked(true);
      world.settle(0.05);
      world.setStacked(false);
      world.settle(0.05);
    }
    world.setFloor('main');
    world.settle(0.05);
  });
  const after = await info();
  expect(after.geometries).toBeLessThanOrEqual(before.geometries);
  expect(after.textures).toBeLessThanOrEqual(before.textures);
});

test('debug_stats shows the frame rate, draw calls, geometries and textures', async ({ page }) => {
  await open(page, '?debug_stats=1');
  await expect(page.locator('house-control-card .hc-stats')).toHaveText(/^\d+ fps · \d+ calls · \d+ geo · \d+ tex/);
  await open(page);
  await expect(page.locator('house-control-card .hc-stats')).toHaveCount(0);
});

test('taps still reach rooms and lights after the static meshes are merged', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(3));
  const room = await page.evaluate(() => {
    const { world, config } = window.__test.card._ui.debug;
    const r = config.rooms.find((x) => x.id === 'kitchen');
    const group = world.floorGroup('main');
    const hit = [];
    group.traverse((o) => { if (o.userData.kind === 'room' && o.userData.id === r.id) hit.push(o); });
    return { proxies: hit.length, visible: hit.some((o) => o.visible) };
  });
  expect(room.proxies).toBe(1);
  expect(room.visible).toBe(false); // drawn by the merged mesh, picked through the invisible original
  await resetCalls(page);
  const spots = await page.evaluate(() => {
    const { world } = window.__test.card._ui.debug;
    return world.screenOf(world.lights.get('kitchen.spots').hit);
  });
  const box = await page.locator('house-control-card canvas').boundingBox();
  await page.mouse.click(box.x + spots.x, box.y + spots.y);
  await expect.poll(() => calls(page)).toContainEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.demo_kitchen_spots' } });
});

/* ---------- kitchen, fireplace and storage furniture ---------- */

test('the wall oven, fireplace, shelving, cooktop island, split kitchen and round tables load without console errors', async ({ page }, info) => {
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text()); });
  const urls = recordRequests(page);
  const errors = await open(page);
  const found = await page.evaluate(() => window.__test.card._ui.debug.world.findFurniture(() => true)
    .map(({ item, group }) => ({ type: item.type, round: Boolean(item.round), meshes: (() => { let n = 0; group.traverse((o) => { if (o.isMesh) n++; }); return n; })(), floor: item.storey })));
  for (const type of ['wallOven', 'fireplace', 'shelving', 'island', 'kitchen']) expect(found.map((f) => f.type)).toContain(type);
  expect(found.filter((f) => f.round).map((f) => f.type).sort()).toEqual(['coffeeTable', 'endTable']);
  // the kitchen: one hood and hob on the island, none on the run with "cooktop": false
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(3));
  await page.screenshot({ path: info.outputPath('kitchen.png') });
  await page.locator('house-control-card .room', { hasText: 'Rec room' }).click();
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(3));
  await page.screenshot({ path: info.outputPath('fireplace.png') });
  await page.locator('house-control-card .floors .floor-chip', { hasText: 'Basement' }).click();
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(3));
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expectSameOrigin(urls, page.url());
});

test('the fireplace TV glows with its media player and taps open more-info; the fire flickers only while shown', async ({ page }) => {
  await open(page);
  const fireplaceTv = async () => (await liveState(page)).tvs.find((t) => t.entity === 'media_player.demo_rec_tv');
  expect(await fireplaceTv()).toMatchObject({ on: false });
  await setLive(page, 'media_player.demo_rec_tv', 'playing');
  expect(await fireplaceTv()).toMatchObject({ on: true });
  await page.locator('house-control-card .room', { hasText: 'Rec room' }).click();
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(6));
  await page.evaluate(() => { window.__test.events.length = 0; });
  const id = await page.evaluate(() => `tv${window.__test.card._ui.debug.config.furniture.filter((f) => f.entity).findIndex((f) => f.type === 'fireplace')}`);
  await tapLive(page, id);
  await expect.poll(() => page.evaluate(() => window.__test.events.filter((e) => e.type === 'hass-more-info').map((e) => e.entityId)))
    .toEqual(['media_player.demo_rec_tv']);
  // the fire: its glow changes while the floor is shown
  const flame = () => page.evaluate(() => {
    const { world } = window.__test.card._ui.debug;
    const [{ group }] = world.findFurniture((it) => it.type === 'fireplace');
    return group.getObjectByName('fire').material.emissiveIntensity;
  });
  const a = await flame();
  await expect.poll(flame, { timeout: 20000 }).not.toBe(a);
  // on the basement the main floor is hidden: the fire stops changing
  await page.locator('house-control-card .floors .floor-chip', { hasText: 'Basement' }).click();
  await page.evaluate(() => window.__test.card._ui.debug.world.settle(3));
  await expect.poll(async () => (await loopStats(page)).sleeping, { timeout: 60000 }).toBe(true);
  const b = await flame();
  await page.waitForTimeout(800);
  expect(await flame()).toBe(b);
});

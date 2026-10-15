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
  await expect(page.locator('house-control-card .scene')).toHaveCount(5);
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
  await expect(spots.locator('.tile-sub')).toHaveText('50%');
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
  await expect.poll(() => page.evaluate(() => window.__test.events)).toEqual([
    { type: 'hass-more-info', entityId: 'lock.demo_front_door' },
    { type: 'hass-more-info', entityId: 'cover.demo_garage_door' },
  ]);
  await page.waitForTimeout(300);
  expect(await calls(page)).toEqual([]);
  // an entity with tap: toggle does toggle
  await page.locator('house-control-card .room', { hasText: 'Kitchen' }).click();
  await page.locator('house-control-card .tile[aria-label="Coffee maker"]').click();
  await expect.poll(() => calls(page)).toEqual([{ domain: 'switch', service: 'toggle', data: { entity_id: 'switch.demo_coffee_maker' } }]);
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
  await page.locator('house-control-card .scene', { hasText: 'Movie' }).click();
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

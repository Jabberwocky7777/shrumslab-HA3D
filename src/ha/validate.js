// Plan validation: upstream's normalize() (unknown rooms, duplicate ids, axis-aligned
// openings...) plus the Home Assistant rules of brief section 3.8.
import { normalize, ConfigError } from '../../upstream/config.js';
import {
  domainOf, isSensitive, LIGHT_DOMAINS, AC_DOMAINS, RUN_DOMAINS, TOGGLE_DOMAINS, TAP_ACTIONS,
} from './sensitive.js';
import { defaultIcon } from './mapping.js';

export { ConfigError };

// Home Assistant entity ids: `<domain>.<object_id>`, lower case letters, digits and underscores.
export const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export const isEntityId = (v) => typeof v === 'string' && ENTITY_ID.test(v);

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

function need(cond, msg) {
  if (!cond) throw new ConfigError(msg);
}

/** The Home Assistant entity a plan light or AC is linked to, or null. */
export function haLink(device) {
  return device?.link?.service === 'homeassistant' && device.link.id ? device.link.id : null;
}

function checkAction(what, entity, action, path) {
  if (action == null) return;
  need(TAP_ACTIONS.includes(action), `${what} has unknown action "${action}" (use ${TAP_ACTIONS.join(', ')})`);
  if (action === 'toggle') {
    need(!isSensitive(entity), `${what}: "${entity}" is a sensitive device and cannot be toggled with a tap; use "more-info"`);
    need(TOGGLE_DOMAINS.has(domainOf(entity)),
      `${what}: "toggle" only works for ${[...TOGGLE_DOMAINS].join(', ')} entities; use "more-info" for "${entity}"`);
  }
  if (action === 'navigate') need(typeof path === 'string' && path.startsWith('/'), `${what} needs a "path" starting with "/" to navigate to`);
}

/**
 * Checks a plan and returns { config, warnings }. `config` is upstream's normalised plan
 * with an `entities` array added. Throws a ConfigError for anything that would break the card
 * or the sensitive-device rules. Missing entities (not in `hass.states`) are only warnings.
 */
export function validatePlan(raw, { states = null, unit = '°C' } = {}) {
  const config = normalize(structuredClone(raw));
  raw.rooms.forEach((r) => need(r.tab == null || typeof r.tab === 'boolean', `Room "${r.id}" has a "tab" that is not true or false`));
  // Temperatures in the plan (AC ranges, scene targets, outdoorTemp) are in Home Assistant's unit.
  config.tempUnit = unit === '°F' ? '°F' : '°C';
  if (config.tempUnit === '°F' && raw.outdoorTemp == null) config.outdoorTemp = 80;
  const warnings = [];
  const ids = new Set([...config.rooms, ...config.lights, ...config.acs].map((x) => x.id));
  const roomIds = new Set(config.rooms.map((r) => r.id));
  const exists = (entity, what) => {
    if (states && !states[entity]) warnings.push(`${what}: "${entity}" was not found in Home Assistant`);
  };

  config.lights.forEach((l, i) => {
    const rawLight = raw.lights[i];
    // Several fixtures on one switch (cans, sconce): [[x, z], ...] or [[x, z, rot], ...] in plan metres.
    if (l.points != null) {
      need(Array.isArray(l.points) && l.points.length > 0, `Light "${l.id}" has "points" that is not a list of [x, z]`);
      l.points.forEach((p, k) => need(Array.isArray(p) && (p.length === 2 || p.length === 3) && p.every(Number.isFinite),
        `Light "${l.id}" point #${k + 1} must be [x, z] or [x, z, rotation]`));
    }
    l.autoCapabilities = !('capabilities' in rawLight); // ha3d: worked out from supported_color_modes
    if (!l.link && !l.tuya) return;
    const entity = haLink(l);
    if (!entity) {
      warnings.push(`Light "${l.id}" is linked to ${l.link?.service || 'Smart Life'}, which this card cannot reach; link it to Home Assistant instead`);
      return;
    }
    need(isEntityId(entity), `Light "${l.id}" is linked to "${entity}", which is not a valid entity id`);
    need(!isSensitive(entity), `Light "${l.id}" is linked to "${entity}", a sensitive device; add it under "entities" instead`);
    need(LIGHT_DOMAINS.has(domainOf(entity)), `Light "${l.id}" must be linked to a light.* or switch.* entity, not "${entity}"`);
    exists(entity, `Light "${l.id}"`);
  });

  config.acs.forEach((a, i) => {
    const rawAc = raw.acs[i];
    a.autoRange = !('min' in rawAc) && !('max' in rawAc);
    if (a.autoRange && config.tempUnit === '°F') { a.min = 60; a.max = 86; }
    const entity = haLink(a);
    if (a.link && !entity) warnings.push(`AC "${a.id}" is linked to ${a.link.service}, which this card cannot reach`);
    if (entity) {
      need(isEntityId(entity), `AC "${a.id}" is linked to "${entity}", which is not a valid entity id`);
      need(AC_DOMAINS.has(domainOf(entity)), `AC "${a.id}" must be linked to a climate.* entity, not "${entity}"`);
      exists(entity, `AC "${a.id}"`);
    }
    const sensor = a.sensor?.service === 'homeassistant' ? a.sensor.id : null;
    if (sensor) {
      need(isEntityId(sensor) && domainOf(sensor) === 'sensor', `AC "${a.id}" needs a sensor.* entity as its "sensor", not "${sensor}"`);
      exists(sensor, `AC "${a.id}" sensor`);
    }
  });

  need(raw.entities == null || Array.isArray(raw.entities), '"entities" must be a list');
  config.entities = (raw.entities || []).map((e, i) => {
    const what = `Entity "${e?.id ?? `#${i + 1}`}"`;
    need(e && typeof e === 'object', `Entity #${i + 1} must be an object`);
    need(typeof e.id === 'string' && e.id, `Entity #${i + 1} is missing an "id"`);
    need(!ids.has(e.id), `Duplicate id "${e.id}"`);
    ids.add(e.id);
    need(roomIds.has(e.room), `${what} refers to unknown room "${e.room}"`);
    need(isEntityId(e.entity), `${what} needs "entity": a Home Assistant entity id such as "media_player.your_tv"`);
    need(isPoint(e.pos), `${what} needs "pos": [x, z]`);
    need(e.y == null || Number.isFinite(e.y), `${what} has a "y" that is not a number`);
    checkAction(what, e.entity, e.tap, e.path);
    checkAction(`${what} (hold)`, e.entity, e.hold, e.path);
    need(e.show == null || e.show === 'temperature', `${what} has unknown "show" (only "temperature" is supported)`);
    exists(e.entity, what);
    return {
      ...e,
      name: e.name || e.id,
      y: e.y ?? 1.2,
      icon: e.icon || defaultIcon(e.entity, states?.[e.entity]),
      tap: e.tap || 'more-info',
      hold: e.hold || 'more-info',
    };
  });
  const entityIds = new Set(config.entities.map((e) => e.entity));

  const lightIds = new Set(config.lights.map((l) => l.id));
  const acIds = new Set(config.acs.map((a) => a.id));
  config.scenes.forEach((s) => {
    if (s.run != null) {
      need(isEntityId(s.run) && RUN_DOMAINS.has(domainOf(s.run)), `Scene "${s.id}": "run" may only be a script.* or scene.* entity, not "${s.run}"`);
      exists(s.run, `Scene "${s.id}"`);
    }
    // Bulk actions reach plan lights and ACs only, never a sensitive device.
    for (const key of Object.keys(s.lights)) {
      if (key === '*' || lightIds.has(key)) continue;
      need(!isSensitive(key) && !entityIds.has(key), `Scene "${s.id}" cannot change "${key}": scenes only switch the plan's lights`);
      warnings.push(`Scene "${s.id}" refers to unknown light "${key}"`);
    }
    for (const key of Object.keys(s.acs)) {
      if (key === '*' || acIds.has(key)) continue;
      need(!isSensitive(key) && !entityIds.has(key), `Scene "${s.id}" cannot change "${key}": scenes only set the plan's ACs`);
      warnings.push(`Scene "${s.id}" refers to unknown AC "${key}"`);
    }
  });

  return { config, warnings };
}

/** Every Home Assistant entity a plan refers to. */
export function linkedEntities(config) {
  return [
    ...config.lights.map(haLink), ...config.acs.map(haLink),
    ...config.acs.map((a) => (a.sensor?.service === 'homeassistant' ? a.sensor.id : null)),
    ...(config.entities || []).map((e) => e.entity),
  ].filter(Boolean);
}

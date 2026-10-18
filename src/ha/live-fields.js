// The plan fields that make the model show what the house is doing (all optional): sensors on
// doors and windows, locks, garage doors, occupancy, people, room temperatures, spinning fans,
// TVs that are on and power readings. Checked here and copied onto the normalised config.
import { ConfigError } from '../../upstream/config.js';
import { domainOf } from './sensitive.js';

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const COLOR = /^#[0-9a-f]{6}$/i;
export const OPENING_TYPES = ['door', 'window', 'open', 'garage'];
export const SCREEN_FURNITURE = ['tv', 'mediaWall'];

function need(cond, msg) {
  if (!cond) throw new ConfigError(msg);
}

/** An optional entity of one domain (or several). Returns it, or null. */
function entityOf(what, field, value, domains, exists) {
  if (value == null) return null;
  const list = [].concat(domains);
  need(typeof value === 'string' && ENTITY_ID.test(value) && list.includes(domainOf(value)),
    `${what} needs "${field}" to be a ${list.map((d) => `${d}.*`).join(' or ')} entity, not "${value}"`);
  exists(value, `${what} ${field}`);
  return value;
}

export function applyLiveFields(raw, config, { exists = () => {} } = {}) {
  // Openings: a contact sensor, a lock, and garage doors with their cover.
  config.openings.forEach((o, i) => {
    const r = raw.openings[i];
    const what = `Opening #${i + 1} (${o.type})`;
    need(OPENING_TYPES.includes(o.type), `${what} has unknown type "${o.type}" (use ${OPENING_TYPES.join(', ')})`);
    o.contact = entityOf(what, 'contact', r.contact, 'binary_sensor', exists);
    o.lock = entityOf(what, 'lock', r.lock, 'lock', exists);
    o.cover = entityOf(what, 'cover', r.cover, 'cover', exists);
    need(o.type !== 'garage' || o.cover, `${what} needs "cover": the cover.* entity of the garage door`);
    need(o.type === 'garage' || !o.cover, `${what}: "cover" is only for "type": "garage"`);
    need(!o.lock || o.type === 'door' || o.type === 'garage', `${what}: "lock" is only for doors`);
  });

  // Rooms: occupancy sensors and a temperature.
  config.rooms.forEach((room, i) => {
    const r = raw.rooms[i];
    const what = `Room "${room.id}"`;
    const occ = r.occupancy == null ? [] : [].concat(r.occupancy);
    need(occ.length || r.occupancy == null, `${what} has an empty "occupancy" list`);
    room.occupancy = occ.map((e) => entityOf(what, 'occupancy', e, 'binary_sensor', exists));
    room.temperature = entityOf(what, 'temperature', r.temperature, 'sensor', exists);
  });

  // Lights: what spins a fan's blades and whether it has a bowl (type "fan" only), a power sensor.
  config.lights.forEach((l, i) => {
    const r = raw.lights[i];
    const what = `Light "${l.id}"`;
    need(r.bowl == null || typeof r.bowl === 'boolean', `${what} has a "bowl" that is not true or false`);
    need(r.bowl == null || l.type === 'fan', `${what}: "bowl" is only for lights of type "fan"`);
    need(r.spin == null || l.type === 'fan', `${what}: "spin" is only for lights of type "fan"`);
    // `spin`: a fan.* entity, or "light" (the light's own entity runs the fan); `fan` is the older name.
    const fan = entityOf(what, 'fan', r.fan, 'fan', exists);
    need(!fan || l.type === 'fan', `${what}: "fan" is only for lights of type "fan"`);
    let spin = null;
    if (r.spin === 'light') spin = 'light';
    else if (r.spin != null) {
      need(typeof r.spin === 'string' && ENTITY_ID.test(r.spin) && domainOf(r.spin) === 'fan',
        `${what} needs "spin" to be "light" or a fan.* entity, not "${r.spin}"`);
      exists(r.spin, `${what} spin`);
      spin = r.spin;
    }
    need(!(spin && fan && spin !== fan), `${what} has both "spin" and "fan": keep "spin" only`);
    l.spin = spin ?? fan;
    l.fan = l.spin && l.spin !== 'light' ? l.spin : null;
    if (l.type === 'fan') {
      l.bowl = r.bowl ?? true;
      if (!l.bowl) l.tileIcon = 'fan'; // a fan without a light kit: a fan on its tile, never a lamp or plug
    }
    l.power = entityOf(what, 'power', r.power, 'sensor', exists);
  });

  // Entities: a fan.* entity spins its icon; "fan" can point to another one.
  for (const e of config.entities) {
    const what = `Entity "${e.id}"`;
    e.fan = entityOf(what, 'fan', e.fan, 'fan', exists) || (domainOf(e.entity) === 'fan' ? e.entity : null);
  }

  // TVs: the furniture's screen shows a media player.
  config.furniture = config.furniture.map((f, i) => {
    if (f.entity == null) return f;
    const what = `Furniture #${i + 1} (${f.type})`;
    need(SCREEN_FURNITURE.includes(f.type), `${what}: "entity" is only for ${SCREEN_FURNITURE.join(' and ')}`);
    return { ...f, entity: entityOf(what, 'entity', f.entity, 'media_player', exists) };
  });

  // People: who is in which room.
  need(raw.people == null || Array.isArray(raw.people), '"people" must be a list');
  const names = new Set();
  config.people = (raw.people || []).map((p, i) => {
    const what = `Person "${p?.name ?? `#${i + 1}`}"`;
    need(p && typeof p === 'object', `Person #${i + 1} must be an object`);
    need(typeof p.name === 'string' && p.name.trim(), `Person #${i + 1} needs a "name"`);
    need(!names.has(p.name), `Two people are called "${p.name}"`);
    names.add(p.name);
    need(typeof p.entity === 'string' && ENTITY_ID.test(p.entity), `${what} needs "entity": an entity whose state is the area they are in`);
    exists(p.entity, what);
    need(p.color == null || COLOR.test(p.color), `${what} has a "color" that is not "#rrggbb"`);
    return { name: p.name.trim(), entity: p.entity, color: p.color || '#7ac8ff' };
  });
  return config;
}

/** Every entity the live fields refer to (their state changes redraw the card). */
export function liveEntities(config) {
  return [
    ...config.openings.flatMap((o) => [o.contact, o.lock, o.cover]),
    ...config.rooms.flatMap((r) => [...r.occupancy, r.temperature]),
    ...config.lights.flatMap((l) => [l.fan, l.power]),
    ...config.entities.map((e) => e.fan),
    ...config.furniture.map((f) => f.entity),
    ...config.people.map((p) => p.entity),
  ].filter(Boolean);
}

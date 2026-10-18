// Floors (storeys) of a plan: `floors` at the top level, `storey` on rooms, openings and furniture.
// A plan without `floors` has one implicit floor and renders exactly as before. Rooms on different
// floors may overlap in x/z: each floor is drawn as its own house (upstream's buildHouse).
import { ConfigError } from '../../upstream/config.js';
import { hasIcon } from '../../upstream/ui/icons.js';
import { domainOf, RUN_DOMAINS } from './sensitive.js';
import { normalizeActiveWhen } from './conditions.js';

export const IMPLICIT_FLOOR = '_home';
export const BUILTIN_ACTIONS = ['all_on', 'all_off'];
/** What a floor button's `toggle` may switch: Home Assistant helpers only. */
export const TOGGLE_DOMAINS = new Set(['input_boolean']);
const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** What a floor with no `actions` offers: All on and All off for its own lights. */
export const DEFAULT_ACTIONS = [
  { id: 'all_on', name: 'All on', icon: 'sun', builtin: 'all_on', run: null, toggle: null, confirmation: null },
  { id: 'all_off', name: 'All off', icon: 'moon', builtin: 'all_off', run: null, toggle: null, confirmation: null },
];

function need(cond, msg) {
  if (!cond) throw new ConfigError(msg);
}

function normalizeAction(a, i, floor, exists) {
  const what = `Floor "${floor}" action "${a?.id ?? `#${i + 1}`}"`;
  need(a && typeof a === 'object', `Floor "${floor}" action #${i + 1} must be an object`);
  need(typeof a.id === 'string' && a.id, `Floor "${floor}" action #${i + 1} is missing an "id"`);
  need(a.icon == null || (typeof a.icon === 'string' && hasIcon(a.icon)), `${what} has unknown icon "${a.icon}"`);
  need(a.run !== '', `${what} has no script or scene to run yet`);
  need(a.toggle !== '', `${what} has no helper to toggle yet`);
  const hasRun = a.run != null;
  const hasBuiltin = a.builtin != null && a.builtin !== '';
  const hasToggle = a.toggle != null;
  const kinds = [hasRun, hasBuiltin, hasToggle].filter(Boolean).length;
  need(kinds === 1, `${what} needs exactly one of "run" (a script or scene), "builtin" (${BUILTIN_ACTIONS.join(' or ')}) or "toggle" (an input_boolean), not ${kinds ? 'several' : 'none'}`);
  if (hasRun) {
    need(typeof a.run === 'string' && ENTITY_ID.test(a.run) && RUN_DOMAINS.has(domainOf(a.run)),
      `${what}: "run" may only be a script.* or scene.* entity, not "${a.run}"`);
    exists(a.run, what);
  } else if (hasToggle) {
    need(typeof a.toggle === 'string' && ENTITY_ID.test(a.toggle) && TOGGLE_DOMAINS.has(domainOf(a.toggle)),
      `${what}: "toggle" may only be an input_boolean.* helper, not "${a.toggle}"`);
    exists(a.toggle, what);
  } else {
    need(BUILTIN_ACTIONS.includes(a.builtin), `${what} has unknown "builtin" "${a.builtin}" (use ${BUILTIN_ACTIONS.join(' or ')})`);
  }
  // A helper's button is active while it is on, unless active_when says otherwise.
  const activeWhen = normalizeActiveWhen(what, a.active_when, { hasRun: hasRun || hasToggle, exists })
    ?? (hasToggle ? [{ entity: a.toggle, state: 'on' }] : null);
  return {
    ...a,
    name: a.name || a.id,
    icon: a.icon || (hasToggle ? 'switch' : a.builtin === 'all_off' ? 'moon' : 'sun'),
    run: hasRun ? a.run : null,
    builtin: hasBuiltin ? a.builtin : null,
    toggle: hasToggle ? a.toggle : null,
    confirmation: normalizeConfirmation(what, a.confirmation),
    activeWhen,
  };
}

/** `confirmation`: true or { "text": "..." }. Returns { text } (null: the default text) or null. */
export function normalizeConfirmation(what, value) {
  if (value == null || value === false) return null;
  if (value === true) return { text: null };
  need(typeof value === 'object' && !Array.isArray(value), `${what}: "confirmation" must be true or { "text": "..." }`);
  need(value.text == null || (typeof value.text === 'string' && value.text.trim()), `${what}: "confirmation" needs "text" to be some text`);
  return { text: value.text?.trim() || null };
}

/** What the confirmation sheet asks: the plan's text, else "Run <name>?". */
export const confirmationText = (action) => action.confirmation?.text || `Run ${action.name}?`;

/** The floors whose rooms have a wall on the line of `opening` covering its midpoint. */
function floorsOfOpening(o, rooms) {
  const alongX = o.from[1] === o.to[1];
  const c = alongX ? o.from[1] : o.from[0];
  const mid = alongX ? (o.from[0] + o.to[0]) / 2 : (o.from[1] + o.to[1]) / 2;
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const hits = rooms.filter((r) => (alongX
    ? (near(r.z, c) || near(r.z + r.d, c)) && r.x < mid && mid < r.x + r.w
    : (near(r.x, c) || near(r.x + r.w, c)) && r.z < mid && mid < r.z + r.d));
  return [...new Set(hits.map((r) => r.storey))];
}

function floorsOfPoint([x, z], rooms) {
  const hits = rooms.filter((r) => r.x <= x && x <= r.x + r.w && r.z <= z && z <= r.z + r.d);
  return [...new Set(hits.map((r) => r.storey))];
}

const boundsOf = (rooms) => ({
  minX: Math.min(...rooms.map((r) => r.x)),
  minZ: Math.min(...rooms.map((r) => r.z)),
  maxX: Math.max(...rooms.map((r) => r.x + r.w)),
  maxZ: Math.max(...rooms.map((r) => r.z + r.d)),
});

/**
 * Adds `floors` (sorted by level, always at least one) to an upstream-normalised config, and a
 * `storey` to every room, opening and furniture item. `raw` is the plan as written.
 */
export function applyFloors(raw, config, { exists = () => {} } = {}) {
  const explicit = raw.floors != null;
  if (!explicit) {
    config.rooms.forEach((r, i) => need(raw.rooms[i].storey == null,
      `Room "${r.id}" has a "storey" but the plan has no "floors"`));
    for (const r of config.rooms) r.storey = IMPLICIT_FLOOR;
    for (const o of config.openings) o.storey = IMPLICIT_FLOOR;
    config.furniture = config.furniture.map((f) => ({ ...f, storey: IMPLICIT_FLOOR }));
    config.floors = [{
      id: IMPLICIT_FLOOR, name: config.name, level: 0, height: config.wallHeight, actions: DEFAULT_ACTIONS,
      implicit: true, bounds: config.bounds,
    }];
    config.multiFloor = false;
    return config;
  }

  need(Array.isArray(raw.floors) && raw.floors.length > 0, '"floors" must be a list with at least one floor');
  const ids = new Set();
  const floors = raw.floors.map((f, i) => {
    need(f && typeof f === 'object', `Floor #${i + 1} must be an object`);
    need(typeof f.id === 'string' && f.id, `Floor #${i + 1} is missing an "id"`);
    need(!ids.has(f.id), `Duplicate floor id "${f.id}"`);
    ids.add(f.id);
    need(f.level == null || Number.isFinite(f.level), `Floor "${f.id}" has a "level" that is not a number`);
    need(f.height == null || (Number.isFinite(f.height) && f.height > 0), `Floor "${f.id}" has a "height" that is not a positive number`);
    need(f.actions == null || Array.isArray(f.actions), `Floor "${f.id}": "actions" must be a list`);
    const actionIds = new Set();
    const actions = (f.actions || []).map((a, k) => {
      const out = normalizeAction(a, k, f.id, exists);
      need(!actionIds.has(out.id), `Floor "${f.id}" has two actions with id "${out.id}"`);
      actionIds.add(out.id);
      return out;
    });
    return {
      id: f.id, name: f.name || f.id, level: f.level ?? i, height: f.height ?? config.wallHeight,
      actions: actions.length ? actions : DEFAULT_ACTIONS, order: i, implicit: false,
    };
  });
  // Stable: floors on the same level keep the plan's order.
  floors.sort((a, b) => a.level - b.level || a.order - b.order);

  config.rooms.forEach((r, i) => {
    const storey = raw.rooms[i].storey;
    need(storey != null, `Room "${r.id}" needs a "storey": one of the plan's floors (${[...ids].join(', ')})`);
    need(ids.has(storey), `Room "${r.id}" is on unknown floor "${storey}"`);
    r.storey = storey;
  });

  const place = (what, given, candidates) => {
    if (given != null) {
      need(ids.has(given), `${what} is on unknown floor "${given}"`);
      return given;
    }
    // Where floors overlap, the first of them in the plan's "floors" list: set "storey" for the others.
    const order = raw.floors.map((f) => f.id);
    return [...candidates].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? order[0];
  };
  config.openings.forEach((o, i) => {
    o.storey = place(`Opening #${i + 1}`, raw.openings[i].storey, floorsOfOpening(o, config.rooms));
  });
  config.furniture = config.furniture.map((f, i) => ({
    ...f,
    storey: place(`Furniture #${i + 1} (${f.type})`, f.storey, Array.isArray(f.pos) ? floorsOfPoint(f.pos, config.rooms) : []),
  }));

  for (const f of floors) {
    const rooms = config.rooms.filter((r) => r.storey === f.id);
    // An empty floor (just added in the editor) borrows the house's footprint.
    f.bounds = rooms.length ? boundsOf(rooms) : config.bounds;
  }
  config.floors = floors;
  config.multiFloor = floors.length > 1;
  return config;
}

/** The floor id of every room. */
export const floorOfRoom = (config) => new Map(config.rooms.map((r) => [r.id, r.storey]));

/** The part of a config upstream's buildHouse and buildFurniture should draw for one floor. */
export function floorView(config, floorId) {
  const floor = config.floors.find((f) => f.id === floorId);
  return {
    ...config,
    wallHeight: floor.height,
    interiorWallHeight: Math.min(config.interiorWallHeight, floor.height),
    rooms: config.rooms.filter((r) => r.storey === floorId),
    openings: config.openings.filter((o) => o.storey === floorId),
    furniture: config.furniture.filter((f) => f.storey === floorId),
    bounds: floor.bounds,
  };
}

/** The floor shown first: the one on level 0, else the lowest one above ground, else the first. */
export function defaultFloor(config) {
  const f = config.floors;
  return (f.find((x) => x.level === 0) || f.find((x) => x.level > 0) || f[0]).id;
}

/**
 * The plan lights a built-in floor action may switch: the floor's own lights, and of those only
 * the ones that are simulated or linked to a bulk domain (never a sensitive device).
 */
export function floorLights(config, floorId, { haLink, canBulk }) {
  const floorOf = floorOfRoom(config);
  return config.lights.filter((l) => floorOf.get(l.room) === floorId && (!haLink(l) || canBulk(haLink(l))));
}

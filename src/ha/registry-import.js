// "Import from Home Assistant…" in the plan editor: a first plan (or the missing pieces of the
// current one) from Home Assistant's floors, areas, devices and entities. Nothing is saved here:
// the editor's own Save does that. The plan builder is pure, so it is unit-tested on its own.
import { domainOf, isSensitive } from './sensitive.js';
import { defaultIcon } from './mapping.js';

/* ---------- reading the registry ---------- */

const values = (o) => (o && typeof o === 'object' ? Object.values(o) : null);

/**
 * Floors, areas, devices and entities, as plain lists. `hass.floors` / `areas` / `devices` /
 * `entities` (Home Assistant's frontend, src/types.ts) when they are there, otherwise the registry
 * websocket commands the frontend itself uses.
 */
export async function readRegistry(hass) {
  const ws = (type) => hass.callWS({ type });
  const floors = values(hass.floors) ?? await ws('config/floor_registry/list').catch(() => []);
  const areas = values(hass.areas) ?? await ws('config/area_registry/list');
  const devices = values(hass.devices) ?? await ws('config/device_registry/list');
  let entities = values(hass.entities);
  if (!entities) {
    // list_for_display answers with short keys (src/data/entity/entity_registry.ts)
    const res = await ws('config/entity_registry/list_for_display');
    entities = (res?.entities || []).map((e) => ({
      entity_id: e.ei, device_id: e.di, area_id: e.ai, name: e.en, hidden: e.hb,
      entity_category: e.ec != null ? res.entity_categories?.[e.ec] ?? 'other' : undefined,
    }));
  }
  return { floors, areas, devices, entities };
}

/* ---------- the proposal ---------- */

const ROOM_W = 4;
const ROOM_D = 3.5;
const GAP = 0.5;
const LAMP_WORDS = /\b(lamps?|lights?|lighting|bulbs?|sconces?|lanterns?|chandeliers?|pendants?|strips?|led|leds|spots?|downlights?)\b/i;
const DEVICE_DOMAINS = ['climate', 'media_player', 'fan', 'lock', 'cover'];

const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';
const round = (v) => Math.round(v * 100) / 100;

function unique(base, taken) {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  taken.add(id);
  return id;
}

/** Where the next rooms of a floor go: a grid to the right of what the floor already has. */
function gridPlacer(existingRects) {
  const right = existingRects.length ? Math.max(...existingRects.map((r) => r[0] + r[2])) + 1 : 0;
  const top = existingRects.length ? Math.min(...existingRects.map((r) => r[1])) : 0;
  return (index, count) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return [round(right + col * (ROOM_W + GAP)), round(top + row * (ROOM_D + GAP)), ROOM_W, ROOM_D];
  };
}

/** Spots for `n` things inside a room's rect: an even grid, clear of the walls. */
function spots([x, z, w, d], n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / d)));
  const rows = Math.max(1, Math.ceil(n / cols));
  return Array.from({ length: n }, (_, i) => [
    round(x + 0.5 + ((w - 1) * ((i % cols) + 0.5)) / cols),
    round(z + 0.5 + ((d - 1) * (Math.floor(i / cols) + 0.5)) / rows),
  ]);
}

const nameOf = (entity, states, devices) => {
  const st = states?.[entity.entity_id];
  return entity.name || st?.attributes?.friendly_name || devices.get(entity.device_id)?.name_by_user
    || devices.get(entity.device_id)?.name || entity.entity_id.split('.')[1].replace(/_/g, ' ');
};

/**
 * What an import would add. `plan` is the current plan (merge) or null (a new plan). Returns
 * { floors, rooms, lights, switches, devices }: lists of items, each with `include` (ticked or not)
 * and what it becomes in the plan. Items already in `plan` (same entity, same area) are left out.
 */
export function buildFromRegistry(registry, { states = {}, plan = null } = {}) {
  const devices = new Map(registry.devices.map((d) => [d.id, d]));
  const areas = [...registry.areas].sort((a, b) => a.name.localeCompare(b.name));
  const haFloors = [...(registry.floors || [])].sort((a, b) => (a.level ?? 999) - (b.level ?? 999) || a.name.localeCompare(b.name));
  const ids = new Set([...(plan?.rooms || []), ...(plan?.lights || []), ...(plan?.acs || []), ...(plan?.entities || [])].map((x) => x.id));
  const floorIds = new Set((plan?.floors || []).map((f) => f.id));
  const known = new Set([
    ...(plan?.lights || []).map((l) => l.link?.id).filter(Boolean),
    ...(plan?.acs || []).map((a) => a.link?.id).filter(Boolean),
    ...(plan?.entities || []).map((e) => e.entity),
  ]);

  // Floors: one per Home Assistant floor (by level), plus "Other areas" for areas on none.
  const floors = [];
  const floorFor = new Map(); // HA floor id (or null) -> plan floor id
  const usedFloors = new Set(areas.map((a) => a.floor_id ?? null));
  const multi = haFloors.length > 0;
  for (const f of haFloors) {
    if (!usedFloors.has(f.floor_id)) continue;
    const match = plan?.floors?.find((p) => p.id === f.floor_id || p.name?.toLowerCase() === f.name.toLowerCase());
    if (match) { floorFor.set(f.floor_id, match.id); continue; }
    const id = unique(slug(f.floor_id), floorIds);
    floors.push({ include: true, id, name: f.name, level: f.level ?? floors.length, haFloor: f.floor_id });
    floorFor.set(f.floor_id, id);
  }
  if (multi && usedFloors.has(null)) {
    const id = unique('other_areas', floorIds);
    floors.push({ include: true, id, name: 'Other areas', level: Math.max(0, ...haFloors.map((f) => (f.level ?? 0) + 1)), haFloor: null });
    floorFor.set(null, id);
  }

  // Rooms: one per area, in a grid on its floor; an area the plan already has keeps its room.
  const rooms = [];
  const roomFor = new Map(); // area id -> { id, rect, existing }
  const placers = new Map();
  const perFloor = new Map();
  for (const a of areas) {
    const existing = plan?.rooms?.find((r) => r.area === a.area_id) || plan?.rooms?.find((r) => !r.area && r.name?.toLowerCase() === a.name.toLowerCase());
    if (existing) { roomFor.set(a.area_id, { id: existing.id, rect: existing.rect, existing: true }); continue; }
    const storey = multi ? floorFor.get(a.floor_id ?? null) : null;
    perFloor.set(storey, (perFloor.get(storey) || 0) + 1);
  }
  const placed = new Map();
  for (const a of areas) {
    if (roomFor.has(a.area_id)) continue;
    const storey = multi ? floorFor.get(a.floor_id ?? null) : null;
    if (!placers.has(storey)) {
      const onFloor = (plan?.rooms || []).filter((r) => !storey || r.storey === storey || (!plan?.floors && !r.storey));
      placers.set(storey, gridPlacer(onFloor.map((r) => r.rect)));
    }
    const index = placed.get(storey) || 0;
    placed.set(storey, index + 1);
    const rect = placers.get(storey)(index, perFloor.get(storey));
    const room = { include: true, id: unique(slug(a.area_id), ids), name: a.name, rect, floor: 'oak', area: a.area_id };
    if (storey) room.storey = storey;
    rooms.push(room);
    roomFor.set(a.area_id, { id: room.id, rect, existing: false });
  }

  // What stands in each area: lights, lamp-like switches, and a few kinds of devices.
  const areaOf = (e) => e.area_id || devices.get(e.device_id)?.area_id || null;
  const byArea = new Map();
  for (const e of registry.entities) {
    if (e.hidden || e.entity_category || known.has(e.entity_id)) continue;
    const area = areaOf(e);
    if (!area || !roomFor.has(area)) continue;
    const domain = domainOf(e.entity_id);
    const dev = devices.get(e.device_id);
    let kind = null;
    if (domain === 'light') kind = 'light';
    else if (domain === 'switch' && LAMP_WORDS.test(`${e.name || ''} ${dev?.name_by_user || ''} ${dev?.name || ''} ${states[e.entity_id]?.attributes?.friendly_name || ''} ${e.entity_id.replace(/_/g, ' ')}`)) kind = 'switch';
    else if (DEVICE_DOMAINS.includes(domain)) kind = 'device';
    if (!kind) continue;
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push({ e, kind });
  }

  const lights = [];
  const switches = [];
  const devs = [];
  for (const [area, list] of byArea) {
    const room = roomFor.get(area);
    const where = spots(room.rect, list.length);
    list.sort((p, q) => p.e.entity_id.localeCompare(q.e.entity_id)).forEach(({ e, kind }, i) => {
      const name = nameOf(e, states, devices);
      const base = `${room.id}.${slug(e.entity_id.split('.')[1])}`;
      if (kind === 'device') {
        devs.push({
          include: false, id: unique(base, ids), name, room: room.id, entity: e.entity_id, pos: where[i], y: 1.2,
          icon: defaultIcon(e.entity_id, states[e.entity_id]), sensitive: isSensitive(e.entity_id),
        });
      } else {
        (kind === 'light' ? lights : switches).push({
          include: kind === 'light', id: unique(base, ids), name, room: room.id, type: kind === 'light' ? 'ceiling' : 'floor',
          pos: where[i], link: { service: 'homeassistant', id: e.entity_id },
        });
      }
    });
  }
  return { floors, rooms, lights, switches, devices: devs };
}

/* ---------- applying it ---------- */

const strip = ({ include, haFloor, sensitive, ...rest }) => rest;

/**
 * The plan with the ticked parts of `proposal` added (`mode` "merge"), or a new plan made of them
 * (`mode` "new"). Items in a room that is not ticked are left out. Returns a new plan object.
 */
export function applyImport(plan, proposal, { mode = 'merge', name = 'Home' } = {}) {
  const base = mode === 'new' || !plan
    ? { name: plan?.name || name, rooms: [], lights: [], acs: [], entities: [], furniture: [], openings: [], scenes: [] }
    : structuredClone(plan);
  for (const key of ['rooms', 'lights', 'acs', 'entities', 'furniture', 'openings', 'scenes']) base[key] ||= [];
  const rooms = proposal.rooms.filter((r) => r.include);
  const keptRooms = new Set([...base.rooms.map((r) => r.id), ...rooms.map((r) => r.id)]);
  const newFloors = proposal.floors.filter((f) => f.include && rooms.some((r) => r.storey === f.id));

  // A plan without floors that gets some: its own rooms go on a "Main" floor first.
  if (newFloors.length && !base.floors?.length) {
    if (base.rooms.length) {
      const main = { id: 'main', name: 'Main', level: 0 };
      base.floors = [main];
      for (const r of base.rooms) r.storey = main.id;
    } else base.floors = [];
  }
  if (newFloors.length) base.floors.push(...newFloors.map(strip));
  // Rooms imported onto no floor in a plan that has floors: the first one.
  for (const r of rooms) {
    const room = strip(r);
    if (base.floors?.length && !room.storey) room.storey = base.floors[0].id;
    if (!base.floors?.length) delete room.storey;
    base.rooms.push(room);
  }
  const inRoom = (x) => x.include && keptRooms.has(x.room);
  base.lights.push(...[...proposal.lights, ...proposal.switches].filter(inRoom).map(strip));
  base.entities.push(...proposal.devices.filter(inRoom).map((d) => ({ ...strip(d), tap_action: { action: 'more-info' } })));
  if (base.floors && !base.floors.length) delete base.floors;
  return base;
}

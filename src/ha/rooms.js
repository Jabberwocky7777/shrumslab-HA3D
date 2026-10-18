// Room fields of this card: `area` (one Home Assistant area or a list of them) and `part_of` (a
// room drawn as several rectangles: the parts join their parent). Pure: no DOM, unit tested.
import { ConfigError } from '../../upstream/config.js';

function need(cond, msg) {
  if (!cond) throw new ConfigError(msg);
}

/** Checks `area` and `part_of` and copies them onto the normalised rooms (after applyFloors). */
export function applyRoomFields(raw, config) {
  const byId = new Map(config.rooms.map((r) => [r.id, r]));
  config.rooms.forEach((room, i) => {
    const r = raw.rooms[i];
    const what = `Room "${room.id}"`;
    // ha3d: the Home Assistant area(s) the room stands for: area ids or area names
    const areas = r.area == null ? [] : [].concat(r.area);
    need(r.area == null || areas.length > 0, `${what} has an empty "area" list`);
    areas.forEach((a) => need(typeof a === 'string' && a.trim(), `${what} has an "area" that is not an area id or name`));
    room.areas = areas.map((a) => a.trim());
    room.area = room.areas[0] ?? null;
    room.partOf = r.part_of ?? null;
  });
  for (const room of config.rooms) {
    if (room.partOf == null) continue;
    const what = `Room "${room.id}"`;
    need(typeof room.partOf === 'string' && room.partOf, `${what} has a "part_of" that is not a room id`);
    need(room.partOf !== room.id, `${what} cannot be "part_of" itself`);
    const parent = byId.get(room.partOf);
    need(parent, `${what} is "part_of" unknown room "${room.partOf}"`);
    need(parent.partOf == null, `${what} is "part_of" "${parent.id}", which is itself a part of "${parent.partOf}": name the main room instead`);
    need(parent.storey === room.storey, `${what} is on floor "${room.storey}" but its main room "${parent.id}" is on "${parent.storey}"`);
  }
  return config;
}

/** The room a room id stands for in the card: a part's parent, else itself. */
export function roomGroups(rooms) {
  const parentOf = new Map(rooms.filter((r) => r.partOf).map((r) => [r.id, r.partOf]));
  return (id) => parentOf.get(id) ?? id;
}

/** The biggest rectangle of a room and its parts (where people stand). */
export function largestRect(rooms, id) {
  return rooms.filter((r) => r.id === id || r.partOf === id).reduce((a, b) => (b.w * b.d > a.w * a.d ? b : a));
}

const lower = (s) => String(s).trim().toLowerCase();

/**
 * Every lower-case string an area entry stands for: the entry itself and, with Home Assistant's
 * area registry (`hass.areas`: { id: { area_id, name } }), the area's id and name.
 */
export function areaAliases(entries, areas = null) {
  const out = new Set(entries.map(lower));
  const list = areas ? Object.values(areas) : [];
  for (const e of entries) {
    const k = lower(e);
    for (const a of list) {
      if (lower(a.area_id ?? '') === k || lower(a.name ?? '') === k) {
        if (a.area_id) out.add(lower(a.area_id));
        if (a.name) out.add(lower(a.name));
      }
    }
  }
  return out;
}

/**
 * The room an area (a person's state, an imported area) is in: one whose `area` entries match it,
 * else one whose name or id does. Case-insensitive. A part counts as its main room.
 */
export function roomOfArea(rooms, value, areas = null) {
  if (value == null || value === '') return null;
  const k = lower(value);
  const parentOf = roomGroups(rooms);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const hit = rooms.find((r) => r.areas?.length && areaAliases(r.areas, areas).has(k))
    || rooms.find((r) => lower(r.name) === k || lower(r.id) === k);
  return hit ? byId.get(parentOf(hit.id)) : null;
}

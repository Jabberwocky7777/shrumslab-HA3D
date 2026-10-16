// Floors in the plan editor (upstream/editor/editor.js calls these through its `floors` option):
// which floor the 2D plan shows, the Floors section of the item list, the floor inspector with
// its action buttons, and moving rooms between floors. Works on the plan as written (rect arrays).
import { h } from '../../upstream/ui/dom.js';
import { icon, hasIcon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';

// Icons offered for floor buttons (all in upstream/ui/icons.js).
export const ACTION_ICONS = ['sun', 'moon', 'power', 'bright', 'dim', 'film', 'tv', 'sofa', 'bed', 'door', 'home', 'sparkles', 'music', 'coffee', 'fan', 'table']
  .filter(hasIcon);

const inRect = ([x, z], [rx, rz, rw, rd]) => x >= rx && x <= rx + rw && z >= rz && z <= rz + rd;
const near = (a, b) => Math.abs(a - b) < 1e-3;

/** The floor of a room, or null when the plan has no floors. */
export function roomFloor(doc, roomId) {
  if (!doc.floors?.length) return null;
  return doc.rooms.find((r) => r.id === roomId)?.storey ?? null;
}

// Furniture and openings without a "storey": the first floor in the list whose rooms hold them
// (the rule of src/ha/floors.js).
function firstFloorOf(doc, rooms) {
  const ids = new Set(rooms.map((r) => r.storey));
  return doc.floors.find((f) => ids.has(f.id))?.id ?? doc.floors[0].id;
}

/** The floor an item of the editor is drawn on, or null (shown on every floor). */
export function itemFloor(doc, kind, item) {
  if (!doc.floors?.length || !item) return null;
  if (kind === 'room') return item.storey ?? null;
  if (kind === 'light' || kind === 'ac' || kind === 'entity') return roomFloor(doc, item.room);
  if (kind === 'furniture') {
    if (item.storey) return item.storey;
    return Array.isArray(item.pos) ? firstFloorOf(doc, doc.rooms.filter((r) => inRect(item.pos, r.rect))) : doc.floors[0].id;
  }
  if (kind === 'opening') {
    if (item.storey) return item.storey;
    const alongX = item.from[1] === item.to[1];
    const c = alongX ? item.from[1] : item.from[0];
    const mid = alongX ? (item.from[0] + item.to[0]) / 2 : (item.from[1] + item.to[1]) / 2;
    return firstFloorOf(doc, doc.rooms.filter(({ rect: [x, z, w, d] }) => (alongX
      ? (near(z, c) || near(z + d, c)) && x < mid && mid < x + w
      : (near(x, c) || near(x + w, c)) && z < mid && mid < z + d)));
  }
  return null; // scenes, floors: not on the plan
}

const uniqueFloorId = (doc, base) => {
  const ids = new Set((doc.floors || []).map((f) => f.id));
  if (!ids.has(base)) return base;
  for (let i = 2; ; i++) if (!ids.has(`${base}${i}`)) return `${base}${i}`;
};

/**
 * Adds a floor. A plan without floors first gets a "Main" floor holding everything it has,
 * so a second one can be added next to it. Returns the new floor.
 */
export function addFloor(doc) {
  if (!doc.floors?.length) {
    doc.floors = [{ id: 'main', name: 'Main', level: 0 }];
    for (const r of doc.rooms) r.storey = 'main';
  }
  const top = Math.max(...doc.floors.map((f, i) => f.level ?? i));
  const floor = { id: uniqueFloorId(doc, 'floor'), name: `Floor ${doc.floors.length + 1}`, level: top + 1 };
  doc.floors.push(floor);
  return floor;
}

/**
 * Removes floor `index`. Only an empty floor can go; removing the last floor turns the plan back
 * into one without floors. Returns an error message, or null when it was removed.
 */
export function removeFloor(doc, index) {
  const floor = doc.floors?.[index];
  if (!floor) return null;
  if (doc.floors.length === 1) {
    delete doc.floors;
    for (const list of [doc.rooms, doc.furniture, doc.openings]) for (const x of list || []) delete x.storey;
    return null;
  }
  const rooms = doc.rooms.filter((r) => r.storey === floor.id);
  if (rooms.length) return `Move or remove its ${rooms.length === 1 ? 'room' : `${rooms.length} rooms`} first`;
  doc.floors.splice(index, 1);
  for (const list of [doc.furniture, doc.openings]) for (const x of list || []) if (x.storey === floor.id) delete x.storey;
  return null;
}

/** Moves a room to another floor; the furniture in it and the openings on its walls go along. */
export function moveRoom(doc, room, floorId) {
  const from = room.storey;
  if (from === floorId) return;
  const inside = (p) => inRect(p, room.rect);
  for (const f of doc.furniture || []) {
    if (Array.isArray(f.pos) && inside(f.pos) && itemFloor(doc, 'furniture', f) === from) f.storey = floorId;
  }
  for (const o of doc.openings || []) {
    if (inside(o.from) && inside(o.to) && itemFloor(doc, 'opening', o) === from) o.storey = floorId;
  }
  room.storey = floorId;
}

/** Swaps floor `index` with its neighbour (`step` -1: up the list, +1: down). */
export function moveFloor(doc, index, step) {
  const j = index + step;
  if (!doc.floors || j < 0 || j >= doc.floors.length) return false;
  [doc.floors[index], doc.floors[j]] = [doc.floors[j], doc.floors[index]];
  return true;
}

/**
 * The editor side: `ctx` gives the editor's own form helpers and history
 * ({ bind, text, number, choice, section, row, prop, optional, parseNum, optNum, snapshot, touch, links, linkHooks }).
 */
export function createEditorFloors() {
  return {
    initial: (doc) => (doc.floors?.length ? (doc.floors.find((f) => (f.level ?? 0) === 0) || doc.floors[0]).id : null),
    itemFloor,
    roomFloor,
    addFloor,
    removeFloor,

    /** New furniture and openings are pinned to the floor they were added on. */
    placed(doc, floorId, kind, item) {
      if (!floorId) return;
      if (kind === 'room' || kind === 'furniture' || kind === 'opening') item.storey = floorId;
    },

    rowLabel: (item) => [item.name || item.id, `level ${item.level ?? '–'}${item.height ? ` · ${item.height} m` : ''}`],

    /** The floor chips over the 2D plan; hidden without floors. */
    bar(doc, current, onPick) {
      const el = h('div.e-floors', { role: 'group', 'aria-label': 'Floor shown on the plan' });
      if (!doc.floors?.length || doc.floors.length < 2) { el.hidden = true; return el; }
      const top = [...doc.floors].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
      el.append(...top.map((f) => h(`button.e-floor${f.id === current ? '.active' : ''}`, {
        'data-floor': f.id, onclick: () => { haptic('tick'); onPick(f.id); },
      }, f.name || f.id)));
      return el;
    },

    /** "Floor" on a room's inspector. */
    roomField(doc, room, ctx) {
      if (!doc.floors?.length) return null;
      return ctx.bind('Floor', ctx.choice(doc.floors.map((f) => [f.id, f.name || f.id])), {
        get: () => room.storey,
        set: (v) => moveRoom(doc, room, v),
        event: 'change',
      });
    },

    /** The inspector of a floor: name, level, height, order, and its buttons. */
    inspector(doc, index, ctx, { onRemove }) {
      const floor = doc.floors[index];
      floor.actions ||= [];
      const { bind, text, number, choice, section, row, prop, optional, parseNum, optNum } = ctx;
      const change = (fn) => () => { ctx.snapshot(); fn(); ctx.touch(); };
      const DOES = [['all_on', 'All on (this floor’s lights)'], ['all_off', 'All off (this floor’s lights)'], ['run', 'Run a script or scene']];

      const actionBlock = (a, k) => {
        const does = a.run != null ? 'run' : a.builtin || 'all_on';
        return h('div.e-action', { 'data-action': a.id },
          row(bind('Button', text(), prop(a, 'name', '')),
            bind('Icon', choice(ACTION_ICONS), { ...prop(a, 'icon', 'sun'), event: 'change' })),
          bind('What it does', choice(DOES), {
            get: () => does,
            set: (v) => {
              if (v === 'run') { delete a.builtin; a.run = a.run || ''; } else { delete a.run; a.builtin = v; }
            },
            event: 'change',
          }),
          does === 'run' ? ctx.links.runField(a, ctx.linkHooks, { required: true }) : null,
          h('div.e-action-tools',
            h('button.btn', { 'aria-label': 'Move up', disabled: k === 0, onclick: change(() => floor.actions.splice(k - 1, 0, ...floor.actions.splice(k, 1))) }, icon('up', 14, 2.2)),
            h('button.btn', { 'aria-label': 'Move down', disabled: k === floor.actions.length - 1, onclick: change(() => floor.actions.splice(k + 1, 0, ...floor.actions.splice(k, 1))) }, icon('down', 14, 2.2)),
            h('button.btn.danger', { 'aria-label': `Remove ${a.name || a.id}`, onclick: change(() => floor.actions.splice(k, 1)) }, icon('trash', 14, 2))));
      };
      const addAction = change(() => {
        const ids = new Set(floor.actions.map((a) => a.id));
        let id = 'button';
        for (let i = 2; ids.has(id); i++) id = `button${i}`;
        floor.actions.push({ id, name: 'New button', icon: 'sun', builtin: 'all_on' });
      });

      return [
        section('Floor',
          bind('Name', text(), prop(floor, 'name', '')),
          row(bind('Level (0 = ground)', number(1), { ...prop(floor, 'level', index), parse: parseNum }),
            bind('Wall height, m', number(0.1), { ...optional(floor, 'height'), parse: optNum })),
          h('div.e-action-tools',
            h('button.btn', { disabled: index === 0, onclick: change(() => moveFloor(doc, index, -1)) }, icon('up', 14, 2.2), 'Earlier in list'),
            h('button.btn', { disabled: index === doc.floors.length - 1, onclick: change(() => moveFloor(doc, index, 1)) }, icon('down', 14, 2.2), 'Later in list'),
            h('button.btn.danger', { onclick: onRemove }, icon('trash', 14, 2), doc.floors.length === 1 ? 'Remove floors' : 'Remove floor')),
          h('p.note', 'Floors are shown by level, highest first. Furniture where floors overlap belongs to the first floor in this list unless it was added on another one.')),
        section('Buttons',
          floor.actions.length ? floor.actions.map(actionBlock) : h('p.note', 'No buttons: the floor shows All on and All off for its own lights.'),
          h('button.btn', { onclick: addAction }, icon('plus', 14, 2.4), 'Add a button'),
          h('p.note', 'Buttons only start scripts and scenes, or switch this floor’s lights. Locks, covers and other sensitive devices are never reached.')),
      ];
    },
  };
}

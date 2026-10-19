// A sectional garage door for `type: "garage"` openings: horizontal sections with grooves and
// raised panels, a row of windows in the top one, and, built with the house (so they are merged
// with the floor's static meshes), a trim frame, two ceiling tracks and an opener. Opening, the
// sections ride up the tracks and back under the ceiling one after another.
import * as THREE from 'three';
import { box, mat, at } from '../../upstream/three/kit.js';
import { ConfigError } from '../../upstream/config.js';

export const GARAGE_DEFAULTS = { sections: 4, windows: true, windowCount: null, panels: null, color: '#e9e4d8', opener: true };
const COLOR = /^#[0-9a-f]{6}$/i;
const THICK = 0.045;   // a section's thickness
const TRACK = 2.5;     // how far the tracks run into the garage (less in a shallow one)

function need(cond, msg) {
  if (!cond) throw new ConfigError(msg);
}

/** Checks a garage opening's options and returns them with their defaults. */
export function garageOptions(what, r) {
  const intIn = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  need(r.sections == null || intIn(r.sections, 1, 12), `${what}: "sections" must be a whole number from 1 to 12`);
  need(r.windows == null || typeof r.windows === 'boolean', `${what}: "windows" must be true or false`);
  need(r.windowCount == null || intIn(r.windowCount, 1, 12), `${what}: "windowCount" must be a whole number from 1 to 12`);
  need(r.panels == null || intIn(r.panels, 1, 12), `${what}: "panels" must be a whole number from 1 to 12`);
  need(r.color == null || (typeof r.color === 'string' && COLOR.test(r.color)), `${what}: "color" must be "#rrggbb"`);
  need(r.opener == null || typeof r.opener === 'boolean', `${what}: "opener" must be true or false`);
  const out = {};
  for (const [k, v] of Object.entries(GARAGE_DEFAULTS)) out[k] = r[k] ?? v;
  return out;
}

/**
 * Where a garage door is: the opening's line (from "from" to "to", as src/ha/live.js draws doors),
 * which side the garage is on in the door's own coordinates (`inward`: +1 or -1 along local z),
 * and how deep the garage is that way (for the tracks).
 */
export function garageFrame(o, rooms) {
  const dx = o.to[0] - o.from[0];
  const dz = o.to[1] - o.from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(-dz, dx);
  const alongX = o.from[1] === o.to[1];
  const c = alongX ? o.from[1] : o.from[0];
  const mid = alongX ? (o.from[0] + o.to[0]) / 2 : (o.from[1] + o.to[1]) / 2;
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const touching = rooms.filter((r) => (alongX
    ? (near(r.z, c) || near(r.z + r.d, c)) && r.x < mid && mid < r.x + r.w
    : (near(r.x, c) || near(r.x + r.w, c)) && r.z < mid && mid < r.z + r.d));
  // the garage: the room on the opening (the deeper one, if the opening is between two rooms)
  const depthOf = (r) => (alongX ? r.d : r.w);
  const room = touching.sort((a, b) => depthOf(b) - depthOf(a))[0] || null;
  let nx = 0;
  let nz = 0;
  if (room) {
    if (alongX) nz = room.z + room.d / 2 > c ? 1 : -1;
    else nx = room.x + room.w / 2 > c ? 1 : -1;
  } else if (alongX) nz = -1; else nx = -1;
  // the door's local +z in the world is (sin a, 0, cos a)
  const inward = nx * Math.sin(angle) + nz * Math.cos(angle) >= 0 ? 1 : -1;
  return { x: o.from[0], z: o.from[1], len, angle, inward, depth: room ? depthOf(room) : TRACK + 0.5, room: room?.id ?? null };
}

/** Panels per section (about one per 0.9 m) and windows in the top section (about one per 0.6 m). */
export const autoPanels = (len) => Math.max(1, Math.round(len / 0.9));
export const autoWindows = (len) => Math.max(2, Math.round(len / 0.6));

/**
 * Where section `i` (0 at the bottom) of `n` is when the door is `t` open (0..1): its bottom edge
 * runs up the opening and then back along the ceiling tracks, and it lies along the chord to its
 * top edge's place on that path. Returns { y, z, angle } in the door's coordinates, `z` towards
 * the garage and `angle` from upright (0) to lying under the tracks (π/2).
 */
export function sectionPose(i, n, head, t) {
  const h = head / n;
  const at = (s) => (s <= head ? { y: s, z: 0 } : { y: head, z: s - head });
  const s = i * h + Math.min(1, Math.max(0, t)) * head;
  const a = at(s);
  const b = at(s + h);
  return { y: a.y, z: a.z, angle: Math.atan2(b.z - a.z, b.y - a.y) };
}

/**
 * The parts of a garage door that never move: a trim frame (jambs and header) around the opening
 * on the garage side, two ceiling tracks from the top corners into the garage, and the opener on
 * the ceiling in the middle. Returned as one group, built with the house (src/ha/static-merge.js
 * then merges it with the floor's other static meshes).
 */
export function garageStatic(o, rooms, wallHeight) {
  const f = garageFrame(o, rooms);
  const opts = o.garage || GARAGE_DEFAULTS;
  const head = o.head ?? 2.1;
  const g = new THREE.Group();
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.angle;
  const z = (d) => f.inward * d; // towards the garage
  const trim = mat(opts.color, { rough: 0.55 });
  const metal = mat('#2c2f35', { rough: 0.45, metal: 0.6 });
  const face = 0.11; // just inside the wall (0.2 thick)
  g.add(
    at(box(0.08, head + 0.08, 0.05, trim, { r: 0 }), -0.04, 0, z(face)),
    at(box(0.08, head + 0.08, 0.05, trim, { r: 0 }), f.len + 0.04, 0, z(face)),
    at(box(f.len + 0.16, 0.08, 0.05, trim, { r: 0 }), f.len / 2, head, z(face)),
  );
  const run = Math.max(0.6, Math.min(TRACK, f.depth - 0.3));
  const y = Math.min(head + 0.06, wallHeight - 0.05);
  for (const x of [0.01, f.len - 0.01]) {
    g.add(at(box(0.035, head, 0.035, metal, { r: 0 }), x, 0, z(face + 0.04))); // up the jamb
    g.add(at(box(0.035, 0.035, run, metal, { r: 0 }), x, y, z(face + run / 2))); // along the ceiling
  }
  if (opts.opener) {
    const depth = Math.max(0.5, Math.min(run + 0.4, f.depth - 0.4)); // the motor stays inside the garage
    const oy = Math.min(wallHeight - 0.2, head + 0.25);
    g.add(
      at(box(0.04, 0.04, depth - 0.2, metal, { r: 0 }), f.len / 2, oy + 0.1, z(face + (depth - 0.2) / 2)), // the rail
      at(box(0.34, 0.16, 0.42, mat('#d9dbdf', { rough: 0.5 }), { r: 0.02 }), f.len / 2, oy, z(face + depth)), // the motor
      at(box(0.03, Math.max(0.02, wallHeight - oy - 0.16), 0.03, metal, { r: 0 }), f.len / 2, oy + 0.16, z(face + depth)), // hanger
    );
  }
  g.userData.garage = true;
  return g;
}

/**
 * The moving door: one group per section (pivot on its bottom edge), each with its body, raised
 * panels on both faces, a dark groove along its top and, in the top section, a row of windows.
 * Returns { group, sections: [Group], frame, head, windows }.
 */
export function garageDoor(o, rooms) {
  const f = garageFrame(o, rooms);
  const opts = o.garage || GARAGE_DEFAULTS;
  const head = o.head ?? 2.1;
  const n = opts.sections;
  const h = head / n;
  const w = f.len - 0.04;
  const body = mat(opts.color, { rough: 0.6 });
  const raised = mat(new THREE.Color(opts.color).multiplyScalar(0.94).getStyle(), { rough: 0.6 });
  const groove = mat('#5d5a52', { rough: 0.6 }); // same look as the body: merged with it, one draw per section
  const glassy = new THREE.MeshStandardMaterial({ color: '#1d2530', roughness: 0.15, metalness: 0.3 });
  const panels = opts.panels ?? autoPanels(f.len);
  const windowCount = opts.windowCount ?? autoWindows(f.len);
  const group = new THREE.Group();
  group.position.set(f.x, 0, f.z);
  group.rotation.y = f.angle;
  const sections = [];
  let windows = 0;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group();
    s.position.x = f.len / 2;
    s.add(at(box(w, h - 0.014, THICK, body, { r: 0 }), 0, 0, 0));
    s.add(at(box(w, 0.014, THICK - 0.008, groove, { r: 0 }), 0, h - 0.014, 0)); // the recessed groove
    const top = i === n - 1;
    if (top && opts.windows) {
      const ww = (w - 0.12 * (windowCount + 1)) / windowCount;
      for (let k = 0; k < windowCount; k++) {
        s.add(at(box(Math.max(0.05, ww), h * 0.42, THICK + 0.012, glassy, { r: 0 }), -w / 2 + 0.12 + ww / 2 + k * (ww + 0.12), h * 0.3, 0));
        windows++;
      }
    } else {
      const pw = (w - 0.1 * (panels + 1)) / panels;
      for (let k = 0; k < panels; k++) {
        const px = -w / 2 + 0.1 + pw / 2 + k * (pw + 0.1);
        for (const side of [-1, 1]) s.add(at(box(Math.max(0.05, pw), h * 0.56, 0.012, raised, { r: 0 }), px, h * 0.2, side * (THICK / 2 + 0.005)));
      }
    }
    group.add(s);
    sections.push(s);
  }
  return { group, sections, frame: f, head, windows, plane: 0.08 };
}

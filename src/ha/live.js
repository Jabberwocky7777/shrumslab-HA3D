// What the house is doing, drawn into the model (brief: M5). Doors swing open with their contact
// sensor, locks show on their doors, garage doors roll up and down, occupied rooms glow, people
// stand in the room they are in, the heat map tints rooms by temperature, fans spin and TVs light
// up. Everything comes from `hass.states`; taps on a lock, a garage door or a TV only ever open Home
// Assistant's more-info dialog. Pure helpers (heatColor, personRoom, sameOriginPicture, ...) are
// exported for the unit tests.
import * as THREE from 'three';
import { MARKER_COLORS, drawIcon } from './markers.js';
import { availabilityOf } from './mapping.js';
import { roomOfArea, largestRect } from './rooms.js';
import { fireplaceScreen } from '../../upstream/three/extras.js';
import { garageDoor, sectionPose } from './garage.js';
import { mergeChildren } from './static-merge.js';

const ALERT = new THREE.Color(MARKER_COLORS.alert);
const OK = new THREE.Color('#5fd38b');
const SPRITE = 128;
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

/* ---------- pure helpers ---------- */

/** A temperature as a colour from cool blue to warm red; Fahrenheit is converted first. */
export function heatColor(value, unit = '°C', out = new THREE.Color()) {
  const c = /F/i.test(unit) ? ((value - 32) * 5) / 9 : value;
  const stops = [[16, '#3d7bff'], [19, '#4fc3d9'], [21.5, '#e9e2b0'], [24, '#ff9a3d'], [27, '#ff4d3d']];
  if (c <= stops[0][0]) return out.set(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return out.set(c0).lerp(new THREE.Color(c1), (c - t0) / (t1 - t0));
    }
  }
  return out.set(stops.at(-1)[1]);
}

/**
 * The room a person is in: their entity's state is a Home Assistant area id or name, matched
 * against each room's `area` entries (resolved both ways with the area registry `areas`, when
 * there is one), else its name or id. A part of a room counts as its main room.
 */
export function personRoom(rooms, state, areas = null) {
  if (!state || state === 'not_home' || state === 'unknown' || state === 'unavailable') return null;
  return roomOfArea(rooms, state, areas);
}

/** Turns per second of a fan without its own fan entity (`spin: "light"`): a medium speed while on. */
export const LIGHT_FAN_SPEED = 0.5 * 2.2;

/**
 * A media player's picture, only when Home Assistant serves it itself: a path on this origin
 * (its signed /api/media_player_proxy/... URL). Anything on another origin is never loaded.
 */
export function sameOriginPicture(picture, base = globalThis.location?.href) {
  if (typeof picture !== 'string' || !picture.startsWith('/') || picture.startsWith('//')) return null;
  try {
    const url = new URL(picture, base);
    return url.origin === new URL(base).origin ? url.href : null;
  } catch { return null; }
}

/** 0..1, how open a garage door is: its position, else its state. */
export function coverOpen(st) {
  if (!st || availabilityOf(st)) return 0;
  const pos = Number(st.attributes?.current_position);
  if (Number.isFinite(pos)) return Math.min(1, Math.max(0, pos / 100));
  return st.state === 'open' || st.state === 'opening' ? 1 : 0;
}

/** Turns per second of a fan's blades: from its percentage, nothing when it is off. */
export function fanSpeed(st) {
  if (!st || st.state !== 'on') return 0;
  const pct = Number(st.attributes?.percentage);
  return (Number.isFinite(pct) ? pct / 100 : 0.6) * 2.2;
}

/** "18 W", "1.23 kW" or null. */
export function wattsLabel(st) {
  if (!st || availabilityOf(st)) return null;
  let w = Number(st.state);
  if (!Number.isFinite(w)) return null;
  if (/kW/i.test(st.attributes?.unit_of_measurement || '')) w *= 1000;
  return Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`;
}

/** How much daylight: 0 at night, 1 once the sun is 10° up (sun.sun's elevation). */
export function daylightOf(sun) {
  const e = Number(sun?.attributes?.elevation);
  if (!Number.isFinite(e)) return sun?.state === 'above_horizon' ? 1 : 0;
  return Math.min(1, Math.max(0, (e + 6) / 16));
}

/* ---------- drawing helpers ---------- */

function spriteOf(paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SPRITE;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.renderOrder = 3;
  const repaint = (...args) => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, SPRITE, SPRITE);
    paint(g, ...args);
    texture.needsUpdate = true;
  };
  return { sprite, repaint };
}

function hitBox(w, hgt, d, id) {
  const hit = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshBasicMaterial());
  hit.visible = false;
  hit.userData = { kind: 'live', id };
  return hit;
}

// A wall line from an opening: start, direction along the wall, length.
function line(o) {
  const dx = o.to[0] - o.from[0];
  const dz = o.to[1] - o.from[1];
  const len = Math.hypot(dx, dz);
  return { x: o.from[0], z: o.from[1], len, angle: Math.atan2(-dz, dx) };
}

/* ---------- the units ---------- */

class DoorUnit {
  constructor(o, id) {
    this.id = id;
    this.o = o;
    this.floor = o.storey;
    this.group = new THREE.Group();
    const { x, z, len, angle } = line(o);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = angle;
    this.open = 0;
    this.goal = 0;
    this.tint = 0;
    this.tintGoal = 0;
    if (o.type === 'window') {
      // A window: a pane over the opening that turns the alert colour while it is open.
      this.material = new THREE.MeshBasicMaterial({ color: ALERT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, o.head - o.sill), this.material);
      pane.position.set(len / 2, (o.sill + o.head) / 2, 0);
      this.group.add(pane);
    } else if (o.contact) {
      // A door leaf hinged at "from", swinging into the room when the contact says open.
      this.material = new THREE.MeshStandardMaterial({ color: '#b8a58b', roughness: 0.7, emissive: ALERT, emissiveIntensity: 0 });
      this.leaf = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len - 0.04, Math.min(o.head, 2.1) - 0.02, 0.04), this.material);
      slab.position.set(len / 2, Math.min(o.head, 2.1) / 2, 0);
      slab.castShadow = true;
      this.leaf.add(slab);
      this.group.add(this.leaf);
    }
    if (o.lock) {
      this.lockBadge = spriteOf((g, color, locked) => {
        g.beginPath();
        g.arc(SPRITE / 2, SPRITE / 2, SPRITE / 2 - 6, 0, Math.PI * 2);
        g.fillStyle = 'rgba(14, 18, 30, 0.82)';
        g.fill();
        g.lineWidth = 6;
        g.strokeStyle = color;
        g.stroke();
        g.save();
        g.translate(SPRITE / 2 - 24, SPRITE / 2 - 24);
        g.scale(2, 2);
        drawIcon(g, locked ? 'lock' : 'unlock', color);
        g.restore();
      });
      this.lockBadge.sprite.scale.setScalar(0.32);
      this.lockBadge.sprite.position.set(len / 2, 1.55, 0.12);
      this.group.add(this.lockBadge.sprite);
      this.hit = hitBox(0.5, 0.5, 0.5, `${id}:lock`);
      this.hit.position.copy(this.lockBadge.sprite.position);
      this.group.add(this.hit);
    }
  }

  apply(states) {
    if (this.o.contact) {
      const st = states[this.o.contact];
      const open = Boolean(st) && !availabilityOf(st) && st.state === 'on';
      this.goal = open ? 1 : 0;
      this.tintGoal = open ? 1 : 0;
    }
    if (this.lockBadge) {
      const st = states[this.o.lock];
      const look = !st || availabilityOf(st) ? 'unavailable' : st.state === 'locked' ? 'locked' : 'alert';
      if (look !== this.look) {
        this.look = look;
        const color = look === 'locked' ? `#${OK.getHexString()}` : look === 'alert' ? MARKER_COLORS.alert : MARKER_COLORS.unavailable;
        this.lockBadge.repaint(color, look === 'locked');
      }
    }
  }

  update(dt) {
    const d = Math.abs(this.goal - this.open) + Math.abs(this.tintGoal - this.tint);
    if (d < 0.002) return false;
    this.open += (this.goal - this.open) * ease(dt, 5);
    this.tint += (this.tintGoal - this.tint) * ease(dt, 6);
    if (this.leaf) this.leaf.rotation.y = -this.open * THREE.MathUtils.degToRad(78);
    if (this.material?.isMeshStandardMaterial) this.material.emissiveIntensity = this.tint * 0.9;
    else if (this.material) this.material.opacity = this.tint * 0.45;
    return true;
  }
}

// A sectional garage door (src/ha/garage.js): its sections ride up the opening and back along the
// ceiling tracks, one after another. Its frame, tracks and opener are part of the house.
class GarageUnit {
  constructor(o, id, rooms) {
    this.id = id;
    this.o = o;
    this.floor = o.storey;
    this.entity = o.cover;
    const door = garageDoor(o, rooms);
    this.group = door.group;
    this.sections = door.sections;
    this.head = door.head;
    this.len = door.frame.len;
    this.inward = door.frame.inward;
    this.plane = door.plane;
    this.windows = door.windows;
    // Each section is one or two meshes (body, panels and groove; windows); each gets its own
    // materials so the alert tint never reaches anything else drawn with the same colour.
    this.materials = [];
    for (const s of this.sections) {
      for (const m of mergeChildren(s, [...s.children])) {
        m.material = m.material.clone();
        m.material.emissive = ALERT.clone();
        m.material.emissiveIntensity = 0;
        m.castShadow = true;
        this.materials.push(m.material);
      }
    }
    this.hit = hitBox(this.len, this.head, 0.5, `${id}:garage`);
    this.hit.position.set(this.len / 2, this.head / 2, 0);
    this.group.add(this.hit);
    this.visible = () => true; // set by attach(): world.floorAnimated
    this.open = 0;
    this.goal = 0;
    this.write();
  }

  apply(states) {
    const st = states[this.o.cover];
    this.goal = coverOpen(st);
  }

  write() {
    const n = this.sections.length;
    this.sections.forEach((s, i) => {
      const p = sectionPose(i, n, this.head, this.open);
      s.position.set(this.len / 2, p.y, this.inward * (this.plane + p.z));
      s.rotation.x = this.inward * p.angle;
    });
    const tint = this.open > 0.02 ? 0.25 + 0.45 * this.open : 0;
    for (const m of this.materials) m.emissiveIntensity = tint;
  }

  update(dt) {
    if (Math.abs(this.goal - this.open) < 0.002) {
      if (this.open === this.goal) return false;
      this.open = this.goal; // fully closed means every section upright
      this.write();
      return true;
    }
    // like the fans: a door on a floor that is not shown jumps to where it goes
    if (!this.visible(this.floor)) { this.open = this.goal; this.write(); return false; }
    this.open += (this.goal - this.open) * ease(dt, 2.2);
    this.write();
    return true;
  }

  /** For tests: where each section is. */
  state() {
    return this.sections.map((s) => ({ y: +s.position.y.toFixed(3), z: +s.position.z.toFixed(3), angle: +s.rotation.x.toFixed(3) }));
  }
}

// A soft colour over a room's floor: occupancy glow or heat map tint.
class RoomTint {
  constructor(room, { additive, y, fade }) {
    this.room = room.id;
    this.group = new THREE.Group();
    this.material = new THREE.MeshBasicMaterial({
      color: '#7fd3ff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(room.w - 0.04, room.d - 0.04).rotateX(-Math.PI / 2), this.material);
    plane.position.set(room.x + room.w / 2, y, room.z + room.d / 2);
    plane.renderOrder = 1;
    this.group.add(plane);
    this.plane = plane;
    this.level = 0;
    this.goal = 0;
    this.fade = fade;
    this.max = 0.2;
  }

  update(dt) {
    if (Math.abs(this.goal - this.level) < 0.002) {
      if (this.level !== this.goal) { this.level = this.goal; this.write(); return true; }
      return false;
    }
    const rate = this.goal > this.level ? 4 : this.fade;
    this.level += (this.goal - this.level) * ease(dt, rate);
    this.write();
    return true;
  }

  write() {
    this.material.opacity = this.level * this.max;
    this.plane.visible = this.level > 0.003;
  }
}

class PersonUnit {
  constructor(person, index) {
    this.person = person;
    this.index = index;
    this.group = new THREE.Group();
    this.badge = spriteOf((g) => {
      g.beginPath();
      g.arc(SPRITE / 2, SPRITE / 2, SPRITE / 2 - 8, 0, Math.PI * 2);
      g.fillStyle = person.color;
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
      g.fillStyle = '#0d1220';
      g.font = '700 64px -apple-system, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(person.name.trim()[0].toUpperCase(), SPRITE / 2, SPRITE / 2 + 3);
    });
    this.badge.repaint();
    this.badge.sprite.scale.setScalar(0.5);
    this.group.add(this.badge.sprite);
    this.group.visible = false;
    this.room = null;
    this.floor = null;
  }

  update() { return false; }
}

// Spinning fans: endless motion, so the world treats it as ambient (capped rate, rests when idle).
// Only fans on a floor that is shown and not dimmed turn, so a hidden fan never keeps the loop awake.
class FanSpinner {
  constructor(floor) {
    this.floor = floor;
    this.ambient = true;
    this.group = new THREE.Group();
    // { entity, floor, spin(angle) } or { key, floor, speed() (turns per second), spin(angle) }
    this.items = [];
    this.speeds = new Map();
    this.visible = () => true; // set by attach(): world.floorAnimated
  }

  speedOf(item) {
    return item.speed ? item.speed() : this.speeds.get(item.entity) || 0;
  }

  /** What every fan does right now: changes when one starts, stops or changes speed. */
  signature() {
    return this.items.map((i) => this.speedOf(i).toFixed(3)).join(',');
  }

  update(dt) {
    let any = false;
    for (const item of this.items) {
      if (!this.visible(item.floor)) continue;
      const v = this.speedOf(item);
      if (!v) continue;
      item.spin(v * Math.PI * 2 * dt);
      any = true;
    }
    return any;
  }
}

// A fireplace's fire ("fire": true) flickers softly: ambient like the fans, so it is drawn at the
// capped rate, rests when nobody touches the card, and only moves on a floor that is shown.
class FireFlicker {
  constructor(floor) {
    this.floor = floor;
    this.ambient = true;
    this.group = new THREE.Group();
    this.items = []; // { floor, material, base }
    this.t = 0;
    this.visible = () => true;
  }

  update(dt) {
    this.t += dt;
    let any = false;
    this.items.forEach((item, i) => {
      if (!this.visible(item.floor)) return;
      const t = this.t + i * 1.7;
      const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.2) * 0.3 + Math.sin(t * 3.1 + 0.4) * 0.2;
      item.material.emissiveIntensity = item.base * (0.82 + 0.18 * n);
      any = true;
    });
    return any;
  }
}

/** Where a TV's tap target sits on its furniture: [x, y, z] and the screen's width. */
export function screenOf(f) {
  if (f.type === 'fireplace') {
    const s = fireplaceScreen(f);
    return { local: [0, s.y - s.height / 2, s.z], width: s.width };
  }
  if (f.type === 'mediaWall') return { local: [0, 1.02, -0.17], width: f.screen ?? 1.45 };
  return { local: [0, 0.745, -0.11], width: (f.width ?? 1.7) * 0.84 };
}

/* ---------- the layer ---------- */

/**
 * The live layer of one card. `units` go into createWorld's `live` option; `attach(world)` then
 * finds the fans and TVs the world built. `sync(states)` returns true when anything shown changed.
 */
export function createLive(config, { lightOn = () => false } = {}) {
  const units = [];
  const doors = [];
  const garages = [];
  config.openings.forEach((o, i) => {
    if (o.type === 'garage') {
      const u = new GarageUnit(o, `opening${i}`, config.rooms.filter((r) => r.storey === o.storey));
      garages.push(u);
      units.push(u);
    } else if (o.contact || o.lock) {
      const u = new DoorUnit(o, `opening${i}`);
      doors.push(u);
      units.push(u);
    }
  });
  // A part of a room glows and tints with its main room's sensors.
  const roomById = new Map(config.rooms.map((r) => [r.id, r]));
  const owner = (r) => (r.partOf ? roomById.get(r.partOf) : r);
  const glows = config.rooms.filter((r) => owner(r).occupancy?.length).map((r) => {
    const u = new RoomTint(r, { additive: true, y: 0.016, fade: 0.8 }); // fades out over a few seconds
    u.max = 0.22;
    u.cfg = owner(r);
    units.push(u);
    return u;
  });
  const heats = config.rooms.filter((r) => owner(r).temperature).map((r) => {
    const u = new RoomTint(r, { additive: false, y: 0.02, fade: 5 });
    u.max = 0.5;
    u.cfg = owner(r);
    units.push(u);
    return u;
  });
  const people = config.people.map((p, i) => new PersonUnit(p, i)); // placed on their floor by sync()
  const spinner = new FanSpinner(config.floors[0].id);
  units.push(spinner);
  const fires = new FireFlicker(config.floors[0].id);
  units.push(fires);

  const byId = new Map();
  for (const u of [...doors, ...garages]) byId.set(u.id, u);
  // TV screens: a hit box over each one; the screen's own material is found by attach().
  const tvs = config.furniture.filter((f) => f.entity && Array.isArray(f.pos)).map((f, i) => {
    const { local, width: w } = screenOf(f);
    const group = new THREE.Group();
    group.position.set(f.pos[0], f.y || 0, f.pos[1]);
    group.rotation.y = THREE.MathUtils.degToRad(f.rot || 0);
    const hit = hitBox(w, w * 0.5625, 0.3, `tv${i}`);
    hit.position.set(...local);
    group.add(hit);
    const unit = { id: `tv${i}`, floor: f.storey, group, hit, update: () => false, item: f, entity: f.entity, screen: null, picture: null, texture: null };
    units.push(unit);
    byId.set(unit.id, unit);
    return unit;
  });

  let world = null;
  let heatOn = false;
  let spinSeen = '';
  const floorOf = new Map(config.rooms.map((r) => [r.id, r.storey]));
  let states = {};
  let areas = null; // Home Assistant's area registry, when the card has it
  const loader = new THREE.TextureLoader();

  function attach(w) {
    world = w;
    if (w.floorAnimated) {
      spinner.visible = w.floorAnimated;
      fires.visible = w.floorAnimated;
      for (const g of garages) g.visible = w.floorAnimated;
    }
    for (const { group, floor } of w.findFurniture((it) => it.type === 'fireplace' && it.fire)) {
      const flame = group.getObjectByName('fire');
      if (flame) fires.items.push({ floor, material: flame.material, base: flame.material.emissiveIntensity });
    }
    for (const p of people) w.floorGroup(config.floors[0].id)?.add(p.group);
    // fans: the blades of "fan" lights, the icons of fan entities
    for (const l of config.lights) {
      if (!l.spin) continue;
      const blades = w.lights.get(l.id)?.model.getObjectByName('fan-blades');
      if (!blades) continue;
      const spin = (a) => { blades.rotation.y += a; };
      const floor = floorOf.get(l.room);
      // spin: "light": the light's own entity (or simulated state) runs the fan
      if (l.spin === 'light') spinner.items.push({ key: l.id, floor, speed: () => (lightOn(l.id) ? LIGHT_FAN_SPEED : 0), spin });
      else spinner.items.push({ entity: l.spin, floor, spin });
    }
    for (const e of config.entities) {
      const marker = w.entities.get(e.id);
      if (e.fan && marker?.badge) spinner.items.push({ entity: e.fan, floor: floorOf.get(e.room), spin: (a) => { marker.badge.material.rotation -= a; } });
    }
    for (const { item, group } of w.findFurniture((it) => Boolean(it.entity))) {
      const tv = tvs.find((t) => t.item === item);
      const screen = group.getObjectByName('screen');
      if (tv && screen) { tv.screen = screen.material; tv.base = { color: screen.material.emissive.getHex(), intensity: screen.material.emissiveIntensity }; }
    }
  }

  function placePeople() {
    const counts = new Map();
    for (const p of people) {
      const match = personRoom(config.rooms, states[p.person.entity]?.state, areas);
      p.room = match?.id ?? null;
      p.group.visible = Boolean(match);
      if (!match) continue;
      const room = largestRect(config.rooms, match.id); // a room in several parts: its biggest
      const k = counts.get(match.id) || 0;
      counts.set(match.id, k + 1);
      const parent = world?.floorGroup(room.storey);
      if (parent && p.group.parent !== parent) parent.add(p.group);
      p.floor = room.storey;
      // side by side near the middle of the room
      p.group.position.set(room.x + room.w / 2 + (k - 0.5) * 0.5 * Math.min(1, k), 1.05, room.z + room.d / 2 + 0.35);
    }
  }

  function screens() {
    for (const tv of tvs) {
      if (!tv.screen) continue;
      const st = states[tv.entity];
      const on = Boolean(st) && !availabilityOf(st) && (st.state === 'playing' || st.state === 'paused' || st.state === 'on');
      const pic = on ? sameOriginPicture(st.attributes?.entity_picture) : null;
      if (pic !== tv.picture) {
        tv.picture = pic;
        tv.texture?.dispose();
        tv.texture = null;
        tv.screen.map = null;
        tv.screen.emissiveMap = null;
        if (pic) {
          const texture = loader.load(pic, () => { world?.wake(); });
          texture.colorSpace = THREE.SRGBColorSpace;
          tv.texture = texture;
          tv.screen.map = texture;
          tv.screen.emissiveMap = texture;
        }
        tv.screen.needsUpdate = true;
      }
      tv.screen.color.set(on ? '#ffffff' : '#05070c');
      tv.screen.emissive.set(on ? (pic ? '#ffffff' : '#9fc0ff') : tv.base.color);
      tv.screen.emissiveIntensity = on ? (st.state === 'paused' ? 0.7 : 1.3) : tv.base.intensity;
      tv.on = on;
    }
  }

  function sync(next, registryAreas = areas) {
    states = next;
    areas = registryAreas ?? null;
    for (const u of [...doors, ...garages]) u.apply(states);
    for (const g of glows) g.goal = g.cfg.occupancy.some((e) => states[e]?.state === 'on') ? 1 : 0;
    for (const hz of heats) {
      const st = states[hz.cfg.temperature];
      const t = Number(st?.state);
      const known = Number.isFinite(t) && !availabilityOf(st);
      if (known) heatColor(t, st.attributes?.unit_of_measurement, hz.material.color);
      hz.goal = heatOn && known ? 1 : 0;
    }
    spinner.speeds = new Map(spinner.items.filter((i) => i.entity).map((i) => [i.entity, fanSpeed(states[i.entity])]));
    placePeople();
    screens();
    world?.wake();
  }

  return {
    units,
    attach,
    sync,
    /** The entity a tap on a live unit is about: its more-info opens (locks, garage doors, TVs). */
    entityOf(id) {
      const [base, part] = id.split(':');
      const u = byId.get(base);
      if (!u) return null;
      if (part === 'lock') return u.o.lock;
      if (part === 'garage') return u.o.cover;
      return u.entity ?? null;
    },
    get hasHeatmap() { return heats.length > 0; },
    get heatmap() { return heatOn; },
    setHeatmap(on) { heatOn = Boolean(on); sync(states, areas); },
    /** The reading on a room's chip ("21.5°"), or null. */
    roomReading(roomId) {
      const room = config.rooms.find((r) => r.id === roomId);
      const st = room?.temperature ? states[room.temperature] : null;
      const t = Number(st?.state);
      return st && !availabilityOf(st) && Number.isFinite(t) ? `${Math.round(t * 10) / 10}°` : null;
    },
    /** The hit mesh of a live unit (tests tap it through world.screenOf). */
    hitOf(id) {
      const [base, part] = id.split(':');
      const u = byId.get(base);
      return part === 'lock' || part === 'garage' || !part ? u?.hit ?? null : null;
    },
    /**
     * True once each time a fan starts, stops or changes speed (its entity, or the light it spins
     * with): the card then lets the fans spin again after a rest.
     */
    spinChanged() {
      const now = spinner.signature();
      if (now === spinSeen) return false;
      spinSeen = now;
      return true;
    },
    /** The names of the people who are away (not_home). */
    away: () => config.people.filter((p) => states[p.entity]?.state === 'not_home').map((p) => p.name),
    /** Watts of a light that is on, for its tile ("18 W"), or null. */
    lightPower(cfg, on) { return on && cfg.power ? wattsLabel(states[cfg.power]) : null; },
    // for tests and the browser console
    debug() {
      return {
        doors: doors.map((d) => ({ id: d.id, open: d.goal, lock: d.look ?? null })),
        garages: garages.map((g) => ({
          id: g.id, open: g.goal, now: +g.open.toFixed(3), sections: g.sections.length, windows: g.windows, pose: g.state(),
        })),
        glows: glows.map((g) => ({ room: g.room, on: g.goal, level: g.level })),
        heat: heats.map((hz) => ({ room: hz.room, on: hz.goal, color: `#${hz.material.color.getHexString()}` })),
        people: people.map((p) => ({ name: p.person.name, room: p.room, floor: p.floor })),
        fans: [
          ...[...spinner.speeds].map(([entity, speed]) => ({ entity, speed })),
          ...spinner.items.filter((i) => i.speed).map((i) => ({ light: i.key, speed: i.speed() })),
        ],
        tvs: tvs.map((t) => ({ entity: t.entity, on: Boolean(t.on), picture: t.picture })),
      };
    },
    dispose() { for (const tv of tvs) tv.texture?.dispose(); },
  };
}

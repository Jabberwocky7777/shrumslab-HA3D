import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { garageOptions, garageFrame, sectionPose, garageStatic, garageDoor, autoPanels, autoWindows, GARAGE_DEFAULTS } from '../../src/ha/garage.js';
import { validatePlan } from '../../src/ha/validate.js';

const demo = JSON.parse(readFileSync(new URL('../../plans/demo.json', import.meta.url)));
const meshes = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
const garage = { id: 'garage', rect: [0, 0, 4, 6] }; // x 0..4, z 0..6
const plan = (opening, rooms = [garage]) => ({ name: 'Garage', rooms, openings: [{ type: 'garage', cover: 'cover.demo_garage', head: 2.1, ...opening }] });

test('garage options: defaults, and checks', () => {
  assert.deepEqual(garageOptions('x', {}), GARAGE_DEFAULTS);
  assert.deepEqual(garageOptions('x', { sections: 5, windows: false, windowCount: 3, panels: 2, color: '#ffffff', opener: false }),
    { sections: 5, windows: false, windowCount: 3, panels: 2, color: '#ffffff', opener: false });
  const bad = { sections: 0, windows: 'yes', windowCount: 2.5, panels: -1, color: 'white', opener: 1 };
  for (const [k, v] of Object.entries(bad)) assert.throws(() => garageOptions('Opening', { [k]: v }), new RegExp(`"${k}"`), k);
  // validation: on the opening, only for garages
  const { config } = validatePlan(plan({ from: [1, 6], to: [3, 6], sections: 3 }));
  assert.equal(config.openings[0].garage.sections, 3);
  assert.throws(() => validatePlan({ ...plan({}), openings: [{ type: 'door', from: [1, 6], to: [2, 6], sections: 3 }] }), /"sections" is only for "type": "garage"/);
  assert.equal(autoPanels(2), 2);
  assert.equal(autoPanels(0.5), 1);
  assert.equal(autoWindows(2.4), 4);
  assert.equal(autoWindows(0.6), 2);
});

test('the garage side: the room the opening belongs to, whichever way the opening runs', () => {
  // the south wall of the garage (z = 6): the garage is towards -z
  const south = garageFrame({ from: [1, 6], to: [3, 6] }, [{ id: 'g', x: 0, z: 0, w: 4, d: 6 }]);
  const local = (f) => new THREE.Vector3(0, 0, f.inward).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.angle);
  assert.ok(local(south).z < -0.99, 'inward is -z in the world');
  assert.equal(south.depth, 6);
  // drawn the other way round: still into the garage
  const reversed = garageFrame({ from: [3, 6], to: [1, 6] }, [{ id: 'g', x: 0, z: 0, w: 4, d: 6 }]);
  assert.ok(local(reversed).z < -0.99);
  // the west wall (x = 0): the garage is towards +x
  const west = garageFrame({ from: [0, 1], to: [0, 3] }, [{ id: 'g', x: 0, z: 0, w: 4, d: 6 }]);
  assert.ok(local(west).x > 0.99);
  assert.equal(west.depth, 4);
  // between two rooms: the deeper one
  const between = garageFrame({ from: [1, 2], to: [3, 2] }, [{ id: 'shallow', x: 0, z: 0, w: 4, d: 2 }, { id: 'deep', x: 0, z: 2, w: 4, d: 5 }]);
  assert.equal(between.room, 'deep');
});

test('sections ride up the opening and back along the tracks, one after another', () => {
  const head = 2;
  const n = 4;
  // closed: upright, stacked
  assert.deepEqual([0, 1, 2, 3].map((i) => sectionPose(i, n, head, 0)), [0, 0.5, 1, 1.5].map((y) => ({ y, z: 0, angle: 0 })));
  // open: lying under the tracks at the top of the opening, the bottom one nearest the opening
  const open = [0, 1, 2, 3].map((i) => sectionPose(i, n, head, 1));
  for (const p of open) { assert.equal(p.y, head); assert.ok(Math.abs(p.angle - Math.PI / 2) < 1e-9); }
  assert.deepEqual(open.map((p) => p.z), [0, 0.5, 1, 1.5]);
  // part way: the top section turns first, the bottom ones are still upright and lifted
  const mid = [0, 1, 2, 3].map((i) => sectionPose(i, n, head, 0.3));
  assert.equal(mid[0].angle, 0);
  assert.ok(Math.abs(mid[0].y - 0.6) < 1e-9);
  assert.ok(mid[3].angle > 0 && mid[3].angle <= Math.PI / 2);
  assert.ok(mid[3].angle >= mid[2].angle, 'higher sections turn first');
  // each section starts where the one below it starts plus a section's height along the path
  for (let t = 0; t <= 1; t += 0.1) {
    const p = [0, 1, 2, 3].map((i) => sectionPose(i, n, head, t));
    for (let i = 1; i < n; i++) assert.ok(p[i].y >= p[i - 1].y - 1e-9 && p[i].z >= p[i - 1].z - 1e-9, `t=${t}`);
  }
  // out of range is clamped
  assert.deepEqual(sectionPose(0, n, head, 2), sectionPose(0, n, head, 1));
});

test('the moving door: sections, windows in the top one, panels in the others', () => {
  const o = { type: 'garage', from: [1, 6], to: [3, 6], head: 2, garage: { ...GARAGE_DEFAULTS } };
  const door = garageDoor(o, [{ id: 'g', x: 0, z: 0, w: 4, d: 6 }]);
  assert.equal(door.sections.length, 4);
  assert.equal(door.windows, autoWindows(2));
  const counts = door.sections.map(meshes);
  assert.equal(counts[3], 2 + autoWindows(2), 'top: body, groove, windows');
  assert.equal(counts[0], 2 + autoPanels(2) * 2, 'others: body, groove, panels on both faces');
  const plain = garageDoor({ ...o, garage: { ...GARAGE_DEFAULTS, sections: 6, windows: false, panels: 3 } }, [{ id: 'g', x: 0, z: 0, w: 4, d: 6 }]);
  assert.equal(plain.sections.length, 6);
  assert.equal(plain.windows, 0);
  assert.equal(meshes(plain.sections[5]), 2 + 3 * 2);
});

test('the static parts: trim, two tracks, and the opener when asked', () => {
  const o = { type: 'garage', from: [1, 6], to: [3, 6], head: 2.1, garage: { ...GARAGE_DEFAULTS } };
  const rooms = [{ id: 'g', x: 0, z: 0, w: 4, d: 6 }];
  const withOpener = garageStatic(o, rooms, 2.6);
  const without = garageStatic({ ...o, garage: { ...GARAGE_DEFAULTS, opener: false } }, rooms, 2.6);
  assert.equal(meshes(without), 3 + 4, 'jambs, header, and each track up the jamb and along the ceiling');
  assert.equal(meshes(withOpener), meshes(without) + 3, 'rail, motor, hanger');
  // the tracks run 2.5 m into a deep garage, less into a shallow one
  withOpener.updateMatrixWorld(true);
  const reach = (g) => new THREE.Box3().setFromObject(g, true);
  assert.ok(reach(withOpener).min.z < 6 - 2.5);
  const shallow = garageStatic(o, [{ id: 'g', x: 0, z: 4, w: 4, d: 2 }], 2.6);
  shallow.updateMatrixWorld(true);
  assert.ok(reach(shallow).min.z > 4, 'never through the back wall');
  assert.equal(withOpener.userData.garage, true);
});

test('the demo garage is a sectional door with windows', () => {
  const { config } = validatePlan(demo);
  const o = config.openings.find((x) => x.type === 'garage');
  assert.deepEqual(o.garage, { sections: 4, windows: true, windowCount: 4, panels: 2, color: '#e9e4d8', opener: true });
});

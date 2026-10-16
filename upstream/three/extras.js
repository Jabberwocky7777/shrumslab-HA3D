// Additional generic furniture and light fixtures (prototype for ha-house-control).
// Same conventions as furniture.js / lights.js: builders return a Group standing on y = 0,
// centred on the footprint, facing +z; the plan's "rot" turns it.
import * as THREE from 'three';
import { box, cyl, mat, at, rng } from './kit.js';

const BLACK = '#1b1c21';
const METAL = '#9a9fa8';
const DARK = '#23262e';

const group = (...children) => {
  const g = new THREE.Group();
  const kids = children.flat().filter(Boolean);
  if (kids.length) g.add(...kids);
  return g;
};
const darker = (hex, k = 0.75) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
function sphere(r, material, seg = 20) { return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), material); }
function glass(tint = '#cfe3f2', opacity = 0.28) {
  return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.1, transparent: true, opacity, depthWrite: false });
}
function legs4(w, d, h, m, inset = 0.06, r = 0.022) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(at(cyl(r, r * 0.8, h, m, 10), sx * (w / 2 - inset), 0, sz * (d / 2 - inset)));
  return out;
}
function barStool({ wood = '#5b2c1e', seat = '#1d1d1f', h = 0.76 } = {}) {
  const w = mat(wood, { rough: 0.55 });
  const g = group(
    ...legs4(0.42, 0.42, h, w, 0.05, 0.018),
    at(cyl(0.2, 0.2, 0.025, w, 24), 0, h * 0.35, 0),           // foot ring
    at(cyl(0.22, 0.2, 0.06, mat(seat, { rough: 0.5 }), 24), 0, h, 0),
    at(box(0.4, 0.44, 0.04, w, { r: 0.015 }), 0, h + 0.06, -0.19),
  );
  for (let i = 0; i < 3; i++) g.add(at(box(0.36, 0.035, 0.03, w, { r: 0.01 }), 0, h + 0.14 + i * 0.12, -0.17));
  return g;
}

export const extraBuilders = {
  /** Pool table: felt colour, rail wood, carved legs, pockets and a racked set of balls. */
  poolTable({ width = 2.5, depth = 1.4, felt = '#2f6b45', wood = '#6b3a22', balls = true }) {
    const w = mat(wood, { rough: 0.45 });
    const g = group(at(box(width - 0.14, 0.2, depth - 0.14, w, { r: 0.03 }), 0, 0.56, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (width / 2 - 0.2), z = sz * (depth / 2 - 0.2);
      g.add(at(cyl(0.06, 0.09, 0.2, w, 16), x, 0, z), at(sphere(0.085, w, 16), x, 0.26, z), at(cyl(0.065, 0.05, 0.3, w, 16), x, 0.28, z));
    }
    g.add(
      at(box(width, 0.08, depth, w, { r: 0.03 }), 0, 0.74, 0),
      at(box(width - 0.22, 0.03, depth - 0.22, mat(felt, { rough: 1 }), { r: 0.005 }), 0, 0.805, 0),
    );
    const pocket = mat('#0d0d0f', { rough: 0.9 });
    for (const sz of [-1, 1]) for (const x of [-(width / 2 - 0.1), 0, width / 2 - 0.1]) {
      g.add(at(cyl(0.055, 0.055, 0.012, pocket, 18), x, 0.822, sz * (depth / 2 - 0.1)));
    }
    if (balls) {
      const cols = ['#f2c94c', '#2d6cdf', '#d64545', '#6b3fa0', '#f2994a', '#27ae60', '#7a1f1f', '#111', '#f2c94c', '#2d6cdf'];
      let k = 0;
      for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) {
        g.add(at(sphere(0.028, mat(cols[k++ % cols.length], { rough: 0.25 }), 12), width * 0.22 + row * 0.05, 0.85, (i - row / 2) * 0.058));
      }
      g.add(at(sphere(0.028, mat('#f6f4ee', { rough: 0.25 }), 12), -width * 0.25, 0.85, 0));
    }
    return g;
  },

  /** U-shaped sectional: a main run with a chaise at each end, both pointing forward (+z). */
  sectional({ width = 2.6, depth = 0.95, chaise = 0.85, chaiseWidth = 0.95, color = '#f0e9da' }) {
    const fabric = mat(color, { rough: 1 });
    const base = mat(darker(color, 0.85), { rough: 1 });
    const total = depth + chaise;
    const z0 = -total / 2;                      // back edge
    const g = group(at(box(width, 0.22, depth, base, { r: 0.05 }), 0, 0.08, z0 + depth / 2));
    // back cushions + arms
    g.add(at(box(width, 0.5, 0.22, base, { r: 0.08 }), 0, 0.28, z0 + 0.11));
    for (const sx of [-1, 1]) {
      const cx = sx * (width / 2 - chaiseWidth / 2);
      g.add(
        at(box(chaiseWidth, 0.22, chaise, base, { r: 0.05 }), cx, 0.08, z0 + depth + chaise / 2),
        at(box(0.2, 0.28, total, base, { r: 0.07 }), sx * (width / 2 - 0.1), 0.24, 0),
        at(box(chaiseWidth - 0.22, 0.16, total - 0.3, fabric, { r: 0.06 }), cx - sx * 0.01, 0.3, z0 + 0.25 + (total - 0.3) / 2),
      );
    }
    const inner = width - 2 * chaiseWidth;
    const n = Math.max(1, Math.round(inner / 0.7));
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + (inner / n) * (i + 0.5);
      g.add(at(box(inner / n - 0.03, 0.16, depth - 0.3, fabric, { r: 0.06 }), x, 0.3, z0 + 0.22 + (depth - 0.3) / 2));
    }
    for (let i = 0; i < 4; i++) {
      const x = -width / 2 + 0.45 + (width - 0.9) * (i / 3);
      const back = at(box(width / 4 - 0.06, 0.36, 0.16, fabric, { r: 0.07 }), x, 0.46, z0 + 0.3);
      back.rotation.x = -0.15;
      g.add(back);
    }
    const p1 = at(box(0.38, 0.34, 0.12, mat('#4a4c55', { rough: 1 }), { r: 0.05 }), -width / 2 + 0.55, 0.5, z0 + 0.42);
    p1.rotation.set(-0.25, 0.3, 0.05);
    const p2 = at(box(0.38, 0.34, 0.12, mat('#4a4c55', { rough: 1 }), { r: 0.05 }), width / 2 - 0.55, 0.5, z0 + 0.42);
    p2.rotation.set(-0.25, -0.3, -0.05);
    g.add(p1, p2);
    return g;
  },

  /** Tall cabinet with glass upper doors, lit shelves of collectibles and solid lower doors. */
  glassCabinet({ width = 0.9, height = 2.0, color = '#1f2126', seed = 1 }) {
    const rand = rng(seed * 97 + Math.round(width * 100));
    const body = mat(color, { rough: 0.55 });
    const depth = 0.4;
    const g = group(
      at(box(width, height, 0.03, body, { r: 0 }), 0, 0, -depth / 2 + 0.015),
      at(box(width, 0.04, depth, body, { r: 0.01 }), 0, height - 0.04, 0),
      at(box(width + 0.04, 0.05, depth + 0.03, body, { r: 0.01 }), 0, height, 0),   // crown
      at(box(width, 0.72, depth, body, { r: 0.01 }), 0, 0, 0),                     // lower cabinet
      at(box(0.006, 0.66, 0.005, mat('#000'), { r: 0 }), 0, 0.03, depth / 2 + 0.001),
    );
    for (const sx of [-1, 1]) g.add(at(box(0.03, height, depth, body, { r: 0 }), sx * (width / 2 - 0.015), 0, 0));
    const cols = ['#c9553f', '#3d6b8c', '#e8d9a8', '#4f9462', '#d9b98a', '#e05a9a', '#f2c94c'];
    for (let s = 0; s < 3; s++) {
      const y = 0.72 + s * 0.42;
      g.add(at(box(width - 0.04, 0.02, depth - 0.04, body, { r: 0 }), 0, y, 0));
      let x = -width / 2 + 0.07;
      while (x < width / 2 - 0.1) {
        const bw = 0.04 + rand() * 0.07, bh = 0.1 + rand() * 0.18;
        g.add(at(box(bw, bh, 0.12, mat(cols[Math.floor(rand() * cols.length)], { rough: 0.6 }), { r: 0.004 }), x + bw / 2, y + 0.02, -0.02));
        x += bw + 0.02 + rand() * 0.05;
      }
    }
    g.add(at(box(width - 0.06, height - 0.78, 0.008, glass(), { r: 0 }), 0, 0.74, depth / 2 - 0.01));
    g.add(at(box(0.012, height - 0.78, 0.012, body, { r: 0 }), 0, 0.74, depth / 2 - 0.005));
    return g;
  },

  /** Wall-mounted TV over a low media console with a soundbar. */
  mediaWall({ width = 1.75, screen = 1.45 }) {
    const wood = mat('#2a211b', { rough: 0.6 });
    const sh = screen * 0.5625;
    const scr = new THREE.MeshStandardMaterial({ color: '#05070c', roughness: 0.2, emissive: '#27407a', emissiveIntensity: 0.3 });
    return group(
      at(box(width, 0.62, 0.45, wood, { r: 0.015 }), 0, 0.06, 0),
      ...legs4(width, 0.45, 0.06, mat(BLACK), 0.06, 0.02),
      at(box(width - 0.06, 0.006, 0.005, mat('#000'), { r: 0 }), 0, 0.4, 0.226),
      at(box(1.0, 0.07, 0.1, mat('#16171a', { rough: 0.6 }), { r: 0.02 }), 0, 0.68, 0.05),
      at(box(screen + 0.02, sh + 0.02, 0.03, mat(BLACK, { rough: 0.35 }), { r: 0.006 }), 0, 1.0, -0.2),
      Object.assign(at(box(screen - 0.02, sh - 0.02, 0.008, scr, { r: 0 }), 0, 1.02, -0.184), { name: 'screen' }), // ha3d: lit by a media player
    );
  },

  /** Two-tier bar cart with bottles. */
  barCart({ width = 0.95, depth = 0.4 }) {
    const frame = mat('#3a2a20', { rough: 0.5 });
    const g = group(
      ...legs4(width, depth, 0.85, mat('#222', { rough: 0.4, metal: 0.4 }), 0.03, 0.014),
      at(box(width, 0.025, depth, frame, { r: 0.006 }), 0, 0.85, 0),
      at(box(width, 0.025, depth, frame, { r: 0.006 }), 0, 0.42, 0),
      at(box(width, 0.025, depth, frame, { r: 0.006 }), 0, 0.1, 0),
    );
    const rand = rng(7);
    const cols = ['#cfe3f2', '#7a4a1e', '#2f6b45', '#d9b98a', '#3d3d45', '#a8322a'];
    for (let i = 0; i < 9; i++) {
      const x = -width / 2 + 0.08 + i * ((width - 0.16) / 8);
      const h = 0.22 + rand() * 0.12;
      const m = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.1, transparent: true, opacity: 0.85 });
      g.add(at(cyl(0.035, 0.035, h, m, 12), x, 0.875, (rand() - 0.5) * 0.15), at(cyl(0.012, 0.012, 0.07, m, 8), x, 0.875 + h, 0));
    }
    return g;
  },

  /** Treadmill: deck along z, console at the -z end. */
  treadmill({ length = 1.9, width = 0.85 }) {
    const frame = mat('#2a2c31', { rough: 0.5 });
    const g = group(
      at(box(width, 0.16, length, frame, { r: 0.04 }), 0, 0, 0.05),
      at(box(width - 0.22, 0.012, length - 0.3, mat('#121316', { rough: 0.9 }), { r: 0.004 }), 0, 0.16, 0.1),
    );
    for (const sx of [-1, 1]) {
      const post = at(box(0.06, 1.25, 0.08, frame, { r: 0.02 }), sx * (width / 2 - 0.05), 0.1, -length / 2 + 0.2);
      post.rotation.x = -0.12;
      g.add(post, at(box(0.05, 0.05, 0.45, mat('#3a3d44', { rough: 0.4 }), { r: 0.02 }), sx * (width / 2 - 0.05), 1.05, -length / 2 + 0.38));
    }
    g.add(
      at(box(width - 0.05, 0.28, 0.14, frame, { r: 0.03 }), 0, 1.2, -length / 2 + 0.12),
      at(box(0.32, 0.18, 0.01, mat('#0a0b0d', { rough: 0.2, emissive: '#2a6fd6', emissiveIntensity: 0.25 }), { r: 0 }), 0, 1.25, -length / 2 + 0.2),
    );
    return g;
  },

  /** Old-fashioned popcorn cart: red cabinet, glass kettle box, red roof. */
  popcornMachine() {
    const red = mat('#c62828', { rough: 0.5 });
    const brass = mat('#c9a15e', { rough: 0.3, metal: 0.8 });
    const g = group(
      ...legs4(0.55, 0.42, 0.25, mat('#9e1f1f', { rough: 0.5 }), 0.03, 0.015),
      at(box(0.55, 0.55, 0.42, red, { r: 0.01 }), 0, 0.25, 0),
      at(box(0.5, 0.45, 0.38, glass('#fff6dc', 0.25), { r: 0 }), 0, 0.8, 0),
      at(box(0.46, 0.12, 0.34, mat('#f3d58a', { rough: 1 }), { r: 0.03 }), 0, 0.8, 0),   // popcorn
      at(cyl(0.08, 0.06, 0.08, mat(METAL, { rough: 0.3, metal: 0.9 }), 16), 0, 1.07, 0),  // kettle
      at(box(0.6, 0.12, 0.46, red, { r: 0.02 }), 0, 1.25, 0),
      at(box(0.4, 0.06, 0.3, red, { r: 0.02 }), 0, 1.37, 0),
    );
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(cyl(0.012, 0.012, 0.46, brass, 8), sx * 0.245, 0.8, sz * 0.18));
    for (const sx of [-1, 1]) g.add(at(cyl(0.06, 0.06, 0.02, mat('#222'), 16), sx * 0.29, 0.06, 0.1));
    return g;
  },

  /** Round poker table on a pedestal, with high-back swivel bar stools around it. */
  pokerTable({ diameter = 1.3, stools = 5, wood = '#5b2c1e', felt = '#1a1b1e' }) {
    const w = mat(wood, { rough: 0.45 });
    const r = diameter / 2;
    const g = group(
      at(cyl(0.32, 0.36, 0.06, w, 28), 0, 0, 0),
      at(cyl(0.11, 0.14, 0.82, w, 20), 0, 0.06, 0),
      at(cyl(r, r, 0.06, w, 48), 0, 0.86, 0),
      at(cyl(r - 0.17, r - 0.17, 0.065, mat(felt, { rough: 1 }), 48), 0, 0.865, 0),
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(at(cyl(0.04, 0.04, 0.066, mat('#111'), 14), Math.cos(a) * (r - 0.085), 0.865, Math.sin(a) * (r - 0.085)));
    }
    for (let i = 0; i < stools; i++) {
      const a = Math.PI / 2 + (i / stools) * Math.PI * 2;
      const s = barStool({ wood });
      s.position.set(Math.cos(a) * (r + 0.3), 0, Math.sin(a) * (r + 0.3));
      s.rotation.y = -a - Math.PI / 2;
      g.add(s);
    }
    return g;
  },

  /** Wet bar: wood base and wall cabinets, stone top, small sink, optional mini fridge at the +x end. */
  wetBar({ width = 1.85, wood = '#8a5a3c', top = '#6d5d4b', fridge = true }) {
    const front = mat(wood, { rough: 0.6 });
    const seam = mat(darker(wood, 0.6));
    const cab = fridge ? width - 0.52 : width;
    const cx = -width / 2 + cab / 2;
    const g = group(
      at(box(cab, 0.86, 0.58, front, { r: 0.008 }), cx, 0, 0),
      at(box(width + 0.02, 0.04, 0.62, mat(top, { rough: 0.3 }), { r: 0.008 }), 0, 0.88, 0.005),
      at(box(0.42, 0.012, 0.34, mat(METAL, { rough: 0.3, metal: 0.9 }), { r: 0 }), cx - cab / 4, 0.92, 0.02),
      at(cyl(0.013, 0.013, 0.26, mat(METAL, { rough: 0.25, metal: 0.9 }), 10), cx - cab / 4, 0.92, -0.2),
      at(box(width, 0.72, 0.34, front, { r: 0.008 }), 0, 1.5, -0.12),
    );
    const n = Math.max(2, Math.round(cab / 0.45));
    for (let i = 1; i < n; i++) g.add(at(box(0.008, 0.78, 0.006, seam, { r: 0 }), -width / 2 + (cab / n) * i, 0.04, 0.29));
    const n2 = Math.max(2, Math.round(width / 0.45));
    for (let i = 1; i < n2; i++) g.add(at(box(0.008, 0.66, 0.006, seam, { r: 0 }), -width / 2 + (width / n2) * i, 1.53, 0.05));
    if (fridge) {
      g.add(
        at(box(0.5, 0.84, 0.56, mat('#141518', { rough: 0.35 }), { r: 0.015 }), width / 2 - 0.26, 0, 0),
        at(box(0.02, 0.4, 0.03, mat(METAL, { rough: 0.3, metal: 0.8 }), { r: 0.008 }), width / 2 - 0.08, 0.38, 0.29),
      );
    }
    return g;
  },

  /** Dark bookcase with collectibles. */
  darkBookcase({ width = 0.8, height = 1.95, color = '#1f1d1c', seed = 1 }) {
    const rand = rng(seed * 31 + 5);
    const wood = mat(color, { rough: 0.6 });
    const g = group(at(box(width, height, 0.03, wood, { r: 0 }), 0, 0, -0.17), at(box(width + 0.03, 0.05, 0.38, wood, { r: 0.01 }), 0, height, 0));
    for (const sx of [-1, 1]) g.add(at(box(0.03, height, 0.36, wood, { r: 0 }), sx * (width / 2 - 0.015), 0, 0));
    g.add(at(box(width, 0.55, 0.36, wood, { r: 0.008 }), 0, 0, 0));
    const cols = ['#e8e1d0', '#c9553f', '#3d6b8c', '#f2c94c', '#4f9462', '#d9b98a', '#b33a3a'];
    for (let s = 0; s < 4; s++) {
      const y = 0.55 + s * 0.35;
      g.add(at(box(width, 0.025, 0.36, wood, { r: 0 }), 0, y, 0));
      let x = -width / 2 + 0.06;
      while (x < width / 2 - 0.08) {
        const bw = 0.04 + rand() * 0.05;
        const bh = 0.08 + rand() * 0.16;
        const piece = rand() < 0.5
          ? at(cyl(bw / 2, bw / 2, bh, mat(cols[Math.floor(rand() * cols.length)], { rough: 0.6 }), 10), x + bw / 2, y + 0.025, 0)
          : at(box(bw, bh, 0.16, mat(cols[Math.floor(rand() * cols.length)], { rough: 0.8 }), { r: 0.004 }), x + bw / 2, y + 0.025, -0.02);
        g.add(piece);
        x += bw + 0.015 + rand() * 0.04;
      }
    }
    return g;
  },

  /** Standing desk with two monitors, light bar, drawer unit and a mesh office chair. */
  deskSetup({ width = 2.0, depth = 0.7, chair = '#9db7d6' }) {
    const top = mat('#1c1d20', { rough: 0.5 });
    const g = group(
      at(box(width, 0.035, depth, top, { r: 0.01 }), 0, 0.74, 0),
      at(box(0.07, 0.74, 0.5, mat('#111', { rough: 0.4, metal: 0.4 }), { r: 0.01 }), -width / 2 + 0.55, 0, 0),
      at(box(0.07, 0.74, 0.5, mat('#111', { rough: 0.4, metal: 0.4 }), { r: 0.01 }), width / 2 - 0.25, 0, 0),
      at(box(0.42, 0.7, 0.5, mat('#1a1a1a', { rough: 0.5 }), { r: 0.01 }), -width / 2 + 0.22, 0, 0),
    );
    const scr = new THREE.MeshStandardMaterial({ color: '#0b0c10', roughness: 0.2, emissive: '#9fc4ff', emissiveIntensity: 0.55 });
    for (const sx of [-1, 1]) {
      const m = group(
        at(box(0.8, 0.42, 0.03, mat(BLACK, { rough: 0.3 }), { r: 0.008 }), 0, 0.98, 0),
        at(box(0.76, 0.38, 0.005, scr, { r: 0 }), 0, 1.0, 0.017),
        at(box(0.06, 0.22, 0.04, mat(BLACK), { r: 0.01 }), 0, 0.775, -0.03),
      );
      m.position.set(sx * 0.42, 0, -depth / 2 + 0.16);
      m.rotation.y = -sx * 0.18;
      g.add(m);
    }
    g.add(at(box(0.44, 0.02, 0.14, mat('#2b2d33', { rough: 0.6 }), { r: 0.005 }), 0, 0.775, 0.12)); // keyboard
    // office chair
    const c = mat(chair, { rough: 0.8 });
    const frame = mat('#d9dbe0', { rough: 0.3, metal: 0.6 });
    const ch = group(at(cyl(0.3, 0.3, 0.02, frame, 5), 0, 0.04, 0), at(cyl(0.025, 0.025, 0.42, frame, 10), 0, 0.06, 0),
      at(box(0.5, 0.08, 0.48, c, { r: 0.04 }), 0, 0.46, 0), at(box(0.46, 0.62, 0.05, c, { r: 0.05 }), 0, 0.56, 0.25),
      at(box(0.22, 0.14, 0.06, frame, { r: 0.03 }), 0, 1.2, 0.27));
    ch.position.set(0.05, 0, depth / 2 + 0.25);
    g.add(ch);
    return g;
  },

  /** Cat tree: posts, platforms, a condo and a sleeping cat on top. */
  catTree({ height = 1.6, cat = '#6e6e74' }) {
    const sisal = mat('#cdb894', { rough: 1 });
    const plush = mat('#ece6da', { rough: 1 });
    const g = group(
      at(box(0.55, 0.05, 0.55, plush, { r: 0.02 }), 0, 0, 0),
      at(cyl(0.05, 0.05, height, sisal, 14), -0.12, 0.05, -0.1),
      at(cyl(0.05, 0.05, height * 0.6, sisal, 14), 0.14, 0.05, 0.12),
      at(cyl(0.2, 0.2, 0.3, plush, 24), 0.08, 0.3, 0.05),
      at(cyl(0.12, 0.12, 0.004, mat('#3a3330'), 20), 0.08, 0.38, 0.25),
      at(cyl(0.24, 0.24, 0.04, plush, 24), 0.12, height * 0.6 + 0.05, 0.1),
      at(cyl(0.22, 0.22, 0.04, plush, 24), -0.12, height + 0.05, -0.1),
    );
    const cm = mat(cat, { rough: 1 });
    const body = at(sphere(0.12, cm, 16), -0.12, height + 0.16, -0.1); body.scale.set(1.3, 0.65, 0.9);
    const head = at(sphere(0.065, cm, 14), -0.24, height + 0.19, -0.04);
    const ear1 = at(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8), cm), -0.26, height + 0.26, -0.07);
    const ear2 = at(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8), cm), -0.24, height + 0.26, -0.01);
    g.add(body, head, ear1, ear2);
    return g;
  },

  /** Self-cleaning litter box (globe) on a mat. */
  litterRobot() {
    const shell = mat('#202227', { rough: 0.4 });
    const globe = at(sphere(0.29, shell, 28), 0, 0.42, 0);
    globe.scale.set(1, 0.95, 1);
    return group(
      at(box(0.62, 0.012, 0.85, mat('#151515', { rough: 1 }), { r: 0.01 }), 0, 0, 0.15),
      at(cyl(0.3, 0.32, 0.22, shell, 30), 0, 0.012, 0),
      globe,
      at(cyl(0.19, 0.19, 0.02, mat('#0a0a0c', { rough: 0.8 }), 26), 0, 0.46, 0.24).rotateX(Math.PI / 2),
      at(cyl(0.05, 0.05, 0.01, mat('#2a6fd6', { emissive: '#3b82f6', emissiveIntensity: 1.2 }), 16), 0, 0.2, 0.3).rotateX(Math.PI / 2),
    );
  },

  /** Pedestal sink with a framed mirror above. */
  pedestalSink({ width = 0.6 }) {
    const c = mat('#f3f1ec', { rough: 0.2 });
    const mirror = new THREE.MeshStandardMaterial({ color: '#b9c7dc', roughness: 0.1, metalness: 0.9 });
    return group(
      at(box(0.2, 0.72, 0.2, c, { r: 0.04 }), 0, 0, -0.04),
      at(box(width, 0.14, 0.46, c, { r: 0.05 }), 0, 0.72, 0),
      at(box(0.62, 0.8, 0.03, mat('#8a8e94', { metal: 0.7, rough: 0.3 }), { r: 0.01 }), 0, 1.05, -0.21),
      at(box(0.56, 0.74, 0.01, mirror, { r: 0 }), 0, 1.08, -0.195),
    );
  },

  /** Bathtub with a shower curtain along its open side. */
  tubShower({ length = 1.55 }) {
    const g = extraBuilders.tubOnly({ length });
    g.add(at(box(length, 1.45, 0.02, mat('#f6f3ee', { rough: 1 }), { r: 0 }), 0, 0.55, 0.36));
    g.add(at(cyl(0.01, 0.01, length, mat(METAL, { metal: 0.9, rough: 0.2 }), 8), 0, 2.0, 0.36).rotateZ(Math.PI / 2));
    return g;
  },
  tubOnly({ length = 1.55 }) {
    return group(at(box(length, 0.55, 0.76, mat('#f4f4f4', { rough: 0.25 }), { r: 0.08 }), 0, 0, 0));
  },

  /** Straight flight of carpeted stairs rising towards -z, open underneath. */
  stairs({ width = 1.0, length = 3.5, rise = 2.6, steps = 14, color = '#d8cbb3' }) {
    const tread = mat(color, { rough: 1 });
    const side = mat('#efe9df', { rough: 0.8 });
    const g = group();
    const run = length / steps;
    for (let i = 0; i < steps; i++) {
      const y = (rise / steps) * (i + 1);
      g.add(at(box(width, 0.05, run + 0.02, tread, { r: 0.008 }), 0, y - 0.05, length / 2 - run * (i + 0.5)));
      g.add(at(box(width, rise / steps, 0.02, side, { r: 0 }), 0, y - rise / steps, length / 2 - run * i));
    }
    const ang = Math.atan2(rise, length);
    const hyp = Math.hypot(rise, length);
    for (const sx of [-1, 1]) {
      const s = at(box(0.04, 0.22, hyp, side, { r: 0 }), sx * (width / 2 + 0.02), rise / 2 - 0.15, 0);
      s.rotation.x = ang;
      g.add(s);
    }
    return g;
  },

  /** Portable dehumidifier: white body, dark top grille, on casters. */
  dehumidifier({ width = 0.4, depth = 0.28, height = 0.6 }) {
    const body = mat('#f2f2f0', { rough: 0.35 });
    const g = group(
      at(box(width, height - 0.04, depth, body, { r: 0.04 }), 0, 0.04, 0),
      at(box(width - 0.02, 0.03, depth - 0.02, mat('#2c2e33', { rough: 0.5 }), { r: 0.012 }), 0, height - 0.01, 0),
    );
    for (let i = 0; i < 7; i++) g.add(at(box(0.012, 0.006, depth * 0.6, mat('#111'), { r: 0 }), -width * 0.3 + i * width * 0.1, height + 0.02, 0.02));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(cyl(0.02, 0.02, 0.04, mat('#222'), 10), sx * (width / 2 - 0.05), 0, sz * (depth / 2 - 0.05)));
    return g;
  },

  /** Air purifier: white body, perforated front, glowing ring on top. */
  airPurifier({ width = 0.34, depth = 0.2, height = 0.45 }) {
    const body = mat('#f4f4f2', { rough: 0.35 });
    const g = group(
      at(box(width, height, depth, body, { r: 0.04 }), 0, 0, 0),
      at(box(width - 0.02, 0.012, depth - 0.02, mat('#16171a', { rough: 0.3 }), { r: 0.006 }), 0, height - 0.004, 0),
      at(cyl(0.03, 0.03, 0.004, mat('#2a6fd6', { emissive: '#3b82f6', emissiveIntensity: 1.3 }), 20), 0, height + 0.006, 0),
    );
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      g.add(at(box(0.012, 0.025, 0.004, mat('#9a9ca3'), { r: 0 }), -width * 0.32 + c * width * 0.128, 0.08 + r * 0.045, depth / 2 + 0.001));
    }
    return g;
  },

  /** Simple low table (lamp table, end table). */
  endTable({ width = 0.5, depth = 0.45, height = 0.6, color = '#2a211b' }) {
    const m = mat(color, { rough: 0.6 });
    return group(at(box(width, 0.04, depth, m, { r: 0.01 }), 0, height - 0.04, 0), ...legs4(width, depth, height - 0.04, m, 0.03, 0.018),
      at(box(width - 0.06, 0.02, depth - 0.06, m, { r: 0 }), 0, 0.15, 0));
  },
};

export const extraFootprints = {
  poolTable: (i) => [i.width || 2.5, i.depth || 1.4],
  sectional: (i) => [i.width || 2.6, (i.depth || 0.95) + (i.chaise ?? 0.85)],
  glassCabinet: (i) => [i.width || 0.9, 0.4],
  mediaWall: (i) => [i.width || 1.75, 0.45],
  barCart: (i) => [i.width || 0.95, 0.4],
  treadmill: (i) => [i.width || 0.85, i.length || 1.9],
  popcornMachine: () => [0.6, 0.46],
  pokerTable: (i) => [(i.diameter || 1.3) + 0.9, (i.diameter || 1.3) + 0.9],
  wetBar: (i) => [i.width || 1.85, 0.62],
  darkBookcase: (i) => [i.width || 0.8, 0.38],
  deskSetup: (i) => [i.width || 2.0, (i.depth || 0.7) + 0.6],
  catTree: () => [0.55, 0.55],
  litterRobot: () => [0.62, 0.85],
  pedestalSink: (i) => [i.width || 0.6, 0.46],
  tubShower: (i) => [i.length || 1.55, 0.78],
  tubOnly: (i) => [i.length || 1.55, 0.78],
  stairs: (i) => [i.width || 1.0, i.length || 3.5],
  endTable: (i) => [i.width || 0.5, i.depth || 0.45],
};

/* ------------------------------ light fixtures ------------------------------ */

function glowMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#8d8f96', roughness: 0.6, emissive: '#000000', emissiveIntensity: 1 });
}
function spotLight(intensity, x, y, z, shadow = true) {
  const l = new THREE.SpotLight(0xffffff, 0, 0, 1.15, 0.8, 2);
  l.position.set(x, y, z);
  l.target.position.set(x, y - 1, z);
  l.castShadow = shadow;
  if (shadow) {
    l.shadow.mapSize.set(1024, 1024); l.shadow.camera.near = 0.15; l.shadow.camera.far = 9;
    l.shadow.bias = -0.0006; l.shadow.normalBias = 0.03; l.shadow.radius = 5;
  }
  l.userData.max = intensity;
  return l;
}
function pointLight(intensity, x, y, z, distance = 3.5) {
  const l = new THREE.PointLight(0xffffff, 0, distance, 2);
  l.position.set(x, y, z);
  l.userData.max = intensity;
  return l;
}
// Positions given in plan coordinates ("points": [[x, z], ...]) relative to the light's "pos".
const rel = (cfg) => (cfg.points || [cfg.pos]).map((p) => [p[0] - cfg.pos[0], p[1] - cfg.pos[1], p[2] || 0]);

export const extraFixtures = {
  /** Ceiling fan with a bowl light; the light entity drives the bowl. */
  fan(cfg, H) {
    const y = cfg.y ?? H - 0.35;
    const blade = mat(cfg.blades || '#3a2c22', { rough: 0.7 });
    // ha3d: the blades turn together (src/ha/live.js spins them with a fan entity)
    const blades = new THREE.Group();
    blades.name = 'fan-blades';
    const parts = [
      at(cyl(0.015, 0.015, H - y - 0.12, mat(DARK), 8), 0, y + 0.12, 0),
      at(cyl(0.11, 0.13, 0.12, mat(DARK, { rough: 0.4, metal: 0.4 }), 24), 0, y + 0.02, 0),
      blades,
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const b = at(box(0.62, 0.012, 0.13, blade, { r: 0.006 }), Math.cos(a) * 0.42, y + 0.08, Math.sin(a) * 0.42);
      b.rotation.y = -a;
      blades.add(b);
    }
    const bowl = at(sphere(0.15, glowMaterial(), 24), 0, y - 0.02, 0);
    bowl.scale.y = 0.55;
    return { parts, glow: [bowl], lights: [spotLight(cfg.intensity ?? 16, 0, y - 0.1, 0)], hit: [1.2, 0.5, 1.2, y] };
  },

  /** Bar with two dome shades (billiard / island light). "length" along x. */
  pendantBar(cfg, H) {
    const y = cfg.y ?? 1.55;
    const L = cfg.length ?? 1.3;
    const metal = new THREE.MeshStandardMaterial({ color: cfg.shade || '#cfccc4', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide });
    const parts = [
      at(box(L, 0.025, 0.025, mat(DARK, { rough: 0.4, metal: 0.5 }), { r: 0.006 }), 0, y + 0.38, 0),
      at(cyl(0.006, 0.006, H - y - 0.4, mat('#777', { metal: 0.8 }), 6), 0, y + 0.4, 0),
    ];
    const glow = [];
    const lights = [];
    for (const sx of [-1, 1]) {
      const x = sx * L / 2 * 0.85;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), metal);
      dome.position.set(x, y + 0.02, 0);
      const inner = at(cyl(0.16, 0.16, 0.02, glowMaterial(), 24), x, y - 0.02, 0);
      parts.push(dome, at(cyl(0.004, 0.004, 0.18, mat(DARK), 6), x, y + 0.2, 0));
      glow.push(inner);
      lights.push(spotLight((cfg.intensity ?? 18) / 2, x, y - 0.05, 0, sx < 0));
    }
    return { parts, glow, lights, hit: [L + 0.4, 0.6, 0.6, y] };
  },

  /** Wall sconces sharing one switch. "points": [[x, z, rotDeg], ...]; rot faces the glow away from the wall. */
  sconce(cfg) {
    const y = cfg.y ?? 1.75;
    const parts = [];
    const glow = [];
    const lights = [];
    const per = (cfg.intensity ?? 4.5) / Math.max(1, rel(cfg).length);
    for (const [x, z, rot] of rel(cfg)) {
      const r = THREE.MathUtils.degToRad(rot);
      const dx = Math.sin(r) * 0.09, dz = Math.cos(r) * 0.09;
      const plate = at(box(0.08, 0.22, 0.02, mat('#8f939a', { metal: 0.7, rough: 0.3 }), { r: 0.005 }), x, y - 0.1, z);
      plate.rotation.y = r;
      parts.push(plate);
      glow.push(at(cyl(0.05, 0.05, 0.2, glowMaterial(), 20), x + dx, y - 0.08, z + dz));
      lights.push(pointLight(per, x + dx * 2, y, z + dz * 2, 3.2));
    }
    return { parts, glow, lights, hit: [0.6, 0.6, 0.6, y] };
  },

  /** Recessed ceiling cans sharing one switch. "points": [[x, z], ...]. */
  cans(cfg, H) {
    const y = cfg.y ?? H - 0.02;
    const pts = rel(cfg);
    const per = (cfg.intensity ?? 48) / Math.max(1, pts.length);
    const parts = [];
    const glow = [];
    const lights = [];
    pts.forEach(([x, z], i) => {
      parts.push(at(cyl(0.09, 0.09, 0.012, mat('#d9d9d6', { rough: 0.4 }), 24), x, y + 0.006, z));
      glow.push(at(cyl(0.065, 0.065, 0.014, glowMaterial(), 24), x, y, z));
      lights.push(spotLight(per, x, y - 0.03, z, i === 0));
    });
    return { parts, glow, lights, hit: [0.7, 0.4, 0.7, y] };
  },

  /** Flush dome ceiling light. */
  dome(cfg, H) {
    const y = cfg.y ?? H - 0.08;
    const d = at(sphere(0.2, glowMaterial(), 24), 0, y, 0);
    d.scale.y = 0.35;
    return {
      parts: [at(cyl(0.22, 0.22, 0.03, mat('#3a2c22', { rough: 0.5, metal: 0.3 }), 28), 0, y + 0.03, 0)],
      glow: [d],
      lights: [spotLight(cfg.intensity ?? 18, 0, y - 0.05, 0)],
      hit: [0.6, 0.4, 0.6, y],
    };
  },
};

export const EXTRA_LIGHT_TYPES = Object.keys(extraFixtures);

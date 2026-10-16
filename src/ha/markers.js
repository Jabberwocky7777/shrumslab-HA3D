// A plan entity (TV, thermostat, lock...) in the 3D view: a small glowing orb with the
// device's icon floating above it, eased and hovered like upstream's lamps. The icon is
// painted on a canvas from lucide's drawing data, so nothing is loaded from anywhere.
import * as THREE from 'three';
import { iconNode } from '../../upstream/ui/icons.js';

const SIZE = 128;

export const MARKER_COLORS = {
  idle: '#5b6b93',     // off, closed, locked, idle
  active: '#ffbd7a',   // on, playing, heating
  alert: '#ff7a5c',    // unlocked, open, triggered
  unavailable: '#3a3f4c',
};

export function drawIcon(g, name, color) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [tag, a] of iconNode(name)) {
    const n = (k, d = 0) => Number(a[k] ?? d);
    g.beginPath();
    if (tag === 'path') { g.stroke(new Path2D(a.d)); continue; }
    if (tag === 'circle') g.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    else if (tag === 'ellipse') g.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
    else if (tag === 'line') { g.moveTo(n('x1'), n('y1')); g.lineTo(n('x2'), n('y2')); }
    else if (tag === 'rect') g.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx', n('ry')));
    else if (tag === 'polyline' || tag === 'polygon') {
      const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, pts[i], pts[i + 1]);
      if (tag === 'polygon') g.closePath();
    }
    g.stroke();
  }
  g.restore();
}

export class EntityMarker {
  constructor(cfg) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.group = new THREE.Group();
    this.group.position.set(cfg.pos[0], 0, cfg.pos[1]);
    this.y = cfg.y;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }));
    this.badge.scale.setScalar(0.42);
    this.badge.position.y = 0.26;
    this.badge.renderOrder = 2;

    this.orbMaterial = new THREE.MeshStandardMaterial({ color: '#8d8f96', roughness: 0.5, emissive: MARKER_COLORS.idle, emissiveIntensity: 0.6 });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), this.orbMaterial);
    this.light = new THREE.PointLight(0xffffff, 0, 2.2, 2);
    this.light.position.y = this.y;

    // Scaled around the orb (hover, tap pulse), the way upstream's lamps are.
    this.model = new THREE.Group();
    this.model.position.y = this.y;
    this.model.add(this.badge, this.orb);
    this.group.add(this.model, this.light);

    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.5), new THREE.MeshBasicMaterial());
    this.hit.position.y = this.y + 0.15;
    this.hit.visible = false;
    this.hit.userData = { kind: 'entity', id: cfg.id };
    this.group.add(this.hit);

    this.level = 0;
    this.goal = 0;
    this.color = new THREE.Color(MARKER_COLORS.idle);
    this.goalColor = this.color.clone();
    this.hover = 0;
    this.hoverGoal = 0;
    this.pulse = 0;
    this.painted = null;
    this.paint('idle', null);
  }

  anchor(out) {
    return out.set(0, this.y + 0.5, 0).applyMatrix4(this.group.matrixWorld);
  }

  /** look: idle | active | alert | unavailable; label: short text under the icon ("21°") or null */
  apply(look, label = null) {
    this.goal = look === 'active' || look === 'alert' ? 1 : 0;
    this.goalColor.set(MARKER_COLORS[look] || MARKER_COLORS.idle);
    this.paint(look, label);
  }

  bump() { this.pulse = 1; }

  paint(look, label) {
    const key = `${look}|${label}`;
    if (key === this.painted) return;
    this.painted = key;
    const g = this.canvas.getContext('2d');
    const s = SIZE;
    const on = look === 'active' || look === 'alert';
    const tint = MARKER_COLORS[look] || MARKER_COLORS.idle;
    g.clearRect(0, 0, s, s);
    // a glass disc like upstream's tile bubbles
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    g.fillStyle = on ? 'rgba(22, 26, 38, 0.82)' : 'rgba(14, 18, 30, 0.72)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = on ? tint : 'rgba(255, 255, 255, 0.18)';
    g.stroke();
    const iconColor = look === 'unavailable' ? 'rgba(255,255,255,0.35)' : on ? tint : 'rgba(230, 236, 250, 0.85)';
    const scale = label ? 2.1 : 2.8;
    g.save();
    g.translate(s / 2 - 12 * scale, (label ? s * 0.4 : s / 2) - 12 * scale);
    g.scale(scale, scale);
    drawIcon(g, this.cfg.icon, iconColor);
    g.restore();
    if (label) {
      g.fillStyle = '#f3f5fa';
      g.font = '600 30px -apple-system, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, s / 2, s * 0.77);
    }
    this.texture.needsUpdate = true;
  }

  update(dt) {
    const dl = this.goal - this.level;
    const dh = this.hoverGoal - this.hover;
    const dc = Math.abs(this.color.r - this.goalColor.r) + Math.abs(this.color.g - this.goalColor.g) + Math.abs(this.color.b - this.goalColor.b);
    if (Math.abs(dl) < 0.002 && Math.abs(dh) < 0.004 && dc < 0.004 && this.pulse < 0.004) {
      if (this.level === this.goal && this.hover === this.hoverGoal && this.pulse === 0) return false;
      this.level = this.goal; this.hover = this.hoverGoal; this.pulse = 0;
      this.color.copy(this.goalColor);
      this.write();
      return true;
    }
    this.level += dl * (1 - Math.exp(-dt * 6));
    this.hover += dh * (1 - Math.exp(-dt * 14));
    this.pulse *= Math.exp(-dt * 7);
    this.color.lerp(this.goalColor, 1 - Math.exp(-dt * 6));
    this.write();
    return true;
  }

  write() {
    this.orbMaterial.emissive.copy(this.color);
    this.orbMaterial.emissiveIntensity = 0.6 + this.level * 2.2 + this.hover * 0.5;
    this.light.color.copy(this.color);
    this.light.intensity = this.level * 0.9;
    this.model.scale.setScalar(1 + this.hover * 0.14 + Math.sin(this.pulse * Math.PI) * 0.22);
  }
}

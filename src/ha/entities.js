// Plan `entities` (brief section 3.5): what a tap or hold does, how the device looks in the
// 3D view, and its tile in the panel. The actions themselves are Home Assistant's own.
import { h } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';
import { effectiveAction, domainOf } from './sensitive.js';
import { availabilityOf, isActive, isAlert, temperatureLabel } from './mapping.js';
import { MARKER_COLORS } from './markers.js';

/** Fires Home Assistant's `hass-more-info` event, which opens its own dialog for the entity. */
export function moreInfo(node, entityId) {
  node.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

/** Navigates the Home Assistant frontend to a dashboard path, as its own cards do. */
export function navigate(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return;
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}

/** Runs the tap or hold action of a plan entity. Returns what it did, for tests. */
export function runAction(node, hass, cfg, which = 'tap') {
  const action = effectiveAction(cfg.entity, which === 'hold' ? cfg.hold : cfg.tap);
  if (action === 'navigate') { navigate(cfg.path); return 'navigate'; }
  if (action === 'toggle' && hass?.states[cfg.entity] && !availabilityOf(hass.states[cfg.entity])) {
    haptic('light');
    return hass.callService(domainOf(cfg.entity), 'toggle', { entity_id: cfg.entity })
      .then(() => 'toggle', (e) => { haptic('error'); throw e; });
  }
  moreInfo(node, cfg.entity);
  return 'more-info';
}

/** idle | active | alert | unavailable */
export function lookOf(cfg, stateObj) {
  if (availabilityOf(stateObj)) return 'unavailable';
  if (isAlert(cfg.entity, stateObj)) return 'alert';
  return isActive(stateObj) ? 'active' : 'idle';
}

export function statusText(hass, cfg, stateObj) {
  const missing = availabilityOf(stateObj);
  if (missing) return missing;
  const temp = cfg.show === 'temperature' ? temperatureLabel(stateObj) : null;
  let text;
  try {
    text = hass.formatEntityState ? hass.formatEntityState(stateObj) : null;
  } catch { text = null; }
  if (!text) {
    const unit = stateObj.attributes?.unit_of_measurement;
    text = String(stateObj.state).replace(/_/g, ' ');
    text = text.charAt(0).toUpperCase() + text.slice(1) + (unit ? ` ${unit}` : '');
  }
  return temp ? `${temp} · ${text}` : text;
}

/** The marker label in the 3D view: the temperature for `show: temperature`. */
export function labelOf(cfg, stateObj) {
  return cfg.show === 'temperature' && !availabilityOf(stateObj) ? temperatureLabel(stateObj) : null;
}

/**
 * A tile in upstream's style for a plan entity: tap runs `tap`, touch-and-hold runs `hold`.
 * `host` is the card element (it fires hass-more-info); `getHass` returns the current hass.
 */
export function entityTile(cfg, { host, getHass, onAction }) {
  const sub = h('div.tile-sub');
  const el = h('div.tile.entity', { role: 'button', tabindex: 0, 'aria-label': cfg.name, 'data-entity': cfg.entity },
    h('div.bubble', icon(cfg.icon, 19)),
    h('div.tile-text', h('div.tile-name', cfg.name), sub));

  const act = (which) => {
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 260);
    Promise.resolve(runAction(host, getHass(), cfg, which)).then(onAction, (e) => onAction?.(null, e));
  };

  let press = null;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    press = { x: ev.clientX, y: ev.clientY, held: false };
    el.classList.add('pressed');
    press.timer = setTimeout(() => {
      if (!press) return;
      press.held = true;
      el.classList.remove('pressed');
      haptic('medium');
      act('hold');
    }, 450);
  });
  el.addEventListener('pointermove', (ev) => {
    if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; el.classList.remove('pressed'); }
  });
  const end = (ev) => {
    if (!press) return;
    clearTimeout(press.timer);
    const tapped = !press.held && ev.type === 'pointerup';
    press = null;
    el.classList.remove('pressed');
    if (tapped) act('tap');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  el.addEventListener('keydown', (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); act('tap'); }
  });

  return {
    el, cfg, kind: 'entity',
    update() {
      const hass = getHass();
      const st = hass?.states[cfg.entity];
      const look = lookOf(cfg, st);
      el.classList.toggle('on', look === 'active' || look === 'alert');
      el.classList.toggle('alert', look === 'alert');
      el.classList.toggle('unavailable', look === 'unavailable');
      el.style.setProperty('--c', MARKER_COLORS[look]);
      sub.textContent = hass ? statusText(hass, cfg, st) : '';
    },
  };
}

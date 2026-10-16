// Plan `entities` (brief section 3.5): what a tap or hold does, how the device looks in the
// 3D view, and its tile in the panel. The actions themselves are Home Assistant's own.
import { h } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';
import { effectiveActionConfig } from './sensitive.js';
import { availabilityOf, isActive, isAlert, temperatureLabel } from './mapping.js';
import { MARKER_COLORS } from './markers.js';

/**
 * Hands a gesture to Home Assistant's own action handling: the frontend listens for `hass-action`
 * (src/state/action-mixin.ts) and runs it with handleAction, confirmations included. What is sent
 * has been through effectiveActionConfig: a sensitive device only ever gets more-info.
 */
export function fireAction(node, entity, which, actionConfig) {
  node.dispatchEvent(new CustomEvent('hass-action', {
    detail: { config: { entity, [`${which}_action`]: actionConfig }, action: which },
    bubbles: true, composed: true,
  }));
}

/**
 * Runs the tap, hold or double_tap action of a plan entity (or a light with an override).
 * Returns the action that was run ('more-info', 'toggle'...), or null when there was none.
 */
export function runAction(node, hass, cfg, which = 'tap') {
  const own = cfg[`${which}_action`];
  if (!own && which === 'double_tap') return null;
  let action = effectiveActionConfig(cfg.entity, own || { action: 'more-info' });
  // An entity that is unavailable cannot be toggled: show its dialog instead.
  if (action.action === 'toggle' && availabilityOf(hass?.states?.[cfg.entity])) action = { action: 'more-info' };
  if (action.action === 'none') return 'none';
  fireAction(node, cfg.entity, which, action);
  return action.action;
}

/**
 * A tap handler that tells single from double taps when the item has a double_tap_action
 * (Home Assistant waits 250 ms the same way); without one a tap acts at once.
 */
export function doubleTapper(cfg, act, wait = 250) {
  let timer = 0;
  return () => {
    if (!cfg.double_tap_action) { act('tap'); return; }
    if (timer) { clearTimeout(timer); timer = 0; act('double_tap'); return; }
    timer = setTimeout(() => { timer = 0; act('tap'); }, wait);
  };
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
  // With a double_tap_action a single tap waits a moment for the second one.
  const tapped = doubleTapper(cfg, act);

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
    const wasTap = !press.held && ev.type === 'pointerup';
    press = null;
    el.classList.remove('pressed');
    if (wasTap) tapped();
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

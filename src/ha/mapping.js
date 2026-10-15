// Home Assistant state  <->  house-control device state (brief section 3.4).
// Pure functions: no DOM, no hass connection, so they are unit tested on their own.
import { domainOf, LIGHT_DOMAINS, AC_DOMAINS } from './sensitive.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const UNAVAILABLE = new Set(['unavailable', 'unknown']);

/** null when the entity can be used, otherwise the reason shown on its tile. */
export function availabilityOf(stateObj) {
  if (!stateObj) return 'Not found';
  if (UNAVAILABLE.has(stateObj.state)) return 'Unavailable';
  return null;
}

/* ---------- colours ---------- */

export function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  return `#${rgb.slice(0, 3).map((c) => clamp(Math.round(Number(c) || 0), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- lights ---------- */

const COLOR_MODES = new Set(['hs', 'rgb', 'rgbw', 'rgbww', 'xy']);

/**
 * What a light can do, from `supported_color_modes`, in house-control's terms
 * (`brightness`, `temp`, `color`). A `switch.*` and an `onoff` light are on/off only.
 */
export function capabilitiesFrom(entityId, stateObj) {
  if (domainOf(entityId) !== 'light') return [];
  const modes = stateObj?.attributes?.supported_color_modes || [];
  const caps = new Set();
  for (const mode of modes) {
    if (mode === 'onoff') continue;
    caps.add('brightness'); // every colour mode other than onoff can dim
    if (mode === 'color_temp') caps.add('temp');
    if (COLOR_MODES.has(mode)) caps.add('color');
  }
  return ['brightness', 'temp', 'color'].filter((c) => caps.has(c));
}

/** The house-control light state that Home Assistant reports for this entity. */
export function lightFromHa(stateObj) {
  if (!stateObj || UNAVAILABLE.has(stateObj.state)) return null;
  const a = stateObj.attributes || {};
  const out = { on: stateObj.state === 'on' };
  if (!out.on) return out; // an off light reports no brightness or colour
  if (Number.isFinite(a.brightness)) out.brightness = clamp(a.brightness / 255, 0, 1);
  const mode = a.color_mode;
  if (mode === 'color_temp' && Number.isFinite(a.color_temp_kelvin)) {
    out.temp = a.color_temp_kelvin;
    out.color = null;
  } else if (COLOR_MODES.has(mode) && Array.isArray(a.rgb_color)) {
    out.color = rgbToHex(a.rgb_color);
  }
  return out;
}

/**
 * The Home Assistant service call for a change made in the card. `patch` holds what changed,
 * `state` the light's whole state after the change. Returns null when nothing is to be sent.
 */
export function lightCall(entityId, patch, state = {}) {
  const domain = domainOf(entityId);
  if (!LIGHT_DOMAINS.has(domain)) throw new Error(`${entityId} cannot be switched as a light`);
  const on = 'on' in patch ? patch.on : state.on;
  if (on === false) return { domain, service: 'turn_off', data: { entity_id: entityId } };
  const data = { entity_id: entityId };
  if (domain === 'light') {
    if (Number.isFinite(patch.brightness)) data.brightness = clamp(Math.round(patch.brightness * 255), 1, 255);
    if (Number.isFinite(patch.temp)) data.color_temp_kelvin = Math.round(patch.temp);
    if (patch.color) {
      const rgb = hexToRgb(patch.color);
      if (rgb) data.rgb_color = rgb;
    }
  }
  if (Object.keys(data).length === 1 && !('on' in patch)) return null; // a white/colour reset only
  return { domain, service: 'turn_on', data };
}

/* ---------- air conditioners (climate.*) ---------- */

const HVAC_TO_MODE = { cool: 'cool', heat: 'heat', dry: 'dry', fan_only: 'fan', auto: 'auto', heat_cool: 'auto' };
const FANS = ['auto', 'low', 'medium', 'high', 'turbo'];

/** The house-control AC state Home Assistant reports for a climate entity. */
export function acFromHa(stateObj) {
  if (!stateObj || UNAVAILABLE.has(stateObj.state)) return null;
  const a = stateObj.attributes || {};
  const out = { on: stateObj.state !== 'off' };
  if (HVAC_TO_MODE[stateObj.state]) out.mode = HVAC_TO_MODE[stateObj.state];
  if (Number.isFinite(a.temperature)) out.target = Math.round(a.temperature);
  if (Number.isFinite(a.current_temperature)) out.roomTemp = a.current_temperature;
  if (FANS.includes(a.fan_mode)) out.fan = a.fan_mode;
  return out;
}

/** What the AC sheet may offer for this climate entity. */
export function acFeaturesFromHa(stateObj) {
  const a = stateObj?.attributes || {};
  const modes = [...new Set((a.hvac_modes || []).map((m) => HVAC_TO_MODE[m]).filter(Boolean))];
  const fans = (a.fan_modes || []).filter((f) => FANS.includes(f));
  return { modes, fans, sleep: false, eco: false, swing: false };
}

/** Service calls (in order) for a change made in the card's AC sheet. */
export function acCalls(entityId, patch, stateObj) {
  if (!AC_DOMAINS.has(domainOf(entityId))) throw new Error(`${entityId} is not a climate entity`);
  const calls = [];
  const base = { entity_id: entityId };
  const hvacModes = stateObj?.attributes?.hvac_modes || [];
  const hvacFor = (mode) => {
    if (mode === 'fan') return 'fan_only';
    if (mode === 'auto') return hvacModes.includes('heat_cool') && !hvacModes.includes('auto') ? 'heat_cool' : 'auto';
    return mode;
  };
  if (patch.on === false) return [{ domain: 'climate', service: 'turn_off', data: base }];
  if ('mode' in patch) calls.push({ domain: 'climate', service: 'set_hvac_mode', data: { ...base, hvac_mode: hvacFor(patch.mode) } });
  else if (patch.on === true) calls.push({ domain: 'climate', service: 'turn_on', data: base });
  if (Number.isFinite(patch.target)) calls.push({ domain: 'climate', service: 'set_temperature', data: { ...base, temperature: patch.target } });
  if (patch.fan) calls.push({ domain: 'climate', service: 'set_fan_mode', data: { ...base, fan_mode: patch.fan } });
  return calls;
}

/* ---------- plan entities ---------- */

const ACTIVE = new Set(['on', 'open', 'opening', 'closing', 'unlocked', 'unlocking', 'playing', 'paused', 'buffering',
  'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'cleaning', 'home', 'triggered', 'streaming', 'recording',
  'armed_away', 'armed_home', 'armed_night', 'armed_vacation', 'armed_custom_bypass', 'arming', 'pending', 'jammed']);

/** Whether an entity counts as "on" for its glow: a playing TV, an open cover, a heating thermostat. */
export function isActive(stateObj) {
  return Boolean(stateObj && ACTIVE.has(stateObj.state));
}

/** Whether the active state of this entity is one to draw attention to (unlocked, open, alarm). */
export function isAlert(entityId, stateObj) {
  const d = domainOf(entityId);
  const s = stateObj?.state;
  return (d === 'lock' && (s === 'unlocked' || s === 'jammed' || s === 'open'))
    || (d === 'cover' && (s === 'open' || s === 'opening'))
    || (d === 'alarm_control_panel' && s === 'triggered')
    || (d === 'valve' && s === 'open')
    || (d === 'siren' && s === 'on');
}

/** `current_temperature` as shown on a climate entity's icon ("21°"), or null. */
export function temperatureLabel(stateObj) {
  const t = stateObj?.attributes?.current_temperature;
  return Number.isFinite(t) ? `${Math.round(t)}°` : null;
}

const DOMAIN_ICONS = {
  media_player: 'tv', climate: 'thermo', fan: 'fan', lock: 'lock', alarm_control_panel: 'alarm', camera: 'camera',
  siren: 'siren', valve: 'water', switch: 'switch', light: 'lightbulb', sensor: 'sensor', binary_sensor: 'sensor',
  vacuum: 'robot', script: 'play', scene: 'sparkles', input_boolean: 'switch', water_heater: 'heater', humidifier: 'water',
};

/** A sensible icon for an entity the plan gives none. */
export function defaultIcon(entityId, stateObj) {
  const d = domainOf(entityId);
  if (d === 'cover') {
    const cls = stateObj?.attributes?.device_class;
    return cls === 'garage' || cls === 'gate' ? 'garage' : cls === 'door' ? 'door' : 'blinds';
  }
  return DOMAIN_ICONS[d] || 'box';
}

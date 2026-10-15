// Replaces upstream's native bridge for device I/O (brief section 3.3).
//   Out: the store's transmit(kind, id, patch, state) becomes a Home Assistant service call.
//        A rejected call rejects the promise, so upstream's batching rolls the change back.
//   In:  sync(hass) turns hass.states into store.applyRemote({ lights, acs, features }).
import {
  availabilityOf, lightFromHa, lightCall, acFromHa, acFeaturesFromHa, acCalls, capabilitiesFrom,
} from './mapping.js';
import { haLink } from './validate.js';
import { canBulk, LIGHT_DOMAINS, AC_DOMAINS, domainOf } from './sensitive.js';

// After the card changes a device, Home Assistant reports the intermediate states back while
// a slider is still being dragged. Those echoes are held back for a moment so the slider does
// not jump; the state that is current once things settle is then adopted as usual.
const ECHO_HOLD_MS = 1500;

export function createHaBridge(config, { getHass, onSettled = () => {} }) {
  const lightCfg = new Map(config.lights.map((l) => [l.id, l]));
  const acCfg = new Map(config.acs.map((a) => [a.id, a]));
  const quietUntil = new Map(); // device id -> time before which its reported state is held back
  const seen = new Map();       // entity id -> the state object last applied
  let settleTimer = 0;

  const entityOf = (kind, id) => haLink(kind === 'light' ? lightCfg.get(id) : acCfg.get(id));

  function availability(kind, id) {
    const cfg = kind === 'light' ? lightCfg.get(id) : acCfg.get(id);
    if (!cfg) return 'Not found';
    const entity = haLink(cfg);
    if (!entity) return cfg.link || cfg.tuya ? 'Not in Home Assistant' : null; // unlinked: simulated
    return availabilityOf(getHass()?.states?.[entity]);
  }

  async function transmit(kind, id, patch, state) {
    const entity = entityOf(kind, id);
    if (!entity) return; // a simulated device: nothing to send
    const hass = getHass();
    if (!hass) throw new Error('Not connected to Home Assistant');
    // Lights and ACs are changed by scenes and All on/off too: only the bulk domains may be.
    if (!canBulk(entity)) throw new Error(`${entity} cannot be changed from here`);
    const calls = kind === 'light'
      ? [LIGHT_DOMAINS.has(domainOf(entity)) ? lightCall(entity, patch, state) : null]
      : AC_DOMAINS.has(domainOf(entity)) ? acCalls(entity, patch, hass.states[entity]) : [];
    quietUntil.set(id, performance.now() + ECHO_HOLD_MS);
    try {
      for (const c of calls) if (c) await hass.callService(c.domain, c.service, c.data);
    } finally {
      quietUntil.set(id, performance.now() + ECHO_HOLD_MS);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(onSettled, ECHO_HOLD_MS + 50);
    }
  }

  /** Lights whose plan lists no capabilities get them from supported_color_modes. */
  function applyCapabilities(hass) {
    let changed = false;
    for (const l of config.lights) {
      const entity = haLink(l);
      if (!l.autoCapabilities || !entity || !hass.states[entity]) continue;
      const caps = capabilitiesFrom(entity, hass.states[entity]);
      if (caps.join() !== l.capabilities.join()) { l.capabilities = caps; changed = true; }
    }
    for (const a of config.acs) {
      const st = hass.states[haLink(a)];
      if (!a.autoRange || !st) continue;
      const { min_temp: min, max_temp: max } = st.attributes;
      if (Number.isFinite(min) && Number.isFinite(max) && (a.min !== Math.round(min) || a.max !== Math.round(max))) {
        a.min = Math.round(min); a.max = Math.round(max); changed = true;
      }
    }
    return changed;
  }

  /** A signature of what the UI is built from; when it changes the card rebuilds. */
  function shape() {
    return JSON.stringify([config.lights.map((l) => l.capabilities), config.acs.map((a) => [a.min, a.max])]);
  }

  /**
   * Applies the states Home Assistant reports. Returns true when anything the card shows may
   * have changed (states or availability), so the caller can refresh tiles and markers.
   */
  function sync(hass, store, { force = false } = {}) {
    const now = performance.now();
    const update = { lights: {}, acs: {}, features: {} };
    let touched = false;
    let held = false;
    const fresh = (entity) => {
      const st = hass.states[entity];
      if (!force && seen.get(entity) === st) return false;
      return true;
    };
    const take = (entity) => { seen.set(entity, hass.states[entity]); touched = true; };

    for (const l of config.lights) {
      const entity = haLink(l);
      if (!entity || !fresh(entity)) continue;
      if ((quietUntil.get(l.id) || 0) > now) { held = true; continue; }
      take(entity);
      const patch = lightFromHa(hass.states[entity]);
      if (!patch) continue;
      const cur = store.state.lights[l.id];
      // Home Assistant has 255 brightness steps: a rounding difference is not a change.
      if ('brightness' in patch && Math.abs(patch.brightness - cur.brightness) < 0.006) delete patch.brightness;
      update.lights[l.id] = patch;
    }
    for (const a of config.acs) {
      const entity = haLink(a);
      const sensor = a.sensor?.service === 'homeassistant' ? a.sensor.id : null;
      const unitFresh = entity && fresh(entity);
      const sensorFresh = sensor && fresh(sensor);
      if (!unitFresh && !sensorFresh) continue;
      if ((quietUntil.get(a.id) || 0) > now) { held = true; continue; }
      const patch = {};
      if (unitFresh) {
        take(entity);
        Object.assign(patch, acFromHa(hass.states[entity]) || {});
        if (hass.states[entity]) update.features[a.id] = acFeaturesFromHa(hass.states[entity]);
      }
      if (sensor) {
        if (sensorFresh) take(sensor);
        const t = Number(hass.states[sensor]?.state);
        if (Number.isFinite(t)) patch.roomTemp = t;
      }
      if (Object.keys(patch).length) update.acs[a.id] = patch;
    }
    if (held) { clearTimeout(settleTimer); settleTimer = setTimeout(onSettled, ECHO_HOLD_MS + 50); }
    store.applyRemote(update);
    return touched;
  }

  return {
    transmit,
    availability,
    canWrite: (kind, id) => !availability(kind, id),
    applyCapabilities,
    shape,
    sync,
    dispose() { clearTimeout(settleTimer); },
  };
}

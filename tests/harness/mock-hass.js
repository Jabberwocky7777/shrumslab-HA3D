// A stand-in for Home Assistant's `hass` object, with the demo house's entities only.
// callService records every call and updates the fake states the way Home Assistant would.

const light = (id, name, modes, extra = {}) => [id, {
  entity_id: id, state: 'off',
  attributes: { friendly_name: name, supported_color_modes: modes, color_mode: null, brightness: null, ...extra },
}];
const plain = (id, name, state, attributes = {}) => [id, { entity_id: id, state, attributes: { friendly_name: name, ...attributes } }];

export function demoStates() {
  return Object.fromEntries([
    light('light.demo_living_ceiling', 'Living ceiling', ['color_temp']),
    plain('switch.demo_floor_lamp', 'Floor lamp', 'off'),
    light('light.demo_tv_backlight', 'TV backlight', ['hs']),
    light('light.demo_dining_pendant', 'Dining pendant', ['color_temp']),
    light('light.demo_kitchen_spots', 'Kitchen spots', ['brightness']),
    light('light.demo_kitchen_counter', 'Kitchen counter', ['color_temp']),
    light('light.demo_bedroom_ceiling', 'Bedroom ceiling', ['color_temp']),
    light('light.demo_bedside_left', 'Bedside left', ['onoff']),
    light('light.demo_bedside_right', 'Bedside right', ['onoff']),
    light('light.demo_bath_ceiling', 'Bath ceiling', ['brightness']),
    light('light.demo_bath_mirror', 'Bath mirror', ['color_temp']),
    light('light.demo_office_ceiling', 'Office ceiling', ['brightness']),
    plain('switch.demo_desk_lamp', 'Desk lamp', 'on'),
    plain('switch.demo_office_fan', 'Office fan', 'off'),
    light('light.demo_hall_ceiling', 'Hall ceiling', ['color_temp']),
    light('light.demo_rec_cans', 'Rec room cans', ['brightness']),
    light('light.demo_rec_pool_table', 'Pool table light', ['color_temp']),
    light('light.demo_rec_sconces', 'Rec room sconces', ['onoff']),
    light('light.demo_rec_fan_light', 'Rec room fan light', ['brightness']),
    light('light.demo_rec_dome', 'Rec room entry', ['onoff']),
    light('light.demo_bar_pendants', 'Bar pendants', ['color_temp']),
    light('light.demo_bar_cans', 'Bar cans', ['brightness']),
    light('light.demo_gym_ceiling', 'Gym ceiling', ['brightness']),
    light('light.demo_utility_light', 'Utility light', ['onoff']),
    plain('climate.demo_bedroom_ac', 'Bedroom AC', 'off', {
      hvac_modes: ['off', 'cool', 'heat', 'fan_only', 'auto'], fan_modes: ['auto', 'low', 'high'],
      temperature: 23, current_temperature: 25.5, min_temp: 16, max_temp: 30, fan_mode: 'auto',
    }),
    plain('media_player.demo_tv', 'TV', 'playing', { media_title: 'Demo', entity_picture: '/tests/harness/demo-screen.svg' }),
    plain('media_player.demo_rec_tv', 'Rec room TV', 'off'),
    plain('fan.demo_bedroom_fan', 'Ceiling fan', 'off'),
    plain('switch.demo_coffee_maker', 'Coffee maker', 'off'),
    plain('climate.demo_thermostat', 'Thermostat', 'heat', { current_temperature: 21.4, temperature: 22, hvac_modes: ['off', 'heat'] }),
    plain('lock.demo_front_door', 'Front door', 'locked', { code_format: '^\\d{4}$' }),
    plain('cover.demo_garage_door', 'Garage door', 'closed', { device_class: 'garage' }),
    plain('camera.demo_porch', 'Porch camera', 'idle'),
    plain('script.demo_movie_mode', 'Movie mode', 'off'),
    plain('script.demo_main_lights_on', 'Main floor lights on', 'off'),
    plain('scene.demo_movie', 'Movie', 'unknown'),
    plain('input_boolean.demo_night_mode', 'Night mode', 'off'),
    plain('input_boolean.demo_guest_mode', 'Guest mode', 'off'),
    plain('binary_sensor.demo_front_door', 'Front door', 'off', { device_class: 'door' }),
    plain('binary_sensor.demo_living_window', 'Living window', 'off', { device_class: 'window' }),
    plain('binary_sensor.demo_living_motion', 'Living motion', 'on', { device_class: 'motion' }),
    plain('binary_sensor.demo_kitchen_motion', 'Kitchen motion', 'off', { device_class: 'motion' }),
    plain('binary_sensor.demo_rec_motion', 'Rec room motion', 'off', { device_class: 'motion' }),
    plain('sensor.demo_living_temperature', 'Living temperature', '21.5', { unit_of_measurement: '°C', device_class: 'temperature' }),
    plain('sensor.demo_bedroom_temperature', 'Bedroom temperature', '18.2', { unit_of_measurement: '°C', device_class: 'temperature' }),
    plain('sensor.demo_kitchen_temperature', 'Kitchen temperature', '24.6', { unit_of_measurement: '°C', device_class: 'temperature' }),
    plain('sensor.demo_person_area', 'Demo Person area', 'demo_living'),
    plain('sensor.demo_guest_area', 'Demo Guest area', 'not_home'),
    plain('fan.demo_rec_fan', 'Rec room fan', 'on', { percentage: 66 }),
    plain('sensor.demo_kitchen_spots_power', 'Kitchen spots power', '18.4', { unit_of_measurement: 'W', device_class: 'power' }),
    plain('sensor.demo_house_power', 'House power', '1234', { unit_of_measurement: 'W', device_class: 'power' }),
    plain('sun.sun', 'Sun', 'below_horizon', { elevation: -12 }),
    plain('input_boolean.demo_movie_mode', 'Movie mode', 'off'),
    plain('scene.demo_good_night', 'Good night', 'unknown'),
  ]);
}

/**
 * Home Assistant's floor, area, device and entity registries for the import test, in the shape of
 * hass.floors / areas / devices / entities (src/types.ts of the frontend). Every name is demo_.
 */
export function demoRegistry() {
  const by = (key, list) => Object.fromEntries(list.map((x) => [x[key], x]));
  return {
    floors: by('floor_id', [
      { floor_id: 'demo_ground', name: 'Ground floor', level: 0, icon: null, aliases: [] },
      { floor_id: 'demo_lower', name: 'Lower level', level: -1, icon: null, aliases: [] },
    ]),
    areas: by('area_id', [
      { area_id: 'demo_living', name: 'Living room', floor_id: 'demo_ground' },
      { area_id: 'demo_kitchen', name: 'Kitchen', floor_id: 'demo_ground' },
      { area_id: 'demo_den', name: 'Den', floor_id: 'demo_lower' },
      { area_id: 'demo_porch', name: 'Porch', floor_id: null },
    ]),
    devices: by('id', [
      { id: 'demo_dev_lamp', name: 'Reading lamp', name_by_user: null, area_id: 'demo_living' },
      { id: 'demo_dev_tv', name: 'TV', name_by_user: null, area_id: 'demo_living' },
      { id: 'demo_dev_plug', name: 'Coffee plug', name_by_user: null, area_id: 'demo_kitchen' },
      { id: 'demo_dev_lock', name: 'Front lock', name_by_user: null, area_id: 'demo_porch' },
    ]),
    entities: by('entity_id', [
      { entity_id: 'light.demo_living_ceiling', area_id: 'demo_living', name: 'Living ceiling', labels: [] },
      { entity_id: 'light.demo_import_floor_lamp', device_id: 'demo_dev_lamp', name: 'Floor lamp', labels: [] },
      { entity_id: 'switch.demo_reading_lamp', device_id: 'demo_dev_lamp', labels: [] },
      { entity_id: 'switch.demo_coffee_plug', device_id: 'demo_dev_plug', labels: [] },
      { entity_id: 'media_player.demo_tv', device_id: 'demo_dev_tv', name: 'TV', labels: [] },
      { entity_id: 'light.demo_kitchen_spots', area_id: 'demo_kitchen', name: 'Kitchen spots', labels: [] },
      { entity_id: 'light.demo_den_lamp', area_id: 'demo_den', name: 'Den lamp', labels: [] },
      { entity_id: 'climate.demo_den_heater', area_id: 'demo_den', name: 'Den heater', labels: [] },
      { entity_id: 'cover.demo_den_blinds', area_id: 'demo_den', name: 'Den blinds', labels: [] },
      { entity_id: 'lock.demo_porch_lock', device_id: 'demo_dev_lock', name: 'Front lock', labels: [] },
      { entity_id: 'light.demo_hidden_light', area_id: 'demo_den', name: 'Hidden', hidden: true, labels: [] },
      { entity_id: 'sensor.demo_den_signal', area_id: 'demo_den', name: 'Signal', entity_category: 'diagnostic', labels: [] },
    ]),
  };
}

// The same registries as Home Assistant's websocket commands answer them (registry: 'ws').
function registryAnswer(type) {
  const r = demoRegistry();
  if (type === 'config/floor_registry/list') return Object.values(r.floors);
  if (type === 'config/area_registry/list') return Object.values(r.areas);
  if (type === 'config/device_registry/list') return Object.values(r.devices);
  if (type === 'config/entity_registry/list_for_display') {
    const cats = ['config', 'diagnostic'];
    return {
      entity_categories: Object.fromEntries(cats.map((c, i) => [i, c])),
      entities: Object.values(r.entities).map((e) => ({
        ei: e.entity_id, di: e.device_id, ai: e.area_id, en: e.name, hb: e.hidden, lb: e.labels, pl: 'demo',
        ...(e.entity_category ? { ec: cats.indexOf(e.entity_category) } : {}),
      })),
    };
  }
  return undefined;
}

// Climate attributes that hold a temperature, and how each is rounded once in °F: set-points to
// whole degrees (the range outwards), readings to a tenth.
const CLIMATE_TEMPS = {
  temperature: Math.round, target_temp_low: Math.round, target_temp_high: Math.round,
  min_temp: Math.floor, max_temp: Math.ceil, current_temperature: (f) => Math.round(f * 10) / 10,
};

/**
 * Every climate.* state in °F, the way Home Assistant reports them with a Fahrenheit unit system.
 * An entity whose temperatures are all 50 or below is taken to be in °C and converted; anything
 * else (already °F, or no climate entities at all) is left as it is.
 */
export function toFahrenheit(states) {
  for (const [id, st] of Object.entries(states || {})) {
    const a = st?.attributes;
    if (!id.startsWith('climate.') || !a) continue;
    const keys = Object.keys(CLIMATE_TEMPS).filter((k) => Number.isFinite(a[k]));
    if (!keys.length || keys.some((k) => a[k] > 50)) continue;
    for (const k of keys) a[k] = CLIMATE_TEMPS[k]((a[k] * 9) / 5 + 32);
  }
  return states;
}

// registry: true (hass.floors / areas / devices / entities), 'ws' (only the websocket commands) or false
export function createMockHass({ admin = true, states = demoStates(), dashboard = null, fahrenheit = false, registry = true } = {}) {
  if (fahrenheit) toFahrenheit(states);
  const calls = [];
  const ws = [];
  const hass = {
    states,
    user: { name: 'Demo', is_admin: admin },
    config: { unit_system: { temperature: fahrenheit ? '°F' : '°C' } },
    panelUrl: 'lovelace',
    language: 'en',
    calls,
    ws,
    ...(registry === true ? demoRegistry() : {}),
    dashboard,
    failNext: null,
    listeners: new Set(),
    async callService(domain, service, data, target) {
      calls.push(target ? { domain, service, data: structuredClone(data ?? {}), target: structuredClone(target) } : { domain, service, data: structuredClone(data) });
      if (hass.failNext) { const e = hass.failNext; hass.failNext = null; throw e; }
      const id = data?.entity_id ?? target?.entity_id;
      const cur = hass.states[id];
      if (!cur) return;
      const next = { ...cur, attributes: { ...cur.attributes } };
      if (service === 'turn_on') {
        next.state = domain === 'climate' ? 'cool' : 'on';
        if (domain === 'light') {
          if (data.brightness != null) next.attributes.brightness = data.brightness;
          else next.attributes.brightness ??= 255;
          if (data.color_temp_kelvin) { next.attributes.color_temp_kelvin = data.color_temp_kelvin; next.attributes.color_mode = 'color_temp'; }
          if (data.rgb_color) { next.attributes.rgb_color = data.rgb_color; next.attributes.color_mode = 'hs'; }
        }
      } else if (service === 'turn_off') next.state = 'off';
      else if (service === 'toggle') next.state = cur.state === 'on' ? 'off' : 'on';
      else return;
      hass.set(id, next);
    },
    async callWS(msg) {
      ws.push(structuredClone(msg));
      if (msg.type === 'lovelace/config') {
        if (!hass.dashboard) throw Object.assign(new Error('Not found'), { code: 'config_not_found' });
        return structuredClone(hass.dashboard);
      }
      if (msg.type === 'lovelace/config/save') { hass.dashboard = structuredClone(msg.config); return null; }
      if (registry && msg.type.startsWith('config/')) {
        const answer = registryAnswer(msg.type);
        if (answer !== undefined) return answer;
      }
      throw new Error(`unknown command ${msg.type}`);
    },
    // Home Assistant hands every card a new hass object when any state changes.
    set(id, stateObj) {
      hass.states = { ...hass.states, [id]: stateObj };
      for (const fn of hass.listeners) fn();
    },
  };
  return hass;
}

/**
 * What the Home Assistant frontend does with a card's `hass-action` event (its action-mixin runs
 * handleAction): the subset the card can send. `record(event)` gets what a test checks.
 * Like the frontend, "toggle" turns the entity on or off from its current state.
 */
export function handleHassAction(hass, detail, record) {
  const which = detail.action;
  const cfg = detail.config[`${which}_action`] || { action: 'more-info' };
  record({ type: 'hass-action', action: which, config: structuredClone(detail.config) });
  if (cfg.confirmation && !window.confirm(cfg.confirmation.text || 'Are you sure?')) return;
  const entity = cfg.entity || detail.config.entity;
  switch (cfg.action) {
    case 'more-info':
      record({ type: 'hass-more-info', entityId: entity });
      break;
    case 'toggle': {
      const on = !['off', 'unavailable', 'unknown', 'closed', 'locked', 'idle', 'standby'].includes(hass.states[entity]?.state);
      hass.callService(entity.split('.')[0], on ? 'turn_off' : 'turn_on', { entity_id: entity });
      break;
    }
    case 'perform-action': {
      const [domain, service] = (cfg.perform_action || cfg.service).split('.', 2);
      hass.callService(domain, service, cfg.data ?? cfg.service_data, cfg.target);
      break;
    }
    case 'navigate':
      record({ type: 'navigate', path: cfg.navigation_path });
      break;
    default:
  }
}

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
    light('light.demo_hall_ceiling', 'Hall ceiling', ['color_temp']),
    light('light.demo_rec_cans', 'Rec room cans', ['brightness']),
    light('light.demo_rec_pool_table', 'Pool table light', ['color_temp']),
    light('light.demo_rec_sconces', 'Rec room sconces', ['onoff']),
    light('light.demo_rec_fan_light', 'Rec room fan light', ['brightness']),
    light('light.demo_rec_dome', 'Rec room entry', ['onoff']),
    plain('climate.demo_bedroom_ac', 'Bedroom AC', 'off', {
      hvac_modes: ['off', 'cool', 'heat', 'fan_only', 'auto'], fan_modes: ['auto', 'low', 'high'],
      temperature: 23, current_temperature: 25.5, min_temp: 16, max_temp: 30, fan_mode: 'auto',
    }),
    plain('media_player.demo_tv', 'TV', 'playing', { media_title: 'Demo' }),
    plain('fan.demo_bedroom_fan', 'Ceiling fan', 'off'),
    plain('switch.demo_coffee_maker', 'Coffee maker', 'off'),
    plain('climate.demo_thermostat', 'Thermostat', 'heat', { current_temperature: 21.4, temperature: 22, hvac_modes: ['off', 'heat'] }),
    plain('lock.demo_front_door', 'Front door', 'locked', { code_format: '^\\d{4}$' }),
    plain('cover.demo_garage_door', 'Garage door', 'closed', { device_class: 'garage' }),
    plain('camera.demo_porch', 'Porch camera', 'idle'),
    plain('script.demo_movie_mode', 'Movie mode', 'off'),
    plain('scene.demo_good_night', 'Good night', 'unknown'),
  ]);
}

export function createMockHass({ admin = true, states = demoStates(), dashboard = null, fahrenheit = false } = {}) {
  if (fahrenheit) {
    Object.assign(states['climate.demo_bedroom_ac'].attributes, { temperature: 73, current_temperature: 77.9, min_temp: 60, max_temp: 86 });
    Object.assign(states['climate.demo_thermostat'].attributes, { temperature: 72, current_temperature: 70.5 });
  }
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
    dashboard,
    failNext: null,
    listeners: new Set(),
    async callService(domain, service, data) {
      calls.push({ domain, service, data: structuredClone(data) });
      if (hass.failNext) { const e = hass.failNext; hass.failNext = null; throw e; }
      const id = data.entity_id;
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

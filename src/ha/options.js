// The card's own options (everything but the plan): what the card editor shows and what
// setConfig accepts. No DOM or styles here, so the unit tests can load it.
import { QUALITIES, DEFAULT_QUALITY } from './light-pool.js';
import { isEntityId } from './validate.js';

export const OPTION_SCHEMA = [
  { name: 'height', selector: { text: {} } },
  { name: 'quality', selector: { select: { mode: 'dropdown', options: QUALITIES.map((q) => ({ value: q, label: q[0].toUpperCase() + q.slice(1) })) } } },
  { name: 'temperature_unit', selector: { select: { mode: 'dropdown', options: [{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }] } } },
  { name: 'safe_area', selector: { boolean: {} } },
  { name: 'stacked_view_default', selector: { boolean: {} } },
  { name: 'sun', selector: { boolean: {} } },
  { name: 'power', selector: { entity: { filter: { domain: 'sensor', device_class: 'power' } } } },
];

export const LABELS = {
  height: 'Height (CSS, e.g. 100% or 800px)',
  quality: 'Quality of the 3D view',
  temperature_unit: 'Temperature unit',
  safe_area: 'Keep clear of the phone’s notch',
  stacked_view_default: 'Start in the stacked view (several floors)',
  sun: 'Daylight from the sun’s position',
  power: 'House power sensor',
};
export const HELPERS = {
  height: 'Empty: the card fills the view under the header.',
  quality: 'Low for older phones: fewer real lights, no bloom. Medium is the default.',
  temperature_unit: 'Empty: Home Assistant’s own unit system.',
  safe_area: 'For a kiosk view without Home Assistant’s header.',
  sun: 'Blends between the night look and daylight using sun.sun.',
  power: 'Total watts, shown in the header.',
};
export const OPTION_NAMES = OPTION_SCHEMA.map((s) => s.name);

/** "2 floors · 12 rooms · 23 lights · 7 devices" */
export function planSummary(plan) {
  if (!plan || typeof plan !== 'object') return 'No plan yet';
  const n = (list) => (Array.isArray(list) ? list.length : 0);
  const part = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  return [
    plan.floors?.length > 1 ? part(plan.floors.length, 'floor', 'floors') : null,
    part(n(plan.rooms), 'room', 'rooms'),
    part(n(plan.lights), 'light', 'lights'),
    part(n(plan.entities), 'device', 'devices'),
  ].filter(Boolean).join(' · ');
}

/** The card's own options (not the plan): throws a readable error Home Assistant shows. */
export function checkOptions(config) {
  const fail = (msg) => { throw new Error(msg); };
  if (config.quality != null && !QUALITIES.includes(config.quality)) {
    fail(`"quality" must be ${QUALITIES.join(', ')} (default ${DEFAULT_QUALITY}), not "${config.quality}"`);
  }
  for (const key of ['safe_area', 'stacked_view_default', 'sun']) {
    if (config[key] != null && typeof config[key] !== 'boolean') fail(`"${key}" must be true or false`);
  }
  if (config.temperature_unit != null && !/^°?[CFcf]$/.test(String(config.temperature_unit))) fail('"temperature_unit" must be C or F');
  if (config.power != null && !(isEntityId(config.power) && config.power.startsWith('sensor.'))) {
    fail(`"power" must be a sensor.* entity (the house's total power), not "${config.power}"`);
  }
}


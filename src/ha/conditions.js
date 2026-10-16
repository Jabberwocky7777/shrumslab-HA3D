// `active_when` of scenes and floor buttons with `run`: when Home Assistant's states match, the
// button shows as active. A list means every condition must match.
import { ConfigError } from '../../upstream/config.js';

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Checks `active_when` and returns it as a list of { entity, state }, or null when absent. */
export function normalizeActiveWhen(what, value, { hasRun, exists = () => {} }) {
  if (value == null) return null;
  const list = Array.isArray(value) ? value : [value];
  if (!hasRun) throw new ConfigError(`${what}: "active_when" only works with "run" (a built-in scene shows as active by itself)`);
  if (!list.length) throw new ConfigError(`${what}: "active_when" is an empty list`);
  return list.map((c, i) => {
    const where = list.length > 1 ? `${what} active_when #${i + 1}` : `${what} active_when`;
    if (!c || typeof c !== 'object') throw new ConfigError(`${where} must be { "entity": ..., "state": ... }`);
    if (typeof c.entity !== 'string' || !ENTITY_ID.test(c.entity)) throw new ConfigError(`${where} needs "entity": an entity id such as "input_boolean.your_guest_mode"`);
    if (!['string', 'number', 'boolean'].includes(typeof c.state)) throw new ConfigError(`${where} needs "state": the state that means active, such as "on"`);
    exists(c.entity, where);
    return { entity: c.entity, state: String(c.state) };
  });
}

/** True when every condition matches the current states (and there is at least one). */
export function isActive(conditions, states) {
  return Boolean(conditions?.length) && conditions.every((c) => states?.[c.entity]?.state === c.state);
}

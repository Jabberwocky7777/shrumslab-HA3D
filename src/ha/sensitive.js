// The rules for devices that must never change with a single tap (brief section 2.5).
// Tapping one of these always opens Home Assistant's own more-info dialog, which handles
// confirmations and codes. Bulk actions (scenes, "All on/off", the power button) never reach them.

/** Domains that are never one-tap. Every cover counts, whatever its device class. */
export const SENSITIVE_DOMAINS = new Set(['lock', 'alarm_control_panel', 'cover', 'valve', 'siren', 'camera']);

/** The only domains a bulk action (scene, All on, All off, power button) may change. */
export const BULK_DOMAINS = new Set(['light', 'switch', 'fan', 'climate', 'media_player']);

/** The domains a plan entity may `toggle` with a tap. */
export const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'media_player']);

/** Plan lights may only be linked to these: they are switched in bulk. */
export const LIGHT_DOMAINS = new Set(['light', 'switch']);

/** Plan ACs may only be linked to these. */
export const AC_DOMAINS = new Set(['climate']);

/** What a scene's `run` may start: Home Assistant scripts and scenes. */
export const RUN_DOMAINS = new Set(['script', 'scene']);

export const TAP_ACTIONS = ['more-info', 'toggle', 'navigate'];

export const domainOf = (entityId) => String(entityId || '').split('.')[0];

export const isSensitive = (entityId) => SENSITIVE_DOMAINS.has(domainOf(entityId));

export const canBulk = (entityId) => BULK_DOMAINS.has(domainOf(entityId));

/**
 * The action a tap (or hold) on a plan entity really performs. Sensitive devices always
 * get the more-info dialog, whatever the plan says; so does anything a toggle cannot handle.
 */
export function effectiveAction(entityId, action = 'more-info') {
  if (isSensitive(entityId)) return 'more-info';
  if (action === 'toggle' && !TOGGLE_DOMAINS.has(domainOf(entityId))) return 'more-info';
  if (!TAP_ACTIONS.includes(action)) return 'more-info';
  return action;
}

/* ---------- Home Assistant action objects (tap_action, hold_action, double_tap_action) ---------- */

/** The action objects a plan may use: a faithful subset of Home Assistant's own. */
export const HA_ACTIONS = ['more-info', 'toggle', 'navigate', 'perform-action', 'none'];

/** Services that act on whatever their target holds, whatever its domain: no area or device targets. */
const CROSS_DOMAIN = new Set(['homeassistant']);
const AREA_TARGETS = ['area_id', 'device_id', 'floor_id', 'label_id'];

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** The entity ids an action object reaches: its `target.entity_id` and `data.entity_id`. */
export function actionTargets(cfg) {
  return [...list(cfg?.target?.entity_id), ...list(cfg?.data?.entity_id), ...list(cfg?.service_data?.entity_id)].map(String);
}

/**
 * Why an action object may not be used on `entityId` (the plan entity it belongs to), or null.
 * Sensitive devices are never toggled or reached by perform-action, not even through `target`.
 */
export function actionProblem(entityId, cfg) {
  const action = cfg?.action === 'call-service' ? 'perform-action' : cfg?.action;
  if (!HA_ACTIONS.includes(action)) return `unknown action "${cfg?.action}" (use ${HA_ACTIONS.join(', ')})`;
  if (action === 'toggle') {
    if (isSensitive(entityId)) return `"${entityId}" is a sensitive device and cannot be toggled; use "more-info"`;
    if (!TOGGLE_DOMAINS.has(domainOf(entityId))) return `"toggle" only works for ${[...TOGGLE_DOMAINS].join(', ')} entities; use "more-info" for "${entityId}"`;
  }
  if (action === 'navigate' && !(typeof cfg.navigation_path === 'string' && cfg.navigation_path.startsWith('/'))) {
    return 'needs a "navigation_path" starting with "/"';
  }
  if (action === 'perform-action') {
    const service = cfg.perform_action || cfg.service;
    if (typeof service !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(service)) return 'needs "perform_action": a service such as "light.turn_on"';
    if (isSensitive(entityId)) return `"${entityId}" is a sensitive device: its tap always opens more-info`;
    const domain = domainOf(service);
    if (SENSITIVE_DOMAINS.has(domain)) return `"${service}" acts on sensitive devices and cannot run from a tap`;
    const hit = actionTargets(cfg).find(isSensitive);
    if (hit) return `cannot target the sensitive device "${hit}"`;
    if (CROSS_DOMAIN.has(domain) && AREA_TARGETS.some((k) => cfg.target?.[k] != null || cfg.data?.[k] != null)) {
      return `"${service}" with an area, device, floor or label target could reach sensitive devices; list the entities instead`;
    }
  }
  return null;
}

/**
 * The action object a gesture really performs. Sensitive devices always get more-info, whatever
 * the plan says; so does anything that is not allowed or not known.
 */
export function effectiveActionConfig(entityId, cfg) {
  if (!cfg || isSensitive(entityId)) return { action: 'more-info' };
  if (actionProblem(entityId, cfg)) return { action: 'more-info' };
  return cfg.action === 'call-service' ? { ...cfg, action: 'perform-action' } : cfg;
}

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

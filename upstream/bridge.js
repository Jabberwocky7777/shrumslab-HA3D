// ha3d: upstream's bridge talked to the native shell through window.webkit.messageHandlers.
// In the Home Assistant card there is no native shell: devices are reached through the `hass`
// object (src/ha/bridge.js), so everything here is local and nothing leaves the page.

export const isNative = false;

// The card always uses house-control's iPhone layout.
export const platform = 'ios';
export const isPhone = true;

// Native messages are gone; kept as a no-op so upstream call sites stay unchanged.
export function post() {}

// Home Assistant's frontend forwards a `haptic` window event to the companion app.
// https://github.com/home-assistant/frontend/blob/dev/src/data/haptics.ts
const HAPTICS = { tick: 'selection', light: 'light', medium: 'medium', heavy: 'heavy', success: 'success', error: 'failure' };

export function haptic(kind = 'light') {
  const type = HAPTICS[kind];
  if (!type) return;
  window.dispatchEvent(new CustomEvent('haptic', { detail: type, bubbles: true, composed: true }));
}

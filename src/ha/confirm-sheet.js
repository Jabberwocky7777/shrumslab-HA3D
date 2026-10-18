// The card's own "are you sure?" for floor buttons with `confirmation`: upstream's bottom sheet
// (.sheet, .sheet-head, .sheet-name, .sheet-sub, its slide-up and glass) over a scrim, never
// window.confirm and never Home Assistant's dialog. Cancel, a tap on the scrim or Esc closes it.
import { h } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';

const CLOSE_MS = 320; // upstream's .sheet.hidden transition

/**
 * Shows the sheet inside `host` (the card's clip). `onConfirm` runs once, only after Confirm.
 * Returns { el, close() }; a second sheet replaces the first.
 */
export function openConfirmSheet(host, { name, iconName = 'sparkles', text, confirmLabel = 'Confirm', onConfirm }) {
  host.querySelector(':scope > .hc-confirm-layer')?.remove();
  let done = false;
  const listeners = new AbortController();

  const cancel = h('button.hc-confirm-cancel', { type: 'button', onclick: () => { haptic('light'); close(); } }, 'Cancel');
  const confirm = h('button.round.power.on.hc-confirm-ok', {
    type: 'button',
    onclick: () => {
      if (done) return;
      haptic('medium');
      close();
      onConfirm();
    },
  }, confirmLabel);
  const sheet = h('section.sheet.hidden.hc-confirm', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': name },
    h('div.sheet-head',
      h('div.bubble', icon(iconName, 19)),
      h('div.sheet-title', h('div.sheet-name', name), h('div.sheet-sub', text))),
    h('div.hc-confirm-actions', cancel, confirm));
  const scrim = h('div.hc-confirm-scrim', { onclick: () => close() });
  const layer = h('div.hc-confirm-layer', scrim, sheet);
  host.append(layer);

  // From upstream's hidden state (below, transparent) to shown, as the light sheet does. The forced
  // style flush starts the transition at once, without waiting for a (possibly slow) 3D frame.
  void getComputedStyle(sheet).transform;
  sheet.classList.remove('hidden');
  layer.classList.add('open');
  cancel.focus({ preventScroll: true });

  // Esc closes it, before the card's own Esc handling (which would close a device sheet).
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopImmediatePropagation();
    close();
  }, { capture: true, signal: listeners.signal });

  function close() {
    if (done) return;
    done = true;
    listeners.abort();
    sheet.classList.add('hidden');
    layer.classList.remove('open');
    layer.classList.add('closing');
    setTimeout(() => layer.remove(), CLOSE_MS);
  }

  return { el: layer, close };
}

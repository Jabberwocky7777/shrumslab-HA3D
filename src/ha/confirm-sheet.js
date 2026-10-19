// The card's own "are you sure?" for floor buttons with `confirmation`: a small dialog centred in
// the visible screen (never under the notch or the home indicator), in the card's look: the glass
// background, the button's icon in the round bubble, Cancel and the blue Confirm side by side. Never
// window.confirm and never Home Assistant's dialog. Cancel, a tap on the scrim or Esc closes it.
import { h } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';

const CLOSE_MS = 200; // the fade out (see card.css)

/**
 * `position: fixed` covers the viewport unless an ancestor is transformed (or filtered, or has
 * `contain`): then it covers that ancestor instead. Measure where it landed and, if it is not the
 * viewport, place it over the visual viewport by hand.
 */
export function fitToViewport(layer, view = globalThis.visualViewport) {
  for (const k of ['left', 'top', 'width', 'height', 'right', 'bottom']) layer.style[k] = '';
  const box = layer.getBoundingClientRect();
  const vw = view?.width ?? window.innerWidth;
  const vh = view?.height ?? window.innerHeight;
  const vx = view?.offsetLeft ?? 0;
  const vy = view?.offsetTop ?? 0;
  const off = Math.abs(box.left - vx) > 1 || Math.abs(box.top - vy) > 1 || Math.abs(box.width - vw) > 1 || Math.abs(box.height - vh) > 1;
  if (!off) return false;
  // `left` / `top` are relative to the box `inset: 0` produced (the transformed ancestor's)
  Object.assign(layer.style, {
    left: `${vx - box.left}px`, top: `${vy - box.top}px`, width: `${vw}px`, height: `${vh}px`, right: 'auto', bottom: 'auto',
  });
  return true;
}

/**
 * Shows the dialog inside `host` (the card's `.card`, so it takes the card's colours).
 * `onConfirm` runs once, only after Confirm. Returns { el, close() }; a second one replaces the first.
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
  const dialog = h('section.hc-confirm', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': name },
    h('div.sheet-head',
      h('div.bubble', icon(iconName, 19)),
      h('div.sheet-title', h('div.sheet-name', name), h('div.sheet-sub', text))),
    h('div.hc-confirm-actions', cancel, confirm));
  const scrim = h('div.hc-confirm-scrim', { onclick: () => close() });
  const layer = h('div.hc-confirm-layer', scrim, dialog);
  host.append(layer);

  const fit = () => fitToViewport(layer);
  fit();
  globalThis.visualViewport?.addEventListener('resize', fit, { signal: listeners.signal });
  globalThis.visualViewport?.addEventListener('scroll', fit, { signal: listeners.signal });
  window.addEventListener('resize', fit, { signal: listeners.signal });

  // A short fade and scale-in: flush the start state, then open (no frame needed).
  void getComputedStyle(dialog).opacity;
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
    layer.classList.remove('open');
    layer.classList.add('closing');
    setTimeout(() => layer.remove(), CLOSE_MS);
  }

  return { el: layer, close };
}

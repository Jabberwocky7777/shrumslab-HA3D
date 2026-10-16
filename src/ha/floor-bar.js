// The floor switcher above the room tabs: one chip per floor (top floor first, like a lift
// panel) and a toggle for the stacked view. Hidden when the plan has a single floor.
import { h } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';

export function createFloorBar(config, { floor, stacked = false, onSelect, onStacked }) {
  const chips = new Map();
  let current = floor;
  let isStacked = stacked;
  const stackBtn = h('button.floor-stack', {
    'aria-label': 'Show every floor', title: 'Stacked view',
    onclick: () => { haptic('light'); isStacked = !isStacked; render(); onStacked(isStacked); },
  }, icon('layers', 17));
  const top = [...config.floors].sort((a, b) => b.level - a.level || b.order - a.order);
  for (const f of top) {
    chips.set(f.id, h('button.floor-chip', {
      'data-floor': f.id,
      onclick: () => { haptic('tick'); if (f.id !== current) { current = f.id; render(); onSelect(f.id); } },
    }, f.name));
  }
  const el = h('div.floors', { role: 'group', 'aria-label': 'Floors' }, [...chips.values()], stackBtn);
  el.hidden = !config.multiFloor;

  function render() {
    for (const [id, b] of chips) {
      b.classList.toggle('active', id === current);
      b.setAttribute('aria-pressed', String(id === current));
    }
    stackBtn.classList.toggle('active', isStacked);
    stackBtn.setAttribute('aria-pressed', String(isStacked));
  }
  render();

  return {
    el,
    /** The floor changed elsewhere (a tap on it in the stacked view). */
    set(id) { current = id; render(); },
  };
}

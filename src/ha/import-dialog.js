// The preview of "Import from Home Assistant…": what would be added, with a box to tick or untick
// for every floor, room, light and device, and the choice between adding to the plan and starting a
// new one. Nothing changes until "Add to plan", and nothing is saved until the editor's Save.
import { h } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { readRegistry, buildFromRegistry, applyImport } from './registry-import.js';

const SECTIONS = [
  ['floors', 'Floors', (x) => `level ${x.level}`],
  ['rooms', 'Rooms', (x) => `area ${x.area}`],
  ['lights', 'Lights', (x) => x.link.id],
  ['switches', 'Switches that look like lamps', (x) => x.link.id],
  ['devices', 'Other devices', (x) => `${x.entity}${x.sensitive ? ' · always opens its dialog' : ''}`],
];

/**
 * Opens the preview over `container` (the editor). `onApply(plan, note)` gets the new plan.
 * Returns a function that closes it.
 */
export function openImportDialog(container, { getHass, getPlan, onApply }) {
  const hass = getHass();
  const plan = getPlan();
  const hasRooms = plan.rooms?.length > 0;
  let mode = hasRooms ? 'merge' : 'new';
  let registry = null;
  let proposal = null;

  const body = h('div.e-import-body', h('p.note', 'Reading Home Assistant’s floors, areas and devices…'));
  const addBtn = h('button.btn.primary', { disabled: true, onclick: apply }, 'Add to plan');
  const modes = h('div.e-import-modes',
    ['merge', 'new'].map((m) => h(`button.e-mode${m === mode ? '.active' : ''}`, {
      'data-mode': m, disabled: m === 'merge' && !hasRooms,
      onclick: () => { mode = m; for (const b of modes.children) b.classList.toggle('active', b.dataset.mode === mode); build(); },
    }, m === 'merge' ? 'Add what’s missing' : 'Start a new plan')));
  const scrim = h('div.e-import-scrim', { onclick: (ev) => { if (ev.target === scrim) close(); } },
    h('section.e-import', { role: 'dialog', 'aria-label': 'Import from Home Assistant' },
      h('header.e-import-head', icon('homeassistant', 20), h('b', 'Import from Home Assistant'),
        h('button.p-icon', { 'aria-label': 'Close', onclick: close }, icon('close', 18, 2.2))),
      modes, body,
      h('footer.e-import-foot', h('button.btn', { onclick: close }, 'Cancel'), addBtn)));
  container.append(scrim);

  function close() { scrim.remove(); }

  const count = () => proposal ? Object.values(proposal).flat().filter((x) => x.include).length : 0;
  const refresh = () => {
    const n = count();
    addBtn.disabled = !n;
    addBtn.textContent = mode === 'new' ? `Start the plan (${n})` : `Add to plan (${n})`;
  };

  function build() {
    if (!registry) return;
    proposal = buildFromRegistry(registry, { states: hass.states, plan: mode === 'merge' ? plan : null });
    const sections = SECTIONS.filter(([key]) => proposal[key].length).map(([key, title, sub]) =>
      h('section.e-import-section', { 'data-section': key },
        h('h3', `${title} (${proposal[key].length})`),
        proposal[key].map((item) => {
          const box = h('input', { type: 'checkbox' });
          box.checked = item.include;
          box.addEventListener('change', () => { item.include = box.checked; refresh(); });
          return h('label.e-import-row', { 'data-id': item.id }, box, h('span.e-import-name', item.name), h('span.e-import-sub', sub(item)));
        })));
    body.replaceChildren(...(sections.length ? [
      h('p.note', mode === 'new'
        ? 'A new plan from Home Assistant’s areas. Rooms are laid out in a grid: drag them into place afterwards.'
        : 'Only what the plan does not have yet. New rooms are laid out next to the existing ones.'),
      ...sections,
    ] : [h('p.note', 'Nothing new: every area, light and device of Home Assistant is already in the plan.')]));
    refresh();
  }

  function apply() {
    if (!proposal) return;
    const next = applyImport(plan, proposal, { mode, name: hass.config?.location_name || 'Home' });
    const pick = (key) => proposal[key].filter((x) => x.include).length;
    close();
    onApply(next, `Imported ${pick('rooms')} rooms, ${pick('lights') + pick('switches')} lights and ${pick('devices')} devices: review them and press Save`);
  }

  readRegistry(hass).then((r) => { registry = r; build(); }, (e) => {
    body.replaceChildren(h('p.note.bad', `Could not read Home Assistant’s registry: ${e.message || e}`));
  });
  return close;
}

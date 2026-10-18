// Replaces upstream's editor/connections.js (Smart Life, Hue, HomeKit pairing screens): in the
// card every device is a Home Assistant entity, picked from the ones `hass` already knows.
import { h } from '../../upstream/ui/dom.js';
import { domainOf, LIGHT_DOMAINS, AC_DOMAINS, RUN_DOMAINS, isSensitive } from './sensitive.js';
import { availabilityOf, defaultIcon } from './mapping.js';
import { isEntityId } from './validate.js';

let lists = 0;

export function createEditorLinks(getHass) {
  const states = () => getHass()?.states || {};
  const nameOf = (id) => states()[id]?.attributes?.friendly_name || '';

  // A text field with the matching entities as suggestions. Typing works too (YAML-style ids).
  function entityField(label, { get, set, domains = null, hooks, placeholder = 'domain.object_id', empty = 'Not linked: the card simulates it.' }) {
    const listId = `hc-entities-${++lists}`;
    const options = Object.keys(states())
      .filter((id) => !domains || domains.has(domainOf(id)))
      .sort()
      .map((id) => h('option', { value: id }, nameOf(id)));
    const input = h('input', { type: 'text', list: listId, spellcheck: 'false', autocapitalize: 'off', placeholder });
    input.value = get() || '';
    const note = h('p.note');
    const describe = () => {
      const id = input.value.trim();
      if (!id) { note.textContent = empty; note.className = 'note'; return; }
      if (!isEntityId(id)) { note.textContent = 'Not a valid entity id yet.'; note.className = 'note bad'; return; }
      if (domains && !domains.has(domainOf(id))) {
        note.textContent = `Use a ${[...domains].map((d) => `${d}.*`).join(' or ')} entity here.`;
        note.className = 'note bad';
        return;
      }
      const missing = availabilityOf(states()[id]);
      note.className = missing ? 'note bad' : 'note';
      note.textContent = missing ? `${missing} in Home Assistant.` : `${nameOf(id) || id} · ${states()[id].state}`;
    };
    input.addEventListener('change', () => {
      hooks.snapshot();
      set(input.value.trim());
      hooks.changed();
    });
    input.addEventListener('input', describe);
    describe();
    return [h('label.field', h('span', label), input), h('datalist', { id: listId }, options), note];
  }

  const linkProp = (item, key) => ({
    get: () => (item[key]?.service === 'homeassistant' ? item[key].id : ''),
    set: (v) => { if (v) item[key] = { service: 'homeassistant', id: v }; else delete item[key]; },
  });

  return {
    /** The Home Assistant entity of a plan light (light.* / switch.*) or AC (climate.*). */
    deviceSection(item, kind, hooks) {
      const domains = kind === 'light' ? LIGHT_DOMAINS : AC_DOMAINS;
      return h('section.block', h('h3', 'Home Assistant'),
        entityField(kind === 'light' ? 'Light or switch entity' : 'Climate entity', { ...linkProp(item, 'link'), domains, hooks }),
        kind === 'light'
          ? h('p.note', 'With none of “What it can do” ticked, a linked light takes its abilities from Home Assistant.')
          : null);
    },

    /** An optional thermometer for an AC's room. */
    sensorSection(item, hooks) {
      return h('section.block', h('h3', 'Room temperature'),
        entityField('Temperature sensor (optional)', { ...linkProp(item, 'sensor'), domains: new Set(['sensor']), hooks, empty: 'None: the AC reports its own.' }));
    },

    /** The entity of a plan `entities` item; the name and icon follow it while they are still the defaults. */
    entitySection(item, hooks) {
      return h('section.block', h('h3', 'Home Assistant'),
        entityField('Entity', {
          empty: 'Pick the Home Assistant entity this stands for.',
          get: () => item.entity,
          set: (v) => {
            item.entity = v;
            if (!isEntityId(v)) return;
            if (!item.name || item.name === 'New device') item.name = nameOf(v) || item.name;
            if (!item.icon || item.icon === 'box') item.icon = defaultIcon(v, states()[v]);
            if (isSensitive(v)) item.tap = 'more-info';
          },
          hooks,
        }));
    },

    /** A door's or window's contact sensor, a door's lock, a garage door's cover. */
    openingSection(item, hooks) {
      const opt = (key) => ({ get: () => item[key] || '', set: (v) => { if (v) item[key] = v; else delete item[key]; } });
      const type = item.type || 'door';
      return h('section.block', h('h3', 'Home Assistant'),
        type === 'garage'
          ? entityField('Garage door (cover)', { ...opt('cover'), domains: new Set(['cover']), hooks, empty: 'Pick the cover.* of the garage door.' })
          : null,
        type !== 'open' ? entityField('Contact sensor (optional)', { ...opt('contact'), domains: new Set(['binary_sensor']), hooks, empty: 'None: the door is drawn as an opening.' }) : null,
        type === 'door' || type === 'garage' ? entityField('Lock (optional)', { ...opt('lock'), domains: new Set(['lock']), hooks, empty: 'None.' }) : null,
        h('p.note', 'Tapping a lock or a garage door always opens Home Assistant’s own dialog.'));
    },

    /**
     * A scene that runs a Home Assistant script or scene instead of setting lights. `required`:
     * a floor button set to "run" keeps an empty `run` (the plan then says what is missing).
     */
    /** The input_boolean a floor button with "toggle" switches. */
    toggleField(item, hooks) {
      return entityField('Helper to toggle', {
        get: () => item.toggle || '',
        set: (v) => { item.toggle = v; },
        domains: new Set(['input_boolean']),
        empty: 'Pick an input_boolean.* helper.',
        hooks,
        placeholder: 'input_boolean.your_helper',
      });
    },

    runField(item, hooks, { required = false } = {}) {
      return entityField(required ? 'Script or scene to run' : 'Runs (script.* or scene.*, optional)', {
        get: () => item.run || '',
        set: (v) => { if (v || required) item.run = v; else delete item.run; },
        domains: RUN_DOMAINS,
        empty: required ? 'Pick a script.* or scene.* entity.' : 'Empty: the scene sets the lights below.',
        hooks,
        placeholder: 'script.your_script',
      });
    },
  };
}

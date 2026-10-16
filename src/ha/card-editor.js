// The card's visual editor in Home Assistant's dashboard editor (static getConfigElement). It edits
// the card's own options with Home Assistant's ha-form, shows a short summary of the plan (never the
// plan itself as a form) and, for administrators, opens the full-screen plan editor. A plan changed
// there comes back through `config-changed`, like any other option: the dashboard editor's own Save
// keeps it.
import { h } from '../../upstream/ui/dom.js';
import { cardStyles } from './styles.js';
import { openEditor } from './editor-dialog.js';
import { OPTION_SCHEMA, OPTION_NAMES, LABELS, HELPERS, planSummary } from './options.js';

/**
 * Makes sure Home Assistant's ha-form is defined. The frontend loads it lazily; the entities card's
 * own editor imports it (src/panels/lovelace/editor/config-elements/hui-entities-card-editor.ts),
 * so loading that editor through window.loadCardHelpers() defines it. False when it is not there.
 */
export async function ensureHaForm(timeout = 1500) {
  if (customElements.get('ha-form')) return true;
  try {
    const helpers = await window.loadCardHelpers?.();
    const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
    await card?.constructor?.getConfigElement?.();
  } catch { /* not inside Home Assistant */ }
  if (customElements.get('ha-form')) return true;
  return Promise.race([
    customElements.whenDefined('ha-form').then(() => true),
    new Promise((resolve) => { setTimeout(() => resolve(false), timeout); }),
  ]);
}

const EDITOR_CSS = `
:host { display: block; }
.summary { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-bottom: 16px;
  border-radius: var(--ha-card-border-radius, 12px); border: 1px solid var(--divider-color, rgba(127,127,127,.3)); }
.summary .text { flex: 1; min-width: 0; }
.summary b { display: block; color: var(--primary-text-color); }
.summary span { color: var(--secondary-text-color); font-size: 0.92em; }
.edit-home { font: inherit; font-weight: 600; padding: 8px 14px; border-radius: 18px; border: 0; cursor: pointer;
  color: var(--text-primary-color, #fff); background: var(--primary-color, #03a9f4); }
.note { color: var(--secondary-text-color); font-size: 0.9em; margin: 0; }
.fallback label { display: grid; gap: 4px; margin-bottom: 12px; color: var(--primary-text-color); }
.fallback label.check { grid-template-columns: auto 1fr; align-items: center; }
.fallback input[type=text], .fallback select { font: inherit; padding: 8px; }
.fallback small { color: var(--secondary-text-color); }
`;

export class HouseControlCardEditor extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._form = null;
    this._built = false;
  }

  setConfig(config) {
    this._config = config || {};
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form && !this._form.setData) this._form.hass = hass; // ha-form
    this._update();
  }

  get hass() { return this._hass; }

  connectedCallback() { this._build(); }

  /** The options shown in the form: never the plan. */
  _data() {
    return Object.fromEntries(OPTION_NAMES.filter((k) => this._config[k] != null).map((k) => [k, this._config[k]]));
  }

  _emit(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    this._update();
  }

  // An option changed: empty values are removed again so the card's defaults apply.
  _changed(value) {
    const next = { ...this._config };
    for (const k of OPTION_NAMES) {
      const v = value[k];
      if (v === undefined || v === '' || v === null) delete next[k];
      else next[k] = v;
    }
    this._emit(next);
  }

  async _build() {
    if (this._built) return;
    this._built = true;
    const style = document.createElement('style');
    style.textContent = EDITOR_CSS;
    this._summary = h('span');
    this._editBtn = h('button', { type: 'button', onclick: () => this._openPlanEditor() }, 'Edit home…');
    this._editBtn.classList.add('edit-home');
    this._adminNote = h('p.note', 'Only an administrator can change the home itself.');
    const formHost = h('div.form');
    this._shadow.append(style,
      h('div.summary', h('div.text', h('b', 'Home'), this._summary), this._editBtn),
      this._adminNote, formHost);
    this._update();

    if (await ensureHaForm()) {
      const form = document.createElement('ha-form');
      form.schema = OPTION_SCHEMA;
      form.computeLabel = (s) => LABELS[s.name] || s.name;
      form.computeHelper = (s) => HELPERS[s.name];
      form.addEventListener('value-changed', (ev) => { ev.stopPropagation(); this._changed(ev.detail.value || {}); });
      this._form = form;
    } else {
      this._form = this._fallbackForm();
    }
    if (this._hass && !this._form.setData) this._form.hass = this._hass; // ha-form
    formHost.replaceChildren(this._form);
    this._update();
  }

  // Plain inputs, for when ha-form cannot be loaded (outside Home Assistant).
  _fallbackForm() {
    const form = h('div.fallback');
    const fields = new Map();
    const read = () => Object.fromEntries([...fields].map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
    for (const s of OPTION_SCHEMA) {
      let input;
      if (s.selector.boolean) input = h('input', { type: 'checkbox', name: s.name });
      else if (s.selector.select) {
        input = h('select', { name: s.name }, h('option', { value: '' }, '—'),
          s.selector.select.options.map((o) => h('option', { value: o.value }, o.label)));
      } else input = h('input', { type: 'text', name: s.name, spellcheck: 'false' });
      input.addEventListener('change', () => this._changed(read()));
      fields.set(s.name, input);
      form.append(h(`label${s.selector.boolean ? '.check' : ''}`, input, h('span', LABELS[s.name]), HELPERS[s.name] ? h('small', HELPERS[s.name]) : null));
    }
    form.setData = (data) => {
      for (const [k, el] of fields) {
        if (el.type === 'checkbox') el.checked = Boolean(data[k]);
        else el.value = data[k] ?? '';
      }
    };
    return form;
  }

  _update() {
    if (!this._summary) return;
    this._summary.textContent = planSummary(this._config.plan);
    const admin = Boolean(this._hass?.user?.is_admin);
    this._editBtn.hidden = !admin;
    this._adminNote.hidden = admin;
    if (this._form?.setData) this._form.setData(this._data());
    else if (this._form) this._form.data = this._data();
  }

  // The full-screen plan editor, over Home Assistant's own editor dialog.
  async _openPlanEditor() {
    if (!this._hass?.user?.is_admin || this._planEditor) return;
    const host = h('div', { style: { position: 'fixed', inset: '0', zIndex: '10000' } });
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = cardStyles();
    shadow.append(style);
    document.body.append(host);
    try {
      this._planEditor = await openEditor(shadow, {
        plan: structuredClone(this._config.plan || {}),
        getHass: () => this._hass,
        getCardConfig: () => this._config,
        save: async (next) => {
          this._emit({ ...this._config, plan: next });
          return 'Applied: press Save in the card editor to keep it';
        },
        onClosed: () => { this._planEditor = null; host.remove(); },
      });
    } catch (e) {
      this._planEditor = null;
      host.remove();
      console.error(e);
    }
  }
}

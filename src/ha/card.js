// <house-control-card>: house-control's iPhone UI as a Lovelace card (brief section 3.2).
// The plan comes only from the card's config; devices are reached only through `hass`.
import { createStore } from '../../upstream/store.js';
import { createWorld } from '../../upstream/three/world.js';
import { createPanel } from '../../upstream/ui/panel.js';
import { h, openMenu } from '../../upstream/ui/dom.js';
import { icon } from '../../upstream/ui/icons.js';
import { haptic } from '../../upstream/bridge.js';
import { cardStyles } from './styles.js';
import { validatePlan, haLink } from './validate.js';
import { createHaBridge } from './bridge.js';
import { EntityMarker } from './markers.js';
import { entityTile, runAction, lookOf, labelOf } from './entities.js';
import { domainOf, RUN_DOMAINS, canBulk } from './sensitive.js';
import { defaultFloor, floorLights } from './floors.js';
import { createFloorBar } from './floor-bar.js';
import { DEFAULT_QUALITY } from './light-pool.js';
import { isActive } from './conditions.js';
import { createLive, daylightOf, wattsLabel } from './live.js';
import { liveEntities } from './live-fields.js';
import { icon as iconEl } from '../../upstream/ui/icons.js';
import { checkOptions } from './options.js';
import { savePlan, exportPlan, pickPlanFile, diffPlans, deepEqual, SaveFallback } from './plan-store.js';
import { openEditor } from './editor-dialog.js';
import { HouseControlCardEditor, ensureHaForm } from './card-editor.js';
import demoPlan from '../../plans/demo.json';

const TEARDOWN_DELAY = 400; // a card moved around the DOM is disconnected and connected again at once

export class HouseControlCard extends HTMLElement {
  static getStubConfig() {
    return { plan: structuredClone(demoPlan) };
  }

  // Home Assistant's dashboard editor: the card's options with ha-form, and "Edit home…".
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('house-control-card-editor');
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = cardStyles();
    this._root = h('div.hc-root.ios');
    this._shadow.append(style, this._root);
    this._config = null;
    this._hass = null;
    this._ui = null;
    this._editor = null;
    this._teardown = 0;
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    if (!config.plan || typeof config.plan !== 'object') {
      throw new Error('This card needs a "plan:". Start from the demo plan in the README, or add the card from the card picker.');
    }
    validatePlan(config.plan); // throws a ConfigError with a readable message: Home Assistant shows it
    checkOptions(config);
    if (this._config && deepEqual(config, this._config)) return;
    this._config = config;
    if (config.height) this.style.setProperty('--hc-height', String(config.height));
    else this.style.removeProperty('--hc-height');
    this.toggleAttribute('safe-area', Boolean(config.safe_area));
    this._rebuild();
  }

  set hass(hass) {
    this._hass = hass;
    this.toggleAttribute('light-theme', hass?.themes?.darkMode === false); // the panel follows the theme
    if (this._ui) this._ui.update(hass);
    else this._build();
  }

  get hass() { return this._hass; }

  getCardSize() { return 12; }

  getGridOptions() { return { columns: 'full', min_columns: 6, rows: 10, min_rows: 6 }; }

  connectedCallback() {
    clearTimeout(this._teardown);
    if (this._ui) this._ui.setVisible(true);
    else this._build();
  }

  disconnectedCallback() {
    this._ui?.setVisible(false);
    clearTimeout(this._teardown);
    this._teardown = setTimeout(() => {
      if (this.isConnected) return;
      this._editor?.close();
      this._destroy();
    }, TEARDOWN_DELAY);
  }

  _rebuild() {
    this._destroy();
    this._build();
  }

  _destroy() {
    this._ui?.dispose();
    this._ui = null;
  }

  _build() {
    if (this._ui || !this._config || !this._hass || !this.isConnected) return;
    try {
      this._ui = buildUi(this, this._config.plan, this._hass);
    } catch (error) {
      console.error(error);
      this._root.replaceChildren(h('div.fatal', h('h1', 'House Control could not start'),
        'The floor plan could not be shown.', h('code', String(error?.message || error))));
    }
  }

  /* ---------- plan management (admins) ---------- */

  _menu(anchor, anchorHost) {
    const admin = Boolean(this._hass?.user?.is_admin);
    const items = admin
      ? [
        { label: 'Edit home…', icon: icon('home', 16), action: () => this._openEditor() },
        { label: 'Import plan…', icon: icon('upload', 16), action: () => this._import() },
        { label: 'Export plan', icon: icon('download', 16), action: () => exportPlan(this._config.plan) },
      ]
      : [{ label: 'Only an administrator can change this home', action: () => {} }];
    openMenu(anchorHost, anchor, items);
  }

  async _openEditor() {
    if (this._editor) return;
    this._ui?.setVisible(false);
    try {
      this._editor = await openEditor(this._shadow, {
        plan: structuredClone(this._config.plan),
        getHass: () => this._hass,
        getCardConfig: () => this._config,
        onSaved: (plan) => this._adopt(plan),
        onClosed: () => { this._editor = null; this._ui?.setVisible(this.isConnected); },
      });
    } catch (e) {
      this._editor = null;
      this._ui?.setVisible(true);
      this._ui?.toast(`The editor could not start: ${e.message}`);
    }
  }

  // The plan was saved into the dashboard: show it now, without waiting for Home Assistant to
  // push the new dashboard config (which then compares equal and changes nothing).
  _adopt(plan) {
    this._config = { ...this._config, plan };
    this._rebuild();
    if (this._editor) this._ui?.setVisible(false); // still behind the editor
  }

  async _import() {
    let json;
    try {
      json = await pickPlanFile();
    } catch (e) { this._dialog('Import failed', [h('p.bad', e.message)]); return; }
    if (!json) return;
    let result;
    try {
      result = validatePlan(json, { states: this._hass.states });
    } catch (e) {
      this._dialog('This is not a valid plan', [h('p.bad', e.message)]);
      return;
    }
    const diff = diffPlans(this._config.plan, json);
    const lines = [];
    const LABEL = { rooms: 'Rooms', lights: 'Lights', acs: 'Air conditioners', entities: 'Other devices', scenes: 'Scenes' };
    for (const [key, d] of Object.entries(diff)) {
      const parts = [];
      if (d.added.length) parts.push(`${d.added.length} added (${d.added.join(', ')})`);
      if (d.removed.length) parts.push(`${d.removed.length} removed (${d.removed.join(', ')})`);
      if (d.changed.length) parts.push(`${d.changed.length} changed`);
      if (parts.length) lines.push(h('li', h('b', `${LABEL[key]}: `), parts.join(' · ')));
    }
    const body = [
      h('p', `“${json.name || 'Home'}” will replace “${this._config.plan.name || 'Home'}” in this card.`),
      lines.length ? h('ul', lines) : h('p', 'Nothing changes.'),
      result.warnings.length ? h('ul.warn', result.warnings.map((w) => h('li', w))) : null,
    ];
    this._dialog('Import plan', body, {
      confirm: 'Save',
      onConfirm: async () => {
        try {
          await savePlan(this._hass, this._config, json);
          this._adopt(json);
          this._ui?.toast('Plan imported');
        } catch (e) {
          const msg = e instanceof SaveFallback ? `${e.message} Paste the file's contents under "plan:" in the card's YAML instead.` : e.message;
          this._dialog('Could not save', [h('p.bad', msg)]);
        }
      },
    });
  }

  _dialog(title, body, { confirm = null, onConfirm = null } = {}) {
    const close = () => scrim.remove();
    const scrim = h('div.hc-dialog-scrim', { onclick: (ev) => { if (ev.target === scrim) close(); } },
      h('div.hc-dialog', { role: 'dialog', 'aria-label': title },
        h('h2', title), body,
        h('div.hc-dialog-actions',
          h('button', { onclick: close }, confirm ? 'Cancel' : 'OK'),
          confirm ? h('button.primary', { onclick: () => { close(); onConfirm(); } }, confirm) : null)));
    this._root.append(scrim);
  }
}

/* ---------- the live UI of one card ---------- */

function buildUi(card, plan, firstHass) {
  let hass = firstHass;
  const getHass = () => hass;
  const root = card._root;
  const unit = temperatureUnit(card._config, hass);
  const { config, warnings } = validatePlan(plan, { states: hass.states, unit });
  for (const w of warnings) console.warn(`House Control: ${w}`);

  const bridge = createHaBridge(config, { getHass, onSettled: () => syncNow(true) });
  bridge.applyCapabilities(hass);
  const builtShape = bridge.shape();
  const store = createStore(config, { transmit: bridge.transmit, canWrite: bridge.canWrite });
  const linked = [...config.lights, ...config.acs].some((d) => haLink(d) || d.link || d.tuya);
  // A plan without any real device (the demo, before linking) starts with something to look at.
  if (!linked) {
    const first = config.scenes.find((s) => s.id === 'cozy' && !s.run) || config.scenes.find((s) => !s.run);
    if (first) store.applyScene(first.id);
  }

  const markers = new Map(config.entities.map((e) => [e.id, new EntityMarker(e)]));
  const live = createLive(config); // doors, locks, garage doors, occupancy, people, heat map, fans, TVs
  const heatToggle = live.hasHeatmap ? h('button.room.heat-toggle', {
    'aria-pressed': 'false', title: 'Heat map',
    onclick: () => {
      haptic('tick');
      live.setHeatmap(!live.heatmap);
      heatToggle.classList.toggle('active', live.heatmap);
      heatToggle.setAttribute('aria-pressed', String(live.heatmap));
    },
  }, iconEl('thermo', 14), 'Heat map') : null;
  const entityCfg = new Map(config.entities.map((e) => [e.id, e]));
  const nameOf = (id) => store.lightCfg.get(id)?.name || store.acCfg.get(id)?.name || entityCfg.get(id)?.name || id;
  let panel = null;
  let world = null;
  const toast = (text) => panel?.toast(text);
  const onAction = (result, error) => { if (error) toast(error.message || String(error)); };

  // A script or scene (scene and floor buttons with `run`): only RUN_DOMAINS ever start.
  function runEntity(name, entity) {
    const domain = domainOf(entity);
    if (!RUN_DOMAINS.has(domain)) return; // validation already refuses anything else
    hass.callService(domain, 'turn_on', { entity_id: entity })
      .then(() => toast(`${name} started`), (e) => { haptic('error'); toast(`${name}: ${e.message}`); });
  }

  /* ---------- floors ---------- */

  const firstFloor = defaultFloor(config);
  const startStacked = Boolean(card._config.stacked_view_default) && config.multiFloor;
  function selectFloor(id) {
    world?.setFloor(id);
    panel?.selectFloor(id);
    floorBar.set(id);
  }
  const floorBar = createFloorBar(config, {
    floor: firstFloor,
    stacked: startStacked,
    onSelect: selectFloor,
    onStacked: (on) => world?.setStacked(on),
  });
  // A light with its own tap_action / hold_action / double_tap_action (instead of toggle / its sheet).
  function lightAction(cfg, which) {
    if (!cfg[`${which}_action`]) return false;
    runAction(card, hass, { ...cfg, entity: haLink(cfg) }, which);
    return true;
  }

  // A floor's buttons: its `actions`, or All on / All off for its own lights. The implicit floor
  // of a plan without "floors" has none: the list's All on / All off already do that.
  function floorActions(floorId) {
    const floor = config.floors.find((f) => f.id === floorId);
    if (!floor || floor.implicit) return [];
    return floor.actions.map((a) => ({
      id: a.id, name: a.name, icon: a.icon,
      active: () => isActive(a.activeWhen, hass.states),
      run() {
        if (a.run) { runEntity(a.name, a.run); return; }
        const on = a.builtin === 'all_on';
        for (const l of floorLights(config, floor.id, { haLink, canBulk })) store.setLight(l.id, { on });
      },
    }));
  }

  panel = createPanel(root, config, store, {
    onFocus: (target) => world?.focus(target),
    onMenu: (anchor, reason) => { if (reason !== 'escape' && anchor) card._menu(anchor, panel.anchorMenu); },
    onScene(scene) {
      if (!scene.run) { store.applyScene(scene.id); return; }
      runEntity(scene.name, scene.run);
    },
    entityTile: (cfg) => entityTile(cfg, { host: card, getHass, onAction }),
    availability: bridge.availability,
    tempUnit: unit,
    floor: firstFloor,
    floorBar: floorBar.el,
    floorActions,
    lightAction,
    sceneActive: (scene) => (scene?.run ? isActive(scene.activeWhen, hass.states) : null),
    roomNote: (id) => live.roomReading(id),
    lightNote: (cfg, on) => live.lightPower(cfg, on),
    roomsTrailer: heatToggle,
    headerExtra() {
      const out = [];
      const watts = card._config.power ? wattsLabel(hass.states[card._config.power]) : null;
      if (watts) out.push(h('span.house-power', ` · ${watts}`));
      const away = live.away();
      if (away.length) out.push(h('span.away', ` · ${away.join(', ')} away`));
      return out;
    },
  });

  world = createWorld(panel.canvas, config, store, {
    onHover: panel.showTooltip,
    entities: markers,
    live: live.units,
    quality: card._config.quality || DEFAULT_QUALITY,
    onPick(target) {
      if (!target) return;
      if (target.kind === 'light') {
        const missing = bridge.availability('light', target.id);
        if (missing) { toast(`${nameOf(target.id)}: ${missing}`); return; }
        haptic('light');
        if (!lightAction(store.lightCfg.get(target.id), 'tap')) store.toggleLight(target.id);
      } else if (target.kind === 'ac') {
        const missing = bridge.availability('ac', target.id);
        if (missing) toast(`${nameOf(target.id)}: ${missing}`);
        else panel.openSheet(target);
      } else if (target.kind === 'room') {
        // In the stacked view a tap on another floor selects that floor first.
        const floorId = world.floorOfRoom(target.id);
        if (floorId !== world.floor) { haptic('tick'); selectFloor(floorId); return; }
        panel.selectRoom(target.id);
      } else if (target.kind === 'live') {
        // a lock, a garage door or a TV: always Home Assistant's own dialog
        const entity = live.entityOf(target.id);
        if (entity) runAction(card, hass, { entity, tap_action: { action: 'more-info' } }, 'tap');
      } else if (target.kind === 'entity') {
        markers.get(target.id)?.bump();
        Promise.resolve(runAction(card, hass, entityCfg.get(target.id), 'tap')).then(onAction, (e) => onAction(null, e));
      }
    },
  });
  panel.attach(world);
  live.attach(world);
  world.setFloor(firstFloor);
  if (startStacked) world.setStacked(true);

  store.onDeviceError = (id, message) => {
    toast(`${nameOf(id)}: ${message}`);
    haptic('error');
  };

  // Upstream's phone layout: the header sits over the model, the panel overlaps its bottom.
  const safeTop = () => {
    const probe = root.appendChild(h('div', { style: { position: 'absolute', paddingTop: 'var(--safe-top-preview, 0px)' } }));
    const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    return top;
  };
  const applyInsets = () => world.setInsets(50 + safeTop(), 36);
  applyInsets();
  const resizer = new ResizeObserver(() => applyInsets());
  resizer.observe(panel.canvas);

  // Swiping in from the left edge goes back from a device sheet, as everywhere on iOS.
  const listeners = new AbortController();
  const opts = { capture: true, signal: listeners.signal };
  let edge = null;
  root.addEventListener('pointerdown', (ev) => {
    const left = root.getBoundingClientRect().left;
    edge = ev.clientX - left < 28 ? { x: ev.clientX, y: ev.clientY } : null;
  }, opts);
  root.addEventListener('pointerup', (ev) => {
    const swiped = edge && ev.clientX - edge.x > 56 && Math.abs(ev.clientY - edge.y) < 80;
    edge = null;
    if (swiped && panel.closeSheet()) haptic('light');
  }, opts);
  root.addEventListener('pointercancel', () => { edge = null; }, opts);

  /* ---------- Home Assistant state ---------- */

  const seenEntities = new Map();
  function syncEntities(force) {
    let any = false;
    for (const [id, unit] of markers) {
      const cfg = entityCfg.get(id);
      const st = hass.states[cfg.entity];
      if (!force && seenEntities.get(id) === st) continue;
      seenEntities.set(id, st);
      unit.apply(lookOf(cfg, st), labelOf(cfg, st));
      any = true;
    }
    return any;
  }

  // Scenes and floor buttons with active_when light up from these entities' states; the live
  // layer, the house power and the sun follow theirs.
  const sunOn = Boolean(card._config.sun);
  const conditionEntities = [
    ...config.scenes.flatMap((s) => s.activeWhen || []).map((c) => c.entity),
    ...config.floors.flatMap((f) => f.actions.flatMap((a) => a.activeWhen || [])).map((c) => c.entity),
    ...liveEntities(config),
    ...(card._config.power ? [card._config.power] : []),
    ...(sunOn ? ['sun.sun'] : []),
  ];
  let seenConditions = [];
  function conditionsChanged() {
    const now = conditionEntities.map((e) => hass.states[e]);
    const changed = now.some((st, i) => st !== seenConditions[i]);
    seenConditions = now;
    return changed;
  }

  function syncNow(force = false) {
    const devices = bridge.sync(hass, store, { force });
    const entities = syncEntities(force);
    const conditions = conditionsChanged();
    if (conditions || force) {
      live.sync(hass.states);
      if (sunOn) world.setDaylight(daylightOf(hass.states['sun.sun']));
    }
    if (devices || entities) { panel.refresh(); world.wake(); } else if (conditions) panel.refresh();
  }
  syncNow(true);

  /* ---------- visibility ---------- */

  let visible = true;
  let onScreen = true;
  let started = false;
  const running = () => visible && onScreen && !document.hidden;
  function applyRunning() {
    const on = running();
    world.setRunning(on);
    if (on && !started) { started = true; world.intro(); }
  }
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    applyRunning();
  });
  io.observe(card);
  document.addEventListener('visibilitychange', applyRunning, { signal: listeners.signal });
  applyRunning();

  return {
    update(next) {
      hass = next;
      bridge.applyCapabilities(hass);
      // What a light can do decides how its tile is built: rebuild when Home Assistant changes it.
      if (bridge.shape() !== builtShape) { queueMicrotask(() => card._rebuild()); return; }
      syncNow();
    },
    setVisible(on) { visible = on; applyRunning(); },
    toast,
    // for the render test and the browser console
    get debug() { return { store, world, panel, config, markers, live, get lightPool() { return world.lightPool(); } }; },
    dispose() {
      listeners.abort();
      io.disconnect();
      resizer.disconnect();
      bridge.dispose();
      live.dispose();
      panel.dispose();
      world.dispose();
      store.dispose();
      root.replaceChildren();
    },
  };
}

// `temperature_unit: F` (or C) in the card config, else Home Assistant's own unit system.
export function temperatureUnit(cardConfig, hass) {
  const set = String(cardConfig?.temperature_unit || '').toUpperCase().replace('°', '');
  if (set === 'F' || set === 'C') return `°${set}`;
  return hass?.config?.unit_system?.temperature === '°F' ? '°F' : '°C';
}

export function register() {
  // eslint-disable-next-line no-undef -- replaced by Vite at build time
  const version = typeof __CARD_VERSION__ === 'string' ? __CARD_VERSION__ : 'dev';
  console.info(`%c HOUSE-CONTROL-CARD %c ${version} `, 'color:#fff;background:#41bdf5', 'color:#41bdf5');
  if (!customElements.get('house-control-card')) customElements.define('house-control-card', HouseControlCard);
  if (!customElements.get('house-control-card-editor')) customElements.define('house-control-card-editor', HouseControlCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === 'house-control-card')) {
    window.customCards.push({
      type: 'house-control-card',
      name: 'House Control 3D',
      description: 'A 3D model of your home with glowing lights, scenes and room controls (based on house-control).',
      preview: true,
      documentationURL: 'https://github.com/Jabberwocky7777/shrumslab-HA3D',
    });
  }
}

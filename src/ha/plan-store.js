// Where the plan lives (brief section 3.7): only in this card's dashboard configuration, which
// Home Assistant sends to logged-in users over its authenticated websocket. Never under /local/.
//
// Saving uses the frontend's own lovelace websocket commands, as in
// https://github.com/home-assistant/frontend/blob/dev/src/data/lovelace/config/types.ts
//   { type: 'lovelace/config', url_path, force }        -> the dashboard's raw config
//   { type: 'lovelace/config/save', url_path, config }  -> stores it
// The card has no handle on its own place in the dashboard, so it looks for the card config
// it was given (deep equal) and replaces the `plan` of that one card.

export class SaveFallback extends Error {}

const slug = (t) => String(t || 'home').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';

/** Downloads the plan as `<home-name>.plan.json`. Client side only: nothing is uploaded. */
export function exportPlan(plan) {
  const blob = new Blob([`${JSON.stringify(plan, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(plan?.name)}.plan.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lets the user pick a plan file; resolves with the parsed JSON (or null if cancelled). */
export function pickPlanFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try { resolve(JSON.parse(await file.text())); } catch (e) { reject(new Error(`Could not read ${file.name}: ${e.message}`)); }
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** Every object in a dashboard config that is a copy of `card` (cards can sit in views, sections, stacks). */
export function findCards(dashboard, card) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && node.type === card.type && deepEqual(node, card)) { found.push(node); return; }
    for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v);
  };
  walk(dashboard);
  return found;
}

// The dashboard the card is on: hass.panelUrl is the frontend's current panel ("lovelace" for
// the default one, which older cores only know as url_path null).
function urlPaths(hass) {
  const path = hass.panelUrl ?? location.pathname.split('/')[1] ?? null;
  return path === 'lovelace' ? ['lovelace', null] : [path];
}

/**
 * Writes `plan` into this card's config in the dashboard. Throws a SaveFallback (with a
 * message meant for the user) whenever that is not possible: YAML or generated dashboards,
 * a card that cannot be found, a non-admin user.
 */
export async function savePlan(hass, cardConfig, plan) {
  if (!hass?.user?.is_admin) throw new SaveFallback('Only an administrator can change the plan.');
  let dashboard = null;
  let urlPath = null;
  let lastError = null;
  for (const candidate of urlPaths(hass)) {
    try {
      dashboard = await hass.callWS({ type: 'lovelace/config', url_path: candidate, force: false });
      urlPath = candidate;
      break;
    } catch (e) { lastError = e; }
  }
  if (!dashboard) throw new SaveFallback(`Could not read this dashboard (${lastError?.message || 'unknown error'}).`);
  if ('strategy' in dashboard) throw new SaveFallback('This dashboard is generated automatically, so the card cannot save into it.');
  const matches = findCards(dashboard, cardConfig);
  if (matches.length !== 1) {
    throw new SaveFallback(matches.length
      ? 'This dashboard has several identical House Control cards, so it is not clear which one to update.'
      : 'This card could not be found in the dashboard configuration (is the dashboard in YAML mode?).');
  }
  matches[0].plan = plan;
  try {
    await hass.callWS({ type: 'lovelace/config/save', url_path: urlPath, config: dashboard });
  } catch (e) {
    throw new SaveFallback(`Home Assistant did not save the dashboard (${e.message || e.code || 'error'}). YAML dashboards have to be edited by hand.`);
  }
}

/** What an import would change: names of rooms, lights and entities added and removed. */
export function diffPlans(before, after) {
  const out = {};
  for (const key of ['rooms', 'lights', 'acs', 'entities', 'scenes']) {
    const a = new Map((before?.[key] || []).map((x) => [x.id, x]));
    const b = new Map((after?.[key] || []).map((x) => [x.id, x]));
    const added = [...b.keys()].filter((id) => !a.has(id));
    const removed = [...a.keys()].filter((id) => !b.has(id));
    const changed = [...b.keys()].filter((id) => a.has(id) && !deepEqual(a.get(id), b.get(id)));
    out[key] = { added, removed, changed };
  }
  return out;
}

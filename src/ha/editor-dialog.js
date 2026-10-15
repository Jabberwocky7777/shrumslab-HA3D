// Hosts upstream's plan editor full screen inside the card (brief section 3.7, route 2).
// Saving writes the plan back into this card's dashboard config; when that cannot be done the
// plan is downloaded instead and the user is told how to paste it into the YAML.
import { h } from '../../upstream/ui/dom.js';
import { bootEditor } from '../../upstream/editor/editor.js';
import { createEditorLinks } from './editor-links.js';
import { validatePlan } from './validate.js';
import { savePlan, exportPlan, SaveFallback } from './plan-store.js';

export async function openEditor(shadow, { plan, getHass, getCardConfig, onSaved, onClosed }) {
  const layer = h('div.hc-root.ios.mode-editor.hc-editor-layer');
  shadow.append(layer);
  const listeners = new AbortController();
  let editor = null;

  const close = () => {
    editor?.dispose();
    editor = null;
    listeners.abort();
    layer.remove();
    onClosed?.();
  };

  try {
    editor = await bootEditor(layer, {
      plan,
      links: createEditorLinks(getHass),
      validate: (p) => validatePlan(p).config,
      signal: listeners.signal,
      phone: window.matchMedia('(max-width: 899px), (pointer: coarse)').matches,
      onClose: close,
      async onSave(next) {
        try {
          await savePlan(getHass(), getCardConfig(), next);
        } catch (e) {
          if (!(e instanceof SaveFallback)) throw e;
          exportPlan(next);
          throw new Error(`${e.message} The plan was downloaded: paste it under "plan:" in the card's YAML.`);
        }
        onSaved?.(next);
        return 'Saved to this dashboard';
      },
    });
  } catch (e) {
    close();
    throw e;
  }
  return { close, get dirty() { return editor?.dirty ?? false; } };
}

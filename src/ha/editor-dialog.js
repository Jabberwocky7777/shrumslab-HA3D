// Hosts upstream's plan editor full screen inside the card (brief section 3.7, route 2).
// Saving writes the plan back into this card's dashboard config; when that cannot be done the
// plan is downloaded instead and the user is told how to paste it into the YAML.
import { h } from '../../upstream/ui/dom.js';
import { bootEditor } from '../../upstream/editor/editor.js';
import { createEditorLinks } from './editor-links.js';
import { createEditorFloors } from './editor-floors.js';
import { openImportDialog } from './import-dialog.js';
import { validatePlan } from './validate.js';
import { savePlan, exportPlan, SaveFallback } from './plan-store.js';

// `save(plan)`: where Save goes instead of the dashboard (the card's own editor: back into its config).
export async function openEditor(shadow, { plan, getHass, getCardConfig, onSaved, onClosed, save = null }) {
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
      floors: createEditorFloors(),
      // Only administrators get the editor at all; the import checks again before reading the registry.
      tools: [{
        id: 'ha-import', icon: 'homeassistant', label: 'From Home Assistant',
        run: (api) => {
          if (!getHass()?.user?.is_admin) return;
          openImportDialog(api.root.querySelector('.editor') || api.root, {
            getHass, getPlan: api.getDoc, onApply: (next, note) => api.setDoc(next, note),
          });
        },
      }],
      validate: (p) => validatePlan(p).config,
      signal: listeners.signal,
      phone: window.matchMedia('(max-width: 899px), (pointer: coarse)').matches,
      onClose: close,
      async onSave(next) {
        if (save) {
          const note = await save(next);
          onSaved?.(next);
          return note;
        }
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

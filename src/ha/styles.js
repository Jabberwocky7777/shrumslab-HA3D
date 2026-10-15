// Upstream's stylesheets are written for a whole page (html, body, #app, html.ios...).
// Inside the card they apply to a shadow root instead: the page-level selectors are
// rewritten to `.hc-root`, the element that stands in for html, body and #app.
import upstreamCss from '../../upstream/style.css?inline';
import editorCss from '../../upstream/editor/editor.css?inline';
import cardCss from './card.css?inline';

const RULES = [
  // most specific first
  [/html\.ios\.mode-editor\s+body/g, '.hc-root.mode-editor'],
  [/html\.mode-editor\s+body/g, '.hc-root.mode-editor'],
  [/html\.mode-editor\s+#app/g, '.hc-root.mode-editor'],
  [/html\.mode-editor/g, '.hc-root.mode-editor'],
  [/html\.ios\s+body/g, '.hc-root.ios'],
  [/html\.ios\s+#app/g, '.hc-root.ios'],
  [/html\.ios/g, '.hc-root.ios'],
  // the card never runs inside the native shell or the island
  [/html\.native/g, '.hc-never'],
  [/html:not\(\.mode-island\)/g, '.hc-root'],
  [/html,\s*body/g, '.hc-root'],
  [/(^|[\s,}])body(?=[\s,{.:#[])/g, '$1.hc-root'],
  [/(^|[\s,}])html(?=[\s,{.:#[])/g, '$1.hc-root'],
  [/#app\b/g, '.hc-root'],
  [/:root/g, ':host'],
];

export function scopeCss(css) {
  let out = css;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

// `@property` is ignored inside a shadow root, so upstream's animated --mood is registered once
// for the whole document (it only declares the custom property's type).
function registerMood() {
  try {
    CSS.registerProperty({ name: '--mood', syntax: '<color>', inherits: true, initialValue: '#17274f' });
  } catch { /* already registered, or not supported: the mood then changes without a fade */ }
}

let sheet = null;

/** The stylesheet text for a card's shadow root (built once, shared by every card). */
export function cardStyles() {
  if (sheet === null) {
    registerMood();
    sheet = [upstreamCss, editorCss].map(scopeCss).join('\n') + '\n' + cardCss;
  }
  return sheet;
}

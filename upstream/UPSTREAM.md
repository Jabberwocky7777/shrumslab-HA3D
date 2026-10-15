# Upstream code

This folder is [house-control](https://github.com/0xProbabillity/house-control)'s `web/src`
at commit `3b223c0` (MIT, © 2026 0xProbability), changed as little
as possible. Every change is marked with an `ha3d:` comment, so `grep -rn "ha3d" upstream/` lists them.
The first commit of this repository is the unmodified copy, so `git diff <first commit> -- upstream/`
shows the full patch.

## Removed

| Upstream | Why |
|---|---|
| `agent/` (AI Access) | Opens tunnels and remote control endpoints. Must not exist in this card. |
| `island/` | The macOS notch UI. |
| `editor/connections.js` | Native Smart Life / Hue / HomeKit connection and pairing screens. Replaced by `src/ha/editor-links.js`. |
| `widgets.js` | iOS / macOS widgets. |
| `main.js` | Wiring of the native shell (plan menu, `incoming.*`, `post('openAgent')`, `quit`, `revealPlan`...). Its boot logic lives in `src/ha/card.js`. |

## Changed

| File | Change |
|---|---|
| `bridge.js` | No `window.webkit.messageHandlers`. Always the iPhone layout. `post()` is a no-op; `haptic()` fires Home Assistant's `haptic` event. |
| `config.js` | No `fetch()` of `./plans/<name>.json`: the plan only comes from the card config. Scenes keep `run`. |
| `store.js` | No `localStorage` state. `transmit` and `canWrite` are injected (Home Assistant). `dispose()` stops the simulation timer. |
| `ui/panel.js` | No AI Access badge. Hooks for scenes with `run`, entity tiles and unavailable devices. `dispose()` removes its window listener. |
| `ui/dom.js` | `openMenu` uses `composedPath()`, so outside clicks work inside a shadow root. |
| `ui/icons.js` | More icons (lock, garage, speaker...) and `iconNode()` for drawing icons on a canvas. |
| `three/world.js` | Extra `entities` units (picked and animated like lamps), `wake()`, and `dispose()` frees geometries, materials and textures too. |
| `editor/editor.js` | Hosted by the card: plan, save, close and entity pickers come in as options; Smart Life and connection screens removed; an `entities` section; export as `<name>.plan.json`; window listeners removed with an `AbortSignal`. |

## Taking in upstream changes

```sh
git remote add upstream https://github.com/0xProbabillity/house-control.git
git fetch upstream
git diff 3b223c0 upstream/main -- web/src     # what changed upstream since this copy
```

Apply the relevant parts of that diff to the files here (paths are the same below `web/src/`),
keep the `ha3d:` changes, update the commit above, and run `npm run check`.

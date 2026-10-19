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
| `ui/panel.js` | Room tabs only for rooms with a light, AC or entity, or with `"tab": true` (`config.js` keeps `tab`). No AI Access badge. Hooks for scenes with `run`, entity tiles and unavailable devices. `dispose()` removes its window listener. Floors: a `floorBar` slot above the room tabs, `selectFloor()`, tiles, tabs, counts and the list's All on / All off scoped to the selected floor, and the floor's buttons (`floorActions`) first in the scenes row. `lightAction` (a light's own `tap_action` / `hold_action` / `double_tap_action`) and `sceneActive` (a scene's `active_when`) hooks. `headerExtra`, `roomNote`, `lightNote` and `roomsTrailer` hooks (house power and who is away, room temperatures, a light's watts, the heat map button). Rooms with `partOf` get no tab; their devices and counts go to their main room. Placeholder lights are left out of the counts. A light's `tileIcon` (a fan without a bowl) replaces its tile icon. |
| `ui/dom.js` | `openMenu` uses `composedPath()`, so outside clicks work inside a shadow root. |
| `ui/icons.js` | More icons (lock, garage, speaker, layers, up...) and `iconNode()` for drawing icons on a canvas. |
| `three/world.js` | Extra `entities` units (picked and animated like lamps), `wake()`, and `dispose()` frees geometries, materials and textures too. Floors (larger than a hook: the scene, picking and the camera all assumed one flat house): one group per floor built with `buildHouse` / `buildFurniture` from `src/ha/floors.js`'s `floorView`, each light, AC and entity on its room's floor, `setFloor()`, `setStacked()` (floors slide apart by level, the others dimmed with see-through copies of their materials and no shadows), picking limited to the shown floor (and the rooms of the others when stacked), and camera framing per floor. |
| `three/world.js` (live) | A `live` option (`src/ha/live.js`: doors, garage doors, room tints, people, TV tap targets) drawn on their floor and picked as `{ kind: 'live' }`; `findFurniture()`, `floorGroup()`, `screenOf()` and `setDaylight()` (sky, ambient and outdoor light between night and day). |
| `three/world.js` (render loop) | Live units with `ambient: true` (spinning fans) are drawn at `animationFps` at most while nothing else moves, rest after `idlePause` seconds without `interact()`, and `busy()` lifts the cap. `floorAnimated(id)`, `interact()`, `loopStats()` and `renderInfo()` (renderer.info, reset once per frame so every pass counts). Each floor's static meshes are merged (`src/ha/static-merge.js`); light fixture and AC groups have frozen matrices. |
| `three/lights.js` | A fixture's glow meshes are merged into one, its body into as few meshes as its materials allow, a fan's blades into one (`mergeChildren`). |
| `three/kit.js` | `box()` and `cyl()` share one geometry per size. |
| `three/house.js` | `garage` openings are gaps like doors; `src/ha/live.js` draws the door. No wall between the rectangles of one room (`partOf`); `wallSegments` is exported for the unit tests. |
| `three/furniture.js` | Every piece keeps its plan item in `userData.item`; the TV's screen mesh is named `screen`. |
| `three/extras.js` (live) | The fan's blades are one group named `fan-blades` (they spin); the media wall's screen is named `screen`. |
| `three/world.js` (motion) | `prefers-reduced-motion`: no intro fly-in, no pulses, the camera and floors jump to where they go. |
| `three/world.js` (light budget) | A `quality` option (pixel ratio, multisampling, bloom on or off) and the light pool of `src/ha/light-pool.js`: the fixtures' own lights (and the entity markers') are made invisible and only describe a light; a fixed set of real Spot and Point lights is filled from them every frame something moves. `lights.js` only merges its meshes (below). |
| `editor/points.js` | Ours: lights with `points` (cans, sconce) move and draw as one item in the editor. |
| `editor/editor.js` | Multi-point lights drawn point by point and moved together (`points.js`); selecting a light no longer writes `capabilities: []`. Hosted by the card: plan, save, close and entity pickers come in as options; Smart Life and connection screens removed; an `entities` section; export as `<name>.plan.json`; window listeners removed with an `AbortSignal`. Floors through a `floors` option (`src/ha/editor-floors.js`): a Floors section and inspector, floor chips over the plan, the plan, list and room drags limited to the shown floor, new items placed on it, and a Floor picker on rooms (the finish is now labelled "Floor finish"). A `tools` option: the host's own actions (Import from Home Assistant…, `src/ha/import-dialog.js`) in the Add sheet and the toolbar, with a small API to read and replace the plan being edited. |

## Taking in upstream changes

```sh
git remote add upstream https://github.com/0xProbabillity/house-control.git
git fetch upstream
git diff 3b223c0 upstream/main -- web/src     # what changed upstream since this copy
```

Apply the relevant parts of that diff to the files here (paths are the same below `web/src/`),
keep the `ha3d:` changes, update the commit above, and run `npm run check`.

## Extra furniture and light fixtures (ha3d)

`three/extras.js` is ours, not upstream's. It adds generic, configurable models used by
real-world plans: `poolTable`, `sectional`, `glassCabinet`, `mediaWall`, `barCart`, `treadmill`,
`popcornMachine`, `pokerTable`, `wetBar`, `darkBookcase`, `deskSetup`, `catTree`, `litterRobot`,
`pedestalSink`, `tubShower`, `tubOnly`, `stairs`, `endTable`, `dehumidifier`, `airPurifier`,
`washerDryer`, `showerStall`, `daybed`, `walkInCloset`, and light types `fan`, `pendantBar`, `sconce`, `cans` (multi-point: `"points": [[x, z], ...]`),
and `dome`. Hooks into upstream are one line each, marked `// ha3d`, in `three/furniture.js`,
`three/lights.js`, `three/kit.js` (carpet floor), `config.js` (light types, floor kinds),
`editor/editor.js` (carpet fill) and `ui/icons.js`.

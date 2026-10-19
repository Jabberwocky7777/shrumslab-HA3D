# House Control 3D

[![HACS Custom][hacs-badge]][hacs-url] [![Release][release-badge]][release-url] [![Downloads][downloads-badge]][release-url] [![Home Assistant][ha-badge]][ha-url] [![CI][ci-badge]][ci-url] [![License][license-badge]](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/LICENSE)

![House Control 3D: the card and its plan editor](https://raw.githubusercontent.com/Jabberwocky7777/shrumslab-HA3D/main/docs/images/hero.png)

**Your home as a live 3D model, right in your Home Assistant dashboard.** Lights glow when they're
on, and you tap to toggle and drag to dim. It is the web UI of
[house-control](https://github.com/0xProbabillity/house-control) (iPhone layout), with its native
device bridge replaced by Home Assistant, and it's made to be the main dashboard in the Home
Assistant phone app.

## ✨ Features

- 🏠 **3D model** from a simple floor plan (rooms, doors, windows, furniture), lit by your real lights.
- 🏢 **Several floors**: a floor switcher, per-floor buttons (scripts, scenes, All on / All off) and a
  stacked view of the whole house.
- 💡 **Lights**: tap to toggle, drag sideways to dim, touch and hold for brightness, white and colour.
  State updates live from Home Assistant (wall switches, automations, other dashboards).
- 📺 **Other devices** (TV, thermostat, fan, lock, garage door, camera...) as glowing icons and tiles
  that open Home Assistant's own dialogs.
- 🎬 **Scenes**: house-control's light scenes, or buttons that run a Home Assistant script or scene.
- ✏️ **Visual editor** for admins, saved straight into the dashboard. Import and export as a file.
  The card's options have Home Assistant's own editor too, with an **Edit home…** button.
- 🚪 **The house as it is**: doors swing open with their sensors, locks show on doors, garage doors
  roll, occupied rooms glow, people stand in their room, a heat map, spinning fans, TVs that light up
  with what's playing, power readings and daylight from the sun.
- 🏗️ **Start from Home Assistant**: the editor can build a plan (or fill in the current one) from
  your floors, areas, lights and devices; you only drag the rooms into place.
- 👆 **Home Assistant actions**: `tap_action`, `hold_action` and `double_tap_action` on devices
  (and lights), run by Home Assistant itself, confirmations included.
- 🎨 **Follows your theme** (panel colours, corner radius) and **reduced motion**.
- 🔒 **Private by design**: the plan never goes in `/config/www`, nothing is loaded from the internet,
  no tokens. See [Privacy](#privacy).

| Every floor at once | The house as it is |
| :---: | :---: |
| ![The stacked view: the basement lit under the dimmed main floor](https://raw.githubusercontent.com/Jabberwocky7777/shrumslab-HA3D/main/docs/images/stacked.png) | ![Heat map, an open front door, an unlocked lock and the garage door half open](https://raw.githubusercontent.com/Jabberwocky7777/shrumslab-HA3D/main/docs/images/live.png) |

## Install

### HACS (recommended)

[![Open your Home Assistant instance and open this repository inside HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Jabberwocky7777&repository=shrumslab-HA3D&category=plugin)

Click the button above, or by hand:

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/Jabberwocky7777/shrumslab-HA3D`, type **Dashboard**.
2. Find **House Control 3D** in HACS and download it. HACS adds the dashboard resource
   (under `/hacsfiles/`) for you.
3. Reload the browser (or restart the app).

New versions show up in HACS as an update; the card's version is logged in the browser console
(`HOUSE-CONTROL-CARD x.y.z`).

### By hand

Download `shrumslab-ha3d.js` from the [latest release](https://github.com/Jabberwocky7777/shrumslab-HA3D/releases),
put it in `/config/www/`, and add it under **Settings → Dashboards → ⋮ → Resources** as
`/local/shrumslab-ha3d.js`, type *JavaScript module*. (The card's code is public, so `www` is fine
for it. Your plan is not: it stays in the card's config, see [Privacy](#privacy).)

## Set up the dashboard

The card is designed to fill a **panel** view.

1. **Settings → Dashboards → Add dashboard** → *New dashboard from scratch*, e.g. "Home 3D".
2. Open it, **✎ Edit** → the view's ✎ → **View type: Panel (single card)**.
3. **Add card** → search for **House Control 3D**. It starts with the demo house.
4. Replace the demo plan with yours: in the visual editor (below), by importing a plan file, or in YAML.
   The card's own editor (✎ on the card) sets the options below and has **Edit home…**; it shows
   a summary of the plan, never the plan itself as a form.

```yaml
type: custom:house-control-card
plan:
  name: Home
  rooms:
    - { id: living, name: Living, rect: [0, 0, 6, 4.5], floor: oak }
  lights:
    - id: living.main
      name: Ceiling
      room: living
      type: ceiling
      pos: [3, 2.2]
      link: { service: homeassistant, id: light.your_light }
```

### Options

| Option | Default | Description |
| --- | --- | --- |
| `plan` | the demo house | The floor plan: rooms, lights, devices and scenes. See [the plan](#the-plan). |
| `height` | fills the view | CSS height of the card, e.g. `100%` or `800px`. |
| `safe_area` | `false` | `true` keeps clear of the phone's notch, for a kiosk view without a header. |
| `full_bleed` | `false` | `true` fills the screen under the phone's status bar, for a kiosk view without a header. It keeps the card's header clear of the notch too, so you don't need `safe_area` as well. |
| `temperature_unit` | Home Assistant's | `F` or `C`. |
| `stacked_view_default` | `false` | `true` starts a plan with several floors in the stacked view. |
| `quality` | `medium` | `low`, `medium` or `high`: how many real lights and shadows the 3D view uses (see below). |
| `sun` | `false` | `true`: the 3D view goes from night to daylight with `sun.sun`'s elevation. |
| `power` | | A `sensor.*` with the house's total power, shown in the header. |
| `animation_fps` | `20` | 5 to 60: the frame rate while spinning fans are the only thing moving. Taps, camera moves, fades and state changes always run at full speed. |
| `idle_pause` | `30` | Seconds without a touch, click or scroll on the card before spinning fans freeze and the 3D view stops drawing. `0`: never. Lights, doors and glows still update while it rests; the next touch, or a fan turning on, off or changing speed, starts the fans again. |
| `debug_stats` | `false` | `true` shows the frame rate, draw calls, geometries and textures over the 3D view. |

### Quality and big homes

However many lamps a plan has, the 3D view uses a fixed handful of real lights: about 4 on `low`,
8 on `medium` and 12 on `high`. They go to the lamps that are on, on the floor you look at, nearest
to what the camera frames, brightest first. Every other lamp that is on still glows and throws a soft
pool of light on the floor; lamps that are off cost nothing. Shadows come from a few of those lights
only, never from table, floor or strip lights, and never more than the phone's graphics chip can
take. `low` also skips the bloom glow and renders at a lower resolution: use it on older phones.

### Battery and heat

The 3D view only draws while something moves. Spinning fans would keep it drawing forever, so:
only fans on the floor you look at turn (not on hidden or dimmed floors); while they are the only
thing moving the view draws at `animation_fps` (20 by default) instead of the screen's rate; and
after `idle_pause` seconds (30) without a touch it rests completely. Walls, floors and furniture are
merged into a few meshes per floor, so the demo house takes about 130 draw calls per floor and 170
for every floor stacked. `debug_stats: true` shows the numbers on the card.

### Make it the phone app's default

In the Home Assistant app (or a browser), open your **Profile** and pick the new dashboard under
**Dashboard**: that's the default for this device. If you hide Home Assistant's header on that
device (with a kiosk add-on, for example), set `safe_area: true` so the card keeps clear of the
notch, or `full_bleed: true` so it also fills the screen under the status bar (no need for both).

## The plan

The plan format is house-control's, with Home Assistant links and a new `entities` section. See
**[docs/plan-format.md](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/docs/plan-format.md)**. In short:

- `floors` (optional) are the storeys, each with its own buttons; rooms then name theirs with
  `storey`. See [floors](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/docs/plan-format.md#floors-new-in-this-card).
- `rooms` are rectangles in metres (`x` grows east, `z` grows south), with `oak`, `walnut`,
  `tile`, `stone` or `carpet` floors. `openings` are doors and windows, `furniture` is decoration:
  house-control's pieces (sofa, bed, kitchen, dining set...) plus this card's extras: `poolTable`,
  `sectional`, `glassCabinet`, `darkBookcase`, `mediaWall`, `wetBar`, `barCart`, `pokerTable`,
  `popcornMachine`, `treadmill`, `deskSetup`, `endTable`, `pedestalSink`, `tubOnly`, `tubShower`,
  `stairs`, `catTree`, `litterRobot`, `dehumidifier`, `airPurifier`, `washerDryer`, `showerStall`,
  `daybed`, `walkInCloset`.
- A room gets a tab in the room filter only when a light, AC or entity is in it. Set `tab: true`
  or `tab: false` on a room to force a tab on or off; tab-less rooms still show in 3D.
- A room of several rectangles: the extra ones say `part_of: "<room id>"`. They share the main
  room's tab, glow and temperature, with no wall between them.
- `area` on a room is a Home Assistant area id or name, or a list of them; people whose state
  matches any of them stand in that room.
- Light fixtures: `ceiling`, `pendant`, `spots`, `floor`, `table`, `strip`, plus `fan`,
  `pendantBar`, `dome`, and `cans` and `sconce`, which take a `points` list for several
  fixtures on one switch. A `fan` takes `bowl: false` (no light kit) and `spin`: a `fan.*`, or
  `"light"` to turn while its own switch is on.
- `placeholder: true` on a light without a `link`: drawn unlit, "Not connected", never switched or
  counted.
- `lights` link to `light.*` or `switch.*` entities with `link: { service: homeassistant, id: ... }`.
  Leave `capabilities` out and they come from the entity's `supported_color_modes`.
- `entities` holds everything else (TV, thermostat, lock...), with Home Assistant's `tap_action`,
  `hold_action` and `double_tap_action` (the older `tap: more-info | toggle | navigate` still works).
- `scenes` set lights, or `run` a `script.*` or `scene.*`, lit up while their `active_when` matches.
- Floor buttons `run` a script or scene, switch the floor's lights (`builtin`) or `toggle` an
  `input_boolean.*`, and take `confirmation: true` (or `{ "text": ... }`) to ask first in the
  card's own sheet.
- Optional sensors make the model show what is going on: `contact` and `lock` on doors, `garage`
  doors with a `cover`, `occupancy` and `temperature` on rooms, `people`, `spin` and `power` on lights,
  and an `entity` on a TV. See [what the house is doing](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/docs/plan-format.md#what-the-house-is-doing-new-in-this-card).

### Editing

Every way to change the plan needs a Home Assistant **administrator**. Others see the card but not
its editing menu.

1. **Visual editor**: the ⚙ button in the card's header → **Edit home…**. Drag rooms, lamps and
   devices on the plan, pick entities from Home Assistant, check the result in 3D, then **Save**.
   The plan is written into this card's config in the dashboard.
2. **YAML**: the dashboard's raw configuration editor; the `plan:` block is plain data. This always
   works.
3. **Export**: ⚙ → **Export plan** downloads `<home-name>.plan.json`. It's generated in the browser;
   nothing is uploaded.
4. **Import**: ⚙ → **Import plan…**, pick a `.plan.json`. The card checks it, shows what changes
   (rooms, lights and devices added or removed) and saves it into the card.
5. **From Home Assistant**: in the editor, **Add → From Home Assistant** builds rooms from your areas
   (on your floors), with their lights, lamp-like switches and devices to pick from. It adds only
   what the plan is missing, or starts a new plan; nothing is saved until you press Save.

**YAML-mode dashboards** can't be saved from the card: the editor then downloads the plan for you to
paste in. You can also keep the plan in its own file and include it. Put that file anywhere under
`/config` **except `/config/www`**:

```yaml
# ui-lovelace.yaml (or a dashboard's YAML file)
views:
  - title: Home
    type: panel
    cards:
      - type: custom:house-control-card
        plan: !include house/home.plan.yaml   # /config/house/, NOT /config/www/
```

## Theme and motion

The panel, sheets and dialogs take your Home Assistant theme's colours (`--primary-color`,
`--primary-text-color`, `--card-background-color`) and `--ha-card-border-radius`; with a light theme
the panel becomes a light sheet over the 3D view. The 3D view itself keeps its night look. With
**reduce motion** turned on in the phone or browser, there is no fly-in, no pulse on a tap and the
camera jumps instead of gliding.

## Sensitive devices

Locks, alarm panels, covers (garage doors, gates, blinds: all covers), valves, sirens and cameras are
**never one-tap**. Tapping, holding or double-tapping one always opens Home Assistant's own more-info
dialog, which handles codes and confirmations. The card refuses a plan that tries to `toggle` one or
reach one with `perform-action` (also through `target`), and no scene,
"All on", "All off" or the power button ever reaches them: bulk actions only change `light`,
`switch`, `fan`, `climate` and `media_player`. Scenes may run your own `script.*` and `scene.*`.

## Privacy

- **The plan lives only in the card's dashboard config.** Home Assistant sends it only to logged-in
  users over its authenticated websocket. The card never fetches a plan from `/local/`,
  `/hacsfiles/` or any URL. Files in `/config/www` are served *without* authentication
  ([Home Assistant docs](https://www.home-assistant.io/integrations/http/)), so don't put a plan there.
- **No outside connections.** three.js, the icons and everything else are bundled. No CDN, no web
  fonts, no analytics. The only traffic is through the `hass` connection the dashboard gives the
  card. The render test fails if the card makes any request to another origin.
- **No credentials.** The card never asks for, stores or logs tokens or passwords. It keeps no device
  state or plan data in the browser's `localStorage`.
- **This repository contains no real home.** The only plan is the demo house (`plans/demo.json`,
  every entity named `demo_...`), and all screenshots are of it. A privacy check runs before every
  commit and in CI: it refuses real-looking entity ids, Nabu Casa / DuckDNS URLs, IP addresses,
  tokens, plan files and photos. Work on your own plan in `private/`, which git ignores.

## Development

```sh
npm install        # also points git at .githooks/ (privacy check before each commit)
npm run build      # dist/shrumslab-ha3d.js, one ES module with everything bundled
npm run dev        # rebuild on change
npm run serve      # http://127.0.0.1:4178/tests/harness/ : the card with a mock hass and the demo house
npm run check      # lint, privacy check, unit tests, build, headless render test
```

- `upstream/`: house-control's `web/src`, changed as little as possible. Every change is marked
  `ha3d:`; [upstream/UPSTREAM.md](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/upstream/UPSTREAM.md) lists them and explains how to take in
  upstream updates.
- `src/ha/`: everything Home Assistant: the card element and its options editor, the bridge
  (`hass` ↔ store), state mapping, sensitive-device and action rules, plan validation and storage,
  floors, the light pool, the live layer (sensors, people, fans, TVs), entity markers, the registry
  import and the editor host.
- `tests/unit/`: mapping, sensitive rules, actions, validation, floors and floor buttons, rooms in
  several parts and areas, fans and placeholder lights, the extra furniture, the light pool, the
  registry import, the live fields and the mock `hass` (`node --test`).
- `tests/render/`: Playwright with headless Chromium and a mock `hass` (with a mock registry):
  renders, light taps, live updates, locks open more-info, bulk actions skip sensitive devices,
  floors and the stacked view, a 50-light plan within the light budget, Home Assistant actions, the
  card editor, the import, doors, people, the heat map, fans, TVs and the sun, the floor-button
  confirmation sheet and helper toggles, rooms in parts, placeholders, and that no request leaves
  the page.

Releases: bump `version` in `package.json`, commit, then push a tag `vX.Y.Z` that matches it. The
Release workflow runs every check, builds the bundle and publishes a GitHub release with
`shrumslab-ha3d.js` attached. HACS only offers published (non-draft) releases that carry that file,
so a commit on `main` without a tag never shows up as an update.

## Credits and licence

Based on [house-control](https://github.com/0xProbabillity/house-control) by 0xProbability, MIT
licence. Its `LICENSE` is kept as is; see [NOTICE](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/NOTICE). This project's own code is MIT too.
Bundles [three.js](https://threejs.org) (MIT) and [Lucide](https://lucide.dev) icons (ISC).

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://hacs.xyz/docs/faq/custom_repositories/
[release-badge]: https://img.shields.io/github/v/release/Jabberwocky7777/shrumslab-HA3D
[release-url]: https://github.com/Jabberwocky7777/shrumslab-HA3D/releases/latest
[downloads-badge]: https://img.shields.io/github/downloads/Jabberwocky7777/shrumslab-HA3D/total
[ha-badge]: https://img.shields.io/badge/Home%20Assistant-2024.11%2B-41BDF5.svg
[ha-url]: https://www.home-assistant.io/
[ci-badge]: https://github.com/Jabberwocky7777/shrumslab-HA3D/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/Jabberwocky7777/shrumslab-HA3D/actions/workflows/ci.yml
[license-badge]: https://img.shields.io/github/license/Jabberwocky7777/shrumslab-HA3D

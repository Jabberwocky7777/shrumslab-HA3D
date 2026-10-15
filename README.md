# House Control 3D for Home Assistant

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
[![Release](https://img.shields.io/github/v/release/Jabberwocky7777/shrumslab-HA3D)](https://github.com/Jabberwocky7777/shrumslab-HA3D/releases/latest)

A Lovelace card that shows your home as a 3D model: lights that glow when they're on, scene
buttons, room filters and light tiles you tap to toggle and drag to dim. It is the web UI of
[house-control](https://github.com/0xProbabillity/house-control) (iPhone layout), with its native
device bridge replaced by Home Assistant. It's made to be the main dashboard in the Home Assistant
phone app.

<p align="center">
  <img src="https://raw.githubusercontent.com/Jabberwocky7777/shrumslab-HA3D/main/docs/images/demo.png" width="320" alt="The demo house in the card">
  <img src="https://raw.githubusercontent.com/Jabberwocky7777/shrumslab-HA3D/main/docs/images/editor.png" width="320" alt="The plan editor">
</p>

- **3D model** from a simple floor plan (rooms, doors, windows, furniture), lit by your real lights.
- **Lights**: tap to toggle, drag sideways to dim, touch and hold for brightness, white and colour.
  State updates live from Home Assistant (wall switches, automations, other dashboards).
- **Other devices** (TV, thermostat, fan, lock, garage door, camera...) as glowing icons and tiles
  that open Home Assistant's own dialogs.
- **Scenes**: house-control's light scenes, or buttons that run a Home Assistant script or scene.
- **Visual editor** for admins, saved straight into the dashboard. Import and export as a file.
- **Private by design**: the plan never goes in `/config/www`, nothing is loaded from the internet,
  no tokens. See [Privacy](#privacy).

## Install

### HACS (recommended)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/Jabberwocky7777/shrumslab-HA3D`,
   type **Dashboard**.
2. Find **House Control 3D** in HACS and download it. HACS adds the dashboard resource
   (under `/hacsfiles/`) for you.
3. Reload the browser (or restart the app).

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
# optional
height: 100%        # CSS height of the card; the default fills the view under the header
safe_area: false    # true: keep clear of the phone's notch (for a kiosk view without header)
temperature_unit: F # F or C; the default is Home Assistant's own unit system
```

### Make it the phone app's default

In the Home Assistant app (or a browser), open your **Profile** and pick the new dashboard under
**Dashboard**: that's the default for this device. If you hide Home Assistant's header on that
device (with a kiosk add-on, for example), set `safe_area: true` so the card keeps clear of the
notch.

## The plan

The plan format is house-control's, with Home Assistant links and a new `entities` section. See
**[docs/plan-format.md](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/docs/plan-format.md)**. In short:

- `rooms` are rectangles in metres (`x` grows east, `z` grows south), with `oak`, `walnut`,
  `tile`, `stone` or `carpet` floors. `openings` are doors and windows, `furniture` is decoration:
  house-control's pieces (sofa, bed, kitchen, dining set...) plus this card's extras: `poolTable`,
  `sectional`, `glassCabinet`, `darkBookcase`, `mediaWall`, `wetBar`, `barCart`, `pokerTable`,
  `popcornMachine`, `treadmill`, `deskSetup`, `endTable`, `pedestalSink`, `tubOnly`, `tubShower`,
  `stairs`, `catTree`, `litterRobot`, `dehumidifier`, `airPurifier`.
- A room gets a tab in the room filter only when a light, AC or entity is in it. Set `tab: true`
  or `tab: false` on a room to force a tab on or off; tab-less rooms still show in 3D.
- Light fixtures: `ceiling`, `pendant`, `spots`, `floor`, `table`, `strip`, plus `fan`,
  `pendantBar`, `dome`, and `cans` and `sconce`, which take a `points` list for several
  fixtures on one switch.
- `lights` link to `light.*` or `switch.*` entities with `link: { service: homeassistant, id: ... }`.
  Leave `capabilities` out and they come from the entity's `supported_color_modes`.
- `entities` holds everything else (TV, thermostat, lock...); `tap` is `more-info`, `toggle` or
  `navigate`.
- `scenes` set lights, or `run` a `script.*` or `scene.*`.

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

## Sensitive devices

Locks, alarm panels, covers (garage doors, gates, blinds: all covers), valves, sirens and cameras are
**never one-tap**. Tapping one always opens Home Assistant's own more-info dialog, which handles
codes and confirmations. The card refuses a plan that tries to `toggle` one, and no scene,
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
- `src/ha/`: everything Home Assistant: the card element, the bridge (`hass` ↔ store), state
  mapping, sensitive-device rules, plan validation and storage, entity markers and the editor host.
- `tests/unit/`: mapping, sensitive rules and validation (`node --test`).
- `tests/render/`: Playwright with headless Chromium and a mock `hass`: renders, light taps,
  live updates, locks open more-info, bulk actions skip sensitive devices, the editor saves, and no
  request leaves the page.

Releases: bump `version` in `package.json`, commit, then push a tag `vX.Y.Z` that matches it. The
Release workflow runs every check, builds the bundle and publishes a GitHub release with
`shrumslab-ha3d.js` attached. HACS only offers published (non-draft) releases that carry that file,
so a commit on `main` without a tag never shows up as an update.

## Credits and licence

Based on [house-control](https://github.com/0xProbabillity/house-control) by 0xProbability, MIT
licence. Its `LICENSE` is kept as is; see [NOTICE](https://github.com/Jabberwocky7777/shrumslab-HA3D/blob/main/NOTICE). This project's own code is MIT too.
Bundles [three.js](https://threejs.org) (MIT) and [Lucide](https://lucide.dev) icons (ISC).

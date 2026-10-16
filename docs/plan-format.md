# The plan format

A home is one JSON (or YAML) document: the card's 3D model, its panel and the editor are all built
from it. The format is house-control's own, described in full in
[house-control's floor-plan.md](https://github.com/0xProbabillity/house-control/blob/main/docs/floor-plan.md).
This page sums it up and adds what is specific to the Home Assistant card. The demo house,
[`plans/demo.json`](../plans/demo.json), uses every feature.

In the card config the plan sits under `plan:`:

```yaml
type: custom:house-control-card
plan:
  name: Home
  rooms: [...]
  lights: [...]
```

## Coordinates

Everything is in metres, seen from above: `x` grows to the right (east), `z` grows downwards
(south). Heights (`y`, `sill`, `head`) are metres above the floor. Angles are degrees. Furniture
`rot`: `0` puts its back against the north wall, `90` the west wall, `-90` the east wall and `180`
the south wall.

## Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | `"Home"` | Shown in the header |
| `wallHeight` | `2.6` | Height of the outer walls |
| `interiorWallHeight` | `1.25` | How much of the inner walls is drawn |
| `outdoorTemp` | `27` | Only used to simulate the room temperature of an AC with nothing linked |
| `camera` | `{ "azimuth": 34, "elevation": 47 }` | Default view; the walls facing the camera are cut away |
| `floors` | one floor | The storeys of the house, see [`floors`](#floors-new-in-this-card) |

## `floors` (new in this card)

A house with more than one storey lists them under `floors`. Each room then says which floor it is
on with `storey` (the room's `floor` is still its floor *finish*: `oak`, `tile`...). Rooms on
different floors may overlap in x/z: a basement can lie right under the main floor.

```json
"floors": [
  { "id": "main", "name": "Main", "level": 0,
    "actions": [
      { "id": "on",    "name": "Lights on", "icon": "sun",  "run": "script.your_lights_on" },
      { "id": "off",   "name": "All off",   "icon": "moon", "builtin": "all_off" },
      { "id": "movie", "name": "Movie",     "icon": "film", "run": "scene.your_movie" }
    ] },
  { "id": "basement", "name": "Basement", "level": -1, "height": 2.4 }
],
"rooms": [
  { "id": "living", "name": "Living", "rect": [0, 0, 6, 4.5], "floor": "oak", "storey": "main" },
  { "id": "bar",    "name": "Bar",    "rect": [0, 0, 6.4, 4.4], "floor": "walnut", "storey": "basement" }
]
```

| Field | Default | Meaning |
| --- | --- | --- |
| `id`, `name` | | A unique id and the name on the floor switcher |
| `level` | its place in the list | `0` is the ground floor, `-1` a basement, `1` the floor above. Floors are drawn and listed by level |
| `height` | the plan's `wallHeight` | Wall height of this floor |
| `actions` | All on, All off | The floor's buttons, shown first in the scenes row while the floor is selected |

Without `floors` a plan has one floor and looks exactly as before; a room may then not have a
`storey`. With `floors`, every room needs one. Lights, ACs and entities are on their room's floor.

**Furniture and openings** have no room, so they take an optional `storey` too. Without one they go
on the floor whose rooms they stand in or lie on; where floors overlap, on the **first floor in the
`floors` list**. Give the ones on the other floor a `storey` (the editor does this for you).

**Floor buttons** (`actions`) have an `id`, a `name`, an `icon` (`sun`, `moon`, `power`, `bright`,
`dim`, `film`, `tv`, `sofa`, `bed`, `door`, `home`, `sparkles`, `music`, `coffee`, `fan`, `table`)
and exactly one of:

- `"run": "script.…"` or `"scene.…"`: starts it with `script.turn_on` / `scene.turn_on`. Nothing
  else may be run.
- `"builtin": "all_on"` or `"all_off"`: switches **this floor's** plan lights. Like every bulk
  action it only ever reaches `light` and `switch` entities, never a lock, cover or other sensitive
  device.

A floor without `actions` (or with `[]`) gets All on and All off for its own lights.

In the card, the floor switcher sits above the room tabs (it is hidden with a single floor). The
room tabs, tiles, the list's All on / All off and the header's light count follow the selected
floor; the header adds the whole house's count. The layers button next to the floors draws every
floor one above the other, the others dimmed; tapping a room on another floor there selects that
floor. The card option `stacked_view_default: true` starts in that view.

## `rooms`, `openings`, `furniture`

| Section | Fields |
| --- | --- |
| `rooms` | `id`, `name`, `rect: [x, z, width, depth]`, `floor` (the finish: `oak`, `walnut`, `tile`, `stone`, `carpet`). Rooms are rectangles: an L-shaped room is two rooms. Where rooms touch, an inner wall appears. Optional `tab` (see below), `storey` when the plan has `floors`, and `area`: the Home Assistant area id the room stands for (set by **Import from Home Assistant…**). |
| `openings` | `type` (`door`, `window`, `open`, `garage`), `from: [x, z]`, `to: [x, z]` on one wall line (same x or same z), windows also `sill`, `head`. Optional `storey`, and `contact`, `lock`, `cover` (see [below](#what-the-house-is-doing-new-in-this-card)) |
| `furniture` | `type`, `pos: [x, z]`, `rot`, plus `width`, `color`, `size`, `height`, `chairs`, `stools`, `upper` depending on the type: `sofa`, `armchair`, `coffeeTable`, `rug`, `tv`, `sideboard`, `dresser`, `desk`, `vanity`, `diningSet`, `island`, `kitchen`, `bed`, `wardrobe`, `bookshelf`, `plant`, `fridge`, `nightstand`, `bathtub`, `toilet`, and the extra models below |

### Starting from Home Assistant

In the plan editor, **Add → From Home Assistant** (or **From Home Assistant…** on a computer) reads
Home Assistant's floors, areas, devices and entities and shows what it would add, with a box for each:

- a floor for each Home Assistant floor, by its level (areas on no floor go on "Other areas");
- a room for each area, laid out in a grid on its floor, with `"area"` set: drag them into place;
- every `light.*` in an area as a light in that room (ticked);
- `switch.*` entities whose name or device name sounds like a lamp (unticked);
- `climate`, `media_player`, `fan`, `lock` and `cover` entities as devices (unticked).

**Add what's missing** keeps the plan and adds only what it does not have: entities it already uses
are skipped, and an area whose room is already there (by `area`, or by name) gets no second room.
**Start a new plan** builds one from scratch. Nothing is saved until you press Save in the editor.
Hidden entities and diagnostic or configuration entities are left out.

### Room tabs

The room filter above the tiles only gets a tab for a room that has at least one light, AC or
entity in it. A hallway or closet with only furniture still appears in the 3D model, just without a
tab. To decide yourself, give the room `"tab": true` (always a tab, even when empty) or
`"tab": false` (never a tab; its devices still show under **All**). Anything other than `true` or
`false` is refused.

```json
{ "id": "storage", "name": "Storage", "rect": [8.0, 8.2, 2.4, 2.0], "floor": "stone", "tab": true }
```

### Extra furniture

These come from this card (`upstream/three/extras.js`), not from house-control. Every option is
optional; the defaults are in brackets.

| `type` | Options |
| --- | --- |
| `poolTable` | `width` (2.5), `depth` (1.4), `felt`, `wood`, `balls` (`true`: a racked set) |
| `sectional` | U-shaped sofa with a chaise at each end, facing forward: `width` (2.6), `depth` (0.95), `chaise` (0.85), `chaiseWidth` (0.95), `color` |
| `glassCabinet` | Tall cabinet with glass doors and shelves of collectibles: `width` (0.9), `height` (2.0), `color`, `seed` (varies the shelves) |
| `darkBookcase` | `width` (0.8), `height` (1.95), `color`, `seed` |
| `mediaWall` | Wall-mounted TV over a media console: `width` (1.75), `screen` (1.45, the screen's width) |
| `wetBar` | Base and wall cabinets with a sink: `width` (1.85), `wood`, `top`, `fridge` (`true`: a mini fridge at the +x end) |
| `barCart` | Two tiers with bottles: `width` (0.95), `depth` (0.4) |
| `pokerTable` | Round table with bar stools around it: `diameter` (1.3), `stools` (5), `wood`, `felt` |
| `popcornMachine` | — |
| `treadmill` | Deck along z, console at the back: `length` (1.9), `width` (0.85) |
| `deskSetup` | Desk with two monitors and an office chair: `width` (2.0), `depth` (0.7), `chair` (colour) |
| `endTable` | `width` (0.5), `depth` (0.45), `height` (0.6), `color` |
| `pedestalSink` | With a mirror above: `width` (0.6) |
| `tubOnly`, `tubShower` | Bathtub, with or without a shower curtain: `length` (1.55) |
| `stairs` | A straight flight rising towards the back: `width` (1.0), `length` (3.5), `rise` (2.6), `steps` (14), `color` |
| `catTree` | `height` (1.6), `cat` (colour) |
| `litterRobot` | A self-cleaning litter box |
| `dehumidifier`, `airPurifier` | `width`, `depth`, `height` |

## `lights`

| Field | Meaning |
| --- | --- |
| `id`, `name`, `room` | Unique id, the tile's label, the `id` of its room |
| `type` | `ceiling`, `pendant`, `spots`, `floor`, `table`, `strip`, or one of this card's extra types: `fan`, `pendantBar`, `sconce`, `cans`, `dome` (below) |
| `pos`, `y`, `rot`, `length` | Position, height, rotation, length of a strip or pendant bar |
| `points` | `cans` and `sconce` only: several fixtures on one switch, see below |
| `capabilities` | Any of `brightness`, `temp`, `color`. **Leave it out** for a linked light and the card works it out from the entity's `supported_color_modes`. `[]` means on/off only |
| `tap_action`, `hold_action`, `double_tap_action` | Optional: Home Assistant actions instead of the usual tap to toggle and hold for the sheet (see [Actions](#actions)) |
| `link` | `{ "service": "homeassistant", "id": "light.your_light" }`. Only `light.*` and `switch.*` entities; a `switch.*` is always on/off only |

### Extra light types

| `type` | What it is | Options |
| --- | --- | --- |
| `fan` | Ceiling fan with a bowl light; the light entity drives the bowl | `y`, `blades` (colour), `fan` (a `fan.*`: the blades spin with it) |
| `pendantBar` | A bar with two dome shades, e.g. over a pool table or an island | `length` (1.3, along x), `shade` (colour), `y` (1.55) |
| `dome` | Flush dome ceiling light | `y` |
| `cans` | Recessed ceiling cans on one switch | `points: [[x, z], ...]` |
| `sconce` | Wall sconces on one switch | `points: [[x, z, rot], ...]`; `rot` turns each sconce away from its wall (`90` on a west wall, `-90` east, `0` north, `180` south) |

`points` are plan coordinates, like `pos`. `pos` is where the light's tile and tap target sit; put it
in the middle of its points. In the editor the points show as dots joined to `pos`, and dragging any
of them moves the whole light. Leave `rot` at `0` for these two types: it would turn every point
around `pos`.

```json
{ "id": "rec.cans", "name": "Cans", "room": "rec", "type": "cans", "pos": [6.2, 11.6],
  "points": [[5.3, 10.9], [7.1, 10.9], [5.3, 12.3], [7.1, 12.3]],
  "link": { "service": "homeassistant", "id": "light.your_cans" } }
```

A light without a `link` is simulated: tapping it only changes the picture.

| In the card | Sent to Home Assistant |
| --- | --- |
| off | `light.turn_off` / `switch.turn_off` |
| on | `light.turn_on` / `switch.turn_on` |
| brightness 0–1 | `light.turn_on` with `brightness` = round(x × 255) |
| white temperature (K) | `light.turn_on` with `color_temp_kelvin` |
| colour `#rrggbb` | `light.turn_on` with `rgb_color` |

An entity that is `unavailable` or `unknown` shows its tile as unavailable and does nothing when
tapped; one missing from Home Assistant shows "Not found".

## `acs`

House-control's air conditioners: `id`, `name`, `room`, `wall` (`north`, `south`, `east`, `west`),
`pos` on that wall, `y`, `min`, `max`. Link one to a `climate.*` entity with
`"link": { "service": "homeassistant", "id": "climate.your_ac" }` and, optionally, a room
thermometer with `"sensor": { "service": "homeassistant", "id": "sensor.your_temperature" }`. The
sheet then offers the modes and fan speeds the entity reports. Without `min`/`max` the range comes
from the entity. Temperatures (`min`, `max`, scene `target`, `outdoorTemp`) are in Home
Assistant's unit (or the card's `temperature_unit`); in °F an AC with no range and no entity
defaults to 60–86.

## `entities` (new in this card)

Anything else in Home Assistant: a TV, a thermostat, a fan, a lock, a garage door, a camera. Each is
a small glowing icon in the 3D view and a tile under its room.

```json
"entities": [
  { "id": "media.tv", "name": "TV", "room": "media", "entity": "media_player.your_tv",
    "pos": [1.2, 3.4], "y": 1.3, "icon": "tv",
    "hold_action": { "action": "perform-action", "perform_action": "media_player.media_play_pause",
                     "target": { "entity_id": "media_player.your_tv" }, "confirmation": { "text": "Play or pause?" } },
    "double_tap_action": { "action": "toggle" } },
  { "id": "bar.thermostat", "name": "Thermostat", "room": "bar", "entity": "climate.your_thermostat",
    "pos": [6.9, 7.5], "y": 1.5, "icon": "thermometer", "tap": "more-info", "show": "temperature" }
]
```

| Field | Default | Meaning |
| --- | --- | --- |
| `id`, `name`, `room` | | As for lights |
| `entity` | | The Home Assistant entity id |
| `pos`, `y` | `y`: `1.2` | Where the icon floats |
| `icon` | from the domain | `tv`, `thermometer`, `fan`, `lock`, `garage`, `blinds`, `door`, `camera`, `speaker`, `music`, `plug`, `switch`, `sensor`, `alarm`, `siren`, `water`, `heater`, `robot`, `car`, `coffee`, `washer`, `monitor`, `gamepad`, `pool`, `bell`, `box`... |
| `tap_action` | `{ "action": "more-info" }` | What a tap does: a Home Assistant action, see [Actions](#actions) |
| `hold_action` | `{ "action": "more-info" }` | Touch and hold the tile |
| `double_tap_action` | none | A double tap. Without one a single tap acts at once; with one it waits a moment for the second tap |
| `tap`, `hold`, `path` | | The older short form, still accepted: `"tap": "more-info"`, `"toggle"` or `"navigate"` with `"path": "/lovelace/climate"`. A `tap_action` wins over `tap` |
| `show` | | `temperature`: show `current_temperature` on the icon (climate entities) |

### Actions

`tap_action`, `hold_action` and `double_tap_action` are Home Assistant's own action objects, run by
Home Assistant itself (so confirmations look and work as on its own cards). Supported:

| `action` | Fields |
| --- | --- |
| `more-info` | Optional `entity` (another entity's dialog) |
| `toggle` | Only `light`, `switch`, `fan`, `media_player` entities |
| `navigate` | `navigation_path`, starting with `/` |
| `perform-action` | `perform_action` (`"light.turn_on"`), optional `target`, `data` (`call-service` / `service` are accepted too) |
| `none` | Nothing happens |

Any of them can have a `confirmation`: `true`, or `{ "text": "Sure?" }`. `url`, `assist` and
`fire-dom-event` are not available. A `perform-action` may not use a sensitive domain's service
(`lock.unlock`, `cover.open_cover`...), may not target a sensitive entity in `target.entity_id` or
`data.entity_id`, and a cross-domain service (`homeassistant.turn_on`...) may not target an area,
device, floor or label, which could hold a lock or cover.

### Sensitive devices

`lock`, `alarm_control_panel`, `cover` (every cover), `valve`, `siren` and `camera` entities are
never one-tap. Tapping, holding or double-tapping one **always** opens Home Assistant's more-info
dialog, which asks for codes and confirmations itself, whatever its actions say. A plan that gives one
of them `toggle` or `perform-action` is refused.
They can't be plan lights or ACs either, so no scene, "All on", "All off" or the power button ever
reaches them: bulk actions only change `light`, `switch`, `fan`, `climate` and `media_player`.

## What the house is doing (new in this card)

All of these are optional. They tie parts of the model to sensors, so the 3D view shows what is
going on. A plan without them looks exactly as before.

### Doors, windows, locks and garage doors

```json
"openings": [
  { "type": "door", "from": [11.6, 8.2], "to": [12.6, 8.2],
    "contact": "binary_sensor.your_front_door", "lock": "lock.your_front_door" },
  { "type": "window", "from": [0, 7.0], "to": [0, 7.9], "contact": "binary_sensor.your_window" },
  { "type": "garage", "from": [8.2, 10.2], "to": [10.2, 10.2], "head": 2.0, "cover": "cover.your_garage_door" }
]
```

| Field | On | What you see |
| --- | --- | --- |
| `contact` | doors, windows | A `binary_sensor.*`. While it is `on` (open) a door's leaf swings open and turns the alert colour; a window turns the alert colour |
| `lock` | doors, garage doors | A `lock.*`, drawn as a lock on the door: green when locked, the alert colour when unlocked, jammed or open |
| `type: "garage"` with `cover` | | A garage door that rolls up and down with the `cover.*` (its `current_position`, else open / closed) |

Tapping a lock or a garage door always opens Home Assistant's more-info dialog: they are sensitive
devices.

### Rooms: occupancy and temperature

| Field | Meaning |
| --- | --- |
| `occupancy` | A `binary_sensor.*` or a list of them. While any is `on` the room's floor glows softly; the glow fades out over a few seconds after they are all off |
| `temperature` | A `sensor.*` with the room's temperature. Its reading shows on the room's tab, and the **Heat map** button at the end of the room tabs tints every room from cool blue to warm red |

### People

```json
"people": [
  { "name": "Alex", "entity": "sensor.your_alex_area", "color": "#7ac8ff" }
]
```

The entity's state is a Home Assistant area id or name (from a Bermuda, ESPresense or template
sensor, for example). The person shows as a coloured dot with their initial in the room whose `area`
(or name) matches, on that room's floor. When the state matches no room they are hidden; when it is
`not_home` the header says they are away. `color` defaults to light blue.

### Fans, TVs and power

| Where | Field | Meaning |
| --- | --- | --- |
| a light of type `fan` | `fan` | A `fan.*`: the blades spin with its `percentage` and stop when it is off |
| an entity | `fan` | A plan entity whose entity is a `fan.*` spins its icon; `fan` can name another fan |
| `tv` / `mediaWall` furniture | `entity` | A `media_player.*`: the screen glows while it plays or is paused, showing its picture when Home Assistant serves one itself (its own signed address, never another site). Tapping the screen opens more-info |
| a light | `power` | A `sensor.*` in W or kW, shown on the light's tile while it is on: "100% · 18 W" |

The card options `power` (the house's total, shown in the header) and `sun: true` (the 3D view
blends from night to a daylight look with `sun.sun`'s elevation) go with these.

## `scenes`

| Field | Meaning |
| --- | --- |
| `id`, `name`, `icon` | The button (`sun`, `sofa`, `film`, `moon`, `door`, `table`, `bed`, `tv`, `sparkles`) |
| `lights` | Light id → `on`, `brightness`, `temp`, `color`. The key `"*"` applies to every light |
| `acs` | AC id → `on`, `target`, `mode`, `fan` |
| `run` | **New:** a `script.*` or `scene.*` entity to start instead. Such a scene changes nothing else |
| `active_when` | **New**, with `run` only: `{ "entity": "input_boolean.your_guest_mode", "state": "on" }`, or a list of these that must all match. The button shows as active while they do |

A built-in scene lights up as active until something changes. One with `run` lights up only while its
`active_when` matches, because only Home Assistant knows what the script did; without `active_when` it
never does. Floor buttons with `run` take `active_when` the same way.

## Checks

The card refuses a plan that doesn't add up and says why: unknown rooms, duplicate ids, openings that
aren't axis-aligned, malformed entity ids, a sensitive entity with `toggle`, a `run` that isn't a
script or scene, a room on an unknown floor, a floor button with both or neither of `run` and
`builtin`, an action that would reach a sensitive device, a sensor of the wrong domain (a `contact`
that is not a `binary_sensor.*`, a garage door without its `cover`...). A linked entity that doesn't exist (yet) in Home Assistant is only a warning: its
tile says "Not found".

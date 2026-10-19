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
- `"toggle": "input_boolean.…"`: calls `input_boolean.toggle` on that helper. Only the
  `input_boolean` domain is allowed; anything else is refused. The button shows as active while
  the helper is `on`, as if it had `"active_when": { "entity": "input_boolean.…", "state": "on" }`;
  give it an `active_when` of its own to change that. Its icon defaults to a switch.

Any button may also have `confirmation`: `true`, or `{ "text": "Start game night?" }`. Tapping it
then opens a small dialog in the middle of the screen, in the card's look: the button's icon and
name, the text (default "Run <name>?"), and **Cancel** and **Confirm** side by side. The button
runs only after Confirm; Cancel, a tap outside the dialog or Esc closes it and nothing happens. It
is centred in the part of the screen you can see, whatever the card's height, `full_bleed` or how
far the dashboard is scrolled, and stays clear of the notch and the home indicator. It follows the
theme and reduced motion, never uses a browser or Home Assistant dialog, and the 3D view keeps
resting while it is open.

```json
"actions": [
  { "id": "off",    "name": "All off",    "icon": "moon", "builtin": "all_off", "confirmation": true },
  { "id": "game",   "name": "Game night", "icon": "film", "run": "script.your_game_night",
    "confirmation": { "text": "Dim the bar and start game night?" } },
  { "id": "guests", "name": "Guests",     "icon": "bed",  "toggle": "input_boolean.your_guest_mode" }
]
```

A floor without `actions` (or with `[]`) gets All on and All off for its own lights.

In the card, the floor switcher sits above the room tabs (it is hidden with a single floor). The
room tabs, tiles, the list's All on / All off and the header's light count follow the selected
floor; the header adds the whole house's count. The layers button next to the floors draws every
floor one above the other, the others dimmed; tapping a room on another floor there selects that
floor. The card option `stacked_view_default: true` starts in that view.

## `rooms`, `openings`, `furniture`

| Section | Fields |
| --- | --- |
| `rooms` | `id`, `name`, `rect: [x, z, width, depth]`, `floor` (the finish: `oak`, `walnut`, `tile`, `stone`, `carpet`). Rooms are rectangles: an L-shaped room is two rectangles, the second with `part_of` (see below). Where rooms touch, an inner wall appears. Optional `tab` (see below), `storey` when the plan has `floors`, `part_of`, and `area`: the Home Assistant area, or a list of areas, the room stands for (see below; set by **Import from Home Assistant…**). |
| `openings` | `type` (`door`, `window`, `open`, `garage`), `from: [x, z]`, `to: [x, z]` on one wall line (same x or same z), windows also `sill`, `head`. Optional `storey`, and `contact`, `lock`, `cover` (see [below](#what-the-house-is-doing-new-in-this-card)) |
| `furniture` | `type`, `pos: [x, z]`, `rot`, plus `width`, `color`, `size`, `height`, `chairs`, `stools`, `upper` depending on the type: `sofa`, `armchair`, `coffeeTable`, `rug`, `tv`, `sideboard`, `dresser`, `desk`, `vanity`, `diningSet`, `island`, `kitchen`, `bed`, `wardrobe`, `bookshelf`, `plant`, `fridge`, `nightstand`, `bathtub`, `toilet`, and the extra models below. This card adds options to three of house-control's pieces, see [kitchen pieces](#kitchen-pieces-and-round-tables) |

### Rooms made of several rectangles

An L-shaped (or any other) room is a main rectangle plus parts. A part names its main room with
`part_of`:

```json
{ "id": "rec",      "name": "Rec room", "rect": [0, 8.2, 8.0, 5.0], "floor": "carpet", "storey": "main" },
{ "id": "rec_nook", "name": "Rec nook", "rect": [0, 13.2, 3.0, 1.6], "floor": "carpet", "storey": "main", "part_of": "rec" }
```

- The part gets no tab of its own. Its lights, ACs and entities are listed under the main room's tab.
- No inner wall is drawn between a part and its main room, so it needs no `open` opening.
- It glows with the main room's `occupancy` and takes its `temperature` tint in the heat map.
- People whose area matches the main room (or the part's name) stand in the room's largest rectangle.

`part_of` must name another room on the same floor (`storey`) that is not itself a part. An unknown
id, a part of a part, a room on another floor and a room naming itself are refused.

### Areas

`area` ties a room to Home Assistant areas: one, as a string, or several, as a list. Each entry is an
area id (`"living_room"`) or an area's name (`"Living room"`).

```json
{ "id": "kitchen", "name": "Kitchen", "rect": [6.4, 0, 4.0, 3.6], "area": ["kitchen", "Pantry"] }
```

A person (see [People](#people)) is in the room when their state equals any of the entries, in any
case, or the room's name or id. When the card has Home Assistant's area registry, an area id also
matches that area's name and the other way round, so either form works. **Import from Home
Assistant** treats an area as already in the plan when any room lists it (by id or name).

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

### Kitchen pieces and round tables

Three of house-control's own pieces take more options in this card (all optional, defaults in
brackets):

| `type` | Options |
| --- | --- |
| `kitchen` | `width` (3), `upper` (`true`: wall cabinets), `sink` (`true`), `cooktop` (`true`: the hob and, with `upper`, its hood), `front` (door colour), `top` (counter colour). Leave out `sink` or `cooktop` on some runs so an L-shaped kitchen made of several runs has one of each; with only one of them it sits in the middle of the run |
| `island` | `width` (2.0), `stools` (3), `base` (cabinet colour, #39424f), `top` (counter colour), `cooktop` (`false`; `true`: a five-burner gas hob with grates in the middle of the top), `drawers` (`true`: drawer and door lines on the working side, away from the stools, and on both ends) |
| `coffeeTable` | `width` (1.1), `round` (`false`; `true`: a round top, `diameter` 0.8 × `width`, on a pedestal, or on four legs with `"legs": 4`) |

```json
{ "type": "wallOven", "pos": [6.8, 0.33] },
{ "type": "kitchen",  "pos": [8.4, 0.41], "width": 2.4, "cooktop": false },
{ "type": "island",   "pos": [8.5, 3.75], "width": 2.2, "cooktop": true },
{ "type": "fireplace", "pos": [0.28, 12.4], "rot": 90, "fire": true, "tv": true, "entity": "media_player.your_tv" }
```

Pieces stand against a wall with their back at `-z` (before `rot`). Exterior walls are 0.2 m thick
and inner walls 0.1 m, so put something that hangs on the wall, such as a fireplace's TV, half a
wall's thickness plus half its own depth away from the wall line.

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
| `endTable` | `width` (0.5), `depth` (0.45), `height` (0.6), `color`, `round` (`false`; `true`: a round top, `diameter` from `width`, on a pedestal, or on four legs with `"legs": 4`) |
| `wallOven` | Full-height cabinet tower with built-in appliances, facing forward: `width` (0.76), `depth` (0.65), `height` (2.25), `cabinet` (#ece9e2), `stack` (`"microwave+oven"`, `"double-oven"` or `"oven"`). Stainless fronts with glass windows, handles and a dark control strip; cabinet doors above |
| `fireplace` | Mantel and surround against the wall: `width` (1.6), `height` (1.3), `depth` (0.35), `color` (#f3f1ec), `fire` (`false`; `true`: the firebox glows with a soft flicker), `tv` (`false`; `true`: a wall TV above the mantel, `screen` (1.3) wide), `entity` (with `tv`: a `media_player.*`, as on a `mediaWall`) |
| `shelving` | Freestanding black metal shelving: `width` (1.2), `depth` (0.45), `height` (1.8), `shelves` (4), `color` (#222) |
| `pedestalSink` | With a mirror above: `width` (0.6) |
| `tubOnly`, `tubShower` | Bathtub, with or without a shower curtain: `length` (1.55) |
| `stairs` | A straight flight rising towards the back: `width` (1.0), `length` (3.5), `rise` (2.6), `steps` (14), `color` |
| `catTree` | `height` (1.6), `cat` (colour) |
| `litterRobot` | A self-cleaning litter box |
| `dehumidifier`, `airPurifier` | `width`, `depth`, `height` |
| `washerDryer` | Front-loading washer and dryer side by side: `width` (1.4), `depth` (0.7), `height` (0.95), `stacked` (`false`; `true`: one tall stacked unit, `width` 0.7), `color` (white), `lid` (`"front"` or `"top"`) |
| `showerStall` | Glass shower with tiled walls at the back and left: `width` (1.0), `depth` (1.0), `height` (2.0), `glass` (`true`; `false`: a curtain instead), `tile` (colour), `door` (`"front"` or `"side"`) |
| `daybed` | Twin daybed with a back and arms, facing forward: `width` (2.0), `depth` (1.0), `frame` (colour), `bedding` (colour), `trundle` (`false`; `true`: a second bed below) |
| `walkInCloset` | A top shelf and a rod of hanging clothes along the back wall: `width` (2.0), `depth` (0.6), `sides` (`false`; `true`: rods on both side walls too, within the `depth`: give it a deeper `depth`), `seed` |

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
| `placeholder` | `true`: a fixture that is not wired up yet. Only without a `link`. It is drawn unlit; its tile says "Not connected", is greyed out and does nothing when tapped. It is left out of the light counts, All on / All off and scenes |

### Extra light types

| `type` | What it is | Options |
| --- | --- | --- |
| `fan` | Ceiling fan with a bowl light; the light entity drives the bowl | `y`, `blades` (colour), `bowl` (`true`; `false`: a fan without a light kit), `spin` (what turns the blades, see [Fans](#fans); `fan` is its older name) |
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

#### Fans

- `"spin": "fan.your_fan"` (or the older `"fan": "fan.your_fan"`): the blades turn with the fan
  entity's `percentage` and stop while it is off.
- `"spin": "light"`: the blades turn at a medium speed while the light's own entity (its `link`, a
  `light.*` or `switch.*`) is on. Use it for a fan on a switch, with no `fan.*` entity.
- `"bowl": false`: a fan without a light kit. No bowl, no glow and no light on the floor; the tile
  shows a fan instead of a lamp or plug. Tapping it still switches its `link`.

`bowl` must be `true` or `false`, and `spin` either `"light"` or a `fan.*` entity; both are only for
type `fan`.

```json
{ "id": "office.fan", "name": "Office fan", "room": "office", "type": "fan", "pos": [11.1, 2.7],
  "bowl": false, "spin": "light", "link": { "service": "homeassistant", "id": "switch.your_office_fan" } }
```

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
| `fan` | the entity, for a `fan.*` | A `fan.*` entity's icon spins while the fan runs. `fan` names another `fan.*` to spin with, or `false` keeps the icon still. The blades of `fan` lights are not affected |

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
| `type: "garage"` with `cover` | | A sectional garage door that opens and closes with the `cover.*` (its `current_position`, else open / closed): its sections ride up the opening and back along two ceiling tracks, one after another, and it turns the alert colour while open |

Tapping a lock or a garage door always opens Home Assistant's more-info dialog: they are sensitive
devices.

A garage door's look is set on its opening (all optional, defaults in brackets):

| Field | Meaning |
| --- | --- |
| `sections` | (4) horizontal sections, with a recessed groove between them |
| `windows` | (`true`) a row of small windows in the top section |
| `windowCount` | (about one per 0.6 m) how many windows |
| `panels` | (about one per 0.9 m) raised rectangles across each section |
| `color` | (`#e9e4d8`, warm white) the door and its trim |
| `opener` | (`true`) the opener on the ceiling, with its rail |

The door gets a trim frame on the garage side, and two dark tracks run about 2.5 m into the garage
from the top corners (less in a shallow one). The garage is the room the opening belongs to; on an
opening between two rooms, the deeper one. Like the fans, the door only moves on the floor you look
at; on another floor it is simply where it should be.

```json
{ "type": "garage", "from": [8.6, 13.2], "to": [10.6, 13.2], "head": 2.0, "cover": "cover.your_garage_door",
  "sections": 4, "windowCount": 4, "panels": 2, "color": "#e9e4d8" }
```

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
sensor, for example). The person shows as a coloured dot with their initial in the room one of
whose `area` entries (or its name or id) matches, on that room's floor; see [Areas](#areas). A room
in several parts shows them in its largest rectangle. When the state matches no room they are hidden; when it is
`not_home` the header says they are away. `color` defaults to light blue.

### Fans, TVs, fires and power

| Where | Field | Meaning |
| --- | --- | --- |
| a light of type `fan` | `spin` (or `fan`) | A `fan.*`: the blades spin with its `percentage` and stop when it is off. `"light"`: they spin while the light is on (see [Fans](#fans)) |
| an entity | `fan` | A plan entity whose entity is a `fan.*` spins its icon; `fan` can name another fan, or be `false` to keep the icon still. The blades of a `fan` light are not affected |
| `tv` / `mediaWall` furniture, a `fireplace` with `"tv": true` | `entity` | A `media_player.*`: the screen glows while it plays or is paused, showing its picture when Home Assistant serves one itself (its own signed address, never another site). Tapping the screen opens more-info |
| a `fireplace` | `fire: true` | The firebox glows and flickers softly. Like spinning fans it only moves on the floor you look at, at the card's `animation_fps`, and rests after `idle_pause` |
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
| `active_when` | **New**, with `run` only (floor buttons: `run` or `toggle`): `{ "entity": "input_boolean.your_guest_mode", "state": "on" }`, or a list of these that must all match. The button shows as active while they do |

A built-in scene lights up as active until something changes. One with `run` lights up only while its
`active_when` matches, because only Home Assistant knows what the script did; without `active_when` it
never does. Floor buttons with `run` take `active_when` the same way.

## Checks

The card refuses a plan that doesn't add up and says why: unknown rooms, duplicate ids, openings that
aren't axis-aligned, malformed entity ids, a sensitive entity with `toggle`, a `run` that isn't a
script or scene, a room on an unknown floor, a floor button without exactly one of `run`, `builtin`
and `toggle`, a `toggle` that is not an `input_boolean.*`, a `confirmation` that is not `true` or
`{ "text": ... }`, a `part_of` that names an unknown room, a part or a room on another floor, a
`placeholder` with a `link`, a `bowl` or `spin` on a light that is not a fan, an action that would reach a sensitive device, a sensor of the wrong domain (a `contact`
that is not a `binary_sensor.*`, a garage door without its `cover`...). A linked entity that doesn't exist (yet) in Home Assistant is only a warning: its
tile says "Not found".

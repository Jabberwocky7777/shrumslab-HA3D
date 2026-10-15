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

## `rooms`, `openings`, `furniture`

| Section | Fields |
| --- | --- |
| `rooms` | `id`, `name`, `rect: [x, z, width, depth]`, `floor` (`oak`, `walnut`, `tile`, `stone`). Rooms are rectangles: an L-shaped room is two rooms. Where rooms touch, an inner wall appears. |
| `openings` | `type` (`door`, `window`, `open`), `from: [x, z]`, `to: [x, z]` on one wall line (same x or same z), windows also `sill`, `head` |
| `furniture` | `type`, `pos: [x, z]`, `rot`, plus `width`, `color`, `size`, `height`, `chairs`, `stools`, `upper` depending on the type: `sofa`, `armchair`, `coffeeTable`, `rug`, `tv`, `sideboard`, `dresser`, `desk`, `vanity`, `diningSet`, `island`, `kitchen`, `bed`, `wardrobe`, `bookshelf`, `plant`, `fridge`, `nightstand`, `bathtub`, `toilet` |

## `lights`

| Field | Meaning |
| --- | --- |
| `id`, `name`, `room` | Unique id, the tile's label, the `id` of its room |
| `type` | `ceiling`, `pendant`, `spots`, `floor`, `table` or `strip` |
| `pos`, `y`, `rot`, `length` | Position, height, rotation, length of a strip |
| `capabilities` | Any of `brightness`, `temp`, `color`. **Leave it out** for a linked light and the card works it out from the entity's `supported_color_modes`. `[]` means on/off only |
| `link` | `{ "service": "homeassistant", "id": "light.your_light" }`. Only `light.*` and `switch.*` entities; a `switch.*` is always on/off only |

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
from the entity.

## `entities` (new in this card)

Anything else in Home Assistant: a TV, a thermostat, a fan, a lock, a garage door, a camera. Each is
a small glowing icon in the 3D view and a tile under its room.

```json
"entities": [
  { "id": "media.tv", "name": "TV", "room": "media", "entity": "media_player.your_tv",
    "pos": [1.2, 3.4], "y": 1.3, "icon": "tv", "tap": "more-info" },
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
| `tap` | `more-info` | `more-info` (Home Assistant's own dialog), `toggle` (only `light`, `switch`, `fan`, `media_player`) or `navigate` |
| `hold` | `more-info` | Touch and hold the tile: same choices |
| `path` | | For `navigate`: a dashboard path such as `/lovelace/climate` |
| `show` | | `temperature`: show `current_temperature` on the icon (climate entities) |

### Sensitive devices

`lock`, `alarm_control_panel`, `cover` (every cover), `valve`, `siren` and `camera` entities are
never one-tap. Tapping one **always** opens Home Assistant's more-info dialog, which asks for codes
and confirmations itself. A plan that gives one of them `tap: toggle` (or `hold: toggle`) is refused.
They can't be plan lights or ACs either, so no scene, "All on", "All off" or the power button ever
reaches them: bulk actions only change `light`, `switch`, `fan`, `climate` and `media_player`.

## `scenes`

| Field | Meaning |
| --- | --- |
| `id`, `name`, `icon` | The button (`sun`, `sofa`, `film`, `moon`, `door`, `table`, `bed`, `tv`, `sparkles`) |
| `lights` | Light id → `on`, `brightness`, `temp`, `color`. The key `"*"` applies to every light |
| `acs` | AC id → `on`, `target`, `mode`, `fan` |
| `run` | **New:** a `script.*` or `scene.*` entity to start instead. Such a scene changes nothing else and is never shown as active |

A built-in scene lights up as active until something changes; one with `run` doesn't, because only
Home Assistant knows what the script did.

## Checks

The card refuses a plan that doesn't add up and says why: unknown rooms, duplicate ids, openings that
aren't axis-aligned, malformed entity ids, a sensitive entity with `toggle`, a `run` that isn't a
script or scene. A linked entity that doesn't exist (yet) in Home Assistant is only a warning: its
tile says "Not found".

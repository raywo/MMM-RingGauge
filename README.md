# MMM-RingGauge

A [MagicMirror²](https://magicmirror.builders/) module that shows one sensor
reading as a three-quarter ring: colored bands for the scale, a marker for
the value and a status word for the assessment, e.g. CO₂ "Gut" or
"Jetzt lüften". One instance shows a group of such rings in one row, e.g.
CO₂, humidity and temperature of a room; see
[Several readings side by side](#several-readings-side-by-side).

The gauge stays readable on busy background photos thanks to a disc of
tinted glass, frosted if you like, and takes the mirror's font, so it fits themes such as
[WallberryTheme](https://github.com/raywo/WallberryTheme).

## Data sources

The gauge is independent of any data source. It fetches nothing itself
and knows no source by name: it shows readings from any module that sends
them as MagicMirror² notifications, e.g.
[MMM-HomeAssistantDataProvider](https://github.com/raywo/MMM-HomeAssistantDataProvider).
The config of each instance names the notification to listen to and maps
its payload onto the gauge's fields: value, unit, quantity, report time
and availability.

MagicMirror² sends every notification to every module. Each instance
picks its reading by the notification name and, with `match`, by values
in the payload.

## Requirements

MagicMirror² 2.36.0 or newer. Older versions drop functions from the
config, which `transform` needs; there MagicMirror² skips the module and
logs in the browser console: `Check MagicMirror² version for module
'MMM-RingGauge' - Minimum version: 2.36.0`, followed by `Version is
incorrect. Skip module: 'MMM-RingGauge'`.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/raywo/MMM-RingGauge.git
```

The module has no dependencies.

## Configuration

### With MMM-HomeAssistantDataProvider

The provider sends one `HOME_ASSISTANT_READING` per reading, named by
the reading name in its own config, and `HOME_ASSISTANT_CONNECTION` when
the connection changes:

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  config: {
    notification: "HOME_ASSISTANT_READING",
    match: { name: "co2" },
    fields: {
      value: "value",
      unit: "unit",
      quantity: "quantity",
      available: "available"
    },
    quantity: "carbon_dioxide",
    unit: "ppm",
    connection: {
      notification: "HOME_ASSISTANT_CONNECTION",
      connected: "connected",
      graceAfter: 30000
    }
  }
}
```

The provider sends the quantity, here `carbon_dioxide`, so the gauge
takes scale, bands, icon, label and status texts from its
[preset](#presets). `quantity` and `unit` are fallbacks: they draw the
preset from the start, before the first reading arrives, and the
payload's quantity and unit still win. Without them, the gauge shows
only "—" until then, and several gauges side by side look alike.

`graceAfter: 30000` matches the provider's own delay: it marks its
readings `available: false` only after 30 s without connection, so the
gauge does not dim on a short drop while Home Assistant restarts. Without
`connection`, the gauge dims when those readings arrive.

The provider sends no report time, since Home Assistant reports no
unchanged values; leave `staleAfter` off.

### With another source, by paths

A source that sends `AIR_SENSOR_UPDATE` with this payload:

```json
{
  "sensor": { "id": "bedroom" },
  "data": { "humidity": { "percent": "48.5" } },
  "timestamp": "2026-01-15T07:30:00Z"
}
```

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  config: {
    notification: "AIR_SENSOR_UPDATE",
    match: { "sensor.id": "bedroom" },
    fields: {
      value: "data.humidity.percent",
      reportedAt: "timestamp"
    },
    unit: "%",
    quantity: "humidity",
    staleAfter: 15 * 60 * 1000
  }
}
```

The payload holds no quantity, so `quantity` names it and the gauge takes
the humidity preset. This source signals no availability, so `staleAfter`
dims the value once no update has come for 15 minutes.

### Presets

For the quantities `carbon_dioxide`, `humidity` and `temperature`, the
gauge brings scale, bands, icon, label and status texts, in English or
German after the mirror's `language`:

| Quantity | Range | Bands, up to | Label |
| --- | --- | --- | --- |
| `carbon_dioxide` | 400–2500 ppm | 1000 good "Good", 2000 warn "Ventilate", 2500 bad "Ventilate now" | CO₂ |
| `humidity` | 20–80 % | 30 warn "Too dry", 60 good "Optimal", 70 warn "Too humid", 80 bad "Far too humid" | Humidity |
| `temperature` | 10–30 °C | 16 bad "Too cold", 19 cold "Cool", 24 good "Comfortable", 27 warn "Warm", 30 bad "Too warm" | Temperature |

The icon has the name of the quantity: `co2`, `humidity`,
`temperature`. The quantity comes from the payload by `fields.quantity`
or from `transform`, else from the option `quantity`. A typical instance
then names only its reading:

```js
config: {
  notification: "AIR_SENSOR_UPDATE",
  fields: { value: "co2" },
  unit: "ppm",
  quantity: "carbon_dioxide"
}
```

```js
config: {
  notification: "AIR_SENSOR_UPDATE",
  fields: { value: "humidity" },
  unit: "%",
  quantity: "humidity"
}
```

```js
config: {
  notification: "AIR_SENSOR_UPDATE",
  fields: { value: "temperature" },
  unit: "°C",
  quantity: "temperature"
}
```

Every option set in the config overrides its part of the preset, e.g.
`label: "Bedroom"` or `max: 2000`; `label: ""` and `icon: ""` hide them.
`bands` from the config replace the preset's bands as a whole and carry
their own `text`; a band without `text` shows no status word.

Without a preset for the quantity, or without a quantity, the config has
to set `min`, `max` and `bands`.

### Band colors

A band takes its color from `level` – `good` (green), `warn` (yellow),
`bad` (red) or `cold` (blue) – or from its own `color`. The segment and
the status word show that color. `color` takes any CSS color, also
`var(--…)`, so that `custom.css` can set it, and wins over `level`:

```js
bands: [
  { to: 16, level: "bad", text: "Zu kalt" },
  { to: 20, color: "#60a5fa", text: "Kühl" },
  { to: 24, level: "good", text: "Angenehm" },
  { to: 30, color: "var(--my-warm)", text: "Warm" }
]
```

The level colors are chosen to stay readable on the glass over a bright
photo. Whether a free `color` does is up to you.

### Units

The gauge shows temperatures in the mirror's unit system, `units` in
`config.js`: °C for `metric`, °F for `imperial`. The option `units`
overrides it per instance. A reading in °C or °F is converted; the unit
the reading comes in is the one from `fields.unit`, `transform` or the
option `unit`. The temperature preset is converted too, so that the
ring looks and assesses the same in both systems: 10–30 °C become
50–86 °F.

`min`, `max` and `bands` from the config are in the unit the gauge
shows. A temperature in another unit, e.g. K, is shown as reported,
without conversion and without preset, and the browser console names its
unit once. Units that are the same in both systems, such as ppm and %,
stay as they are.

### Options

Reading:

| Option | Default | Type | Description |
| --- | --- | --- | --- |
| `notification` | – | string | Required. The notification name the instance reacts to. |
| `match` | none | object | Path–value pairs; a notification counts only if every path in its payload equals its value, e.g. `{ name: "co2" }`. Without `match`, every notification of that name counts. |
| `fields` | `{}` | object | Dot paths into the payload for `value`, `unit`, `quantity`, `reportedAt` and `available`, e.g. `"data.co2"` or `"readings.0.value"`. |
| `transform` | none | function | `(payload) => reading \| null`, instead of `match` and `fields`; see [Advanced: mapping function](#advanced-mapping-function). |
| `unit` | `""` | string | Unit below the value when the mapping yields none. |
| `quantity` | `""` | string | Quantity of the reading when the mapping yields none. |
| `connection` | none | object | A notification that reports the connection to the source; see below. |
| `staleAfter` | off | number | Age in ms after which the last valid value counts as unavailable. |

One of `fields.value` and `transform` is required.

- `value`: a number, or a string holding one (`"21.5"`).
- `reportedAt`: epoch ms, epoch seconds or an ISO string. Without it,
  the time the notification arrives counts.
- `available`: `false` marks the reading as unavailable.

`connection` takes `{ notification, match, connected, graceAfter }`,
where `connected` is the path of a boolean in the payload, or
`{ notification, transform, graceAfter }`, where `transform` returns
`true`, `false` or `null` (says nothing). `graceAfter` (ms, default `0`)
is how long `connected: false` has to last before the gauge counts as
unavailable.

`staleAfter` is meant for sources that signal availability neither in
the reading nor by a connection notification. It dims any value whose
last report is older, also one that merely stays the same: many sensors
report only on change. Leave it off for sources that send `available`
or a connection notification.

Display:

| Option | Default | Type | Description |
| --- | --- | --- | --- |
| `label` | preset | string | Name above the value, shown in upper case; `""` for none. |
| `icon` | preset | string | `co2`, `humidity` or `temperature`; `""` for none. |
| `min` | preset | number | Start of the scale, in the displayed unit. Required without a preset. |
| `max` | preset | number | End of the scale, in the displayed unit. Required without a preset. |
| `bands` | preset | array | Bands from `min` to `max` without gaps: `{ to, level, color, text }`, `to` in the displayed unit. A value below `to` falls into the band. Each band needs `level` or `color`; see [Band colors](#band-colors). Required without a preset. |
| `decimals` | `0` | number | Decimal places of the value. The band and the status word follow the value as shown, rounded to these places; the marker shows the exact value. |
| `units` | `config.units` | string | `metric` or `imperial`: the unit system temperatures are shown in. |

"preset" is the part of the [preset](#presets) for the reading's
quantity; without one, `label` and `icon` stay empty.

Group, see [Several readings side by side](#several-readings-side-by-side):

| Option | Default | Type | Description |
| --- | --- | --- | --- |
| `rings` | none | array | One ring per entry, each with the options above. The options outside `rings` are the defaults of every entry. Without `rings`, the instance shows one ring. |
| `layout` | see below | object | The row of the rings: `{ wrap, gap, maxWidth, align }`. |

`layout.wrap` (default `true`) lets the rings that do not fit wrap into
a further row; `false` keeps them in one row, and rings that do not fit
stand out past the row's end. A ring never shrinks. `layout.gap` and
`layout.maxWidth` take a CSS length such as `"2rem"` and set
`--ring-gauge-gap` and `--ring-gauge-max-width` (see
[Styling](#styling)); without them, the row is at most as wide as the
region. `layout.maxWidth` is a limit, not a width: the row is as wide as
its widest line of rings, so a row whose rings need less stays
narrower, and a wrapped row leaves no empty space beside its rings. It
is always at least one ring wide. The limit also bounds the width the
gauge claims in its region, so the other modules there keep theirs.
Keep it narrower than the region: a wider limit lets the row take the
region's full width, with empty space beside wrapped rings. Give it in
`rem` or `vw`, not `%`: a region in the top or bottom bar takes its
width from its modules and ignores a percentage. `layout.align` (`start`, `center` or
`end`, default `start`) places the rings within each row, e.g. a last
row with fewer rings.

### Several readings side by side

MagicMirror² stacks the modules of a region one below the other. Several
instances of the gauge in one region therefore stand in a column, not in
a row. For a row, give one instance a list of `rings`:

```js
{
  module: "MMM-RingGauge",
  position: "middle_center",
  header: "Living room",
  config: {
    // Defaults for every ring.
    notification: "HOME_ASSISTANT_READING",
    fields: {
      value: "value",
      unit: "unit",
      quantity: "quantity",
      available: "available"
    },
    connection: {
      notification: "HOME_ASSISTANT_CONNECTION",
      connected: "connected",
      graceAfter: 30000
    },
    layout: { gap: "2rem" },
    rings: [
      { match: { name: "co2" }, quantity: "carbon_dioxide", unit: "ppm" },
      { match: { name: "humidity" }, quantity: "humidity", unit: "%" },
      { match: { name: "temperature" }, quantity: "temperature", unit: "°C", decimals: 1 }
    ]
  }
}
```

- Each entry sets what differs from the defaults: here `match` and the
  fallbacks for the preset.
- An entry replaces an option as a whole, also an object such as
  `fields` or `connection`; it never merges with the defaults. An entry
  with `fields: { value: "state" }` has no paths for `unit`, `quantity`
  and `available`, so the ring shows no unit from the payload and does
  not dim for `available: false`. An entry with
  `connection: { graceAfter: 60000 }` has no `notification` and
  `connected`, so the ring logs an error and ignores the connection. To
  change one part, repeat the whole object in the entry. That way a ring
  that reads from another source takes no paths of the defaults' source.
- Each ring keeps its own connection state, so rings may read from
  different sources: give an entry its own `notification`, `fields` and
  `connection`.
- `header` is MagicMirror's own option: one heading above the row.
- For one pane of glass behind all rings instead of a disc each, see
  [Panel](#panel).

The rings of a group share one `position`: they cannot be hidden or
moved one by one, and other modules cannot join the row.

Separate instances side by side need a rule in `config/custom.css` on
their region's container, e.g. for `middle_center`:

```css
.region.middle.center .container {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 2.4rem;
}
```

The rule applies to every module in that region, not only to the
gauges: use it only in a region that holds nothing else.

### What the gauge shows

Without any valid value so far, the gauge shows "—" and no marker.

When no current value is available, for whatever reason, the gauge shows
the last valid value, marker and band dimmed, and a "link broken" symbol
in place of the status word. That happens when

- the connection notification has said `connected: false` for
  `graceAfter`,
- a reading has `available: false` or a value that is not a number,
- with `staleAfter` set, the last valid value is older than that.

An invalid reading never replaces the last valid value. The next valid
reading ends the state; so does `connected: true`, unless the latest
reading said it is unavailable or the last valid value is older than
`staleAfter`.

Values outside `min`–`max` keep the marker at the end of the arc, show
the correct number and take the outermost band.

### Configuration errors

Configuration errors do not stop the gauge. Each ring logs every
problem once as an error in the browser console, named by its `label`
(or its `notification` without one, in a group with its place in
`rings`, e.g. `HOME_ASSISTANT_READING, ring 0`): a missing
`notification`, neither `fields.value` nor `transform`, a path of
`fields` or `connection.connected` that a matching payload lacks, a
`transform` that throws or returns something other than an object or
`null`, `units` other than `metric` and `imperial` (the gauge then shows
metric). A temperature in a unit other than °C and °F is logged as a warning.

A group logs `rings` that is not a list with at least one entry, and
then shows one ring from the options outside `rings`; an entry that is
not an object, which it leaves out, falling back to one ring the same
way if no entry is left; and a `layout` that is not an
object, or a `gap` or `maxWidth` the browser does not take as a CSS
length, which it ignores.

What the gauge does with such a notification:

- A `transform` that fails, or a missing path of
  `connection.connected`: the notification is ignored; the gauge keeps
  its last value.
- A missing path of `fields.value`: the reading has no value, and the
  gauge counts as unavailable, as for any value that is not a number.
  If a source sends other payloads under the same notification name,
  tell them apart with `match`.
- A missing path of another field: the reading counts without that
  field, as if its path were not set.

Each instance also checks its scale and bands, at start, or with the
first valid reading when the quantity or a temperature's unit comes from
the payload: `min` or `max` missing without a preset, no bands, a `to`
that is not a number or does not ascend, bands ending before `max`, a
`level` other than `good`, `warn`, `bad` and `cold`, a `color` the
browser does not accept as a CSS color, a band with neither `level` nor
`color`. Invalid bands do not stop
the value and the marker. Without `min` or `max`, the gauge shows the
value without marker, segments and status word. Without bands, no
segment is drawn and no status word is shown. A band whose `to` is not
a number is left out. If the drawn bands end before `max`, a value from
their end on takes no band and shows no status word. A band with an
unknown level or an invalid `color` leaves a gap in the ring, and its
text is shown uncolored.
A band narrower than the 5-unit gap between segments is not drawn.

## Advanced: mapping function

Paths cover payloads that hold the value in a fixed place. When the value
needs work before the gauge can show it – a number inside a text, a
reading somewhere in a list – write a mapping function instead: the
option `transform`.

`transform` receives the payload of every notification named by
`notification` and returns either

- an object with the gauge's fields, all optional except `value`:

  | Field | Type |
  | --- | --- |
  | `value` | number, or a string holding one |
  | `unit` | string |
  | `quantity` | string |
  | `reportedAt` | number (epoch ms or s) or ISO string |
  | `available` | boolean |

- or `null`, to ignore the notification, e.g. because it carries another
  sensor's reading. With `transform`, the gauge ignores `match` and
  `fields`; the function decides itself.

`unit` and `quantity` from the options apply when the object has none.

Rules for the function:

- It needs MagicMirror² 2.36.0 or newer: older versions drop functions
  from the config.
- Write it as an arrow function, `(payload) => …`, or as
  `function (payload) { … }`. MagicMirror² rebuilds the function in the
  browser from its source text; the method shorthand
  `transform (payload) { … }` cannot be rebuilt, and the gauge logs that
  `transform` is not a function.
- It must be self-contained. Rebuilt from its source text, it no longer
  sees anything else in `config.js`: no variable, no helper, no import.
- If it throws or returns something other than an object or `null`, the
  gauge ignores that notification, keeps its last value and logs the
  error once in the browser console. Open the console with the
  developer tools of the browser, or start MagicMirror² with
  `node --run start:dev`.

### A value as text with its unit

A source sends `MQTT_MESSAGE` with the unit inside the value:

```json
{ "topic": "home/livingroom/co2", "message": "812 ppm" }
```

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  config: {
    notification: "MQTT_MESSAGE",
    transform: (payload) => {
      if (payload.topic !== "home/livingroom/co2") {
        return null;
      }
      const [value, unit] = payload.message.split(" ");
      return { value: value, unit: unit };
    },
    label: "CO₂",
    icon: "co2",
    min: 400,
    max: 2500,
    bands: [
      { to: 1000, level: "good", text: "Gut" },
      { to: 2000, level: "warn", text: "Lüften" },
      { to: 2500, level: "bad", text: "Jetzt lüften" }
    ]
  }
}
```

### Readings in a list, and the connection by a function

A weather station sends all its readings in one `WEATHER_STATION`
notification, with the report time in epoch seconds:

```json
{
  "station": "balcony",
  "time": 1768462200,
  "readings": [
    { "type": "temperature", "value": 3.4, "unit": "°C" },
    { "type": "humidity", "value": 81, "unit": "%" }
  ]
}
```

It reports its state in `WEATHER_STATION_STATUS`:

```json
{ "station": "balcony", "status": "offline" }
```

`status` is `online`, `offline` or `connecting`. A path cannot turn that
into a boolean, so `connection` takes a function too; it returns `null`
for `connecting`, which leaves the state as it is:

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  config: {
    notification: "WEATHER_STATION",
    transform: (payload) => {
      const reading = payload.readings.find((entry) => entry.type === "humidity");
      if (!reading) {
        return null;
      }
      return { value: reading.value, unit: reading.unit, reportedAt: payload.time };
    },
    connection: {
      notification: "WEATHER_STATION_STATUS",
      transform: (payload) => {
        if (payload.status === "online") {
          return true;
        }
        return payload.status === "offline" ? false : null;
      },
      graceAfter: 60000
    },
    label: "Humidity",
    icon: "humidity",
    min: 20,
    max: 100,
    bands: [
      { to: 30, level: "warn", text: "Zu trocken" },
      { to: 60, level: "good", text: "Optimal" },
      { to: 70, level: "warn", text: "Zu feucht" },
      { to: 100, level: "bad", text: "Viel zu feucht" }
    ]
  }
}
```

### What fails: a helper from elsewhere in `config.js`

The function below calls `parsePpm`, defined at the top of `config.js`.
That works in plain JavaScript, but not here: MagicMirror² passes only the
function's source text to the browser, where `parsePpm` does not exist.

```js
const parsePpm = (text) => Number.parseFloat(text);

let config = {
  modules: [
    {
      module: "MMM-RingGauge",
      position: "top_left",
      config: {
        notification: "MQTT_MESSAGE",
        transform: (payload) => ({ value: parsePpm(payload.message) }),
        label: "CO₂"
      }
    }
  ]
};
```

The gauge keeps showing "—", and the browser console shows once:
``MMM-RingGauge (CO₂): `transform` threw: ReferenceError: parsePpm is not defined``.
Write the helper's code into the function instead.

## Styling

Sizes and colors are CSS custom properties on `.MMM-RingGauge`; override
them in `config/custom.css`:

| Property | Default |
| --- | --- |
| `--ring-gauge-size` | `10.5rem` – width of the gauge; text and ring grow with it |
| `--ring-gauge-scrim` | `rgb(8, 10, 14)` – tint of the glass |
| `--ring-gauge-rim` | `rgba(255, 255, 255, 0.55)` – light on the glass's rim and its sheen |
| `--ring-gauge-blur` | `0.6em` – blur behind the glass; takes effect only with frosted glass (below) |
| `--ring-gauge-good`, `--ring-gauge-warn`, `--ring-gauge-bad`, `--ring-gauge-cold` | `#4ade80`, `#fbbf24`, `#f87171`, `#38bdf8` |
| `--ring-gauge-text`, `--ring-gauge-label`, `--ring-gauge-unit` | text colors |
| `--ring-gauge-unavailable` | `var(--ring-gauge-warn)` – color of the "link broken" symbol |
| `--ring-gauge-gap` | `2.4rem`, on the [panel](#panel) `0.2em` – space between the rings of a group |
| `--ring-gauge-max-width` | `100%` – limit of a group's width; keep a set limit narrower than the region |

Size and gap are in `rem`, so the gauge grows with MagicMirror's
`--font-size` like the other modules do.

### Frosted glass

The glass is clear by default: it tints the photo behind it but does
not blur it. To frost it, switch the blur on per instance:

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  classes: "ring-gauge-blur",
  config: { /* … */ }
}
```

or for all instances in `config/custom.css`:

```css
.MMM-RingGauge .ring-gauge {
  backdrop-filter: blur(var(--ring-gauge-blur)) saturate(1.4);
}
```

The browser redoes the blur on every frame in which the photo or the
gauge changes: while the photo fades to the next one, and while the
marker moves to a new value. Start MagicMirror² with
`ELECTRON_ENABLE_GPU=1` so that the GPU does it: MagicMirror² switches
the GPU off by default, and on the CPU these moments may stutter, on a
Raspberry Pi as well.

### Panel

A group of rings can stand on one pane of glass instead of a disc each:

```js
{
  module: "MMM-RingGauge",
  position: "middle_center",
  classes: "ring-gauge-panel",
  config: { rings: [/* … */] }
}
```

The panel takes `--ring-gauge-scrim` and `--ring-gauge-rim` like the
discs. On the panel, the rings stand closer: `--ring-gauge-gap` is
`0.2em`, so that the rings stand as far apart as from the panel's edge.
`layout.gap` or `--ring-gauge-gap` in `config/custom.css` replaces it.
With `classes: "ring-gauge-panel ring-gauge-blur"`, the panel is
frosted instead of each disc.

### WallberryTheme

With WallberryTheme, the glass can take the hue of the photo. Without a
photo, `--wb-tint-dark` is invalid and the fallback applies:

```css
.module.MMM-RingGauge {
  --ring-gauge-scrim: var(--wb-tint-dark, rgb(8, 10, 14));
}
```

## Development

The module has no build step and no dependencies. Run the checks the
workflow runs on every pull request:

```sh
git ls-files '*.js' | xargs -n1 node --check
pnpm dlx @biomejs/biome@2.6.3 ci .
node --test "tests/**/*.test.js"
```

### Fake readings

`dev/MMM-FakeReadings/` is a mock source for checking the gauge without
sensors, e.g. the marker movement and the readability on the mirror's
own hardware. It is not part of the gauge: MagicMirror² loads it only if
`config.js` names it. It runs in the browser only and has no
dependencies.

Link it into the modules folder next to the gauge:

```sh
cd ~/MagicMirror/modules
ln -s ~/MagicMirror/modules/MMM-RingGauge/dev/MMM-FakeReadings MMM-FakeReadings
```

Every `interval`, the mock sends one `FAKE_READING` per sensor –
`co2`, `humidity` and `temperature` – with
`{ sensor, quantity, unit, value, available }`. The values cross every
band of the preset, jump from one end of the arc to the other, take
small steps, and now and then come with `available: false`. Every
`dropEvery` ticks, the mock sends `FAKE_CONNECTION` with
`connected: false`, sends nothing for `dropFor` ticks, and then sends
`connected: true`.

| Option | Default | Description |
| --- | --- | --- |
| `readingNotification` | `"FAKE_READING"` | Name of the reading notification. |
| `connectionNotification` | `"FAKE_CONNECTION"` | Name of the connection notification. |
| `interval` | `4000` | Time between two ticks, in ms. |
| `dropEvery` | `24` | Ticks per cycle; the connection drops at the end of each. `0` never drops it. |
| `dropFor` | `3` | Ticks per cycle without connection. |

A group of three rings that read from the mock. Add
[WallberryTheme](https://github.com/raywo/WallberryTheme) as its README
describes, to check them over its background photo:

```js
modules: [
  { module: "MMM-FakeReadings" },
  {
    module: "MMM-RingGauge",
    position: "bottom_center",
    config: {
      notification: "FAKE_READING",
      fields: {
        value: "value",
        unit: "unit",
        quantity: "quantity",
        available: "available"
      },
      connection: {
        notification: "FAKE_CONNECTION",
        connected: "connected",
        graceAfter: 5000
      },
      rings: [
        { match: { sensor: "co2" }, quantity: "carbon_dioxide", unit: "ppm" },
        { match: { sensor: "humidity" }, quantity: "humidity", unit: "%" },
        { match: { sensor: "temperature" }, quantity: "temperature", unit: "°C" }
      ]
    }
  }
]
```

Add `classes: "ring-gauge-panel"` to see them on one pane of glass.

With the defaults, a drop lasts 12 s, so the gauges dim 5 s into it and
light up again with the next reading.

## License

MIT

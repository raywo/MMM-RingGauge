# Configuration

Every option of the gauge, in detail. The
[README](../README.md#configuration) shows how to start: an instance
for MMM-HomeAssistantDataProvider, one for another source, the presets
and a group of rings.

## Options

Reading:

| Option | Default | Type | Description |
| --- | --- | --- | --- |
| `notification` | – | string | Required. The notification name the instance reacts to. |
| `match` | none | object | Path–value pairs; a notification counts only if every path in its payload equals its value, e.g. `{ name: "co2" }`. Without `match`, every notification of that name counts. |
| `fields` | `{}` | object | Dot paths into the payload for `value`, `unit`, `quantity`, `reportedAt` and `available`, e.g. `"data.co2"` or `"readings.0.value"`. |
| `transform` | none | function | `(payload) => reading \| null`, instead of `match` and `fields`; see [Mapping function](mapping-function.md). |
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

"preset" is the part of the [preset](../README.md#presets) for the reading's
quantity; without one, `label` and `icon` stay empty.

Group, see [Several readings side by side](../README.md#several-readings-side-by-side):

| Option | Default | Type | Description |
| --- | --- | --- | --- |
| `rings` | none | array | One ring per entry, each with the options above. The options outside `rings` are the defaults of every entry. Without `rings`, the instance shows one ring. |
| `layout` | see below | object | The row of the rings: `{ wrap, gap, maxWidth, align }`. |

`layout.wrap` (default `true`) lets the rings that do not fit wrap into
a further row; `false` keeps them in one row, and rings that do not fit
stand out past the row's end. A ring never shrinks. `layout.gap` and
`layout.maxWidth` take a CSS length such as `"2rem"` and set
`--ring-gauge-gap` and `--ring-gauge-max-width` (see
[Styling](styling.md)); without them, the row is at most as wide as the
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

## Band colors

A band takes its color from `level` – `good` (green), `warn` (yellow),
`bad` (red) or `cold` (blue) – or from its own `color`. The segment and
the status word show that color. `color` takes any CSS color, also
`var(--…)`, so that `custom.css` can set it, and wins over `level`:

```js
bands: [
  { to: 16, level: "bad", text: "Too cold" },
  { to: 20, color: "#60a5fa", text: "Cool" },
  { to: 24, level: "good", text: "Comfortable" },
  { to: 30, color: "var(--my-warm)", text: "Warm" }
]
```

The level colors are chosen to stay readable on the glass over a bright
photo. Whether a free `color` does is up to you.

## Units

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

## Configuration errors

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

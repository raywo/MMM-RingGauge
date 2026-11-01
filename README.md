# MMM-RingGauge

A [MagicMirror²](https://magicmirror.builders/) module that shows sensor
readings as three-quarter rings: colored bands for the scale, a marker
for the value and a status word for the assessment, e.g. CO₂ "Good" or
"Ventilate now". An instance shows one ring, or a group of rings in one
row, e.g. CO₂, humidity and temperature of a room; see
[Several readings side by side](#several-readings-side-by-side).

![CO₂ and humidity gauges on a forest photo: CO₂ at 1350 ppm with the
status "Lüften", humidity at 48 % with the status
"Optimal"](images/screenshot.png)

The gauge stays readable on busy background photos thanks to a disc of
tinted glass, frosted if you like, and takes the mirror's font, so it
fits themes such as
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

The module has no dependencies. Add it to `config/config.js` as
[Configuration](#configuration) describes, then restart MagicMirror²:

- With pm2, the usual setup on a Raspberry Pi: `pm2 restart <name>`,
  with the name that `pm2 list` shows for MagicMirror², often
  `MagicMirror` or `mm`.
- Otherwise: stop MagicMirror² and start it again the way you started
  it, e.g. `node --run start` in `~/MagicMirror`.

## Update

```bash
cd ~/MagicMirror/modules/MMM-RingGauge
git pull
```

Then restart MagicMirror² as [Installation](#installation) describes.
[CHANGELOG.md](CHANGELOG.md) lists what
changed and whether a config needs to change with it.

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
},
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
},
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

The same with `"humidity"`, `%` and `humidity`, or with
`"temperature"`, `°C` and `temperature`.

Every option set in the config overrides its part of the preset, e.g.
`label: "Bedroom"` or `max: 2000`; `label: ""` and `icon: ""` hide them.
`bands` from the config replace the preset's bands as a whole and carry
their own `text`; a band without `text` shows no status word.

Without a preset for the quantity, or without a quantity, the config has
to set `min`, `max` and `bands`.

[docs/configuration.md](docs/configuration.md) lists every option, the
band colors, the units and the configuration errors the gauge logs. For
payloads that paths do not cover, see
[docs/mapping-function.md](docs/mapping-function.md); for sizes, colors,
frosted glass and the panel, [docs/styling.md](docs/styling.md).

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
},
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
  [Panel](docs/styling.md#panel).

![The CO₂ and humidity gauges from the screenshot above, as a group on
one pane of glass](images/panel.png)

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

## Troubleshooting

The gauge writes its messages to the browser console, each starting
with `MMM-RingGauge`. Open it in the browser that shows the mirror, or
on the mirror itself start MagicMirror² with its developer tools:

```sh
cd ~/MagicMirror
node --run start:dev
```

Stop the running MagicMirror² first, with pm2 by `pm2 stop <name>`:
otherwise the second one cannot open its port and quits.

### No reading arrives

The gauge keeps showing "—" and logs nothing: it cannot tell a source
that has not sent yet from a notification it does not listen to.

- Check that the source module is in `config/config.js` and runs; its
  own README names the log lines that show it.
- Compare `notification` with the name the source sends, letter by
  letter: `HOME_ASSISTANT_READING` and `HOME_ASSISTANT_READINGS` are two
  notifications.
- To see what arrives, replace `match` and `fields` for a moment with a
  function that logs every payload and shows nothing:

  ```js
  transform: (payload) => {
    Log.log("MMM-RingGauge payload", payload);
    return null;
  }
  ```

  No line in the console means that no notification of that name
  arrives. Remove the function again afterwards.

### `match` or a path in `fields` does not fit the payload

Compare the logged payload with the config:

- `match` compares exactly, including the type: the text `"3"` does not
  match the number `3`, so `{ id: "3" }` does not match a payload with
  `"id": 3`, and `{ name: "CO2" }` does not match `"co2"`. A
  notification that does not match is ignored without a message.
- A path in `fields` that a matching payload lacks is logged once, e.g.
  `MMM-RingGauge (CO₂): …`; see
  [Configuration errors](docs/configuration.md#configuration-errors).
  Paths name the keys from the top of the payload, separated by dots,
  with list positions as numbers: `"data.readings.0.value"`.
- A value that is not a number dims the gauge, as an unavailable
  reading does. A string holding a number, such as `"21.5"`, counts; one
  with its unit, such as `"812 ppm"`, needs a
  [mapping function](docs/mapping-function.md#a-value-as-text-with-its-unit).

### MagicMirror² is older than 2.36

MagicMirror² skips the module, and the browser console shows the
warning `Version is incorrect. Skip module: 'MMM-RingGauge'`; the line
before it names the minimum and the current version. Update
MagicMirror² as its documentation describes; the version is in
`package.json` in the MagicMirror folder.

## Contributing

Bug reports and pull requests are welcome;
[CONTRIBUTING.md](CONTRIBUTING.md) describes how. It also describes
the mock source in `dev/MMM-FakeReadings/`, which lets you try the
gauge without sensors.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

If the gauges help you keep an eye on your rooms, you can
[buy me a coffee](https://www.buymeacoffee.com/raywo).

## License

MIT
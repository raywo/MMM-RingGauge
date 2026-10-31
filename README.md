# MMM-RingGauge

A [MagicMirror²](https://magicmirror.builders/) module that shows one sensor
reading as a three-quarter ring: colored bands for the scale, a marker for
the value and a status word for the assessment, e.g. CO₂ "Gut" or
"Jetzt lüften". Several instances show several readings side by side.

The gauge stays readable on busy background photos thanks to a soft dark
halo, and takes the mirror's font, so it fits themes such as
[WallberryTheme](https://github.com/raywo/WallberryTheme).

> **Open – data source.** The module is meant to be passive: it receives
> readings as notifications from a provider module such as
> [MMM-HomeAssistantDataProvider](https://github.com/raywo/MMM-HomeAssistantDataProvider)
> and fetches nothing itself. Until that is implemented, the module polls
> one Home Assistant entity per instance over the REST API in its
> `node_helper.js`. The options marked "(to be removed)" belong to that
> interim data source.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/raywo/MMM-RingGauge.git
```

The module has no dependencies.

## Configuration

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  config: {
    host: "192.168.1.10",
    port: 8123,
    token: "${SECRET_HOMEASSISTANT_TOKEN}",
    entity: "sensor.living_room_co2",
    label: "CO₂",
    unit: "ppm",
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

| Option | Default | Type | Description |
| --- | --- | --- | --- |
| `host` | `""` | string | Home Assistant host as seen from the MagicMirror server (to be removed). |
| `port` | `8123` | number | Home Assistant port (to be removed). |
| `useTLS` | `false` | boolean | Use HTTPS (to be removed). |
| `token` | `""` | string | Long-lived access token. Use a `SECRET_*` variable so it stays out of the browser (to be removed). |
| `entity` | `""` | string | Entity ID of the sensor (to be replaced by the provider's reading name). |
| `label` | `""` | string | Name above the value, shown in upper case. |
| `unit` | `""` | string | Unit below the value. |
| `icon` | `""` | string | `co2`, `humidity` or `temperature`; empty for none. |
| `min` | `0` | number | Start of the scale. |
| `max` | `100` | number | End of the scale. |
| `bands` | `[]` | array | Bands from `min` to `max` without gaps: `{ to, level, text }`, `level` one of `good`, `warn`, `bad`. A value below `to` falls into the band. |
| `decimals` | `0` | number | Decimal places of the value. |
| `updateInterval` | `30000` | number | Polling interval in ms (to be removed). |
| `staleAfter` | `600000` | number | Age in ms after which a reading counts as stale. |

The `node_helper` reads `host`, `port`, `useTLS`, `token` and
`updateInterval` from the server-side config only and polls only entities
configured there; the browser cannot redirect the token to another host.

Values outside `min`–`max` keep the marker at the end of the arc, show
the correct number and take the outermost band.

Without a value the gauge shows "—" and no marker. A reading older than
`staleAfter` is dimmed and labeled "veraltet" (stale).

## Styling

Sizes and colors are CSS custom properties on `.MMM-RingGauge`; override
them in `config/custom.css`:

| Property | Default |
| --- | --- |
| `--ring-gauge-size` | `210px` |
| `--ring-gauge-scrim` | `rgb(8, 10, 14)` – color of the halo |
| `--ring-gauge-good`, `--ring-gauge-warn`, `--ring-gauge-bad` | `#4ade80`, `#fbbf24`, `#f87171` |
| `--ring-gauge-text`, `--ring-gauge-label`, `--ring-gauge-unit` | text colors |
| `--ring-gauge-gap` | `48px` – space between instances in one region |

With WallberryTheme, the halo can take the hue of the photo. Without a
photo, `--wb-tint-dark` is invalid and the fallback applies:

```css
.module.MMM-RingGauge {
  --ring-gauge-scrim: var(--wb-tint-dark, rgb(8, 10, 14));
}
```

The full visual specification is in [docs/design.md](docs/design.md).

## Open questions

- **Open – notification contract:** name of the notification, payload
  fields and how a gauge asks for the current reading after start. The
  contract is defined in MMM-HomeAssistantDataProvider; see there.
- **Open – presets per quantity:** whether the module ships presets for
  CO₂, humidity and temperature (range, bands, icon, status texts via
  `translations/`), so that a typical instance only names its reading.
  Proposed: yes, with each part overridable in the config.
- **Open – unit:** the provider delivers the unit of the source; whether
  the `unit` option stays as an override.
- **Open – status texts:** in the config (as now) or as translation keys
  per level.

## License

MIT

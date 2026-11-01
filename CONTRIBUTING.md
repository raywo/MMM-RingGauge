# Contributing

Thanks for helping. Bug reports, questions and pull requests are welcome
as [issues](https://github.com/raywo/MMM-RingGauge/issues) and pull
requests on GitHub. Everyone taking part follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

- Name your MagicMirror² version and the module that sends the
  readings.
- Add the gauge's entry from `config/config.js` and one payload the
  source sends; [Troubleshooting](README.md#troubleshooting) shows how
  to log it.
- Add the lines of the browser console that start with
  `MMM-RingGauge`.
- Replace tokens, addresses and anything else you do not want to share
  before you paste config or payloads.

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
| `fixed` | `{}` | A value per sensor, e.g. `{ co2: 1350 }`, sent at every tick instead of the changing values. |

A group of three rings that read from the mock. Add both entries to the
`modules` array of `config.js`, and
[WallberryTheme](https://github.com/raywo/WallberryTheme) as its README
describes, to check them over its background photo:

```js
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
},
```

Add `classes: "ring-gauge-panel"` to see them on one pane of glass.

With the defaults, a drop lasts 12 s, so the gauges dim 5 s into it and
light up again with the next reading.

### Screenshots

The screenshots in `images/` show the mock's fixed values over
[a photo by Paul Wuthrich on Unsplash](https://unsplash.com/photos/MgCn9JWFmZY),
with `language: "de"` in `config.js`. To take them again, use these
entries:

```js
{
  module: "MMM-FakeReadings",
  config: { dropEvery: 0, fixed: { co2: 1350, humidity: 48 } }
},
{
  module: "MMM-RingGauge",
  position: "middle_center",
  config: {
    notification: "FAKE_READING",
    fields: {
      value: "value",
      unit: "unit",
      quantity: "quantity",
      available: "available"
    },
    rings: [
      { match: { sensor: "co2" }, quantity: "carbon_dioxide", unit: "ppm" },
      { match: { sensor: "humidity" }, quantity: "humidity", unit: "%" }
    ]
  }
},
```

`images/screenshot.png` shows them like this, `images/panel.png` with
`classes: "ring-gauge-panel"`. Put the photo behind the mirror in
`config/custom.css`:

```css
html {
  background: url("photo.jpg") center / cover no-repeat fixed;
}

body {
  background: transparent;
}
```

and save it as `config/photo.jpg`. Take each screenshot in a window of
1200 × 800 at twice the pixel density, cut to the row of rings with
40 px of photo around it.

## Pull requests

- Open an issue first for anything larger than a small fix, so that we
  can agree on the approach before you write the code.
- Run the checks from [Development](#development) before you
  open the pull request; the workflow runs the same checks.
- Add or change tests in `tests/` for every change of behavior.
- Add an entry to [CHANGELOG.md](CHANGELOG.md).
- Add every new user-facing text to each file in `translations/`.

## Rules that keep the module installable

- Add no dependencies, and no lockfile. Users install the module with
  `git clone` only, without `npm install`.
- Add no `node_helper`: the gauge fetches nothing and needs no secrets.

## Rules that keep the gauge independent of its sources

- Never name a source's notification or payload fields in the code, not
  even as a default. Sources are mapped in the config of each instance.
- Expect facts from a source only: value, unit, quantity, report time,
  availability. Scale, bands, labels and status texts belong to the
  gauge's presets and the instance's config, never to the source.

## Rules that keep the marker moving

- Build the DOM once and update its elements. Do not call `updateDom()`
  for a new value: replacing the DOM breaks the marker movement.
- Move the marker by its angle, never by x and y.

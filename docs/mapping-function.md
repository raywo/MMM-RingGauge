# Mapping function

Paths in `fields`, as the [README](../README.md#configuration) shows
them, cover payloads that hold the value in a fixed place. When the
value needs work before the gauge can show it – a number inside a text,
a reading somewhere in a list – write a mapping function instead: the
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
  error once in the browser console;
  [Troubleshooting](../README.md#troubleshooting) shows how to open it.

## A value as text with its unit

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
      { to: 1000, level: "good", text: "Good" },
      { to: 2000, level: "warn", text: "Ventilate" },
      { to: 2500, level: "bad", text: "Ventilate now" }
    ]
  }
},
```

## Readings in a list, and the connection by a function

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
      { to: 30, level: "warn", text: "Too dry" },
      { to: 60, level: "good", text: "Optimal" },
      { to: 70, level: "warn", text: "Too humid" },
      { to: 100, level: "bad", text: "Far too humid" }
    ]
  }
},
```

## What fails: a helper from elsewhere in `config.js`

The function below calls `parsePpm`, defined at the top of `config.js`.
That works in plain JavaScript, but not here: MagicMirror² passes only the
function's source text to the browser, where `parsePpm` does not exist.

```js
// At the top of config.js:
const parsePpm = (text) => Number.parseFloat(text);

// Further down, among the modules:
{
  module: "MMM-RingGauge",
  position: "top_left",
  config: {
    notification: "MQTT_MESSAGE",
    transform: (payload) => ({ value: parsePpm(payload.message) }),
    label: "CO₂"
  }
},
```

The gauge keeps showing "—", and the browser console shows once:
``MMM-RingGauge (CO₂): `transform` threw: ReferenceError: parsePpm is not defined``.
Write the helper's code into the function instead.

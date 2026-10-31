/*
  Pure logic of MMM-RingGauge's presets: scale, bands, icon and label per
  quantity, and the conversion of temperatures into the unit system the
  gauge displays in. No DOM and no MagicMirror: the browser loads this
  file through getScripts() as the global RingGaugePresets, tests
  require() it.

  Quantities are named as home automation's device classes name them,
  e.g. carbon_dioxide; a source without them sets the `quantity` option.
 */

(function (root, factory) {
  const presets = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = presets;
  }
  // Set in the browser even if it has `module` (Electron's nodeIntegration).
  root.RingGaugePresets = presets;
})(this, function () {
  // Labels and status texts are translation keys. Temperature limits are
  // in °C and converted for an imperial mirror, so that the ring looks and
  // assesses the same in both systems.
  const PRESETS = {
    carbon_dioxide: {
      icon: "co2",
      label: "CO2_LABEL",
      min: 400,
      max: 2500,
      bands: [
        { to: 1000, level: "good", text: "CO2_GOOD" },
        { to: 2000, level: "warn", text: "CO2_VENTILATE" },
        { to: 2500, level: "bad", text: "CO2_VENTILATE_NOW" }
      ]
    },
    humidity: {
      icon: "humidity",
      label: "HUMIDITY_LABEL",
      min: 20,
      max: 80,
      bands: [
        { to: 30, level: "warn", text: "HUMIDITY_TOO_DRY" },
        { to: 60, level: "good", text: "HUMIDITY_OPTIMAL" },
        { to: 70, level: "warn", text: "HUMIDITY_TOO_HUMID" },
        { to: 80, level: "bad", text: "HUMIDITY_FAR_TOO_HUMID" }
      ]
    },
    temperature: {
      icon: "temperature",
      label: "TEMPERATURE_LABEL",
      min: 10,
      max: 30,
      bands: [
        { to: 16, level: "bad", text: "TEMPERATURE_TOO_COLD" },
        { to: 19, level: "warn", text: "TEMPERATURE_COOL" },
        { to: 24, level: "good", text: "TEMPERATURE_COMFORTABLE" },
        { to: 27, level: "warn", text: "TEMPERATURE_WARM" },
        { to: 30, level: "bad", text: "TEMPERATURE_TOO_WARM" }
      ]
    }
  };

  // The temperature unit each unit system displays.
  const TEMPERATURE_UNITS = { metric: "°C", imperial: "°F" };

  function isSet (value) {
    return value !== undefined && value !== null;
  }

  // The unit system a temperature unit belongs to, or null if neither.
  function temperatureSystem (unit) {
    const system = Object.keys(TEMPERATURE_UNITS).find((key) => TEMPERATURE_UNITS[key] === unit);
    return system === undefined ? null : system;
  }

  function convertTemperature (value, from, to) {
    if (from === to) {
      return value;
    }
    return to === "imperial" ? value * 1.8 + 32 : (value - 32) / 1.8;
  }

  // Which part of a reading the settings depend on: its quantity, and for
  // a temperature its unit. Equal keys give equal settings.
  function settingsKey (reading) {
    return reading.quantity === "temperature" ? reading.quantity + "|" + reading.unit : reading.quantity;
  }

  // What the gauge draws for a reading's quantity and unit: every option
  // set in `options` (neither undefined nor null) wins over the preset;
  // `bands` replace the preset's bands as a whole.
  //   reading    { quantity, unit } of the reading, or of the options
  //              before any reading
  //   units      "metric" or "imperial": the system the gauge displays in
  //   translate  turns a preset's translation key into its text
  // Returns min, max, bands, label, icon; `unit`, the displayed unit, or
  // null to show the reading's own; `convert`, from the reading's unit to
  // the displayed one; and problems, each { key, level, message }.
  function settings (options, reading, units, translate) {
    const problems = [];
    let system = isSet(units) ? units : "metric";
    if (!Object.hasOwn(TEMPERATURE_UNITS, system)) {
      problems.push({
        key: "units",
        level: "error",
        message: "`units` " + JSON.stringify(units) + " is neither \"metric\" nor \"imperial\"; showing metric"
      });
      system = "metric";
    }

    const quantity = reading.quantity;
    let preset = Object.hasOwn(PRESETS, quantity) ? PRESETS[quantity] : null;
    let unit = null;
    let convert = (value) => value;
    let scale = (value) => value;
    if (quantity === "temperature") {
      const from = temperatureSystem(reading.unit);
      if (from === null) {
        preset = null;
        problems.push({
          key: "unit:" + reading.unit,
          level: "warn",
          message: "temperature in unit " + JSON.stringify(reading.unit)
            + " is shown as reported, without conversion and without preset"
        });
      } else {
        unit = TEMPERATURE_UNITS[system];
        convert = (value) => convertTemperature(value, from, system);
        scale = (value) => convertTemperature(value, "metric", system);
      }
    }

    const pick = (name, fromPreset) => {
      if (isSet(options[name])) {
        return options[name];
      }
      return preset === null ? undefined : fromPreset();
    };
    const min = pick("min", () => scale(preset.min));
    const max = pick("max", () => scale(preset.max));
    const bands = pick("bands", () =>
      preset.bands.map((band) => ({ to: scale(band.to), level: band.level, text: translate(band.text) })));
    const label = pick("label", () => translate(preset.label));
    const icon = pick("icon", () => preset.icon);

    const without = quantity === "" ? "without a quantity" : "quantity " + JSON.stringify(quantity) + " has no preset";
    for (const [name, value] of [["min", min], ["max", max]]) {
      if (!isSet(value)) {
        problems.push({ key: name, level: "error", message: "`" + name + "` is not set, and " + without });
      } else if (!Number.isFinite(value)) {
        problems.push({ key: name, level: "error", message: "`" + name + "` is not a number" });
      }
    }

    return {
      min,
      max,
      bands,
      label: isSet(label) ? label : "",
      icon: isSet(icon) ? icon : "",
      unit,
      convert,
      problems
    };
  }

  return {
    PRESETS,
    TEMPERATURE_UNITS,
    temperatureSystem,
    convertTemperature,
    settingsKey,
    settings
  };
});

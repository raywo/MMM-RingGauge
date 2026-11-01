/*
  MMM-FakeReadings: a development source for MMM-RingGauge. Sends readings
  for CO₂, humidity and temperature on a fixed interval, so that marker
  movement and the unavailable state can be checked without real sensors.

  Not part of the gauge: MagicMirror² loads it only if a config names it.
  Browser only, no node_helper, no dependencies.
 */

// One entry per reading tick, repeated from the start. A number is sent as
// a valid reading, null as `available: false`. Each list crosses every
// band of the gauge's preset, jumps from one end of the arc to the other
// and takes small steps.
const FAKE_READINGS_SCENARIOS = [
  {
    sensor: "co2",
    quantity: "carbon_dioxide",
    unit: "ppm",
    values: [520, 540, 560, 580, 950, 1050, 1500, 1950, 2050, 2300, 400, 2500, 2490, null, 2480, 800]
  },
  {
    sensor: "humidity",
    quantity: "humidity",
    unit: "%",
    values: [45, 46, 47, 48, 58, 62, 66, 69, 71, 76, 20, 80, 79, null, 78, 28]
  },
  {
    sensor: "temperature",
    quantity: "temperature",
    unit: "°C",
    values: [21, 21.2, 21.4, 21.6, 23, 25, 26.5, 28, 29, 18, 15, 10, 30, null, 29.5, 21]
  }
];

Module.register("MMM-FakeReadings", {
  defaults: {
    readingNotification: "FAKE_READING",
    connectionNotification: "FAKE_CONNECTION",
    // Time between two ticks, in ms.
    interval: 4000,
    // Every `dropEvery` ticks the connection drops for the last `dropFor`
    // of them; 0 never drops it.
    dropEvery: 24,
    dropFor: 3,
    // A value per sensor, e.g. { co2: 900 }, sent at every tick instead
    // of its list: for screenshots that can be taken again.
    fixed: {}
  },

  scenarios: FAKE_READINGS_SCENARIOS,

  // What happens at a tick:
  //   connected  true or false to send as connection state, null for none
  //   readings   whether the tick sends readings
  // A source without connection sends no readings: a valid reading would
  // count as connected again.
  plan (tick, options) {
    const { dropEvery, dropFor } = options;
    if (!(dropEvery > 0) || !(dropFor > 0) || dropFor >= dropEvery) {
      return { connected: null, readings: true };
    }
    const position = tick % dropEvery;
    const dropAt = dropEvery - dropFor;
    if (position === dropAt) {
      return { connected: false, readings: false };
    }
    if (position > dropAt) {
      return { connected: null, readings: false };
    }
    return { connected: position === 0 && tick > 0 ? true : null, readings: true };
  },

  // The payloads of the readings sent at reading tick `index`.
  readingsAt (index) {
    const fixed = this.config.fixed ?? {};
    return this.scenarios.map((scenario) => {
      const value = Object.hasOwn(fixed, scenario.sensor)
        ? fixed[scenario.sensor]
        : scenario.values[index % scenario.values.length];
      return {
        sensor: scenario.sensor,
        quantity: scenario.quantity,
        unit: scenario.unit,
        value: value,
        available: value !== null
      };
    });
  },

  start () {
    this.tick = 0;
    this.readingIndex = 0;
    this.timer = null;
  },

  // Starts once every module has its DOM, so that no gauge misses the
  // first readings.
  notificationReceived (notification) {
    if (notification !== "DOM_OBJECTS_CREATED" || this.timer !== null) {
      return;
    }
    this.sendTick();
    this.timer = setInterval(() => this.sendTick(), this.config.interval);
  },

  sendTick () {
    const { connected, readings } = this.plan(this.tick, this.config);
    if (connected !== null) {
      this.sendNotification(this.config.connectionNotification, { connected });
    }
    if (readings) {
      for (const payload of this.readingsAt(this.readingIndex)) {
        this.sendNotification(this.config.readingNotification, payload);
      }
      this.readingIndex += 1;
    }
    this.tick += 1;
  }
});

/*
  Polls the state of each configured Home Assistant entity over the REST
  API and forwards value and report time.

  Connection data and entities come from the server-side config only. The
  browser names nothing but the entity of its instance, and only one that
  the config lists: MagicMirror restores **SECRET_*** placeholders in every
  socket message, so a host taken from the browser would let anyone who
  can open the mirror send the token to a server of their choice.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

const DEFAULTS = {
  port: 8123,
  useTLS: false,
  updateInterval: 30 * 1000
};

module.exports = NodeHelper.create({
  start () {
    // One timer per entity, however many browsers or instances ask for it.
    this.timers = new Map();
  },

  stop () {
    this.timers.forEach((timer) => {
      clearInterval(timer);
    });
  },

  // getServerModuleConfig() only finds the first instance.
  serverConfigFor (entity) {
    const instance = (global.config?.modules ?? [])
      .find((module) => module.module === this.name && module.config?.entity === entity);
    return instance ? { ...DEFAULTS, ...instance.config } : null;
  },

  socketNotificationReceived (notification, payload) {
    if (notification !== "RING_GAUGE_START") {
      return;
    }
    const instanceConfig = this.serverConfigFor(payload?.entity);
    if (!instanceConfig) {
      Log.warn("Ignoring an entity that no instance configures: " + payload?.entity);
      return;
    }
    const poll = () => this.poll(instanceConfig);
    // A reloaded browser gets the current reading at once.
    poll();
    if (!this.timers.has(instanceConfig.entity)) {
      this.timers.set(instanceConfig.entity, setInterval(poll, instanceConfig.updateInterval));
    }
  },

  async poll ({ host, port, useTLS, token, entity }) {
    const url = (useTLS ? "https" : "http") + "://" + host + ":" + port + "/api/states/" + encodeURIComponent(entity);
    try {
      const response = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(10 * 1000)
      });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      const state = await response.json();
      // "unavailable" and "unknown" become null: the gauge shows no value.
      const value = Number.parseFloat(state.state);
      this.sendSocketNotification("RING_GAUGE_READING", {
        entity,
        value: Number.isFinite(value) ? value : null,
        // Also refreshed when the sensor reports an unchanged value.
        reportedAt: Date.parse(state.last_reported || state.last_updated)
      });
    } catch (error) {
      // The last reading stays and turns stale after staleAfter.
      Log.warn(entity + ": " + error.message);
    }
  }
});

/*
  Polls the state of each instance's Home Assistant entity over the REST
  API and forwards value and report time. Runs on the server so that the
  token never reaches the browser.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
  start () {
    this.timers = new Map();
  },

  stop () {
    this.timers.forEach((timer) => clearInterval(timer));
  },

  socketNotificationReceived (notification, payload) {
    if (notification !== "RING_GAUGE_START") {
      return;
    }
    // A reloaded browser registers the same instance again.
    clearInterval(this.timers.get(payload.identifier));
    const poll = () => this.poll(payload);
    poll();
    this.timers.set(payload.identifier, setInterval(poll, payload.updateInterval));
  },

  async poll ({ identifier, host, port, useTLS, token, entity }) {
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
        identifier,
        value: Number.isFinite(value) ? value : null,
        // Also refreshed when the sensor reports an unchanged value.
        reportedAt: Date.parse(state.last_reported || state.last_updated)
      });
    } catch (error) {
      // The last reading stays and turns stale after staleAfter.
      Log.warn("[MMM-RingGauge] " + entity + ": " + error.message);
    }
  }
});

/*
  Pure logic that maps a notification of any source onto the gauge's
  fields and decides whether the gauge counts as unavailable. No DOM and
  no MagicMirror: the browser loads this file through getScripts() as the
  global RingGaugeSource, tests require() it.

  Names no source: the notification, the payload paths and any mapping
  function come from the config of each instance.
 */

(function (root, factory) {
  const source = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = source;
  }
  // Set in the browser even if it has `module` (Electron's nodeIntegration).
  root.RingGaugeSource = source;
})(this, function () {
  const FIELDS = ["value", "unit", "quantity", "reportedAt", "available"];

  // Epoch values below this are seconds: 1e12 ms is in 2001, 1e12 s is
  // tens of thousands of years ahead.
  const EPOCH_MS_FROM = 1e12;

  function isObject (value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  // Follows a dot path ("a.b.0.c"); found is false if a step is missing.
  function getPath (payload, path) {
    let current = payload;
    for (const key of String(path).split(".")) {
      if (current === null || typeof current !== "object" || !(key in current)) {
        return { found: false, value: undefined };
      }
      current = current[key];
    }
    return { found: true, value: current };
  }

  // Every path in `match` equals its value. Without `match`, true.
  function matches (payload, match) {
    if (!isObject(match)) {
      return true;
    }
    return Object.entries(match).every(([path, expected]) => {
      const { found, value } = getPath(payload, path);
      return found && value === expected;
    });
  }

  // A finite number, or a string that holds one; otherwise null.
  function toNumber (value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    return null;
  }

  // Epoch ms, epoch s or an ISO string as epoch ms; otherwise null.
  function toTimestamp (value) {
    const number = toNumber(value);
    if (number !== null) {
      return Math.abs(number) < EPOCH_MS_FROM ? number * 1000 : number;
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  // Configuration errors of an instance, one message each; empty if valid.
  function configProblems (options) {
    const problems = [];
    if (typeof options.notification !== "string" || options.notification === "") {
      problems.push("`notification` is missing");
    }
    const hasTransform = options.transform !== undefined && options.transform !== null;
    if (hasTransform && typeof options.transform !== "function") {
      problems.push("`transform` is not a function; it needs MagicMirror² 2.36 or newer");
    }
    const valuePath = isObject(options.fields) ? options.fields.value : undefined;
    if (!hasTransform && (typeof valuePath !== "string" || valuePath === "")) {
      problems.push("neither `fields.value` nor `transform` is set");
    }
    const connection = options.connection;
    if (connection !== undefined && connection !== null) {
      if (!isObject(connection)) {
        problems.push("`connection` is not an object");
      } else {
        if (typeof connection.notification !== "string" || connection.notification === "") {
          problems.push("`connection.notification` is missing");
        }
        const hasConnectionTransform = connection.transform !== undefined && connection.transform !== null;
        if (hasConnectionTransform && typeof connection.transform !== "function") {
          problems.push("`connection.transform` is not a function; it needs MagicMirror² 2.36 or newer");
        }
        if (!hasConnectionTransform
          && (typeof connection.connected !== "string" || connection.connected === "")) {
          problems.push("neither `connection.connected` nor `connection.transform` is set");
        }
      }
    }
    return problems;
  }

  // Normalizes the raw fields of a reading. A reading is valid if its value
  // is a number and it is not marked unavailable.
  function normalize (raw, options, now) {
    const value = toNumber(raw.value);
    const reportedAt = toTimestamp(raw.reportedAt);
    const unit = typeof raw.unit === "string" && raw.unit !== "" ? raw.unit : (options.unit || "");
    const quantity = typeof raw.quantity === "string" && raw.quantity !== ""
      ? raw.quantity
      : (options.quantity || "");
    return {
      value,
      unit,
      quantity,
      reportedAt: reportedAt === null ? now : reportedAt,
      valid: value !== null && raw.available !== false
    };
  }

  // Maps one notification onto a reading.
  //   { reading, problems }  reading is null if the notification does not
  //                          count for this instance
  // problems name what went wrong, each with a stable key so that the
  // module can log each one once.
  function readNotification (options, notification, payload, now) {
    if (notification !== options.notification) {
      return { reading: null, problems: [] };
    }
    if (typeof options.transform === "function") {
      let raw;
      try {
        raw = options.transform(payload);
      } catch (error) {
        return { reading: null, problems: [{ key: "transform-threw", message: "`transform` threw: " + error }] };
      }
      if (raw === null) {
        return { reading: null, problems: [] };
      }
      if (!isObject(raw)) {
        return {
          reading: null,
          problems: [{
            key: "transform-result",
            message: "`transform` returned " + describe(raw) + " instead of an object or null"
          }]
        };
      }
      return { reading: normalize(raw, options, now), problems: [] };
    }
    if (!matches(payload, options.match)) {
      return { reading: null, problems: [] };
    }
    const fields = isObject(options.fields) ? options.fields : {};
    const raw = {};
    const problems = [];
    for (const field of FIELDS) {
      const path = fields[field];
      if (typeof path !== "string" || path === "") {
        continue;
      }
      const { found, value } = getPath(payload, path);
      if (found) {
        raw[field] = value;
      } else {
        problems.push({
          key: "path:" + field,
          message: "path \"" + path + "\" of `fields." + field + "` not found in " + notification
        });
      }
    }
    return { reading: normalize(raw, options, now), problems };
  }

  // Maps one notification onto the state of the connection.
  //   { connected, problems }  connected is true, false, or null if the
  //                            notification says nothing about it
  function readConnection (connection, notification, payload) {
    if (!isObject(connection) || notification !== connection.notification) {
      return { connected: null, problems: [] };
    }
    if (typeof connection.transform === "function") {
      let result;
      try {
        result = connection.transform(payload);
      } catch (error) {
        return {
          connected: null,
          problems: [{ key: "connection-transform-threw", message: "`connection.transform` threw: " + error }]
        };
      }
      if (result === true || result === false || result === null) {
        return { connected: result, problems: [] };
      }
      return {
        connected: null,
        problems: [{
          key: "connection-transform-result",
          message: "`connection.transform` returned " + describe(result) + " instead of true, false or null"
        }]
      };
    }
    if (!matches(payload, connection.match)) {
      return { connected: null, problems: [] };
    }
    const { found, value } = getPath(payload, connection.connected);
    if (!found) {
      return {
        connected: null,
        problems: [{
          key: "connection-path",
          message: "path \"" + connection.connected + "\" of `connection.connected` not found in " + notification
        }]
      };
    }
    return { connected: typeof value === "boolean" ? value : null, problems: [] };
  }

  function describe (value) {
    if (value === undefined) {
      return "undefined";
    }
    if (Array.isArray(value)) {
      return "an array";
    }
    return JSON.stringify(value);
  }

  // Whether the gauge counts as unavailable at `now`, and when that can
  // change without a new notification (null if never).
  //   lastValid          { value, reportedAt } of the last valid reading
  //   readingUnavailable the latest reading was invalid
  //   disconnectedSince  time the connection reported false, or null
  // Without staleAfter (undefined or null) a value never turns stale.
  function availability (state, options, now) {
    const graceAfter = Number.isFinite(options.graceAfter) ? options.graceAfter : 0;
    const staleAfter = Number.isFinite(options.staleAfter) ? options.staleAfter : null;
    const deadlines = [];
    let unavailable = state.readingUnavailable === true;

    if (state.disconnectedSince !== null && state.disconnectedSince !== undefined) {
      const until = state.disconnectedSince + graceAfter;
      if (now >= until) {
        unavailable = true;
      } else {
        deadlines.push(until);
      }
    }
    if (staleAfter !== null && state.lastValid) {
      const until = state.lastValid.reportedAt + staleAfter;
      if (now > until) {
        unavailable = true;
      } else {
        // The age counts as beyond staleAfter one millisecond later.
        deadlines.push(until + 1);
      }
    }
    return {
      unavailable,
      nextCheck: unavailable || deadlines.length === 0 ? null : Math.min(...deadlines)
    };
  }

  return {
    getPath,
    matches,
    toNumber,
    toTimestamp,
    configProblems,
    readNotification,
    readConnection,
    availability
  };
});

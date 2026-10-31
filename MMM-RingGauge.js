/*
  MMM-RingGauge: one reading as a three-quarter ring with colored bands, a
  marker and a status word. Several instances can show different readings.
  Each instance takes its reading from the notification its config names;
  the module fetches nothing and knows no source.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKER_DURATION = 600;
// setTimeout fires at once for a longer delay; a later check waits in steps.
const MAX_TIMER_DELAY = 2 ** 31 - 1;

// Outline icons on a 24 × 24 grid, stroked with currentColor.
const ICONS = {
  co2: "<circle cx='12' cy='12' r='3.2'/><circle cx='4' cy='12' r='2'/><circle cx='20' cy='12' r='2'/><path d='M6 12h2.8M15.2 12H18'/>",
  humidity: "<path d='M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11z'/>",
  temperature: "<path d='M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z'/><path d='M12 9v7'/>"
};

// Shown in place of the status word while no current value is available.
const LINK_BROKEN = "<path d='M11.5 7.5L14 5a3.54 3.54 0 0 1 5 5l-2.5 2.5'/><path d='M12.5 16.5L10 19a3.54 3.54 0 0 1-5-5l2.5-2.5'/><path d='M8.5 8.5l-2-2M15.5 15.5l2 2M11 5V3M5 11H3M13 19v2M19 13h2'/>";

Module.register("MMM-RingGauge", {
  // A function in config.js reaches the browser only from 2.36 on.
  requiresVersion: "2.36.0",

  // No default names a source: each instance maps its own.
  defaults: {
    notification: "",
    match: null,
    fields: {},
    transform: null,
    unit: "",
    quantity: "",
    connection: null,
    staleAfter: null,
    label: "",
    icon: "",
    min: 0,
    max: 100,
    // Contiguous from min to max: [{ to, level: "good" | "warn" | "bad", text }].
    bands: [],
    decimals: 0
  },

  // Band lookup and geometry as the global RingGaugeLogic; mapping and
  // availability as the global RingGaugeSource.
  getScripts () {
    return [this.file("gauge-logic.js"), this.file("source-mapping.js")];
  },

  getStyles () {
    return ["MMM-RingGauge.css"];
  },

  getTranslations () {
    return {
      en: "translations/en.json",
      de: "translations/de.json"
    };
  },

  start () {
    this.logged = new Set();
    for (const problem of RingGaugeSource.configProblems(this.config)) {
      this.logOnce("config:" + problem, problem);
    }
    this.bands = this.validBands();
    this.lastValid = null;
    this.readingUnavailable = false;
    this.disconnectedSince = null;
    this.timer = null;
    this.markerAngle = null;
    this.rendered = {};
    this.dom = this.buildDom();
  },

  notificationReceived (notification, payload) {
    const now = Date.now();
    let changed = false;

    const { reading, problems } = RingGaugeSource.readNotification(this.config, notification, payload, now);
    this.logProblems(problems);
    if (reading !== null) {
      changed = true;
      if (reading.valid) {
        this.lastValid = reading;
        this.readingUnavailable = false;
        // A source that delivers a valid value is connected.
        this.disconnectedSince = null;
      } else {
        // Never replaces the last valid value.
        this.readingUnavailable = true;
      }
    }

    const connection = RingGaugeSource.readConnection(this.config.connection, notification, payload);
    this.logProblems(connection.problems);
    if (connection.connected === true) {
      changed = true;
      this.disconnectedSince = null;
    } else if (connection.connected === false && this.disconnectedSince === null) {
      changed = true;
      this.disconnectedSince = now;
    }

    if (changed) {
      this.render();
    }
  },

  getDom () {
    this.render();
    return this.dom.root;
  },

  // The name an instance goes by in the log.
  instanceName () {
    return this.config.label || this.config.notification || this.identifier;
  },

  logOnce (key, message) {
    if (this.logged.has(key)) {
      return;
    }
    this.logged.add(key);
    Log.error(this.name + " (" + this.instanceName() + "): " + message);
  },

  logProblems (problems) {
    for (const { key, message } of problems) {
      this.logOnce(key, message);
    }
  },

  buildDom () {
    const root = document.createElement("div");
    root.className = "ring-gauge";

    const { CENTER, RADIUS, START_ANGLE } = RingGaugeLogic;
    const svg = this.svgElement("svg", { class: "ring-gauge-scale", viewBox: "0 0 210 210" });
    const geometry = RingGaugeLogic.segmentGeometry(this.bands, this.config.min, this.config.max);
    const segments = this.bands.map((band, index) => {
      const segment = this.svgElement("circle", {
        class: "ring-gauge-segment ring-gauge-" + band.level,
        cx: CENTER,
        cy: CENTER,
        r: RADIUS,
        "stroke-dasharray": geometry[index].dashLength + " 1000",
        "stroke-dashoffset": geometry[index].dashOffset,
        transform: "rotate(" + START_ANGLE + " " + CENTER + " " + CENTER + ")"
      });
      svg.appendChild(segment);
      return segment;
    });
    const marker = this.svgElement("circle", { class: "ring-gauge-marker", r: 8 });
    svg.appendChild(marker);
    root.appendChild(svg);

    const center = document.createElement("div");
    center.className = "ring-gauge-center";
    const head = document.createElement("div");
    head.className = "ring-gauge-head";
    if (ICONS[this.config.icon]) {
      const icon = this.svgElement("svg", { class: "ring-gauge-icon", viewBox: "0 0 24 24" });
      icon.innerHTML = ICONS[this.config.icon];
      head.appendChild(icon);
    }
    const label = document.createElement("span");
    label.textContent = this.config.label;
    head.appendChild(label);
    const value = this.textElement("ring-gauge-value");
    const unit = this.textElement("ring-gauge-unit", this.config.unit);
    const status = this.textElement("ring-gauge-status");
    const unavailable = this.svgElement("svg", { class: "ring-gauge-icon ring-gauge-unavailable-icon", viewBox: "0 0 24 24" });
    unavailable.innerHTML = LINK_BROKEN;
    unavailable.style.display = "none";
    center.append(head, value, unit, status, unavailable);
    root.appendChild(center);

    return { root, segments, marker, value, unit, status, unavailable };
  },

  // Logs each configuration error of the bands once and returns the bands
  // the gauge can draw. Invalid bands do not stop the value and marker.
  validBands () {
    for (const problem of RingGaugeLogic.bandProblems(this.config.bands, this.config.max)) {
      this.logOnce("bands:" + problem, problem);
    }
    const bands = Array.isArray(this.config.bands) ? this.config.bands : [];
    // Without a numeric `to`, the band has no place on the arc, and the
    // following segments would get NaN geometry.
    return bands.filter((band) => band !== null && typeof band === "object" && Number.isFinite(band.to));
  },

  svgElement (name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
    return element;
  },

  textElement (className, text = "") {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  },

  // Rechecks when availability can change without a notification: at the
  // end of the grace period or when the last valid value turns stale.
  schedule (nextCheck, now) {
    clearTimeout(this.timer);
    this.timer = nextCheck === null ? null : setTimeout(() => this.render(), Math.min(nextCheck - now, MAX_TIMER_DELAY));
  },

  render () {
    const now = Date.now();
    const value = this.lastValid === null ? null : this.lastValid.value;
    const { unavailable: lost, nextCheck } = RingGaugeSource.availability({
      lastValid: this.lastValid,
      readingUnavailable: this.readingUnavailable,
      disconnectedSince: this.disconnectedSince
    }, {
      graceAfter: this.config.connection ? this.config.connection.graceAfter : 0,
      staleAfter: this.config.staleAfter
    }, now);
    this.schedule(nextCheck, now);
    // Without any valid value the gauge shows "—" whatever the cause.
    const unavailable = value !== null && lost;
    const unit = this.lastValid === null ? this.config.unit : this.lastValid.unit;
    const band = value === null ? -1 : RingGaugeLogic.bandIndex(this.bands, value, this.config.max);
    const state = { value, unavailable, band, unit };
    if (Object.keys(state).every((key) => state[key] === this.rendered[key])) {
      return;
    }
    this.rendered = state;

    const { root, segments, marker, status } = this.dom;
    root.classList.toggle("ring-gauge-unavailable", unavailable);
    segments.forEach((segment, index) => {
      segment.classList.toggle("ring-gauge-active", index === band);
    });
    this.dom.value.textContent = value === null
      ? "—"
      : new Intl.NumberFormat(config.locale, {
        minimumFractionDigits: this.config.decimals,
        maximumFractionDigits: this.config.decimals,
        useGrouping: false
      }).format(value);
    this.dom.unit.textContent = unit;

    // While unavailable the symbol takes the place of the status word.
    status.style.display = unavailable ? "none" : "";
    this.dom.unavailable.style.display = unavailable ? "" : "none";
    status.className = "ring-gauge-status";
    if (value === null || unavailable || band === -1) {
      // Without bands there is no assessment; value and marker still show.
      status.textContent = "";
    } else {
      const { text, level } = this.bands[band];
      status.textContent = text ?? "";
      if (RingGaugeLogic.LEVELS.includes(level)) {
        status.classList.add("ring-gauge-" + level);
      }
    }

    marker.style.display = value === null ? "none" : "";
    if (value !== null) {
      this.moveMarker(RingGaugeLogic.markerAngle(value, this.config.min, this.config.max));
    }
  },

  // Moves along the arc: the angle is interpolated, not the position.
  moveMarker (target) {
    const { CENTER, RADIUS } = RingGaugeLogic;
    const place = (angle) => {
      const radians = angle * Math.PI / 180;
      this.dom.marker.setAttribute("cx", (CENTER + RADIUS * Math.cos(radians)).toFixed(2));
      this.dom.marker.setAttribute("cy", (CENTER + RADIUS * Math.sin(radians)).toFixed(2));
      this.markerAngle = angle;
    };
    cancelAnimationFrame(this.markerFrame);
    if (this.markerAngle === null) {
      place(target);
      return;
    }
    const from = this.markerAngle;
    const started = performance.now();
    const step = (now) => {
      const progress = Math.min((now - started) / MARKER_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      place(from + (target - from) * eased);
      if (progress < 1) {
        this.markerFrame = requestAnimationFrame(step);
      }
    };
    this.markerFrame = requestAnimationFrame(step);
  }
});

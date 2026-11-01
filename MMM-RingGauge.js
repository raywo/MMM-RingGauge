/*
  MMM-RingGauge: readings as three-quarter rings with colored bands, a
  marker and a status word. An instance shows one ring, or with `rings` a
  group of rings in one row. Each ring takes its reading from the
  notification its options name; the module fetches nothing and knows no
  source.
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

// `layout.align` as the row's justify-content.
const ALIGNMENTS = { start: "flex-start", center: "center", end: "flex-end" };

// Shown in place of the status word while no current value is available.
const LINK_BROKEN = "<path d='M11.5 7.5L14 5a3.54 3.54 0 0 1 5 5l-2.5 2.5'/><path d='M12.5 16.5L10 19a3.54 3.54 0 0 1-5-5l2.5-2.5'/><path d='M8.5 8.5l-2-2M15.5 15.5l2 2M11 5V3M5 11H3M13 19v2M19 13h2'/>";

/*
  One ring: its reading, availability, settings, DOM and marker. The
  module creates one per entry in `rings`, or one from its own options.
  `gauge` is the module instance, for translations and the log; `index`
  is the ring's place in `rings`, null without `rings`.
 */
class RingGaugeRing {
  constructor (gauge, options, index) {
    this.gauge = gauge;
    this.config = options;
    this.index = index;
    // Keeps the log entries of the rings in a group apart.
    this.logKey = index === null ? "" : "ring" + index + ":";
    for (const problem of RingGaugeSource.configProblems(options)) {
      this.logOnce("config:" + problem, problem);
    }
    this.units = options.units ?? config.units;
    this.lastValid = null;
    this.readingUnavailable = false;
    this.disconnectedSince = null;
    this.timer = null;
    this.markerAngle = null;
    this.markerFrame = null;
    this.rendered = {};
    this.settings = null;
    this.dom = this.buildDom();
    this.settingsKey = null;
    this.settingsReported = false;
    const reading = { quantity: options.quantity || "", unit: options.unit || "" };
    this.applySettings(reading, !this.settingsPending());
  }

  static svgElement (name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
    return element;
  }

  static textElement (className, text = "") {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  // Whether the browser accepts a band's `color`; var(--…) passes, so
  // that a theme can set it.
  static isColor (value) {
    return CSS.supports("color", value);
  }

  // The name the ring goes by in the log. Without a label, the rings of
  // a group often share their notification; their place tells them apart.
  name () {
    const label = this.settings ? this.settings.label : this.config.label;
    if (label) {
      return label;
    }
    const name = this.config.notification || this.gauge.identifier;
    return this.index === null ? name : name + ", ring " + this.index;
  }

  logOnce (key, message, level = "error") {
    this.gauge.logOnce(this.logKey + key, this.name(), message, level);
  }

  logProblems (problems) {
    for (const { key, message, level } of problems) {
      this.logOnce(key, message, level);
    }
  }

  // Takes what the notification holds for this ring. Returns whether the
  // ring has to render.
  receive (notification, payload, now) {
    let changed = false;

    const { reading, problems } = RingGaugeSource.readNotification(this.config, notification, payload, now);
    this.logProblems(problems);
    if (reading !== null) {
      changed = true;
      if (reading.valid) {
        // Only a valid reading decides the settings: the last valid value
        // is converted by them, and an unavailable reading may lack its
        // quantity and unit.
        this.applySettings(reading, true);
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

    return changed;
  }

  // Whether the mapping may still bring the quantity, or a temperature's
  // unit, that decides the settings. Their problems are then logged once a
  // reading shows which settings apply, not for a guess at start.
  settingsPending () {
    const fields = this.config.fields !== null && typeof this.config.fields === "object" ? this.config.fields : {};
    const maySupply = (field) => typeof this.config.transform === "function"
      || (typeof fields[field] === "string" && fields[field] !== "");
    if (!this.config.quantity) {
      return maySupply("quantity");
    }
    return this.config.quantity === "temperature" && !this.config.unit && maySupply("unit");
  }

  // Takes scale, bands, label and icon for the reading's quantity and
  // unit from the options and the preset, and redraws them in the
  // existing DOM when they change. With `report`, logs their problems
  // once.
  applySettings (reading, report) {
    const key = RingGaugePresets.settingsKey(reading);
    if (key === this.settingsKey && (this.settingsReported || !report)) {
      return;
    }
    const settings = RingGaugePresets.settings(this.config, reading, this.units, (text) => this.gauge.translate(text));
    if (key !== this.settingsKey) {
      this.settingsKey = key;
      this.settings = settings;
      this.scaleValid = Number.isFinite(settings.min) && Number.isFinite(settings.max);
      // Without a scale the bands have no place on the arc.
      this.bands = this.scaleValid ? this.drawableBands(settings.bands) : [];
      this.drawSettings();
      this.rendered = {};
    }
    if (report) {
      this.settingsReported = true;
      this.logProblems(settings.problems);
      for (const problem of RingGaugeLogic.bandProblems(settings.bands, settings.max, RingGaugeRing.isColor)) {
        this.logOnce("bands:" + problem, problem);
      }
    }
  }

  buildDom () {
    const { svgElement, textElement } = RingGaugeRing;
    const root = document.createElement("div");
    root.className = "ring-gauge";

    // Segments, icon and label follow the settings: drawSettings().
    const svg = svgElement("svg", { class: "ring-gauge-scale", viewBox: "0 0 210 210" });
    const marker = svgElement("circle", { class: "ring-gauge-marker", r: 9 });
    svg.appendChild(marker);
    root.appendChild(svg);

    const center = document.createElement("div");
    center.className = "ring-gauge-center";
    const head = document.createElement("div");
    head.className = "ring-gauge-head";
    const icon = svgElement("svg", { class: "ring-gauge-icon", viewBox: "0 0 24 24" });
    icon.style.display = "none";
    head.appendChild(icon);
    const label = document.createElement("span");
    head.appendChild(label);
    const value = textElement("ring-gauge-value");
    const unit = textElement("ring-gauge-unit", this.config.unit);
    const status = textElement("ring-gauge-status");
    const unavailable = svgElement("svg", { class: "ring-gauge-icon ring-gauge-unavailable-icon", viewBox: "0 0 24 24" });
    unavailable.innerHTML = LINK_BROKEN;
    unavailable.style.display = "none";
    center.append(head, value, unit, status, unavailable);
    root.appendChild(center);

    return { root, svg, segments: [], marker, icon, label, value, unit, status, unavailable };
  }

  // The bands the ring can draw. Invalid bands do not stop the value and
  // marker.
  drawableBands (bands) {
    // Without a numeric `to`, the band has no place on the arc, and the
    // following segments would get NaN geometry.
    return (Array.isArray(bands) ? bands : [])
      .filter((band) => band !== null && typeof band === "object" && Number.isFinite(band.to));
  }

  // Replaces the segments and sets icon and label; the marker and the
  // rest of the DOM stay.
  drawSettings () {
    const { CENTER, RADIUS, START_ANGLE } = RingGaugeLogic;
    const { svg, marker, icon, label } = this.dom;
    for (const segment of this.dom.segments) {
      svg.removeChild(segment);
    }
    const geometry = RingGaugeLogic.segmentGeometry(this.bands, this.settings.min, this.settings.max);
    this.paints = this.bands.map((band) => RingGaugeLogic.bandPaint(band, RingGaugeRing.isColor));
    // Without a valid paint the segment has no stroke: a gap.
    this.dom.segments = this.paints.map((paint, index) => {
      const segment = RingGaugeRing.svgElement("circle", {
        class: "ring-gauge-segment" + (paint?.level ? " ring-gauge-" + paint.level : ""),
        cx: CENTER,
        cy: CENTER,
        r: RADIUS,
        "stroke-dasharray": geometry[index].dashLength + " 1000",
        "stroke-dashoffset": geometry[index].dashOffset,
        transform: "rotate(" + START_ANGLE + " " + CENTER + " " + CENTER + ")"
      });
      if (paint?.color) {
        segment.style.stroke = paint.color;
      }
      // Below the marker, which stays on top.
      svg.insertBefore(segment, marker);
      return segment;
    });
    const shape = Object.hasOwn(ICONS, this.settings.icon) ? ICONS[this.settings.icon] : "";
    icon.innerHTML = shape;
    icon.style.display = shape === "" ? "none" : "";
    label.textContent = this.settings.label;
  }

  // Rechecks when availability can change without a notification: at the
  // end of the grace period or when the last valid value turns stale.
  schedule (nextCheck, now) {
    clearTimeout(this.timer);
    this.timer = nextCheck === null ? null : setTimeout(() => this.render(), Math.min(nextCheck - now, MAX_TIMER_DELAY));
  }

  render () {
    const now = Date.now();
    // In the displayed unit; scale and bands are in it too.
    const value = this.lastValid === null ? null : this.settings.convert(this.lastValid.value);
    const { unavailable: lost, nextCheck } = RingGaugeSource.availability({
      lastValid: this.lastValid,
      readingUnavailable: this.readingUnavailable,
      disconnectedSince: this.disconnectedSince
    }, {
      graceAfter: this.config.connection ? this.config.connection.graceAfter : 0,
      staleAfter: this.config.staleAfter
    }, now);
    this.schedule(nextCheck, now);
    // Without any valid value the ring shows "—" whatever the cause.
    const unavailable = value !== null && lost;
    const unit = this.settings.unit ?? (this.lastValid === null ? this.config.unit : this.lastValid.unit);
    // Assessed as shown, so that one number never gets two status words;
    // the marker keeps the exact value.
    const band = value === null
      ? -1
      : RingGaugeLogic.bandIndex(this.bands, RingGaugeLogic.roundToDecimals(value, this.config.decimals), this.settings.max);
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
    status.style.color = "";
    if (value === null || unavailable || band === -1) {
      // Without bands there is no assessment; value and marker still show.
      status.textContent = "";
    } else {
      const text = this.bands[band].text;
      const paint = this.paints[band];
      status.textContent = text ?? "";
      if (paint?.level) {
        status.classList.add("ring-gauge-" + paint.level);
      } else if (paint?.color) {
        status.style.color = paint.color;
      }
    }

    // Without a scale the marker has no place on the arc.
    const placed = value !== null && this.scaleValid;
    marker.style.display = placed ? "" : "none";
    if (placed) {
      this.moveMarker(RingGaugeLogic.markerAngle(value, this.settings.min, this.settings.max));
    }
  }

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
}

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
    // null takes the part from the preset of the reading's quantity.
    label: null,
    icon: null,
    min: null,
    max: null,
    // Contiguous from min to max:
    // [{ to, level: "good" | "warn" | "bad" | "cold", color, text }].
    bands: null,
    decimals: 0,
    // "metric" or "imperial"; null follows the mirror's `units`.
    units: null,
    // A group: one ring per entry, each with the options above. The
    // options above are the defaults every entry overrides. null shows
    // one ring from the options above.
    rings: null,
    // The row of a group. null leaves gap and maximum width to the CSS.
    layout: { wrap: true, gap: null, maxWidth: null, align: "start" }
  },

  // Band lookup and geometry as the global RingGaugeLogic; mapping and
  // availability as the global RingGaugeSource; presets and unit
  // conversion as the global RingGaugePresets.
  getScripts () {
    return [this.file("gauge-logic.js"), this.file("source-mapping.js"), this.file("presets.js")];
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
    this.rings = this.ringOptions().map(({ options, index }) => new RingGaugeRing(this, options, index));
    this.root = this.buildRow();
  },

  // The options of every ring: the module's own, overridden by an entry
  // in `rings`. An entry replaces an option as a whole, e.g. all of
  // `fields`.
  ringOptions () {
    const { rings, layout: _layout, ...defaults } = this.config;
    if (rings === null || rings === undefined) {
      return [{ options: defaults, index: null }];
    }
    if (!Array.isArray(rings) || rings.length === 0) {
      this.logOnce("rings", this.instanceName(), "`rings` is not a list of rings; showing one ring from the options outside `rings`");
      return [{ options: defaults, index: null }];
    }
    const list = [];
    rings.forEach((ring, index) => {
      if (ring === null || typeof ring !== "object" || Array.isArray(ring)) {
        this.logOnce("rings:" + index, this.instanceName(), "ring " + index + " in `rings` is not an object");
        return;
      }
      list.push({ options: { ...defaults, ...ring }, index });
    });
    if (list.length === 0) {
      this.logOnce("rings", this.instanceName(), "`rings` holds no ring; showing one ring from the options outside `rings`");
      return [{ options: defaults, index: null }];
    }
    return list;
  },

  // The row that holds the rings; with one ring it holds only that one.
  buildRow () {
    const row = document.createElement("div");
    row.className = "ring-gauge-row";
    const layout = this.config.layout ?? {};
    if (typeof layout !== "object" || Array.isArray(layout)) {
      this.logOnce("layout", this.instanceName(), "`layout` is not an object");
    } else {
      if (layout.wrap === false) {
        row.style.flexWrap = "nowrap";
      }
      this.applyLength(row, "gap", "gap", layout.gap);
      this.applyLength(row, "maxWidth", "max-width", layout.maxWidth);
      this.applyAlign(row, layout.align);
    }
    for (const ring of this.rings) {
      row.appendChild(ring.dom.root);
    }
    return row;
  },

  // Aligns the rings of each row, and so a last row with fewer rings.
  applyAlign (row, align) {
    if (align === null || align === undefined || align === "start") {
      return;
    }
    if (!Object.hasOwn(ALIGNMENTS, align)) {
      this.logOnce("layout:align", this.instanceName(), "`layout.align` " + JSON.stringify(align) + " is not one of start, center, end");
      return;
    }
    row.style.justifyContent = ALIGNMENTS[align];
  },

  // Sets a length from `layout` if the browser accepts it, e.g. "2rem".
  applyLength (row, option, property, value) {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value !== "string" || !CSS.supports(property, value)) {
      this.logOnce("layout:" + option, this.instanceName(), "`layout." + option + "` " + JSON.stringify(value) + " is not a CSS length, e.g. \"2rem\"");
      return;
    }
    row.style[option] = value;
  },

  notificationReceived (notification, payload) {
    const now = Date.now();
    for (const ring of this.rings) {
      if (ring.receive(notification, payload, now)) {
        ring.render();
      }
    }
  },

  getDom () {
    for (const ring of this.rings) {
      ring.render();
    }
    return this.root;
  },

  // The name the instance goes by in the log, for problems of the group.
  instanceName () {
    return this.config.label || this.config.notification || this.identifier;
  },

  logOnce (key, name, message, level = "error") {
    if (this.logged.has(key)) {
      return;
    }
    this.logged.add(key);
    Log[level](this.name + " (" + name + "): " + message);
  }
});

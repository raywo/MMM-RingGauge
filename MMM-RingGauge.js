/*
  MMM-RingGauge: one Home Assistant sensor as a three-quarter ring with
  colored bands, a marker and a status word. Several instances can show
  different sensors.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

// Geometry in SVG user units; the SVG scales with --ring-gauge-size.
const CENTER = 105;
const RADIUS = 78;
const START_ANGLE = 135;
const SWEEP = 270;
const ARC_LENGTH = 2 * Math.PI * RADIUS * (SWEEP / 360);
const SEGMENT_GAP = 5;
const MARKER_DURATION = 600;

// Outline icons on a 24 × 24 grid, stroked with currentColor.
const ICONS = {
  co2: "<circle cx='12' cy='12' r='3.2'/><circle cx='4' cy='12' r='2'/><circle cx='20' cy='12' r='2'/><path d='M6 12h2.8M15.2 12H18'/>",
  humidity: "<path d='M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11z'/>",
  temperature: "<path d='M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z'/><path d='M12 9v7'/>"
};

Module.register("MMM-RingGauge", {
  defaults: {
    host: "",
    port: 8123,
    useTLS: false,
    token: "",
    entity: "",
    label: "",
    unit: "",
    icon: "",
    min: 0,
    max: 100,
    // Contiguous from min to max: [{ to, level: "good" | "warn" | "bad", text }].
    bands: [],
    decimals: 0,
    updateInterval: 30 * 1000,
    staleAfter: 10 * 60 * 1000
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
    this.reading = null;
    this.markerAngle = null;
    this.rendered = {};
    this.dom = this.buildDom();
    // Only the entity: the helper takes the connection from the
    // server-side config, never from the browser.
    this.sendSocketNotification("RING_GAUGE_START", { entity: this.config.entity });
    // A reading turns stale without any new message.
    setInterval(() => this.render(), 30 * 1000);
  },

  socketNotificationReceived (notification, payload) {
    if (notification === "RING_GAUGE_READING" && payload.entity === this.config.entity) {
      this.reading = payload;
      this.render();
    }
  },

  getDom () {
    this.render();
    return this.dom.root;
  },

  buildDom () {
    const root = document.createElement("div");
    root.className = "ring-gauge";

    const svg = this.svgElement("svg", { class: "ring-gauge-scale", viewBox: "0 0 210 210" });
    const span = this.config.max - this.config.min;
    let from = this.config.min;
    const segments = this.config.bands.map((band) => {
      const share = (Math.min(band.to, this.config.max) - from) / span;
      const offset = (from - this.config.min) / span;
      from = band.to;
      const segment = this.svgElement("circle", {
        class: "ring-gauge-segment ring-gauge-" + band.level,
        cx: CENTER,
        cy: CENTER,
        r: RADIUS,
        "stroke-dasharray": (share * ARC_LENGTH - SEGMENT_GAP) + " 1000",
        "stroke-dashoffset": -(offset * ARC_LENGTH + SEGMENT_GAP / 2),
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
    center.append(head, value, unit, status);
    root.appendChild(center);

    return { root, segments, marker, value, status };
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

  // Values beyond the range take the outermost band.
  bandIndex (value) {
    const index = this.config.bands.findIndex((band) => value < band.to);
    return index === -1 ? this.config.bands.length - 1 : index;
  },

  render () {
    const value = this.reading && Number.isFinite(this.reading.value) ? this.reading.value : null;
    const stale = value !== null && Date.now() - this.reading.reportedAt > this.config.staleAfter;
    const band = value === null ? -1 : this.bandIndex(value);
    const state = { value, stale, band };
    if (Object.keys(state).every((key) => state[key] === this.rendered[key])) {
      return;
    }
    this.rendered = state;

    const { root, segments, marker, status } = this.dom;
    root.classList.toggle("ring-gauge-stale", stale);
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

    status.className = "ring-gauge-status";
    if (value === null) {
      status.textContent = "";
    } else if (stale) {
      status.textContent = this.translate("STALE");
    } else {
      status.textContent = this.config.bands[band].text;
      status.classList.add("ring-gauge-" + this.config.bands[band].level);
    }

    marker.style.display = value === null ? "none" : "";
    if (value !== null) {
      const span = this.config.max - this.config.min;
      const fraction = Math.min(Math.max((value - this.config.min) / span, 0), 1);
      this.moveMarker(START_ANGLE + fraction * SWEEP);
    }
  },

  // Moves along the arc: the angle is interpolated, not the position.
  moveMarker (target) {
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

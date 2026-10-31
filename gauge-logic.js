/*
  Pure logic of MMM-RingGauge: band lookup, segment geometry, marker angle
  and staleness. No DOM and no MagicMirror: the browser loads this file
  through getScripts() as the global RingGaugeLogic, tests require() it.
  The geometry follows docs/design.md, "Scale geometry".
 */

(function (root, factory) {
  const logic = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = logic;
  }
  // Set in the browser even if it has `module` (Electron's nodeIntegration).
  root.RingGaugeLogic = logic;
})(this, function () {
  // Geometry in SVG user units; the SVG scales with --ring-gauge-size.
  const CENTER = 105;
  const RADIUS = 78;
  const START_ANGLE = 135;
  const SWEEP = 270;
  const ARC_LENGTH = 2 * Math.PI * RADIUS * (SWEEP / 360);
  const SEGMENT_GAP = 5;

  // Values beyond the range take the outermost band. A value equal to a
  // band's `to` belongs to the next band. Without bands, -1. Bands that
  // end before max cover no value from their end on: -1, so that no other
  // band's status stands for it.
  function bandIndex (bands, value, max) {
    const index = bands.findIndex((band) => value < band.to);
    if (index !== -1) {
      return index;
    }
    const last = bands[bands.length - 1];
    return last !== undefined && last.to >= max ? bands.length - 1 : -1;
  }

  // Dash length and dash offset of each band's segment along the arc. A
  // segment narrower than the gap gets length 0: a negative dash length
  // is invalid SVG, and the browser drops the segment.
  function segmentGeometry (bands, min, max) {
    const span = max - min;
    let from = min;
    return bands.map((band) => {
      const share = (Math.min(band.to, max) - from) / span;
      const offset = (from - min) / span;
      from = band.to;
      return {
        dashLength: Math.max(share * ARC_LENGTH - SEGMENT_GAP, 0),
        dashOffset: -(offset * ARC_LENGTH + SEGMENT_GAP / 2)
      };
    });
  }

  const LEVELS = ["good", "warn", "bad"];

  // Configuration errors of the bands, one message each; empty if valid.
  // Without bands only that one message: the other checks need bands.
  function bandProblems (bands, max) {
    if (!Array.isArray(bands) || bands.length === 0) {
      return ["no bands configured"];
    }
    const problems = [];
    let previous = null;
    bands.forEach((band, index) => {
      if (band === null || typeof band !== "object") {
        problems.push("band " + index + " is not an object");
        return;
      }
      if (!Number.isFinite(band.to)) {
        problems.push("band " + index + ": `to` is not a number");
      } else if (previous !== null && band.to <= previous) {
        problems.push("band " + index + ": `to` " + band.to + " does not ascend from " + previous);
      }
      if (Number.isFinite(band.to)) {
        previous = band.to;
      }
      if (!LEVELS.includes(band.level)) {
        problems.push("band " + index + ": unknown level " + JSON.stringify(band.level)
          + ", expected one of " + LEVELS.join(", "));
      }
    });
    // The end of the last band with a numeric `to`: the gauge draws only
    // those, so a later band without one does not reach max either.
    if (previous !== null && previous < max) {
      problems.push("bands end at " + previous + ", before max " + max);
    }
    return problems;
  }

  // Angle in degrees, clamped to the arc.
  function markerAngle (value, min, max) {
    const fraction = Math.min(Math.max((value - min) / (max - min), 0), 1);
    return START_ANGLE + fraction * SWEEP;
  }

  // Without staleAfter (undefined or null) a value never turns stale: a
  // value that stays the same is valid.
  function isStale (lastValidAt, staleAfter, now) {
    if (staleAfter === undefined || staleAfter === null) {
      return false;
    }
    return now - lastValidAt > staleAfter;
  }

  return {
    CENTER,
    RADIUS,
    START_ANGLE,
    SWEEP,
    ARC_LENGTH,
    SEGMENT_GAP,
    LEVELS,
    bandIndex,
    segmentGeometry,
    bandProblems,
    markerAngle,
    isStale
  };
});

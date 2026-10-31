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
  // band's `to` belongs to the next band. Without bands, -1.
  function bandIndex (bands, value) {
    const index = bands.findIndex((band) => value < band.to);
    return index === -1 ? bands.length - 1 : index;
  }

  // Dash length and dash offset of each band's segment along the arc.
  function segmentGeometry (bands, min, max) {
    const span = max - min;
    let from = min;
    return bands.map((band) => {
      const share = (Math.min(band.to, max) - from) / span;
      const offset = (from - min) / span;
      from = band.to;
      return {
        dashLength: share * ARC_LENGTH - SEGMENT_GAP,
        dashOffset: -(offset * ARC_LENGTH + SEGMENT_GAP / 2)
      };
    });
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
    bandIndex,
    segmentGeometry,
    markerAngle,
    isStale
  };
});

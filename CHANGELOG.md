# Changelog

All notable changes to this module are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the module uses [Semantic Versioning](https://semver.org/): a change
that makes an existing config show something else, or stop working, is
a breaking change and raises the major version.

## 1.0.0 - 2026-11-01

First version.

### Added

- A three-quarter ring per reading with colored bands, a marker that
  moves to each new value, the value with its unit, and a status word.
- Readings from any module that sends notifications: `notification`,
  `match` and dot paths in `fields` map a payload onto value, unit,
  quantity, report time and availability; `transform` takes a function
  for payloads that paths do not cover.
- Presets for CO₂, humidity and temperature with scale, bands, icon,
  label and status texts in English and German; temperatures in the
  mirror's `units`.
- Own scales and bands per instance, with the levels `good`, `warn`,
  `bad` and `cold`, or a CSS color per band.
- A lost connection shown as a dimmed value with a "link broken" symbol:
  from the reading's availability, from a connection notification after
  `graceAfter`, or, with `staleAfter`, from the value's age.
- Several rings in one row with `rings`, wrapped to a further row once
  `layout.maxWidth` is reached.
- Tinted glass behind each ring, frosted with the class
  `ring-gauge-blur`, or one pane behind a whole group with
  `ring-gauge-panel`.
- One message in the browser console per configuration error, without
  stopping the gauge.

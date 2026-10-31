# CLAUDE.md

## What this is

A MagicMirror² module (`MMM-RingGauge`) that shows one reading per
instance as a three-quarter ring with colored bands, a marker and a status
word. Users clone it into `MagicMirror/modules/`.

The visual specification is `docs/design.md`. Follow it; record every
deviation in its last section.

## Target architecture

- The module is independent of any data source: it reacts to
  notifications that carry readings and fetches nothing itself.
- It works with every source that sends a notification. The gauge defines
  its input fields; each instance's config maps a source onto them.
- Never name a source's notification or payload fields in the code, not
  even as a default: that binds the gauge to one source.
- Never ask a source to change its payload for this module; map it in the
  config instead.
- The interim `node_helper.js` that polls Home Assistant is to be removed.
  Do not extend it.

## Rules

- A `node_helper` takes host, port, token and the list of entities from
  the server-side config (`global.config.modules`, or
  `getServerModuleConfig()` for single-instance modules), never from a
  socket message. MagicMirror restores `SECRET_*` placeholders in every
  socket message, so a host from the browser lets anyone who can open the
  mirror send the token to their own server.
- Treat every socket message from the browser as untrusted: accept only
  names that the server-side config lists.
- Readings carry facts only: value, unit, quantity, report time,
  availability. Scale, bands, label, icon and status texts belong to this
  module's config. Never expect a level or assessment from a source: it
  would have to know thresholds and couple to this module.
- Build the DOM once; update existing elements. Do not call
  `updateDom()` for a new value: replacing the DOM breaks the marker
  movement.
- Move the marker by interpolating its angle, never x and y.
- Only touch the DOM when value, band or availability change.
- A value that stays the same is valid: many sensors report only on
  change. Whether a value counts comes from the source (availability in
  the reading, a connection notification).
- Never let a value turn stale by its age unless the instance sets
  `staleAfter`; it is off by default and meant for sources without any
  availability signal. Measure the age from the report time if the source
  sends one, else from the time of receipt.
- Never mark a lost connection before the configured grace period: a
  source may drop briefly, e.g. while Home Assistant restarts.
- No `backdrop-filter`: too slow over large photos on a Raspberry Pi.
- Do not set `font-family`: the gauge takes the mirror's font so that
  themes apply.
- Sizes and colors stay CSS custom properties on `.MMM-RingGauge`.
- Do not reference a theme's variables in the module; themes are bound in
  the user's `custom.css` (see README, "Styling").
- A new user-facing string goes into every file in `translations/`.
- No runtime dependencies; MagicMirror provides `Module`, `Log`, `config`.

## Host pitfalls

- MagicMirror replaces `${VAR}` in `config.js` textually. Unquoted, a
  value keeps its type (`useTLS: ${USE_TLS}` is a boolean); quoted, it
  becomes a string, and `"false"` is truthy.
- `SECRET_*` variables reach the browser only as placeholders and are
  restored for a `node_helper`. A passive module never needs one.

## Open

- **Open:** options that map a source onto the gauge's fields (paths,
  transformation function).
- **Open:** presets per quantity in the module vs. full config per
  instance (proposed: presets in the module, overridable).
- **Open:** status texts in the config or as translation keys per level.
- **Open:** toolchain. Proposed as in WallberryTheme: Biome for linting,
  `node --test` without dependencies, a GitHub workflow for both.
- **Open:** tests for the pure logic (band lookup, angle, staleness);
  needs that logic separated from the DOM.
- **Open:** a `CHANGELOG.md` and a screenshot for the module list.

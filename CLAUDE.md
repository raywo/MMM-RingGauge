# CLAUDE.md

## What this is

A MagicMirror² module (`MMM-RingGauge`) that shows one reading per
instance as a three-quarter ring with colored bands, a marker and a status
word. Users clone it into `MagicMirror/modules/`.

The visual specification is `docs/design.md`. Follow it; record every
deviation in its last section.

## Target architecture

- The module is a passive consumer: it reacts to notifications that carry
  readings and fetches nothing itself.
- The provider (e.g. MMM-HomeAssistantDataProvider) owns the contract.
  Do not add fields to readings here; change the contract there.
- The interim `node_helper.js` that polls Home Assistant is to be removed
  once the provider exists. Do not extend it.

## Rules

- A `node_helper` takes host, port, token and the list of entities from
  the server-side config (`global.config.modules`, or
  `getServerModuleConfig()` for single-instance modules), never from a
  socket message. MagicMirror restores `SECRET_*` placeholders in every
  socket message, so a host from the browser lets anyone who can open the
  mirror send the token to their own server.
- Treat every socket message from the browser as untrusted: accept only
  names that the server-side config lists.
- Readings carry facts only: name, value, unit, quantity, report time,
  availability. Scale, bands, label, icon and status texts belong to this
  module's config. Never expect a level or assessment from the provider:
  it would have to know thresholds and couple to this module.
- Build the DOM once; update existing elements. Do not call
  `updateDom()` for a new value: replacing the DOM breaks the marker
  movement.
- Move the marker by interpolating its angle, never x and y.
- Only touch the DOM when value, band or staleness change.
- Staleness comes from the report time of the reading, not from the time
  it arrived: a sensor that reports an unchanged value is not stale.
- No `backdrop-filter`: too slow over large photos on a Raspberry Pi.
- Do not set `font-family`: the gauge takes the mirror's font so that
  themes apply.
- Sizes and colors stay CSS custom properties on `.MMM-RingGauge`.
- Do not reference a theme's variables in the module; themes are bound in
  the user's `custom.css` (see README, "Styling").
- A new user-facing string goes into every file in `translations/`.
- No runtime dependencies; MagicMirror provides `Module`, `Log`, `config`.

## Host pitfalls

- MagicMirror replaces `${VAR}` in `config.js` textually; values from
  `.env` arrive as strings ("false" is truthy).
- `SECRET_*` variables reach the browser only as placeholders and are
  restored for a `node_helper`. A passive module never needs one.

## Open

- **Open:** notification contract (owned by the provider).
- **Open:** presets per quantity in the module vs. full config per
  instance (proposed: presets in the module, overridable).
- **Open:** status texts in the config or as translation keys per level.
- **Open:** toolchain. Proposed as in WallberryTheme: Biome for linting,
  `node --test` without dependencies, a GitHub workflow for both.
- **Open:** tests for the pure logic (band lookup, angle, staleness);
  needs that logic separated from the DOM.
- **Open:** a `CHANGELOG.md` and a screenshot for the module list.

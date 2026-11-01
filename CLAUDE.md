# CLAUDE.md

## What this is

A MagicMirror² module (`MMM-RingGauge`) that shows one reading per
instance as a three-quarter ring with colored bands, a marker and a status
word. Users clone it into `MagicMirror/modules/`.

## Target architecture

- The module is independent of any data source: it reacts to
  notifications that carry readings and fetches nothing itself.
- It works with every source that sends a notification. The gauge defines
  its input fields; each instance's config maps a source onto them.
- Never name a source's notification or payload fields in the code, not
  even as a default: that binds the gauge to one source.
- Never ask a source to change its payload for this module; map it in the
  config instead.

## Rules

- The module has no `node_helper`, fetches nothing and needs no secrets.
- MagicMirror² 2.36.0 is the minimum: `transform` needs functions in the
  config. Keep `requiresVersion` in step with the README's
  "Requirements".
- Readings carry facts only: value, unit, quantity, report time,
  availability. Scale, bands, label, icon and status texts belong to this
  module: its presets per quantity and the instance's config. Never expect
  a level or assessment from a source: it would have to know thresholds
  and couple to this module.
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
- Give sizes in `rem` or `em`, never `px`: the gauge grows with the
  mirror's `--font-size`, its content with `--ring-gauge-size`.
- Do not reference a theme's variables in the module; themes are bound in
  the user's `custom.css` (see README, "Styling").
- A new user-facing string goes into every file in `translations/`.
- No runtime dependencies; MagicMirror provides `Module`, `Log`, `config`.

## Build, lint, test

No bundler and no dependencies: MagicMirror loads the files as they are,
and users install by `git clone` only.

- Syntax check: `git ls-files '*.js' | xargs -n1 node --check`
- Lint: `pnpm dlx @biomejs/biome@2.6.3 ci .` – Biome runs standalone and
  needs no entry in `package.json`. Keep its version the same in the
  `$schema` of `biome.json`, in the workflow, in the README section
  "Development" and here.
- Tests: `node --test "tests/**/*.test.js"`. Do not add Vitest, Jest or
  ESLint: they need dependencies and a lockfile.
- Keep the workflow on the action and Node versions the MagicMirror²
  module list checks (`actions/checkout@v7`, `actions/setup-node@v7`,
  Node 22).
- The job `checks` in `.github/workflows/checks.yml` is a required status
  check of the ruleset "Protect main". Renaming or splitting the job
  requires updating the ruleset in the same pull request, or every pull
  request waits for a check that never reports.
- Give the `pull_request` trigger no branch filter: issue pull requests of
  a run target `run/*` and are merged there only after the checks pass.

## Open

- **Open:** a `CHANGELOG.md` and a screenshot for the module list.

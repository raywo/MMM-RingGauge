# CLAUDE.md

## What this is

A MagicMirror² module (`MMM-RingGauge`) that shows readings as
three-quarter rings with colored bands, a marker and a status word: one
ring per instance, or with `rings` a group in one row. Users clone it into
`MagicMirror/modules/`.

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
- Keep `backdrop-filter` off by default and on only with the class
  `ring-gauge-blur`: MagicMirror² disables the GPU unless
  `ELECTRON_ENABLE_GPU=1` is set, and on the CPU the blur may be too
  slow.
- Do not set `font-family`: the gauge takes the mirror's font so that
  themes apply.
- Sizes and colors stay CSS custom properties on `.MMM-RingGauge`.
- Give sizes in `rem` or `em`, never `px`: the gauge grows with the
  mirror's `--font-size`, its content with `--ring-gauge-size`.
- Do not reference a theme's variables in the module; themes are bound in
  the user's `custom.css` (see `docs/styling.md`).
- A new user-facing string goes into every file in `translations/`.
- No runtime dependencies; MagicMirror provides `Module`, `Log`, `config`.

## Build, lint, test

No bundler and no dependencies: MagicMirror loads the files as they are,
and users install by `git clone` only.

- Syntax check: `git ls-files '*.js' | xargs -n1 node --check`
- Lint: `pnpm dlx @biomejs/biome@2.6.3 ci .` – Biome runs standalone and
  needs no entry in `package.json`. Keep its version the same in the
  `$schema` of `biome.json`, in the workflow, in the section
  "Development" of `CONTRIBUTING.md` and here.
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

## Release and module list

The MagicMirror² module list checks the repository once a day and
reports every deviation as a hint.

- Keep `LICENSE`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `biome.json` and
  `.github/dependabot.yaml`: the list asks for each.
- Never write `modules: [` in a Markdown file's example; show module
  entries on their own.
- End every module entry in a Markdown file with `},`.
- Keep the README to what a user needs to install, configure and fix
  the gauge. Put the option reference in `docs/configuration.md`,
  `transform` in `docs/mapping-function.md`, custom properties and
  classes in `docs/styling.md`, and work on the module in
  `CONTRIBUTING.md`.
- Keep the README sections `## Installation` with
  `git clone https://github.com/raywo/MMM-RingGauge.git` and `## Update`.
- Write `node --run`, never npm's run command, and `MagicMirror²` with
  the superscript, also inside a link text; the list flags the name with
  a plain 2, with a space, or without ². It checks every file but the
  changelog, this one too: never quote the flagged spellings here.
- Keep "screenshot" in the name of `images/screenshot.png` only: the
  list shows the first image whose name contains it. Take it again as
  the section "Screenshots" of `CONTRIBUTING.md` describes.
- Add an entry to `CHANGELOG.md` for every change users notice; raise
  `version` in `package.json` with the release.

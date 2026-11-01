# Contributing

Thanks for helping. Bug reports, questions and pull requests are welcome
as [issues](https://github.com/raywo/MMM-RingGauge/issues) and pull
requests on GitHub. Everyone taking part follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

- Name your MagicMirror² version and the module that sends the
  readings.
- Add the gauge's entry from `config/config.js` and one payload the
  source sends; [Troubleshooting](README.md#troubleshooting) shows how
  to log it.
- Add the lines of the browser console that start with
  `MMM-RingGauge`.
- Replace tokens, addresses and anything else you do not want to share
  before you paste config or payloads.

## Pull requests

- Open an issue first for anything larger than a small fix, so that we
  can agree on the approach before you write the code.
- Run the checks from [Development](README.md#development) before you
  open the pull request; the workflow runs the same checks.
- Add or change tests in `tests/` for every change of behavior.
- Add an entry to [CHANGELOG.md](CHANGELOG.md).
- Add every new user-facing text to each file in `translations/`.

## Rules that keep the module installable

- Add no dependencies, and no lockfile. Users install the module with
  `git clone` only, without `npm install`.
- Add no `node_helper`: the gauge fetches nothing and needs no secrets.

## Rules that keep the gauge independent of its sources

- Never name a source's notification or payload fields in the code, not
  even as a default. Sources are mapped in the config of each instance.
- Expect facts from a source only: value, unit, quantity, report time,
  availability. Scale, bands, labels and status texts belong to the
  gauge's presets and the instance's config, never to the source.

## Rules that keep the marker moving

- Build the DOM once and update its elements. Do not call `updateDom()`
  for a new value: replacing the DOM breaks the marker movement.
- Move the marker by its angle, never by x and y.

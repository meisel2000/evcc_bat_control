# Acceptance tests

Spec-as-source acceptance suite for `evcc-battery-scheduled-load`. The Gherkin
scenarios live in `openspec/**/spec.md`; the runner extracts them into
`.extracted/` and executes them with cucumber-js against the application and a
fake evcc REST server.

This is an independent Node project (`package.json` here). Stack: `javascript`
(cucumber-js), as recorded in `openspec/config.yaml`.

## Prerequisites

- Node.js >= 22.18
- From this directory: `npm install`

## Run the suite

```sh
cd acceptance-tests
npm test
```

One command. Hooks start the fake evcc server before the suite and stop it
after. Every run regenerates `.extracted/` first, and always writes the HTML
report.

**HTML report:** `acceptance-tests/reports/cucumber-report.html`

Run the source-of-truth-only regression profile (`openspec/specs/` as-is):

```sh
npm run test:specs
```

## Lint the specs

```sh
npm run lint:specs
```

Extracts every `spec.md` into `.extracted/`, then runs gherkin-lint with the
pinned `.gherkin-lintrc`. Reported line numbers refer to the source `spec.md`.

## Generated output (gitignored)

- `acceptance-tests/.extracted/` is wiped and rebuilt on every run. Never edit it by hand.
- `acceptance-tests/reports/` holds the HTML report.

## Layout

| Path | Purpose |
| --- | --- |
| `cucumber.cjs` | cucumber-js profiles (`default`, `specs`) |
| `extract-gherkin.cjs` | spec.md to .feature extraction (run on every test run) |
| `openspec-effective-paths.cjs` | effective-spec composition (superseded rules excluded) |
| `.gherkin-lintrc` | pinned gherkin-lint config |
| `support/hooks.js` | suite lifecycle: boots/stops the fake evcc server |
| `support/fake-evcc.js` | fake evcc REST API: `GET /state`, `POST /batterymode/charge`, `POST /batterymode/normal`, `DELETE /batterymode` |
| `step-definitions/` | step definitions (added in task 2.x) |

Specs under `openspec/changes/archive/` never run.

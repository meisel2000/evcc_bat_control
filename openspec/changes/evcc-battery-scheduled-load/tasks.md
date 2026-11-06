## 1. First-time setup — skip this whole section if `acceptance-tests/` already exists

- [x] 1.1 Confirm the acceptance stack: read `stack:` from `openspec/config.yaml` (`javascript` or `python`). If absent, ask and add it — this is a specs-zone edit and must be committed on its own, before any scaffolding
- [x] 1.2 Set up the application skeleton (TypeScript/Node.js entry point, dependencies, run script, config loader for the evcc URL, target SoC, max duration, no-progress timeout, HTTP timeouts) so the app can boot
- [ ] 1.3 Create `acceptance-tests/` at the repo root as an independent `<stack>` project that boots the app before the suite and shuts it down after, with a fake evcc REST server (`GET /state`, `POST /batterymode/charge`, `POST /batterymode/normal`, `DELETE /batterymode`) for scenarios
- [x] 1.4 Copy the acceptance-test-authoring skill's `<stack>` reference files verbatim into `acceptance-tests/` — see `references/<stack>/SETUP.md` "Files to copy"; destination filenames are load-bearing — so the runner extracts the Gherkin from every `spec.md` under `openspec/` into `acceptance-tests/.extracted/` and discovers the extracted features, excluding `openspec/changes/archive/`
- [x] 1.5 Make the single test command always generate an HTML report under `acceptance-tests/reports/`
- [x] 1.6 Add the spec-lint command (extract, then `gherkin-lint .extracted`) and gitignore `acceptance-tests/.extracted/` and `acceptance-tests/reports/`
- [x] 1.7 Write `acceptance-tests/README.md` with instructions for running the suite and where the HTML report is written

## 2. Step definitions — one task per pending step; each = fails for the right reason → implement → passes → commit

### 2.A Grid charge to target state of charge (scheduled-battery-grid-charge)

- [x] 2.1 scheduled-battery-grid-charge: "Given the configured target state of charge is 90 percent" / "And the battery state of charge is 40 percent" / "When the scheduled run starts" / "Then the battery is set to charge mode" — red → green → commit
- [x] 2.2 scheduled-battery-grid-charge: "Then no battery mode change is sent" / "And the run exits successfully" (battery at or above target) — red → green → commit

### 2.B Keep-alive refresh of charge mode

- [x] 2.3 scheduled-battery-grid-charge: "Given the battery is charging from the grid" / "When 90 seconds have passed" / "Then charge mode has been sent at least 3 times during the charge" — red → green → commit

### 2.C Charge stop conditions

- [x] 2.4 scheduled-battery-grid-charge: "When the battery state of charge reaches the configured target" / "Then the battery is set to normal mode" / "And the run exits successfully" — red → green → commit
- [x] 2.5 scheduled-battery-grid-charge: "And the maximum duration is 2 hours" / "When the charge has run for 2 hours without reaching the target" / "Then the run exits with an error" — red → green → commit
- [x] 2.6 scheduled-battery-grid-charge: "When the time reaches 06:00" / "And the target state of charge has not been reached" — red → green → commit
- [x] 2.7 scheduled-battery-grid-charge: "And the configured no-progress timeout has passed without a rise in state of charge" / "Then the run exits with an error" — red → green → commit

### 2.D Restore normal mode on exit

- [x] 2.8 scheduled-battery-grid-charge: "When the job receives a termination signal" / "Then the battery is set to normal mode" — red → green → commit

### 2.E Startup recovery of own charge session

- [x] 2.9 scheduled-battery-grid-charge: "Given the battery mode is charge" / "And the state marker shows that a previous run of this job started the charge" / "Then the battery is set to normal mode" — red → green → commit
- [x] 2.10 scheduled-battery-grid-charge: "And no state marker exists" / "Then no battery mode change is sent" — red → green → commit

### 2.F Failure handling

- [x] 2.11 scheduled-battery-grid-charge: "Given evcc cannot be reached" / "Then an error is logged" / "And the run exits with a non-zero exit code" — red → green → commit
- [x] 2.12 scheduled-battery-grid-charge: "And the state of charge cannot be read" / "When the next state of charge read fails" / "Then the battery is set to normal mode" — red → green → commit

### 2.G Configuration validation

- [x] 2.13 scheduled-battery-grid-charge: "Given the config file sets the target state of charge to 120 percent" / "Then the job exits with a non-zero exit code before contacting evcc" / "And the error names the target state of charge" — red → green → commit

### 2.H API key authentication

- [x] 2.14 scheduled-battery-grid-charge: "Given the API key is provided by the Kubernetes Secret" / "Then the request carries the API key as a bearer token" / "And the API key does not appear in the logs" — red → green → commit

### 2.I Dry-run mode

- [x] 2.15 scheduled-battery-grid-charge: "Given dry-run mode is enabled" / "Then the intended charge mode change is logged" / "And no POST or DELETE request is sent to evcc" — red → green → commit

### 2.J Winter cheap-tariff schedule

- [x] 2.16 scheduled-battery-grid-charge: "Given the current date is in March" / "Then no job is started" — red → green → commit
- [x] 2.17 scheduled-battery-grid-charge: "Given the current date is in January" / "And the CronJob start time is 02:00" / "Then a job is started" — red → green → commit

### 2.K Packaging and deployment (non-BDD, covered by manifest and image review)

- [x] 2.18 Add minimal non-root Node.js/TypeScript Dockerfile and Kubernetes manifests (PVC, ConfigMap, Secret reference, CronJob with `concurrencyPolicy: Forbid`, `startingDeadlineSeconds`, `terminationGracePeriodSeconds`, `suspend: true` initially) — commit with conventional commit message

## 3. Completion

- [x] 3.1 Run the full suite: every scenario passes, zero pending/undefined steps, HTML report generated
- [ ] 3.2 Run `openspec validate evcc-battery-scheduled-load --type change --strict` before archive
- [ ] 3.3 Execute the migration plan: dry-run once against live evcc and confirm logged mode changes match `/state`, then a low-target real charge in daytime to confirm `charge` and `normal` transitions

## Why

In winter, solar production is too low during the day to charge the home battery. The battery therefore stays partly empty when evening consumption starts. Charging it from the grid at a chosen time, and stopping at a target state of charge, avoids this.

## What Changes

- Add a one-shot script that, when run, sets the home battery in evcc to `charge` mode (grid charging), re-sends that mode every 30 seconds while charging, polls the battery state of charge until a configured target is reached, then sets the battery to `normal` mode.
- evcc resets an external battery mode after 60 seconds. The 30-second re-send keeps the mode active with margin for a late or missed refresh. If the script is killed without restoring, evcc's 60-second reset returns control to evcc, so the battery is never left in `charge` for longer than 60 seconds.
- Restore sets `normal` mode explicitly via `POST /batterymode/normal`.
- If the battery is already at or above the target state of charge at start, the script makes no mode change and exits successfully.
- The charge stops at whichever comes first: the target state of charge, the maximum duration of 2 hours, or the end of the cheap-tariff window at 06:00.
- The script stops charging if the state of charge does not rise within a configurable no-progress timeout.
- The state of charge is read from `battery.soc` in the evcc `/state` response. The site is assumed to have one home battery.
- Setting `normal` mode is attempted on normal exit, on error, and on termination signals. On startup, if `batteryMode` is `charge`, the script sets `normal` only when this script started that charge, recorded in a state marker. A charge started by the user is left alone.
- The script reads its settings (evcc URL, target state of charge, maximum duration, no-progress timeout, HTTP timeouts) from a config file and refuses to start on invalid values.
- Authentication uses an evcc API key (`evcc_` bearer token), supplied through a Kubernetes Secret and never placed in the config file.
- If evcc cannot be reached or the state of charge cannot be read, the script logs an error, attempts to set `normal` mode, and exits with an error code. The next scheduled run retries on the next night.
- Package the script as a minimal, non-root Docker image so it can be scheduled as a Kubernetes CronJob with `concurrencyPolicy: Forbid`. The CronJob manifest holds the daily start time, the time zone, and the November to February months.
- The CronJob runs only from November through the end of February. Outside that period it does not run.
- The daily start time falls within the cheap-tariff window (00:00 to 06:00).
- Provide a dry-run mode that performs reads only and logs the intended mode changes without sending any POST or DELETE.

## Capabilities

### New Capabilities
- `scheduled-battery-grid-charge`: Daily one-shot job that charges the home battery from the grid via the evcc API until a target state of charge, the maximum duration, the no-progress timeout, or the end of the cheap-tariff window is reached, then sets `normal` mode. Includes keep-alive mode refresh, restore on exit, startup recovery for its own charge sessions, and a minimal container image for Kubernetes CronJob scheduling.

### Modified Capabilities
- None. No existing specs were found in `openspec/specs/`.

## Non-goals

- Support for multiple batteries or sites.
- Tariff-based or dynamic optimisation of charge timing.
- Coordination with other evcc battery consumers or evcc's own tariff and smart-charging logic.
- A user interface or notifications beyond logs.
- Dynamic tariff handling. The schedule is fixed to the cheap-tariff window and the winter months.

## Impact

- New application code (TypeScript, Node.js) for the one-shot script, config parsing, and state handling.
- Dependency on the evcc REST API: `GET /state` (`battery.soc`, `batteryMode`), `POST /batterymode/charge` (every 30 seconds while charging), and `POST /batterymode/normal` (restore). The API was tested against evcc API version 0.2.0 as listed in the docs; this is a tested reference, not a runtime pin.
- New Dockerfile producing a minimal non-root image. Base image and Node.js version are to be chosen in design.
- Kubernetes CronJob manifest defining the daily start time, time zone, months, `concurrencyPolicy: Forbid`, `startingDeadlineSeconds`, `terminationGracePeriodSeconds`, and job history limits (outside the script).
- Kubernetes Secret holding the evcc API key.
- Requires a reachable evcc instance from the cluster. evcc runs inside the same Kubernetes cluster, so the script reaches it through an in-cluster Service address, and the CronJob's network access is limited to that Service.
- Process: per AGENTS.md, the proposal is committed before apply, and the change is merged before archive, using the `openspec-git-discipline` skill.

## Risks

- The 7 ct/kWh cheaper tariff window is the stated basis for the schedule. Net savings after battery round-trip losses and evcc's own charging behaviour are unconfirmed.
- `charge` mode must be verified on the running evcc instance to grid-charge up to the target SoC.
- A failed night means no grid charge that night. Failures are visible only in logs, since notifications are a non-goal.
- Charging to the target SoC must stay within battery manufacturer or evcc-configured limits.

# scheduled-battery-grid-charge

Daily one-shot job that charges the home battery from the grid through the evcc REST API (API version 0.2.0) during the winter cheap-tariff window, then returns the battery to `normal` mode. The job runs in a minimal container as a Kubernetes CronJob.

## ADDED Requirements

### Requirement: Grid charge to target state of charge

The job SHALL set the home battery to `charge` mode through `POST /batterymode/charge` when the battery state of charge, read from `battery.soc` in `GET /state`, is below the configured target state of charge.

#### Scenario: Battery below target is charged from the grid

```gherkin
Given the configured target state of charge is 90 percent
And the battery state of charge is 40 percent
When the scheduled run starts
Then the battery is set to charge mode
```

#### Scenario: Battery already at target makes no mode change

```gherkin
Given the configured target state of charge is 90 percent
And the battery state of charge is 92 percent
When the scheduled run starts
Then no battery mode change is sent
And the run exits successfully
```

### Requirement: Keep-alive refresh of charge mode

While charging, the job SHALL re-send `charge` mode at an interval of 30 seconds, so the mode does not expire under evcc's 60-second external mode reset.

#### Scenario: Charge mode is refreshed during a charge

```gherkin
Given the battery is charging from the grid
When 90 seconds have passed
Then charge mode has been sent at least 3 times during the charge
```

### Requirement: Charge stop conditions

The job SHALL stop charging at the first of these conditions: the target state of charge is reached, the configured maximum duration is reached (default 2 hours), the end of the cheap-tariff window at 06:00 is reached, or the state of charge does not rise within the configured no-progress timeout.

#### Scenario: Charge stops at target state of charge

```gherkin
Given the battery is charging from the grid
When the battery state of charge reaches the configured target
Then the battery is set to normal mode
And the run exits successfully
```

#### Scenario: Charge stops at maximum duration

```gherkin
Given the battery is charging from the grid
And the maximum duration is 2 hours
When the charge has run for 2 hours without reaching the target
Then the battery is set to normal mode
And the run exits with an error
```

#### Scenario: Charge stops at end of tariff window

```gherkin
Given the battery is charging from the grid
When the time reaches 06:00
And the target state of charge has not been reached
Then the battery is set to normal mode
And the run exits successfully
```

#### Scenario: Charge stops when state of charge does not rise

```gherkin
Given the battery is charging from the grid
And the configured no-progress timeout has passed without a rise in state of charge
When the no-progress timeout is reached
Then the battery is set to normal mode
And the run exits with an error
```

### Requirement: Restore normal mode on exit

The job SHALL set the battery to `normal` mode through `POST /batterymode/normal` on normal exit, on error, and on termination signals it can handle.

#### Scenario: Termination signal restores normal mode

```gherkin
Given the battery is charging from the grid
When the job receives a termination signal
Then the battery is set to normal mode
```

### Requirement: Startup recovery of own charge session

On startup, if `batteryMode` in `GET /state` is `charge`, the job SHALL set `normal` mode only when a state marker written by the job shows that it started that charge. A charge that the job did not start SHALL be left unchanged.

#### Scenario: Stale charge from a previous failed run is cleared

```gherkin
Given the battery mode is charge
And the state marker shows that a previous run of this job started the charge
When the job starts
Then the battery is set to normal mode
```

#### Scenario: Charge started by a user is left alone

```gherkin
Given the battery mode is charge
And no state marker exists
When the job starts
Then no battery mode change is sent
And the run exits successfully
```

### Requirement: Failure handling

If evcc cannot be reached or the state of charge cannot be read, the job SHALL log an error, SHALL attempt to set `normal` mode when the battery may be in `charge` mode, and SHALL exit with a non-zero exit code.

#### Scenario: evcc is unreachable at start

```gherkin
Given evcc cannot be reached
When the scheduled run starts
Then an error is logged
And the run exits with a non-zero exit code
```

#### Scenario: State of charge cannot be read during a charge

```gherkin
Given the battery is charging from the grid
And the state of charge cannot be read
When the next state of charge read fails
Then the battery is set to normal mode
And the run exits with a non-zero exit code
```

### Requirement: Configuration validation

The job SHALL read the evcc URL, target state of charge, maximum duration, no-progress timeout, and HTTP timeouts from a config file. The job SHALL refuse to start when a value is invalid, including a target state of charge outside 0 to 100, a maximum duration of zero or less, or a missing evcc URL.

#### Scenario: Invalid target state of charge is rejected

```gherkin
Given the config file sets the target state of charge to 120 percent
When the job starts
Then the job exits with a non-zero exit code before contacting evcc
And the error names the target state of charge
```

### Requirement: API key authentication

The job SHALL authenticate to evcc with an `evcc_` API key sent as a bearer token. The API key SHALL be read from a Kubernetes Secret and SHALL NOT be stored in the config file or written to logs.

#### Scenario: Request carries the API key

```gherkin
Given the API key is provided by the Kubernetes Secret
When the job requests the evcc state
Then the request carries the API key as a bearer token
And the API key does not appear in the logs
```

### Requirement: Dry-run mode

When dry-run mode is enabled, the job SHALL perform reads only and SHALL log the mode changes it would make, without sending any `POST` or `DELETE` request to evcc.

#### Scenario: Dry run sends no mode changes

```gherkin
Given dry-run mode is enabled
And the battery state of charge is 40 percent
When the scheduled run starts
Then the intended charge mode change is logged
And no POST or DELETE request is sent to evcc
```

### Requirement: Winter cheap-tariff schedule

The CronJob SHALL run only from November through February, and its daily start time SHALL fall between 00:00 and 06:00 in the configured time zone.

#### Scenario: Job does not run outside winter

```gherkin
Given the current date is in March
When the CronJob schedule is evaluated
Then no job is started
```

#### Scenario: Job starts within the cheap-tariff window

```gherkin
Given the current date is in January
And the CronJob start time is 02:00
When the scheduled time is reached
Then a job is started
```
